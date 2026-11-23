// The Smart Trade — Cloudflare Pages Function: auth, journal storage, images and the Claude proxy.
// Bindings: DB (D1). Secrets: ANTHROPIC_API_KEY. Vars: CLAUDE_MODEL, AI_DAILY_LIMIT, ALLOW_SIGNUP.

const SESSION_DAYS = 30;
const KINDS = new Set(['profile', 'account', 'trade', 'payout', 'plan', 'journal', 'setup', 'rule', 'chat', 'firm', 'note', 'bt', 'agent']);
const MAX_DOC = 200_000;      // bytes per record
const MAX_IMAGE = 450_000;    // bytes per screenshot data URL

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const err = (message, status = 400) => json({ error: message }, status);

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const randomId = (n = 18) => b64(crypto.getRandomValues(new Uint8Array(n))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));

async function hashPassword(password, saltB64) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function getCookie(request, name) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function sessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `ew_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function currentUser(env, request) {
  const token = getCookie(request, 'ew_sid');
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT u.id, u.email, u.name, u.plan, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
  ).bind(token).first();
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, email: row.email, name: row.name, plan: row.plan };
}

// ---------------------------------------------------------------- plans, limits, admin
let colsReady = false;
async function ensurePlanTables(env) {
  if (colsReady) return; colsReady = true;
  for (const sql of ['ALTER TABLE users ADD COLUMN pro_until INTEGER', 'ALTER TABLE users ADD COLUMN last_seen INTEGER', 'ALTER TABLE users ADD COLUMN trades_logged INTEGER DEFAULT 0']) { try { await env.DB.prepare(sql).run(); } catch (e) { /* column exists */ } }
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_settings (k TEXT PRIMARY KEY, v TEXT)').run();
}
const isAdmin = (env, user) => !!user && String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean).includes(String(user.email || '').toLowerCase());
const SETTING_DEFAULTS = { free_trades: '10', free_ai: '10', pro_price: '999', pro_price_usd: '20', pay_link: '', banner: '', signup: 'on' };
async function settings(env) {
  await ensurePlanTables(env);
  const { results } = await env.DB.prepare('SELECT k, v FROM app_settings').all();
  const out = { ...SETTING_DEFAULTS }; for (const r of results) out[r.k] = r.v; return out;
}
async function planInfo(env, user) {
  await ensurePlanTables(env);
  const u = await env.DB.prepare('SELECT plan, pro_until, trades_logged FROM users WHERE id = ?').bind(user.id).first() || {};
  const admin = isAdmin(env, user);
  const pro = admin || (u.plan === 'pro' && (!u.pro_until || u.pro_until > Date.now()));
  const st = await settings(env);
  const { n: tradeDocs } = await env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE user_id = ? AND kind = 'trade'").bind(user.id).first();
  const { n: aiTotal } = await env.DB.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM ai_usage WHERE user_id = ?').bind(user.id).first();
  return { pro, admin, proUntil: u.pro_until || null, trades: { used: Math.max(u.trades_logged || 0, tradeDocs || 0), limit: pro ? null : parseInt(st.free_trades, 10) }, ai: { used: aiTotal || 0, limit: pro ? null : parseInt(st.free_ai, 10) }, settings: st };
}


// ---------------------------------------------------------------- payments (Razorpay Checkout, one month of Pro per payment)
const rzpOn = (env) => !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
// India pays in rupees (UPI, Indian cards); everyone else sees dollars. Dollar checkout only once INTL_PAYMENTS = "on".
function payCfg(env, request, st) {
  const country = request.cf?.country || '';
  if (country === 'IN') return { country, currency: 'INR', price: st.pro_price || '999', checkout: rzpOn(env) };
  return { country, currency: 'USD', price: st.pro_price_usd || '20', checkout: rzpOn(env) && env.INTL_PAYMENTS === 'on' };
}
async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const safeEq = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
async function rzp(env, path, body) {
  const r = await fetch('https://api.razorpay.com/v1' + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Basic ' + btoa(env.RAZORPAY_KEY_ID + ':' + env.RAZORPAY_KEY_SECRET), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.description || 'Payment service error.');
  return j;
}
async function ensurePayTable(env) { await env.DB.prepare('CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, order_id TEXT, user_id TEXT, amount INTEGER, currency TEXT, months INTEGER, status TEXT, created_at INTEGER)').run(); }
// records the payment once and extends Pro; safe to call from both the checkout callback and the webhook
async function grantPro(env, { paymentId, orderId, userId, amount, currency, months }) {
  await ensurePayTable(env); await ensurePlanTables(env);
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO payments (id, order_id, user_id, amount, currency, months, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(paymentId, orderId || '', userId, amount || 0, currency || '', months || 1, 'captured', Date.now()).run();
  if (!ins.meta?.changes) return false;
  const u = await env.DB.prepare('SELECT plan, pro_until FROM users WHERE id = ?').bind(userId).first();
  if (!u) return false;
  if (u.plan === 'pro' && !u.pro_until) return true; // already Pro with no end date
  const from = Math.max(Date.now(), u.pro_until || 0);
  await env.DB.prepare("UPDATE users SET plan = 'pro', pro_until = ? WHERE id = ?").bind(from + (months || 1) * 30 * 86400000, userId).run();
  return true;
}

async function revokePro(env, paymentId, full) {
  await ensurePayTable(env);
  const p = await env.DB.prepare('SELECT user_id, months, status FROM payments WHERE id = ?').bind(paymentId).first();
  if (!p || p.status !== 'captured') return false;
  await env.DB.prepare('UPDATE payments SET status = ? WHERE id = ?').bind(full ? 'refunded' : 'partial_refund', paymentId).run();
  if (!full) return true;
  const u = await env.DB.prepare('SELECT plan, pro_until FROM users WHERE id = ?').bind(p.user_id).first();
  if (!u || u.plan !== 'pro' || !u.pro_until) return true; // free already, or Pro with no end date given by an admin
  const until = u.pro_until - (p.months || 1) * 30 * 86400000;
  if (until <= Date.now()) await env.DB.prepare("UPDATE users SET plan = 'free', pro_until = NULL WHERE id = ?").bind(p.user_id).run();
  else await env.DB.prepare('UPDATE users SET pro_until = ? WHERE id = ?').bind(until, p.user_id).run();
  return true;
}
async function startSession(env, request, user) {
  const token = randomId(32);
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, user.id, Date.now() + SESSION_DAYS * 864e5).run();
  return json({ user }, 200, { 'set-cookie': sessionCookie(request, token, SESSION_DAYS * 86400) });
}

// ---------------------------------------------------------------- AI

const COACH = `You are the Smart Trade Coach, a blunt, numbers-first trading performance coach inside a trading journal app.
You see the trader's own journal data (stats, accounts, prop-firm rules, payouts, trades, notes, emotions, mistakes).
Rules:
- Ground every claim in the data provided; quote the actual numbers (P&L, win rate, R, dates, setups). If data is thin, say so.
- Focus on behaviour and process: risk per trade, rule breaks, revenge/over-trading, time-of-day and setup edges, drawdown distance on prop accounts, payout progress.
- Be specific and actionable: end with 2-4 concrete next actions.
- Keep it tight. Use short headers and bullets. Money in the trader's display currency.
- You are not a financial adviser: never recommend buying or selling a specific instrument or predicting price; talk about the trader's process, risk and execution.`;

const MODES = {
  chat: '',
  trade: `Task: review ONE trade. Output sections: "Verdict" (one line, grade A–F), "What went right", "What went wrong", "Rule check" (against the trader's rules/playbook), "Next time". Max 180 words.`,
  week: `Task: weekly review of the period provided. Sections: "Scorecard" (P&L, trades, win rate, avg R, best/worst day), "Your edge" (what is working), "Leaks" (costliest patterns with $ impact), "Prop accounts" (drawdown buffer and payout progress per account), "Next week plan". Max 350 words.`,
  plan: `Task: build tomorrow's pre-market game plan from the trader's rules, recent performance and account limits: max loss for the day per account, max trades, which setups to allow/avoid, time windows to trade/avoid, a 3-item mental checklist. Max 220 words.`,
  chart: `Task: the trader attached a chart screenshot from their trade. Describe the structure you can see (trend, key levels, where entry/stop/target appear to be), whether the execution matched the stated setup, and what a cleaner entry/exit would have looked like. Do not predict future price. Max 220 words.`,
  firmrules: `Task: look up the CURRENT published rules for the prop firm account described, using web search on the firm's official site or help center first. Reply with ONLY a JSON object, no prose: {"target": number|null, "maxLoss": number, "ddType": "trailing"|"static", "dailyLimit": number|null, "minDays": number|null, "consistency": number|null, "price": number|null, "source": "url you used", "notes": "one short sentence on anything notable, e.g. soft vs hard daily limit"}. Dollar amounts as plain numbers. Use null when the firm has no such rule.`,
  backtest: `Task: convert the trader's plain-English strategy into this exact JSON rule format, so a backtest engine can run it. Reply with ONLY the JSON object, no prose, no code fences.
{"name": short name, "summary": [3-7 short plain-English bullets of exactly how you read the rules, including any assumption you made],
 "unsupported": [anything in their description you could not express; empty if none],
 "timeframe": "1m"|"5m"|"15m"|"30m"|"1h", "tz": IANA zone the session times are in (default "America/New_York" for US futures/stocks, "UTC" for crypto, "Europe/London" for forex unless stated),
 "session": {"start": "HH:MM", "end": "HH:MM"} or null for 24h,
 "long": [conditions] or null, "short": [conditions] or null,
 "stop": {"type": "points"|"atr"|"percent"|"range"|"swing", "value": number, "period": number (atr/swing lookback)},
 "target": {"type": "r"|"points"|"atr"|"percent"|"none", "value": number},
 "maxTradesPerDay": number, "exitAtSessionEnd": true|false, "oneTradeAtATime": true}
Conditions are ALL required on the same bar close; entry is at the next bar's open. Each condition: {"left": OPERAND, "op": ">"|"<"|">="|"<="|"crosses_above"|"crosses_below", "right": OPERAND}.
OPERAND is one of: a number; {"price": "open"|"high"|"low"|"close"}; {"ema": N}; {"sma": N}; {"rsi": N}; {"atr": N}; {"vwap": true}; {"highest": N, "of": "high"|"close"} (previous N bars, excluding current); {"lowest": N, "of": "low"|"close"}; {"range": "high"|"low", "start": "HH:MM", "end": "HH:MM"} (high/low of that window today, only valid after it ends); {"prevday": "high"|"low"|"close"}; {"clock": true} (the bar's time of day) compared against {"time": "HH:MM"} (a fixed time of day); {"volume": true}; {"sma_volume": N}.
"range" stop means the opposite side of the opening range used in the entry. "swing" stop means lowest low (long) / highest high (short) of the last "period" bars. Pick reasonable defaults when the trader is vague and say so in summary.`,
  readtrade: `Task: the trader attached a screenshot from their trading platform (fills, orders, positions, account history, a P&L summary, or a chart with entry/exit markers). Read the trade(s) it shows. Reply with ONLY a JSON object, no prose, no code fences:
{"trades": [{"symbol": string, "side": "Long"|"Short", "qty": number|null, "entry": number|null, "exit": number|null, "date": "YYYY-MM-DD"|null, "time": "HH:MM"|null, "exitTime": "HH:MM"|null, "pnl": number|null, "fees": number|null, "stop": number|null, "target": number|null, "account": string|null}],
 "platform": string|null, "confidence": "high"|"medium"|"low", "notes": one short sentence ONLY if something was unclear or cut off, otherwise ""}
Rules: read only what is visible; never invent numbers, use null instead. A buy then sell is Long, sell then buy is Short. Combine partial fills of the same position into one trade with average prices and total quantity. pnl is the realised P&L as shown (negative for losses; "(200.00)" means -200); if fees/commissions are shown separately put them in fees. Times in 24-hour HH:MM exactly as displayed; dates as YYYY-MM-DD (use the year given in the trader's message if the screenshot omits it). Symbols in the short form traders use (e.g. "MNQ" for "MNQZ6" or "MNQ 12-26", "XAUUSD" for "XAUUSD.m"). List trades oldest first, at most 20. If the screenshot shows no trade at all, return {"trades": [], "confidence": "low", "notes": "what the image shows instead"}.`,
  insight: `Task: give ONE sharp insight for the dashboard (max 40 words, no headers, no bullets) — the single most useful observation from this data right now.`,
};

async function callClaude(env, { mode, messages, context, image }) {
  if (!env.ANTHROPIC_API_KEY) throw Object.assign(new Error('AI is not configured: set the ANTHROPIC_API_KEY secret.'), { status: 503 });
  const system = [COACH, MODES[mode] || '', context ? `\n<journal_data>\n${String(context).slice(0, 60000)}\n</journal_data>` : '']
    .filter(Boolean).join('\n\n');

  let msgs = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: 'Go.' });

  if (image && typeof image === 'string' && image.startsWith('data:image/')) {
    const [, mediaType, data] = image.match(/^data:(image\/[a-z+]+);base64,(.*)$/) || [];
    if (data) {
      const last = msgs[msgs.length - 1];
      last.content = [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
        { type: 'text', text: last.content },
      ];
    }
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || 'claude-sonnet-5-5',
      max_tokens: mode === 'insight' ? 200 : 1500,
      system: mode === 'firmrules' ? MODES.firmrules : mode === 'backtest' ? MODES.backtest : mode === 'readtrade' ? MODES.readtrade : system,
      messages: msgs,
      ...(mode === 'firmrules' ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }] } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `AI service error ${res.status}`;
    throw Object.assign(new Error(msg), { status: 502 });
  }
  return (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

async function bumpUsage(env, userId, plan) {
  const day = new Date().toISOString().slice(0, 10);
  if (plan && !plan.pro) {
    if (plan.ai.used >= plan.ai.limit) return { ok: false, free: true, used: plan.ai.used, limit: plan.ai.limit };
    await env.DB.prepare('INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1').bind(userId, day).run();
    return { ok: true, free: true, used: plan.ai.used + 1, limit: plan.ai.limit };
  }
  const limit = parseInt(env.AI_DAILY_LIMIT || '60', 10);
  const row = await env.DB.prepare('SELECT count FROM ai_usage WHERE user_id = ? AND day = ?').bind(userId, day).first();
  const used = row ? row.count : 0;
  if (used >= limit) return { ok: false, used, limit };
  await env.DB.prepare(
    'INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1'
  ).bind(userId, day).run();
  return { ok: true, used: used + 1, limit };
}



// ---------------------------------------------------------------- Google sign-in (ID token, no client secret needed)
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
let GKEYS = null; let GKEYS_AT = 0;
async function verifyGoogle(env, credential) {
  if (!env.GOOGLE_CLIENT_ID) throw Object.assign(new Error('Google sign-in is not configured.'), { status: 503 });
  const parts = String(credential || '').split('.'); if (parts.length !== 3) throw Object.assign(new Error('Bad Google token.'), { status: 400 });
  const [h, p, sig] = parts; const dec = (x) => JSON.parse(new TextDecoder().decode(b64url(x)));
  const header = dec(h); const payload = dec(p);
  if (!GKEYS || Date.now() - GKEYS_AT > 3600_000) { GKEYS = (await (await fetch('https://www.googleapis.com/oauth2/v3/certs')).json()).keys; GKEYS_AT = Date.now(); }
  const jwk = GKEYS.find((k) => k.kid === header.kid); if (!jwk) throw Object.assign(new Error('Unknown Google key. Try again.'), { status: 401 });
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sig), enc.encode(h + '.' + p));
  if (!ok || payload.aud !== env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) || payload.exp * 1000 < Date.now()) throw Object.assign(new Error('Google sign-in could not be verified.'), { status: 401 });
  if (!payload.email || payload.email_verified === false) throw Object.assign(new Error('Your Google email is not verified.'), { status: 401 });
  return payload;
}


// ---------------------------------------------------------------- broker connections, add-on inbox, price bars
async function ensureSyncTables(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, label TEXT, base_url TEXT, username TEXT, secret_enc TEXT, meta TEXT, last_sync INTEGER, created_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_conn_user ON connections(user_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS ingest_keys (key TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ingest_user ON ingest_keys(user_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_inbox_user ON inbox(user_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS bars (user_id TEXT NOT NULL, symbol TEXT NOT NULL, day TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, symbol, day))'),
  ]);
}
// API keys for broker connections are encrypted at rest with AES-GCM. The key comes from a server secret.
async function connKey(env) {
  const seed = env.CONN_SECRET || env.ANTHROPIC_API_KEY; if (!seed) throw Object.assign(new Error('Server secret missing: set CONN_SECRET.'), { status: 503 });
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('smarttrade-connections:' + seed));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await connKey(env), enc.encode(text)); return b64(iv) + '.' + b64(ct); }
async function unseal(env, s) { const [iv, ct] = String(s).split('.').map((x) => Uint8Array.from(atob(x), (c) => c.charCodeAt(0))); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await connKey(env), ct)); }
async function pxFetch(baseUrl, path, body, token) {
  const r = await fetch(baseUrl.replace(/\/+$/, '') + path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw Object.assign(new Error(d.errorMessage || `ProjectX returned ${r.status}${d.errorCode ? ' (code ' + d.errorCode + ')' : ''}`), { status: 502 });
  return d;
}
async function pxLogin(baseUrl, username, apiKey) { const d = await pxFetch(baseUrl, '/api/Auth/loginKey', { userName: username, apiKey }); if (!d.token) throw Object.assign(new Error('ProjectX login failed. Check the username and API key.'), { status: 401 }); return d.token; }
const okBase = (u) => /^https:\/\/[a-z0-9.-]+\.(topstepx\.com|projectx\.com)(\/|$)/i.test(String(u || ''));

// ---------------------------------------------------------------- mentor sharing
// A share is a read-only link to your journal. Mentors can leave notes on it without an account.
async function ensureShareTables(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, label TEXT, include_journal INTEGER DEFAULT 0, created_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS mentor_notes (id TEXT PRIMARY KEY, token TEXT NOT NULL, user_id TEXT NOT NULL, trade_id TEXT, author TEXT, text TEXT NOT NULL, created_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_notes_user ON mentor_notes(user_id)'),
  ]);
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const TRADE_KEYS = ['id', 'date', 'time', 'exitTime', 'accountId', 'symbol', 'side', 'qty', 'entry', 'exit', 'stop', 'target', 'pnl', 'fees', 'r', 'risk', 'session', 'tf', 'setup', 'setups', 'grade', 'trend', 'emotion', 'exitBehavior', 'neutral', 'mistakes', 'rulesOk', 'followedPlan', 'rating', 'notes', 'notePlan', 'noteExec', 'noteLesson', 'tags', 'mae', 'mfe'];
const ACC_KEYS = ['id', 'name', 'firm', 'firmId', 'size', 'status', 'type', 'stage', 'target', 'maxLoss', 'ddType', 'dailyLimit', 'personalDaily', 'minDays', 'consistency', 'startPnl', 'startDays'];
async function sharedPayload(env, share) {
  const { results } = await env.DB.prepare("SELECT kind, data FROM docs WHERE user_id = ? AND kind IN ('profile','trade','account','setup','journal')").bind(share.user_id).all();
  const out = { trade: [], account: [], setup: [], journal: [] }; let profile = {};
  for (const r of results) {
    const d = JSON.parse(r.data);
    if (r.kind === 'profile') profile = d;
    else if (r.kind === 'trade') out.trade.push(pick(d, TRADE_KEYS));
    else if (r.kind === 'account') out.account.push(pick(d, ACC_KEYS));
    else if (r.kind === 'setup') out.setup.push(pick(d, ['id', 'name', 'criteria', 'stopRule', 'mgmt']));
    else if (r.kind === 'journal' && share.include_journal) out.journal.push(pick(d, ['id', 'date', 'mood', 'pre', 'post', 'lesson', 'followedPlan', 'checklist', 'review']));
  }
  const { results: notes } = await env.DB.prepare('SELECT id, trade_id, author, text, created_at FROM mentor_notes WHERE token = ? ORDER BY created_at').bind(share.token).all();
  return { trader: { name: profile.name || 'Trader', currency: profile.currency || 'USD', risk: pick(profile.risk || {}, ['maxDailyLoss', 'maxTrades', 'mode', 'byGrade']) }, label: share.label, data: out, notes };
}

// ---------------------------------------------------------------- router

export async function onRequest(context) {
  const { request, env, params } = context;
  const path = '/' + (Array.isArray(params.path) ? params.path.join('/') : params.path || '');
  const method = request.method;

  if (!env.DB) return err('Database binding DB is missing. See SETUP.', 500);

  try {
    // ---- auth
    if (path === '/auth/signup' && method === 'POST') {
      if (env.ALLOW_SIGNUP === 'false' || (await settings(env)).signup === 'off') return err('Sign-ups are closed.', 403);
      const { email, password, name } = await request.json();
      const e = String(email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return err('Enter a valid email.');
      if (String(password || '').length < 8) return err('Password needs at least 8 characters.');
      const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(e).first();
      if (exists) return err('An account with this email already exists. Sign in instead.', 409);
      const { hash, salt } = await hashPassword(String(password));
      const user = { id: randomId(12), email: e, name: String(name || '').slice(0, 80), plan: 'free' };
      await env.DB.prepare('INSERT INTO users (id, email, name, pass_hash, salt, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(user.id, user.email, user.name, hash, salt, user.plan, Date.now()).run();
      return startSession(env, request, user);
    }

    // economic calendar: this week's events from the Forex Factory feed, cached at the edge for 30 min with a stale copy in D1
    if (path === '/econ' && method === 'GET') {
      const cache = caches.default; const key = new Request('https://cache.thesmarttrade.in/econ-week');
      const hit = await cache.match(key); if (hit) return hit;
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS econ_cache (k TEXT PRIMARY KEY, body TEXT NOT NULL, at INTEGER NOT NULL)').run();
      let body = null; let at = Date.now();
      try {
        const r = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { headers: { 'user-agent': 'TheSmartTrade/1.0 (+https://thesmarttrade.in)' } });
        if (r.ok) { const j = await r.json(); if (Array.isArray(j)) { body = JSON.stringify(j.map((e) => ({ t: e.title, c: e.country, d: e.date, i: e.impact, f: e.forecast || '', p: e.previous || '' }))); await env.DB.prepare('INSERT OR REPLACE INTO econ_cache (k, body, at) VALUES (?, ?, ?)').bind('week', body, at).run(); } }
      } catch (e) { /* fall back to the stored copy */ }
      if (!body) { const row = await env.DB.prepare('SELECT body, at FROM econ_cache WHERE k = ?').bind('week').first(); if (!row) return err('Calendar is unavailable right now. Try again in a few minutes.', 503); body = row.body; at = row.at; }
      const res = new Response(`{"at":${at},"events":${body}}`, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=1800' } });
      await cache.put(key, res.clone()); return res;
    }
    if (path === '/config' && method === 'GET') {
      return json({ googleClientId: env.GOOGLE_CLIENT_ID || null, signup: env.ALLOW_SIGNUP !== 'false' && (await settings(env)).signup !== 'off' });
    }

    if (path === '/auth/google' && method === 'POST') {
      const { credential } = await request.json();
      const g = await verifyGoogle(env, credential);
      const e = String(g.email).trim().toLowerCase();
      const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(e).first();
      if (row) return startSession(env, request, { id: row.id, email: row.email, name: row.name, plan: row.plan });
      if (env.ALLOW_SIGNUP === 'false' || (await settings(env)).signup === 'off') return err('Sign-ups are closed.', 403);
      const { hash, salt } = await hashPassword(randomId(24)); // Google accounts get an unguessable password; they sign in with Google
      const user = { id: randomId(12), email: e, name: String(g.name || '').slice(0, 80), plan: 'free' };
      await env.DB.prepare('INSERT INTO users (id, email, name, pass_hash, salt, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(user.id, user.email, user.name, hash, salt, user.plan, Date.now()).run();
      return startSession(env, request, user);
    }

    if (path === '/auth/login' && method === 'POST') {
      const { email, password } = await request.json();
      const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(String(email || '').trim().toLowerCase()).first();
      if (!row) return err('Wrong email or password.', 401);
      const { hash } = await hashPassword(String(password || ''), row.salt);
      if (!safeEqual(hash, row.pass_hash)) return err('Wrong email or password.', 401);
      return startSession(env, request, { id: row.id, email: row.email, name: row.name, plan: row.plan });
    }

    if (path === '/auth/logout' && method === 'POST') {
      const token = getCookie(request, 'ew_sid');
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, '', 0) });
    }

    // ---- MetaTrader EA / NinjaTrader add-on push (key in the URL identifies the user)
    const ing = path.match(/^\/ingest\/([A-Za-z0-9_-]{20,})$/);
    if (ing && method === 'POST') {
      await ensureSyncTables(env);
      const k = await env.DB.prepare('SELECT user_id FROM ingest_keys WHERE key = ?').bind(ing[1]).first();
      if (!k) return err('Unknown sync key. Copy a fresh one from Connections.', 401);
      const body = await request.json().catch(() => null);
      const items = Array.isArray(body?.items) ? body.items : body ? [body] : [];
      if (!items.length) return err('Nothing to import.');
      if (items.length > 500) return err('Send at most 500 items per request.');
      const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM inbox WHERE user_id = ?').bind(k.user_id).first();
      if (n > 20000) return err('Inbox is full. Open the journal to process it.', 429);
      const src = String(body.source || items[0].source || 'addon').slice(0, 12);
      const now = Date.now();
      await env.DB.batch(items.map((it) => { const pl = JSON.stringify(it).slice(0, 4000); return env.DB.prepare('INSERT OR IGNORE INTO inbox (id, user_id, source, payload, created_at) VALUES (?, ?, ?, ?, ?)').bind(String(it.uid || it.executionId || it.positionId || randomId(9)).slice(0, 80) + ':' + k.user_id.slice(0, 6), k.user_id, String(it.source || src).slice(0, 12), pl, now); }));
      return json({ ok: true, received: items.length });
    }

    // ---- mentor view (public, token is the secret)
    const sm = path.match(/^\/shared\/([A-Za-z0-9_-]{16,})(\/notes)?$/);
    if (sm) {
      await ensureShareTables(env);
      const share = await env.DB.prepare('SELECT * FROM shares WHERE token = ?').bind(sm[1]).first();
      if (!share) return err('This link was turned off or never existed.', 404);
      if (!sm[2] && method === 'GET') return json(await sharedPayload(env, share));
      if (sm[2] && method === 'POST') {
        const { author, tradeId, text } = await request.json();
        const t = String(text || '').trim().slice(0, 2000); if (!t) return err('Write a note first.');
        const day = Date.now() - 86400000;
        const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM mentor_notes WHERE token = ? AND created_at > ?').bind(share.token, day).first();
        if (n >= 200) return err('Note limit reached for today.', 429);
        const note = { id: randomId(9), trade_id: tradeId ? String(tradeId).slice(0, 64) : null, author: String(author || 'Mentor').slice(0, 60), text: t, created_at: Date.now() };
        await env.DB.prepare('INSERT INTO mentor_notes (id, token, user_id, trade_id, author, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(note.id, share.token, share.user_id, note.trade_id, note.author, note.text, note.created_at).run();
        return json({ note });
      }
      return err('Not found', 404);
    }

    // Razorpay webhook: grants Pro even if the buyer closed the tab before the checkout callback ran
    if (path === '/pay/webhook' && method === 'POST') {
      if (!env.RAZORPAY_WEBHOOK_SECRET) return err('Webhook is not configured.', 503);
      const raw = await request.text();
      if (!safeEq(await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw), request.headers.get('x-razorpay-signature') || '')) return err('Bad signature.', 400);
      const ev = JSON.parse(raw);
      if (ev.event === 'payment.captured' || ev.event === 'order.paid') {
        const pay = ev.payload?.payment?.entity; const ord = ev.payload?.order?.entity; const orderId = pay?.order_id || ord?.id;
        let notes = (ord && ord.notes && ord.notes.user_id) ? ord.notes : pay?.notes || {};
        if (!notes.user_id && orderId && rzpOn(env)) notes = (await rzp(env, '/orders/' + orderId)).notes || {};
        if (notes.user_id && pay?.id && pay.status === 'captured') await grantPro(env, { paymentId: pay.id, orderId, userId: notes.user_id, amount: pay.amount, currency: pay.currency, months: parseInt(notes.months || '1', 10) });
      }
      // refunds: a full refund takes back the Pro time that payment bought; a partial one is only recorded
      if (ev.event === 'refund.processed') {
        const rf = ev.payload?.refund?.entity; const pay = ev.payload?.payment?.entity;
        if (rf?.payment_id) await revokePro(env, rf.payment_id, (pay && pay.amount_refunded >= pay.amount) || rf.amount >= (pay?.amount || Infinity));
      }
      return json({ ok: true });
    }

    // public: which price this visitor sees (landing page pricing)
    if (path === '/geo' && method === 'GET') {
      const pc = payCfg(env, request, await settings(env));
      return new Response(JSON.stringify({ country: pc.country, currency: pc.currency, price: pc.price }), { headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=3600', vary: 'cf-ipcountry' } });
    }

    // ---- everything below needs a session
    const user = await currentUser(env, request);
    if (!user) return err('Not signed in.', 401);

    if (path === '/me' && method === 'GET') {
      const plan = await planInfo(env, user);
      await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(Date.now(), user.id).run();
      return json({ user: { ...user, admin: plan.admin }, plan: { pro: plan.pro, proUntil: plan.proUntil, trades: plan.trades, ai: plan.ai, payLink: plan.settings.pay_link, banner: plan.settings.banner, ...(({ currency, price, checkout, country }) => ({ currency, price, checkout, country }))(payCfg(env, request, plan.settings)) }, ai: { configured: !!env.ANTHROPIC_API_KEY } });
    }

    if (path === '/pay/order' && method === 'POST') {
      const st = await settings(env); const pc = payCfg(env, request, st);
      if (!pc.checkout) return err(pc.currency === 'USD' && rzpOn(env) ? 'Card payments from outside India are coming soon. Email support@thesmarttrade.in and we\'ll upgrade you now.' : 'Payments are not set up yet. Email support@thesmarttrade.in to upgrade.', 503);
      const body = await request.json().catch(() => ({}));
      const months = [1, 3, 12].includes(+body.months) ? +body.months : 1;
      const currency = pc.currency; const amount = Math.round((parseFloat(pc.price) || (currency === 'INR' ? 999 : 20)) * months * 100);
      const order = await rzp(env, '/orders', { amount, currency, receipt: 'st_' + Date.now().toString(36) + '_' + user.id.slice(0, 8), notes: { user_id: user.id, email: user.email, months: String(months), product: 'The Smart Trade Pro' } });
      return json({ key: env.RAZORPAY_KEY_ID, orderId: order.id, amount, currency, months, email: user.email, name: user.name || '' });
    }
    if (path === '/pay/verify' && method === 'POST') {
      if (!rzpOn(env)) return err('Payments are not set up yet.', 503);
      const { orderId, paymentId, signature } = await request.json();
      if (!safeEq(await hmacHex(env.RAZORPAY_KEY_SECRET, orderId + '|' + paymentId), signature || '')) return err('This payment could not be verified. If money left your account, email support@thesmarttrade.in.', 400);
      const order = await rzp(env, '/orders/' + orderId);
      if (order.notes?.user_id !== user.id) return err('This payment belongs to another account.', 403);
      const pay = await rzp(env, '/payments/' + paymentId);
      if (pay.status !== 'captured') return json({ ok: false, pending: true, message: 'Payment received. Pro will switch on as soon as Razorpay confirms it, usually within a few minutes.' }, 202);
      await grantPro(env, { paymentId, orderId, userId: user.id, amount: pay.amount, currency: pay.currency, months: parseInt(order.notes?.months || '1', 10) });
      const plan = await planInfo(env, user);
      return json({ ok: true, plan: { pro: plan.pro, proUntil: plan.proUntil, trades: plan.trades, ai: plan.ai } });
    }

    if (path === '/data' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT kind, id, data FROM docs WHERE user_id = ?').bind(user.id).all();
      const out = {};
      for (const r of results) (out[r.kind] ||= []).push(JSON.parse(r.data));
      return json({ data: out });
    }

    // batch upsert/delete: { put: [{kind, id, data}], del: [{kind, id}] }
    if (path === '/docs' && method === 'POST') {
      const { put = [], del = [] } = await request.json();
      if (put.length + del.length > 500) return err('Too many changes in one request.');
      const now = Date.now();
      const stmts = [];
      let blocked = [];
      const newTrades = put.filter((d) => d.kind === 'trade' && d.id);
      if (newTrades.length) {
        const plan = await planInfo(env, user);
        const ids = newTrades.map((d) => String(d.id));
        const have = new Set();
        for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); const { results } = await env.DB.prepare(`SELECT id FROM docs WHERE user_id = ? AND kind = 'trade' AND id IN (${part.map(() => '?').join(',')})`).bind(user.id, ...part).all(); results.forEach((r) => have.add(r.id)); }
        const fresh = ids.filter((x) => !have.has(x));
        if (fresh.length) {
          let room = plan.pro ? fresh.length : Math.max(0, plan.trades.limit - plan.trades.used);
          const allow = new Set(fresh.slice(0, room)); blocked = fresh.filter((x) => !allow.has(x));
          if (allow.size) stmts.push(plan.pro ? env.DB.prepare('UPDATE users SET trades_logged = COALESCE(trades_logged, 0) + ? WHERE id = ?').bind(allow.size, user.id) : env.DB.prepare('UPDATE users SET trades_logged = ? WHERE id = ?').bind(plan.trades.used + allow.size, user.id));
        }
      }
      const blockedSet = new Set(blocked);
      for (const d of put) {
        if (d.kind === 'trade' && blockedSet.has(String(d.id))) continue;
        if (!KINDS.has(d.kind) || !d.id) return err('Bad record kind/id.');
        const s = JSON.stringify(d.data);
        if (s.length > MAX_DOC) return err('Record too large.');
        stmts.push(env.DB.prepare(
          'INSERT INTO docs (user_id, kind, id, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
        ).bind(user.id, d.kind, String(d.id), s, now));
      }
      for (const d of del) {
        stmts.push(env.DB.prepare('DELETE FROM docs WHERE user_id = ? AND kind = ? AND id = ?').bind(user.id, d.kind, String(d.id)));
      }
      if (stmts.length) await env.DB.batch(stmts);
      return json({ ok: true, saved: put.length - blocked.length, deleted: del.length, blocked });
    }

    // ---------------------------------------------------------------- admin (ADMIN_EMAILS only)
    if (path.startsWith('/admin')) {
      if (!isAdmin(env, user)) return err('Not allowed.', 403);
      await ensurePlanTables(env);
      const DAY = 86400000; const now = Date.now();
      if (path === '/admin/overview' && method === 'GET') {
        const one = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).first()) || {};
        const users = await one('SELECT COUNT(*) AS n FROM users');
        const new7 = await one('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - 7 * DAY);
        const new30 = await one('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - 30 * DAY);
        const active7 = await one('SELECT COUNT(*) AS n FROM users WHERE last_seen > ?', now - 7 * DAY);
        const active1 = await one('SELECT COUNT(*) AS n FROM users WHERE last_seen > ?', now - DAY);
        const pro = await one("SELECT COUNT(*) AS n FROM users WHERE plan = 'pro' AND (pro_until IS NULL OR pro_until > ?)", now);
        const trades = await one("SELECT COUNT(*) AS n FROM docs WHERE kind = 'trade'");
        const accounts = await one("SELECT COUNT(*) AS n FROM docs WHERE kind = 'account'");
        const today = new Date().toISOString().slice(0, 10);
        const aiToday = await one('SELECT COALESCE(SUM(count), 0) AS n FROM ai_usage WHERE day = ?', today);
        const ai30 = await one('SELECT COALESCE(SUM(count), 0) AS n FROM ai_usage WHERE day >= ?', new Date(now - 30 * DAY).toISOString().slice(0, 10));
        const atLimit = await one("SELECT COUNT(*) AS n FROM users u WHERE (u.plan IS NULL OR u.plan != 'pro' OR (u.pro_until IS NOT NULL AND u.pro_until < ?)) AND COALESCE(u.trades_logged, 0) >= ?", now, parseInt((await settings(env)).free_trades, 10));
        const { results: su } = await env.DB.prepare('SELECT created_at FROM users WHERE created_at > ?').bind(now - 30 * DAY).all();
        const { results: au } = await env.DB.prepare('SELECT day, SUM(count) AS n FROM ai_usage WHERE day >= ? GROUP BY day').bind(new Date(now - 30 * DAY).toISOString().slice(0, 10)).all();
        const days = Array.from({ length: 30 }, (_, i) => new Date(now - (29 - i) * DAY).toISOString().slice(0, 10));
        const signups = days.map((d) => su.filter((r) => new Date(r.created_at).toISOString().slice(0, 10) === d).length);
        const aiDaily = days.map((d) => (au.find((r) => r.day === d) || {}).n || 0);
        await ensurePayTable(env);
        const { results: rev } = await env.DB.prepare("SELECT currency, COALESCE(SUM(amount), 0) AS amt, COUNT(*) AS n FROM payments WHERE created_at > ? AND status != 'refunded' GROUP BY currency").bind(now - 30 * DAY).all();
        const paidAll = await one("SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM payments WHERE status != 'refunded'");
        return json({ users: users.n, new7: new7.n, new30: new30.n, active1: active1.n, active7: active7.n, pro: pro.n, trades: trades.n, accounts: accounts.n, aiToday: aiToday.n, ai30: ai30.n, atLimit: atLimit.n, days, signups, aiDaily, revenue30: rev, payments: paidAll.n || 0, payers: paidAll.u || 0, checkout: rzpOn(env) });
      }
      if (path === '/admin/users' && method === 'GET') {
        const { results } = await env.DB.prepare(`SELECT u.id, u.email, u.name, u.plan, u.pro_until, u.created_at, u.last_seen, COALESCE(u.trades_logged, 0) AS logged,
          (SELECT COUNT(*) FROM docs d WHERE d.user_id = u.id AND d.kind = 'trade') AS trades,
          (SELECT COUNT(*) FROM docs d WHERE d.user_id = u.id AND d.kind = 'account') AS accounts,
          (SELECT COALESCE(SUM(count), 0) FROM ai_usage a WHERE a.user_id = u.id) AS ai
          FROM users u ORDER BY u.created_at DESC LIMIT 1000`).all();
        return json({ users: results.map((r) => ({ ...r, admin: isAdmin(env, r) })) });
      }
      const um = path.match(/^\/admin\/users\/([\w-]+)(?:\/(reset-ai|reset-trades))?$/);
      if (um) {
        const target = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(um[1]).first();
        if (!target) return err('No such user.', 404);
        if (um[2] === 'reset-ai' && method === 'POST') { await env.DB.prepare('DELETE FROM ai_usage WHERE user_id = ?').bind(target.id).run(); return json({ ok: true }); }
        if (um[2] === 'reset-trades' && method === 'POST') { const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE user_id = ? AND kind = 'trade'").bind(target.id).first(); await env.DB.prepare('UPDATE users SET trades_logged = ? WHERE id = ?').bind(n, target.id).run(); return json({ ok: true }); }
        if (!um[2] && method === 'POST') {
          const b = await request.json(); const plan = b.plan === 'pro' ? 'pro' : 'free'; const until = plan === 'pro' && b.proUntil ? Number(b.proUntil) : null;
          await env.DB.prepare('UPDATE users SET plan = ?, pro_until = ? WHERE id = ?').bind(plan, until, target.id).run(); return json({ ok: true });
        }
        if (!um[2] && method === 'DELETE') {
          if (target.id === user.id || isAdmin(env, target)) return err("You can't delete an admin account here.");
          await env.DB.batch(['docs', 'images', 'sessions', 'ai_usage'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(target.id)).concat([env.DB.prepare('DELETE FROM users WHERE id = ?').bind(target.id)]));
          for (const t of ['shares', 'mentor_notes', 'connections', 'ingest_keys', 'inbox', 'bars']) { try { await env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(target.id).run(); } catch (e) { /* table not created yet */ } }
          return json({ ok: true });
        }
      }
      if (path === '/admin/settings') {
        if (method === 'GET') return json({ settings: await settings(env) });
        if (method === 'POST') {
          const b = await request.json(); const stmts = [];
          for (const k of Object.keys(SETTING_DEFAULTS)) if (k in b) stmts.push(env.DB.prepare('INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(b[k]).slice(0, 500)));
          if (stmts.length) await env.DB.batch(stmts); return json({ settings: await settings(env) });
        }
      }
      return err('Not found', 404);
    }

    if (path === '/reset' && method === 'POST') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM docs WHERE user_id = ?').bind(user.id),
        env.DB.prepare('DELETE FROM images WHERE user_id = ?').bind(user.id),
      ]);
      return json({ ok: true });
    }

    // ---- screenshots
    if (path === '/images' && method === 'POST') {
      const { data } = await request.json();
      if (typeof data !== 'string' || !data.startsWith('data:image/')) return err('Expected an image.');
      if (data.length > MAX_IMAGE) return err('Image too large (keep it under ~300 KB).');
      const id = randomId(12);
      await env.DB.prepare('INSERT INTO images (id, user_id, data, created_at) VALUES (?, ?, ?, ?)').bind(id, user.id, data, Date.now()).run();
      return json({ id });
    }
    const img = path.match(/^\/images\/([\w-]+)$/);
    if (img && method === 'GET') {
      const row = await env.DB.prepare('SELECT data FROM images WHERE id = ? AND user_id = ?').bind(img[1], user.id).first();
      if (!row) return err('Not found', 404);
      return json({ data: row.data }, 200, { 'cache-control': 'private, max-age=86400' });
    }
    if (img && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM images WHERE id = ? AND user_id = ?').bind(img[1], user.id).run();
      return json({ ok: true });
    }

    // ---- AI
    if (path === '/shares' && method === 'GET') {
      await ensureShareTables(env);
      const { results } = await env.DB.prepare('SELECT token, label, include_journal, created_at FROM shares WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all();
      return json({ shares: results });
    }
    if (path === '/shares' && method === 'POST') {
      await ensureShareTables(env);
      const { label, includeJournal } = await request.json();
      const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM shares WHERE user_id = ?').bind(user.id).first();
      if (n >= 20) return err('You can have up to 20 share links. Turn one off first.');
      const share = { token: randomId(18), label: String(label || 'Mentor').slice(0, 60), include_journal: includeJournal ? 1 : 0, created_at: Date.now() };
      await env.DB.prepare('INSERT INTO shares (token, user_id, label, include_journal, created_at) VALUES (?, ?, ?, ?, ?)').bind(share.token, user.id, share.label, share.include_journal, share.created_at).run();
      return json({ share });
    }
    const del = path.match(/^\/shares\/([A-Za-z0-9_-]{16,})$/);
    if (del && method === 'DELETE') {
      await ensureShareTables(env);
      await env.DB.batch([env.DB.prepare('DELETE FROM shares WHERE token = ? AND user_id = ?').bind(del[1], user.id), env.DB.prepare('DELETE FROM mentor_notes WHERE token = ? AND user_id = ?').bind(del[1], user.id)]);
      return json({ ok: true });
    }
    if (path === '/mentor-notes' && method === 'GET') {
      await ensureShareTables(env);
      const { results } = await env.DB.prepare('SELECT n.id, n.token, n.trade_id, n.author, n.text, n.created_at, s.label FROM mentor_notes n LEFT JOIN shares s ON s.token = n.token WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 300').bind(user.id).all();
      return json({ notes: results });
    }

    // ---- connections (ProjectX), sync keys, inbox, bars
    if (path === '/connections' && method === 'GET') {
      await ensureSyncTables(env);
      const { results } = await env.DB.prepare('SELECT id, kind, label, base_url, username, meta, last_sync, created_at FROM connections WHERE user_id = ? ORDER BY created_at').bind(user.id).all();
      const key = await env.DB.prepare('SELECT key FROM ingest_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(user.id).first();
      const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM inbox WHERE user_id = ?').bind(user.id).first();
      return json({ connections: results.map((c) => ({ ...c, meta: c.meta ? JSON.parse(c.meta) : {} })), syncKey: key?.key || null, inbox: n });
    }
    if (path === '/connections' && method === 'POST') {
      await ensureSyncTables(env);
      const { kind, label, baseUrl, username, apiKey } = await request.json();
      if (kind !== 'projectx') return err('Unsupported connection.');
      const url = String(baseUrl || 'https://api.topstepx.com').trim();
      if (!okBase(url)) return err('Use your firm\'s ProjectX API address, e.g. https://api.topstepx.com');
      if (!username || !apiKey) return err('Enter your ProjectX username and API key.');
      const token = await pxLogin(url, String(username).trim(), String(apiKey).trim());
      const acc = await pxFetch(url, '/api/Account/search', { onlyActiveAccounts: false }, token);
      const c = { id: randomId(9), label: String(label || 'ProjectX').slice(0, 60), meta: JSON.stringify({ accounts: (acc.accounts || []).map((a) => ({ id: a.id, name: a.name })) }) };
      await env.DB.prepare('INSERT INTO connections (id, user_id, kind, label, base_url, username, secret_enc, meta, last_sync, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(c.id, user.id, 'projectx', c.label, url, String(username).trim(), await seal(env, String(apiKey).trim()), c.meta, null, Date.now()).run();
      return json({ connection: { id: c.id, kind: 'projectx', label: c.label, base_url: url, username, meta: JSON.parse(c.meta) } });
    }
    const cm = path.match(/^\/connections\/([A-Za-z0-9_-]+)(\/sync|\/bars)?$/);
    if (cm) {
      await ensureSyncTables(env);
      const c = await env.DB.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?').bind(cm[1], user.id).first();
      if (!c) return err('Connection not found.', 404);
      if (!cm[2] && method === 'DELETE') { await env.DB.prepare('DELETE FROM connections WHERE id = ? AND user_id = ?').bind(c.id, user.id).run(); return json({ ok: true }); }
      const token = await pxLogin(c.base_url, c.username, await unseal(env, c.secret_enc));
      if (cm[2] === '/sync' && method === 'POST') {
        const { from } = await request.json().catch(() => ({}));
        const start = from ? new Date(from) : new Date(c.last_sync ? c.last_sync - 2 * 86400000 : Date.now() - 90 * 86400000);
        const acc = await pxFetch(c.base_url, '/api/Account/search', { onlyActiveAccounts: false }, token);
        const accounts = (acc.accounts || []).map((a) => ({ id: a.id, name: a.name, balance: a.balance }));
        const trades = [];
        for (const a of accounts.slice(0, 25)) {
          const t = await pxFetch(c.base_url, '/api/Trade/search', { accountId: a.id, startTimestamp: start.toISOString(), endTimestamp: new Date().toISOString() }, token);
          (t.trades || []).forEach((x) => trades.push({ ...x, accountName: a.name }));
        }
        await env.DB.prepare('UPDATE connections SET last_sync = ?, meta = ? WHERE id = ?').bind(Date.now(), JSON.stringify({ accounts }), c.id).run();
        return json({ accounts, trades, from: start.toISOString() });
      }
      if (cm[2] === '/bars' && method === 'POST') {
        const { contractId, startTime, endTime, unitNumber } = await request.json();
        const d = await pxFetch(c.base_url, '/api/History/retrieveBars', { contractId, live: false, startTime, endTime, unit: 2, unitNumber: unitNumber || 1, limit: 20000, includePartialBar: false }, token);
        return json({ bars: (d.bars || []).map((b) => ({ t: Math.floor(Date.parse(b.t) / 1000), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })).sort((a, b) => a.t - b.t) });
      }
      return err('Not found', 404);
    }
    if (path === '/sync-key' && method === 'POST') {
      await ensureSyncTables(env);
      await env.DB.prepare('DELETE FROM ingest_keys WHERE user_id = ?').bind(user.id).run();
      const key = randomId(24); await env.DB.prepare('INSERT INTO ingest_keys (key, user_id, created_at) VALUES (?, ?, ?)').bind(key, user.id, Date.now()).run();
      return json({ syncKey: key });
    }
    if (path === '/inbox' && method === 'GET') {
      await ensureSyncTables(env);
      const { results } = await env.DB.prepare('SELECT id, source, payload, created_at FROM inbox WHERE user_id = ? ORDER BY created_at LIMIT 2000').bind(user.id).all();
      return json({ items: results.map((r) => ({ id: r.id, source: r.source, payload: JSON.parse(r.payload), created_at: r.created_at })) });
    }
    if (path === '/inbox/ack' && method === 'POST') {
      await ensureSyncTables(env);
      const { ids = [] } = await request.json();
      for (let i = 0; i < ids.length; i += 50) await env.DB.batch(ids.slice(i, i + 50).map((id) => env.DB.prepare('DELETE FROM inbox WHERE id = ? AND user_id = ?').bind(String(id), user.id)));
      return json({ ok: true, deleted: ids.length });
    }
    if (path === '/bars' && method === 'POST') {
      await ensureSyncTables(env);
      const { symbol, bars = [] } = await request.json();
      const sym = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20); if (!sym || !bars.length) return err('Symbol and bars required.');
      const byDay = {}; bars.slice(0, 200000).forEach((b) => { const d = new Date(b.t * 1000).toISOString().slice(0, 10); (byDay[d] ||= []).push([b.t, b.o, b.h, b.l, b.c, b.v || 0]); });
      const days = Object.keys(byDay); const now = Date.now();
      for (let i = 0; i < days.length; i += 40) await env.DB.batch(days.slice(i, i + 40).map((d) => env.DB.prepare('INSERT INTO bars (user_id, symbol, day, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, symbol, day) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(user.id, sym, d, JSON.stringify(byDay[d]), now)));
      return json({ ok: true, days: days.length });
    }
    if (path === '/bars' && method === 'GET') {
      await ensureSyncTables(env);
      const u = new URL(request.url); const sym = String(u.searchParams.get('symbol') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!sym) { const { results } = await env.DB.prepare('SELECT symbol, MIN(day) AS first, MAX(day) AS last, COUNT(*) AS days FROM bars WHERE user_id = ? GROUP BY symbol').bind(user.id).all(); return json({ symbols: results }); }
      const from = u.searchParams.get('from') || '1970-01-01'; const to = u.searchParams.get('to') || '2999-12-31';
      const { results } = await env.DB.prepare('SELECT data FROM bars WHERE user_id = ? AND symbol = ? AND day >= ? AND day <= ? ORDER BY day LIMIT 400').bind(user.id, sym, from, to).all();
      return json({ bars: results.flatMap((r) => JSON.parse(r.data).map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }))) });
    }

    if (path === '/ai' && method === 'POST') {
      const body = await request.json();
      if (!env.ANTHROPIC_API_KEY) return err('AI is not configured: set the ANTHROPIC_API_KEY secret.', 503);
      const usage = await bumpUsage(env, user.id, await planInfo(env, user));
      if (!usage.ok && usage.free) return json({ error: `You've used your ${usage.limit} free AI requests. Upgrade to Pro for 60 a day.`, upgrade: true }, 402);
      if (!usage.ok) return err(`Daily AI limit reached (${usage.limit}). Resets at 00:00 UTC.`, 429);
      const text = await callClaude(env, body);
      return json({ text, usage });
    }

    return err('Not found', 404);
  } catch (e) {
    return err(e.message || 'Server error', e.status || 500);
  }
}
