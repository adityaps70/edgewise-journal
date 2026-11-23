// Mindset score, prop firm finances, reports, mastery radar.
import {
  S, P, $, $$, esc, num, sum, clamp, iso, today, addDays, parseISO, weekStart, monthKey, fmtDate, fmtDay, money, short, pct, tone, cur, sym,
  net, stats, groupBy, inRange, rangeFor, rMultiple, accName, accountMetrics, isLive, icon, API, aiContext, md,
  FT, edgeScore, zoneOf, severeCombo, lateLoss, durationMin, durationBucket, setupsOf, mastery, HOT, EXIT_BEHAVIOR, accCost, COST_FIELDS,
} from './core.js?v=1a2e09d8';
import { equityChart, tubes, hbars, bindTips, reg, radar } from './charts.js?v=1a2e09d8';
import { helpers, tradeList, accountModal, modal } from './views.js?v=1a2e09d8';
import { segInit, animateData } from './motion.js?v=1a2e09d8';

const { card, phead, cnt, meter, after, segBind, bindCommon } = helpers;
const H = () => helpers.hooks();

// ======================================================================= MINDSET
let MR = 'all';
export function mindset(el) {
  const list = inRange(FT(), ...rangeFor(MR)); const scored = list.filter((t) => edgeScore(t) !== null);
  const avg = scored.length ? sum(scored, edgeScore) / scored.length : null; const z = avg !== null ? zoneOf(avg) : null;
  const byEmo = groupBy(list.filter((t) => t.emotion), (t) => t.emotion);
  const top = byEmo.slice().sort((a, b) => b.n - a.n)[0];
  const neutralLogged = list.filter((t) => t.neutral !== undefined); const neutralRate = neutralLogged.length ? neutralLogged.filter((t) => t.neutral).length / neutralLogged.length : null;
  const exitLogged = list.filter((t) => t.exitBehavior);
  const exitRows = [['planned', 'As planned'], ['early', 'Exited early'], ['lateW', 'Late on a winner'], ['lateL', 'Late on a loser']].map(([k, l]) => {
    const ts = exitLogged.filter((t) => (k === 'lateW' ? t.exitBehavior === 'late' && net(t) >= 0 : k === 'lateL' ? lateLoss(t) : t.exitBehavior === k));
    return { k, l, ts, n: ts.length, avgPnl: ts.length ? sum(ts, net) / ts.length : 0, avgScore: ts.filter((t) => edgeScore(t) !== null).length ? sum(ts, edgeScore) / ts.length : null };
  });
  const planned = exitLogged.length ? exitRows[0].n / exitLogged.length : null;
  const combos = list.filter(severeCombo);
  // stability: how often the emotion changes from one trade to the next
  const emoSeq = list.filter((t) => t.emotion).map((t) => t.emotion);
  let shifts = 0; const shiftMap = {}; let bestRun = 0; let run = 0;
  emoSeq.forEach((e, i) => { if (i && e !== emoSeq[i - 1]) { shifts++; const k = `${emoSeq[i - 1]} → ${e}`; shiftMap[k] = (shiftMap[k] || 0) + 1; } run = i && e === emoSeq[i - 1] && !HOT.includes(e) ? run + 1 : HOT.includes(e) ? 0 : 1; bestRun = Math.max(bestRun, run); });
  const shiftRate = emoSeq.length > 1 ? shifts / (emoSeq.length - 1) : null; const stability = shiftRate !== null ? Math.round((1 - shiftRate) * 100) : null;
  const topShift = Object.entries(shiftMap).sort((a, b) => b[1] - a[1])[0];
  const stabTier = stability === null ? '' : stability >= 80 ? 'Elite' : stability >= 60 ? 'Stable' : stability >= 40 ? 'Developing' : 'Reactive';
  // daily score
  const daily = groupBy(scored, (t) => t.date).sort((a, b) => a.key.localeCompare(b.key)).slice(-30).map((d) => ({ key: d.key, v: sum(d.list, edgeScore) / d.list.length }));
  // recommendations ranked by money at stake
  const recs = [];
  if (combos.length) recs.push({ lvl: 'High', t: 'Stop the spiral', d: `${combos.length} trade${combos.length > 1 ? 's' : ''} mixed a hot emotion (FOMO, greed, revenge or frustration) with a late exit on a loser, costing ${money(Math.abs(sum(combos, net)))}.`, a: 'When you notice a hot emotion, step away for two minutes and write your exit before you re-enter.', w: Math.abs(sum(combos, net)) + 1e6 });
  if (exitRows[3].n) recs.push({ lvl: planned !== null && planned < 0.8 ? 'High' : 'Medium', t: 'Exit discipline', d: `${exitRows[3].n} late exits on losers averaged ${money(exitRows[3].avgPnl)}. ${planned !== null ? pct(planned) + ' of exits went as planned.' : ''}`, a: 'Place the hard stop with the entry, and never widen it once the trade is on.', w: Math.abs(sum(exitRows[3].ts, net)) });
  const cg = list.filter((t) => t.grade === 'C'); if (cg.length >= 3 && sum(cg, net) < 0) recs.push({ lvl: 'High', t: 'Cut C-grade trades', d: `Your ${cg.length} C-grade trades lost ${money(Math.abs(sum(cg, net)))} in total.`, a: 'Take only A+ and B setups for the next 20 trades, then compare.', w: Math.abs(sum(cg, net)) });
  if (neutralRate !== null && neutralRate < 0.7) { const att = list.filter((t) => t.neutral === false); recs.push({ lvl: 'Medium', t: 'Detach from the outcome', d: `You felt attached to the result on ${pct(1 - neutralRate)} of trades; those averaged ${money(sum(att, net) / (att.length || 1))}.`, a: 'Decide the risk in money before entry and accept it fully. Hide the P&L column while in a trade.', w: Math.abs(sum(att.filter((t) => net(t) < 0), net)) }); }
  if (shiftRate !== null && shiftRate > 0.4) recs.push({ lvl: 'Medium', t: 'Steady your state', d: `Your emotion changed on ${pct(shiftRate)} of trades in a row${topShift ? `, most often ${topShift[0]}` : ''}.`, a: 'Use the same 3-step pre-trade routine every time: breathe, check plan, check size.', w: 1 });
  const afterL = []; for (let i = 1; i < list.length; i++) if (net(list[i - 1]) < 0 && list[i].date === list[i - 1].date) afterL.push(list[i]);
  if (afterL.length >= 3 && sum(afterL, net) < 0) recs.push({ lvl: 'High', t: 'Cool down after a loss', d: `Trades taken right after a same-day loss lost ${money(Math.abs(sum(afterL, net)))} over ${afterL.length} trades.`, a: 'After any loss, wait 15 minutes before the next entry.', w: Math.abs(sum(afterL, net)) });
  recs.sort((a, b) => b.w - a.w);
  const best = byEmo.filter((r) => r.n >= 2).slice().sort((a, b) => b.net / b.n - a.net / a.n)[0];
  const worst = byEmo.filter((r) => r.n >= 2).slice().sort((a, b) => a.net / a.n - b.net / b.n)[0];
  const insight = !scored.length ? 'Log how you felt and how you exited on your next trades and this page fills in.' :
    `Your mindset score sits in the ${z[1].toLowerCase()} zone${planned !== null ? `, with ${pct(planned)} of exits made as planned` : ''}${neutralRate !== null ? ` and ${pct(neutralRate)} of trades taken detached from the outcome` : ''}. ${best ? `You trade best when ${best.key.toLowerCase()} (${money(best.net / best.n)} per trade)` : ''}${worst && best && worst.key !== best.key ? `, and worst when ${worst.key.toLowerCase()} (${money(worst.net / worst.n)} per trade)` : ''}.`;

  el.innerHTML = `<div class="page">${phead('How you think shapes what you make', 'Mindset', 'A score from 0 to 10 for every trade, built from how you felt, whether you stayed detached and how you exited.', `<div class="seg" id="mSeg">${[['all', 'All'], ['90d', '90 days'], ['30d', '30 days'], ['week', 'Week']].map(([v, l]) => `<button data-v="${v}" class="${MR === v ? 'is-on' : ''}">${l}</button>`).join('')}</div>`)}
  <div class="grid g-4">
    <div class="kpi"><small>Average mindset score</small><b class="z-${z ? z[0] : ''}">${avg !== null ? cnt(avg, 'dec') : '—'}<span class="muted" style="font-size:var(--fs-md)"> / 10</span></b><em>${z ? z[1] : 'no scored trades yet'}</em></div>
    <div class="kpi"><small>Most common state</small><b>${top ? esc(top.key) : '—'}</b><em>${top ? `${top.n} trades` : ''}</em></div>
    <div class="kpi"><small>Detached from outcome</small><b>${neutralRate !== null ? cnt(neutralRate, 'pct') : '—'}</b><em>${neutralLogged.length} trades logged</em></div>
    <div class="kpi"><small>Exits as planned</small><b>${planned !== null ? cnt(planned, 'pct') : '—'}</b><em>${exitRows[3].n} late exits on losers</em></div>
  </div>
  <section class="card" style="margin-top:var(--gap)"><div class="chead"><div class="chead__text"><h3>Mindset thermometer</h3><p>${scored.length} scored trades</p></div></div>
    <div class="thermo"><div class="thermo__bar"><i class="z-red"></i><i class="z-amber"></i><i class="z-green"></i>${avg !== null ? `<span class="thermo__pin" style="left:${avg * 10}%" data-pin><b>${avg.toFixed(1)}</b></span>` : ''}</div>
      <div class="thermo__ticks">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => `<span>${v}</span>`).join('')}</div>
      <div class="grid g-3 thermo__zones"><div><b class="bad">0–4 · Under pressure</b><p>Emotion is steering entries and exits. Impulsive execution.</p></div><div><b class="warn">4–7 · Mixed</b><p>Valid trades mixed with reactive ones. Results swing.</p></div><div><b class="good">7–10 · Process-led</b><p>Plan-first execution and calm exits.</p></div></div></div>
    <div class="note" style="margin-top:16px">${icon('brain')}<span>${esc(insight)}</span></div>
    ${S.ai.configured ? `<div class="row" style="margin-top:12px"><button class="btn btn--sm" id="mAI">${icon('coach')}Ask the coach about my mindset</button></div><div class="ai-out" id="mAIout" style="margin-top:10px"></div>` : ''}
  </section>
  <div class="grid g-2" style="margin-top:var(--gap)">
    ${card('By emotion', 'Performance by how you felt going in', byEmo.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>State</th><th class="r">Trades</th><th class="r">Avg score</th><th class="r">Win rate</th><th class="r">Avg P&amp;L</th><th class="r">Late losses</th><th class="r">Detached</th></tr></thead><tbody>${byEmo.sort((a, b) => b.n - a.n).map((r) => { const sc = r.list.filter((t) => edgeScore(t) !== null); const nl = r.list.filter((t) => t.neutral !== undefined); return `<tr data-drill="${reg(r.list, r.key)}"><td><b>${esc(r.key)}</b></td><td class="r">${r.n}</td><td class="r">${sc.length ? (sum(sc, edgeScore) / sc.length).toFixed(1) : '—'}</td><td class="r">${pct(r.winRate)}</td><td class="r ${tone(r.net)}">${money(r.net / r.n, { sign: true })}</td><td class="r">${pct(r.list.filter(lateLoss).length / r.n)}</td><td class="r">${nl.length ? pct(nl.filter((t) => t.neutral).length / nl.length) : '—'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Tag emotions on your trades to see this.</div>')}
    ${card('Exit behaviour', 'How you leave trades, and what it costs', exitLogged.length ? `<div class="exitbars">${exitRows.map((r) => `<div class="exitbar" data-drill="${reg(r.ts, r.l)}"><div class="row row--between"><b>${r.l}</b><span class="muted">${r.n} · ${pct(r.n / exitLogged.length)}</span></div><div class="meter ${r.k === 'lateL' ? 'meter--bad' : r.k === 'planned' ? '' : 'meter--warn'}"><i data-w="${(r.n / exitLogged.length * 100).toFixed(1)}%"></i></div><div class="row row--between muted" style="font-size:var(--fs-xs)"><span>avg ${money(r.avgPnl, { sign: true })}</span><span>score ${r.avgScore !== null ? r.avgScore.toFixed(1) : '—'}</span></div></div>`).join('')}</div>${combos.length ? `<div class="note note--bad" style="margin-top:14px">${icon('flame')}<span><b>${combos.length} severe combo${combos.length > 1 ? 's' : ''}:</b> hot emotion plus a late exit on a loser, ${money(sum(combos, net))} total.</span></div>` : ''}` : '<div class="empty">Log how you exited (as planned, early or late) to see this.</div>')}
    ${card('Emotional stability', 'How often your state changes from one trade to the next', stability !== null ? `<div class="stab"><div class="bal__num">${cnt(stability, 'int')}<span class="muted" style="font-size:var(--fs-xl)">%</span></div><span class="pill pill--accent">${stabTier}</span></div>
      <div class="stabscale">${['Reactive', 'Developing', 'Stable', 'Elite'].map((t2) => `<span class="${t2 === stabTier ? 'is-on' : ''}">${t2}</span>`).join('')}</div>
      <div class="pace" style="margin-top:14px;grid-template-columns:repeat(3,1fr)"><div class="pace__item"><small>Shift rate</small><b>${pct(shiftRate)}</b></div><div class="pace__item"><small>Longest calm streak</small><b>${bestRun}</b></div><div class="pace__item"><small>Most common shift</small><b style="font-size:var(--fs-sm)">${topShift ? esc(topShift[0]) : '—'}</b></div></div>` : '<div class="empty">Needs at least two trades with an emotion.</div>')}
    ${card('Daily mindset score', 'Last 30 trading days with scored trades', daily.length ? scoreBars(daily) : '<div class="empty">No scored days yet.</div>')}
  </div>
  <section class="card" style="margin-top:var(--gap)"><div class="chead"><div class="chead__text"><h3>Top recommendations</h3><p>Ranked by the money at stake</p></div></div>
    ${recs.length ? `<div class="recs">${recs.slice(0, 3).map((r, i) => `<div class="rec"><span class="rec__n">${i + 1}</span><div><div class="row" style="gap:8px"><b>${esc(r.t)}</b><span class="pill ${r.lvl === 'High' ? 'pill--bad' : 'pill--warn'}">${r.lvl}</span></div><p>${esc(r.d)}</p><p class="rec__a">${icon('check')}${esc(r.a)}</p></div></div>`).join('')}</div>` : `<div class="empty">${icon('check')}<b>Nothing urgent</b>Keep logging emotions and exits; patterns show after about 20 trades.</div>`}
  </section></div>`;
  segBind(el, '#mSeg', (v) => { MR = v; H().refresh(); });
  const ai = $('#mAI', el);
  if (ai) ai.onclick = async () => { const o = $('#mAIout', el); o.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; try { const r = await API.ai({ mode: 'chat', context: aiContext({ trades: list.slice(-60) }), messages: [{ role: 'user', content: 'Analyse my trading psychology: emotions, outcome detachment and exit behaviour. What pattern costs me most, in dollars, and what is one experiment to run for the next 10 trades?' }] }); o.innerHTML = md(r.text); } catch (e) { o.innerHTML = `<span class="bad">${esc(e.message)}</span>`; } };
  after(el);
  const pin = $('[data-pin]', el); if (pin && window.gsap) window.gsap.fromTo(pin, { left: '0%' }, { left: (avg * 10) + '%', duration: 1.6, ease: 'expo.out', delay: 0.3 });
}
function scoreBars(days) {
  return `<div class="scorebars">${days.map((d) => { const z = zoneOf(d.v)[0]; return `<div class="scorebar" title="${esc(fmtDay(d.key))}: ${d.v.toFixed(1)}"><i class="z-${z}" data-grow style="height:${d.v * 10}%"></i><span>${parseISO(d.key).getDate()}</span></div>`; }).join('')}</div>`;
}

// ======================================================================= PROP FIRMS (finances)
let FTAB = 'overview';
export function firms(el) {
  const accs = S.account.filter((a) => a.type !== 'personal');
  const paid = (a) => sum(S.payout.filter((p) => p.accountId === a.id && p.status === 'credited'), (p) => p.amount);
  const byFirm = {}; accs.forEach((a) => { const k = a.firm || 'Other'; (byFirm[k] ||= { firm: k, accs: [], rev: 0, exp: 0 }); byFirm[k].accs.push(a); byFirm[k].rev += paid(a); byFirm[k].exp += accCost(a); });
  const firmsList = Object.values(byFirm).sort((a, b) => (b.rev - b.exp) - (a.rev - a.exp));
  const rev = sum(firmsList, (f) => f.rev); const exp = sum(firmsList, (f) => f.exp); const netP = rev - exp;
  const breached = accs.filter((a) => a.status === 'failed'); const lost = sum(breached, accCost);
  const catTotals = COST_FIELDS.map(([k, l]) => [l, sum(accs, (a) => num(a[k]))]).filter(([, v]) => v > 0);
  const months = {}; accs.forEach((a) => { const k = monthKey(a.purchaseDate || today()); (months[k] ||= { rev: 0, exp: 0 }).exp += accCost(a); });
  S.payout.filter((p) => p.status === 'credited').forEach((p) => { const k = monthKey(p.creditDate || p.reqDate || today()); (months[k] ||= { rev: 0, exp: 0 }).rev += num(p.amount); });
  const mItems = Object.keys(months).sort().slice(-12).map((k) => ({ label: parseISO(k + '-01').toLocaleDateString('en-GB', { month: 'short' }), value: months[k].rev - months[k].exp, tip: parseISO(k + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), sub: `payouts ${money(months[k].rev)} · costs ${money(months[k].exp)}` }));
  const maxF = Math.max(1, ...firmsList.map((f) => Math.max(f.rev, f.exp)));
  const colors = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
  const tabs = { overview: () => `
      <div class="grid g-2">
        ${card('Payouts vs costs by firm', 'Is each firm paying you more than it costs?', firmsList.length ? `<div class="fbars">${firmsList.map((f) => `<div class="fbar"><div class="row row--between"><b>${esc(f.firm)}</b><span class="${tone(f.rev - f.exp)} amt">${money(f.rev - f.exp, { sign: true })}</span></div><div class="fbar__pair"><i class="fbar__rev" style="width:${f.rev / maxF * 100}%"></i></div><div class="fbar__pair"><i class="fbar__exp" style="width:${f.exp / maxF * 100}%"></i></div><small class="muted">payouts ${money(f.rev)} · costs ${money(f.exp)} · ROI ${f.exp ? pct((f.rev - f.exp) / f.exp) : '—'}</small></div>`).join('')}</div><div class="fc__key"><span><i style="background:var(--good)"></i>Payouts</span><span><i style="background:var(--bad)"></i>Costs</span></div>` : '<div class="empty">Add prop accounts and their costs.</div>')}
        ${card('Net by month', 'Payouts received minus accounts bought', tubes(mItems, { h: 200 }))}
      </div>
      <div class="grid g-2" style="margin-top:var(--gap)">
        ${card('Where the money goes', 'Costs by category', catTotals.length ? `<div class="split">${catTotals.map(([l, v], i) => `<i class="split__seg" style="flex:${v};background:${colors[i % colors.length]}" title="${esc(l)}"></i>`).join('')}</div><div class="cats">${catTotals.map(([l, v], i) => `<div class="cat"><span class="dot" style="background:${colors[i % colors.length]}"></span><span class="cat__name">${esc(l)}</span><span class="cat__pct">${pct(v / exp)}</span><span class="cat__amt">${money(v)}</span></div>`).join('')}</div>` : '<div class="empty">No costs logged yet.</div>')}
        ${card('Per-firm summary', '', firmsList.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Firm</th><th class="r">Accounts</th><th class="r">Payouts</th><th class="r">Costs</th><th class="r">Net</th><th class="r">ROI</th></tr></thead><tbody>${firmsList.map((f) => `<tr style="cursor:default"><td><b>${esc(f.firm)}</b></td><td class="r">${f.accs.length}</td><td class="r">${money(f.rev)}</td><td class="r">${money(f.exp)}</td><td class="r amt ${tone(f.rev - f.exp)}">${money(f.rev - f.exp, { sign: true })}</td><td class="r">${f.exp ? pct((f.rev - f.exp) / f.exp) : '—'}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="r">${accs.length}</td><td class="r">${money(rev)}</td><td class="r">${money(exp)}</td><td class="r ${tone(netP)}">${money(netP, { sign: true })}</td><td class="r">${exp ? pct(netP / exp) : '—'}</td></tr></tfoot></table></div>` : '<div class="empty">—</div>')}
      </div>`,
    expenses: () => card('Every account and what it cost', 'Click a row to edit its costs', accs.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Account</th><th>Firm</th><th>Status</th><th>Bought</th>${COST_FIELDS.map(([, l]) => `<th class="r">${l}</th>`).join('')}<th class="r">Total</th></tr></thead><tbody>${accs.map((a) => `<tr data-acc="${a.id}"><td><b>${esc(a.name)}</b></td><td>${esc(a.firm || '—')}</td><td>${helpers.statusPill(a.status)}</td><td>${fmtDate(a.purchaseDate)}</td>${COST_FIELDS.map(([k]) => `<td class="r">${num(a[k]) ? money(a[k]) : '—'}</td>`).join('')}<td class="r amt">${money(accCost(a))}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="4">Total</td>${COST_FIELDS.map(([k]) => `<td class="r">${money(sum(accs, (a) => num(a[k])))}</td>`).join('')}<td class="r">${money(exp)}</td></tr></tfoot></table></div>` : '<div class="empty">No prop accounts yet.</div>'),
    breached: () => `<div class="note" style="margin-bottom:var(--gap)">${icon('info')}<span>A breached account can't pay out, so everything spent on it (evaluation, activation, subscriptions, data) is a sunk cost. Seeing the true cost helps you decide which firms and sizes are worth buying again. Mark an account <b>Breached</b> in its settings to move it here.</span></div>
      <div class="grid g-3">${[['Accounts lost', breached.length, 'int'], ['Capital lost', lost, 'money'], ['Average cost per breach', breached.length ? lost / breached.length : 0, 'money']].map(([l, v, f]) => `<div class="kpi"><small>${l}</small><b class="${l === 'Accounts lost' ? '' : 'bad'}">${cnt(v, f)}</b></div>`).join('')}</div>
      <section class="card" style="margin-top:var(--gap)">${breached.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Account</th><th>Firm</th><th>Size</th><th>Bought</th><th class="r">Traded P&amp;L</th><th class="r">Lost</th></tr></thead><tbody>${breached.map((a) => `<tr data-acc="${a.id}"><td><b>${esc(a.name)}</b></td><td>${esc(a.firm || '')}</td><td>${a.size ? short(a.size) : '—'}</td><td>${fmtDate(a.purchaseDate)}</td><td class="r ${tone(accountMetrics(a).pnl)}">${money(accountMetrics(a).pnl, { sign: true })}</td><td class="r bad">−${money(accCost(a))}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">${icon('shield')}<b>No breached accounts</b>Long may it last.</div>`}</section>` };
  el.innerHTML = `<div class="page">${phead('Run it like a business', 'Prop firms', 'What every firm has cost you, what it has paid you, and your return on each.', `<button class="btn btn--primary" data-act="add">${icon('plus')}Add account</button>`)}
    <div class="grid g-4">${[['Payouts received', rev, 'money', 'good'], ['Total costs', exp, 'money', ''], ['Net profit', netP, 'moneySign', tone(netP)], ['Return on costs', exp ? netP / exp : 0, 'pct', tone(netP)]].map(([l, v, f, c]) => `<div class="kpi"><small>${l}</small><b class="${c}">${cnt(v, f)}</b></div>`).join('')}</div>
    <div class="toolbar" style="margin-top:var(--gap)"><div class="seg seg--accent" id="fTab">${[['overview', 'Overview'], ['expenses', 'Costs'], ['breached', `Breached${breached.length ? ' · ' + breached.length : ''}`]].map(([v, l]) => `<button data-v="${v}" class="${FTAB === v ? 'is-on' : ''}">${l}</button>`).join('')}</div></div>
    <div id="fBody">${tabs[FTAB]()}</div></div>`;
  segBind(el, '#fTab', (v) => { FTAB = v; const b = $('#fBody', el); b.innerHTML = tabs[v](); bindRows(); animateData(b); bindTips(b); if (window.gsap) window.gsap.fromTo(b.children, { opacity: 0, y: 14 }, { opacity: 1, y: 0, stagger: 0.05, duration: 0.5, ease: 'expo.out' }); });
  const bindRows = () => $$('[data-acc]', el).forEach((r) => (r.onclick = () => accountModal(S.account.find((a) => a.id === r.dataset.acc))));
  bindRows();
  el.querySelector('[data-act="add"]').onclick = () => accountModal();
  after(el);
  if (window.gsap) $$('.fbar__rev, .fbar__exp', el).forEach((b, i) => window.gsap.fromTo(b, { scaleX: 0 }, { scaleX: 1, duration: 1, ease: 'expo.out', delay: 0.3 + i * 0.04, transformOrigin: 'left' }));
}

// ======================================================================= REPORTS
let RP = { type: 'month', key: today().slice(0, 7) };
const periodsFor = (type) => {
  const months = [...new Set(S.trade.map((t) => t.date.slice(0, 7)).concat(today().slice(0, 7)))].sort().reverse();
  if (type === 'month') return months.map((m) => [m, parseISO(m + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })]);
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  if (type === 'year') return years.map((y) => [y, y]);
  if (type === 'quarter') return [...new Set(months.map((m) => `${m.slice(0, 4)}-Q${Math.floor((+m.slice(5, 7) - 1) / 3) + 1}`))].map((q) => [q, q.replace('-', ' ')]);
  return [...new Set(months.map((m) => `${m.slice(0, 4)}-H${+m.slice(5, 7) <= 6 ? 1 : 2}`))].map((h) => [h, h.replace('-H', ' H')]);
};
const rangeOf = (type, key) => {
  if (type === 'month') { const d = parseISO(key + '-01'); const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); return [iso(d), iso(e)]; }
  if (type === 'year') return [key + '-01-01', key + '-12-31'];
  const y = +key.slice(0, 4); const n = +key.slice(-1);
  if (type === 'quarter') return [iso(new Date(y, (n - 1) * 3, 1)), iso(new Date(y, n * 3, 0))];
  return [iso(new Date(y, (n - 1) * 6, 1)), iso(new Date(y, n * 6, 0))];
};
export function csvOf(trades) {
  const cols = ['date', 'time', 'exitTime', 'account', 'symbol', 'side', 'qty', 'entry', 'exit', 'stop', 'pnl', 'fees', 'net', 'r', 'setups', 'grade', 'tf', 'trend', 'session', 'emotion', 'exitBehavior', 'detached', 'mindsetScore', 'mistakes', 'followedPlan', 'rating', 'notePlan', 'noteExec', 'noteLesson', 'notes', 'tags'];
  const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = trades.map((t) => [t.date, t.time, t.exitTime, accName(t.accountId), t.symbol, t.side, t.qty, t.entry, t.exit, t.stop, t.pnl, t.fees, net(t).toFixed(2), rMultiple(t)?.toFixed(2) ?? '', setupsOf(t).join(' + '), t.grade, t.tf, t.trend, t.session, t.emotion, t.exitBehavior, t.neutral === undefined ? '' : t.neutral ? 'yes' : 'no', edgeScore(t) ?? '', (t.mistakes || []).join(' / '), t.followedPlan === false ? 'no' : 'yes', t.rating || '', t.notePlan, t.noteExec, t.noteLesson, t.notes, t.tags].map(q).join(','));
  return [cols.join(','), ...rows].join('\n');
}
export function download(name, text, type = 'text/csv') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
export function reports(el) {
  const opts = periodsFor(RP.type); if (!opts.some(([k]) => k === RP.key)) RP.key = opts[0]?.[0];
  const [from, to] = rangeOf(RP.type, RP.key); const list = inRange(FT(), from, to); const st = stats(list);
  const label = opts.find(([k]) => k === RP.key)?.[1] || '';
  const durs = list.map(durationMin).filter((d) => d !== null); const avgHold = durs.length ? sum(durs, (d) => d) / durs.length : null;
  const scored = list.filter((t) => edgeScore(t) !== null);
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => { const l = list.filter((t) => (parseISO(t.date).getDay() + 6) % 7 === i); return { label: d, value: sum(l, net), sub: `${l.length} trades`, trades: l }; });
  const sorted = list.slice().sort((a, b) => net(b) - net(a));
  const pays = S.payout.filter((p) => p.status === 'credited' && (p.creditDate || '') >= from && (p.creditDate || '') <= to);
  const costs = S.account.filter((a) => (a.purchaseDate || '') >= from && (a.purchaseDate || '') <= to);
  el.innerHTML = `<div class="page report-page">${phead('Monthly, quarterly and yearly', 'Reports', 'Pick a period for a full performance summary. Download it as CSV or save it as a PDF.', `<button class="btn" data-act="csvall">${icon('download')}All trades CSV</button>`)}
    <div class="toolbar no-print"><div class="seg" id="rType">${[['month', 'Month'], ['quarter', 'Quarter'], ['half', 'Half-year'], ['year', 'Year']].map(([v, l]) => `<button data-v="${v}" class="${RP.type === v ? 'is-on' : ''}">${l}</button>`).join('')}</div>
      <select class="in" style="width:auto" id="rKey">${opts.map(([k, l]) => `<option value="${k}" ${k === RP.key ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <span style="flex:1"></span><button class="btn" data-act="csv">${icon('download')}CSV</button><button class="btn btn--primary" data-act="pdf">${icon('download')}Save as PDF</button></div>
    <section class="card report">
      <div class="report__head"><span class="mark mark--img"><img src="brand/mark.svg" alt=""></span><div><small>${esc(P().name || '')} · ${esc(fmtDate(from, { day: 'numeric', month: 'short', year: 'numeric' }))} – ${esc(fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' }))}</small><h2>${esc(label)} report</h2></div><span class="report__brand"><span class="wm"><small>THE</small><b>Smart<i>Trade</i></b></span></span></div>
      ${list.length ? `<div class="grid g-4">${[['Net P&L', st.total, 'moneySign', tone(st.total)], ['Trades', st.n, 'int', ''], ['Win rate', st.winRate, 'pct', ''], ['Profit factor', Number.isFinite(st.pf) ? st.pf : 99, 'dec', ''], ['Expectancy', st.expectancy, 'moneySign', tone(st.expectancy)], ['Max drawdown', -st.maxDD, 'moneySign', 'bad'], ['Avg R', st.avgR ?? 0, 'r', ''], ['Avg hold', avgHold ?? 0, 'mins', '']].map(([l, v, f, c]) => `<div class="kpi"><small>${l}</small><b class="${c}">${cnt(v, f)}</b></div>`).join('')}</div>
      <div class="grid g-2" style="margin-top:var(--gap)">
        <div><h4 class="rh">Equity</h4>${equityChart(st.curve, { h: 180, id: 'rp' })}</div>
        <div><h4 class="rh">Daily P&amp;L</h4>${tubes(st.days.map((d) => ({ label: parseISO(d.date).getDate() + '', value: d.net, tip: fmtDay(d.date), sub: `${d.n} trades`, trades: list.filter((t) => t.date === d.date) })), { h: 180 })}</div>
        <div><h4 class="rh">By setup</h4>${hbars(groupBy(list, (t) => setupsOf(t)[0] || 'No setup'))}</div>
        <div><h4 class="rh">By weekday</h4>${tubes(wd, { h: 160 })}</div>
        <div><h4 class="rh">By emotion</h4>${hbars(groupBy(list, (t) => t.emotion || 'Not logged'))}</div>
        <div><h4 class="rh">By exit behaviour</h4>${hbars(groupBy(list, (t) => (EXIT_BEHAVIOR.find(([k]) => k === t.exitBehavior) || [0, 'Not logged'])[1]))}</div>
      </div>
      <div class="grid g-2" style="margin-top:var(--gap)">
        <div><h4 class="rh">Best trades</h4>${tradeList(sorted.slice(0, 3))}</div>
        <div><h4 class="rh">Worst trades</h4>${tradeList(sorted.slice(-3).reverse().filter((t) => net(t) < 0))}</div>
      </div>
      <div class="grid g-3" style="margin-top:var(--gap)">
        <div class="kpi"><small>Fees paid</small><b>${money(st.fees)}</b></div>
        <div class="kpi"><small>Payouts received</small><b class="good">${money(sum(pays, (p) => p.amount))}</b><em>${pays.length} payouts</em></div>
        <div class="kpi"><small>Mindset score</small><b>${scored.length ? (sum(scored, edgeScore) / scored.length).toFixed(1) + ' / 10' : '—'}</b><em>${costs.length ? `${costs.length} accounts bought · ${money(sum(costs, accCost))}` : ''}</em></div>
      </div>` : `<div class="empty">${icon('sheet')}<b>No trades in this period</b>Pick another period.</div>`}
      <p class="report__foot">Generated ${new Date().toLocaleString('en-GB')} · thesmarttrade.in</p>
    </section></div>`;
  segBind(el, '#rType', (v) => { RP.type = v; RP.key = periodsFor(v)[0]?.[0]; H().refresh(); });
  $('#rKey', el).onchange = (e) => { RP.key = e.target.value; H().refresh(); };
  el.querySelector('[data-act="csv"]').onclick = () => download(`smarttrade-${RP.key}.csv`, csvOf(list));
  el.querySelector('[data-act="csvall"]').onclick = () => download(`smarttrade-all-trades-${today()}.csv`, csvOf(S.trade));
  el.querySelector('[data-act="pdf"]').onclick = () => { document.body.classList.add('printing'); setTimeout(() => { try { window.print(); } finally { setTimeout(() => document.body.classList.remove('printing'), 300); } }, 50); };
  bindCommon(el); after(el);
}
