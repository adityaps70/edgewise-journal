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
      system: mode === 'firmrules' ? MODES.firmrules : system,
      messages: msgs,
      ...(mode === 'firmrules' ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }] } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `Claude API error ${res.status}`;
    throw Object.assign(new Error(msg), { status: 502 });
  }
  return (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

async function bumpUsage(env, userId) {
  const day = new Date().toISOString().slice(0, 10);
  const limit = parseInt(env.AI_DAILY_LIMIT || '60', 10);
  const row = await env.DB.prepare('SELECT count FROM ai_usage WHERE user_id = ? AND day = ?').bind(userId, day).first();
  const used = row ? row.count : 0;
  if (used >= limit) return { ok: false, used, limit };
  await env.DB.prepare(
    'INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1'
  ).bind(userId, day).run();
  return { ok: true, used: used + 1, limit };
}


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
      if (env.ALLOW_SIGNUP === 'false') return err('Sign-ups are closed.', 403);
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

    // ---- everything below needs a session
    const user = await currentUser(env, request);
    if (!user) return err('Not signed in.', 401);

    if (path === '/me' && method === 'GET') {
      return json({ user, ai: { configured: !!env.ANTHROPIC_API_KEY, model: env.CLAUDE_MODEL || 'claude-sonnet-5-5' } });
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
      for (const d of put) {
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
      return json({ ok: true, saved: put.length, deleted: del.length });
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

    if (path === '/ai' && method === 'POST') {
      const body = await request.json();
      if (!env.ANTHROPIC_API_KEY) return err('AI is not configured: set the ANTHROPIC_API_KEY secret.', 503);
      const usage = await bumpUsage(env, user.id);
      if (!usage.ok) return err(`Daily AI limit reached (${usage.limit}). Resets at 00:00 UTC.`, 429);
      const text = await callClaude(env, body);
      return json({ text, usage });
    }

    return err('Not found', 404);
  } catch (e) {
    return err(e.message || 'Server error', e.status || 500);
  }
}
