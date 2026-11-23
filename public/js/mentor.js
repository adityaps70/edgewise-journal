// Read-only journal a trader shared with a mentor. The token in the URL hash is the only key.
import { S, $, $$, esc, num, sum, today, fmtDate, fmtDay, money, pct, tone, net, stats, groupBy, setupsOf, rMultiple, icon, LOGO, WORDMARK, accName } from './core.js?v=3c5c4e56';
import { equityChart, hbars, tubes, bindTips } from './charts.js?v=3c5c4e56';

const token = location.hash.slice(1);
const app = $('#app');
const api = (path, opts = {}) => fetch(new URL('api/shared/' + token + path, document.baseURI), { method: opts.method || 'GET', headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined })
  .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Could not load this journal.'); return d; });
let D = null; let sel = null;
const authorName = () => { try { return localStorage.getItem('st_mentor_name') || ''; } catch (e) { return ''; } };

async function load() {
  if (!token) return fail('This link is missing its key. Ask the trader to send it again.');
  try { D = await api(''); } catch (e) { return fail(e.message); }
  S.profile = { name: D.trader.name, currency: D.trader.currency, risk: D.trader.risk };
  S.trade = D.data.trade.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  S.account = D.data.account; S.setup = D.data.setup; S.journal = D.data.journal;
  render();
}
function fail(msg) { app.innerHTML = `<div class="solo"><div class="solo__card">${LOGO}<h1>Can't open this journal</h1><p>${esc(msg)}</p></div></div>`; }
const notesFor = (id) => D.notes.filter((n) => (id ? n.trade_id === id : !n.trade_id));
function render() {
  const st = stats(S.trade); const recent = S.trade.slice().reverse();
  const bySetup = groupBy(S.trade, (t) => setupsOf(t)[0] || 'No setup');
  const byGrade = groupBy(S.trade, (t) => (t.grade ? t.grade + ' grade' : 'Not graded'));
  const days = st.days.slice(-22).map((d) => ({ label: fmtDate(d.date, { day: 'numeric' }), value: d.net, sub: `${d.n} trades`, tip: fmtDay(d.date) }));
  app.innerHTML = `<div class="mp__wrap">
    <header class="mp__head">${LOGO}${WORDMARK}<span class="pill">Read-only · shared with ${esc(D.label || 'you')}</span></header>
    <div class="phead"><div class="phead__text"><div class="phead__eyebrow">Shared journal</div><h1>${esc(D.trader.name)}</h1><p>${st.n} trades over ${st.tradingDays} trading days. Click any trade to read it and leave a note. ${esc(D.trader.name.split(' ')[0])} sees your notes on the trade.</p></div></div>
    <div class="grid g-4">${[['Net P&L', money(st.total, { sign: true }), tone(st.total), `${st.wins}W ${st.losses}L`], ['Win rate', pct(st.winRate), '', `day win rate ${pct(st.dayWinRate)}`], ['Profit factor', Number.isFinite(st.pf) ? st.pf.toFixed(2) : '∞', st.pf >= 1 ? 'good' : 'bad', `expectancy ${money(st.expectancy, { sign: true })}`], ['Max drawdown', money(-st.maxDD, { sign: true }), 'bad', `avg R ${st.avgR !== null ? st.avgR.toFixed(2) : '—'}`]].map(([l, v, c, e]) => `<div class="kpi"><small>${l}</small><b class="${c}">${v}</b><em>${e}</em></div>`).join('')}</div>
    <div class="grid g-2" style="margin-top:var(--gap)">
      <section class="card"><div class="chead"><div class="chead__text"><h3>Equity curve</h3><p>Closed P&amp;L by day</p></div></div>${equityChart([{ date: st.days[0]?.date || today(), eq: 0, start: true }, ...st.curve], { h: 220, id: 'mp' })}</section>
      <section class="card"><div class="chead"><div class="chead__text"><h3>Daily P&amp;L</h3><p>Last ${days.length} trading days</p></div></div>${tubes(days, { h: 200 })}</section>
      <section class="card"><div class="chead"><div class="chead__text"><h3>By setup</h3></div></div>${hbars(bySetup.map((g) => ({ ...g, list: undefined })))}</section>
      <section class="card"><div class="chead"><div class="chead__text"><h3>By setup grade</h3><p>Is conviction paying?</p></div></div>${hbars(byGrade.map((g) => ({ ...g, list: undefined })))}</section>
    </div>
    <div class="grid g-ov" style="margin-top:var(--gap)">
      <section class="card"><div class="chead"><div class="chead__text"><h3>Trades</h3><p>Newest first</p></div></div><div class="txlist">${recent.slice(0, 150).map((t) => { const n = notesFor(t.id).length; return `<div class="txrow" data-id="${t.id}"><span class="prodico ${net(t) < 0 ? 'is-loss' : ''}">${icon(t.side === 'Short' ? 'trades' : 'up')}</span><span class="cell__text"><b>${esc(t.symbol)} ${esc(t.side || '')}${t.grade ? ` <span class="pill">${esc(t.grade)}</span>` : ''}</b><small>${esc(fmtDate(t.date, { day: 'numeric', month: 'short', year: 'numeric' }))}${t.time ? ' ' + esc(t.time) : ''} · ${esc(setupsOf(t).join(' + ') || 'no setup')} · ${esc(accName(t.accountId))}</small></span>${n ? `<span class="pill">${n} note${n > 1 ? 's' : ''}</span>` : ''}<span class="amt ${tone(net(t))}">${money(net(t), { sign: true })}</span></div>`; }).join('') || '<div class="empty">No trades shared yet.</div>'}</div></section>
      <div class="grid" style="align-content:start">
        <section class="card" id="detail"><div class="empty">${icon('trades')}<b>Pick a trade</b>Its plan, execution, psychology and your notes show here.</div></section>
        <section class="card"><div class="chead"><div class="chead__text"><h3>General feedback</h3><p>Notes not tied to a trade</p></div></div><div id="gen">${noteList(notesFor(null))}</div>${noteForm('')}</section>
        ${S.journal.length ? `<section class="card"><div class="chead"><div class="chead__text"><h3>Journal</h3><p>Latest days</p></div></div><div class="txlist">${S.journal.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map((j) => `<div class="txrow" style="cursor:default;align-items:flex-start"><span class="prodico">${icon('journal')}</span><span class="cell__text"><b>${esc(fmtDay(j.date))}</b><small style="white-space:normal">${esc([j.pre && 'Plan: ' + j.pre, j.post && 'Review: ' + j.post, j.lesson && 'Lesson: ' + j.lesson].filter(Boolean).join(' · ').slice(0, 320))}</small></span></div>`).join('')}</div></section>` : ''}
      </div>
    </div>
    <p class="muted mp__foot">Payouts, costs and account balances are never shared. Powered by The Smart Trade · thesmarttrade.in</p>
  </div>`;
  $$('.txrow[data-id]').forEach((r) => (r.onclick = () => { sel = r.dataset.id; $$('.txrow[data-id]').forEach((x) => x.classList.toggle('is-on', x === r)); detail(); if (innerWidth < 1000) $('#detail').scrollIntoView({ behavior: 'smooth' }); }));
  bindForm($('#gen').parentElement, '');
  bindTips(app);
  if (window.gsap) window.gsap.fromTo('.kpi, .card', { opacity: 0, y: 18 }, { opacity: 1, y: 0, stagger: 0.04, duration: 0.7, ease: 'expo.out' });
  $$('[data-w]').forEach((i) => (i.style.width = i.dataset.w));
}
const noteList = (list) => list.length ? `<div class="stack" style="gap:8px;margin-bottom:12px">${list.map((n) => `<div class="mnote"><span class="av" style="width:32px;height:32px;font-size:12px">${esc((n.author || 'M').slice(0, 1).toUpperCase())}</span><div><b>${esc(n.author || 'Mentor')}</b><small> · ${esc(fmtDate(new Date(n.created_at).toISOString().slice(0, 10)))}</small><p>${esc(n.text)}</p></div></div>`).join('')}</div>` : '';
const noteForm = (tradeId) => `<form class="mform" data-trade="${esc(tradeId)}"><input class="in" name="author" placeholder="Your name" value="${esc(authorName())}" required><textarea class="in" name="text" rows="3" placeholder="${tradeId ? 'What should they see about this trade?' : 'Overall feedback'}" required></textarea><button class="btn btn--primary btn--sm" type="submit">${icon('send')}Leave note</button></form>`;
function bindForm(root, tradeId) {
  const f = $('form.mform', root); if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault(); const author = f.author.value.trim(); const text = f.text.value.trim(); if (!author || !text) return;
    try { localStorage.setItem('st_mentor_name', author); } catch (er) {}
    f.querySelector('button').disabled = true;
    try { const { note } = await api('/notes', { method: 'POST', body: { author, text, tradeId: tradeId || null } }); D.notes.push(note); if (tradeId) detail(); else { $('#gen').innerHTML = noteList(notesFor(null)); f.text.value = ''; } }
    catch (er) { alert(er.message); }
    f.querySelector('button').disabled = false;
  };
}
function detail() {
  const t = S.trade.find((x) => x.id === sel); if (!t) return;
  const row = (k, v) => (v || v === 0 ? `<div class="vcard__row"><span>${k}</span><b>${esc(String(v))}</b></div>` : '');
  const r = rMultiple(t);
  $('#detail').innerHTML = `<div class="chead"><div class="chead__text"><h3>${esc(t.symbol)} ${esc(t.side || '')} · <span class="${tone(net(t))}">${money(net(t), { sign: true })}</span></h3><p>${esc(fmtDay(t.date))}${t.time ? ' · ' + esc(t.time) : ''}${t.exitTime ? '–' + esc(t.exitTime) : ''} · ${esc(accName(t.accountId))}</p></div></div>
    <div class="mp__rows">${row('Setup', setupsOf(t).join(' + '))}${row('Grade', t.grade)}${row('R', r !== null ? r.toFixed(2) + 'R' : '')}${row('Entry / exit', t.entry ? `${t.entry} → ${t.exit || '—'}` : '')}${row('Stop / target', t.stop ? `${t.stop} / ${t.target || '—'}` : '')}${row('Qty', t.qty)}${row('Timeframe', t.tf)}${row('Trend', { with: 'With trend', counter: 'Counter-trend', range: 'Range' }[t.trend])}${row('Emotion', t.emotion)}${row('Exit', { planned: 'As planned', early: 'Exited early', late: 'Exited late' }[t.exitBehavior])}${row('Followed plan', t.followedPlan === false ? 'No' : 'Yes')}${row('Mistakes', (t.mistakes || []).filter((m) => m !== 'None').join(', '))}${row('Tags', t.tags)}${row('Best / worst open P&L', num(t.mfe) || num(t.mae) ? `${money(num(t.mfe))} / ${money(num(t.mae))}` : '')}</div>
    ${[['Plan', t.notePlan], ['Execution', t.noteExec], ['Lesson', t.noteLesson], ['Notes', t.notes]].filter(([, v]) => v).map(([k, v]) => `<div class="mp__note"><small>${k}</small><p>${esc(v)}</p></div>`).join('')}
    <h4 style="margin:16px 0 8px">Mentor notes</h4>${noteList(notesFor(t.id))}${noteForm(t.id)}`;
  bindForm($('#detail'), t.id);
  if (window.gsap) window.gsap.fromTo('#detail > *', { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 0.03, duration: 0.4 });
}
load();
