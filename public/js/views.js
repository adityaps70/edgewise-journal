// Pages and modals.
import {
  S, P, $, $$, esc, uid, num, sum, clamp, iso, today, addDays, parseISO, weekStart, monthKey, fmtDate, fmtDay, daysBetween,
  money, short, local, pct, tone, cur, sym, save, remove, saveProfile, MARKETS, EMOTIONS, MISTAKES, SESSIONS, DEFAULT_SETUPS,
  net, stats, groupBy, inRange, rangeFor, rMultiple, calcPnl, pointValue, sessionFromTime, accName, accById, isLive, accountMetrics,
  safeToRisk, missionMetrics, planMetrics, aiContext, md, icon, API, flush, wipeAll, tradingDaysBetween,
  FT, exitStats, passForecast, autoTags, runAgents, tagList, accCost, COST_FIELDS, TIMEFRAMES, EXIT_BEHAVIOR, edgeScore, zoneOf, durationMin, durationBucket, setupsOf, severeCombo, lateLoss, mastery, HOT,
  goalIdea,
} from './core.js?v=1a2e09d8';
import { enterPage, animateData, segInit, segSelect, openModal, closeModal, toast, flash, pop, shake, wobble, cardStack, countUp } from './motion.js?v=1a2e09d8';
import { equityChart, tubes, hbars, bindTips, drill as drillStore, radar, reg } from './charts.js?v=1a2e09d8';
const drillMap = () => drillStore;
import { slider, setSlider, liveRate, fxAgo, soundOn, setSound, refreshDate } from './ui.js?v=1a2e09d8';
import * as V3m from './views3.js?v=1a2e09d8';
import { catalog, firmById, planRules, defaultDaily, dailyCap, STAGE_LABEL, mono, firstStage, isInstant } from './firms.js?v=1a2e09d8';

let H = { go: () => {}, refresh: () => {}, rerenderShell: () => {} };
export const setHooks = (h) => (H = h);

const qty = () => MARKETS[(P().markets || ['futures'])[0]]?.qty || 'Qty';
const firstName = () => (P().name || S.user?.name || 'trader').split(' ')[0];
const hello = () => { const h = new Date().getHours(); return h < 5 ? 'Late session' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const cnt = (v, fmt = 'money', cls = '') => `<span class="num ${cls}" data-count="${Number(v) || 0}" data-fmt="${fmt}">${esc(window.__fmt[fmt](0))}</span>`;
const meter = (p, cls = '') => `<div class="meter ${cls}"><i data-w="${(clamp(p, 0, 1) * 100).toFixed(1)}%"></i></div>`;
const statusPill = (s) => ({ active: '<span class="pill pill--info"><span class="live" style="background:var(--info)"></span>Challenge</span>', funded: '<span class="pill pill--good"><span class="live"></span>Funded</span>', passed: '<span class="pill pill--accent">Passed</span>', failed: '<span class="pill pill--bad">Failed</span>', closed: '<span class="pill">Closed</span>' }[s] || `<span class="pill">${esc(s)}</span>`);
const setupIcons = ['target', 'bolt', 'flame', 'shield', 'flag', 'clock'];
const optionList = (arr, sel) => arr.map((v) => { const [val, lab] = Array.isArray(v) ? v : [v, v]; return `<option value="${esc(val)}" ${String(val) === String(sel ?? '') ? 'selected' : ''}>${esc(lab)}</option>`; }).join('');
const field = (label, inner, cls = '', hint = '') => `<label class="field ${cls}"><span>${label}</span>${inner}${hint ? `<em>${hint}</em>` : ''}</label>`;
const inp = (name, val = '', attrs = '') => `<input class="in" name="${name}" value="${esc(val ?? '')}" ${attrs}>`;
const formData = (root) => { const o = {}; $$('[name]', root).forEach((el) => { o[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); return o; };
const prefersStack = () => S.account.slice().sort((a, b) => (isLive(b) - isLive(a)) || ((b.purchaseDate || '').localeCompare(a.purchaseDate || '')));

function phead(eyebrow, title, sub, actions = '') {
  return `<div class="phead"><div class="phead__text"><div class="phead__eyebrow">${eyebrow}</div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="phead__actions">${actions}</div></div>`;
}
function card(title, sub, body, action = '', cls = '') {
  return `<section class="card ${cls}"><div class="chead"><div class="chead__text"><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div>${action}</div>${body}</section>`;
}
function after(el) { segAll(el); bindTips(el); }
function segAll(el) { $$('.seg', el).forEach(segInit); }
function segBind(el, sel, fn) {
  $$(sel + ' button', el).forEach((b) => b.addEventListener('click', () => { segSelect(b.parentElement, b); fn(b.dataset.v); }));
}

// ======================================================================= OVERVIEW
export function overview(el) {
  const all = FT(); const st = stats(all);
  const m = missionMetrics();
  const rT = (k) => sum(inRange(all, ...rangeFor(k)), net);
  const month = rT('month');
  const prevMonthStart = (() => { const d = parseISO(today()); d.setDate(1); d.setMonth(d.getMonth() - 1); return iso(d); })();
  const prevMonthEnd = addDays(today().slice(0, 8) + '01', -1);
  const prevMonth = sum(inRange(all, prevMonthStart, prevMonthEnd), net);
  const delta = prevMonth ? (month - prevMonth) / Math.abs(prevMonth) : null;

  const sub = m
    ? `${esc(m.name)}: ${money(m.actual)} of ${money(m.target)} paid out${m.pending ? `, ${money(m.pending)} pending` : ''}. ${m.tdLeft} trading day${m.tdLeft === 1 ? '' : 's'} left.`
    : st.n ? `${month >= 0 ? 'Up' : 'Down'} ${money(Math.abs(month))} this month across ${inRange(all, ...rangeFor('month')).length} trades.` : 'Log your first trade and the dashboard fills itself in.';
  const accs = prefersStack();

  // forecast: average daily P&L of last 20 trading days projected to mission end
  let forecast = null; const events = [];
  if (m && st.curve.length >= 3 && today() < m.end) {
    const recent = st.days.slice(-20); const avg = sum(recent, (d) => d.net) / recent.length;
    const n = Math.min(30, tradingDaysBetween(addDays(today(), 1), m.end));
    let eq = st.curve[st.curve.length - 1].eq; forecast = [];
    for (let i = 0; i < n; i++) { eq += avg; forecast.push({ eq }); }
  }
  S.payout.filter((p) => p.status === 'credited').forEach((p) => events.push({ date: p.creditDate || p.reqDate, label: `Payout ${money(p.amount)}`, color: 'var(--mint)' }));
  st.days.filter((d) => d.net === st.worstDay && d.net < 0).slice(0, 1).forEach((d) => events.push({ date: d.date, label: `Worst day ${money(d.net)}`, color: 'var(--warn)' }));

  // contributions by setup
  const bySetup = groupBy(inRange(all, ...rangeFor('month')).length ? inRange(all, ...rangeFor('month')) : all, (t) => setupsOf(t)[0] || 'No setup');
  const pos = bySetup.filter((r) => r.net > 0); const posTotal = sum(pos, (r) => r.net) || 1;
  const colors = ['var(--c2)', 'var(--c1)', 'var(--c6)', 'var(--c4)', 'var(--c3)', 'var(--c5)'];
  const totalN = sum(bySetup, (r) => r.n) || 1;
  const pace = (() => {
    const mt = inRange(all, ...rangeFor('month')); const days = new Set(mt.map((t) => t.date)).size;
    if (!days) return '';
    const tdMonth = tradingDaysBetween(today().slice(0, 8) + '01', (() => { const d = parseISO(today()); d.setMonth(d.getMonth() + 1, 0); return iso(d); })());
    const proj = (month / days) * tdMonth;
    return `<div class="note">${icon('info')}<span>At this pace the month ends near <b>${money(proj)}</b>${prevMonth ? ` — last month was ${money(prevMonth)}` : ''}.</span></div>`;
  })();

  el.innerHTML = `<div class="page">
  ${phead(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), `${hello()}, ${firstName()}`, sub,
    `<button class="btn" data-act="review">${icon('coach')}AI review</button><button class="btn" data-act="shot">${icon('image')}From screenshot</button><button class="btn btn--primary" data-act="log">${icon('plus')}Log trade</button>`)}
  <div class="grid g-ov">
    ${card('Accounts', accs.length ? 'Throw the top card aside, or tap it to flip' : 'Add your first account', `
      <div class="wallet"><div class="wallet__stack">${accs.map(accountCard).join('') || `<div class="empty">${icon('accounts')}<b>No accounts yet</b>Add a challenge, funded or personal account.</div>`}</div></div>
      ${accs.length ? `<div class="wallet__bar"><button class="ibtn" data-act="prev" aria-label="Previous">${icon('left')}</button><div class="wallet__dots">${accs.map((_, i) => `<i class="${i ? '' : 'is-on'}"></i>`).join('')}</div><button class="ibtn" data-act="next" aria-label="Next">${icon('right')}</button><span class="wallet__spacer"></span><button class="btn btn--sm" data-act="flip">${icon('refresh')}Rules</button></div>
      <div id="accDetail" style="margin-top:16px"></div>` : ''}`,
      `<button class="linkbtn" data-go="accounts">All accounts</button>`)}
    ${card('Net P&amp;L', `${st.n} trades · ${st.tradingDays} trading days`, `
      <div class="bal"><div class="bal__fig"><div class="bal__num">${cnt(st.total, 'moneySign', tone(st.total))}</div>
        <div class="bal__sub">${delta !== null ? `<span class="delta ${delta < 0 ? 'is-down' : ''}">${icon(delta < 0 ? 'down' : 'up')}${Math.abs(delta * 100).toFixed(1)}%</span> month vs last month` : `${local(st.total) ? `≈ ${local(st.total)}` : 'All time, after fees'}`}</div></div>
        <div class="pace">${[['Today', rT('today')], ['This week', rT('week')], ['This month', month], ['This year', rT('year')]].map(([l, v]) => `<div class="pace__item"><small>${l}</small><b class="${tone(v)}">${cnt(v, 'moneyShort')}</b></div>`).join('')}</div></div>
      <div style="margin-top:14px">${equityChart(st.curve, { h: 190, events, forecast, id: 'ov' })}</div>
      <div class="fc__key"><span><i class="ln" style="background:var(--chart)"></i>Equity</span>${forecast ? '<span><i class="ln" style="background:repeating-linear-gradient(90deg,var(--violet) 0 3px,transparent 3px 6px)"></i>Forecast</span>' : ''}<span><i style="background:var(--mint)"></i>Payout</span><span><i style="background:var(--warn)"></i>Worst day</span>${m ? `<span style="margin-left:auto">${fmtDate(m.end)} target <b>${money(m.target)}</b></span>` : ''}</div>`,
      `<button class="rbtn rbtn--plain" data-act="hide" aria-label="Hide numbers">${icon('shield')}</button>`)}
  </div>
  <div class="grid g-ov2" style="margin-top:var(--gap)">
    ${(() => { const ms = mastery(all); const sc = all.filter((t) => edgeScore(t) !== null); const avgE = sc.length ? sum(sc, edgeScore) / sc.length : null; const ex = all.filter((t) => t.exitBehavior); const planned = ex.length ? ex.filter((t) => t.exitBehavior === 'planned').length / ex.length : null; const wl = st.avgLoss ? st.avgWin / st.avgLoss : null;
      return `<section class="card"><div class="chead"><div class="chead__text"><h3>Trading mastery</h3><p>Five skills, each scored 0–100 from your own trades</p></div>${ms ? `<span class="mastery__score"><b>${cnt(ms.score, 'int')}</b><small>/100</small></span>` : ''}</div>
        <div class="mastery">${radar(ms)}<div class="mastery__tiles">
          <div class="pace__item"><small>Day win %</small><b>${cnt(st.dayWinRate, 'pct')}</b><em>${st.tradingDays} days</em></div>
          <div class="pace__item"><small>Avg win / loss</small><b>${wl ? wl.toFixed(2) : '—'}</b><em>${money(st.avgWin)} / ${money(st.avgLoss)}</em></div>
          <div class="pace__item" data-go="mindset" style="cursor:pointer"><small>Mindset score</small><b class="z-${avgE !== null ? zoneOf(avgE)[0] : ''}">${avgE !== null ? avgE.toFixed(1) : '—'}</b><em>${avgE !== null ? zoneOf(avgE)[1] : 'log emotions'}</em></div>
          <div class="pace__item"><small>Exits as planned</small><b>${planned !== null ? pct(planned) : '—'}</b><em>${ex.filter(lateLoss).length} late losses</em></div>
        </div></div></section>`; })()}
    ${m ? missionCard(m) : card('Risk today', 'Your personal limits', riskBody())}
  </div>
  <div class="grid" style="margin-top:var(--gap)">
    ${card('Daily P&amp;L', 'Winning days pull up, losing days pull down. Click a bar for its trades.', `<div id="tubesBox"></div>`, `<div class="seg seg--accent" id="tubeSeg"><button data-v="10" class="is-on">2 weeks</button><button data-v="22">Month</button><button data-v="q">Quarter</button></div>`)}
  </div>
  <div class="grid g-ov2" style="margin-top:var(--gap)">
    ${card(`Where ${new Date().toLocaleDateString('en-GB', { month: 'long' })}'s P&amp;L came from`, `${sum(bySetup, (r) => r.n)} trades by setup`, bySetup.length ? `
      <div class="split">${pos.map((r, i) => `<i class="split__seg" style="flex:${r.net / posTotal};background:${colors[i % colors.length]}" title="${esc(r.key)}"></i>`).join('') || '<i class="split__seg" style="flex:1;background:var(--card-3)"></i>'}</div>
      <div class="cats">${bySetup.slice(0, 6).map((r, i) => `<div class="cat" data-drill="${reg(r.list, r.key)}" style="cursor:pointer"><span class="prodico t${(i % 4) + 1} ${r.net < 0 ? 'is-loss' : ''}">${icon(setupIcons[i % setupIcons.length])}</span><span class="cat__name">${esc(r.key)}</span><span class="cat__pct">${pct(r.n / totalN)}</span><span class="cat__amt ${tone(r.net)}">${money(r.net, { sign: true })}</span></div>`).join('')}</div>
      <div style="margin-top:12px">${pace}</div>` : `<div class="empty">${icon('playbook')}<b>Tag trades with a setup</b>to see which ones pay you.</div>`, `<button class="linkbtn" data-go="analytics">Details</button>`)}
    ${card('Latest trades', 'Every account, newest first', tradeList(all.slice(-7).reverse()), `<button class="linkbtn" data-go="trades">See all</button>`)}
  </div>
  ${S.ai.configured ? `<section class="card" style="margin-top:var(--gap)"><div class="ai-insight"><span class="spark">${icon('coach')}</span><div style="flex:1"><div class="chead" style="margin:0 0 4px"><div class="chead__text"><h3>Coach's note</h3></div><button class="ibtn" data-act="insight" aria-label="Refresh">${icon('refresh')}</button></div><div class="ai-out" id="insight">${insightCache() || '<span class="muted">Tap refresh for a fresh read on your journal.</span>'}</div></div></div></section>` : ''}
  ${S.ai.configured ? '<section class="card" id="digest" style="margin-top:var(--gap)" hidden></section>' : ''}
  </div>`;

  // tubes with range switch
  const drawTubes = (v) => {
    const box = $('#tubesBox', el);
    let items;
    if (v === 'q') {
      const wk = groupBy(inRange(all, addDays(today(), -91), today()), (t) => weekStart(t.date)).sort((a, b) => a.key.localeCompare(b.key));
      items = wk.map((w) => ({ label: fmtDate(w.key), value: w.net, tip: 'Week of ' + fmtDate(w.key), sub: `${w.n} trades`, trades: w.list }));
    } else {
      items = st.days.slice(-Number(v)).map((d) => ({ label: parseISO(d.date).getDate() + '', value: d.net, tip: fmtDay(d.date), sub: `${d.n} trades`, on: d.date === today(), trades: all.filter((t) => t.date === d.date) }));
    }
    box.innerHTML = tubes(items, { h: 200 });
    animateData(box); bindTips(box);
  };
  drawTubes('10');
  segBind(el, '#tubeSeg', drawTubes);

  // card stack
  if (accs.length) {
    const showDetail = (i) => {
      const a = accs[i]; const x = accountMetrics(a); const box = $('#accDetail', el); if (!box) return;
      $$('.wallet__dots i', el).forEach((d, k) => d.classList.toggle('is-on', k === i));
      box.innerHTML = `<div class="row row--between" style="margin-bottom:8px"><span>${esc(a.name)} · ${x.target ? 'profit target' : 'P&L'}</span><span class="num"><b class="${tone(x.pnl)}">${money(x.pnl, { sign: true })}</b>${x.target ? ` <span class="muted">of ${money(x.target)}</span>` : ''}</span></div>
        ${x.target ? meter(x.progress) : ''}
        <div class="row" style="margin-top:12px;flex-wrap:wrap;gap:6px">${statusPill(a.status)}${x.buffer !== null ? `<span class="pill ${x.buffer < x.maxLoss * 0.3 ? 'pill--bad' : ''}">DD buffer ${money(x.buffer)}</span>` : ''}${x.dailyLeft !== null ? `<span class="pill">Daily left ${money(x.dailyLeft)}</span>` : ''}<span class="pill">${x.tradingDays}${a.minDays ? '/' + a.minDays : ''} days</span></div>`;
      animateData(box);
    };
    const stack = cardStack($('.wallet__stack', el), { onChange: showDetail });
    el.querySelector('[data-act="next"]').onclick = stack.next;
    el.querySelector('[data-act="prev"]').onclick = stack.prev;
    el.querySelector('[data-act="flip"]').onclick = stack.flip;
  }
  el.querySelector('[data-act="log"]').onclick = () => tradeModal(); { const b = el.querySelector('[data-act="shot"]'); if (b) b.onclick = () => tradeModal(null, {}, { shot: true }); }
  el.querySelector('[data-act="review"]').onclick = () => H.go('coach', { run: 'week' });
  el.querySelector('[data-act="hide"]').onclick = (e) => { el.classList.toggle('is-masked'); wobble(e.currentTarget); };
  import('./views3.js?v=1a2e09d8').then((V3) => V3.weeklyDigest($('#digest', el)));
  const ins = el.querySelector('[data-act="insight"]');
  if (ins) ins.onclick = async () => {
    const box = $('#insight', el); box.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; wobble(ins);
    try { const r = await API.ai({ mode: 'insight', context: aiContext() }); box.innerHTML = md(r.text); insightCache(md(r.text)); animateData(box); }
    catch (e) { box.innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
  };
  bindCommon(el);
  after(el);
}
const insightCache = (v) => { const k = 'ew_ins_' + today(); try { if (v) sessionStorage.setItem(k, v); return sessionStorage.getItem(k); } catch (e) { return null; } };

function accountCard(a, i) {
  const x = accountMetrics(a);
  const lo = x.buffer !== null ? x.pnl - x.buffer : -(num(a.maxLoss) || Math.max(1000, Math.abs(Math.min(0, x.pnl)) * 2));
  const hi = x.target || Math.max(x.pnl, num(a.maxLoss) || 1000, 1);
  const pos = clamp((x.pnl - lo) / ((hi - lo) || 1), 0, 1) * 100; const zero = clamp((0 - lo) / ((hi - lo) || 1), 0, 1) * 100;
  // equity sparkline for the background
  const days = groupBy(x.trades, (t) => t.date).sort((p, q) => p.key.localeCompare(q.key));
  let eq = num(a.startPnl); const pts = [eq, ...days.map((d) => (eq += d.net))];
  const mn = Math.min(...pts, lo); const mx = Math.max(...pts, hi);
  const spark = pts.length > 1 ? pts.map((v, k) => `${k ? 'L' : 'M'}${(k / (pts.length - 1) * 300).toFixed(1)},${(90 - (v - mn) / ((mx - mn) || 1) * 70).toFixed(1)}`).join('') : '';
  const stage = a.type === 'personal' ? 'Own capital' : a.status === 'failed' ? 'Breached' : a.status === 'passed' ? 'Passed' : a.type === 'funded' || a.stage === 'funded' ? 'Funded' : a.stage === 'verification' ? 'Verification' : 'Challenge';
  const plan = [a.firm || 'Personal', a.programId ? (firmById(a.firmId)?.programs.find((p) => p.id === a.programId)?.name || '') : '', a.size ? short(a.size) : ''].filter(Boolean).join(' · ');
  return `<div class="vcard" data-tone="${(i % 4) + 1}"><div class="vcard__flip">
    <div class="vcard__face">
      ${spark ? `<svg class="vcard__spark" viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true"><path d="${spark}L300,100L0,100Z" class="vcard__area"/><path d="${spark}" class="vcard__line"/></svg>` : ''}
      <div class="vcard__top"><span class="fmono">${esc(mono(a))}</span><div class="vcard__id"><b>${esc(a.name)}</b><small>${esc(plan)}</small></div><span class="vstage vstage--${stage.toLowerCase().replace(/\s/g, '')}">${stage}</span></div>
      <div class="vcard__pnl"><small>Account P&amp;L</small><b>${money(x.pnl, { sign: true })}</b><em>${x.target ? `${pct(Math.max(0, x.pnl) / x.target)} of ${money(x.target)} target${(() => { const f = a.status === 'active' ? passForecast(a, { runs: 800 }) : null; return f && !f.insufficient ? ` · <b title="Simulated from your own day-by-day results">${pct(f.pass)} pass odds</b>` : ''; })()}` : x.todayPnl ? `today ${money(x.todayPnl, { sign: true })}` : 'no target on this stage'}</em></div>
      <div class="ladder"><div class="ladder__track"><i class="ladder__fill" style="left:${Math.min(zero, pos)}%;width:${Math.abs(pos - zero)}%" data-neg="${x.pnl < 0 ? 1 : 0}"></i><span class="ladder__zero" style="left:${zero}%"></span><span class="ladder__dot" style="left:${pos}%"></span></div>
        <div class="ladder__lab"><span class="bad">${x.buffer !== null ? 'Breach ' + money(lo, { sign: true }) : '—'}</span><span>${x.target ? 'Target ' + money(hi, { sign: true }) : ''}</span></div></div>
      <div class="vcard__stats"><div><small>Daily left</small><b>${x.dailyLeft !== null ? money(x.dailyLeft) : '—'}</b></div><div><small>DD buffer</small><b>${x.buffer !== null ? money(x.buffer) : '—'}</b></div><div><small>Days</small><b>${x.tradingDays}${num(a.minDays) ? '/' + a.minDays : ''}</b></div></div>
    </div>
    <div class="vcard__face vcard__back">
      <div class="vcard__top"><span class="fmono">${esc(mono(a))}</span><div class="vcard__id"><b>Rules</b><small>${esc(plan)}</small></div></div>
      <div class="vcard__rules">
        <div><small>Profit target</small><b>${num(a.target) ? money(a.target) : '—'}</b></div>
        <div><small>Max loss · ${a.ddType === 'static' ? 'static' : 'trailing'}</small><b>${num(a.maxLoss) ? money(a.maxLoss) : '—'}</b></div>
        <div><small>Firm daily limit</small><b>${num(a.dailyLimit) ? money(a.dailyLimit) : 'None'}</b></div>
        <div><small>Your daily stop</small><b>${num(a.personalDaily) ? money(a.personalDaily) : '—'}</b></div>
        <div><small>Min trading days</small><b>${num(a.minDays) || '—'}</b></div>
        <div><small>Consistency</small><b>${num(a.consistency) ? a.consistency + '%' : '—'}</b></div>
      </div>
      <p class="vcard__hint">Tap to flip back</p>
    </div></div></div>`;
}
function missionCard(m) {
  return `<section class="card"><div class="chead"><div class="chead__text"><h3>${esc(m.name)}</h3><p>${fmtDate(m.start)} → ${fmtDate(m.end)} · ${m.tdTotal} trading days</p></div><button class="linkbtn" data-go="payouts">Payouts</button></div>
  <div class="row row--between" style="align-items:flex-end"><div><div class="bal__num" style="font-size:38px">${cnt(m.actual)}</div><div class="muted" style="font-size:var(--fs-md)">paid out of ${money(m.target)} ${m.actualLocal ? `· ${money(m.actualLocal, { c: P().local?.code || 'INR' })}` : local(m.actual) ? `· ${local(m.actual)}` : ''}</div></div>
  <span class="pill pill--accent">${pct(m.progress)} of goal</span></div>
  <div style="margin:14px 0 6px">${meter(m.progress, 'meter--lg')}</div>
  <div class="row row--between muted" style="font-size:var(--fs-xs);margin:10px 0 6px"><span>Time elapsed</span><span>${pct(m.elapsed)} · ${m.daysLeft} days left</span></div>
  ${meter(m.elapsed, m.elapsed > m.progress + 0.25 ? 'meter--warn' : '')}
  <div class="pace" style="margin-top:16px">
    <div class="pace__item"><small>Accounts bought</small><b>${cnt(m.costs, 'moneyShort')}</b></div>
    <div class="pace__item"><small>Pending payout</small><b>${cnt(m.pending, 'moneyShort')}</b></div>
    <div class="pace__item"><small>Real profit</small><b class="${tone(m.net)}">${cnt(m.net, 'moneyShort')}</b></div>
    <div class="pace__item"><small>Trading P&amp;L</small><b class="${tone(m.tradePnl)}">${cnt(m.tradePnl, 'moneyShort')}</b></div>
  </div></section>`;
}
function riskBody() {
  const r = safeToRisk();
  return `<div class="bal__num" style="font-size:38px">${r.amount !== null ? cnt(r.amount) : '—'}</div><p class="muted">left before your daily stop</p>${r.rule ? meter(r.amount / r.rule) : ''}<div class="pace" style="margin-top:14px"><div class="pace__item"><small>Today</small><b class="${tone(r.todayNet)}">${money(r.todayNet, { sign: true })}</b></div><div class="pace__item"><small>Trades</small><b>${r.tradesToday}${r.maxTrades ? '/' + r.maxTrades : ''}</b></div></div>`;
}

export function tradeList(list, { group = false } = {}) {
  if (!list.length) return `<div class="empty">${icon('trades')}<b>No trades yet</b>Hit “Log trade” after your next one.</div>`;
  let out = ''; let last = null;
  list.forEach((t) => {
    if (group && t.date !== last) {
      const dayNet = sum(list.filter((x) => x.date === t.date), net);
      out += `<div class="daygroup"><span>${esc(fmtDay(t.date))}</span><span class="${tone(dayNet)}">${money(dayNet, { sign: true })}</span></div>`; last = t.date;
    }
    const n = net(t); const r = rMultiple(t); const broke = t.followedPlan === false || (t.mistakes || []).some((m) => m !== 'None');
    out += `<div class="txrow" data-trade="${t.id}"><span class="prodico ${n < 0 ? 'is-loss' : ''}">${icon(t.side === 'Short' ? 'short' : 'long')}</span>
      <span class="cell__text"><b>${esc(t.symbol || '—')} <span class="muted" style="font-weight:500">${esc(t.side || '')} ${t.qty ? '× ' + esc(t.qty) : ''}</span></b><small>${group ? '' : esc(fmtDay(t.date)) + (t.time ? ', ' : ' · ')}${esc(t.time || '')}${t.setup ? ' · ' + esc(t.setup) : ''} · ${esc(accName(t.accountId))}</small></span>
      ${broke ? '<span class="pill pill--warn"><span class="live" style="background:var(--warn)"></span>Rule break</span>' : ''}${r !== null ? `<span class="pill">${r >= 0 ? '+' : ''}${r.toFixed(1)}R</span>` : ''}
      <span class="amt ${tone(n)}">${money(n, { sign: true })}</span></div>`;
  });
  return `<div class="txlist">${out}</div>`;
}
function bindCommon(el) {
  $$('[data-go]', el).forEach((b) => (b.onclick = () => H.go(b.dataset.go)));
  $$('[data-trade]', el).forEach((r) => (r.onclick = () => tradeModal(S.trade.find((t) => t.id === r.dataset.trade))));
}

// ======================================================================= TRADES
const TF = { range: 'all', account: '', q: '', outcome: '' };
export function setTradeQuery(q) { TF.q = q; }
export function trades(el) {
  const draw = () => {
    let list = inRange(FT(), ...rangeFor(TF.range));
    if (TF.account) list = list.filter((t) => t.accountId === TF.account);
    if (TF.outcome === 'win') list = list.filter((t) => net(t) > 0);
    if (TF.outcome === 'loss') list = list.filter((t) => net(t) < 0);
    if (TF.outcome === 'broke') list = list.filter((t) => t.followedPlan === false || (t.mistakes || []).some((m) => m !== 'None'));
    if (TF.q) { const q = TF.q.toLowerCase(); list = list.filter((t) => [t.symbol, t.setup, t.notes, t.tags, t.emotion, accName(t.accountId)].join(' ').toLowerCase().includes(q)); }
    const st = stats(list);
    $('#tSum', el).innerHTML = `<div class="grid g-4">${[['Net P&L', st.total, 'moneySign', tone(st.total)], ['Win rate', st.winRate, 'pct', ''], ['Profit factor', Number.isFinite(st.pf) ? st.pf : 99, 'dec', ''], ['Avg trade', st.expectancy, 'moneySign', tone(st.expectancy)]]
      .map(([l, v, f, c]) => `<div class="kpi"><small>${l}</small><b class="${c}">${cnt(v, f)}</b><em>${l === 'Win rate' ? `${st.wins}W · ${st.losses}L · ${st.be}BE` : l === 'Net P&L' ? `${st.n} trades · fees ${money(st.fees)}` : l === 'Profit factor' ? `avg win ${money(st.avgWin)} / loss ${money(st.avgLoss)}` : st.avgR !== null ? `avg ${st.avgR.toFixed(2)}R` : 'per trade'}</em></div>`).join('')}</div>`;
    const rows = list.slice().reverse();
    $('#tTable', el).innerHTML = rows.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Date</th><th>Symbol</th><th>Side</th><th class="r">${esc(qty())}</th><th class="r">Entry</th><th class="r">Exit</th><th>Setup</th><th>Grade</th><th>Account</th><th>Emotion</th><th class="r">R</th><th class="r">Net</th></tr></thead><tbody>
      ${rows.slice(0, 400).map((t) => { const n = net(t); const r = rMultiple(t); return `<tr data-trade="${t.id}"><td>${esc(fmtDate(t.date))} <span class="muted">${esc(t.time || '')}</span></td><td><b>${esc(t.symbol)}</b></td><td><span class="pill ${t.side === 'Short' ? 'pill--warn' : 'pill--info'}">${esc(t.side || '')}</span></td><td class="r">${esc(t.qty || '')}</td><td class="r">${esc(t.entry || '')}</td><td class="r">${esc(t.exit || '')}</td><td>${esc(t.setup || '—')}</td><td>${t.grade ? `<span class="gtag g-${t.grade === 'A+' ? 'a' : t.grade.toLowerCase()}">${esc(t.grade)}</span>` : '—'}</td><td>${esc(accName(t.accountId))}</td><td>${esc(t.emotion || '—')}</td><td class="r">${r !== null ? r.toFixed(2) : '—'}</td><td class="r amt ${tone(n)}">${money(n, { sign: true })}</td></tr>`; }).join('')}
      </tbody><tfoot><tr><td colspan="11">${rows.length} trades</td><td class="r ${tone(st.total)}">${money(st.total, { sign: true })}</td></tr></tfoot></table></div>`
      : `<div class="empty">${icon('trades')}<b>No trades match</b>Change the filters or log a trade.</div>`;
    animateData(el); bindCommon(el);
  };
  el.innerHTML = `<div class="page">${phead('Every fill, every lesson', 'Trades', 'Your full trade log. Click a row to edit it, add the chart, or ask the coach to grade it.', `<button class="btn" data-act="csv">${icon('upload')}Import</button><button class="btn" data-act="shot">${icon('image')}From screenshot</button><button class="btn btn--primary" data-act="log">${icon('plus')}Log trade</button>`)}
    <div class="toolbar"><div class="seg" id="rSeg">${[['all', 'All'], ['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['90d', '90 days']].map(([v, l]) => `<button data-v="${v}" class="${TF.range === v ? 'is-on' : ''}">${l}</button>`).join('')}</div>
      <select class="in" style="width:auto" id="fAcc"><option value="">All accounts</option>${optionList(S.account.map((a) => [a.id, a.name]), TF.account)}</select>
      <select class="in" style="width:auto" id="fOut">${optionList([['', 'All outcomes'], ['win', 'Winners'], ['loss', 'Losers'], ['broke', 'Rule breaks']], TF.outcome)}</select>
      <input class="in search-in" id="fQ" placeholder="Symbol, setup, note…" value="${esc(TF.q)}"></div>
    <div id="tSum"></div>
    <section class="card" style="margin-top:var(--gap)"><div id="tTable"></div></section></div>`;
  segBind(el, '#rSeg', (v) => { TF.range = v; draw(); });
  $('#fAcc', el).onchange = (e) => { TF.account = e.target.value; draw(); };
  $('#fOut', el).onchange = (e) => { TF.outcome = e.target.value; draw(); };
  $('#fQ', el).oninput = (e) => { TF.q = e.target.value; draw(); };
  el.querySelector('[data-act="log"]').onclick = () => tradeModal(); { const b = el.querySelector('[data-act="shot"]'); if (b) b.onclick = () => tradeModal(null, {}, { shot: true }); }
  el.querySelector('[data-act="csv"]').onclick = () => import('./views4.js?v=1a2e09d8').then((V4) => V4.importModal());
  draw(); after(el);
}

// ======================================================================= TRADE MODAL
export function tradeModal(t0, preset = {}, opts = {}) {
  const isNew = !t0;
  const t = t0 ? JSON.parse(JSON.stringify(t0)) : { date: today(), time: new Date().toTimeString().slice(0, 5), side: 'Long', accountId: (S.account.find(isLive) || S.account[0] || {}).id, mistakes: [], followedPlan: true, rating: 0, ...preset };
  const setups = S.setup.map((s) => s.name);
  const instruments = P().instruments || [];
  const body = `
  <div class="tabs" id="tTabs"><button class="is-on" data-tab="a">Trade</button><button data-tab="b">Psychology</button><button data-tab="c">Notes &amp; chart</button><button data-tab="d">${icon('coach')} AI review</button><button data-tab="e">${icon('play')} Replay</button></div>
  <div data-pane="a">${isNew ? `<div class="snap" id="snap"><span class="snap__ic">${icon('image')}</span><div class="snap__t"><b>Log it from a screenshot</b><span>Drop, paste (⌘V) or choose a screenshot of the trade: your platform's fills, positions or a chart with entry and exit. Claude fills the form in and you check it.</span></div><input type="file" accept="image/*" id="snapFile" hidden><button type="button" class="btn btn--sm" id="snapPick">${icon('upload')}Choose</button></div>` : ''}<div class="form">
    ${field('Date', inp('date', t.date, 'type="date"'))}${field('Entry time', inp('time', t.time, 'type="time"'))}${field('Exit time', inp('exitTime', t.exitTime, 'type="time"'), '', '<span id="durHint"></span>')}
    ${field('Account', `<select class="in" name="accountId">${optionList(S.account.map((a) => [a.id, a.name]), t.accountId)}<option value="">No account</option></select>`)}
    ${field('Symbol', inp('symbol', t.symbol, `list="symList" placeholder="${esc(instruments[0] || 'NQ')}" autocomplete="off"`))}
    ${field('Side', `<div class="seg seg--accent" id="sideSeg"><button type="button" data-v="Long" class="${t.side !== 'Short' ? 'is-on' : ''}">Long</button><button type="button" data-v="Short" class="${t.side === 'Short' ? 'is-on' : ''}">Short</button></div>`)}
    ${field(esc(qty()), inp('qty', t.qty, 'type="number" step="any" inputmode="decimal"'))}${field('Fees', inp('fees', t.fees, 'type="number" step="any" inputmode="decimal" placeholder="0"'))}
    ${field('Entry', inp('entry', t.entry, 'type="number" step="any" inputmode="decimal"'))}${field('Exit', inp('exit', t.exit, 'type="number" step="any" inputmode="decimal"'))}
    ${field('Stop', inp('stop', t.stop, 'type="number" step="any" inputmode="decimal"'))}${field('Target', inp('target', t.target, 'type="number" step="any" inputmode="decimal"'))}
    ${field(`P&amp;L (${esc(cur())})`, inp('pnl', t.pnl, 'type="number" step="any" inputmode="decimal" placeholder="auto"'), '', '<span id="pnlHint"></span>')}
    ${field('R multiple', inp('r', t.r, 'type="number" step="any" placeholder="auto"'), '', '<span id="rHint"></span>')}
    ${field('Worst open P&amp;L <em class="muted" style="font-style:normal">MAE</em>', inp('mae', t.mae, 'type="number" step="any" placeholder="e.g. -180"'), '', 'deepest it went against you')}
    ${field('Best open P&amp;L <em class="muted" style="font-style:normal">MFE</em>', inp('mfe', t.mfe, 'type="number" step="any" placeholder="e.g. 420"'), '', 'most it was up before you exited')}
    ${field('Session', `<select class="in" name="session"><option value="">auto</option>${optionList(SESSIONS, t.session)}</select>`)}
    ${field('Entry timeframe', `<select class="in" name="tf"><option value="">—</option>${optionList(TIMEFRAMES, t.tf)}</select>`)}
    <div class="field full"><span>Setups <em class="muted" style="font-style:normal;font-weight:500">first one is the entry setup; add others as confirmation</em></span><div class="chips" id="setC">${[...new Set([...setups, ...setupsOf(t)])].map((n) => `<button type="button" class="chip ${setupsOf(t).includes(n) ? 'is-on' : ''}" data-v="${esc(n)}">${esc(n)}${setupsOf(t)[0] === n ? ' <i class="prim">entry</i>' : ''}</button>`).join('')}<button type="button" class="chip chip--add" id="setAdd">${icon('plus')} New setup</button></div></div>
    ${field('Setup grade', `<div class="chips gradechips" id="gradeC">${['A+', 'B', 'C'].map((g) => `<button type="button" class="chip g-chip g-${g === 'A+' ? 'a' : g.toLowerCase()} ${t.grade === g ? 'is-on' : ''}" data-v="${g}">${g}</button>`).join('')}</div>`, 'half', '<span id="gradeHint"></span>')}
    ${field('Trend alignment', `<div class="seg" id="trendSeg">${[['with', 'With trend'], ['counter', 'Counter'], ['range', 'Range']].map(([v, l]) => `<button type="button" data-v="${v}" class="${t.trend === v ? 'is-on' : ''}">${l}</button>`).join('')}</div>`, 'half')}
  </div><datalist id="symList">${instruments.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
  <div data-pane="b" hidden><div class="stack">
    <div class="field"><span>How did you feel going in?</span><div class="chips" id="emo">${EMOTIONS.map((e) => `<button type="button" class="chip ${t.emotion === e ? 'is-on' : ''}" data-v="${e}">${e}</button>`).join('')}</div></div>
    <div class="grid g-2" style="gap:12px">
      <div class="field"><span>How did you exit?</span><div class="seg" id="exitSeg">${EXIT_BEHAVIOR.map(([v, l]) => `<button type="button" data-v="${v}" class="${t.exitBehavior === v ? 'is-on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="field"><span>Detached from the outcome?</span><div class="seg" id="neutSeg"><button type="button" data-v="yes" class="${t.neutral === true ? 'is-on' : ''}">Yes</button><button type="button" data-v="no" class="${t.neutral === false ? 'is-on' : ''}">No, it got to me</button></div></div>
    </div>
    <div class="field"><span>Mistakes</span><div class="chips" id="mis">${MISTAKES.map((m) => `<button type="button" class="chip ${(t.mistakes || []).includes(m) ? 'is-on' : ''}" data-v="${m}">${m}</button>`).join('')}</div></div>
    ${S.rule.length ? `<div class="field"><span>Rules checklist</span><div class="chips" id="rulesChk">${S.rule.map((r) => `<button type="button" class="chip ${(t.rulesOk || []).includes(r.id) ? 'is-on' : ''}" data-v="${r.id}">${esc(r.text)}</button>`).join('')}</div></div>` : ''}
    <div class="row row--between"><span class="field"><span>Followed my plan</span></span><button type="button" class="switch ${t.followedPlan !== false ? 'is-on' : ''}" id="plan" aria-label="Followed plan"></button></div>
    <div class="row row--between"><div class="field"><span>Execution rating</span><div class="stars" id="stars">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-v="${i}" class="${i <= (t.rating || 0) ? 'is-on' : ''}" aria-label="${i} stars">${icon('star')}</button>`).join('')}</div></div><div class="mscore" id="mscore"></div></div>
  </div></div>
  <div data-pane="c" hidden><div class="stack">
    ${(S.mentorNotes || []).filter((n) => n.trade_id && n.trade_id === t.id).map((n) => `<div class="mnote"><span class="av" style="width:32px;height:32px;font-size:12px">${esc((n.author || 'M').slice(0, 1).toUpperCase())}</span><div><b>${esc(n.author || 'Mentor')}</b><small> · ${esc(fmtDate(new Date(n.created_at).toISOString().slice(0, 10)))}</small><p>${esc(n.text)}</p></div></div>`).join('')}
    <div class="grid g-3" style="gap:12px">
    ${field('Pre-trade plan', `<textarea class="in" name="notePlan" rows="4" placeholder="What did you expect, and why this level?">${esc(t.notePlan || '')}</textarea>`)}
    ${field('Execution', `<textarea class="in" name="noteExec" rows="4" placeholder="How did the entry, management and exit actually go?">${esc(t.noteExec || '')}</textarea>`)}
    ${field('Lesson', `<textarea class="in" name="noteLesson" rows="4" placeholder="What will you repeat or change?">${esc(t.noteLesson || '')}</textarea>`)}
    </div>
    ${field('Other notes', `<textarea class="in" name="notes" rows="2">${esc(t.notes || '')}</textarea>`)}
    ${field('Tags', inp('tags', t.tags, 'placeholder="news, scaled out, best trade"'))}
    <div class="drop" id="drop">${icon('image')}<div style="flex:1"><b>Chart screenshot</b><span class="muted" style="font-size:var(--fs-sm)">Drop, paste (⌘V) or choose an image. The coach can read it.</span></div><input type="file" accept="image/*" id="file" hidden><button type="button" class="btn btn--sm" id="pick">Choose</button></div>
    <div id="shotBox"></div>
  </div></div>
  <div data-pane="e" hidden><div id="replayBox"></div></div>
  <div data-pane="d" hidden><div class="stack">
    ${S.ai.configured ? '' : '<div class="note">' + icon('info') + '<span>AI isn\'t switched on for this workspace yet. Add the <b>ANTHROPIC_API_KEY</b> secret in Cloudflare (see Settings).</span></div>'}
    <div class="row" style="flex-wrap:wrap"><button type="button" class="btn btn--primary" id="aiGrade">${icon('coach')}Grade this trade</button><button type="button" class="btn" id="aiChart">${icon('image')}Read the chart</button></div>
    <div class="ai-out" id="aiOut">${t.aiReview ? md(t.aiReview) : '<span class="muted">The coach checks the trade against your rules, playbook and recent history.</span>'}</div>
  </div></div>`;
  const foot = `${isNew ? '' : `<button class="btn btn--ghost btn--danger" data-act="del">${icon('trash')}Delete</button><span style="flex:1"></span><button class="btn" data-act="dup">Duplicate</button>`}<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="save">${icon('check')}${isNew ? 'Save trade' : 'Save changes'}</button>`;
  const m = modal(isNew ? 'Log a trade' : `${t.symbol || 'Trade'} · ${fmtDate(t.date)}`, body, foot, 'modal');

  const read = () => {
    const f = formData(m.el);
    Object.assign(t, f);
    t.side = $('#sideSeg .is-on', m.el)?.dataset.v || 'Long';
    t.emotion = $('#emo .is-on', m.el)?.dataset.v || '';
    t.grade = $('#gradeC .is-on', m.el)?.dataset.v || '';
    t.setups = setOrder.slice(); t.setup = t.setups[0] || '';
    t.trend = $('#trendSeg .is-on', m.el)?.dataset.v || '';
    t.exitBehavior = $('#exitSeg .is-on', m.el)?.dataset.v || '';
    const nv = $('#neutSeg .is-on', m.el)?.dataset.v; t.neutral = nv === 'yes' ? true : nv === 'no' ? false : undefined;
    t.mistakes = $$('#mis .is-on', m.el).map((b) => b.dataset.v);
    t.rulesOk = $$('#rulesChk .is-on', m.el).map((b) => b.dataset.v);
    t.followedPlan = $('#plan', m.el).classList.contains('is-on');
    t.rating = $$('#stars .is-on', m.el).length;
    t.symbol = (t.symbol || '').toUpperCase().trim();
    if (!t.session) t.session = sessionFromTime(t.time);
    if (t.pnl === '' || t.pnl === undefined) { const c = calcPnl(t); t.pnl = c !== null ? c : ''; }
    return t;
  };
  const hint = () => {
    const f = formData(m.el); f.side = $('#sideSeg .is-on', m.el)?.dataset.v; f.symbol = (f.symbol || '').toUpperCase();
    const c = calcPnl(f); const pv = pointValue(f.symbol);
    $('#pnlHint', m.el).textContent = c !== null ? `auto: ${money(c, { sign: true })}` : pv ? '' : f.symbol ? 'enter P&L (unknown point value)' : '';
    const tt = { ...f, grade: $('#gradeC .is-on', m.el)?.dataset.v, pnl: f.pnl !== '' ? f.pnl : c ?? 0 }; const r = f.r === '' ? rMultiple({ ...tt, r: undefined }) : null;
    $('#rHint', m.el).textContent = r !== null && f.r === '' ? `auto: ${r.toFixed(2)}R` : '';
  };
  m.el.addEventListener('input', hint);
  segInit($('#sideSeg', m.el)); segBind(m.el, '#sideSeg', hint);
  // optional single-choice segs (click again to clear)
  ['#trendSeg', '#exitSeg', '#neutSeg'].forEach((id) => { const sg = $(id, m.el); segInit(sg); $$('button', sg).forEach((b) => b.onclick = () => { const on = b.classList.contains('is-on'); $$('button', sg).forEach((x) => x.classList.remove('is-on')); if (!on) b.classList.add('is-on'); sg.__place?.(true); mScore(); }); });
  let setOrder = setupsOf(t).slice();
  const drawSetups = () => $$('#setC .chip:not(.chip--add)', m.el).forEach((c) => { const i = setOrder.indexOf(c.dataset.v); c.classList.toggle('is-on', i >= 0); c.innerHTML = esc(c.dataset.v) + (i === 0 ? ' <i class="prim">entry</i>' : i > 0 ? ' <i class="prim prim--c">confirm</i>' : ''); });
  const bindSetup = (c) => c.onclick = () => { const v = c.dataset.v; const i = setOrder.indexOf(v); if (i >= 0) setOrder.splice(i, 1); else setOrder.push(v); drawSetups(); pop(c); };
  $$('#setC .chip:not(.chip--add)', m.el).forEach(bindSetup);
  $('#setAdd', m.el).onclick = (e) => { const b = e.currentTarget; const input = document.createElement('input'); input.className = 'in'; input.style.cssText = 'width:190px;height:34px;border-radius:99px'; input.placeholder = 'Setup name, Enter'; b.before(input); input.focus(); input.onkeydown = (ev) => { if (ev.key === 'Enter' && input.value.trim()) { ev.preventDefault(); const v = input.value.trim(); if (!S.setup.some((x) => x.name === v)) save('setup', { name: v }); const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.dataset.v = v; b.before(c); bindSetup(c); setOrder.push(v); input.remove(); drawSetups(); } if (ev.key === 'Escape') input.remove(); }; };
  drawSetups();
  const mScore = () => { const tmp = { ...t, emotion: $('#emo .is-on', m.el)?.dataset.v, exitBehavior: $('#exitSeg .is-on', m.el)?.dataset.v, mistakes: $$('#mis .is-on', m.el).map((b) => b.dataset.v), followedPlan: $('#plan', m.el).classList.contains('is-on') }; const nv = $('#neutSeg .is-on', m.el)?.dataset.v; tmp.neutral = nv === 'yes' ? true : nv === 'no' ? false : undefined; const f = formData(m.el); tmp.pnl = f.pnl !== '' ? f.pnl : calcPnl({ ...f, side: $('#sideSeg .is-on', m.el)?.dataset.v }) ?? 0; const sc = edgeScore(tmp); const z = sc === null ? null : zoneOf(sc); $('#mscore', m.el).innerHTML = sc === null ? '<small>Mindset score</small><b>—</b>' : `<small>Mindset score</small><b class="z-${z[0]}">${sc.toFixed(1)}</b><em>${z[1]}</em>`; };
  m.el.addEventListener('click', () => setTimeout(mScore));
  const durHint = () => { const f = formData(m.el); const d = durationMin({ date: f.date, time: f.time, exitTime: f.exitTime }); $('#durHint', m.el).textContent = d !== null ? `held ${d < 60 ? Math.round(d) + ' min' : (d / 60).toFixed(1) + ' h'}` : ''; };
  m.el.addEventListener('input', durHint); durHint(); setTimeout(mScore);
  $$('#tTabs button', m.el).forEach((b) => b.onclick = () => { $$('#tTabs button', m.el).forEach((x) => x.classList.toggle('is-on', x === b)); $$('[data-pane]', m.el).forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab)); const pane = $(`[data-pane="${b.dataset.tab}"]`, m.el); if (b.dataset.tab === 'e') { read(); import('./views4.js?v=1a2e09d8').then((V4) => V4.replay($('#replayBox', m.el), { ...t }, { onExcursion: ({ mae, mfe }) => { $('[name="mae"]', m.el).value = mae; $('[name="mfe"]', m.el).value = mfe; } })); } if (window.gsap) window.gsap.fromTo(pane, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }); });
  const gHint = () => { const g = $('#gradeC .is-on', m.el)?.dataset.v; const bg = P().risk?.byGrade; $('#gradeHint', m.el).textContent = g && bg && num(bg[g]) ? `your ${g} risk: ${money(bg[g])}` : g ? '' : 'A+ high conviction · B normal · C low probability'; };
  $$('#gradeC .chip', m.el).forEach((c) => c.onclick = () => { const on = c.classList.contains('is-on'); $$('#gradeC .chip', m.el).forEach((x) => x.classList.remove('is-on')); if (!on) c.classList.add('is-on'); pop(c); gHint(); hint(); });
  gHint();
  $$('#emo .chip', m.el).forEach((c) => c.onclick = () => { $$('#emo .chip', m.el).forEach((x) => x.classList.toggle('is-on', x === c && !c.classList.contains('is-on'))); pop(c); });
  $$('#mis .chip, #rulesChk .chip', m.el).forEach((c) => c.onclick = () => { c.classList.toggle('is-on'); pop(c); if (c.dataset.v === 'None' && c.classList.contains('is-on')) $$('#mis .chip', m.el).forEach((x) => x !== c && x.classList.remove('is-on')); else if (c.closest('#mis')) $('#mis [data-v="None"]', m.el)?.classList.remove('is-on'); });
  $('#plan', m.el).onclick = (e) => e.currentTarget.classList.toggle('is-on');
  $$('#stars button', m.el).forEach((b) => b.onclick = () => { const v = +b.dataset.v; $$('#stars button', m.el).forEach((x) => x.classList.toggle('is-on', +x.dataset.v <= v)); pop(b); });
  // screenshot
  const shotBox = $('#shotBox', m.el);
  const showShot = (src) => { shotBox.innerHTML = src ? `<img class="shot" src="${src}" alt="Chart screenshot"><div class="row" style="margin-top:8px"><button type="button" class="btn btn--sm btn--ghost btn--danger" id="rmShot">${icon('trash')}Remove</button></div>` : ''; const rm = $('#rmShot', m.el); if (rm) rm.onclick = () => { t.imageId = ''; t.imageData = ''; t._img = ''; showShot(''); }; };
  if (t.imageData) showShot(t.imageData);
  else if (t.imageId) { shotBox.innerHTML = '<span class="muted">Loading chart…</span>'; API.getImage(t.imageId).then((r) => { t._img = r.data; showShot(r.data); }).catch(() => (shotBox.innerHTML = '')); }
  const handleFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const data = await compressImage(file);
    t._img = data; showShot(data);
    if (S.local) t.imageData = data;
    else { try { const r = await API.image(data); t.imageId = r.id; toast('Chart attached', icon('check')); } catch (e) { toast(e.message, icon('info')); } }
  };
  $('#pick', m.el).onclick = () => $('#file', m.el).click();
  $('#file', m.el).onchange = (e) => handleFile(e.target.files[0]);
  const drop = $('#drop', m.el);
  drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; };
  drop.ondragleave = () => (drop.style.borderColor = '');
  drop.ondrop = (e) => { e.preventDefault(); drop.style.borderColor = ''; handleFile(e.dataTransfer.files[0]); };
  m.el.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])][0]; if (!f) return; if (isNew && $('#snap', m.el) && !$('[data-pane="c"]', m.el).offsetParent) readShot(f); else handleFile(f); });
  // ---- log from a screenshot: Claude reads the fills, the form is filled in, the trader checks and saves
  const SET = (name, v) => { const i = $(`[name="${name}"]`, m.el); if (!i || v === null || v === undefined || v === '') return false; i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); refreshDate(i); i.classList.add('is-ai'); if (i.__dpBtn) { i.__dpBtn.classList.add('is-ai'); setTimeout(() => i.__dpBtn.classList.remove('is-ai'), 2600); } setTimeout(() => i.classList.remove('is-ai'), 2600); return true; };
  const matchAccount = (name) => { if (!name) return null; const n = String(name).toLowerCase().replace(/[^a-z0-9]/g, ''); if (!n) return null; return S.account.find((a) => [a.brokerAccount, a.name].filter(Boolean).some((x) => { const y = String(x).toLowerCase().replace(/[^a-z0-9]/g, ''); return y && (y === n || y.includes(n) || n.includes(y)); })) || null; };
  const fillFrom = (x) => {
    if (x.side) { const b = $(`#sideSeg [data-v="${/short|sell/i.test(x.side) ? 'Short' : 'Long'}"]`, m.el); if (b && !b.classList.contains('is-on')) b.click(); }
    const acc = matchAccount(x.account); if (acc) SET('accountId', acc.id);
    ['date', 'time', 'exitTime', 'symbol', 'qty', 'entry', 'exit', 'stop', 'target', 'fees'].forEach((k) => SET(k, x[k]));
    if (x.pnl !== null && x.pnl !== undefined && x.pnl !== '') SET('pnl', x.pnl); else { const i = $('[name="pnl"]', m.el); if (i) i.value = ''; }
    hint();
  };
  const blank = (x) => ({ date: today(), time: '', side: 'Long', accountId: t.accountId, mistakes: [], followedPlan: true, rating: 0, ...Object.fromEntries(Object.entries(x).filter(([, v]) => v !== null && v !== undefined && v !== '')), side: /short|sell/i.test(x.side || '') ? 'Short' : 'Long', accountId: matchAccount(x.account)?.id || t.accountId, source: 'screenshot' });
  const readShot = async (file) => {
    const box = $('#snap', m.el); if (!box || !file || !file.type.startsWith('image/')) return;
    if (S.local || !S.ai.configured) { toast(S.local ? 'Sign in to read trades from screenshots' : 'AI is not switched on yet', icon('info')); return; }
    box.classList.add('is-busy'); $('.snap__t', box).innerHTML = '<b>Reading your screenshot…</b><span><span class="typing"><i></i><i></i><i></i></span></span>';
    try {
      const img = await compressImage(file, 1800, 0.82);
      handleFile(file); // keep the screenshot on the trade as its chart
      const ctx = `Today is ${today()}. The trader's instruments: ${(P().instruments || []).join(', ') || 'unknown'}. Their accounts: ${S.account.map((a) => a.name + (a.brokerAccount ? ' (' + a.brokerAccount + ')' : '')).join('; ') || 'none'}. Account currency: ${cur()}.`;
      const r = await API.ai({ mode: 'readtrade', image: img, messages: [{ role: 'user', content: ctx + '\nRead the trade(s) in this screenshot.' }] });
      const j = JSON.parse((r.text.match(/\{[\s\S]*\}/) || ['{}'])[0]);
      const list = (j.trades || []).filter((x) => x && (x.symbol || x.entry || x.pnl !== undefined));
      if (!list.length) throw new Error(j.notes || 'No trade found in that screenshot. Try one that shows the fills or the P&L.');
      fillFrom(list[0]);
      const note = [j.confidence && j.confidence !== 'high' ? `Confidence: ${esc(j.confidence)}.` : '', j.notes ? esc(j.notes) : ''].filter(Boolean).join(' ');
      box.classList.remove('is-busy'); box.classList.add('is-done');
      $('.snap__t', box).innerHTML = `<b>${list.length > 1 ? `Found ${list.length} trades. Showing the first; pick another or add them all.` : 'Filled in from your screenshot. Check the highlighted fields, then save.'}</b>${note ? `<span>${note}</span>` : ''}${list.length > 1 ? `<div class="snap__pick">${list.map((x, i) => `<button type="button" class="chip ${i ? '' : 'is-on'}" data-sn="${i}">${esc(x.symbol || 'Trade')} ${x.side ? esc(/short|sell/i.test(x.side) ? 'S' : 'L') : ''}${x.pnl !== null && x.pnl !== undefined ? ' · ' + money(+x.pnl, { sign: true }) : ''}</button>`).join('')}<button type="button" class="btn btn--sm btn--primary" data-snall>${icon('plus')}Add all ${list.length}</button></div>` : ''}`;
      $$('[data-sn]', box).forEach((b) => (b.onclick = () => { $$('[data-sn]', box).forEach((x) => x.classList.toggle('is-on', x === b)); fillFrom(list[+b.dataset.sn]); }));
      const all = $('[data-snall]', box);
      if (all) all.onclick = () => {
        const bad = list.filter((x) => !x.symbol || (x.pnl === null || x.pnl === undefined) && !(x.entry && x.exit && x.qty));
        if (bad.length) { toast(`${bad.length} of them miss a symbol or P&L. Fill those one at a time.`, icon('info'), 4); return; }
        list.forEach((x) => { const tr = blank(x); if (tr.pnl === undefined) { const pv = pointValue(tr.symbol); if (pv) tr.pnl = +(((tr.side === 'Short' ? -1 : 1) * (tr.exit - tr.entry)) * tr.qty * pv).toFixed(2); } save('trade', tr); });
        m.close(); H.refresh(); toast(`${list.length} trades added from your screenshot. Open any of them to edit.`, icon('check'), 4);
      };
    } catch (e) {
      box.classList.remove('is-busy'); $('.snap__t', box).innerHTML = `<b>Couldn't read that one</b><span class="bad">${esc(e.message)}</span>`;
    }
  };
  if (isNew && $('#snap', m.el)) {
    $('#snapPick', m.el).onclick = () => $('#snapFile', m.el).click();
    $('#snapFile', m.el).onchange = (e) => readShot(e.target.files[0]);
    const sn = $('#snap', m.el);
    sn.ondragover = (e) => { e.preventDefault(); sn.classList.add('is-over'); };
    sn.ondragleave = () => sn.classList.remove('is-over');
    sn.ondrop = (e) => { e.preventDefault(); sn.classList.remove('is-over'); readShot(e.dataTransfer.files[0]); };
    if (opts.shot) $('#snapFile', m.el).click();
  }
  // AI
  const runAI = async (mode) => {
    if (!S.ai.configured) { toast('Add your Claude key to switch AI on', icon('info')); return; }
    read(); const out = $('#aiOut', m.el); out.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    try {
      const img = mode === 'chart' ? (t._img || t.imageData) : null;
      if (mode === 'chart' && !img) { out.innerHTML = '<span class="muted">Attach a chart screenshot in “Notes &amp; chart” first.</span>'; return; }
      const r = await API.ai({ mode, image: img, context: aiContext({ trades: [...S.trade.slice(-25).filter((x) => x.id !== t.id), { ...t, id: 'review' }], focus: 'the LAST row is the trade under review; earlier rows are recent context' }), messages: [{ role: 'user', content: mode === 'chart' ? `Read this chart for my ${t.side} ${t.symbol} trade (${t.setup || 'no setup'}), entry ${t.entry}, exit ${t.exit}, stop ${t.stop}. Notes: ${t.notes || '-'}` : `Grade my ${t.side} ${t.symbol} trade on ${t.date} ${t.time}.` }] });
      t.aiReview = r.text; out.innerHTML = md(r.text);
      if (window.gsap) window.gsap.fromTo(out.children, { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 0.04, duration: 0.45, ease: 'power3.out' });
    } catch (e) { out.innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
  };
  $('#aiGrade', m.el).onclick = () => runAI('trade');
  $('#aiChart', m.el).onclick = () => runAI('chart');
  m.on('save', () => {
    read();
    if (!t.symbol) { const s = $('[name="symbol"]', m.el); shake(s); s.focus(); $$('#tTabs button', m.el)[0].click(); return; }
    if (t.pnl === '' || !Number.isFinite(parseFloat(t.pnl))) { const s = $('[name="pnl"]', m.el); shake(s); s.focus(); $$('#tTabs button', m.el)[0].click(); toast('Add P&L or entry/exit/qty', icon('info')); return; }
    const { _img, ...clean } = t;
    const auto = autoTags(clean); if (auto.length) clean.tags = [...new Set([...tagList(clean), ...auto])].join(', ');
    save('trade', clean); m.close(); H.refresh();
    toast(`${clean.symbol} ${money(net(clean), { sign: true })} saved${auto.length ? ' · tagged ' + auto.map((x) => '#' + x).join(' ') : ''}`, icon('check'));
    const fired = runAgents(clean).filter(([lvl]) => lvl !== 'info');
    fired.slice(0, 2).forEach(([lvl, agent, title, body], i) => setTimeout(() => toast(`<b>${esc(agent)}:</b> ${esc(title)}. ${esc(body)}`, icon(lvl === 'bad' ? 'shield' : 'flag'), 4.5), 1400 + i * 5000));
  });
  m.on('dup', () => { read(); const { _img, id, aiReview, ...c } = t; m.close(); setTimeout(() => tradeModal(null, { ...c, time: new Date().toTimeString().slice(0, 5) }), 260); });
  m.on('del', () => confirmBox('Delete this trade?', 'It will be removed from every stat.', () => { remove('trade', t.id); m.close(); H.refresh(); toast('Trade deleted', icon('trash')); }));
  hint();
  setTimeout(() => $('[name="symbol"]', m.el)?.focus(), 350);
}
function compressImage(file, max = 1400, q = 0.72) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img; const k = Math.min(1, max / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
      let quality = q; let out = c.toDataURL('image/jpeg', quality);
      while (out.length > 420000 && quality > 0.35) { quality -= 0.1; out = c.toDataURL('image/jpeg', quality); }
      URL.revokeObjectURL(url); res(out);
    };
    img.onerror = rej; img.src = url;
  });
}

// ======================================================================= CSV IMPORT
function csvModal() {
  const m = modal('Import trades from CSV', `<div class="stack"><p class="muted" style="margin:0">Export from your platform (Tradovate, NinjaTrader, Topstep, MT4/5, Zerodha…) and drop the CSV here. Columns are matched by name: date, time, symbol, side/action, qty, entry/buy price, exit/sell price, P&L/profit, fees/commission.</p>
    ${field('Account for these trades', `<select class="in" id="csvAcc">${optionList(S.account.map((a) => [a.id, a.name]))}<option value="">No account</option></select>`)}
    <div class="drop">${icon('sheet')}<div style="flex:1"><b>Choose a .csv file</b><span class="muted" id="csvInfo" style="font-size:var(--fs-sm)">Nothing loaded yet</span></div><input type="file" accept=".csv,text/csv" id="csvFile" hidden><button class="btn btn--sm" id="csvPick">Choose</button></div><div id="csvPrev"></div></div>`,
  `<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="go" disabled>Import</button>`, 'modal');
  let parsed = [];
  $('#csvPick', m.el).onclick = () => $('#csvFile', m.el).click();
  $('#csvFile', m.el).onchange = async (e) => {
    const text = await e.target.files[0].text();
    parsed = parseCSVTrades(text);
    $('#csvInfo', m.el).textContent = `${parsed.length} trades found`;
    $('#csvPrev', m.el).innerHTML = parsed.length ? tradeList(parsed.slice(0, 5).map((t, i) => ({ ...t, id: 'p' + i }))) : '<span class="bad">Couldn\'t find trade rows. Check that the file has a header row with P&L or entry/exit prices.</span>';
    $('[data-act="go"]', m.el).disabled = !parsed.length;
  };
  m.on('go', () => { const acc = $('#csvAcc', m.el).value; parsed.forEach((t) => save('trade', { ...t, accountId: acc, id: uid(), session: sessionFromTime(t.time) })); m.close(); H.refresh(); toast(`${parsed.length} trades imported`, icon('check')); });
}
function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',' || c === ';' && !text.includes(',')) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
function parseCSVTrades(text) {
  const rows = parseCSV(text); if (rows.length < 2) return [];
  const hd = rows[0].map((h) => h.toLowerCase().trim());
  const find = (...keys) => hd.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
  const ix = { date: find('date', 'time', 'opened', 'boughttimestamp', 'entry time'), symbol: find('symbol', 'contract', 'instrument', 'product', 'item'), side: find('side', 'action', 'direction', 'type', 'b/s'), qty: find('qty', 'quantity', 'size', 'volume', 'lots', 'contracts'), entry: find('entry price', 'buyprice', 'buy price', 'open price', 'price'), exit: find('exit price', 'sellprice', 'sell price', 'close price'), pnl: find('pnl', 'p&l', 'profit', 'realized', 'net'), fees: find('fee', 'commission') };
  return rows.slice(1).map((r) => {
    const get = (k) => (ix[k] >= 0 ? (r[ix[k]] || '').trim() : '');
    const dRaw = get('date'); const d = new Date(dRaw.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$1-$2'));
    if (!dRaw || isNaN(d)) return null;
    const pnlS = get('pnl').replace(/[$,₹\s]/g, '').replace(/^\((.*)\)$/, '-$1');
    const sideRaw = get('side').toLowerCase();
    const t = { date: iso(d), time: d.toTimeString().slice(0, 5), symbol: get('symbol').toUpperCase(), side: /sell|short|^s$/.test(sideRaw) ? 'Short' : 'Long', qty: Math.abs(num(get('qty'))) || '', entry: get('entry'), exit: get('exit'), pnl: pnlS, fees: Math.abs(num(get('fees'))) || '', mistakes: [], followedPlan: true };
    if (t.pnl === '') { const c = calcPnl(t); if (c === null) return null; t.pnl = c; }
    return t;
  }).filter(Boolean);
}

// ======================================================================= CALENDAR
let calMonth = today().slice(0, 7);
export function calendar(el) {
  const [y, mo] = calMonth.split('-').map(Number);
  const first = new Date(y, mo - 1, 1); const start = weekStart(iso(first));
  const monthTrades = FT().filter((t) => monthKey(t.date) === calMonth); const st = stats(monthTrades);
  const byDay = {}; FT().forEach((t) => { (byDay[t.date] ||= []).push(t); });
  let cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal__h">${d}</div>`).join('') + '<div class="cal__h cal__h--w">Week</div>';
  let d = start;
  for (let w = 0; w < 6; w++) {
    let wkNet = 0; let wkN = 0;
    for (let k = 0; k < 7; k++) {
      const list = byDay[d] || []; const n = sum(list, net); wkNet += n; wkN += list.length;
      const out = monthKey(d) !== calMonth; const j = S.journal.find((x) => x.date === d);
      cells += `<div class="cal__d ${out ? 'is-out' : ''} ${d === today() ? 'is-today' : ''} ${list.length ? (n >= 0 ? 'is-win' : 'is-loss') : ''}" data-day="${d}"><small>${parseISO(d).getDate()}${j ? ' ·' + icon('journal', 'mini') : ''}</small>${list.length ? `<b class="${tone(n)}">${short(n)}</b><em>${list.length} trade${list.length > 1 ? 's' : ''} · ${pct(list.filter((t) => net(t) > 0).length / list.length)}</em>` : ''}</div>`;
      d = addDays(d, 1);
    }
    cells += `<div class="cal__w"><small>Week ${w + 1}</small><b class="${tone(wkNet)}">${wkN ? money(wkNet, { sign: true }) : '—'}</b><em class="muted" style="font-style:normal;font-size:11px">${wkN} trades</em></div>`;
    if (monthKey(d) !== calMonth && d > iso(first)) break;
  }
  el.innerHTML = `<div class="page">${phead('Winning and losing days at a glance', 'Calendar', 'Every trading day in one view. Click a day for its trades and journal.', `<button class="btn" data-m="-1">${icon('left')}</button><button class="btn" style="min-width:150px">${first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</button><button class="btn" data-m="1">${icon('right')}</button>`)}
    <div class="grid g-4">${[['Month P&L', st.total, 'moneySign', tone(st.total)], ['Winning days', st.dayWinRate, 'pct', ''], ['Best day', st.bestDay, 'moneySign', 'good'], ['Worst day', st.worstDay, 'moneySign', 'bad']].map(([l, v, f, c]) => `<div class="kpi"><small>${l}</small><b class="${c}">${cnt(v, f)}</b><em>${l === 'Winning days' ? `${st.days.filter((x) => x.net > 0).length} of ${st.tradingDays}` : l === 'Month P&L' ? `${st.n} trades` : ''}</em></div>`).join('')}</div>
    <section class="card" style="margin-top:var(--gap)"><div class="cal">${cells}</div></section></div>`;
  $$('[data-m]', el).forEach((b) => b.onclick = () => { const dt = new Date(y, mo - 1 + Number(b.dataset.m), 1); calMonth = iso(dt).slice(0, 7); H.refresh(); });
  $$('[data-day]', el).forEach((c) => c.onclick = () => dayModal(c.dataset.day));
  after(el);
}
function dayModal(date) {
  const list = S.trade.filter((t) => t.date === date); const n = sum(list, net); const j = S.journal.find((x) => x.date === date);
  const m = modal(fmtDay(date) + (date !== today() && date !== addDays(today(), -1) ? '' : ' · ' + fmtDate(date)), `<div class="row row--between" style="margin-bottom:10px"><span class="muted">${list.length} trades</span><b class="${tone(n)}" style="font-size:var(--fs-3xl)">${money(n, { sign: true })}</b></div>${tradeList(list)}${j ? `<div class="note" style="margin-top:14px">${icon('journal')}<span><b>Journal:</b> ${esc((j.post || j.pre || '').slice(0, 280))}</span></div>` : ''}`,
    `<button class="btn" data-act="journal">${icon('journal')}${j ? 'Open journal' : 'Write journal'}</button><button class="btn btn--primary" data-act="add">${icon('plus')}Add trade</button>`, 'modal');
  $$('[data-trade]', m.el).forEach((r) => r.onclick = () => { m.close(); setTimeout(() => tradeModal(S.trade.find((t) => t.id === r.dataset.trade)), 220); });
  m.on('add', () => { m.close(); setTimeout(() => tradeModal(null, { date }), 220); });
  m.on('journal', () => { m.close(); jDate = date; H.go('journal'); });
}

// ======================================================================= ACCOUNTS
export function accounts(el) {
  const accs = prefersStack();
  const spent = sum(S.account, accCost);
  const paid = sum(S.payout.filter((p) => p.status === 'credited'), (p) => p.amount);
  const live = S.account.filter(isLive);
  const groups = [['Live', accs.filter(isLive)], ['Passed / closed', accs.filter((a) => ['passed', 'closed'].includes(a.status))], ['Failed', accs.filter((a) => a.status === 'failed')]];
  el.innerHTML = `<div class="page">${phead('Challenges, funded and personal', 'Accounts', 'Drawdown buffers, targets and costs for every account. Throw the top card to see the next.', `<button class="btn btn--primary" data-act="add">${icon('plus')}Add account</button>`)}
  <div class="grid g-4">${[['Live accounts', live.length, 'int', ''], ['Total bought', spent, 'money', ''], ['Payouts received', paid, 'money', 'good'], ['Return on fees', spent ? (paid - spent) / spent : 0, 'pct', tone(paid - spent)]].map(([l, v, f, c]) => `<div class="kpi"><small>${l}</small><b class="${c}">${cnt(v, f)}</b><em>${l === 'Live accounts' ? `${S.account.filter((a) => a.status === 'active').length} challenge · ${S.account.filter((a) => a.status === 'funded').length} funded` : l === 'Total bought' ? `${S.account.length} accounts incl. resets` : l === 'Payouts received' ? (local(paid) || 'credited') : 'payouts minus costs'}</em></div>`).join('')}</div>
  <div class="grid g-ov" style="margin-top:var(--gap)">
    ${card('Your stack', 'Drag the top card sideways, tap to see rules', `<div class="wallet"><div class="wallet__stack">${accs.map(accountCard).join('') || `<div class="empty">${icon('accounts')}<b>No accounts</b></div>`}</div></div>${accs.length ? `<div class="wallet__bar"><button class="ibtn" data-act="prev">${icon('left')}</button><div class="wallet__dots">${accs.map((_, i) => `<i class="${i ? '' : 'is-on'}"></i>`).join('')}</div><button class="ibtn" data-act="next">${icon('right')}</button><span class="wallet__spacer"></span><button class="btn btn--sm" data-act="edit-top">${icon('edit')}Edit</button></div>` : ''}`)}
    <section class="card"><div class="chead"><div class="chead__text"><h3>All accounts</h3><p>Click one to edit rules, status or cost</p></div></div>
    ${groups.filter(([, l]) => l.length).map(([g, list]) => `<div class="daygroup"><span>${g}</span><span>${list.length}</span></div><div class="txlist">${list.map((a) => { const x = accountMetrics(a); const danger = x.buffer !== null && x.maxLoss && x.buffer < x.maxLoss * 0.3; return `<div class="txrow" data-acc="${a.id}"><span class="prodico ${a.status === 'failed' ? 'is-loss' : a.type === 'funded' ? '' : 't4'}">${icon(a.type === 'funded' ? 'shield' : a.type === 'personal' ? 'payouts' : 'flag')}</span>
      <span class="cell__text"><b>${esc(a.name)}</b><small>${esc(a.firm || 'Personal')} · ${a.size ? short(a.size) : ''} ${esc(a.type)} · bought ${esc(fmtDate(a.purchaseDate))} for ${money(num(a.cost))}</small>
      ${x.target && isLive(a) ? `<div style="margin-top:6px;max-width:320px">${meter(x.progress)}</div>` : ''}</span>
      ${(() => { const f = a.status === 'active' && x.target ? passForecast(a, { runs: 800 }) : null; return f && !f.insufficient ? `<span class="pill ${f.pass >= 0.6 ? 'pill--good' : f.pass < 0.35 ? 'pill--bad' : ''}" title="${pct(f.fail)} breach, ${pct(f.open)} still open after 60 days${f.medianDays ? ', median ' + f.medianDays + ' trading days to pass' : ''}">Pass ${pct(f.pass)}</span>` : ''; })()}${x.buffer !== null && isLive(a) ? `<span class="pill ${danger ? 'pill--bad' : ''}">Buffer ${money(x.buffer)}</span>` : ''}${statusPill(a.status)}<span class="amt ${tone(x.pnl)}">${money(x.pnl, { sign: true })}</span></div>`; }).join('')}</div>`).join('') || `<div class="empty">${icon('accounts')}<b>Add your first account</b>Prop challenge, funded or your own capital.</div>`}</section>
  </div></div>`;
  if (accs.length) {
    let top = 0;
    const stack = cardStack($('.wallet__stack', el), { onChange: (i) => { top = i; $$('.wallet__dots i', el).forEach((d, k) => d.classList.toggle('is-on', k === i)); } });
    el.querySelector('[data-act="next"]').onclick = stack.next; el.querySelector('[data-act="prev"]').onclick = stack.prev;
    el.querySelector('[data-act="edit-top"]').onclick = () => accountModal(accs[top]);
  }
  el.querySelector('[data-act="add"]').onclick = () => accountModal();
  $$('[data-acc]', el).forEach((r) => r.onclick = () => accountModal(S.account.find((a) => a.id === r.dataset.acc)));
  after(el);
}
// ------------------------------------------------------------------ missing firm / plan
// Saved as a 'firm' doc so it appears in every firm list from then on (and syncs once logins are on).
export function planModal({ firm = null, size = 50000, onSave } = {}) {
  const c = '$';
  const m = modal(firm ? `Add a ${firm.name} account type` : 'Add a firm that isn\'t listed', `
    <p class="muted" style="margin:0 0 14px;font-size:var(--fs-md);line-height:1.5">Enter the rules once from the firm's site or your dashboard. It's saved to your list, so next time you just pick it.</p>
    ${S.ai.configured ? `<div class="row" style="margin-bottom:14px"><button type="button" class="btn btn--sm" id="pmAI">${icon('coach')}Look it up with AI</button><span class="muted fine" id="pmNote" style="font-size:var(--fs-sm)">Fill the firm and plan name first.</span></div>` : ''}
    <div class="form">
      ${firm ? '' : field('Firm name', inp('firmName', '', 'placeholder="e.g. Bulenox"'), 'half') + field('Firm website', inp('url', '', 'placeholder="https://… (optional)"'), 'half')}
      ${field('Account type / plan', inp('planName', '', 'placeholder="e.g. Ignite Instant Funding"'), 'half')}
      ${field('How it works', `<select class="in" name="kind">${optionList([['eval', 'Challenge first, then funded'], ['instant', 'Instant funding, no challenge']], 'eval')}</select>`, 'half')}
      <div class="half">${slider({ name: 'size', label: 'Account size', value: size, min: 5000, max: 300000, step: 5000, prefix: c })}</div>
      <div class="half" id="pmTarget">${slider({ name: 'target', label: 'Profit target', value: Math.round(size * 0.06), min: 0, max: 30000, step: 250, prefix: c, zero: 'None' })}</div>
      <div class="half">${slider({ name: 'maxLoss', label: 'Max loss / drawdown', value: Math.round(size * 0.04), min: 0, max: 20000, step: 250, prefix: c, zero: 'None' })}</div>
      ${field('Drawdown type', `<select class="in" name="dd">${optionList([['eod', 'Trailing, end of day'], ['intraday', 'Trailing, intraday'], ['static', 'Static']], 'eod')}</select>`, 'half')}
      <div class="half">${slider({ name: 'daily', label: 'Firm daily loss limit', value: 0, min: 0, max: 10000, step: 50, prefix: c, zero: 'None' })}</div>
      <div class="half">${slider({ name: 'consistency', label: 'Consistency rule', value: 0, min: 0, max: 100, step: 5, suffix: '%', zero: 'None' })}</div>
      <div class="half">${slider({ name: 'minDays', label: 'Min trading days', value: 0, min: 0, max: 30, step: 1, zero: 'None' })}</div>
      ${field('Price you paid', inp('price', '', 'type="number" step="any" placeholder="0"'), 'half', 'one-time or per month')}
    </div>`,
    `<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="save">${icon('check')}Save to my list</button>`, 'modal');
  const V = (n) => $(`[name="${n}"]`, m.el); const SL = (n) => V(n).closest('.sl');
  const kindSync = () => { $('#pmTarget', m.el).style.display = V('kind').value === 'instant' ? 'none' : ''; };
  V('kind').onchange = kindSync;
  const ai = $('#pmAI', m.el);
  if (ai) ai.onclick = async () => {
    const fname = firm ? firm.name : V('firmName').value.trim(); const pname = V('planName').value.trim();
    if (!fname || !pname) { shake(firm ? V('planName') : (!fname ? V('firmName') : V('planName'))); return; }
    ai.disabled = true; $('#pmNote', m.el).innerHTML = '<span class="typing"><i></i><i></i><i></i></span> checking the firm\'s site…';
    try {
      const r = await API.ai({ mode: 'firmrules', messages: [{ role: 'user', content: `Firm: ${fname}. Plan: ${pname}. Account size: ${V('size').value}.` }] });
      const j = JSON.parse((r.text.match(/\{[\s\S]*\}/) || ['{}'])[0]);
      if (j.target === null) V('kind').value = 'instant';
      [['target', 'target'], ['maxLoss', 'maxLoss'], ['dailyLimit', 'daily'], ['minDays', 'minDays'], ['consistency', 'consistency']].forEach(([from, to]) => { if (j[from] !== undefined) setSlider(SL(to), num(j[from])); });
      if (j.ddType === 'static') V('dd').value = 'static';
      if (num(j.price)) V('price').value = num(j.price);
      if (!firm && j.source && !V('url').value) { try { V('url').value = new URL(j.source).origin; } catch (e) {} }
      kindSync(); $('#pmNote', m.el).innerHTML = `${icon('check')}Filled from ${j.source ? `<a href="${esc(j.source)}" target="_blank" rel="noopener">${esc(new URL(j.source).hostname)}</a>` : 'a web search'}. ${esc(j.notes || '')} Check before saving.`;
    } catch (e) { $('#pmNote', m.el).textContent = e.message || 'Couldn\'t check right now.'; }
    ai.disabled = false;
  };
  m.on('save', () => {
    const fname = firm ? firm.name : V('firmName').value.trim(); const pname = V('planName').value.trim();
    if (!fname) { shake(V('firmName')); return; } if (!pname) { shake(V('planName')); return; }
    const instant = V('kind').value === 'instant'; const dd = V('dd').value; const sz = num(V('size').value) || 50000;
    const fid = firm ? firm.id : 'u-' + fname.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const doc = { ...(S.firm.find((x) => x.id === fid) || { id: fid, name: fname, url: firm ? '' : V('url').value.trim(), mono: fname.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(), market: 'futures', programs: [] }) };
    doc.programs = [...(doc.programs || [])];
    let prog = doc.programs.find((p) => p.name.toLowerCase() === pname.toLowerCase());
    if (!prog) { prog = { id: 'u' + uid().slice(0, 8), name: pname, custom: true, sizes: [] }; doc.programs.push(prog); } else prog = doc.programs[doc.programs.indexOf(prog)] = { ...prog, sizes: [...prog.sizes] };
    Object.assign(prog, { billing: 'one-time', ddType: dd === 'static' ? 'static' : 'trailing', ddNote: { eod: 'End-of-day trailing', intraday: 'Intraday trailing', static: 'Static' }[dd], consistency: num(V('consistency').value) || null, minDays: num(V('minDays').value) || null, activation: 0, split: '', stages: instant ? ['funded'] : ['challenge', 'funded'] });
    const row = { size: sz, target: instant ? '' : num(V('target').value) || '', maxLoss: num(V('maxLoss').value), daily: num(V('daily').value) || '', price: num(V('price').value) || '' };
    prog.sizes = prog.sizes.filter((x) => x.size !== sz).concat(row).sort((a, b) => a.size - b.size);
    save('firm', doc); m.close(); toast(`${fname} ${pname} saved to your list`, icon('check'));
    onSave?.({ firmId: fid, programId: prog.id, size: sz });
  });
}

export function accountModal(a0) {
  const a = a0 ? { ...a0 } : { type: 'challenge', stage: 'challenge', status: 'active', purchaseDate: today(), ddType: 'trailing', size: 50000, target: 3000, maxLoss: 2000, personalDaily: 1000 };
  const firms = catalog().firms; const c = sym();
  const progOpts = (fid) => (firmById(fid)?.programs || []).map((p) => [p.id, p.name + (isInstant(p) ? ' (instant)' : '')]).concat(fid ? [['__add', '+ Account type not listed…']] : []);
  const sizeOpts = (fid, pid) => (firmById(fid)?.programs.find((p) => p.id === pid)?.sizes || []).map((s) => [s.size, short(s.size)]);
  const stageOpts = (fid, pid) => (firmById(fid)?.programs.find((p) => p.id === pid)?.stages || ['challenge', 'funded']).map((s) => [s, STAGE_LABEL[s]]);
  const m = modal(a0 ? a.name : 'Add account', `
    <div class="firmbar"><span class="firmbar__t">${icon('bolt')}Fill rules from firm</span>
      <select class="in" id="fbF"><option value="">Choose firm…</option>${optionList(firms.map((f) => [f.id, f.name]).concat([['__add', '+ Firm not listed…']]), a.firmId)}</select>
      <select class="in" id="fbP">${optionList(progOpts(a.firmId), a.programId)}</select>
      <select class="in" id="fbS">${optionList(sizeOpts(a.firmId, a.programId), a.size)}</select>
      <select class="in" id="fbG">${optionList(stageOpts(a.firmId, a.programId), a.stage || (a.type === 'funded' ? 'funded' : 'challenge'))}</select></div>
    <p class="firmnote" id="fbNote">${a.rulesFrom ? `${icon('check')}Rules from ${esc(a.rulesFrom)}. ` : ''}${firmById(a.firmId) ? `<a href="${esc(firmById(a.firmId).url)}" target="_blank" rel="noopener">Confirm on ${esc(firmById(a.firmId).name)}'s site ↗</a>` : 'Pick a firm to fill its published rules. Every value stays editable.'}${S.ai.configured ? ` <button type="button" class="linkbtn" id="aiRules">${icon('coach')}Re-check with AI</button>` : ''}</p>
    <div class="form">
    ${field('Name', inp('name', a.name, 'placeholder="e.g. 50K Evaluation #1"'), 'half')}${field('Firm / broker', inp('firm', a.firm, 'placeholder="Firm name"'), 'half')}
    ${field('Status', `<select class="in" name="status">${optionList([['active', 'Challenge in progress'], ['funded', 'Funded & trading'], ['passed', 'Passed (waiting)'], ['failed', 'Breached'], ['closed', 'Closed']], a.status)}</select>`, 'half')}
    ${field('Bought on', inp('purchaseDate', a.purchaseDate, 'type="date"'), 'half')}
    <div class="half">${slider({ name: 'size', label: 'Account size', value: num(a.size) || 0, min: 0, max: 300000, step: 5000, prefix: c, zero: '—' })}</div>
    <div class="half">${slider({ name: 'target', label: 'Profit target', value: num(a.target), min: 0, max: 30000, step: 250, prefix: c, zero: 'None' })}</div>
    <div class="half">${slider({ name: 'maxLoss', label: 'Max loss / drawdown', value: num(a.maxLoss), min: 0, max: 20000, step: 250, prefix: c, zero: 'None' })}</div>
    ${field('Drawdown type', `<select class="in" name="ddType">${optionList([['trailing', 'Trailing'], ['static', 'Static']], a.ddType)}</select>`, 'half')}
    <div class="half">${slider({ name: 'dailyLimit', label: 'Firm daily loss limit', value: num(a.dailyLimit), min: 0, max: 10000, step: 50, prefix: c, zero: 'None' })}</div>
    <div class="half" id="pdBox">${slider({ name: 'personalDaily', label: 'Your daily stop', value: num(a.personalDaily) || defaultDaily(a) || 50, min: 50, max: dailyCap(a), step: 25, prefix: c, hint: 'tighter than the firm, if you like' })}</div>
    <div class="half">${slider({ name: 'minDays', label: 'Min trading days', value: num(a.minDays), min: 0, max: 30, step: 1, zero: 'None' })}</div>
    <div class="half">${slider({ name: 'consistency', label: 'Consistency rule', value: num(a.consistency), min: 0, max: 100, step: 5, suffix: '%', zero: 'None' })}</div>
    <div class="full costs"><span class="costs__t">${icon('payouts')}What this account cost you <em>(${esc(cur())})</em></span><div class="costs__grid">${COST_FIELDS.map(([k, l]) => field(l, inp(k, a[k], 'type="number" step="any" placeholder="0"'))).join('')}</div></div>
    ${field('P&amp;L before journaling', inp('startPnl', a.startPnl, 'type="number" step="any" placeholder="0"'), '', 'e.g. −1000 if already down')}${field('Days already traded', inp('startDays', a.startDays, 'type="number" placeholder="0"'))}
    ${field('Notes', `<textarea class="in" name="notes" rows="2">${esc(a.notes || '')}</textarea>`, 'full')}
  </div>`,
  `${a0 ? `<button class="btn btn--ghost btn--danger" data-act="del">${icon('trash')}Delete</button><span style="flex:1"></span>` : ''}<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="save">${icon('check')}Save</button>`, 'modal');
  const F = (id) => $(id, m.el);
  const setSel = (sel, opts, v) => { sel.innerHTML = optionList(opts, v); };
  const sl = (n) => $(`[name="${n}"]`, m.el).closest('.sl');
  const fixCap = () => { const cap = dailyCap({ dailyLimit: num($('[name=dailyLimit]', m.el).value), maxLoss: num($('[name=maxLoss]', m.el).value), size: num($('[name=size]', m.el).value) }); const pd = sl('personalDaily'); const cur2 = num($('[name=personalDaily]', m.el).value); setSlider(pd, Math.min(cur2, cap), { max: cap }); };
  const apply = () => {
    const f = firmById(F('#fbF').value); if (!f) return;
    const p = f.programs.find((x) => x.id === F('#fbP').value) || f.programs[0]; const size = +F('#fbS').value || p.sizes[0].size; const stage = firstStage(p, F('#fbG').value || 'challenge');
    const r = planRules(f, p, size, stage);
    a.firmId = f.id; a.programId = p.id; a.stage = stage; a.rulesFrom = p.custom ? `${f.name} ${p.name}, added by you` : `${f.name} ${p.name}, catalog ${catalog().verified}`;
    setSlider(sl('size'), r.size); setSlider(sl('target'), num(r.target)); setSlider(sl('maxLoss'), num(r.maxLoss)); setSlider(sl('dailyLimit'), num(r.dailyLimit)); setSlider(sl('minDays'), num(r.minDays)); setSlider(sl('consistency'), num(r.consistency));
    $('[name=ddType]', m.el).value = r.ddType; $('[name=firm]', m.el).value = f.name;
    if (!$('[name=name]', m.el).value.trim()) $('[name=name]', m.el).value = `${f.name.split(' ')[0]} ${Math.round(size / 1000)}K ${p.name}`;
    { const ci = $('[name=cost]', m.el); if (ci) ci.placeholder = r.cost ? `List ${r.cost} · enter what you paid` : 'What you paid'; } // list price is only a hint: coupons change it
    $('[name=status]', m.el).value = stage === 'funded' ? 'funded' : $('[name=status]', m.el).value === 'funded' ? 'active' : $('[name=status]', m.el).value;
    const cap = dailyCap(r); setSlider(sl('personalDaily'), Math.min(num($('[name=personalDaily]', m.el).value) || defaultDaily(r), cap) || defaultDaily(r), { max: cap });
    F('#fbNote').innerHTML = `${icon('check')}Filled from ${esc(f.name)} ${esc(p.name)} (checked ${esc(catalog().verified)}). <a href="${esc(f.url)}" target="_blank" rel="noopener">Confirm on their site ↗</a>${S.ai.configured ? ` <button type="button" class="linkbtn" id="aiRules">${icon('coach')}Re-check with AI</button>` : ''}`;
    bindAI();
    if (window.gsap) window.gsap.fromTo($$('.sl', m.el), { backgroundColor: 'rgba(110,224,161,.18)' }, { backgroundColor: 'rgba(110,224,161,0)', duration: 1.2, stagger: 0.03 });
  };
  const missing = (firm) => { const prevF = a.firmId || ''; planModal({ firm, size: num($('[name=size]', m.el).value) || 50000, onSave: ({ firmId, programId, size }) => {
      setSel(F('#fbF'), catalog().firms.map((f) => [f.id, f.name]).concat([['__add', '+ Firm not listed…']]), firmId); F('#fbF').insertAdjacentHTML('afterbegin', '<option value="">Choose firm…</option>');
      setSel(F('#fbP'), progOpts(firmId), programId); setSel(F('#fbS'), sizeOpts(firmId, programId), size); setSel(F('#fbG'), stageOpts(firmId, programId)); apply(); } });
    F('#fbF').value = prevF; if (firm) F('#fbP').value = a.programId || F('#fbP').options[0]?.value; };
  F('#fbF').onchange = () => { const fid = F('#fbF').value; if (fid === '__add') { missing(null); return; } setSel(F('#fbP'), progOpts(fid)); setSel(F('#fbS'), sizeOpts(fid, F('#fbP').value), 50000); setSel(F('#fbG'), stageOpts(fid, F('#fbP').value), 'challenge'); apply(); };
  F('#fbP').onchange = () => { const fid = F('#fbF').value; if (F('#fbP').value === '__add') { missing(firmById(fid)); return; } setSel(F('#fbS'), sizeOpts(fid, F('#fbP').value), +F('#fbS').value); setSel(F('#fbG'), stageOpts(fid, F('#fbP').value), F('#fbG').value); apply(); };
  F('#fbS').onchange = apply; F('#fbG').onchange = apply;
  ['dailyLimit', 'maxLoss'].forEach((n) => $(`[name=${n}]`, m.el).addEventListener('input', fixCap));
  const bindAI = () => {
    const b = $('#aiRules', m.el); if (!b) return;
    b.onclick = async () => {
      b.disabled = true; b.innerHTML = '<span class="typing"><i></i><i></i><i></i></span> checking the firm\'s site…';
      try {
        const r = await API.ai({ mode: 'firmrules', messages: [{ role: 'user', content: `Firm: ${$('[name=firm]', m.el).value}. Plan: ${firmById(a.firmId)?.programs.find((p) => p.id === a.programId)?.name || ''}. Account size: ${$('[name=size]', m.el).value}. Stage: ${a.stage || 'challenge'}.` }] });
        const j = JSON.parse((r.text.match(/\{[\s\S]*\}/) || ['{}'])[0]);
        ['target', 'maxLoss', 'dailyLimit', 'minDays', 'consistency'].forEach((kk) => { if (j[kk] !== undefined && j[kk] !== null) setSlider(sl(kk), num(j[kk])); });
        if (j.ddType) $('[name=ddType]', m.el).value = j.ddType; fixCap();
        F('#fbNote').innerHTML = `${icon('check')}Checked live${j.source ? ` against <a href="${esc(j.source)}" target="_blank" rel="noopener">${esc(new URL(j.source).hostname)}</a>` : ''}. ${esc(j.notes || '')}`;
        a.rulesFrom = `AI check ${today()}`;
      } catch (e) { toast(e.message || 'Couldn\'t check right now', icon('info')); b.disabled = false; b.textContent = 'Re-check with AI'; }
    };
  };
  bindAI();
  m.on('save', () => {
    const f = formData(m.el); if (!f.name.trim()) { shake($('[name=name]', m.el)); return; }
    ['size', 'cost', 'resetCost', 'activationFee', 'subscriptionFees', 'platformFees', 'otherFees', 'target', 'maxLoss', 'dailyLimit', 'personalDaily', 'minDays', 'consistency', 'startPnl', 'startDays'].forEach((kk) => (f[kk] = f[kk] === '' || f[kk] === undefined ? '' : num(f[kk])));
    ['target', 'dailyLimit', 'minDays', 'consistency', 'maxLoss'].forEach((kk) => { if (f[kk] === 0) f[kk] = ''; });
    f.type = f.status === 'funded' ? 'funded' : !f.firm ? 'personal' : 'challenge';
    if (f.status === 'funded') a.stage = 'funded';
    save('account', { ...a, ...f }); m.close(); H.refresh(); toast('Account saved', icon('check'));
  });
  m.on('del', () => confirmBox(`Delete ${a.name}?`, 'Its trades stay in your log but lose the account link.', () => { remove('account', a.id); m.close(); H.refresh(); }));
}

// ======================================================================= PAYOUTS
export function payouts(el) {
  const m = missionMetrics(); const L = P().local;
  const list = S.payout.slice().sort((a, b) => (b.creditDate || b.reqDate || '').localeCompare(a.creditDate || a.reqDate || ''));
  const months = {}; const targets = P().monthlyTargets || {};
  Object.keys(targets).forEach((k) => (months[k] ||= []));
  S.payout.forEach((p) => { const k = monthKey(p.creditDate || p.reqDate || today()); (months[k] ||= []).push(p); });
  const mrows = Object.keys(months).sort().map((k) => { const l = months[k]; const cr = l.filter((p) => p.status === 'credited'); const est = num(targets[k]) || sum(l, (p) => p.estimate); const act = sum(cr, (p) => p.amount); return { k, est, act, actL: sum(cr, (p) => p.amountLocal || (L?.rate ? p.amount * L.rate : 0)), last: cr.map((p) => p.creditDate).sort().pop(), pend: sum(l.filter((p) => p.status === 'requested'), (p) => p.amount) }; });
  el.innerHTML = `<div class="page">${phead('Money that actually hit your bank', 'Payouts', 'Track estimated vs actual payouts by month, in dollars and your local currency.', `<button class="btn" data-act="target">${icon('target')}Monthly targets</button><button class="btn btn--primary" data-act="add">${icon('plus')}Add payout</button>`)}
  <div class="grid g-ov2">
    ${m ? missionCard(m) : card('Payouts', '', `<div class="bal__num">${cnt(sum(S.payout.filter((p) => p.status === 'credited'), (p) => p.amount))}</div><p class="muted">received so far</p>`)}
    ${card('By month', 'Estimated vs actual, like your sheet', mrows.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Month</th><th class="r">Est.</th><th class="r">Actual</th>${L?.code ? `<th class="r">Actual ${esc(L.code)}</th>` : ''}<th>Credited</th><th style="min-width:120px">Goal</th></tr></thead><tbody>${mrows.map((r) => `<tr data-month="${r.k}"><td><b>${parseISO(r.k + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</b></td><td class="r">${money(r.est)}</td><td class="r ${r.act ? 'good' : ''}">${money(r.act)}${r.pend ? `<br><small class="muted">+${money(r.pend)} pending</small>` : ''}</td>${L?.code ? `<td class="r">${money(r.actL, { c: L.code, dec: 0 })}</td>` : ''}<td>${r.last ? fmtDate(r.last) : '—'}</td><td>${r.est ? `<div class="row" style="gap:8px"><div style="flex:1">${meter(r.act / r.est)}</div><small>${pct(r.act / r.est)}</small></div>` : '—'}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="r">${money(sum(mrows, (r) => r.est))}</td><td class="r">${money(sum(mrows, (r) => r.act))}</td>${L?.code ? `<td class="r">${money(sum(mrows, (r) => r.actL), { c: L.code, dec: 0 })}</td>` : ''}<td></td><td></td></tr></tfoot></table></div>` : `<div class="empty">${icon('payouts')}<b>No payouts yet</b>Set a monthly target, then log payouts as you request them.</div>`)}
  </div>
  <section class="card" style="margin-top:var(--gap)"><div class="chead"><div class="chead__text"><h3>Every payout</h3><p>Requested, credited and planned</p></div></div>
  ${list.length ? `<div class="txlist">${list.map((p) => `<div class="txrow" data-pay="${p.id}"><span class="prodico ${p.status === 'rejected' ? 'is-loss' : ''}">${icon('payouts')}</span><span class="cell__text"><b>${esc(accName(p.accountId))}</b><small>${p.reqDate ? 'Requested ' + fmtDate(p.reqDate) : ''}${p.creditDate ? ' · credited ' + fmtDate(p.creditDate) : ''}${p.note ? ' · ' + esc(p.note) : ''}</small></span>
    ${{ credited: '<span class="pill pill--good">Credited</span>', requested: '<span class="pill pill--warn"><span class="live" style="background:var(--warn)"></span>Pending</span>', planned: '<span class="pill">Planned</span>', rejected: '<span class="pill pill--bad">Rejected</span>' }[p.status] || ''}
    <span class="amt">${money(p.amount || p.estimate)}${p.amountLocal || (L?.rate && p.amount) ? `<br><small class="muted">${money(p.amountLocal || p.amount * L.rate, { c: L?.code || 'INR', dec: 0 })}</small>` : ''}</span></div>`).join('')}</div>` : `<div class="empty">Nothing yet.</div>`}</section></div>`;
  el.querySelector('[data-act="add"]').onclick = () => payoutModal();
  el.querySelector('[data-act="target"]').onclick = () => targetsModal();
  $$('[data-pay]', el).forEach((r) => r.onclick = () => payoutModal(S.payout.find((p) => p.id === r.dataset.pay)));
  $$('[data-month]', el).forEach((r) => r.onclick = () => targetsModal(r.dataset.month));
  bindCommon(el); after(el);
}
function payoutModal(p0) {
  const p = p0 ? { ...p0 } : { status: 'requested', reqDate: today(), accountId: (S.account.find((a) => a.status === 'funded') || S.account[0] || {}).id };
  const L = P().local;
  const m = modal(p0 ? 'Edit payout' : 'Add payout', `<div class="form">
    ${field('Account', `<select class="in" name="accountId">${optionList(S.account.map((a) => [a.id, a.name]), p.accountId)}</select>`, 'half')}
    ${field('Status', `<select class="in" name="status">${optionList([['planned', 'Planned'], ['requested', 'Requested / pending'], ['credited', 'Credited'], ['rejected', 'Rejected']], p.status)}</select>`, 'half')}
    ${field(`Amount received (${esc(cur())})`, inp('amount', p.amount, 'type="number" step="any"'), 'half', 'What landed after the split')}
    ${field(`Amount in ${esc(L?.code || 'local')} `, inp('amountLocal', p.amountLocal, `type="number" step="any" placeholder="${L?.rate ? 'auto at ' + Number(L.rate).toFixed(2) : ''}"`), 'half', 'What hit your bank account')}
    ${field('Gross withdrawn from account', inp('gross', p.gross, 'type="number" step="any" placeholder="same as amount"'), 'half')}
    ${field('Estimate', inp('estimate', p.estimate, 'type="number" step="any"'), 'half')}
    ${field('Requested on', inp('reqDate', p.reqDate, 'type="date"'), 'half')}${field('Credited on', inp('creditDate', p.creditDate, 'type="date"'), 'half')}
    ${field('Note', inp('note', p.note), 'full')}</div>`,
  `${p0 ? `<button class="btn btn--ghost btn--danger" data-act="del">${icon('trash')}Delete</button><span style="flex:1"></span>` : ''}<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="save">${icon('check')}Save</button>`, 'modal');
  m.on('save', () => {
    const f = formData(m.el); ['amount', 'amountLocal', 'gross', 'estimate'].forEach((k) => (f[k] = f[k] === '' ? '' : num(f[k])));
    if (f.status === 'credited' && !f.creditDate) f.creditDate = today();
    if (f.status === 'credited' && f.amountLocal === '' && L?.rate && f.amount) f.amountLocal = Math.round(f.amount * L.rate);
    save('payout', { ...p, ...f }); m.close(); H.refresh(); toast(f.status === 'credited' ? 'Payout credited — nice.' : 'Payout saved', icon('check'));
  });
  m.on('del', () => { remove('payout', p.id); m.close(); H.refresh(); });
}
function targetsModal(focus) {
  const t = { ...(P().monthlyTargets || {}) }; const base = focus || today().slice(0, 7);
  const months = [...new Set([...Object.keys(t), base, ...[0, 1, 2].map((i) => { const d = parseISO(today().slice(0, 8) + '01'); d.setMonth(d.getMonth() + i); return iso(d).slice(0, 7); })])].sort();
  const m = modal('Monthly payout targets', `<div class="form">${months.map((k) => `<div class="full">${slider({ name: 'm_' + k, label: parseISO(k + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), value: num(t[k]), min: 0, max: Math.max(10000, num(t[k])), step: 100, prefix: sym(), zero: 'No target' })}</div>`).join('')}</div>`, `<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="save">Save</button>`, 'modal modal--sm');
  m.on('save', () => { const f = formData(m.el); const out = {}; Object.entries(f).forEach(([k, v]) => { if (num(v)) out[k.slice(2)] = num(v); }); saveProfile({ ...P(), monthlyTargets: out }); m.close(); H.refresh(); });
}

// ======================================================================= WEEKLY PLAN
export function plan(el) {
  const plans = S.plan.slice().sort((a, b) => b.start.localeCompare(a.start));
  el.innerHTML = `<div class="page">${phead('Five trading days at a time', 'Weekly plan', 'Set a balance and goal per account for each 5-day block. Actuals fill in from your trades.', `<button class="btn btn--primary" data-act="add">${icon('plus')}Next 5 days</button>`)}
  ${plans.length ? plans.map((p, i) => { const pm = planMetrics(p); const isNow = today() >= p.start && today() <= pm.end; return `<section class="card" style="margin-bottom:var(--gap)" data-plan="${p.id}"><div class="chead"><div class="chead__text"><h3>${esc(p.title || (i === plans.length - 1 ? 'First 5 trading days' : 'Next 5 trading days'))} ${isNow ? '<span class="pill pill--accent" style="margin-left:6px"><span class="live"></span>This week</span>' : ''}</h3><p>${fmtDate(p.start)} → ${fmtDate(pm.end)} · goal ${money(pm.goal)} · actual <b class="${tone(pm.actual)}">${money(pm.actual, { sign: true })}</b></p></div><button class="ibtn" data-act="del-plan" aria-label="Delete block">${icon('trash')}</button></div>
    <div class="tablewrap"><table class="t plan-t"><thead><tr><th>Account</th><th class="r">Balance start</th><th class="r">Weekly goal</th><th class="r">Per day</th><th class="r">Payout</th><th class="r">Balance end (plan)</th><th class="r">Actual</th><th style="min-width:130px">Progress</th></tr></thead><tbody>
    ${pm.rows.map((r, k) => `<tr style="cursor:default"><td><b>${esc(r.label || accName(r.accountId))}</b></td><td class="r"><input class="in cell-in" data-k="${k}" data-f="balanceStart" value="${esc(r.balanceStart ?? '')}" type="number" step="any"></td><td class="r"><input class="in cell-in" data-k="${k}" data-f="goal" value="${esc(r.goal ?? '')}" type="number" step="any"></td><td class="r">${money(r.perDay)}</td><td class="r"><input class="in cell-in" data-k="${k}" data-f="payout" value="${esc(r.payout ?? '')}" type="number" step="any"></td><td class="r">${money(r.endPlan)}</td><td class="r amt ${tone(r.actual)}">${money(r.actual, { sign: true })}</td><td><div class="row" style="gap:8px"><div style="flex:1">${meter(r.progress)}</div><small>${pct(r.progress)}</small></div></td></tr>`).join('')}
    </tbody><tfoot><tr><td>Total</td><td></td><td class="r">${money(pm.goal)}</td><td class="r">${money(pm.goal / (p.days || 5))}</td><td class="r">${money(pm.payout)}</td><td></td><td class="r ${tone(pm.actual)}">${money(pm.actual, { sign: true })}</td><td></td></tr></tfoot></table></div></section>`; }).join('')
    : `<section class="card"><div class="empty">${icon('plan')}<b>No plan yet</b>Create your first 5-day block from your live accounts.</div></section>`}</div>`;
  el.querySelector('[data-act="add"]').onclick = () => {
    const last = plans[0]; const live = S.account.filter(isLive);
    const start = last ? addDays(planMetrics(last).end, 1) : weekStart(today());
    const rows = last ? planMetrics(last).rows.map((r) => ({ accountId: r.accountId, label: r.label, balanceStart: Math.round(r.endActual), goal: r.goal, payout: 0 })) : live.map((a) => ({ accountId: a.id, balanceStart: Math.round(accountMetrics(a).pnl), goal: num(a.target) ? Math.round(num(a.target) / 2) : 1000, payout: 0 }));
    save('plan', { start: weekStart(start) < start ? addDays(weekStart(start), 7) : start, days: 5, rows, title: last ? 'Next 5 trading days' : 'First 5 trading days' }); H.refresh();
  };
  $$('.cell-in', el).forEach((input) => input.onchange = () => {
    const p = S.plan.find((x) => x.id === input.closest('[data-plan]').dataset.plan);
    p.rows[+input.dataset.k][input.dataset.f] = input.value === '' ? '' : num(input.value); save('plan', p); H.refresh();
  });
  $$('[data-act="del-plan"]', el).forEach((b) => b.onclick = () => confirmBox('Delete this 5-day block?', '', () => { remove('plan', b.closest('[data-plan]').dataset.plan); H.refresh(); }));
  after(el);
}

// ======================================================================= ANALYTICS
let AR = 'all';
export function analytics(el) {
  const list = inRange(FT(), ...rangeFor(AR)); const st = stats(list);
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const byWd = wd.map((d, i) => { const l = list.filter((t) => (parseISO(t.date).getDay() + 6) % 7 === i); return { label: d, value: sum(l, net), sub: `${l.length} trades`, trades: l, tip: d }; }).filter((x, i) => i < 5 || x.value);
  const hrs = {}; list.forEach((t) => { if (!t.time) return; const h = t.time.slice(0, 2); (hrs[h] ||= []).push(t); });
  const byHr = Object.keys(hrs).sort().map((h) => ({ label: h + ':00', value: sum(hrs[h], net), sub: `${hrs[h].length} trades`, trades: hrs[h], tip: h + ':00' }));
  const rb = [['≤ −2R', (r) => r <= -2], ['−2 to −1', (r) => r > -2 && r <= -1], ['−1 to 0', (r) => r > -1 && r < 0], ['0 to 1', (r) => r >= 0 && r < 1], ['1 to 2', (r) => r >= 1 && r < 2], ['2 to 3', (r) => r >= 2 && r < 3], ['≥ 3R', (r) => r >= 3]];
  const rs = list.map(rMultiple).filter((r) => r !== null);
  const rDist = rb.map(([l, f]) => { const tr = list.filter((t) => { const r = rMultiple(t); return r !== null && f(r); }); return { label: l, value: tr.length * (l.includes('−') ? -1 : 1), tip: l, sub: `${tr.length} trades`, trades: tr }; });
  const mis = groupBy(list, (t) => (t.mistakes || []).filter((m) => m !== 'None')).sort((a, b) => a.net - b.net);
  const kept = list.filter((t) => t.followedPlan !== false && !(t.mistakes || []).some((m) => m !== 'None')); const broke = list.filter((t) => !kept.includes(t));
  el.innerHTML = `<div class="page">${phead('Find your edge, find your leaks', 'Analytics', `${st.n} trades analysed. Click any bar or row to see the trades behind it.`, `<div class="seg" id="aSeg">${[['all', 'All time'], ['90d', '90 days'], ['30d', '30 days'], ['month', 'Month'], ['week', 'Week']].map(([v, l]) => `<button data-v="${v}" class="${AR === v ? 'is-on' : ''}">${l}</button>`).join('')}</div>`)}
  <div class="grid g-4">${[
    ['Net P&L', st.total, 'moneySign', tone(st.total), `${st.n} trades, fees ${money(st.fees)}`], ['Win rate', st.winRate, 'pct', '', `${st.wins}W ${st.losses}L`], ['Profit factor', Number.isFinite(st.pf) ? st.pf : 99, 'dec', st.pf >= 1 ? 'good' : 'bad', 'gross win ÷ gross loss'], ['Expectancy', st.expectancy, 'moneySign', tone(st.expectancy), 'per trade'],
    ['Avg win', st.avgWin, 'money', 'good', `largest ${money(st.best)}`], ['Avg loss', -st.avgLoss, 'moneySign', 'bad', `largest ${money(st.worst)}`], ['Max drawdown', -st.maxDD, 'moneySign', 'bad', 'peak to trough, closed P&L'], ['Avg R', st.avgR ?? 0, 'r', tone(st.avgR || 0), `streak ${st.streak > 0 ? st.streak + 'W' : st.streak < 0 ? -st.streak + 'L' : '—'} · best ${st.bestStreak}W`]]
    .map(([l, v, f, c, e]) => `<div class="kpi"><small>${l}</small><b class="${c}">${cnt(v, f)}</b><em>${e}</em></div>`).join('')}</div>
  <div class="grid g-2" style="margin-top:var(--gap)">
    ${card('Equity curve', 'Closed P&L, by day', equityChart(st.curve, { h: 220, id: 'an' }))}
    ${card('Rules kept vs broken', 'What discipline is worth to you', `<div class="grid g-2"><div class="kpi"><small>Followed plan</small><b class="${tone(sum(kept, net))}">${cnt(sum(kept, net), 'moneySign')}</b><em>${kept.length} trades · ${pct(kept.filter((t) => net(t) > 0).length / (kept.length || 1))} win</em></div><div class="kpi"><small>Broke a rule</small><b class="${tone(sum(broke, net))}">${cnt(sum(broke, net), 'moneySign')}</b><em>${broke.length} trades · ${pct(broke.filter((t) => net(t) > 0).length / (broke.length || 1))} win</em></div></div><h4 style="margin:18px 0 10px">Cost of mistakes</h4>${hbars(mis.slice(0, 6))}`)}
    ${card('By setup', 'Entry setup. Click a row for its trades.', hbars(groupBy(list, (t) => setupsOf(t)[0] || 'No setup')))}
    ${card('Confirmation', 'Does a second setup improve the entry setup?', (() => { const rows = []; groupBy(list, (t) => setupsOf(t)[0]).forEach((g) => { const alone = g.list.filter((t) => new Set(setupsOf(t)).size === 1); const withC = groupBy(g.list.filter((t) => setupsOf(t).length > 1), (t) => [...new Set(setupsOf(t).slice(1))].filter((x) => x !== g.key)); if (!withC.length) return; rows.push({ key: g.key + ' alone', list: alone, n: alone.length, net: sum(alone, net), winRate: alone.length ? alone.filter((t) => net(t) > 0).length / alone.length : 0 }); withC.forEach((w) => rows.push({ ...w, key: `${g.key} + ${w.key}` })); }); return rows.length ? hbars(rows) + '<p class="muted" style="font-size:var(--fs-xs);margin:12px 0 0">Small samples are noisy: treat fewer than 10 trades per row as a hint, not proof.</p>' : '<div class="empty">Tag a second setup on a trade as confirmation to compare.</div>'; })())}
    ${card('By setup grade', 'Does your conviction match your results?', hbars(groupBy(list, (t) => (t.grade ? t.grade + ' grade' : 'Not graded')).sort((a, b) => a.key.localeCompare(b.key))))}
    ${card('By symbol', '', hbars(groupBy(list, (t) => t.symbol).slice(0, 10)))}
    ${card('By weekday', '', tubes(byWd, { h: 170 }))}
    ${card('By hour', `Entry time${P().sessionTz ? ' (' + esc(P().sessionTz) + ')' : ''}`, tubes(byHr, { h: 170 }))}
    ${card('By session', '', hbars(groupBy(list, (t) => t.session || sessionFromTime(t.time) || 'Unknown')))}
    ${card('By entry timeframe', '', hbars(groupBy(list, (t) => t.tf || 'Not logged')))}
    ${card('Trend alignment', 'With the trend, against it, or in a range', hbars(groupBy(list, (t) => ({ with: 'With trend', counter: 'Counter-trend', range: 'Range' }[t.trend] || 'Not logged'))))}
    ${card('Exit behaviour', '', hbars(groupBy(list, (t) => (t.exitBehavior === 'late' ? (net(t) < 0 ? 'Late on a loser' : 'Late on a winner') : (EXIT_BEHAVIOR.find(([k]) => k === t.exitBehavior) || [0, 'Not logged'])[1]))))}
    ${card('Hold time', 'Entry to exit', hbars(groupBy(list, (t) => durationBucket(t) || 'No exit time').sort((a, b) => ['< 5 min', '5–15 min', '15–30 min', '30–60 min', '1–4 h', '4 h +', 'No exit time'].indexOf(a.key) - ['< 5 min', '5–15 min', '15–30 min', '30–60 min', '1–4 h', '4 h +', 'No exit time'].indexOf(b.key))))}
    ${card('By emotion', 'How you felt going in', hbars(groupBy(list, (t) => t.emotion || 'Not logged')))}
    ${card('Detached vs attached', 'Were you calm about the outcome?', hbars(groupBy(list, (t) => (t.neutral === true ? 'Detached' : t.neutral === false ? 'Attached to the result' : 'Not logged'))))}
    ${card('Long vs short', '', hbars(groupBy(list, (t) => t.side)))}
    ${card('Exit quality', 'From the best (MFE) and worst (MAE) open P&amp;L you log on each trade', (() => { const x = exitStats(list); if (!x.n && !x.nMae) return '<div class="empty">Log “Best open P&amp;L” and “Worst open P&amp;L” on your trades to see how much you leave on the table.</div>'; return `<div class="grid g-2" style="gap:10px"><div class="kpi"><small>Exit efficiency</small><b>${x.efficiency !== null ? pct(x.efficiency) : '—'}</b><em>of the best open profit kept on winners</em></div><div class="kpi"><small>Left on the table</small><b class="bad">${money(x.leftOnTable)}</b><em>across ${x.n} trades with MFE</em></div><div class="kpi"><small>Winners turned losers</small><b>${x.losersThatWereUp.length}</b><em>${money(sum(x.losersThatWereUp, net), { sign: true })} after being up ½R or more</em></div><div class="kpi"><small>Average heat</small><b>${x.avgHeatR !== null ? x.avgHeatR.toFixed(2) + 'R' : '—'}</b><em>${x.maxWinnerHeat !== null ? 'winners went up to ' + money(x.maxWinnerHeat) + ' against you' : 'how far trades go against you'}</em></div></div>${x.losersThatWereUp.length ? `<p class="muted" style="font-size:var(--fs-md);margin:12px 0 0">Try moving the stop to break-even at +1R: it would have saved most of the ${x.losersThatWereUp.length} winners you gave back.</p>` : ''}`; })())}
    ${card('Auto-tags', 'Behaviours the auto-tagger caught', hbars(groupBy(list, (t) => tagList(t).filter((g) => ['after-2-losses', 'quick-reentry', 'overtrading', 'oversized-loss', 'winner-to-loser', 'first-5-min'].includes(g)))))}
    ${card('R distribution', 'How many trades landed in each R bucket', tubes(rDist, { h: 170 }).replace(/[−+]?\$/g, ''))}
  </div></div>`;
  segBind(el, '#aSeg', (v) => { AR = v; H.refresh(); });
  after(el);
}

// ======================================================================= JOURNAL
const MAXIMS = ['Protect the downside; the upside takes care of itself.', 'A skipped bad trade is a winning decision.', 'Your stop is the price of being wrong. Pay it quickly.', 'Trade the plan you wrote, not the feeling you have.', 'Consistency is a stack of boring days.', 'The market pays patience and charges impatience.', 'One good process day beats one lucky P&L day.', 'Size for the next hundred trades, not this one.', 'When in doubt, stay out.', 'You only need a few clean setups a week.', 'Losses are tuition. Pay once, learn once.', 'Calm is a position too.'];
let jDate = today();
export function journal(el) {
  const j = S.journal.find((x) => x.date === jDate) || { date: jDate, mood: 3, followedPlan: true };
  const dayTrades = S.trade.filter((t) => t.date === jDate); const dn = sum(dayTrades, net);
  const past = S.journal.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const moods = ['Rough', 'Low', 'Okay', 'Good', 'Great'];
  el.innerHTML = `<div class="page">${phead('Pre-market plan, post-market truth', 'Daily journal', 'Two minutes before the open, five minutes after the close. The coach reads this too.', `<input type="date" class="in" style="width:auto" id="jd" value="${jDate}">`)}
  <div class="grid g-ov">
    <div class="grid" style="align-content:start">${V3m ? V3m.startDayHTML(j) : ''}
    <section class="card"><div class="chead"><div class="chead__text"><h3>${esc(fmtDay(jDate))}</h3><p>${dayTrades.length} trades · <b class="${tone(dn)}">${money(dn, { sign: true })}</b></p></div>${S.ai.configured ? `<button class="btn btn--sm" id="jAI">${icon('coach')}Reflect with coach</button>` : ''}</div>
      <div class="stack">
        <div class="field"><span>Mood</span><div class="seg seg--accent" id="mood">${moods.map((x, i) => `<button type="button" data-v="${i + 1}" class="${+j.mood === i + 1 ? 'is-on' : ''}">${x}</button>`).join('')}</div></div>
        <div class="diary"><div class="diary__q">${icon('brain')}<span>${esc(MAXIMS[(parseISO(jDate).getDate() + parseISO(jDate).getMonth()) % MAXIMS.length])}</span></div>
          <div class="grid g-2" style="gap:12px"><div class="field"><span>Three things I'm grateful for</span>${[1, 2, 3].map((n) => inp('grat' + n, j['grat' + n], `placeholder="${n}."`)).join('')}</div>
          <div class="field"><span>My main goal right now</span><textarea class="in" name="mainGoal" rows="3" placeholder="What are you working toward, beyond today's P&amp;L?">${esc(j.mainGoal || (S.journal.slice().sort((a, b) => b.date.localeCompare(a.date)).find((x) => x.mainGoal)?.mainGoal || ''))}</textarea></div></div></div>
        ${field('Pre-market plan', `<textarea class="in" name="pre" rows="4" placeholder="Bias, key levels, news, which setups you'll take, max loss today…">${esc(j.pre || '')}</textarea>`)}
        ${field('Post-market review', `<textarea class="in" name="post" rows="5" placeholder="What happened? Did you follow the plan? What would you do differently?">${esc(j.post || '')}</textarea>`)}
        ${field('Lesson to carry forward', inp('lesson', j.lesson, 'placeholder="One sentence"'))}
        <div class="row row--between"><span class="field"><span>Followed my plan today</span></span><button type="button" class="switch ${j.followedPlan !== false ? 'is-on' : ''}" id="jPlan"></button></div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn--primary" id="jSave">${icon('check')}Save entry</button></div>
        <div class="ai-out" id="jOut">${j.ai ? md(j.ai) : ''}</div>
      </div></section></div>
    <div class="grid" style="align-content:start">
      ${V3m ? V3m.sessionReviewHTML(j, jDate) + V3m.habitHTML() : ''}
      ${card('That day\'s trades', '', tradeList(dayTrades))}
      ${card('Past entries', `${S.journal.length} days journaled`, past.length ? `<div class="txlist">${past.map((x) => { const n = sum(S.trade.filter((t) => t.date === x.date), net); return `<div class="txrow" data-jd="${x.date}"><span class="prodico t2">${icon('journal')}</span><span class="cell__text"><b>${esc(fmtDay(x.date))}</b><small>${esc((x.lesson || x.post || x.pre || '').slice(0, 70))}</small></span><span class="pill">${moods[(x.mood || 3) - 1]}</span><span class="amt ${tone(n)}">${money(n, { sign: true })}</span></div>`; }).join('')}</div>` : '<div class="empty">Your entries will stack up here.</div>')}
    </div></div></div>`;
  segInit($('#mood', el)); segBind(el, '#mood', () => {});
  $('#jd', el).onchange = (e) => { jDate = e.target.value || today(); H.refresh(); };
  $('#jPlan', el).onclick = (e) => e.currentTarget.classList.toggle('is-on');
  const collect = () => ({ ...j, ...formData(el.querySelector('.card .stack')), ...(V3m ? V3m.readStartDay(el) : {}), id: j.id || 'j' + jDate, date: jDate, mood: +($('#mood .is-on', el)?.dataset.v || 3), followedPlan: $('#jPlan', el).classList.contains('is-on') });
  if (V3m) V3m.bindStartDay(el, j, () => { const e = collect(); save('journal', e); Object.assign(j, e); const p = el.querySelector('.sday .chead p'); if (p) p.textContent = `${e.checklist.length}/${V3m.checklistItems().length} checked${e.bias ? ' · bias ' + e.bias : ''}`; });
  $('#jSave', el).onclick = () => { save('journal', collect()); toast('Journal saved', icon('check')); H.refresh(); };
  $$('[data-jd]', el).forEach((r) => r.onclick = () => { jDate = r.dataset.jd; H.refresh(); });
  const ai = $('#jAI', el);
  if (ai) ai.onclick = async () => {
    const e = collect(); save('journal', e); const out = $('#jOut', el); out.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    try { const r = await API.ai({ mode: 'chat', context: aiContext({ trades: dayTrades, focus: `trades on ${jDate}` }), messages: [{ role: 'user', content: `Here's my journal for ${jDate}. Mood ${e.mood}/5. Followed plan: ${e.followedPlan ? 'yes' : 'no'}.\nPre-market: ${e.pre || '-'}\nPost-market: ${e.post || '-'}\nLesson: ${e.lesson || '-'}\nReflect on the day in under 150 words: did my trades match my plan, and what's the one thing to fix tomorrow?` }] }); e.ai = r.text; save('journal', e); out.innerHTML = md(r.text); }
    catch (er) { out.innerHTML = `<span class="bad">${esc(er.message)}</span>`; }
  };
  bindCommon(el); after(el);
}

// ======================================================================= PLAYBOOK
export function playbook(el) {
  const r = P().risk || {};
  el.innerHTML = `<div class="page">${phead('Only trade what you\'ve defined', 'Playbook', 'Your setups with their live stats, and the rules every trade is checked against.', `<button class="btn" data-act="rule">${icon('plus')}Rule</button><button class="btn btn--primary" data-act="setup">${icon('plus')}Setup</button>`)}
  <div class="grid g-2 pbgrid">${S.setup.map((s, i) => { const l = FT().filter((t) => setupsOf(t)[0] === s.name); const st = stats(l);
    const mini = (title, fn, map = {}) => { const rows = groupBy(l, fn).sort((x, y) => y.n - x.n).slice(0, 3); return `<div class="pbm"><small>${title}</small>${rows.length ? rows.map((r) => `<div class="pbm__r" data-drill="${reg(r.list, s.name + ' · ' + (map[r.key] || r.key))}"><span>${esc(map[r.key] || r.key)}</span><b class="${r.winRate >= 0.5 ? 'good' : 'bad'}">${pct(r.winRate)}</b><em>${r.list.filter((t) => net(t) > 0).length}W / ${r.list.filter((t) => net(t) < 0).length}L</em></div>`).join('') : '<div class="pbm__r muted">—</div>'}</div>`; };
    return `<section class="card pbcard" data-setup="${s.id}"><div class="chead"><span class="prodico t${(i % 4) + 1}">${icon(setupIcons[i % setupIcons.length])}</span><div class="chead__text"><h3>${esc(s.name)}</h3><p>${l.length} trades${s.criteria ? ' · ' + esc(s.criteria).slice(0, 80) : ''}</p></div><span class="amt ${tone(st.total)}">${money(st.total, { sign: true })}</span></div>
      <div class="pbstats">${[['Win rate', pct(st.winRate)], ['Profit factor', Number.isFinite(st.pf) ? st.pf.toFixed(2) : st.n ? '∞' : '—'], ['Expectancy', money(st.expectancy, { sign: true })], ['Avg winner', money(st.avgWin)], ['Avg loser', money(st.avgLoss)], ['Avg R', st.avgR !== null ? st.avgR.toFixed(2) : '—']].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>
      ${l.length ? `<div class="pbmini">${mini('Trend', (t) => t.trend, { with: 'With trend', counter: 'Counter', range: 'Range' })}${mini('Timeframe', (t) => t.tf)}${mini('Session', (t) => t.session)}${mini('Grade', (t) => t.grade && t.grade + ' grade')}</div>` : '<p class="muted" style="margin:6px 0 0;font-size:var(--fs-md)">No trades tagged with this setup yet.</p>'}
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn btn--sm btn--ghost" data-edit-setup="${s.id}">${icon('edit')}Edit rules</button></div></section>`; }).join('')}</div>
  <div class="grid g-2" style="margin-top:var(--gap)">
    ${card('Trading rules', 'Ticked off on every trade. Click a rule to edit it.', `<div class="txlist" id="ruleList">${S.rule.map((x) => `<div class="txrow" style="cursor:default" data-rule="${x.id}"><span class="prodico">${icon('check')}</span><span class="cell__text"><input class="rule__in" value="${esc(x.text)}" aria-label="Rule"></span><button class="ibtn" data-del-rule="${x.id}" aria-label="Delete">${icon('trash')}</button></div>`).join('') || '<div class="empty">No rules yet.</div>'}</div>
      <form class="rule__add" id="ruleAdd"><input class="in" name="newRule" placeholder="Add a rule, e.g. No trades after 2 losses" autocomplete="off"><button class="btn btn--primary btn--sm" type="submit">${icon('plus')}Add rule</button></form>`)}
    ${card('Risk limits', 'Drive the “Safe to risk today” card and trade checks', `<div class="stack" id="riskF">
      <div class="grid g-2" style="gap:12px">${slider({ name: 'maxDailyLoss', label: 'Max loss per day', value: num(r.maxDailyLoss) || 500, min: 50, max: Math.max(5000, num(r.maxDailyLoss)), step: 25, prefix: sym() })}${slider({ name: 'maxTrades', label: 'Max trades per day', value: num(r.maxTrades), min: 0, max: 15, step: 1, zero: 'No limit' })}</div>
      <div class="row row--between" style="flex-wrap:wrap;gap:8px"><b style="font-size:var(--fs-md)">Sizing</b><div class="seg seg--accent" id="rmSeg">${[['grade', 'By setup grade'], ['fixed', 'Fixed'], ['none', 'Per trade']].map(([v, l]) => `<button type="button" data-v="${v}" class="${(r.mode || 'none') === v ? 'is-on' : ''}">${l}</button>`).join('')}</div></div>
      <div id="rmBox"></div></div><p class="muted fine" id="riskState" style="margin:12px 0 0;font-size:var(--fs-sm)">Changes apply instantly. A single trade can risk up to your max loss per day.</p>`)}
  </div></div>`;
  el.querySelector('[data-act="setup"]').onclick = () => setupModal();
  el.querySelector('[data-act="rule"]').onclick = () => { const m = modal('Add rule', field('Rule', inp('text', '', 'placeholder="No trades in the first 5 minutes"')), '<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="save">Add</button>', 'modal modal--sm'); m.on('save', () => { const v = $('[name=text]', m.el).value.trim(); if (v) save('rule', { text: v }); m.close(); H.refresh(); }); };
  $$('[data-edit-setup]', el).forEach((c) => c.onclick = () => setupModal(S.setup.find((s) => s.id === c.dataset.editSetup)));
  $$('[data-del-rule]', el).forEach((b) => b.onclick = () => { remove('rule', b.dataset.delRule); H.refresh(); });
  $('#ruleAdd', el).onsubmit = (e) => { e.preventDefault(); const i = $('[name=newRule]', el); const v = i.value.trim(); if (!v) { i.focus(); return; } save('rule', { text: v }); H.refresh(); requestAnimationFrame(() => $('#ruleAdd [name=newRule]')?.focus()); };
  $$('.rule__in', el).forEach((i) => { const commit = () => { const r0 = S.rule.find((x) => x.id === i.closest('[data-rule]').dataset.rule); const v = i.value.trim(); if (!r0) return; if (!v) { i.value = r0.text; return; } if (v !== r0.text) { save('rule', { ...r0, text: v }); toast('Rule updated', icon('check')); } }; i.addEventListener('blur', commit); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } if (e.key === 'Escape') { i.value = S.rule.find((x) => x.id === i.closest('[data-rule]').dataset.rule)?.text || i.value; i.blur(); } }); });
  let mode = r.mode || 'none';
  const mxOf = () => Math.max(50, num($('[name=maxDailyLoss]', el).value) || 50);
  const drawRm = () => { const cur = P().risk || r; const bg = cur.byGrade || { 'A+': 250, B: 150, C: 75 }; const mx = mxOf(); $('#rmBox', el).innerHTML = mode === 'grade' ? ['A+', 'B', 'C'].map((g) => `<div class="grade"><span class="grade__tag g-${g === 'A+' ? 'a' : g.toLowerCase()}">${g}</span><div class="grade__body">${slider({ name: 'g_' + g, label: { 'A+': 'High conviction', B: 'Normal', C: 'Low probability' }[g], value: Math.min(num(bg[g]) || 25, mx), min: 25, max: mx, step: 25, prefix: sym() })}</div></div>`).join('') : mode === 'fixed' ? slider({ name: 'perTrade', label: 'Risk per trade', value: Math.min(num(cur.perTrade) || 150, mx), min: 25, max: mx, step: 25, prefix: sym() }) : '<p class="muted" style="margin:0;font-size:var(--fs-md)">You log the risk on each trade; R multiples use it.</p>'; if (window.gsap) window.gsap.fromTo($('#rmBox', el).children, { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 0.05, duration: 0.4 }); };
  // per-trade risk can go up to the daily max; rescale those sliders whenever the daily max moves
  const rescale = () => { const mx = mxOf(); $$('#rmBox .sl', el).forEach((sl) => setSlider(sl, Math.min(num($('.sl__num', sl).value), mx), { max: mx })); };
  let tmr;
  const persist = () => { clearTimeout(tmr); tmr = setTimeout(() => {
    const f = formData($('#riskF', el)); const prev = P().risk || {};
    const risk = { ...prev, maxDailyLoss: num(f.maxDailyLoss), maxTrades: num(f.maxTrades) || '', mode, byGrade: mode === 'grade' ? { 'A+': num(f['g_A+']), B: num(f.g_B), C: num(f.g_C) } : prev.byGrade || null, perTrade: mode === 'fixed' ? num(f.perTrade) : '' };
    saveProfile({ ...P(), risk }); H.updateSide && H.updateSide();
    const st = $('#riskState', el); if (st) { st.textContent = 'Saved'; clearTimeout(st._t); st._t = setTimeout(() => (st.textContent = 'Changes apply instantly. A single trade can risk up to your max loss per day.'), 1400); }
  }, 250); };
  drawRm(); segBind(el, '#rmSeg', (v) => { mode = v; drawRm(); persist(); });
  const form = $('#riskF', el);
  form.addEventListener('input', (e) => { if (e.target.name === 'maxDailyLoss' && !e.isTrusted) rescale(); persist(); });
  form.addEventListener('change', (e) => { if (e.target.name === 'maxDailyLoss') rescale(); persist(); });
  after(el);
}
function setupModal(s0) {
  const s = s0 ? { ...s0 } : {};
  const m = modal(s0 ? s.name : 'New setup', `<div class="stack">${field('Name', inp('name', s.name, 'placeholder="Opening range break"'))}${field('Entry criteria', `<textarea class="in" name="criteria" rows="3" placeholder="What must be true to take it?">${esc(s.criteria || '')}</textarea>`)}${field('Invalidation / stop', inp('stopRule', s.stopRule))}${field('Targets / management', inp('mgmt', s.mgmt))}</div>`,
    `${s0 ? `<button class="btn btn--ghost btn--danger" data-act="del">${icon('trash')}Delete</button><span style="flex:1"></span>` : ''}<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="save">Save</button>`, 'modal modal--sm');
  m.on('save', () => { const f = formData(m.el); if (!f.name.trim()) return shake($('[name=name]', m.el)); if (s0 && s0.name !== f.name) S.trade.filter((t) => setupsOf(t).includes(s0.name)).forEach((t) => { const ss = setupsOf(t).map((x) => (x === s0.name ? f.name : x)); save('trade', { ...t, setups: ss, setup: ss[0] }); }); save('setup', { ...s, ...f }); m.close(); H.refresh(); });
  m.on('del', () => { remove('setup', s.id); m.close(); H.refresh(); });
}

// ======================================================================= AI COACH
export function coach(el, opts = {}) {
  const chat = S.chat.find((c) => c.id === 'main') || { id: 'main', messages: [] };
  const quick = [
    ['Weekly review', 'week', 'Review my last 7 days.'], ['Plan tomorrow', 'plan', 'Build my game plan for the next session.'],
    ['Biggest leak', 'chat', 'What is my single most expensive habit right now, in dollars? Show the trades.'],
    ['On track?', 'chat', 'Am I on track for my payout goal and my accounts\' targets? What do I need per day from here?'],
    ['Best setup', 'chat', 'Which setup, symbol and time window is my real edge? Where should I size up or stop trading?'],
    ['Prop risk check', 'chat', 'Check every live prop account: how close am I to each drawdown and daily limit, and what is a safe max loss per trade for each?'],
  ];
  el.innerHTML = `<div class="page">${phead('Powered by Claude', 'AI coach', 'Ask anything about your trading. The coach reads your whole journal: trades, accounts, rules, payouts and notes.', '')}
  ${S.ai.configured ? '' : `<div class="note" style="margin-bottom:var(--gap)">${icon('info')}<span>AI is off for this workspace. In Cloudflare, add a secret named <b>ANTHROPIC_API_KEY</b> with your Claude key, then redeploy. Model: <b>${esc(S.ai.model || 'claude-sonnet-5-5')}</b>.</span></div>`}
  <div class="coach"><section class="card card--flush chat"><div class="chat__log" id="log"></div>
    <div class="chat__in"><textarea class="in" id="q" rows="1" placeholder="Ask the coach…"></textarea><button class="rbtn rbtn--accent" id="send" aria-label="Send">${icon('send')}</button></div></section>
    <div class="grid" style="align-content:start">
      ${card('Quick reviews', 'One tap, full read', `<div class="chips">${quick.map(([l], i) => `<button class="chip" data-q="${i}">${l}</button>`).join('')}</div>`)}
      ${card('Context sent', '', `<p class="muted" style="margin:0;font-size:var(--fs-md)">${S.trade.length} trades, ${S.account.length} accounts, ${S.payout.length} payouts, ${S.journal.length} journal days, ${S.rule.length} rules. Each question uses 1 of your daily AI credits.</p><div class="row" style="margin-top:12px"><button class="btn btn--sm btn--ghost" id="clear">${icon('trash')}Clear chat</button></div>`)}
    </div></div></div>`;
  const log = $('#log', el);
  const render = (animateLast = false) => {
    log.innerHTML = chat.messages.length ? chat.messages.map((m) => `<div class="msg msg--${m.role === 'user' ? 'user' : 'ai'}">${m.role === 'user' ? esc(m.content).replace(/\n/g, '<br>') : md(m.content)}</div>`).join('')
      : `<div class="empty" style="margin:auto">${icon('coach')}<b>Ask your first question</b>Try “Why do I lose on Mondays?” or tap a quick review.</div>`;
    log.scrollTop = log.scrollHeight;
    if (animateLast && window.gsap && log.lastElementChild) window.gsap.fromTo(log.lastElementChild, { opacity: 0, y: 14, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.6)', transformOrigin: chat.messages.at(-1)?.role === 'user' ? '100% 100%' : '0% 100%' });
  };
  const ask = async (text, mode = 'chat') => {
    if (!text.trim()) return;
    if (!S.ai.configured) { toast('Add your Claude key to switch AI on', icon('info')); return; }
    chat.messages.push({ role: 'user', content: text }); render(true);
    const typing = document.createElement('div'); typing.className = 'msg msg--ai'; typing.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; log.append(typing); log.scrollTop = log.scrollHeight;
    try {
      const trades = mode === 'week' ? inRange(S.trade, addDays(today(), -7), today()) : undefined;
      const r = await API.ai({ mode, context: aiContext({ trades, focus: mode === 'week' ? 'last 7 days' : undefined }), messages: chat.messages.slice(-12) });
      chat.messages.push({ role: 'assistant', content: r.text });
    } catch (e) { chat.messages.push({ role: 'assistant', content: '⚠️ ' + e.message }); }
    chat.messages = chat.messages.slice(-60); save('chat', chat); render(true);
  };
  render();
  const q = $('#q', el);
  q.oninput = () => { q.style.height = 'auto'; q.style.height = Math.min(160, q.scrollHeight) + 'px'; };
  q.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const v = q.value; q.value = ''; q.oninput(); ask(v); } };
  $('#send', el).onclick = (e) => { wobble(e.currentTarget); const v = q.value; q.value = ''; q.oninput(); ask(v); };
  $$('[data-q]', el).forEach((b) => b.onclick = () => { const [, mode, text] = quick[+b.dataset.q]; ask(text, mode); });
  $('#clear', el).onclick = () => { chat.messages = []; save('chat', chat); render(); };
  if (opts.run === 'week') setTimeout(() => ask('Review my last 7 days.', 'week'), 700);
  after(el);
}

// ======================================================================= SETTINGS
export function settings(el) {
  const p = P(); const L = p.local || {};
  el.innerHTML = `<div class="page">${phead('Make it yours', 'Settings', '', '')}
  <div class="grid g-2">
    ${card('Profile', '', `<div class="form" style="grid-template-columns:1fr 1fr" id="sP">${field('Your name', inp('name', p.name), 'full')}${field('Display currency', `<select class="in" name="currency">${optionList(['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD'], p.currency || 'USD')}</select>`)}${field('Local currency', `<select class="in" name="localCode"><option value="">None</option>${optionList(['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'], L.code)}</select>`)}<div class="field full" id="fxSet"><span>Conversion rate</span><div class="fxline">${L.auto !== false && L.code ? `<span class="live"></span><span>1 ${esc(p.currency || 'USD')} = <b>${L.rate ? Number(L.rate).toFixed(2) : '…'} ${esc(L.code)}</b></span><small id="fxAgo">live${L.at ? ' · ' + fxAgo(L.at) : ''}</small>` : `<input class="in" name="rate" type="number" step="any" value="${esc(L.rate || '')}" style="width:140px">`}<button type="button" class="linkbtn" id="fxToggle">${L.auto !== false && L.code ? 'Set my own' : 'Use live rate'}</button></div><em>Rates by <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">ExchangeRate-API</a>, refreshed every few hours</em></div>${field('Times are logged in', `<select class="in" name="sessionTz">${optionList([['ET', 'New York (ET)'], ['IST', 'India (IST)']], p.sessionTz || 'ET')}</select>`)}</div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn btn--primary btn--sm" id="sPSave">Save</button></div>`)}
    ${card('Goal', 'Powers the goal card and forecast', `<div class="form" style="grid-template-columns:1fr 1fr" id="sM">${field('Goal name', inp('name', p.mission?.name, `placeholder="${goalIdea()}"`), 'full')}<div class="full">${slider({ name: 'target', label: 'Payout target', value: num(p.mission?.target) || 2000, min: 0, max: 50000, step: 100, prefix: sym() })}</div>${field('Start', inp('start', p.mission?.start, 'type="date"'))}${field('End', inp('end', p.mission?.end, 'type="date"'))}</div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn btn--sm btn--ghost btn--danger" id="sMDel">Remove goal</button><button class="btn btn--primary btn--sm" id="sMSave">Save</button></div>`)}
    ${card('Markets &amp; instruments', 'Changes units and auto P&amp;L', `<div class="chips" id="sMk">${Object.entries(MARKETS).map(([k, v]) => `<button class="chip ${(p.markets || []).includes(k) ? 'is-on' : ''}" data-v="${k}">${v.label}</button>`).join('')}</div><div style="margin-top:14px">${field('Instruments (comma separated)', inp('inst', (p.instruments || []).join(', ')))}</div><div style="margin-top:14px">${field('Custom point values', inp('pv', Object.entries(p.pointValues || {}).map(([k, v]) => `${k}=${v}`).join(', '), 'placeholder="NIFTY=75, BANKNIFTY=30"'), '', 'Money per 1.0 price move per contract/lot, e.g. lot sizes for Indian F&amp;O')}</div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn btn--primary btn--sm" id="sMkSave">Save</button></div>`)}
    ${card('Appearance', '', `<div class="stack"><div class="row row--between"><span>Theme</span><div class="seg" id="sTheme"><button data-v="light" class="${document.documentElement.dataset.theme !== 'dark' ? 'is-on' : ''}">Smoke</button><button data-v="dark" class="${document.documentElement.dataset.theme === 'dark' ? 'is-on' : ''}">Night</button></div></div><div class="row row--between"><span>Glass frost</span><input type="range" min="0" max="1" step="0.05" value="${getComputedStyle(document.documentElement).getPropertyValue('--frost').trim() || 0.5}" id="sFrost" style="width:180px;accent-color:var(--accent)"></div><div class="row row--between"><span>Reduce motion</span><button class="switch ${localStorage.getItem('ew_rm') === '1' ? 'is-on' : ''}" id="sRM"></button></div><div class="row row--between"><span>Slider sounds</span><button class="switch ${soundOn() ? 'is-on' : ''}" id="sSnd"></button></div></div>`)}
    ${card('AI', '', `<p class="muted" style="margin:0 0 10px;font-size:var(--fs-md)">Status: ${S.ai.configured ? '<b class="good">connected</b>' : '<b class="bad">no key</b>'} · model <b>${esc(S.ai.model || '—')}</b>. The key lives only on the server as the Cloudflare secret <code>ANTHROPIC_API_KEY</code>; it is never sent to the browser.</p>`)}
    ${card('Your data', S.local ? 'Stored in this browser (local mode)' : 'Synced to your account', `<div class="chips"><button class="chip" id="sExp">${icon('download')} Export JSON</button><button class="chip" id="sImp">${icon('upload')} Import JSON</button><button class="chip" id="sOb">${icon('refresh')} Re-run onboarding</button><button class="chip" id="sWipe" style="color:var(--bad)">${icon('trash')} Delete all data</button>${S.local ? '' : `<button class="chip" id="sOut">${icon('logout')} Sign out</button>`}</div><input type="file" id="sImpF" accept=".json" hidden>`)}
  </div></div>`;
  const fxt = $('#fxToggle', el); if (fxt) fxt.onclick = async () => { const Lc = P().local || {}; const auto = !(Lc.auto !== false && Lc.code); const code = $('[name=localCode]', el).value; let rate = Lc.rate; let at = Lc.at; if (auto && code) { const r = await liveRate(P().currency || 'USD', code, { force: true }); if (r) { rate = +r.rate.toFixed(4); at = r.at; } } saveProfile({ ...P(), local: code ? { code, rate, at, auto } : null }); H.refresh(); };
  $('#sPSave', el).onclick = async () => { const f = formData($('#sP', el)); const Lc = P().local || {}; const auto = Lc.auto !== false; let rate = f.rate !== undefined ? num(f.rate) : Lc.rate; let at = Lc.at; if (f.localCode && auto && (f.localCode !== Lc.code || f.currency !== P().currency)) { const r = await liveRate(f.currency, f.localCode, { force: true }); if (r) { rate = +r.rate.toFixed(4); at = r.at; } } saveProfile({ ...P(), name: f.name, currency: f.currency, sessionTz: f.sessionTz, local: f.localCode ? { code: f.localCode, rate, at, auto } : null }); toast('Saved', icon('check')); H.rerenderShell(); };
  $('#sMSave', el).onclick = () => { const f = formData($('#sM', el)); saveProfile({ ...P(), mission: { ...(P().mission || {}), ...f, target: num(f.target) } }); toast('Goal saved', icon('check')); };
  $('#sMDel', el).onclick = () => { saveProfile({ ...P(), mission: null }); H.refresh(); };
  $$('#sMk .chip', el).forEach((c) => c.onclick = () => { c.classList.toggle('is-on'); pop(c); });
  $('#sMkSave', el).onclick = () => { const pv = {}; ($('[name=pv]', el).value || '').split(',').forEach((s) => { const [k, v] = s.split('='); if (k && v) pv[k.trim().toUpperCase()] = num(v); }); saveProfile({ ...P(), markets: $$('#sMk .is-on', el).map((c) => c.dataset.v), instruments: $('[name=inst]', el).value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean), pointValues: pv }); toast('Saved', icon('check')); };
  segBind(el, '#sTheme', (v) => { const b = $('#sTheme .is-on', el).getBoundingClientRect(); window.__switchTheme(v, b.left + b.width / 2, b.top + b.height / 2); });
  $('#sFrost', el).oninput = (e) => { document.documentElement.style.setProperty('--frost', e.target.value); try { localStorage.setItem('ew_frost', e.target.value); } catch (er) {} };
  $('#sSnd', el).onclick = (e) => { const on = e.currentTarget.classList.toggle('is-on'); setSound(on); };
  $('#sRM', el).onclick = (e) => { e.currentTarget.classList.toggle('is-on'); try { localStorage.setItem('ew_rm', e.currentTarget.classList.contains('is-on') ? '1' : '0'); } catch (er) {} toast('Reload to apply', icon('info')); };
  $('#sExp', el).onclick = () => { const o = { exportedAt: new Date().toISOString(), profile: S.profile }; ['account', 'trade', 'payout', 'plan', 'journal', 'setup', 'rule'].forEach((k) => (o[k] = S[k])); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' })); a.download = `smarttrade-${today()}.json`; a.click(); };
  $('#sImp', el).onclick = () => $('#sImpF', el).click();
  $('#sImpF', el).onchange = async (e) => { try { const o = JSON.parse(await e.target.files[0].text()); if (o.profile) saveProfile(o.profile); ['account', 'trade', 'payout', 'plan', 'journal', 'setup', 'rule'].forEach((k) => (o[k] || []).forEach((x) => save(k, x))); toast('Imported', icon('check')); H.rerenderShell(); } catch (er) { toast('That file isn\'t a Smart Trade export', icon('info')); } };
  $('#sOb', el).onclick = () => H.onboard();
  $('#sWipe', el).onclick = () => confirmBox('Delete all your journal data?', 'Trades, accounts, payouts, plans and notes are erased. This can\'t be undone.', async () => { await wipeAll(); H.onboard(); }, 'Delete everything');
  const out = $('#sOut', el); if (out) out.onclick = async () => { await flush(); await API.logout(); location.reload(); };
  after(el);
}

// ======================================================================= modal helpers
export function modal(title, body, foot, cls = 'modal') {
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  scrim.innerHTML = `<div class="${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal__head"><h2>${esc(title)}</h2><button class="ibtn" data-act="x" aria-label="Close">${icon('close')}</button></div>${body}<div class="modal__foot">${foot}</div></div>`;
  document.body.append(scrim); openModal(scrim);
  const handlers = {}; let closed = false;
  const close = () => { if (closed) return; closed = true; document.removeEventListener('keydown', key); closeModal(scrim, () => scrim.remove()); };
  const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlers.save?.(); };
  document.addEventListener('keydown', key);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); const b = e.target.closest('[data-act]'); if (!b || !scrim.contains(b) || b.closest('.modal') !== scrim.firstElementChild) return; const a = b.dataset.act; if (a === 'x' || a === 'cancel') close(); else handlers[a]?.(); });
  const panel = scrim.firstElementChild; $$('.seg', panel).forEach(segInit);
  return { el: panel, close, on: (a, fn) => (handlers[a] = fn) };
}
export function confirmBox(title, text, fn, label = 'Delete') {
  const m = modal(title, `<p class="muted" style="margin:0">${esc(text)}</p>`, `<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="ok" style="background:var(--bad);color:#fff">${esc(label)}</button>`, 'modal modal--sm');
  m.on('ok', () => { m.close(); fn(); });
}
export { countUp, flash };

// shared helpers for views2.js
export const helpers = { card, phead, cnt, meter, after, segBind, bindCommon, field, inp, optionList, formData, statusPill, hooks: () => H };

// open the trades behind any chart bar / breakdown row
document.addEventListener('click', (e) => {
  const d = e.target.closest?.('[data-drill]'); if (!d) return;
  const item = drillMap().get(d.dataset.drill); if (!item || !item.list.length) return;
  const st = stats(item.list.slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))));
  const m = modal(`${item.label || 'Trades'} · ${item.list.length} trade${item.list.length > 1 ? 's' : ''}`, `<div class="pace" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px"><div class="pace__item"><small>Net</small><b class="${tone(st.total)}">${money(st.total, { sign: true })}</b></div><div class="pace__item"><small>Win rate</small><b>${pct(st.winRate)}</b></div><div class="pace__item"><small>Profit factor</small><b>${Number.isFinite(st.pf) ? st.pf.toFixed(2) : '∞'}</b></div><div class="pace__item"><small>Avg trade</small><b class="${tone(st.expectancy)}">${money(st.expectancy, { sign: true })}</b></div></div>${tradeList(item.list.slice().sort((a, b) => b.date.localeCompare(a.date)))}`, '<button class="btn" data-act="cancel">Close</button>', 'modal');
  $$('[data-trade]', m.el).forEach((r) => (r.onclick = () => { m.close(); setTimeout(() => tradeModal(S.trade.find((t) => t.id === r.dataset.trade)), 220); }));
  if (window.gsap) window.gsap.fromTo($$('.txrow', m.el), { opacity: 0, x: -10 }, { opacity: 1, x: 0, stagger: 0.02, duration: 0.35, delay: 0.1 });
});
