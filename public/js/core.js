// Core: API, store + sync, formatting, stats, icons.
export const APP = { name: 'Edgewise', tagline: 'Trading journal' };

// ------------------------------------------------------------------ helpers
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
export const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

const pad = (n) => String(n).padStart(2, '0');
export const iso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
export const today = () => iso();
export const weekStart = (s) => { const d = parseISO(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return iso(d); };
export const monthKey = (s) => String(s).slice(0, 7);
export const fmtDate = (s, o = { day: 'numeric', month: 'short' }) => s ? parseISO(s).toLocaleDateString('en-GB', o) : '—';
export const fmtDay = (s) => {
  const t = today();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  return parseISO(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
};
export const tradingDaysBetween = (a, b) => {
  let n = 0; let d = parseISO(a); const e = parseISO(b);
  while (d <= e) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; d.setDate(d.getDate() + 1); }
  return n;
};

// ------------------------------------------------------------------ store
export const S = {
  user: null, ai: { configured: false }, local: false,
  profile: null, account: [], trade: [], payout: [], plan: [], journal: [], setup: [], rule: [], chat: [],
};
const KINDS = ['account', 'trade', 'payout', 'plan', 'journal', 'setup', 'rule', 'chat'];

async function api(path, opts = {}) {
  const res = await fetch(new URL('api' + path, document.baseURI), {
    method: opts.method || 'GET', credentials: 'same-origin',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw Object.assign(new Error('Backend not reachable'), { offline: true });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}
export const API = {
  me: () => api('/me'),
  signup: (b) => api('/auth/signup', { method: 'POST', body: b }),
  login: (b) => api('/auth/login', { method: 'POST', body: b }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  data: () => api('/data'),
  docs: (b) => api('/docs', { method: 'POST', body: b }),
  reset: () => api('/reset', { method: 'POST' }),
  image: (data) => api('/images', { method: 'POST', body: { data } }),
  getImage: (id) => api('/images/' + id),
  ai: (b) => api('/ai', { method: 'POST', body: b }),
};

const cacheKey = () => 'ew_cache_' + (S.user?.id || 'local');
function writeCache() {
  try {
    const o = { profile: S.profile };
    KINDS.forEach((k) => (o[k] = S[k]));
    localStorage.setItem(cacheKey(), JSON.stringify(o));
  } catch (e) { /* quota or disabled */ }
}
export function loadCache() {
  try { return JSON.parse(localStorage.getItem(cacheKey()) || 'null'); } catch (e) { return null; }
}
export function hydrate(data) {
  S.profile = (data.profile && (Array.isArray(data.profile) ? data.profile[0] : data.profile)) || null;
  KINDS.forEach((k) => (S[k] = Array.isArray(data[k]) ? data[k] : []));
  S.trade.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  writeCache();
}

let queue = { put: new Map(), del: new Map() };
let timer = null;
export const sync = { state: 'idle', onChange: () => {} };
function schedule() {
  writeCache();
  if (S.local) return;
  clearTimeout(timer);
  timer = setTimeout(flush, 600);
}
export async function flush() {
  if (S.local) return;
  const put = [...queue.put.values()];
  const del = [...queue.del.values()];
  if (!put.length && !del.length) return;
  queue = { put: new Map(), del: new Map() };
  sync.state = 'saving'; sync.onChange();
  try {
    for (let i = 0; i < Math.max(put.length, del.length); i += 400) {
      await API.docs({ put: put.slice(i, i + 400), del: del.slice(i, i + 400) });
    }
    sync.state = 'saved';
  } catch (e) {
    put.forEach((p) => queue.put.set(p.kind + p.id, p));
    del.forEach((d) => queue.del.set(d.kind + d.id, d));
    sync.state = 'error';
    clearTimeout(timer); timer = setTimeout(flush, 5000);
  }
  sync.onChange();
}
window.addEventListener('beforeunload', () => { if (queue.put.size || queue.del.size) flush(); });

export function saveProfile(p) {
  S.profile = { ...p, id: 'me' };
  queue.put.set('profileme', { kind: 'profile', id: 'me', data: S.profile });
  schedule();
}
export function save(kind, obj) {
  if (!obj.id) obj.id = uid();
  obj.updatedAt = Date.now();
  const list = S[kind];
  const i = list.findIndex((x) => x.id === obj.id);
  if (i >= 0) list[i] = obj; else list.push(obj);
  if (kind === 'trade') list.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  queue.del.delete(kind + obj.id);
  queue.put.set(kind + obj.id, { kind, id: obj.id, data: obj });
  schedule();
  return obj;
}
export function remove(kind, id) {
  S[kind] = S[kind].filter((x) => x.id !== id);
  queue.put.delete(kind + id);
  queue.del.set(kind + id, { kind, id });
  schedule();
}
export function saveMany(kind, objs) { objs.forEach((o) => save(kind, o)); }
export async function wipeAll() {
  if (!S.local) await API.reset();
  S.profile = null; KINDS.forEach((k) => (S[k] = []));
  queue = { put: new Map(), del: new Map() };
  try { localStorage.removeItem(cacheKey()); } catch (e) {}
}

// ------------------------------------------------------------------ money
export const P = () => S.profile || {};
export const cur = () => P().currency || 'USD';
const SYM = { USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', CAD: 'C$', AED: 'AED ', SGD: 'S$' };
export const sym = (c = cur()) => SYM[c] ?? c + ' ';
export function money(v, { sign = false, dec, c = cur() } = {}) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const d = dec ?? (abs >= 10000 ? 0 : abs % 1 ? 2 : 0);
  const s = abs.toLocaleString(c === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pre = n < 0 ? '−' : sign && n > 0 ? '+' : '';
  return pre + sym(c) + s;
}
export const short = (v) => {
  const n = Math.abs(v); const s = n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : Math.round(n);
  return (v < 0 ? '−' : '') + sym() + s;
};
export const local = (v) => {
  const L = P().local;
  if (!L || !L.code || !L.rate || L.code === cur()) return '';
  return money(v * L.rate, { c: L.code, dec: 0 });
};
export const pct = (v, d = 0) => (Number.isFinite(v) ? (v * 100).toFixed(d) : '0') + '%';
export const tone = (v) => (v > 0 ? 'good' : v < 0 ? 'bad' : '');

// ------------------------------------------------------------------ markets
export const MARKETS = {
  futures: { label: 'Futures', qty: 'Contracts', move: 'Points', examples: ['NQ', 'MNQ', 'ES', 'MES', 'YM', 'MYM', 'RTY', 'M2K', 'CL', 'MCL', 'GC', 'MGC'] },
  forex: { label: 'Forex', qty: 'Lots', move: 'Pips', examples: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'GBPJPY', 'AUDUSD'] },
  crypto: { label: 'Crypto', qty: 'Size', move: 'Price', examples: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] },
  indian: { label: 'Indian F&O / stocks', qty: 'Qty / lots', move: 'Points', examples: ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX', 'RELIANCE'] },
  stocks: { label: 'US stocks', qty: 'Shares', move: 'Price', examples: ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA'] },
  options: { label: 'Options', qty: 'Contracts', move: 'Premium', examples: ['SPY 0DTE', 'QQQ calls', 'NIFTY CE'] },
};
// $ per 1.0 price move per contract/lot/unit, used to auto-calculate P&L
export const POINT_VALUE = {
  NQ: 20, MNQ: 2, ES: 50, MES: 5, YM: 5, MYM: 0.5, RTY: 50, M2K: 5, CL: 1000, MCL: 100, GC: 100, MGC: 10, SI: 5000, NG: 10000, '6E': 125000, ZB: 1000,
  EURUSD: 100000, GBPUSD: 100000, AUDUSD: 100000, NZDUSD: 100000, XAUUSD: 100, XAGUSD: 5000,
};
export function pointValue(symbol) {
  const s = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const custom = (P().pointValues || {})[s];
  if (custom) return custom;
  if (POINT_VALUE[s]) return POINT_VALUE[s];
  const root = s.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '');
  if (POINT_VALUE[root]) return POINT_VALUE[root];
  if (P().markets?.some((m) => m === 'stocks' || m === 'crypto' || m === 'indian')) return 1;
  return null;
}

export const EMOTIONS = ['Calm', 'Confident', 'Focused', 'FOMO', 'Anxious', 'Revenge', 'Greedy', 'Bored', 'Tired', 'Frustrated'];
export const MISTAKES = ['None', 'Moved stop', 'Oversized', 'Early exit', 'Chased entry', 'No stop', 'Broke daily limit', 'Overtraded', 'Traded news', 'Ignored plan', 'Late entry', 'Held loser'];
export const SESSIONS = ['Asia', 'London', 'NY AM', 'NY Lunch', 'NY PM', 'Overnight'];
export const DEFAULT_SETUPS = ['Opening range break', 'VWAP reclaim', 'Liquidity sweep', 'Trend pullback', 'Breakout retest', 'Mean reversion'];

export function sessionFromTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number); const x = h + m / 60;
  const tz = P().sessionTz || 'ET';
  // sessions in New York time (ET). If the user logs in IST, shift.
  const ny = tz === 'IST' ? ((x - 10.5 + 24) % 24) : x;
  if (ny >= 9.5 && ny < 11.5) return 'NY AM';
  if (ny >= 11.5 && ny < 13.5) return 'NY Lunch';
  if (ny >= 13.5 && ny < 16.5) return 'NY PM';
  if (ny >= 3 && ny < 9.5) return 'London';
  if (ny >= 19 || ny < 3) return 'Asia';
  return 'Overnight';
}

// ------------------------------------------------------------------ stats
export const net = (t) => num(t.pnl) - num(t.fees);
export function rMultiple(t) {
  if (t.r !== undefined && t.r !== '' && t.r !== null) return num(t.r);
  const risk = riskAmount(t);
  return risk ? net(t) / risk : null;
}
export function riskAmount(t) {
  if (num(t.risk)) return num(t.risk);
  const byGrade = P().risk?.byGrade; if (t.grade && byGrade && num(byGrade[t.grade])) return num(byGrade[t.grade]);
  const pv = pointValue(t.symbol);
  if (!pv || !num(t.stop) || !num(t.entry) || !num(t.qty)) return 0;
  return Math.abs(num(t.entry) - num(t.stop)) * num(t.qty) * pv;
}
export function calcPnl(t) {
  const pv = pointValue(t.symbol);
  if (!pv || !num(t.entry) || !num(t.exit) || !num(t.qty)) return null;
  const dir = t.side === 'Short' ? -1 : 1;
  return Math.round((num(t.exit) - num(t.entry)) * dir * num(t.qty) * pv * 100) / 100;
}

export function stats(trades) {
  const n = trades.length;
  const nets = trades.map(net);
  const wins = nets.filter((v) => v > 0); const losses = nets.filter((v) => v < 0);
  const gw = sum(wins); const gl = Math.abs(sum(losses));
  const total = sum(nets);
  const byDay = {};
  trades.forEach((t) => { (byDay[t.date] ||= { net: 0, n: 0, w: 0 }); byDay[t.date].net += net(t); byDay[t.date].n++; if (net(t) > 0) byDay[t.date].w++; });
  const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
  let eq = 0; let peak = 0; let maxDD = 0; const curve = [];
  days.forEach(([d, v]) => { eq += v.net; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq); curve.push({ date: d, eq, net: v.net }); });
  let streak = 0; let bestStreak = 0; let worstStreak = 0; let curS = 0;
  nets.forEach((v) => { if (v > 0) { curS = curS > 0 ? curS + 1 : 1; } else if (v < 0) { curS = curS < 0 ? curS - 1 : -1; } bestStreak = Math.max(bestStreak, curS); worstStreak = Math.min(worstStreak, curS); });
  streak = curS;
  const rs = trades.map(rMultiple).filter((r) => r !== null);
  const greenDays = days.filter(([, v]) => v.net > 0).length;
  return {
    n, total, wins: wins.length, losses: losses.length, be: n - wins.length - losses.length,
    winRate: n ? wins.length / n : 0,
    avgWin: wins.length ? gw / wins.length : 0, avgLoss: losses.length ? gl / losses.length : 0,
    pf: gl ? gw / gl : gw ? Infinity : 0,
    expectancy: n ? total / n : 0,
    avgR: rs.length ? sum(rs) / rs.length : null,
    best: n ? Math.max(...nets) : 0, worst: n ? Math.min(...nets) : 0,
    maxDD, curve, days: days.map(([date, v]) => ({ date, ...v })),
    dayWinRate: days.length ? greenDays / days.length : 0, tradingDays: days.length,
    bestDay: days.length ? Math.max(...days.map(([, v]) => v.net)) : 0,
    worstDay: days.length ? Math.min(...days.map(([, v]) => v.net)) : 0,
    streak, bestStreak, worstStreak, fees: sum(trades, (t) => t.fees),
  };
}
export function groupBy(trades, keyFn) {
  const m = new Map();
  trades.forEach((t) => {
    const keys = [].concat(keyFn(t)).filter((k) => k !== undefined && k !== null && k !== '');
    keys.forEach((k) => { if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
  });
  return [...m.entries()].map(([key, list]) => ({ key, list, net: sum(list, net), n: list.length, winRate: list.filter((t) => net(t) > 0).length / list.length }))
    .sort((a, b) => b.net - a.net);
}
export function inRange(trades, from, to) { return trades.filter((t) => (!from || t.date >= from) && (!to || t.date <= to)); }
export function rangeFor(key) {
  const t = today();
  if (key === 'today') return [t, t];
  if (key === 'week') return [weekStart(t), t];
  if (key === 'month') return [t.slice(0, 8) + '01', t];
  if (key === 'year') return [t.slice(0, 5) + '01-01', t];
  if (key === '30d') return [addDays(t, -29), t];
  if (key === '90d') return [addDays(t, -89), t];
  return [null, null];
}

// ------------------------------------------------------------------ accounts & payouts
export const accName = (id) => { const a = S.account.find((x) => x.id === id); return a ? a.name : '—'; };
export const accById = (id) => S.account.find((x) => x.id === id);
export const isLive = (a) => ['active', 'funded'].includes(a.status);
export function accountMetrics(a) {
  const trades = S.trade.filter((t) => t.accountId === a.id);
  const tradePnl = sum(trades, net);
  const withdrawn = sum(S.payout.filter((p) => p.accountId === a.id && p.status === 'credited'), (p) => p.gross || p.amount);
  const pnl = num(a.startPnl) + tradePnl;
  // trailing drawdown: track peak of P&L
  let eq = num(a.startPnl); let peak = Math.max(eq, num(a.peakPnl));
  const byDay = groupBy(trades, (t) => t.date).sort((x, y) => x.key.localeCompare(y.key));
  byDay.forEach((d) => { eq += d.net; peak = Math.max(peak, eq); });
  const maxLoss = num(a.maxLoss);
  let buffer = null;
  if (maxLoss) {
    if (a.ddType === 'static') buffer = maxLoss + pnl;
    else {
      const lockAt = num(a.size) ? 0 : Infinity; // trailing stops at break-even on most futures firms
      const floor = Math.min(peak - maxLoss, a.ddLock === false ? Infinity : lockAt);
      buffer = pnl - floor;
    }
  }
  const todayLoss = Math.min(0, sum(trades.filter((t) => t.date === today()), net));
  const stop = num(a.personalDaily) && num(a.dailyLimit) ? Math.min(num(a.personalDaily), num(a.dailyLimit)) : num(a.personalDaily) || num(a.dailyLimit);
  const dailyLeft = stop ? stop + todayLoss : null;
  const target = num(a.target);
  const progress = target ? clamp(pnl / target, 0, 1) : null;
  const balance = num(a.size) + pnl - withdrawn;
  const tradingDays = new Set(trades.map((t) => t.date)).size + num(a.startDays);
  return { trades, tradePnl, pnl, withdrawn, buffer, maxLoss, dailyLeft, stop, target, progress, balance, peak, tradingDays, todayPnl: sum(trades.filter((t) => t.date === today()), net) };
}
export function safeToRisk() {
  const live = S.account.filter(isLive);
  const rule = num(P().risk?.maxDailyLoss);
  const todayNet = sum(S.trade.filter((t) => t.date === today()), net);
  const candidates = [];
  if (rule) candidates.push(rule + Math.min(0, todayNet));
  live.forEach((a) => { const m = accountMetrics(a); if (m.dailyLeft !== null) candidates.push(m.dailyLeft); if (m.buffer !== null) candidates.push(m.buffer); });
  const maxTrades = num(P().risk?.maxTrades);
  const tradesToday = S.trade.filter((t) => t.date === today()).length;
  return { amount: candidates.length ? Math.max(0, Math.min(...candidates)) : null, rule, todayNet, tradesLeft: maxTrades ? Math.max(0, maxTrades - tradesToday) : null, tradesToday, maxTrades };
}
export function missionMetrics() {
  const m = P().mission;
  if (!m) return null;
  const start = m.start || today(); const end = m.end || addDays(start, 41);
  const inWin = (d) => d && d >= start && d <= end;
  const payouts = S.payout.filter((p) => p.status === 'credited' && inWin(p.creditDate || p.reqDate));
  const actual = sum(payouts, (p) => p.amount);
  const actualLocal = sum(payouts, (p) => p.amountLocal || 0);
  const pending = sum(S.payout.filter((p) => p.status === 'requested'), (p) => p.amount);
  const costs = sum(S.account.filter((a) => !a.purchaseDate || inWin(a.purchaseDate) || m.countAllCosts !== false), (a) => num(a.cost) + num(a.resetCost));
  const total = Math.max(1, daysBetween(start, end));
  const elapsed = clamp(daysBetween(start, today()) / total, 0, 1);
  const daysLeft = Math.max(0, daysBetween(today(), end));
  const tdTotal = tradingDaysBetween(start, end);
  const tdLeft = today() > end ? 0 : tradingDaysBetween(today() < start ? start : today(), end);
  const tradePnl = sum(inRange(S.trade, start, end), net);
  return { ...m, start, end, actual, actualLocal, pending, costs, net: actual - costs, target: num(m.target), progress: num(m.target) ? clamp(actual / num(m.target), 0, 1) : 0, elapsed, daysLeft, tdTotal, tdLeft, tradePnl, payouts };
}
export function planMetrics(plan) {
  const end = addDays(plan.start, (plan.days || 5) * 7 / 5 + 1);
  const rows = (plan.rows || []).map((r) => {
    const trades = S.trade.filter((t) => t.accountId === r.accountId && t.date >= plan.start && t.date <= end);
    const actual = r.actual !== undefined && r.actual !== '' && r.actual !== null && !trades.length ? num(r.actual) : sum(trades, net);
    const goal = num(r.goal);
    return { ...r, actual, perDay: goal / (plan.days || 5), endPlan: num(r.balanceStart) + goal - num(r.payout), endActual: num(r.balanceStart) + actual - num(r.payout), progress: goal ? clamp(actual / goal, 0, 1) : 0 };
  });
  return { rows, end, goal: sum(rows, (r) => r.goal), actual: sum(rows, (r) => r.actual), payout: sum(rows, (r) => r.payout) };
}

// ------------------------------------------------------------------ context for Claude
export function aiContext({ trades, focus } = {}) {
  const p = P();
  const all = S.trade;
  const st = stats(all);
  const last30 = stats(inRange(all, ...rangeFor('30d')));
  const lines = [];
  lines.push(`Trader: ${p.name || 'Trader'} | markets: ${(p.markets || []).join(', ')} | instruments: ${(p.instruments || []).join(', ')} | style: ${p.style || '-'} | display currency: ${cur()} | today: ${today()}`);
  if (p.risk) lines.push(`Personal risk rules: max daily loss ${p.risk.maxDailyLoss || '-'}, max trades/day ${p.risk.maxTrades || 'no limit'}, sizing: ${p.risk.mode === 'grade' && p.risk.byGrade ? 'by setup grade (' + Object.entries(p.risk.byGrade).map(([k, v]) => k + ' ' + v).join(', ') + ')' : p.risk.mode === 'fixed' ? 'fixed ' + p.risk.perTrade + ' per trade' : 'decided per trade'}`);
  if (S.rule.length) lines.push('Rules: ' + S.rule.map((r) => r.text).join(' | '));
  if (S.setup.length) lines.push('Playbook setups: ' + S.setup.map((s) => `${s.name}${s.criteria ? ' (' + s.criteria + ')' : ''}`).join(' | '));
  const m = missionMetrics();
  if (m) lines.push(`Goal "${m.name}": payout target ${money(m.target)} from ${m.start} to ${m.end}; credited ${money(m.actual)}, pending ${money(m.pending)}, account costs ${money(m.costs)}, net ${money(m.net)}; ${m.tdLeft} trading days left.`);
  S.account.forEach((a) => {
    const x = accountMetrics(a);
    lines.push(`Account ${a.name} [${a.firm || 'own'} ${a.type} ${a.size ? money(a.size) : ''}${a.ddType ? ', ' + a.ddType + ' drawdown' : ''}${num(a.dailyLimit) ? ', firm daily limit ' + money(a.dailyLimit) : ''}${num(a.personalDaily) ? ', trader\'s own daily stop ' + money(a.personalDaily) : ''}${num(a.consistency) ? ', ' + a.consistency + '% consistency rule' : ''}] status ${a.status}; P&L ${money(x.pnl)}${x.target ? `, target ${money(x.target)} (${pct(x.progress)})` : ''}${x.buffer !== null ? `, drawdown buffer left ${money(x.buffer)}` : ''}${x.dailyLeft !== null ? `, daily loss left ${money(x.dailyLeft)}` : ''}; cost ${money(a.cost || 0)}; trading days ${x.tradingDays}${a.minDays ? '/' + a.minDays : ''}`);
  });
  S.payout.forEach((p2) => lines.push(`Payout ${accName(p2.accountId)} ${money(p2.amount || p2.estimate)} status ${p2.status} req ${p2.reqDate || '-'} credited ${p2.creditDate || '-'}`));
  lines.push(`All-time: ${st.n} trades, net ${money(st.total)}, win rate ${pct(st.winRate)}, PF ${Number.isFinite(st.pf) ? st.pf.toFixed(2) : '∞'}, expectancy ${money(st.expectancy)}, avg win ${money(st.avgWin)}, avg loss ${money(st.avgLoss)}, max DD ${money(st.maxDD)}, avg R ${st.avgR?.toFixed(2) ?? '-'}`);
  lines.push(`Last 30 days: ${last30.n} trades, net ${money(last30.total)}, win rate ${pct(last30.winRate)}, winning days ${pct(last30.dayWinRate)}`);
  const g = (label, fn) => { const rows = groupBy(all, fn).slice(0, 12); if (rows.length) lines.push(`${label}: ` + rows.map((r) => `${r.key} ${money(r.net)} (${r.n}t, ${pct(r.winRate)})`).join('; ')); };
  g('By setup', (t) => t.setup); g('By symbol', (t) => t.symbol); g('By session', (t) => t.session); g('By emotion', (t) => t.emotion);
  g('By mistake', (t) => (t.mistakes || []).filter((x) => x !== 'None')); g('By weekday', (t) => parseISO(t.date).toLocaleDateString('en-US', { weekday: 'short' }));
  g('By side', (t) => t.side); g('By setup grade', (t) => t.grade);
  const rows = (trades || all.slice(-60));
  lines.push(`\nTrades (${focus || 'most recent'}):\ndate,time,account,symbol,side,qty,entry,exit,stop,net,R,setup,grade,session,emotion,mistakes,rules_followed,rating,notes`);
  rows.forEach((t) => lines.push([t.date, t.time, accName(t.accountId), t.symbol, t.side, t.qty, t.entry, t.exit, t.stop, net(t).toFixed(2), rMultiple(t)?.toFixed(2) ?? '', t.setup, t.grade, t.session, t.emotion, (t.mistakes || []).join('/'), t.followedPlan === false ? 'no' : 'yes', t.rating || '', (t.notes || '').replace(/\s+/g, ' ').slice(0, 160)].map((v) => String(v ?? '').replace(/,/g, ';')).join(',')));
  const js = S.journal.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (js.length) lines.push('\nRecent daily journal:\n' + js.map((j) => `${j.date} mood ${j.mood || '-'}/5, followed plan: ${j.followedPlan ? 'yes' : 'no'}. Pre: ${(j.pre || '').slice(0, 200)} Post: ${(j.post || '').slice(0, 300)}`).join('\n'));
  return lines.join('\n');
}

// ------------------------------------------------------------------ markdown-lite for AI output
export function md(text) {
  const lines = esc(text).split('\n'); let out = ''; let inList = false;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  lines.forEach((l) => {
    const h = l.match(/^#{1,4}\s+(.*)/); const li = l.match(/^\s*[-*•]\s+(.*)/) || l.match(/^\s*\d+[.)]\s+(.*)/);
    if (li) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${inline(li[1])}</li>`; return; }
    if (inList) { out += '</ul>'; inList = false; }
    if (h) out += `<h4>${inline(h[1])}</h4>`; else if (l.trim()) out += `<p>${inline(l)}</p>`;
  });
  if (inList) out += '</ul>';
  return out;
}

// ------------------------------------------------------------------ icons (lucide-style paths)
const I = {
  logo: '<path d="M4 18 9 11l4 4 7-10"/><path d="M15 5h5v5"/>',
  overview: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  trades: '<path d="M7 7h10l-3-3"/><path d="M17 17H7l3 3"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  accounts: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6.5 15h4"/>',
  payouts: '<path d="M12 2v20"/><path d="M17 6.5c0-1.9-2.2-3-5-3s-5 1.3-5 3.3S9 9.6 12 10.3s5 1.5 5 3.7-2.2 3.5-5 3.5-5-1.2-5-3"/>',
  plan: '<path d="M9 4h6M9 2.5h6v3H9z"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m8.5 13 2.5 2.5 4.5-5"/>',
  analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  journal: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5V4.5M8 7h8M8 11h6"/>',
  playbook: '<path d="M12 2 3 7l9 5 9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  coach: '<path d="M12 3 13.9 8.1 19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15.5 19.8 17.2 21.5 18l-1.7.8L19 20.5l-.8-1.7-1.7-.8 1.7-.8z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  fold: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.3 1.5 1.2 2.8 2.5 2.8"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  long: '<path d="M7 17 17 7M8 7h9v9"/>', short: '<path d="M7 7l10 10M17 8v9H8"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  brain: '<path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.1A3 3 0 0 0 4.3 9a3 3 0 0 0 .5 5A3 3 0 0 0 7 19.5 2.5 2.5 0 0 0 12 20V4.5A2.5 2.5 0 0 0 9.5 2zM14.5 2A2.5 2.5 0 0 1 17 4.5v.1A3 3 0 0 1 19.7 9a3 3 0 0 1-.5 5 3 3 0 0 1-2.2 5.5A2.5 2.5 0 0 1 12 20"/>',
  coffee: '<path d="M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM7 2v3M11 2v3M15 2v3"/>',
};
export const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[name] || I.info}</svg>`;
