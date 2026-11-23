// Trade importers: platform exports (CSV / XLSX / HTML), fill pairing (FIFO), and conversion of synced data.
// Every importer returns either round-trip trades or fills; fills are paired into trades here.
import { S, P, iso, num, calcPnl, pointValue, sessionFromTime, net } from './core.js?v=9d689113';

// ------------------------------------------------------------------ reading files
export function parseDelimited(text) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => String(x ?? '').trim())).filter((r) => r.some((x) => x));
}
export async function readRows(file) {
  const name = file.name.toLowerCase();
  if (/\.(xlsx|xls|htm|html)$/.test(name)) {
    if (!window.XLSX) throw new Error('Spreadsheet reader is still loading. Try again in a second.');
    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: 'array', cellDates: false, raw: false });
    const rows = [];
    wb.SheetNames.forEach((n) => window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }).forEach((r) => rows.push(r.map((x) => String(x ?? '').trim()))));
    return rows.filter((r) => r.some((x) => x));
  }
  return parseDelimited(await file.text());
}

// ------------------------------------------------------------------ helpers
const money = (v) => { const s = String(v ?? '').trim().replace(/[$€£₹\s]/g, ''); if (!s) return ''; const neg = /^\(.*\)$/.test(s) || /^-/.test(s); const n = parseFloat(s.replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? (neg ? -n : n) : ''; };
const MONTH_CODES = 'FGHJKMNQUVXZ';
const PX = { EP: 'ES', ENQ: 'NQ', MES: 'MES', MNQ: 'MNQ', YM: 'YM', MYM: 'MYM', RTY: 'RTY', M2K: 'M2K', CLE: 'CL', MCLE: 'MCL', MCL: 'MCL', GCE: 'GC', MGC: 'MGC', SIE: 'SI', NGE: 'NG', '6E': '6E', ZB: 'ZB', ZN: 'ZN' };
export function cleanSymbol(raw) {
  let s = String(raw || '').toUpperCase().trim();
  const px = s.match(/^CON\.F\.[A-Z]+\.([A-Z0-9]+)\.[A-Z]\d{2}$/); if (px) return PX[px[1]] || px[1];
  s = s.replace(/\s+\d{2}-\d{2}$/, ''); // NinjaTrader "NQ 12-26"
  s = s.replace(/^\//, '').replace(/[.:_-](R|PRO|ECN|RAW|M|I|C|SB|STD)$/i, '').replace(/[^A-Z0-9]/g, '');
  const fut = s.match(new RegExp(`^([A-Z0-9]{1,4}?)([${MONTH_CODES}])(\\d{1,2})$`)); if (fut && pointValue(fut[1])) return fut[1];
  return s;
}
// Parse a timestamp string to a JS Date. Strings without an offset are read as the browser's local time.
export function parseWhen(raw, { tz: tz0 = 'local' } = {}) {
  let tz = tz0;
  let s = String(raw || '').trim(); if (!s) return null;
  if (/^\d{10}(\.\d+)?$/.test(s)) return new Date(+s * 1000);
  if (/^\d{13}$/.test(s)) return new Date(+s);
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) && /\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s);
  s = s.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3'); // MT5
  const offM = s.match(/\s?([+-])(\d{2}):?(\d{2})$/); if (offM && !/^\d{4}-\d{2}-\d{2}$/.test(s)) { s = s.slice(0, offM.index).trim(); tz = (offM[1] === '-' ? -1 : 1) * (+offM[2] * 60 + +offM[3]); }
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ T,]*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM)?/i) || s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  let y; let mo; let d; let hh = 0; let mm = 0; let ss = 0;
  if (m) { mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += 2000; if (mo > 12) [mo, d] = [d, mo]; hh = +(m[4] || 0); mm = +(m[5] || 0); ss = +(m[6] || 0); const ap = (m[7] || '').toUpperCase(); if (ap === 'PM' && hh < 12) hh += 12; if (ap === 'AM' && hh === 12) hh = 0; }
  else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) { y = +m[1]; mo = +m[2]; d = +m[3]; hh = +(m[4] || 0); mm = +(m[5] || 0); ss = +(m[6] || 0); }
  else if ((m = s.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2})(\d{2})(\d{2})?$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; hh = +m[4]; mm = +m[5]; ss = +(m[6] || 0); }
  else { const dt = new Date(s); return isNaN(dt) ? null : dt; }
  if (tz === 'local') return new Date(y, mo - 1, d, hh, mm, ss);
  const utc = Date.UTC(y, mo - 1, d, hh, mm, ss);
  if (tz === 'UTC') return new Date(utc);
  const off = typeof tz === 'number' ? tz : tzOffsetMinutes(tz, utc);
  return new Date(utc - off * 60000);
}
// minutes east of UTC for an IANA zone at a given instant
export function tzOffsetMinutes(tz, at = Date.now()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - at) / 60000;
  } catch (e) { return 0; }
}
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const base = (src) => ({ mistakes: [], followedPlan: true, source: src });

// ------------------------------------------------------------------ format detection
const H = (row) => row.map((h) => String(h || '').toLowerCase().replace(/\s+/g, ' ').trim());
const has = (hd, ...keys) => keys.every((k) => hd.some((h) => h === k || h.startsWith(k)));
const FORMATS = [
  { id: 'tradovate-perf', label: 'Tradovate · Performance', test: (hd) => has(hd, 'buyprice', 'sellprice', 'boughttimestamp', 'soldtimestamp') },
  { id: 'topstepx', label: 'TopstepX / ProjectX · Trades', test: (hd) => has(hd, 'contractname', 'enteredat', 'exitedat') || has(hd, 'contractname', 'entryprice', 'exitprice') },
  { id: 'nt-trades', label: 'NinjaTrader · Trades', test: (hd) => has(hd, 'instrument', 'market pos.', 'entry price', 'exit price') },
  { id: 'nt-exec', label: 'NinjaTrader · Executions', test: (hd) => has(hd, 'instrument', 'action', 'quantity', 'price', 'time') && hd.some((h) => h === 'e/x' || h === 'position' || h === 'execution id' || h === 'commission') },
  { id: 'mt5-positions', label: 'MetaTrader 5 · History report', test: (hd) => hd[0] === 'time' && hd.includes('position') && hd.includes('symbol') && hd.includes('type') && hd.filter((h) => h === 'price').length >= 2 },
  { id: 'mt4-closed', label: 'MetaTrader 4 · Statement', test: (hd) => hd.includes('ticket') && hd.includes('open time') && hd.includes('close time') && hd.includes('item') },
  { id: 'tradovate-orders', label: 'Tradovate · Orders / Fills', test: (hd) => (hd.includes('b/s') || hd.includes('side')) && (hd.includes('avgprice') || hd.includes('avg fill price') || hd.includes('fill price') || hd.includes('price')) && hd.some((h) => /fill time|filltime|timestamp|date/.test(h)) && hd.some((h) => /filledqty|filled qty|qty filled|quantity|qty/.test(h)) && hd.some((h) => /contract|product|symbol/.test(h)) },
  { id: 'rithmic', label: 'Rithmic R|Trader · Orders', test: (hd) => hd.includes('buy/sell') && hd.some((h) => h === 'qty filled' || h === 'filled') && hd.some((h) => /avg fill price|fill price/.test(h)) },
];
export function detect(rows) {
  for (let i = 0; i < Math.min(rows.length, 300); i++) {
    const hd = H(rows[i]); if (hd.filter(Boolean).length < 4) continue;
    const f = FORMATS.find((x) => x.test(hd)); if (f) return { ...f, headerIndex: i };
  }
  for (let i = 0; i < Math.min(rows.length, 50); i++) { const hd = H(rows[i]); if (hd.filter(Boolean).length >= 4 && hd.some((h) => /symbol|instrument|contract/.test(h))) return { id: 'generic', label: 'Generic CSV', headerIndex: i }; }
  return null;
}

// ------------------------------------------------------------------ parsers → { trades: [...], fills: [...] }
const col = (hd, ...names) => { for (const n of names) { const i = hd.findIndex((h) => h === n); if (i >= 0) return i; } for (const n of names) { const i = hd.findIndex((h) => h.startsWith(n)); if (i >= 0) return i; } return -1; };
function rowsAfter(rows, at, stopFn) { const out = []; for (let i = at + 1; i < rows.length; i++) { if (stopFn && stopFn(rows[i])) break; out.push(rows[i]); } return out; }
function tradeFrom({ when, exitWhen, symbol, side, qty, entry, exit, pnl, fees, account, ext, src, mae, mfe }) {
  if (!when) return null;
  const t = { ...base(src), date: iso(when), time: hm(when), exitTime: exitWhen ? hm(exitWhen) : '', symbol: cleanSymbol(symbol), side, qty: Math.abs(num(qty)) || '', entry: entry === '' ? '' : num(entry), exit: exit === '' ? '' : num(exit), pnl, fees: Math.abs(num(fees)) || '', brokerAccount: account || '', ext: ext || '' };
  if (mae !== undefined && mae !== '') t.mae = -Math.abs(num(mae)); if (mfe !== undefined && mfe !== '') t.mfe = Math.abs(num(mfe));
  if (t.pnl === '' || t.pnl === undefined || !Number.isFinite(+t.pnl)) { const c = calcPnl(t); if (c === null) return null; t.pnl = c; }
  t.session = sessionFromTime(t.time);
  return t;
}
export function parse(rows, fmt, opts = {}) {
  const hd = H(rows[fmt.headerIndex]); const body = rowsAfter(rows, fmt.headerIndex, (r) => r.length < 3 || (fmt.id.startsWith('mt') && /^(orders|deals|working orders|summary|open positions)$/i.test(r[0])));
  const g = (r, i) => (i >= 0 ? r[i] ?? '' : '');
  const tz = opts.tz || 'local';
  const trades = []; const fills = [];
  if (fmt.id === 'tradovate-perf') {
    const i = { sym: col(hd, 'symbol'), qty: col(hd, 'qty'), bp: col(hd, 'buyprice'), sp: col(hd, 'sellprice'), pnl: col(hd, 'pnl'), bt: col(hd, 'boughttimestamp'), st: col(hd, 'soldtimestamp'), bid: col(hd, 'buyfillid'), sid: col(hd, 'sellfillid') };
    body.forEach((r) => { const b = parseWhen(g(r, i.bt), { tz }); const s = parseWhen(g(r, i.st), { tz }); if (!b || !s) return; const long = b <= s; trades.push(tradeFrom({ when: long ? b : s, exitWhen: long ? s : b, symbol: g(r, i.sym), side: long ? 'Long' : 'Short', qty: g(r, i.qty), entry: long ? g(r, i.bp) : g(r, i.sp), exit: long ? g(r, i.sp) : g(r, i.bp), pnl: money(g(r, i.pnl)), src: 'tradovate', ext: `tv-${g(r, i.bid)}-${g(r, i.sid)}` })); });
  } else if (fmt.id === 'topstepx') {
    const i = { id: col(hd, 'id'), sym: col(hd, 'contractname', 'symbol'), en: col(hd, 'enteredat'), ex: col(hd, 'exitedat'), ep: col(hd, 'entryprice'), xp: col(hd, 'exitprice'), fees: col(hd, 'fees'), comm: col(hd, 'commissions'), pnl: col(hd, 'pnl', 'p&l'), size: col(hd, 'size', 'qty'), type: col(hd, 'type', 'side') };
    body.forEach((r) => { const w = parseWhen(g(r, i.en), { tz }); trades.push(tradeFrom({ when: w, exitWhen: parseWhen(g(r, i.ex), { tz }), symbol: g(r, i.sym), side: /short|sell/i.test(g(r, i.type)) ? 'Short' : 'Long', qty: g(r, i.size), entry: g(r, i.ep), exit: g(r, i.xp), pnl: money(g(r, i.pnl)), fees: (num(money(g(r, i.fees))) || 0) + Math.abs(num(money(g(r, i.comm))) || 0), src: 'topstepx', ext: g(r, i.id) ? `px-${g(r, i.id)}` : '' })); });
  } else if (fmt.id === 'nt-trades') {
    const i = { n: col(hd, 'trade number', 'trade #'), sym: col(hd, 'instrument'), acc: col(hd, 'account'), pos: col(hd, 'market pos.'), qty: col(hd, 'qty', 'quantity'), ep: col(hd, 'entry price'), xp: col(hd, 'exit price'), et: col(hd, 'entry time'), xt: col(hd, 'exit time'), pnl: col(hd, 'profit'), comm: col(hd, 'commission'), mae: col(hd, 'mae'), mfe: col(hd, 'mfe') };
    body.forEach((r) => { const w = parseWhen(g(r, i.et), { tz }); const acc = g(r, i.acc); trades.push(tradeFrom({ when: w, exitWhen: parseWhen(g(r, i.xt), { tz }), symbol: g(r, i.sym), side: /short/i.test(g(r, i.pos)) ? 'Short' : 'Long', qty: g(r, i.qty), entry: g(r, i.ep), exit: g(r, i.xp), pnl: money(g(r, i.pnl)), fees: money(g(r, i.comm)), account: acc, src: 'ninjatrader', ext: `nt-${acc}-${g(r, i.sym)}-${g(r, i.et)}-${g(r, i.n)}`, mae: money(g(r, i.mae)), mfe: money(g(r, i.mfe)) })); });
  } else if (fmt.id === 'mt5-positions') {
    const ti = hd.reduce((a, h, k) => (h === 'time' ? a.concat(k) : a), []); const pi = hd.reduce((a, h, k) => (h === 'price' ? a.concat(k) : a), []);
    const i = { pos: col(hd, 'position'), sym: col(hd, 'symbol'), type: col(hd, 'type'), vol: col(hd, 'volume'), comm: col(hd, 'commission'), swap: col(hd, 'swap'), pnl: col(hd, 'profit') };
    body.forEach((r) => { const type = g(r, i.type).toLowerCase(); if (!/^(buy|sell)$/.test(type)) return; const p = money(g(r, i.pnl)); trades.push(tradeFrom({ when: parseWhen(g(r, ti[0]), { tz: opts.tz || 'local' }), exitWhen: parseWhen(g(r, ti[1]), { tz: opts.tz || 'local' }), symbol: g(r, i.sym), side: type === 'sell' ? 'Short' : 'Long', qty: g(r, i.vol), entry: g(r, pi[0]), exit: g(r, pi[1]), pnl: (num(p) || 0) + (num(money(g(r, i.swap))) || 0), fees: money(g(r, i.comm)), src: 'mt5', ext: `mt5-${g(r, i.pos)}` })); });
  } else if (fmt.id === 'mt4-closed') {
    const ti = { open: col(hd, 'open time'), close: col(hd, 'close time') }; const pi = hd.reduce((a, h, k) => (h === 'price' ? a.concat(k) : a), []);
    const i = { tk: col(hd, 'ticket'), sym: col(hd, 'item'), type: col(hd, 'type'), vol: col(hd, 'size'), comm: col(hd, 'commission'), swap: col(hd, 'swap'), pnl: col(hd, 'profit') };
    body.forEach((r) => { const type = g(r, i.type).toLowerCase(); if (!/^(buy|sell)$/.test(type)) return; trades.push(tradeFrom({ when: parseWhen(g(r, ti.open), { tz }), exitWhen: parseWhen(g(r, ti.close), { tz }), symbol: g(r, i.sym), side: type === 'sell' ? 'Short' : 'Long', qty: g(r, i.vol), entry: g(r, pi[0]), exit: g(r, pi[1]), pnl: (num(money(g(r, i.pnl))) || 0) + (num(money(g(r, i.swap))) || 0), fees: money(g(r, i.comm)), src: 'mt4', ext: `mt4-${g(r, i.tk)}` })); });
  } else if (fmt.id === 'nt-exec') {
    const i = { sym: col(hd, 'instrument'), act: col(hd, 'action'), qty: col(hd, 'quantity'), px: col(hd, 'price'), t: col(hd, 'time'), id: col(hd, 'execution id', 'id'), comm: col(hd, 'commission'), acc: col(hd, 'account') };
    body.forEach((r) => { const w = parseWhen(g(r, i.t), { tz }); if (!w) return; fills.push({ when: w, symbol: cleanSymbol(g(r, i.sym)), side: /sell|short/i.test(g(r, i.act)) ? 'S' : 'B', qty: Math.abs(num(g(r, i.qty))), price: num(g(r, i.px)), fee: Math.abs(num(money(g(r, i.comm))) || 0), account: g(r, i.acc), id: g(r, i.id), src: 'ninjatrader' }); });
  } else if (fmt.id === 'tradovate-orders' || fmt.id === 'rithmic') {
    const i = { side: col(hd, 'b/s', 'buy/sell', 'side'), sym: col(hd, 'contract', 'symbol', 'product'), qty: col(hd, 'filledqty', 'filled qty', 'qty filled', 'filled', 'quantity', 'qty'), px: col(hd, 'avgprice', 'avg fill price', 'fill price', 'price'), t: col(hd, 'fill time', 'filltime', 'update time', 'timestamp', 'date'), st: col(hd, 'status'), acc: col(hd, 'account'), id: col(hd, 'orderid', 'order id', 'order number', 'id') };
    body.forEach((r) => { const st = g(r, i.st); if (st && !/fill/i.test(st)) return; const q = Math.abs(num(g(r, i.qty))); const p = num(String(g(r, i.px)).replace(/[^0-9.\-]/g, '')); const w = parseWhen(g(r, i.t), { tz }); if (!q || !p || !w) return; fills.push({ when: w, symbol: cleanSymbol(g(r, i.sym)), side: /^s|sell/i.test(g(r, i.side).trim()) ? 'S' : 'B', qty: q, price: p, fee: 0, account: g(r, i.acc), id: g(r, i.id), src: fmt.id === 'rithmic' ? 'rithmic' : 'tradovate' }); });
  } else {
    const i = { d: col(hd, 'date', 'time', 'opened', 'entry time', 'open time'), xt: col(hd, 'exit time', 'close time', 'closed'), sym: col(hd, 'symbol', 'instrument', 'contract', 'product', 'item'), side: col(hd, 'side', 'direction', 'action', 'type', 'b/s'), qty: col(hd, 'qty', 'quantity', 'size', 'volume', 'lots', 'contracts'), ep: col(hd, 'entry price', 'entry', 'open price', 'buy price', 'price'), xp: col(hd, 'exit price', 'exit', 'close price', 'sell price'), pnl: col(hd, 'pnl', 'p&l', 'profit', 'net p&l', 'realized'), fees: col(hd, 'fees', 'fee', 'commission') };
    body.forEach((r) => trades.push(tradeFrom({ when: parseWhen(g(r, i.d), { tz }), exitWhen: parseWhen(g(r, i.xt), { tz }), symbol: g(r, i.sym), side: /sell|short|^s$/i.test(g(r, i.side)) ? 'Short' : 'Long', qty: g(r, i.qty), entry: g(r, i.ep), exit: g(r, i.xp), pnl: money(g(r, i.pnl)), fees: money(g(r, i.fees)), src: 'csv' })));
  }
  return { trades: trades.filter(Boolean), fills };
}

// ------------------------------------------------------------------ FIFO fill pairing
// fills: [{when, symbol, side:'B'|'S', qty, price, fee, account, id, src, pnl?}] → round-trip trades.
// `lots` carries open positions between calls (for live sync); returns updated lots.
export function pairFills(fills, lots = {}) {
  const out = [];
  const sorted = fills.slice().sort((a, b) => a.when - b.when);
  for (const f of sorted) {
    const key = `${f.account || ''}|${f.symbol}`; const book = (lots[key] ||= []);
    let qty = f.qty; const pv = pointValue(f.symbol) || 1;
    const closingPnlPerUnit = Number.isFinite(f.pnl) && f.qty ? f.pnl / f.qty : null;
    while (qty > 0 && book.length && book[0].side !== f.side) {
      const lot = book[0]; const take = Math.min(qty, lot.qty);
      const dir = lot.side === 'B' ? 1 : -1;
      const gross = closingPnlPerUnit !== null ? closingPnlPerUnit * take : Math.round((f.price - lot.price) * dir * take * pv * 100) / 100;
      const fee = (lot.fee * take / lot.qty0) + (f.fee * take / f.qty);
      const entryWhen = new Date(lot.when);
      out.push({ ...base(f.src), date: iso(entryWhen), time: hm(entryWhen), exitTime: hm(f.when), symbol: f.symbol, side: lot.side === 'B' ? 'Long' : 'Short', qty: take, entry: lot.price, exit: f.price, pnl: Math.round(gross * 100) / 100, fees: Math.round(fee * 100) / 100, brokerAccount: f.account || '', ext: `fill-${lot.id || +entryWhen}-${f.id || +f.when}-${take}`, session: sessionFromTime(hm(entryWhen)), contractId: f.contractId || lot.contractId || '' });
      lot.qty -= take; qty -= take; if (lot.qty <= 0) book.shift();
    }
    if (qty > 0) book.push({ side: f.side, qty, qty0: f.qty, price: f.price, when: +f.when, fee: f.fee || 0, id: f.id, contractId: f.contractId });
  }
  // merge partial exits of the same entry lot at the same minute into one trade
  const merged = [];
  out.forEach((t) => { const m = merged.find((x) => x.brokerAccount === t.brokerAccount && x.symbol === t.symbol && x.date === t.date && x.time === t.time && x.side === t.side && x.exitTime === t.exitTime && Math.abs(x.exit - t.exit) < 1e-9 && Math.abs(x.entry - t.entry) < 1e-9); if (m) { m.qty += t.qty; m.pnl = Math.round((m.pnl + t.pnl) * 100) / 100; m.fees = Math.round((num(m.fees) + num(t.fees)) * 100) / 100; } else merged.push({ ...t }); });
  Object.keys(lots).forEach((k) => { if (!lots[k].length) delete lots[k]; });
  return { trades: merged, lots };
}

// ------------------------------------------------------------------ dedupe + account mapping
const fingerprint = (t) => `${t.date}|${t.time}|${cleanSymbol(t.symbol)}|${t.side}|${num(t.qty)}|${Math.round(num(t.pnl) * 100)}`;
export function dedupe(trades) {
  const ext = new Set(S.trade.map((t) => t.ext).filter(Boolean)); const fp = new Set(S.trade.map(fingerprint));
  const seen = new Set(); const fresh = []; let dup = 0;
  trades.forEach((t) => { const f = fingerprint(t); if ((t.ext && ext.has(t.ext)) || fp.has(f) || seen.has(f)) { dup++; return; } seen.add(f); fresh.push(t); });
  return { fresh, dup };
}
export function guessAccount(brokerAccount) {
  if (!brokerAccount) return '';
  const b = String(brokerAccount).toLowerCase();
  const hit = S.account.find((a) => (a.brokerAccount || '').toLowerCase() === b) || S.account.find((a) => (a.name || '').toLowerCase().includes(b) || b.includes((a.name || '').toLowerCase()));
  return hit ? hit.id : '';
}

// ------------------------------------------------------------------ synced data → trades
// ProjectX Trade/search rows are half-turn fills; closing legs carry profitAndLoss.
export function projectxToFills(rows, accountName) {
  return rows.filter((r) => !r.voided).map((r) => ({ when: new Date(r.creationTimestamp), symbol: cleanSymbol(r.contractId), contractId: r.contractId, side: r.side === 1 ? 'S' : 'B', qty: Math.abs(num(r.size)), price: num(r.price), fee: Math.abs(num(r.fees)) + Math.abs(num(r.commissions)), pnl: r.profitAndLoss === null || r.profitAndLoss === undefined ? null : num(r.profitAndLoss), account: accountName || String(r.accountId), id: 'px' + r.id, src: 'projectx' }));
}
// MetaTrader EA sends closed positions; NinjaTrader add-on sends executions.
export function inboxToTrades(items, lots) {
  const trades = []; const fills = [];
  items.forEach(({ source, payload: p }) => {
    if (source === 'mt5' || source === 'mt4') {
      const w = new Date(num(p.entryTime) * 1000); const x = new Date(num(p.exitTime) * 1000);
      trades.push({ ...base(source), date: iso(w), time: hm(w), exitTime: hm(x), symbol: cleanSymbol(p.symbol), side: /sell|short/i.test(p.side) ? 'Short' : 'Long', qty: num(p.volume), entry: num(p.entryPrice), exit: num(p.exitPrice), stop: num(p.sl) || '', target: num(p.tp) || '', pnl: Math.round((num(p.profit) + num(p.swap)) * 100) / 100, fees: Math.abs(num(p.commission)) || '', brokerAccount: String(p.login || ''), ext: `${source}-${p.login}-${p.positionId}`, session: sessionFromTime(hm(w)) });
    } else if (source === 'nt8') {
      fills.push({ when: new Date(num(p.time)), symbol: cleanSymbol(p.instrument), side: /sell|short/i.test(p.action) ? 'S' : 'B', qty: Math.abs(num(p.qty)), price: num(p.price), fee: Math.abs(num(p.commission)) || 0, account: p.account, id: p.executionId, src: 'ninjatrader' });
    }
  });
  const paired = pairFills(fills, lots);
  return { trades: trades.concat(paired.trades), lots: paired.lots };
}

// ------------------------------------------------------------------ price bars (for replay + AI backtests)
// Accepts TradingView, NinjaTrader and MT5 exports, or any time/open/high/low/close file.
export function parseBars(text, { tz = 'local' } = {}) {
  const rows = parseDelimited(text); if (!rows.length) return [];
  const hd = H(rows[0]).map((h) => h.replace(/[<>]/g, ''));
  const hasHeader = hd.some((h) => /open|close|time|date/.test(h)) && !/^\d/.test(rows[0][0]);
  const body = hasHeader ? rows.slice(1) : rows;
  const idx = hasHeader ? { d: hd.findIndex((h) => h === 'date' || h === 'time' || h === 'datetime' || h === 'timestamp' || h === 'date/time'), t: hd.findIndex((h) => h === 'time'), o: hd.findIndex((h) => h === 'open' || h === 'o'), h: hd.findIndex((h) => h === 'high' || h === 'h'), l: hd.findIndex((h) => h === 'low' || h === 'l'), c: hd.findIndex((h) => h === 'close' || h === 'c' || h === 'last'), v: hd.findIndex((h) => /^vol|tickvol|volume/.test(h)) } : null;
  const out = [];
  body.forEach((r) => {
    let when; let o; let h; let l; let c; let v;
    if (idx) {
      const sep = idx.t >= 0 && idx.t !== idx.d && hd[idx.d] === 'date';
      when = parseWhen(sep ? `${r[idx.d]} ${r[idx.t]}` : r[idx.d], { tz }); [o, h, l, c] = [r[idx.o], r[idx.h], r[idx.l], r[idx.c]].map(Number); v = idx.v >= 0 ? Number(r[idx.v]) : 0;
    } else if (r.length >= 6 && /^\d{8}\s\d{6}$/.test(r[0])) { when = parseWhen(r[0], { tz }); [o, h, l, c, v] = r.slice(1, 6).map(Number); }
    else if (r.length >= 6) { when = parseWhen(`${r[0]} ${r[1]}`, { tz }); [o, h, l, c, v] = r.slice(2, 7).map(Number); if (!Number.isFinite(o)) { when = parseWhen(r[0], { tz }); [o, h, l, c, v] = r.slice(1, 6).map(Number); } }
    if (!when || ![o, h, l, c].every(Number.isFinite)) return;
    out.push({ t: Math.floor(+when / 1000), o, h, l, c, v: Number.isFinite(v) ? v : 0 });
  });
  out.sort((a, b) => a.t - b.t);
  return out.filter((b, i) => !i || b.t !== out[i - 1].t);
}
export const isCrypto = (sym) => /^(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|AVAX|LINK|LTC|DOT|MATIC|TRX|TON|SHIB|PEPE)/.test(String(sym || '').toUpperCase()) || /(USDT|USDC|BUSD)$/.test(String(sym || '').toUpperCase());
export const binanceSymbol = (sym) => { const s = String(sym || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /USDT$|USDC$|BUSD$/.test(s) ? s : s.replace(/USD$/, '') + 'USDT'; };
export async function binanceBars(sym, fromSec, toSec, interval = '1m') {
  const step = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600 }[interval] || 60; const out = []; let start = fromSec * 1000;
  for (let guard = 0; guard < 120 && start < toSec * 1000; guard++) {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${binanceSymbol(sym)}&interval=${interval}&startTime=${start}&endTime=${toSec * 1000}&limit=1000`);
    if (!r.ok) throw new Error(`Binance has no data for ${binanceSymbol(sym)}`);
    const k = await r.json(); if (!k.length) break;
    k.forEach((x) => out.push({ t: Math.floor(x[0] / 1000), o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }));
    start = k[k.length - 1][0] + step * 1000;
  }
  return out;
}
export const tradeEpoch = (date, time) => Math.floor(+new Date(`${date}T${(time || '00:00').slice(0, 5)}:00`) / 1000);
export { net };
