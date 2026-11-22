// The Smart Trade — Cloudflare Pages Function: auth, journal storage, images and the Claude proxy.
// Bindings: DB (D1). Secrets: ANTHROPIC_API_KEY. Vars: CLAUDE_MODEL, AI_DAILY_LIMIT, ALLOW_SIGNUP.

const SESSION_DAYS = 30;
const KINDS = new Set(['profile', 'account', 'trade', 'payout', 'plan', 'journal', 'setup', 'rule', 'chat', 'firm']);
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
