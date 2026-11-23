// Connections (broker sync), file import, trade replay, AI backtesting.
import {
  S, P, $, $$, esc, uid, num, sum, clamp, today, addDays, fmtDate, fmtDay, money, pct, tone, net, icon, API, save, saveProfile, pointValue, setupsOf,
} from './core.js?v=7c85ad91';
import { equityChart } from './charts.js?v=7c85ad91';
import { helpers, modal, confirmBox, tradeList } from './views.js?v=7c85ad91';
import { toast, shake } from './motion.js?v=7c85ad91';
import * as IM from './importers.js?v=7c85ad91';

const card = (...a) => helpers.card(...a); const phead = (...a) => helpers.phead(...a); const after = (...a) => helpers.after(...a);
const field = (...a) => helpers.field(...a); const inp = (...a) => helpers.inp(...a); const optionList = (...a) => helpers.optionList(...a); const formData = (...a) => helpers.formData(...a);
const cnt = (...a) => helpers.cnt(...a);
const H = () => helpers.hooks();
const SITE = () => (location.hostname.endsWith('thesmarttrade.in') || location.hostname.endsWith('pages.dev') ? location.origin : 'https://thesmarttrade.in');
const TZS = [['local', 'My computer\'s time'], ['UTC', 'UTC'], ['America/New_York', 'New York'], ['America/Chicago', 'Chicago'], ['Europe/London', 'London'], [120, 'Broker server UTC+2'], [180, 'Broker server UTC+3'], ['Asia/Kolkata', 'India']];
const tzVal = (v) => (/^-?\d+$/.test(String(v)) ? +v : v);

// ======================================================================= SAVE IMPORTED TRADES
function commit(trades, { defaultAccount = '' } = {}) {
  const { fresh, dup } = IM.dedupe(trades);
  fresh.forEach((t) => save('trade', { ...t, id: uid(), accountId: t.accountId || IM.guessAccount(t.brokerAccount) || defaultAccount }));
  return { added: fresh.length, dup };
}

// ======================================================================= FILE IMPORT
export function importModal() {
  const m = modal('Import trades', `<div class="stack">
    <p class="muted" style="margin:0;font-size:var(--fs-md)">Drop the export from your platform. Tradovate, TopstepX/ProjectX, NinjaTrader, MetaTrader 4/5, Rithmic R|Trader and most other CSV, Excel or HTML trade files are recognised automatically. Trades you already have are skipped.</p>
    <div class="drop" id="imDrop">${icon('upload')}<div style="flex:1"><b>Choose or drop a file</b><span class="muted" id="imInfo" style="font-size:var(--fs-sm)">.csv, .xlsx, .xls or .html</span></div><input type="file" accept=".csv,.txt,.xlsx,.xls,.htm,.html" id="imFile" hidden><button class="btn btn--sm" id="imPick">Choose</button></div>
    <div class="grid g-2" style="gap:12px">${field('Times in the file are in', `<select class="in" id="imTz">${optionList(TZS, 'local')}</select>`, '', 'Most platforms export your computer\'s time; MetaTrader uses its server time')}${field('Default account', `<select class="in" id="imAcc">${optionList(S.account.map((a) => [a.id, a.name]))}<option value="">No account</option></select>`, '', 'for trades whose account isn\'t recognised')}</div>
    <div id="imMap"></div><div id="imPrev"></div></div>`,
  '<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="go" disabled>Import</button>', 'modal');
  let file = null; let result = null;
  const run = async () => {
    if (!file) return;
    try {
      const rows = await IM.readRows(file); const fmt = IM.detect(rows);
      if (!fmt) { $('#imInfo', m.el).innerHTML = `<span class="bad">Couldn't recognise this file.</span> It needs a header row with symbol, prices or P&amp;L.`; $('[data-act="go"]', m.el).disabled = true; return; }
      const tz = tzVal($('#imTz', m.el).value);
      const p = IM.parse(rows, fmt, { tz }); const trades = p.trades.concat(IM.pairFills(p.fills, {}).trades);
      const { fresh, dup } = IM.dedupe(trades); result = fresh;
      $('#imInfo', m.el).innerHTML = `<span style="color:var(--text);font-weight:600">${esc(fmt.label)}</span> · ${trades.length} trades found${dup ? `, ${dup} already in your journal` : ''}`;
      const brokers = [...new Set(fresh.map((t) => t.brokerAccount).filter(Boolean))];
      $('#imMap', m.el).innerHTML = brokers.length ? `<div class="field"><span>Match platform accounts to your journal</span><div class="stack" style="gap:6px">${brokers.map((b) => `<div class="maprow"><code>${esc(b)}</code><span>${icon('left')}</span><select class="in" data-broker="${esc(b)}">${optionList(S.account.map((a) => [a.id, a.name]), IM.guessAccount(b))}<option value="" ${IM.guessAccount(b) ? '' : 'selected'}>Use default account</option></select></div>`).join('')}</div></div>` : '';
      $('#imPrev', m.el).innerHTML = fresh.length ? `<div class="field"><span>Preview</span></div>${tradeList(fresh.slice(-6).reverse().map((t, i) => ({ ...t, id: 'pv' + i })))}` : '<div class="empty">Nothing new to import.</div>';
      $('[data-act="go"]', m.el).disabled = !fresh.length; $('[data-act="go"]', m.el).textContent = fresh.length ? `Import ${fresh.length} trades` : 'Import';
    } catch (e) { $('#imInfo', m.el).innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
  };
  const pick = (f) => { file = f; $('#imInfo', m.el).textContent = 'Reading ' + f.name + '…'; run(); };
  $('#imPick', m.el).onclick = () => $('#imFile', m.el).click();
  $('#imFile', m.el).onchange = (e) => e.target.files[0] && pick(e.target.files[0]);
  const drop = $('#imDrop', m.el); drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('is-over'); }; drop.ondragleave = () => drop.classList.remove('is-over'); drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('is-over'); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); };
  $('#imTz', m.el).onchange = run;
  m.on('go', () => {
    const map = Object.fromEntries($$('[data-broker]', m.el).map((s) => [s.dataset.broker, s.value]));
    Object.entries(map).forEach(([b, id]) => { const a = S.account.find((x) => x.id === id); if (a && a.brokerAccount !== b) save('account', { ...a, brokerAccount: b }); });
    const def = $('#imAcc', m.el).value;
    const r = commit(result.map((t) => ({ ...t, accountId: map[t.brokerAccount] || '' })), { defaultAccount: def });
    m.close(); H().refresh(); toast(`${r.added} trades imported${r.dup ? `, ${r.dup} duplicates skipped` : ''}`, icon('check'));
  });
}

// ======================================================================= AUTO SYNC
let syncing = false;
export async function syncAll({ force = false, quiet = true } = {}) {
  if (S.local || syncing) return null; syncing = true;
  let added = 0; const errors = [];
  try {
    const st = await API.connections();
    for (const c of st.connections) {
      if (!force && c.last_sync && Date.now() - c.last_sync < 10 * 60000) continue;
      try {
        const r = await API.syncConn(c.id);
        const fills = IM.projectxToFills(r.trades.map((x) => ({ ...x })), null).map((f, i) => ({ ...f, account: r.trades[i]?.accountName || f.account }));
        added += commit(IM.pairFills(fills, {}).trades).added;
      } catch (e) { errors.push(`${c.label}: ${e.message}`); }
    }
    if (st.inbox) {
      const { items } = await API.inbox();
      if (items.length) {
        const lots = JSON.parse(JSON.stringify(P().ntLots || {}));
        const r = IM.inboxToTrades(items, lots); added += commit(r.trades).added;
        saveProfile({ ...P(), ntLots: r.lots });
        await API.ackInbox(items.map((x) => x.id));
      }
    }
  } catch (e) { errors.push(e.message); }
  syncing = false;
  if (added) { toast(`${added} new trade${added > 1 ? 's' : ''} synced from your platforms`, icon('refresh')); H().refresh(); }
  else if (!quiet) toast(errors.length ? errors[0] : 'Everything is up to date', icon(errors.length ? 'info' : 'check'), errors.length ? 4 : 1.9);
  return { added, errors };
}

// ======================================================================= CONNECTIONS PAGE
export function connections(el) {
  el.innerHTML = `<div class="page">${phead('Get trades in without typing them', 'Connections', 'Import a file from any platform, or connect one so trades arrive on their own.', `<button class="btn" data-act="sync">${icon('refresh')}Sync now</button><button class="btn btn--primary" data-act="import">${icon('upload')}Import a file</button>`)}
  ${S.local ? `<section class="card"><div class="empty">${icon('link')}<b>Sign in to connect platforms</b>File import works here. Live connections need your account on thesmarttrade.in.</div></section>` : ''}
  <div class="grid g-2 conns">
    <section class="card conn" id="cPx"><div class="chead"><span class="prodico">${icon('bolt')}</span><div class="chead__text"><h3>ProjectX · TopstepX and other firms</h3><p>Trades sync every time you open the journal.</p></div><span class="pill">Auto-sync</span></div><div class="cbody"><div class="empty">Loading…</div></div></section>
    <section class="card conn" id="cMt"><div class="chead"><span class="prodico">${icon('trades')}</span><div class="chead__text"><h3>MetaTrader 5 · FTMO, FundingPips and forex firms</h3><p>A small add-on (EA) sends each closed trade the moment it closes.</p></div><span class="pill">Free</span></div><div class="cbody"></div></section>
    <section class="card conn" id="cNt"><div class="chead"><span class="prodico">${icon('analytics')}</span><div class="chead__text"><h3>NinjaTrader 8 · Apex, MFFU, TPT, Bulenox (Rithmic)</h3><p>An add-on sends every fill as it happens.</p></div><span class="pill">Free</span></div><div class="cbody"></div></section>
    <section class="card conn" id="cTv"><div class="chead"><span class="prodico">${icon('link')}</span><div class="chead__text"><h3>Tradovate</h3><p>Direct sync needs Tradovate partner approval, which is in progress. Until then, import the Performance or Orders CSV.</p></div><span class="pill">File import</span></div><div class="cbody"><ol class="steps-sm"><li>In Tradovate open <b>Reports → Performance</b> (or <b>Orders</b>).</li><li>Pick the dates and click <b>Download CSV</b>.</li><li>Drop it in <b>Import a file</b>.</li></ol></div></section>
    <section class="card conn" id="cBars"><div class="chead"><span class="prodico">${icon('flask')}</span><div class="chead__text"><h3>Price data for replay and backtests</h3><p>Upload 1-minute bars once; replay and AI backtests use them for every trade on that symbol.</p></div></div><div class="cbody"></div></section>
    <section class="card conn" id="cMap"><div class="chead"><span class="prodico">${icon('accounts')}</span><div class="chead__text"><h3>Unmatched platform accounts</h3><p>Trades from these platform accounts aren't linked to a journal account yet.</p></div></div><div class="cbody"></div></section>
  </div>
  <section class="card" style="margin-top:var(--gap)"><div class="chead"><div class="chead__text"><h3>Where to find your export</h3><p>Any of these files works in Import a file</p></div></div>
    <div class="howto">${[['TopstepX / ProjectX', 'Trades tab at the bottom → Export → pick dates → Export.'], ['Tradovate', 'Reports → Performance (or Orders) → dates → Download CSV.'], ['NinjaTrader 8', 'Control Center → New → Trade Performance → Generate → Trades → right-click → Export. Executions export also works.'], ['MetaTrader 5', 'Toolbox → History → right-click → Report → Open XML (Excel) or HTML.'], ['MetaTrader 4', 'Account History → right-click → Save as Detailed Report.'], ['Rithmic R|Trader Pro', 'Order History → choose account and date → export CSV (include Qty Filled and Avg Fill Price).']].map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join('')}</div></section>
  </div>`;
  $('[data-act="import"]', el).onclick = importModal;
  $('[data-act="sync"]', el).onclick = async (e) => { const b = e.currentTarget; b.disabled = true; await syncAll({ force: true, quiet: false }); b.disabled = false; draw(); };
  const draw = async () => {
    // bars + unmatched (work in local mode too)
    const unmatched = [...new Set(S.trade.filter((t) => !t.accountId && t.brokerAccount).map((t) => t.brokerAccount))];
    $('#cMap .cbody', el).innerHTML = unmatched.length ? `<div class="stack" style="gap:8px">${unmatched.map((b) => `<div class="maprow"><code>${esc(b)}</code><span>${S.trade.filter((t) => t.brokerAccount === b && !t.accountId).length} trades</span><select class="in" data-um="${esc(b)}"><option value="">Choose journal account…</option>${optionList(S.account.map((a) => [a.id, a.name]))}</select></div>`).join('')}</div>` : '<p class="muted" style="margin:0">All synced trades are matched to an account.</p>';
    $$('[data-um]', el).forEach((s) => (s.onchange = () => { const a = S.account.find((x) => x.id === s.value); if (!a) return; save('account', { ...a, brokerAccount: s.dataset.um }); S.trade.filter((t) => t.brokerAccount === s.dataset.um && !t.accountId).forEach((t) => save('trade', { ...t, accountId: a.id })); toast(`Linked to ${a.name}`, icon('check')); draw(); }));
    barsCard($('#cBars .cbody', el), draw);
    if (S.local) { ['#cPx', '#cMt', '#cNt'].forEach((id) => ($(id + ' .cbody', el).innerHTML = '<p class="muted" style="margin:0">Available when signed in on thesmarttrade.in.</p>')); return; }
    let st; try { st = await API.connections(); } catch (e) { $('#cPx .cbody', el).innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    // ProjectX
    $('#cPx .cbody', el).innerHTML = `${st.connections.map((c) => `<div class="connrow"><div><b>${esc(c.label)}</b><small>${esc(c.username)} · ${esc((c.meta.accounts || []).length + ' accounts')} · ${c.last_sync ? 'synced ' + esc(new Date(c.last_sync).toLocaleString()) : 'not synced yet'}</small></div><button class="btn btn--sm" data-psync="${c.id}">${icon('refresh')}Sync</button><button class="ibtn" data-pdel="${c.id}" title="Remove">${icon('trash')}</button></div>`).join('')}
      <form class="stack" id="pxForm" style="gap:10px;margin-top:${st.connections.length ? 14 : 0}px">
        <div class="grid g-2" style="gap:10px">${field('Name', inp('label', '', 'placeholder="e.g. Topstep"'))}${field('API address', inp('baseUrl', 'https://api.topstepx.com'), '', 'TopstepX default; other ProjectX firms list theirs in their API docs')}</div>
        <div class="grid g-2" style="gap:10px">${field('ProjectX username', inp('username', '', 'autocomplete="off"'))}${field('API key', inp('apiKey', '', 'type="password" autocomplete="off"'))}</div>
        <div class="row row--between" style="gap:10px;flex-wrap:wrap"><span class="muted" style="font-size:var(--fs-sm)">API access is a ProjectX add-on: $29/month, or $14.50 with Topstep's code "topstep". Your key is stored encrypted.</span><button class="btn btn--primary btn--sm" type="submit">${icon('link')}Connect</button></div></form>`;
    $('#pxForm', el).onsubmit = async (e) => { e.preventDefault(); const f = formData(e.target); const b = $('button[type=submit]', e.target); b.disabled = true; b.textContent = 'Checking…'; try { await API.connect({ kind: 'projectx', ...f }); toast('Connected. Syncing your trades…', icon('link')); await syncAll({ force: true, quiet: false }); draw(); } catch (er) { toast(er.message, icon('info'), 4); b.disabled = false; b.textContent = 'Connect'; } };
    $$('[data-psync]', el).forEach((b) => (b.onclick = async () => { b.disabled = true; try { const r = await API.syncConn(b.dataset.psync, { from: addDays(today(), -90) }); const fills = IM.projectxToFills(r.trades).map((f, i) => ({ ...f, account: r.trades[i].accountName })); const c = commit(IM.pairFills(fills, {}).trades); toast(`${c.added} new trades${c.dup ? `, ${c.dup} already here` : ''}`, icon('refresh')); H().refresh(); } catch (er) { toast(er.message, icon('info'), 4); } b.disabled = false; }));
    $$('[data-pdel]', el).forEach((b) => (b.onclick = () => confirmBox('Remove this connection?', 'Trades already imported stay in your journal. The stored API key is deleted.', async () => { await API.disconnect(b.dataset.pdel); draw(); }, 'Remove')));
    // sync key for add-ons
    const key = st.syncKey;
    const keyBox = (target) => `<div class="keybox"><span>Your sync key</span>${key ? `<code>${esc(key)}</code><button class="btn btn--sm" data-copy="${esc(key)}">${icon('copy')}Copy</button><button class="btn btn--sm btn--ghost" data-newkey>New key</button>` : `<button class="btn btn--sm btn--primary" data-newkey>Create sync key</button>`}</div>${key ? `<button class="btn btn--sm" data-dl="${target}">${icon('download')}Download ${target === 'mt5' ? 'SmartTradeSync.mq5' : 'SmartTradeSync.cs'}</button>` : ''}`;
    $('#cMt .cbody', el).innerHTML = `${keyBox('mt5')}<ol class="steps-sm"><li>In MetaTrader 5: <b>Tools → Options → Expert Advisors</b>, tick <b>Allow WebRequest</b> and add <code>${esc(SITE())}</code>.</li><li><b>File → Open Data Folder → MQL5 → Experts</b>, drop the file in, then refresh the Navigator.</li><li>Drag <b>SmartTradeSync</b> onto any chart and allow Algo Trading. It sends the last 30 days first, then each trade as it closes.</li></ol>`;
    $('#cNt .cbody', el).innerHTML = `${keyBox('nt8')}<ol class="steps-sm"><li>Put the file in <b>Documents\\NinjaTrader 8\\bin\\Custom\\AddOns</b>.</li><li>Open <b>New → NinjaScript Editor</b> and press <b>F5</b> to compile.</li><li>Restart NinjaTrader. Every fill on every connected account is sent from then on, including today's earlier fills.</li></ol>${st.inbox ? `<p class="muted" style="font-size:var(--fs-sm)">${st.inbox} item${st.inbox > 1 ? 's' : ''} waiting · processed on Sync now</p>` : ''}`;
    $$('[data-copy]', el).forEach((b) => (b.onclick = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => toast('Key copied', icon('copy')))));
    $$('[data-newkey]', el).forEach((b) => (b.onclick = () => (key ? confirmBox('Make a new key?', 'The old key stops working. Update it in MetaTrader and NinjaTrader after.', async () => { await API.newSyncKey(); draw(); }, 'New key') : API.newSyncKey().then(draw))));
    $$('[data-dl]', el).forEach((b) => (b.onclick = () => { const mt = b.dataset.dl === 'mt5'; dl(mt ? 'SmartTradeSync.mq5' : 'SmartTradeSync.cs', mt ? mql5(key) : ninja(key)); }));
  };
  draw(); after(el);
}
function dl(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

// ---- price bars storage (server when signed in, browser storage in local mode)
const LKEY = (sym) => 'st_bars_' + sym;
async function storeBars(symbol, bars) {
  const sym = IM.cleanSymbol(symbol);
  if (S.local) { let old = []; try { old = JSON.parse(localStorage.getItem(LKEY(sym)) || '[]'); } catch (e) {} const m = new Map(old.map((b) => [b.t, b])); bars.forEach((b) => m.set(b.t, b)); const all = [...m.values()].sort((a, b) => a.t - b.t).slice(-60000); try { localStorage.setItem(LKEY(sym), JSON.stringify(all)); } catch (e) { throw new Error('Browser storage is full. Sign in to store more price data.'); } return; }
  for (let i = 0; i < bars.length; i += 20000) await API.putBars(sym, bars.slice(i, i + 20000));
}
async function storedSymbols() {
  if (S.local) return Object.keys(localStorage).filter((k) => k.startsWith('st_bars_')).map((k) => { const a = JSON.parse(localStorage.getItem(k) || '[]'); return { symbol: k.slice(8), first: a[0] ? new Date(a[0].t * 1000).toISOString().slice(0, 10) : '', last: a.length ? new Date(a[a.length - 1].t * 1000).toISOString().slice(0, 10) : '', days: new Set(a.map((b) => new Date(b.t * 1000).toISOString().slice(0, 10))).size }; });
  try { return (await API.barSymbols()).symbols || []; } catch (e) { return []; }
}
async function storedBars(symbol, fromSec, toSec) {
  const sym = IM.cleanSymbol(symbol); const d = (s) => new Date(s * 1000).toISOString().slice(0, 10);
  if (S.local) { try { return JSON.parse(localStorage.getItem(LKEY(sym)) || '[]').filter((b) => b.t >= fromSec && b.t <= toSec); } catch (e) { return []; } }
  try { return (await API.getBars(sym, d(fromSec - 86400), d(toSec + 86400))).bars.filter((b) => b.t >= fromSec && b.t <= toSec); } catch (e) { return []; }
}
function barsCard(box, redraw) {
  box.innerHTML = `<form class="stack" id="barsForm" style="gap:10px"><div class="grid g-3" style="gap:10px">${field('Symbol', inp('symbol', (P().instruments || [])[0] || 'NQ', 'placeholder="NQ"'))}${field('Times in file', `<select class="in" name="tz">${optionList(TZS, 'local')}</select>`)}${field('File', '<input class="in" type="file" name="file" accept=".csv,.txt">')}</div>
    <div class="row row--between" style="flex-wrap:wrap;gap:8px"><span class="muted" style="font-size:var(--fs-sm)">TradingView: chart → ⋯ → Export chart data. NinjaTrader: Tools → Historical Data → Export. MT5: View → Symbols → Bars → Export.</span><button class="btn btn--sm btn--primary" type="submit">${icon('upload')}Upload bars</button></div></form><div id="barList" class="muted" style="font-size:var(--fs-sm);margin-top:10px">Loading…</div>`;
  storedSymbols().then((list) => { const b = $('#barList', box); if (b) b.innerHTML = list.length ? list.map((x) => `<span class="pill">${esc(x.symbol)} · ${x.days} days · ${esc(fmtDate(x.first))}–${esc(fmtDate(x.last))}</span>`).join(' ') : 'No price data stored yet. Crypto replays use free Binance data automatically.'; });
  $('#barsForm', box).onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; const fl = f.file.files[0]; if (!fl) return shake(f.file);
    const b = $('button[type=submit]', f); b.disabled = true; b.textContent = 'Reading…';
    try { const bars = IM.parseBars(await fl.text(), { tz: tzVal(f.tz.value) }); if (bars.length < 10) throw new Error('No price bars found in that file.'); await storeBars(f.symbol.value, bars); toast(`${bars.length.toLocaleString()} bars saved for ${IM.cleanSymbol(f.symbol.value)}`, icon('check')); redraw && redraw(); }
    catch (er) { toast(er.message, icon('info'), 4); }
    b.disabled = false; b.textContent = 'Upload bars';
  };
}

// ---- bars for a trade: stored → crypto (Binance) → ProjectX connection
async function barsFor(t, fromSec, toSec) {
  const sym = IM.cleanSymbol(t.symbol);
  let bars = await storedBars(sym, fromSec, toSec); if (bars.length > 5) return { bars, source: 'your uploaded data' };
  if (IM.isCrypto(sym)) { try { bars = await IM.binanceBars(sym, fromSec, toSec, '1m'); if (bars.length) return { bars, source: 'Binance (free)' }; } catch (e) { /* fall through */ } }
  if (!S.local && t.contractId) {
    try { const st = await API.connections(); const c = st.connections.find((x) => x.kind === 'projectx'); if (c) { const r = await API.connBars(c.id, { contractId: t.contractId, startTime: new Date(fromSec * 1000).toISOString(), endTime: new Date(toSec * 1000).toISOString() }); if (r.bars.length) { storeBars(sym, r.bars).catch(() => {}); return { bars: r.bars, source: 'ProjectX' }; } } } catch (e) { /* fall through */ }
  }
  return { bars: [], source: '' };
}

// ======================================================================= TRADE REPLAY
const LC = () => new Promise((res, rej) => { if (window.LightweightCharts) return res(window.LightweightCharts); const s = document.createElement('script'); s.src = new URL('vendor/lightweight-charts.standalone.production.js', document.baseURI).href; s.onload = () => res(window.LightweightCharts); s.onerror = rej; document.head.append(s); });
export async function replay(box, t, { onExcursion } = {}) {
  if (!t.symbol || !t.date || !t.time) { box.innerHTML = '<div class="empty">Add the symbol, date and entry time to replay this trade.</div>'; return; }
  box.innerHTML = '<div class="empty"><span class="typing"><i></i><i></i><i></i></span>Loading price data…</div>';
  const start = IM.tradeEpoch(t.date, t.time); let end = t.exitTime ? IM.tradeEpoch(t.date, t.exitTime) : start + 1800; if (end < start) end += 86400;
  const from = start - 90 * 60; const to = end + 45 * 60;
  const { bars, source } = await barsFor(t, from, to);
  if (!bars.length) {
    box.innerHTML = `<div class="replay__empty"><b>No price data for ${esc(IM.cleanSymbol(t.symbol))} on ${esc(fmtDay(t.date))} yet</b><p class="muted">Upload 1-minute bars once and every ${esc(IM.cleanSymbol(t.symbol))} trade can be replayed. Crypto symbols load automatically, and TopstepX trades load through a ProjectX connection.</p><div id="rpUp"></div></div>`;
    barsCard($('#rpUp', box), () => replay(box, t, { onExcursion })); return;
  }
  const L = await LC(); const off = -new Date().getTimezoneOffset() * 60; // show in local time
  const css = getComputedStyle(document.documentElement); const c = (v) => css.getPropertyValue(v).trim();
  box.innerHTML = `<div class="replay"><div class="replay__bar"><button class="btn btn--sm btn--primary" data-rp="play">${icon('play')}Play</button><button class="btn btn--sm" data-rp="step">Step</button><select class="in" data-rp="speed" style="width:auto">${optionList([['600', '1×'], ['250', '2×'], ['100', '5×'], ['40', '10×']], '250')}</select><button class="btn btn--sm btn--ghost" data-rp="all">Show all</button><span class="replay__pnl" id="rpPnl"></span><span class="muted replay__src">Data: ${esc(source)}</span></div><div class="replay__chart" id="rpChart"></div><div class="replay__foot" id="rpFoot"></div></div>`;
  const chart = L.createChart($('#rpChart', box), { autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: c('--muted'), fontFamily: c('--font') }, grid: { vertLines: { color: c('--line') }, horzLines: { color: c('--line') } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false }, crosshair: { mode: 0 } });
  const series = chart.addSeries(L.CandlestickSeries, { upColor: '#3ecf8e', downColor: '#ff4d5e', wickUpColor: '#3ecf8e', wickDownColor: '#ff4d5e', borderVisible: false });
  const data = bars.map((b) => ({ time: b.t + off, open: b.o, high: b.h, low: b.l, close: b.c }));
  const long = t.side !== 'Short'; const dir = long ? 1 : -1; const pv = pointValue(t.symbol) || 1; const q = num(t.qty) || 1;
  const near = (sec) => data.reduce((best, d) => (Math.abs(d.time - (sec + off)) < Math.abs(best.time - (sec + off)) ? d : best), data[0]).time;
  const eT = near(start); const xT = near(end);
  const markers = [{ time: eT, position: long ? 'belowBar' : 'aboveBar', color: long ? '#3ecf8e' : '#ff4d5e', shape: long ? 'arrowUp' : 'arrowDown', text: `${t.side} ${q}${num(t.entry) ? ' @ ' + t.entry : ''}` }];
  if (t.exitTime) markers.push({ time: xT, position: long ? 'aboveBar' : 'belowBar', color: c('--ink'), shape: 'circle', text: `Exit${num(t.exit) ? ' @ ' + t.exit : ''}` });
  const entryPx = num(t.entry) || (data.find((d) => d.time === eT) || data[0]).open;
  [[entryPx, 'Entry', c('--ink-2')], [num(t.stop), 'Stop', '#ff4d5e'], [num(t.target), 'Target', '#3ecf8e']].forEach(([price, title, color]) => price && series.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title }));
  // excursion from bars while in the trade
  const inTrade = data.filter((d) => d.time >= eT && d.time <= xT);
  const mfe = inTrade.length ? Math.max(...inTrade.map((d) => ((long ? d.high : d.low) - entryPx) * dir)) * q * pv : 0;
  const mae = inTrade.length ? Math.min(...inTrade.map((d) => ((long ? d.low : d.high) - entryPx) * dir)) * q * pv : 0;
  $('#rpFoot', box).innerHTML = `<span>Best open P&amp;L <b class="good">${money(Math.max(0, mfe), { sign: true })}</b></span><span>Worst open P&amp;L <b class="bad">${money(Math.min(0, mae), { sign: true })}</b></span><span>Kept <b>${mfe > 0 ? pct(clamp(net(t) / mfe, 0, 1)) : '—'}</b> of the best</span>${onExcursion ? '<button class="btn btn--sm" data-rp="fill">Save to this trade</button>' : ''}`;
  const fill = $('[data-rp="fill"]', box); if (fill) fill.onclick = () => { onExcursion({ mae: Math.round(Math.min(0, mae)), mfe: Math.round(Math.max(0, mfe)) }); toast('Best and worst open P&L filled in', icon('check')); };
  let i = Math.max(5, data.findIndex((d) => d.time >= eT) - 30); let timer = null; let markersApi = null;
  const paint = (n) => { series.setData(data.slice(0, n)); markersApi ? markersApi.setMarkers(markers.filter((m) => m.time <= data[n - 1].time)) : (markersApi = L.createSeriesMarkers(series, markers.filter((m) => m.time <= data[n - 1].time))); runPnl(n); };
  const runPnl = (n) => { const last = data[n - 1]; const el2 = $('#rpPnl', box); if (!el2) return; if (last.time < eT) { el2.textContent = `${Math.round((eT - last.time) / 60)} min to entry`; el2.className = 'replay__pnl muted'; return; } const px = last.time >= xT && num(t.exit) ? num(t.exit) : last.close; const v = (px - entryPx) * dir * q * pv; el2.textContent = `${last.time >= xT && t.exitTime ? 'Closed' : 'Open'} ${money(v, { sign: true })}`; el2.className = 'replay__pnl ' + tone(v); };
  paint(i); chart.timeScale().fitContent();
  const stop = () => { clearInterval(timer); timer = null; $('[data-rp="play"]', box).innerHTML = `${icon('play')}Play`; };
  $('[data-rp="play"]', box).onclick = () => { if (timer) return stop(); if (i >= data.length) i = Math.max(5, data.findIndex((d) => d.time >= eT) - 30); $('[data-rp="play"]', box).innerHTML = `${icon('pause')}Pause`; timer = setInterval(() => { if (i >= data.length) return stop(); i++; series.update(data[i - 1]); markersApi.setMarkers(markers.filter((m) => m.time <= data[i - 1].time)); runPnl(i); }, +$('[data-rp="speed"]', box).value); };
  $('[data-rp="speed"]', box).onchange = () => { if (timer) { stop(); $('[data-rp="play"]', box).click(); } };
  $('[data-rp="step"]', box).onclick = () => { stop(); if (i < data.length) { i++; series.update(data[i - 1]); markersApi.setMarkers(markers.filter((m) => m.time <= data[i - 1].time)); runPnl(i); } };
  $('[data-rp="all"]', box).onclick = () => { stop(); i = data.length; paint(i); chart.timeScale().fitContent(); };
  const mo = new MutationObserver(() => { if (!document.body.contains(box)) { stop(); chart.remove(); mo.disconnect(); } }); mo.observe(document.body, { childList: true, subtree: true });
}

// ======================================================================= AI BACKTEST ENGINE
const TF_SEC = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600 };
function resample(bars, sec) {
  if (!bars.length) return []; const out = []; let cur = null;
  bars.forEach((b) => { const k = Math.floor(b.t / sec) * sec; if (!cur || cur.t !== k) { cur && out.push(cur); cur = { t: k, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }; } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v || 0; } });
  cur && out.push(cur); return out;
}
const hhmm = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
export function runBacktest(spec, rawBars) {
  const sec = TF_SEC[spec.timeframe] || 300; const bars = resample(rawBars, sec); const n = bars.length;
  if (n < 50) throw new Error('Not enough price bars to backtest. Load at least a few days.');
  const tz = spec.tz || 'UTC'; const offCache = {};
  const loc = bars.map((b) => { const dayKey = Math.floor(b.t / 86400); const off = offCache[dayKey] ?? (offCache[dayKey] = IM.tzOffsetMinutes(tz, b.t * 1000)); const lt = new Date((b.t + off * 60) * 1000); return { day: lt.toISOString().slice(0, 10), min: lt.getUTCHours() * 60 + lt.getUTCMinutes() }; });
  const C = bars.map((b) => b.c); const cache = {};
  const ema = (p) => cache['e' + p] || (cache['e' + p] = (() => { const k = 2 / (p + 1); const o = []; C.forEach((v, i) => o.push(i ? v * k + o[i - 1] * (1 - k) : v)); return o; })());
  const sma = (p, src = C) => { const o = []; let s = 0; src.forEach((v, i) => { s += v; if (i >= p) s -= src[i - p]; o.push(i >= p - 1 ? s / p : NaN); }); return o; };
  const atr = (p) => cache['a' + p] || (cache['a' + p] = (() => { const o = []; bars.forEach((b, i) => { const tr = i ? Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)) : b.h - b.l; o.push(i ? (o[i - 1] * (p - 1) + tr) / p : tr); }); return o; })());
  const rsi = (p) => cache['r' + p] || (cache['r' + p] = (() => { const o = [NaN]; let g = 0; let l = 0; for (let i = 1; i < n; i++) { const d = C[i] - C[i - 1]; g = (g * (p - 1) + Math.max(0, d)) / p; l = (l * (p - 1) + Math.max(0, -d)) / p; o.push(i < p ? NaN : l === 0 ? 100 : 100 - 100 / (1 + g / l)); } return o; })());
  const vwap = () => cache.vw || (cache.vw = (() => { const o = []; let pv = 0; let vv = 0; bars.forEach((b, i) => { if (!i || loc[i].day !== loc[i - 1].day) { pv = 0; vv = 0; } const tp = (b.h + b.l + b.c) / 3; const v = b.v || 1; pv += tp * v; vv += v; o.push(pv / vv); }); return o; })());
  const dayStats = (() => { const m = {}; bars.forEach((b, i) => { const d = loc[i].day; const x = (m[d] ||= { h: -Infinity, l: Infinity, c: 0 }); x.h = Math.max(x.h, b.h); x.l = Math.min(x.l, b.l); x.c = b.c; }); return m; })();
  const days = Object.keys(dayStats).sort();
  const operand = (o) => {
    if (typeof o === 'number') return () => o;
    if (o == null) return () => NaN;
    if (o.price) { const k = { open: 'o', high: 'h', low: 'l', close: 'c' }[o.price] || 'c'; return (i) => bars[i][k]; }
    if (o.ema) { const a = ema(o.ema); return (i) => a[i]; }
    if (o.sma) { const a = cache['s' + o.sma] || (cache['s' + o.sma] = sma(o.sma)); return (i) => a[i]; }
    if (o.rsi) { const a = rsi(o.rsi); return (i) => a[i]; }
    if (o.atr) { const a = atr(o.atr); return (i) => a[i]; }
    if (o.vwap) { const a = vwap(); return (i) => a[i]; }
    if (o.volume) return (i) => bars[i].v;
    if (o.sma_volume) { const a = sma(o.sma_volume, bars.map((b) => b.v || 0)); return (i) => a[i]; }
    if (o.highest) { const k = o.of === 'close' ? 'c' : 'h'; return (i) => (i < o.highest ? NaN : Math.max(...bars.slice(i - o.highest, i).map((b) => b[k]))); }
    if (o.lowest) { const k = o.of === 'close' ? 'c' : 'l'; return (i) => (i < o.lowest ? NaN : Math.min(...bars.slice(i - o.lowest, i).map((b) => b[k]))); }
    if (o.range) { const s = hhmm(o.start); const e = hhmm(o.end); const m = {}; bars.forEach((b, i) => { if (loc[i].min >= s && loc[i].min < e) { const x = (m[loc[i].day] ||= { high: -Infinity, low: Infinity }); x.high = Math.max(x.high, b.h); x.low = Math.min(x.low, b.l); } }); return (i) => (loc[i].min >= e && m[loc[i].day] ? m[loc[i].day][o.range] : NaN); }
    if (o.prevday) { const k = { high: 'h', low: 'l', close: 'c' }[o.prevday]; return (i) => { const di = days.indexOf(loc[i].day); return di > 0 ? dayStats[days[di - 1]][k] : NaN; }; }
    if (o.clock) return (i) => loc[i].min;
    if (o.time) { const v = hhmm(o.time); return () => v; }
    return () => NaN;
  };
  const cond = (list) => (list || []).map((c) => { const L = operand(c.left); const R = operand(c.right); return (i) => { const a = L(i); const b = R(i); if (!Number.isFinite(a) || !Number.isFinite(b)) return false; if (c.op === 'crosses_above') return i > 0 && a > b && L(i - 1) <= R(i - 1); if (c.op === 'crosses_below') return i > 0 && a < b && L(i - 1) >= R(i - 1); return c.op === '>' ? a > b : c.op === '<' ? a < b : c.op === '>=' ? a >= b : c.op === '<=' ? a <= b : false; }; });
  const longC = spec.long ? cond(spec.long) : null; const shortC = spec.short ? cond(spec.short) : null;
  const rangeOp = [...(spec.long || []), ...(spec.short || [])].flatMap((c) => [c.left, c.right]).find((o) => o && o.range);
  const rangeHi = rangeOp ? operand({ ...rangeOp, range: 'high' }) : null; const rangeLo = rangeOp ? operand({ ...rangeOp, range: 'low' }) : null;
  const inSession = (i) => { if (!spec.session) return true; const s = hhmm(spec.session.start); const e = hhmm(spec.session.end); const m = loc[i].min; return s <= e ? m >= s && m < e : m >= s || m < e; };
  const sessionEnd = (i) => spec.session && i + 1 < n && (inSession(i) && !inSession(i + 1) || loc[i + 1].day !== loc[i].day && spec.exitAtSessionEnd);
  const stopDist = (i, side, entry) => { const s = spec.stop || { type: 'atr', value: 1.5, period: 14 }; const v = num(s.value) || 1;
    if (s.type === 'points') return v; if (s.type === 'percent') return entry * v / 100; if (s.type === 'atr') return atr(s.period || 14)[i] * v;
    if (s.type === 'range' && rangeHi) { const hi = rangeHi(i); const lo = rangeLo(i); if (Number.isFinite(hi) && Number.isFinite(lo)) return Math.max(side > 0 ? entry - lo : hi - entry, 1e-9); }
    if (s.type === 'swing') { const p = s.period || 10; const w = bars.slice(Math.max(0, i - p + 1), i + 1); return Math.max(side > 0 ? entry - Math.min(...w.map((b) => b.l)) : Math.max(...w.map((b) => b.h)) - entry, 1e-9); }
    return atr(14)[i] * 1.5; };
  const tgtDist = (i, risk, entry) => { const t = spec.target || { type: 'r', value: 2 }; const v = num(t.value) || 2; if (t.type === 'none') return Infinity; if (t.type === 'points') return v; if (t.type === 'percent') return entry * v / 100; if (t.type === 'atr') return atr(14)[i] * v; return risk * v; };
  const trades = []; let pos = null; const perDay = {}; const maxPD = num(spec.maxTradesPerDay) || 99;
  for (let i = 30; i < n - 1; i++) {
    const b = bars[i];
    if (pos && i > pos.i) {
      const hitStop = pos.side > 0 ? b.l <= pos.stop : b.h >= pos.stop; const hitTgt = pos.side > 0 ? b.h >= pos.tgt : b.l <= pos.tgt;
      let exit = null; let why = '';
      if (hitStop) { exit = pos.stop; why = 'stop'; } else if (hitTgt) { exit = pos.tgt; why = 'target'; } else if (spec.exitAtSessionEnd !== false && sessionEnd(i)) { exit = b.c; why = 'session end'; }
      if (exit !== null) { const r = (exit - pos.entry) * pos.side / pos.risk; trades.push({ date: loc[pos.i].day, time: `${String(loc[pos.i].min / 60 | 0).padStart(2, '0')}:${String(loc[pos.i].min % 60).padStart(2, '0')}`, side: pos.side > 0 ? 'Long' : 'Short', entry: pos.entry, exit, r: Math.round(r * 100) / 100, why, bars: i - pos.i + 1 }); pos = null; }
    }
    if (!pos && inSession(i) && (perDay[loc[i].day] || 0) < maxPD) {
      const goLong = longC && longC.length && longC.every((f) => f(i)); const goShort = !goLong && shortC && shortC.length && shortC.every((f) => f(i));
      if (goLong || goShort) {
        const side = goLong ? 1 : -1; const entry = bars[i + 1].o; const risk = stopDist(i, side, entry);
        if (Number.isFinite(risk) && risk > 0) { pos = { i: i + 1, side, entry, risk, stop: entry - side * risk, tgt: entry + side * tgtDist(i, risk, entry) }; perDay[loc[i].day] = (perDay[loc[i].day] || 0) + 1; }
      }
    }
  }
  const rs = trades.map((t) => t.r); const wins = rs.filter((r) => r > 0); const losses = rs.filter((r) => r < 0);
  let eq = 0; let peak = 0; let dd = 0; const curve = trades.map((t) => { eq += t.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); return { date: t.date, eq, net: t.r }; });
  return { trades, bars: n, from: loc[0].day, to: loc[n - 1].day, stats: { n: trades.length, winRate: trades.length ? wins.length / trades.length : 0, totalR: sum(rs), avgR: trades.length ? sum(rs) / trades.length : 0, pf: sum(losses) ? sum(wins) / Math.abs(sum(losses)) : wins.length ? Infinity : 0, maxDD: dd, best: rs.length ? Math.max(...rs) : 0, worst: rs.length ? Math.min(...rs) : 0, avgBars: trades.length ? sum(trades, (t) => t.bars) / trades.length : 0 }, curve };
}

// ======================================================================= AI BACKTEST UI
let AIB = { src: 'stored', last: null };
export function aiBacktestHTML() {
  return `<section class="card aib"><div class="chead"><span class="prodico">${icon('coach')}</span><div class="chead__text"><h3>AI backtest</h3><p>Describe a strategy in plain English. The coach turns it into exact rules and runs them on real price bars in your browser.</p></div></div>
    <div class="stack">
      <textarea class="in" id="aibText" rows="4" placeholder="e.g. On NQ, mark the high and low of the first 15 minutes after the 9:30 New York open. Go long when a 5-minute candle closes above the high, short below the low. Stop at the other side of the range, target 2R, max one trade a day, flat by 4pm.">${esc(AIB.text || '')}</textarea>
      <div class="grid g-4" style="gap:10px">
        ${field('Price data', `<select class="in" id="aibSrc">${optionList([['stored', 'Bars I uploaded'], ['binance', 'Crypto · Binance (free)'], ['projectx', 'ProjectX connection'], ['file', 'Upload a file now']], AIB.src)}</select>`)}
        <div id="aibSrcBox" class="g-span3"></div>
      </div>
      <div class="row row--between" style="flex-wrap:wrap;gap:8px"><span class="muted" style="font-size:var(--fs-sm)">Entries fill at the next bar's open. If a bar touches both stop and target, the stop is counted. No fees or slippage.</span><button class="btn btn--primary" id="aibRun">${icon('flask')}Run backtest</button></div>
      <div id="aibOut"></div>
    </div></section>`;
}
export async function bindAiBacktest(el) {
  const srcBox = $('#aibSrcBox', el); if (!srcBox) return;
  const drawSrc = async () => {
    const v = $('#aibSrc', el).value; AIB.src = v;
    if (v === 'stored') { const list = await storedSymbols(); srcBox.innerHTML = list.length ? `<div class="grid g-3" style="gap:10px">${field('Symbol', `<select class="in" id="aibSym">${optionList(list.map((x) => [x.symbol, `${x.symbol} (${x.days} days)`]))}</select>`)}${field('From', inp('aibFrom', list[0].first, 'type="date" id="aibFrom"'))}${field('To', inp('aibTo', list[0].last, 'type="date" id="aibTo"'))}</div>` : '<p class="muted" style="margin:28px 0 0;font-size:var(--fs-sm)">No uploaded bars yet. Upload them on the Connections page, pick a file below, or use crypto data.</p>'; }
    else if (v === 'binance') srcBox.innerHTML = `<div class="grid g-3" style="gap:10px">${field('Symbol', inp('aibSym', 'BTCUSDT', 'id="aibSym"'))}${field('Bars', `<select class="in" id="aibInt">${optionList([['5m', '5-minute'], ['15m', '15-minute'], ['1h', '1-hour'], ['1m', '1-minute']], '5m')}</select>`)}${field('Days of history', inp('aibDays', 60, 'type="number" min="5" max="365" id="aibDays"'))}</div>`;
    else if (v === 'projectx') srcBox.innerHTML = `<div class="grid g-2" style="gap:10px">${field('Contract ID', inp('aibContract', S.trade.slice().reverse().find((t) => t.contractId)?.contractId || 'CON.F.US.ENQ.Z26', 'id="aibContract"'), '', 'as shown on synced trades, e.g. CON.F.US.ENQ.Z26')}${field('Days of history', inp('aibDays', 30, 'type="number" min="2" max="90" id="aibDays"'))}</div>`;
    else srcBox.innerHTML = `<div class="grid g-2" style="gap:10px">${field('Bars file', '<input class="in" type="file" id="aibFile" accept=".csv,.txt">')}${field('Times in file', `<select class="in" id="aibTz">${optionList(TZS, 'local')}</select>`)}</div>`;
  };
  $('#aibSrc', el).onchange = drawSrc; await drawSrc();
  $('#aibRun', el).onclick = async () => {
    const text = $('#aibText', el).value.trim(); AIB.text = text; if (!text) return shake($('#aibText', el));
    if (!S.ai.configured) { toast('AI backtests need the AI coach (sign in on thesmarttrade.in).', icon('info'), 4); return; }
    const out = $('#aibOut', el); const btn = $('#aibRun', el); btn.disabled = true;
    try {
      out.innerHTML = '<div class="empty"><span class="typing"><i></i><i></i><i></i></span>Loading price data…</div>';
      let bars = []; const v = AIB.src; const now = Math.floor(Date.now() / 1000);
      if (v === 'stored') { const sym = $('#aibSym', el)?.value; if (!sym) throw new Error('Upload price bars first.'); const f = Math.floor(+new Date($('#aibFrom', el).value) / 1000); const t = Math.floor(+new Date($('#aibTo', el).value) / 1000) + 86400; bars = await storedBars(sym, f, t); }
      else if (v === 'binance') { const days = clamp(num($('#aibDays', el).value) || 60, 5, 365); bars = await IM.binanceBars($('#aibSym', el).value, now - days * 86400, now, $('#aibInt', el).value); }
      else if (v === 'projectx') { const st = await API.connections(); const c = st.connections.find((x) => x.kind === 'projectx'); if (!c) throw new Error('Connect ProjectX on the Connections page first.'); const days = clamp(num($('#aibDays', el).value) || 30, 2, 90); bars = (await API.connBars(c.id, { contractId: $('#aibContract', el).value.trim(), startTime: new Date((now - days * 86400) * 1000).toISOString(), endTime: new Date(now * 1000).toISOString() })).bars; }
      else { const f = $('#aibFile', el).files[0]; if (!f) throw new Error('Choose a bars file.'); bars = IM.parseBars(await f.text(), { tz: tzVal($('#aibTz', el).value) }); }
      if (bars.length < 100) throw new Error(`Only ${bars.length} price bars found. Load more history.`);
      out.innerHTML = `<div class="empty"><span class="typing"><i></i><i></i><i></i></span>Turning your strategy into rules… (${bars.length.toLocaleString()} bars loaded)</div>`;
      const r = await API.ai({ mode: 'backtest', messages: [{ role: 'user', content: text }] });
      const spec = JSON.parse((r.text.match(/\{[\s\S]*\}/) || ['{}'])[0]);
      if (!spec.long && !spec.short) throw new Error('The coach couldn\'t turn that into entry rules. Try describing when exactly you go long or short.');
      const res = runBacktest(spec, bars); AIB.last = { spec, res };
      renderResult(out, spec, res);
    } catch (e) { out.innerHTML = `<div class="empty"><b class="bad">${esc(e.message)}</b></div>`; }
    btn.disabled = false;
  };
  if (AIB.last) renderResult($('#aibOut', el), AIB.last.spec, AIB.last.res);
}
function renderResult(out, spec, res) {
  const s = res.stats; const fR = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}R`;
  out.innerHTML = `<div class="aib__res">
    <div class="aib__rules"><b>${esc(spec.name || 'Your strategy')}</b> · ${esc(spec.timeframe || '5m')} bars · ${esc(res.from)} → ${esc(res.to)}<ul>${(spec.summary || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${(spec.unsupported || []).length ? `<p class="warn" style="margin:6px 0 0;font-size:var(--fs-sm)">Not tested: ${esc(spec.unsupported.join('; '))}</p>` : ''}</div>
    <div class="grid g-4" style="gap:10px">${[['Trades', String(s.n), ''], ['Win rate', pct(s.winRate), ''], ['Expectancy', fR(s.avgR), tone(s.avgR)], ['Profit factor', Number.isFinite(s.pf) ? s.pf.toFixed(2) : '∞', s.pf >= 1 ? 'good' : 'bad'], ['Total', fR(s.totalR), tone(s.totalR)], ['Max drawdown', `${s.maxDD.toFixed(1)}R`, 'bad'], ['Best / worst', `${fR(s.best)} / ${fR(s.worst)}`, ''], ['Avg hold', `${s.avgBars.toFixed(1)} bars`, '']].map(([l, v, c]) => `<div class="kpi"><small>${l}</small><b class="${c}">${v}</b></div>`).join('')}</div>
    ${s.n > 1 ? `<div style="margin-top:12px">${equityChart([{ date: res.curve[0].date, eq: 0, start: true }, ...res.curve], { h: 200, id: 'aib' }).replace(/[$₹€£]/g, '')}</div>` : ''}
    ${s.n ? `<details class="aib__list"><summary>All ${s.n} trades</summary><div class="tablewrap"><table class="t"><thead><tr><th>Date</th><th>Time</th><th>Side</th><th>Entry</th><th>Exit</th><th>Why</th><th>R</th></tr></thead><tbody>${res.trades.slice().reverse().map((t) => `<tr><td>${esc(t.date)}</td><td>${esc(t.time)}</td><td>${esc(t.side)}</td><td>${+t.entry.toFixed(4)}</td><td>${+t.exit.toFixed(4)}</td><td>${esc(t.why)}</td><td class="${tone(t.r)}">${fR(t.r)}</td></tr>`).join('')}</tbody></table></div></details>` : '<div class="empty">No trades triggered. Loosen a rule or load more history.</div>'}
    ${s.n ? `<div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><span class="muted" style="font-size:var(--fs-sm);margin-right:auto">${s.n < 30 ? 'Fewer than 30 trades: treat this as a first look, not proof.' : ''}</span><button class="btn btn--sm" id="aibSave">${icon('plus')}Add to my backtest log</button></div>` : ''}
  </div>`;
  const sv = $('#aibSave', out); if (sv) sv.onclick = () => { const name = spec.name || 'AI strategy'; res.trades.slice(-500).forEach((t) => save('bt', { id: uid(), strategy: name, symbol: '', date: t.date, side: t.side, r: t.r, note: `AI backtest · ${t.why}` })); toast(`${Math.min(500, res.trades.length)} trades added to "${name}"`, icon('check')); H().refresh(); };
}

// ======================================================================= ADD-ON SOURCE FILES
function mql5(key) {
  return `//+------------------------------------------------------------------+
//| SmartTradeSync.mq5 - sends your closed trades to The Smart Trade  |
//| Drop in MQL5/Experts, attach to any chart, allow WebRequest for   |
//| ${SITE()}                                                          |
//+------------------------------------------------------------------+
#property copyright "The Smart Trade"
#property link      "${SITE()}"
#property version   "1.00"
#property description "Sends each closed position to your journal. Read-only: it never places or changes orders."

input string SyncKey      = "${key}"; // from Connections in your journal
input int    BackfillDays = 30;        // history to send the first time

const string URL = "${SITE()}/api/ingest/";
datetime g_last = 0;

int OnInit()
{
   EventSetTimer(60);
   g_last = (datetime)GlobalVariableGet(GvName());
   if(g_last == 0) g_last = TimeCurrent() - BackfillDays * 86400;
   SendSince(g_last);
   return(INIT_SUCCEEDED);
}
void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer() { SendSince(g_last - 300); }
void OnTradeTransaction(const MqlTradeTransaction &t, const MqlTradeRequest &rq, const MqlTradeResult &rs)
{
   if(t.type == TRADE_TRANSACTION_DEAL_ADD) SendSince(TimeCurrent() - 3600);
}
string GvName() { return "SmartTradeLast_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)); }
long ServerOffset() { long o = (long)(TimeTradeServer() - TimeGMT()); return (long)MathRound(o / 900.0) * 900; }
string Esc(string s) { StringReplace(s, "\\\\", "\\\\\\\\"); StringReplace(s, "\\"", "\\\\\\""); return s; }

void SendSince(datetime from)
{
   if(!HistorySelect(from, TimeCurrent() + 60)) return;
   int n = HistoryDealsTotal();
   ulong outs[]; ArrayResize(outs, 0);
   for(int i = 0; i < n; i++)
   {
      ulong d = HistoryDealGetTicket(i);
      long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
      long type = HistoryDealGetInteger(d, DEAL_TYPE);
      if((entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY) && (type == DEAL_TYPE_BUY || type == DEAL_TYPE_SELL))
      { int k = ArraySize(outs); ArrayResize(outs, k + 1); outs[k] = d; }
   }
   // read out-deal details first: HistorySelectByPosition below replaces the selection
   int m = ArraySize(outs); if(m == 0) return;
   long pos[]; datetime xt[]; double xp[], vol[], pnl[], sw[], cm[]; string sym[];
   ArrayResize(pos, m); ArrayResize(xt, m); ArrayResize(xp, m); ArrayResize(vol, m); ArrayResize(pnl, m); ArrayResize(sw, m); ArrayResize(cm, m); ArrayResize(sym, m);
   for(int i = 0; i < m; i++)
   {
      pos[i] = HistoryDealGetInteger(outs[i], DEAL_POSITION_ID);
      xt[i]  = (datetime)HistoryDealGetInteger(outs[i], DEAL_TIME);
      xp[i]  = HistoryDealGetDouble(outs[i], DEAL_PRICE);
      vol[i] = HistoryDealGetDouble(outs[i], DEAL_VOLUME);
      pnl[i] = HistoryDealGetDouble(outs[i], DEAL_PROFIT);
      sw[i]  = HistoryDealGetDouble(outs[i], DEAL_SWAP);
      cm[i]  = HistoryDealGetDouble(outs[i], DEAL_COMMISSION);
      sym[i] = HistoryDealGetString(outs[i], DEAL_SYMBOL);
   }
   long login = AccountInfoInteger(ACCOUNT_LOGIN); long off = ServerOffset();
   string items = ""; int count = 0; datetime newest = g_last;
   for(int i = 0; i < m; i++)
   {
      datetime et = 0; double ep = 0, sl = 0, tp = 0, entryComm = 0; string side = "";
      if(HistorySelectByPosition(pos[i]))
      {
         for(int j = 0; j < HistoryDealsTotal(); j++)
         {
            ulong d = HistoryDealGetTicket(j);
            if(HistoryDealGetInteger(d, DEAL_ENTRY) == DEAL_ENTRY_IN)
            {
               et = (datetime)HistoryDealGetInteger(d, DEAL_TIME); ep = HistoryDealGetDouble(d, DEAL_PRICE);
               side = HistoryDealGetInteger(d, DEAL_TYPE) == DEAL_TYPE_BUY ? "Long" : "Short";
               entryComm += HistoryDealGetDouble(d, DEAL_COMMISSION);
               sl = HistoryDealGetDouble(d, DEAL_SL); tp = HistoryDealGetDouble(d, DEAL_TP);
               break;
            }
         }
      }
      if(side == "") continue;
      string it = StringFormat("{\\"uid\\":\\"mt5-%I64d-%I64d-%I64d\\",\\"source\\":\\"mt5\\",\\"login\\":%I64d,\\"positionId\\":\\"%I64d-%I64d\\",\\"symbol\\":\\"%s\\",\\"side\\":\\"%s\\",\\"volume\\":%.2f,\\"entryTime\\":%I64d,\\"entryPrice\\":%.6f,\\"exitTime\\":%I64d,\\"exitPrice\\":%.6f,\\"profit\\":%.2f,\\"swap\\":%.2f,\\"commission\\":%.2f,\\"sl\\":%.6f,\\"tp\\":%.6f}",
         login, pos[i], (long)xt[i], login, pos[i], (long)xt[i], Esc(sym[i]), side, vol[i], (long)et - off, ep, (long)xt[i] - off, xp[i], pnl[i], sw[i], cm[i] + entryComm, sl, tp);
      items += (count ? "," : "") + it; count++;
      if(xt[i] > newest) newest = xt[i];
      if(count == 100) { if(!Post(items)) return; items = ""; count = 0; }
   }
   if(count > 0 && !Post(items)) return;
   g_last = newest; GlobalVariableSet(GvName(), (double)g_last);
}

bool Post(string items)
{
   string body = "{\\"source\\":\\"mt5\\",\\"items\\":[" + items + "]}";
   char data[]; char result[]; string rh;
   StringToCharArray(body, data, 0, StringLen(body), CP_UTF8);
   int code = WebRequest("POST", URL + SyncKey, "Content-Type: application/json\\r\\n", 8000, data, result, rh);
   if(code == -1) { Print("Smart Trade: add ${SITE()} under Tools > Options > Expert Advisors > Allow WebRequest. Error ", GetLastError()); return false; }
   if(code != 200) { Print("Smart Trade: server said ", code, " ", CharArrayToString(result)); return false; }
   return true;
}
`;
}
function ninja(key) {
  return `// SmartTradeSync.cs - NinjaTrader 8 add-on that sends every fill to The Smart Trade.
// Put this file in Documents\\NinjaTrader 8\\bin\\Custom\\AddOns, compile with F5 in the NinjaScript Editor, restart NinjaTrader.
// Read-only: it never places, changes or cancels orders.
#region Using declarations
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Net.Http;
using System.Text;
using System.Threading;
using NinjaTrader.Cbi;
#endregion

namespace NinjaTrader.NinjaScript.AddOns
{
    public class SmartTradeSync : NinjaTrader.NinjaScript.AddOnBase
    {
        private const string SyncKey = "${key}";
        private const string Url = "${SITE()}/api/ingest/";
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        private readonly ConcurrentQueue<string> queue = new ConcurrentQueue<string>();
        private readonly HashSet<string> subscribed = new HashSet<string>();
        private readonly HashSet<string> sent = new HashSet<string>();
        private Timer timer;

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name = "SmartTradeSync";
                Description = "Sends your fills to your Smart Trade journal.";
            }
            else if (State == State.Active)
            {
                timer = new Timer(_ => Tick(), null, 2000, 5000);
            }
            else if (State == State.Terminated)
            {
                if (timer != null) timer.Dispose();
                lock (Account.All) foreach (Account a in Account.All) a.ExecutionUpdate -= OnExecution;
            }
        }

        // Subscribe to accounts as they connect, then flush the queue.
        private void Tick()
        {
            try
            {
                lock (Account.All)
                {
                    foreach (Account a in Account.All)
                    {
                        if (subscribed.Contains(a.Name)) continue;
                        subscribed.Add(a.Name);
                        a.ExecutionUpdate += OnExecution;
                        lock (a.Executions) foreach (Execution e in a.Executions) Enqueue(e);
                    }
                }
                Flush();
            }
            catch (Exception ex) { NinjaTrader.Code.Output.Process("SmartTradeSync: " + ex.Message, PrintTo.OutputTab1); }
        }

        private void OnExecution(object sender, ExecutionEventArgs e) { if (e.Execution != null) Enqueue(e.Execution); }

        private void Enqueue(Execution e)
        {
            string id = e.Account.Name + ":" + e.ExecutionId;
            lock (sent) { if (sent.Contains(id)) return; sent.Add(id); }
            long ms = new DateTimeOffset(e.Time.ToUniversalTime()).ToUnixTimeMilliseconds();
            string action = e.MarketPosition == MarketPosition.Short ? "Sell" : "Buy";
            queue.Enqueue(string.Format(CultureInfo.InvariantCulture,
                "{{\\"uid\\":\\"{0}\\",\\"source\\":\\"nt8\\",\\"account\\":\\"{1}\\",\\"instrument\\":\\"{2}\\",\\"action\\":\\"{3}\\",\\"qty\\":{4},\\"price\\":{5},\\"time\\":{6},\\"commission\\":{7},\\"executionId\\":\\"{8}\\"}}",
                Esc(id), Esc(e.Account.Name), Esc(e.Instrument.FullName), action, e.Quantity, e.Price, ms, e.Commission, Esc(e.ExecutionId)));
        }

        private void Flush()
        {
            if (queue.IsEmpty) return;
            var batch = new List<string>(); string item;
            while (batch.Count < 200 && queue.TryDequeue(out item)) batch.Add(item);
            string body = "{\\"source\\":\\"nt8\\",\\"items\\":[" + string.Join(",", batch) + "]}";
            try
            {
                var res = Http.PostAsync(Url + SyncKey, new StringContent(body, Encoding.UTF8, "application/json")).Result;
                if (!res.IsSuccessStatusCode) { foreach (var b in batch) queue.Enqueue(b); NinjaTrader.Code.Output.Process("SmartTradeSync: server said " + (int)res.StatusCode, PrintTo.OutputTab1); }
            }
            catch (Exception ex) { foreach (var b in batch) queue.Enqueue(b); NinjaTrader.Code.Output.Process("SmartTradeSync: " + ex.Message, PrintTo.OutputTab1); }
        }

        private static string Esc(string s) { return (s ?? "").Replace("\\\\", "\\\\\\\\").Replace("\\"", "\\\\\\""); }
    }
}
`;
}
