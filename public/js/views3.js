// Global filter, Start my day, Notebook, Agents, Backtesting, Tools, Mentor mode.
import {
  S, P, $, $$, esc, uid, num, sum, clamp, today, addDays, parseISO, weekStart, fmtDate, fmtDay, money, pct, tone, sym,
  net, stats, groupBy, inRange, rMultiple, accName, isLive, icon, API, aiContext, md, save, remove, saveProfile, setupsOf,
  F, setFilter, filterLabels, filterCount, FT, tagList, runAgents, autoTags, agentState, AGENT_METRICS, AGENT_OPS, pointValue, POINT_VALUE,
} from './core.js?v=cfa49f3d';
import { equityChart, hbars } from './charts.js?v=cfa49f3d';
import { helpers, modal, confirmBox } from './views.js?v=cfa49f3d';
import { segInit, toast, shake } from './motion.js?v=cfa49f3d';
import { slider } from './ui.js?v=cfa49f3d';
import * as V4m from './views4.js?v=cfa49f3d';

// views.js imports this module too, so reach helpers lazily (they don't exist yet while modules load)
const card = (...a) => helpers.card(...a); const phead = (...a) => helpers.phead(...a); const cnt = (...a) => helpers.cnt(...a);
const after = (...a) => helpers.after(...a); const field = (...a) => helpers.field(...a); const inp = (...a) => helpers.inp(...a);
const optionList = (...a) => helpers.optionList(...a); const formData = (...a) => helpers.formData(...a);
const H = () => helpers.hooks();
const chipRow = (name, values, selected = [], label = (x) => x) => (values.length
  ? `<div class="chips" data-multi="${name}">${values.map((v) => `<button type="button" class="chip ${selected.includes(v) ? 'is-on' : ''}" data-v="${esc(v)}">${esc(label(v))}</button>`).join('')}</div>`
  : '<span class="muted" style="font-size:var(--fs-sm)">Nothing logged yet</span>');
const segRow = (id, opts, cur) => `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${(cur || '') === v ? 'is-on' : ''}">${l}</button>`).join('')}</div>`;
const bindChips = (root) => $$('[data-multi] .chip', root).forEach((c) => (c.onclick = () => c.classList.toggle('is-on')));
const readChips = (root, name) => $$(`[data-multi="${name}"] .chip.is-on`, root).map((c) => c.dataset.v);

// ======================================================================= GLOBAL FILTER
export const FILTER_PAGES = new Set(['overview', 'trades', 'calendar', 'analytics', 'mindset', 'playbook', 'reports']);
export function filterModal() {
  const syms = [...new Set(S.trade.map((t) => t.symbol).filter(Boolean))].sort();
  const sets = [...new Set(S.trade.flatMap(setupsOf).concat(S.setup.map((s) => s.name)))].filter(Boolean);
  const tags = [...new Set(S.trade.flatMap(tagList))].sort();
  const ranges = [['week', 'This week', weekStart(today())], ['month', 'This month', today().slice(0, 8) + '01'], ['30', 'Last 30 days', addDays(today(), -29)], ['90', 'Last 90 days', addDays(today(), -89)], ['year', 'This year', today().slice(0, 5) + '01-01']];
  const m = modal('Filter your journal', `<div class="stack">
    <p class="muted" style="margin:0;font-size:var(--fs-md)">Applies to Overview, Trades, Calendar, Analytics, Mindset, Playbook and Reports until you clear it.</p>
    ${S.account.length ? field('Accounts', chipRow('accounts', S.account.map((a) => a.id), F.accounts || [], (id) => accName(id))) : ''}
    <div class="field"><span>Dates</span><div class="chips" id="fRanges">${ranges.map(([k, l]) => `<button type="button" class="chip" data-from="${k === 'week' || k === 'month' || k === 'year' || k === '30' || k === '90' ? ranges.find((r) => r[0] === k)[2] : ''}">${l}</button>`).join('')}</div>
      <div class="grid g-2" style="gap:10px;margin-top:8px">${inp('from', F.from, 'type="date" aria-label="From"')}${inp('to', F.to, 'type="date" aria-label="To"')}</div></div>
    ${field('Symbols', chipRow('symbols', syms, F.symbols || []))}
    ${field('Setups', chipRow('setups', sets, F.setups || []))}
    ${field('Setup grade', chipRow('grades', ['A+', 'B', 'C', '—'], F.grades || [], (g) => (g === '—' ? 'Not graded' : g)))}
    <div class="grid g-2" style="gap:12px">${field('Side', segRow('fSide', [['', 'Both'], ['Long', 'Long'], ['Short', 'Short']], F.side))}${field('Result', segRow('fRes', [['', 'All'], ['win', 'Winners'], ['loss', 'Losers']], F.result))}</div>
    ${field('Tags', chipRow('tags', tags, F.tags || [], (x) => '#' + x))}
  </div>`, `<button class="btn btn--ghost" data-act="clear">Clear all</button><span style="flex:1"></span><button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="apply">${icon('filter')}Apply</button>`, 'modal');
  bindChips(m.el); $$('.seg', m.el).forEach((s) => { segInit(s); $$('button', s).forEach((b) => (b.onclick = () => { $$('button', s).forEach((x) => x.classList.toggle('is-on', x === b)); window.__segSelect?.(s, b); })); });
  $$('#fRanges .chip', m.el).forEach((c) => (c.onclick = () => { $('[name=from]', m.el).value = c.dataset.from; $('[name=to]', m.el).value = today(); $$('#fRanges .chip', m.el).forEach((x) => x.classList.toggle('is-on', x === c)); }));
  m.on('clear', () => { setFilter({}); m.close(); renderFilterBar(); H().refresh(); toast('Filter cleared', icon('check')); });
  m.on('apply', () => {
    setFilter({ accounts: readChips(m.el, 'accounts'), symbols: readChips(m.el, 'symbols'), setups: readChips(m.el, 'setups'), grades: readChips(m.el, 'grades'), tags: readChips(m.el, 'tags'),
      from: $('[name=from]', m.el).value, to: $('[name=to]', m.el).value, side: $('#fSide .is-on', m.el)?.dataset.v || '', result: $('#fRes .is-on', m.el)?.dataset.v || '' });
    m.close(); renderFilterBar(); H().refresh();
    toast(filterCount() ? `${FT().length} of ${S.trade.length} trades match` : 'Showing all trades', icon('filter'));
  });
}
export function renderFilterBar(page) {
  const bar = $('#fbar'); const btn = $('#hFilter'); const n = filterCount();
  if (btn) { const b = btn.querySelector('.rbtn__badge'); if (b) { b.hidden = !n; b.textContent = n || ''; } }
  if (!bar) return;
  const show = n && FILTER_PAGES.has(page || (location.hash || '#overview').slice(1));
  bar.hidden = !show; if (!show) return;
  bar.innerHTML = `<span class="fbar__t">${icon('filter')}${FT().length} of ${S.trade.length} trades</span>${filterLabels().map(([k, l]) => `<button class="fchip" data-k="${k}" title="Remove">${esc(l)}${icon('close')}</button>`).join('')}<button class="linkbtn" data-edit>Edit</button><button class="linkbtn" data-clear>Clear</button>`;
  $$('.fchip', bar).forEach((c) => (c.onclick = () => { const k = c.dataset.k; const f = { ...F }; if (k === 'dates') { f.from = ''; f.to = ''; } else f[k] = Array.isArray(f[k]) ? [] : ''; setFilter(f); renderFilterBar(); H().refresh(); }));
  $('[data-edit]', bar).onclick = filterModal;
  $('[data-clear]', bar).onclick = () => { setFilter({}); renderFilterBar(); H().refresh(); };
}

// ======================================================================= START MY DAY + SESSION REVIEW
const DEFAULT_CHECK = ['Checked the economic calendar', 'Marked key levels', 'Set my max loss on the platform', 'Only A+ and B setups today', 'Rested, focused, no tilt'];
export const checklistItems = () => P().prepChecklist?.length ? P().prepChecklist : DEFAULT_CHECK;
const isTradingDay = (d) => ![0, 6].includes(parseISO(d).getDay());
export function streaks() {
  const days = []; let d = today(); for (let i = 0; i < 120; i++) { if (isTradingDay(d)) days.push(d); d = addDays(d, -1); }
  const j = (x) => S.journal.find((e) => e.date === x);
  const prepDone = (x) => { const e = j(x); return !!(e && ((e.checklist || []).length || e.pre)); };
  const revDone = (x) => { const e = j(x); return !!(e && (e.post || e.review)); };
  const run = (fn) => { let n = 0; for (const x of days) { if (x === today() && !fn(x)) continue; if (fn(x)) n++; else break; } return n; };
  const last20 = days.slice(0, 20);
  return { prep: run(prepDone), review: run(revDone), prepRate: last20.filter(prepDone).length / last20.length, reviewRate: last20.filter(revDone).length / last20.length, grid: days.slice(0, 20).reverse().map((x) => ({ d: x, p: prepDone(x), r: revDone(x) })) };
}
export function startDayHTML(j) {
  const items = checklistItems(); const done = j.checklist || [];
  const setups = S.setup.map((s) => s.name); const planned = j.plannedSetups || [];
  return `<section class="card sday"><div class="chead"><div class="chead__text"><h3>Start my day</h3><p>${done.length}/${items.length} checked${j.bias ? ' · bias ' + esc(j.bias) : ''}</p></div><button class="btn btn--sm btn--ghost" data-act="editcheck">${icon('edit')}Edit list</button></div>
    <div class="checklist" id="chk">${items.map((x) => `<button type="button" class="chk ${done.includes(x) ? 'is-on' : ''}" data-v="${esc(x)}"><i>${icon('check')}</i><span>${esc(x)}</span></button>`).join('')}</div>
    <div class="grid g-2" style="gap:12px;margin-top:12px">
      ${field('Bias', segRow('bias', [['Long', 'Long'], ['Short', 'Short'], ['Neutral', 'Neutral']], j.bias || ''))}
      ${field('Max trades today', inp('maxTradesPlan', j.maxTradesPlan || P().risk?.maxTrades || '', 'type="number" min="0" placeholder="e.g. 3"'))}
    </div>
    ${setups.length ? field('Setups I will take', chipRow('plannedSetups', setups, planned)) : ''}
  </section>`;
}
export function bindStartDay(el, j, onChange) {
  $$('#chk .chk', el).forEach((c) => (c.onclick = () => { c.classList.toggle('is-on'); onChange(); if (window.gsap && c.classList.contains('is-on')) window.gsap.fromTo(c.querySelector('i'), { scale: 0.4 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' }); }));
  bindChips(el); $$('[data-multi="plannedSetups"] .chip', el).forEach((c) => c.addEventListener('click', onChange));
  const b = $('#bias', el); if (b) { segInit(b); $$('button', b).forEach((x) => (x.onclick = () => { $$('button', b).forEach((y) => y.classList.toggle('is-on', y === x)); window.__segSelect?.(b, x); onChange(); })); }
  $('[data-act="editcheck"]', el).onclick = () => {
    const m = modal('Your pre-market checklist', `<p class="muted" style="margin:0 0 10px;font-size:var(--fs-md)">One item per line. These show up every morning.</p><textarea class="in" name="items" rows="8">${esc(checklistItems().join('\n'))}</textarea>`, '<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="save">Save</button>', 'modal modal--sm');
    m.on('save', () => { const items = $('[name=items]', m.el).value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 15); saveProfile({ ...P(), prepChecklist: items }); m.close(); H().refresh(); });
  };
}
export const readStartDay = (el) => ({ checklist: $$('#chk .chk.is-on', el).map((c) => c.dataset.v), bias: $('#bias .is-on', el)?.dataset.v || '', plannedSetups: readChips(el, 'plannedSetups'), maxTradesPlan: num($('[name=maxTradesPlan]', el)?.value) || '' });
export function sessionReviewHTML(j, date) {
  const list = S.trade.filter((t) => t.date === date); if (!list.length) return '';
  const r = P().risk || {}; const n = list.length; const dn = sum(list, net);
  const rows = [];
  const maxT = num(j.maxTradesPlan) || num(r.maxTrades);
  if (maxT) rows.push([n <= maxT, `Trades: ${n} of ${maxT} planned`]);
  if (num(r.maxDailyLoss)) rows.push([dn > -num(r.maxDailyLoss), `Day P&L ${money(dn, { sign: true })} vs max loss ${money(r.maxDailyLoss)}`]);
  if ((j.plannedSetups || []).length) { const off = list.filter((t) => setupsOf(t)[0] && !j.plannedSetups.includes(setupsOf(t)[0])); rows.push([!off.length, off.length ? `${off.length} trade${off.length > 1 ? 's' : ''} outside your planned setups (${money(sum(off, net), { sign: true })})` : 'Every trade was a planned setup']); }
  if (j.bias && j.bias !== 'Neutral') { const against = list.filter((t) => t.side !== j.bias); rows.push([!against.length, against.length ? `${against.length} trade${against.length > 1 ? 's' : ''} against your ${j.bias.toLowerCase()} bias (${money(sum(against, net), { sign: true })})` : `All trades with your ${j.bias.toLowerCase()} bias`]); }
  const broke = list.filter((t) => t.followedPlan === false || (t.mistakes || []).some((x) => x !== 'None'));
  rows.push([!broke.length, broke.length ? `${broke.length} trade${broke.length > 1 ? 's' : ''} broke a rule (${money(sum(broke, net), { sign: true })})` : 'No rule breaks logged']);
  if ((j.checklist || []).length < checklistItems().length) rows.push([false, `Checklist ${(j.checklist || []).length}/${checklistItems().length} before the open`]);
  const score = rows.filter(([ok]) => ok).length;
  return `<section class="card"><div class="chead"><div class="chead__text"><h3>Session review</h3><p>Plan vs what actually happened</p></div><span class="pill ${score === rows.length ? 'pill--good' : score >= rows.length / 2 ? '' : 'pill--bad'}">${score}/${rows.length}</span></div>
    <div class="review">${rows.map(([ok, txt]) => `<div class="review__r ${ok ? 'is-ok' : 'is-bad'}"><i>${icon(ok ? 'check' : 'close')}</i><span>${esc(txt)}</span></div>`).join('')}</div></section>`;
}
export function habitHTML() {
  const s = streaks();
  return `<section class="card"><div class="chead"><div class="chead__text"><h3>Habits</h3><p>Last 20 trading days</p></div></div>
    <div class="grid g-2" style="gap:10px"><div class="kpi"><small>Prep streak</small><b>${s.prep} <span class="muted" style="font-size:var(--fs-md)">days</span></b><em>${pct(s.prepRate)} of days prepared</em></div><div class="kpi"><small>Review streak</small><b>${s.review} <span class="muted" style="font-size:var(--fs-md)">days</span></b><em>${pct(s.reviewRate)} of days reviewed</em></div></div>
    <div class="habitgrid">${s.grid.map((g) => `<span title="${esc(fmtDay(g.d))}: ${g.p ? 'prepared' : 'no prep'}, ${g.r ? 'reviewed' : 'no review'}"><i class="${g.p ? 'on' : ''}"></i><i class="${g.r ? 'on' : ''}"></i></span>`).join('')}</div>
    <div class="habitkey"><span><i class="on"></i>Prep</span><span><i class="on"></i>Review (bottom)</span></div></section>`;
}

// ======================================================================= NOTEBOOK
export const FOLDERS = [['premarket', 'Pre-market plans', 'coffee'], ['review', 'Session reviews', 'check'], ['weekly', 'Weekly recaps', 'calendar'], ['idea', 'Trade ideas', 'target'], ['lesson', 'Lessons', 'brain'], ['notes', 'Notes', 'note']];
const TEMPLATES = {
  premarket: ['Pre-market plan', 'Bias:\n\nKey levels:\n- \n\nNews / events today:\n\nSetups I will take:\n\nMax loss today:\nI stop trading if:'],
  review: ['Session review', 'What went well:\n\nWhat went wrong:\n\nDid I follow my plan? Why / why not:\n\nBest trade and why:\n\nWorst trade and why:\n\nOne thing to fix tomorrow:'],
  weekly: ['Weekly recap', 'P&L this week:\n\nBest setup:\n\nBiggest leak:\n\nRules I broke:\n\nMindset this week:\n\nFocus for next week:'],
  idea: ['Trade idea', 'Symbol:\nThesis:\n\nEntry trigger:\nInvalidation:\nTargets:\n\nWhat would make me skip it:'],
  lesson: ['Lesson', 'What happened:\n\nWhat I learned:\n\nRule I am adding or changing:'],
  notes: ['Note', ''],
};
let NB = { folder: 'all', id: null, q: '' };
export function notebook(el) {
  const notes = S.note.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  const shown = notes.filter((n) => (NB.folder === 'all' || n.folder === NB.folder) && (!NB.q || (n.title + ' ' + n.body + ' ' + (n.tags || '')).toLowerCase().includes(NB.q.toLowerCase())));
  const cur = S.note.find((n) => n.id === NB.id) || shown[0] || null; if (cur) NB.id = cur.id;
  el.innerHTML = `<div class="page">${phead('Plans, reviews and lessons in one place', 'Notebook', 'Folders and templates for everything that isn\'t a single trade. The coach reads these too.', `<button class="btn btn--primary" data-act="new">${icon('plus')}New note</button>`)}
  <div class="nb">
    <aside class="nb__side card">
      <label class="nb__search">${icon('search')}<input id="nbQ" placeholder="Search notes" value="${esc(NB.q)}"></label>
      <button class="nb__f ${NB.folder === 'all' ? 'is-on' : ''}" data-f="all">${icon('note')}<span>All notes</span><em>${notes.length}</em></button>
      ${FOLDERS.map(([k, l, ic]) => `<button class="nb__f ${NB.folder === k ? 'is-on' : ''}" data-f="${k}">${icon(ic)}<span>${l}</span><em>${notes.filter((n) => n.folder === k).length}</em></button>`).join('')}
      <div class="nb__list">${shown.map((n) => `<button class="nb__item ${cur && n.id === cur.id ? 'is-on' : ''}" data-id="${n.id}"><b>${n.pinned ? '★ ' : ''}${esc(n.title || 'Untitled')}</b><small>${esc(fmtDate(n.date || today(), { day: 'numeric', month: 'short', year: 'numeric' }))} · ${esc((n.body || '').replace(/\s+/g, ' ').slice(0, 60))}</small></button>`).join('') || '<div class="empty" style="padding:24px 0">No notes here yet.</div>'}</div>
    </aside>
    <section class="card nb__ed">${cur ? `
      <div class="nb__top"><input class="nb__title" name="title" value="${esc(cur.title || '')}" placeholder="Title"><button class="ibtn" data-act="pin" title="Pin">${icon('star')}</button><button class="ibtn" data-act="del" title="Delete">${icon('trash')}</button></div>
      <div class="nb__meta"><select class="in" name="folder">${optionList(FOLDERS.map(([k, l]) => [k, l]), cur.folder)}</select>${inp('date', cur.date || today(), 'type="date"')}${inp('tags', cur.tags, 'placeholder="tags, comma separated"')}</div>
      <textarea class="in nb__body" name="body" placeholder="Write…">${esc(cur.body || '')}</textarea>
      <div class="row row--between"><span class="muted" id="nbSaved" style="font-size:var(--fs-sm)">Saved</span>${S.ai.configured ? `<button class="btn btn--sm" data-act="ai">${icon('coach')}Ask the coach about this</button>` : ''}</div>
      <div class="ai-out" id="nbAI">${cur.ai ? md(cur.ai) : ''}</div>` : `<div class="empty" style="padding:80px 0">${icon('note')}<b>Your notebook is empty</b>Start with a template: pre-market plan, session review, weekly recap, trade idea or lesson.<button class="btn btn--primary" data-act="new" style="margin-top:14px">${icon('plus')}New note</button></div>`}</section>
  </div></div>`;
  $$('[data-act="new"]', el).forEach((b) => (b.onclick = newNoteModal));
  $$('.nb__f', el).forEach((b) => (b.onclick = () => { NB.folder = b.dataset.f; NB.id = null; H().refresh(); }));
  $$('.nb__item', el).forEach((b) => (b.onclick = () => { NB.id = b.dataset.id; H().refresh(); }));
  const q = $('#nbQ', el); let qt; q.oninput = () => { clearTimeout(qt); qt = setTimeout(() => { NB.q = q.value; H().refresh(); setTimeout(() => { const x = $('#nbQ'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 30); }, 350); };
  if (!cur) return after(el);
  let t; const persist = () => { clearTimeout(t); $('#nbSaved', el).textContent = 'Saving…'; t = setTimeout(() => { save('note', { ...cur, ...formData($('.nb__ed', el)), updatedAt: Date.now() }); const s = $('#nbSaved', el); if (s) s.textContent = 'Saved'; }, 500); };
  $$('.nb__ed input, .nb__ed textarea, .nb__ed select', el).forEach((i) => i.addEventListener('input', persist));
  $('[name=folder]', el).addEventListener('change', () => { save('note', { ...cur, ...formData($('.nb__ed', el)), updatedAt: Date.now() }); H().refresh(); });
  $('[data-act="pin"]', el).onclick = () => { save('note', { ...cur, ...formData($('.nb__ed', el)), pinned: !cur.pinned }); H().refresh(); };
  $('[data-act="del"]', el).onclick = () => confirmBox('Delete this note?', 'This can\'t be undone.', () => { remove('note', cur.id); NB.id = null; H().refresh(); });
  const ai = $('[data-act="ai"]', el);
  if (ai) ai.onclick = async () => {
    const out = $('#nbAI', el); out.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; const f = { ...cur, ...formData($('.nb__ed', el)) };
    try { const r = await API.ai({ mode: 'chat', context: aiContext({}), messages: [{ role: 'user', content: `Here is a note from my trading notebook (${FOLDERS.find(([k]) => k === f.folder)?.[1] || 'note'}, ${f.date}).\nTitle: ${f.title}\n\n${f.body}\n\nGive me sharp, specific feedback in under 150 words, using my journal data where it helps. End with one concrete action.` }] }); save('note', { ...f, ai: r.text, updatedAt: Date.now() }); out.innerHTML = md(r.text); }
    catch (e) { out.innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
  };
  after(el);
}
function newNoteModal() {
  const m = modal('New note', `<div class="tpl">${FOLDERS.map(([k, l, ic]) => `<button type="button" class="tpl__c" data-k="${k}"><span class="prodico">${icon(ic)}</span><b>${TEMPLATES[k][0]}</b><small>${k === 'notes' ? 'Blank page' : esc(TEMPLATES[k][1].split('\n').filter(Boolean).slice(0, 3).join(' · '))}</small></button>`).join('')}</div>`, '<button class="btn" data-act="cancel">Cancel</button>', 'modal');
  $$('.tpl__c', m.el).forEach((b) => (b.onclick = () => {
    const k = b.dataset.k; const [title, body] = TEMPLATES[k];
    const n = { id: uid(), folder: k, title: `${title} · ${fmtDate(today())}`, body, date: today(), updatedAt: Date.now() };
    save('note', n); NB = { folder: k, id: n.id, q: '' }; m.close(); H().go('notebook', {}, true); setTimeout(() => H().refresh(), 50);
  }));
}

// ======================================================================= AGENTS
const AUTO = ['after-2-losses', 'quick-reentry', 'overtrading', 'oversized-loss', 'winner-to-loser', 'first-5-min'];
const AUTO_LABEL = { 'after-2-losses': 'Traded after 2 losses', 'quick-reentry': 'Re-entered within 5 min of a loss', overtrading: 'Past your max trades', 'oversized-loss': 'Lost more than planned risk', 'winner-to-loser': 'Winner turned into a loser', 'first-5-min': 'In the first 5 minutes' };
export function agents(el) {
  const on = agentState(); const feed = runAgents(null);
  const auto = groupBy(FT(), (t) => tagList(t).filter((x) => AUTO.includes(x))).map((g) => ({ ...g, key: AUTO_LABEL[g.key] || g.key }));
  const builtins = [
    ['risk', 'Risk agent', 'shield', 'Watches daily loss, losing streaks, max trades, oversized losses and every prop account\'s drawdown. Warns you the moment you log a trade.'],
    ['habit', 'Habit agent', 'coffee', 'Checks that you prepared before the open and reviewed after the close, and nudges you when either slips.'],
    ['autotag', 'Auto-tagger', 'bolt', 'Tags trades for you: after 2 losses, quick re-entry, overtrading, oversized loss, winner turned loser, first 5 minutes.'],
    ['sentiment', 'Sentiment agent', 'brain', 'Reads your journal and notes for frustration, FOMO and overconfidence, and links them to your P&L. Uses AI.'],
  ];
  const sent = P().sentiment;
  el.innerHTML = `<div class="page">${phead('Watchers that never get tired', 'Agents', 'Built-in agents run on every trade you log. Add your own rules without code.', `<button class="btn btn--primary" data-act="new">${icon('plus')}New agent</button>`)}
  <div class="grid g-2">
    <section class="card"><div class="chead"><div class="chead__text"><h3>Right now</h3><p>What your agents see today</p></div></div>
      ${feed.length ? `<div class="txlist">${feed.map(([lvl, agent, title, body]) => `<div class="txrow" style="cursor:default"><span class="prodico ${lvl === 'bad' ? 'is-loss' : ''}">${icon(lvl === 'bad' ? 'shield' : lvl === 'info' ? 'info' : 'flag')}</span><span class="cell__text"><b style="white-space:normal">${esc(title)}</b><small>${esc(agent)} · ${esc(body)}</small></span></div>`).join('')}</div>` : `<div class="empty">${icon('check')}<b>All quiet</b>No rule is close to breaking.</div>`}</section>
    <section class="card"><div class="chead"><div class="chead__text"><h3>Auto-tags</h3><p>What these behaviours cost you. Click a row for the trades.</p></div><button class="btn btn--sm btn--ghost" data-act="retag">${icon('refresh')}Tag past trades</button></div>
      ${auto.length ? hbars(auto) : '<div class="empty">Nothing tagged yet. Tag past trades to see the cost of each habit.</div>'}</section>
  </div>
  <h3 class="sec-t">Built-in agents</h3>
  <div class="grid g-2 agents">${builtins.map(([k, name, ic, d]) => `<section class="card agent"><div class="chead"><span class="prodico">${icon(ic)}</span><div class="chead__text"><h3>${name}</h3><p>${d}</p></div><button type="button" class="switch ${on[k] !== false ? 'is-on' : ''}" data-tog="${k}" aria-label="Turn ${name} on or off"></button></div>
    ${k === 'sentiment' ? `<div class="row" style="gap:8px;margin-top:4px">${S.ai.configured ? `<button class="btn btn--sm" data-act="sent">${icon('coach')}Scan last 14 days</button>` : '<span class="muted" style="font-size:var(--fs-sm)">Needs the AI coach.</span>'}${sent?.at ? `<span class="muted" style="font-size:var(--fs-sm)">Last scan ${esc(fmtDate(sent.at))}</span>` : ''}</div><div class="ai-out" id="sentOut">${sent?.text ? md(sent.text) : ''}</div>` : ''}</section>`).join('')}</div>
  <h3 class="sec-t">Your agents</h3>
  ${S.agent.length ? `<div class="grid g-2 agents">${S.agent.map((a) => `<section class="card agent"><div class="chead"><span class="prodico">${icon('agent')}</span><div class="chead__text"><h3>${esc(a.name)}</h3><p>When ${esc((AGENT_METRICS.find(([k]) => k === a.metric) || [0, a.metric])[1].toLowerCase())} ${esc((AGENT_OPS.find(([k]) => k === a.op) || [0, a.op])[1])} ${esc(String(a.value))}: “${esc(a.message || 'warn me')}”</p></div><button type="button" class="switch ${a.on !== false ? 'is-on' : ''}" data-ctog="${a.id}"></button></div><div class="row" style="justify-content:flex-end;gap:6px"><button class="btn btn--sm btn--ghost" data-cedit="${a.id}">${icon('edit')}Edit</button></div></section>`).join('')}</div>`
    : `<section class="card"><div class="empty">${icon('agent')}<b>Describe a rule, get a watcher</b>Examples: “warn me when I take a trade within 10 minutes of a loss”, “stop me after 4 trades”, “alert when I'm down $600 on the day”.<button class="btn btn--primary" data-act="new" style="margin-top:14px">${icon('plus')}New agent</button></div></section>`}
  </div>`;
  $$('[data-tog]', el).forEach((b) => (b.onclick = () => { b.classList.toggle('is-on'); saveProfile({ ...P(), agents: { ...agentState(), [b.dataset.tog]: b.classList.contains('is-on') } }); }));
  $$('[data-ctog]', el).forEach((b) => (b.onclick = () => { b.classList.toggle('is-on'); const a = S.agent.find((x) => x.id === b.dataset.ctog); save('agent', { ...a, on: b.classList.contains('is-on') }); }));
  $$('[data-cedit]', el).forEach((b) => (b.onclick = () => agentModal(S.agent.find((x) => x.id === b.dataset.cedit))));
  $$('[data-act="new"]', el).forEach((b) => (b.onclick = () => agentModal()));
  $('[data-act="retag"]', el).onclick = () => {
    let n = 0; S.trade.slice().forEach((t) => { const add = autoTags(t).filter((x) => !tagList(t).includes(x)); if (add.length) { save('trade', { ...t, tags: [...tagList(t), ...add].join(', ') }); n++; } });
    toast(n ? `Tagged ${n} trade${n > 1 ? 's' : ''}` : 'Past trades were already tagged', icon('bolt')); H().refresh();
  };
  const sb = $('[data-act="sent"]', el);
  if (sb) sb.onclick = async () => {
    const out = $('#sentOut', el); out.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; sb.disabled = true;
    const from = addDays(today(), -14);
    const journal = S.journal.filter((j) => j.date >= from).map((j) => `${j.date} mood ${j.mood}/5. Pre: ${j.pre || '-'} Post: ${j.post || '-'} Lesson: ${j.lesson || '-'}`).join('\n');
    const notes = S.note.filter((n) => (n.date || '') >= from).map((n) => `${n.date} ${n.title}: ${(n.body || '').slice(0, 600)}`).join('\n');
    const tr = inRange(S.trade, from, today()).map((t) => `${t.date} ${t.time || ''} ${t.symbol} ${money(net(t), { sign: true })} emotion:${t.emotion || '-'} notes:${(t.notes || t.execution || '').slice(0, 120)}`).join('\n');
    try {
      const r = await API.ai({ mode: 'chat', context: aiContext({ trades: inRange(S.trade, from, today()) }), messages: [{ role: 'user', content: `Act as my sentiment agent. Read my last 14 days of journal entries, notes and trade notes below. Find signs of frustration, FOMO, revenge, overconfidence or fear. For each one you find: quote my own words (short), name the days, and show what those days cost or made me in P&L. Finish with one sentence on my overall state and one thing to do tomorrow. Under 200 words, markdown.\n\nJOURNAL:\n${journal || '(none)'}\n\nNOTES:\n${notes || '(none)'}\n\nTRADES:\n${tr || '(none)'}` }] });
      saveProfile({ ...P(), sentiment: { text: r.text, at: today() } }); out.innerHTML = md(r.text);
    } catch (e) { out.innerHTML = `<span class="bad">${esc(e.message)}</span>`; }
    sb.disabled = false;
  };
  after(el);
}
function agentModal(a0) {
  const a = a0 || { metric: 'minutesSinceLoss', op: '<', value: 10, level: 'warn', on: true };
  const m = modal(a0 ? 'Edit agent' : 'New agent', `<div class="stack">
    ${field('Name', inp('name', a.name, 'placeholder="Cool-down after a loss"'))}
    <div class="agentrule"><span>When</span><select class="in" name="metric">${optionList(AGENT_METRICS, a.metric)}</select><select class="in" name="op">${optionList(AGENT_OPS, a.op)}</select>${inp('value', a.value, 'type="number" step="any" style="max-width:120px"')}</div>
    ${field('Tell me', inp('message', a.message, 'placeholder="Step away for 10 minutes. Revenge trades cost you most."'))}
    ${field('How loud', `<select class="in" name="level">${optionList([['warn', 'Warning'], ['bad', 'Stop sign']], a.level)}</select>`)}
    <p class="muted" style="margin:0;font-size:var(--fs-sm)">Agents check every trade you log and the bell on the top bar.</p></div>`,
  `${a0 ? `<button class="btn btn--ghost btn--danger" data-act="del">${icon('trash')}Delete</button><span style="flex:1"></span>` : ''}<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="save">${icon('check')}Save agent</button>`, 'modal modal--sm');
  m.on('save', () => { const f = formData(m.el); if (!f.name.trim()) { shake($('[name=name]', m.el)); return; } save('agent', { ...a, ...f, value: num(f.value), id: a.id || uid() }); m.close(); H().refresh(); toast('Agent is watching', icon('agent')); });
  m.on('del', () => { remove('agent', a.id); m.close(); H().refresh(); });
}

// ======================================================================= BACKTESTING
let BT = { strat: '' };
export function backtest(el) {
  const strategies = [...new Set(S.bt.map((t) => t.strategy).concat(S.setup.map((s) => s.name)))].filter(Boolean);
  if (!BT.strat || !strategies.includes(BT.strat)) BT.strat = strategies[0] || '';
  const list = S.bt.filter((t) => t.strategy === BT.strat).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const rs = list.map((t) => num(t.r)); const wins = rs.filter((r) => r > 0); const losses = rs.filter((r) => r < 0);
  let eq = 0; let peak = 0; let dd = 0; const curve = list.map((t) => { eq += num(t.r); peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); return { date: t.date, eq, net: num(t.r) }; });
  const pf = sum(losses) ? sum(wins) / Math.abs(sum(losses)) : wins.length ? Infinity : 0;
  const live = FT().filter((t) => setupsOf(t)[0] === BT.strat); const liveR = live.map(rMultiple).filter((r) => r !== null);
  const fmtR = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}R`;
  const all = groupBy(S.bt.map((t) => ({ ...t, pnl: num(t.r), fees: 0 })), (t) => t.strategy).map((g) => ({ ...g, list: undefined }));
  el.innerHTML = `<div class="page">${phead('Prove it before you size it', 'Backtesting', 'Log trades from chart replay (TradingView, NinjaTrader, FX Replay) in R. Kept separate from your live stats, then compared with them.', '')}
  <div class="chips" id="btMode" style="margin-bottom:var(--gap)"><button type="button" class="chip ${BT.mode !== 'log' ? 'is-on' : ''}" data-m="ai">${icon('coach')} AI backtest</button><button type="button" class="chip ${BT.mode === 'log' ? 'is-on' : ''}" data-m="log">${icon('flask')} Manual log</button></div>
  ${BT.mode !== 'log' ? V4m.aiBacktestHTML() : ''}
  <div ${BT.mode !== 'log' ? 'hidden' : ''}>
  <section class="card bt__add"><div class="bt__form" id="btForm">
    ${field('Strategy', `<input class="in" name="strategy" list="btS" value="${esc(BT.strat)}" placeholder="e.g. Opening range break"><datalist id="btS">${strategies.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>`)}
    ${field('Symbol', inp('symbol', list[list.length - 1]?.symbol || P().instruments?.[0] || '', 'placeholder="NQ"'))}
    ${field('Date on chart', inp('date', list[list.length - 1]?.date || today(), 'type="date"'))}
    ${field('Side', segRow('btSide', [['Long', 'Long'], ['Short', 'Short']], 'Long'))}
    ${field('Result (R)', inp('r', '', 'type="number" step="0.1" placeholder="-1, 2.5…"'))}
    ${field('Note', inp('note', '', 'placeholder="optional"'))}
    <button class="btn btn--primary" data-act="add">${icon('plus')}Add</button></div>
    <div class="chips" style="margin-top:10px">${[-1, -0.5, 0, 1, 1.5, 2, 3].map((r) => `<button type="button" class="chip" data-quick="${r}">${r > 0 ? '+' : ''}${r}R</button>`).join('')}<span class="muted" style="font-size:var(--fs-sm);align-self:center">quick add with the fields above</span></div></section>
  ${strategies.length ? `<div class="chips" id="btTabs" style="margin:var(--gap) 0">${strategies.map((s) => `<button type="button" class="chip ${s === BT.strat ? 'is-on' : ''}" data-s="${esc(s)}">${esc(s)} <em class="muted" style="font-style:normal">${S.bt.filter((t) => t.strategy === s).length}</em></button>`).join('')}</div>` : ''}
  <div class="grid g-4">${[['Backtest trades', list.length, 'int', ''], ['Win rate', list.length ? wins.length / list.length : 0, 'pct', ''], ['Expectancy', list.length ? sum(rs) / list.length : 0, 'r', tone(sum(rs))], ['Profit factor', Number.isFinite(pf) ? pf : 99, 'dec', pf >= 1 ? 'good' : 'bad']].map(([l, v, f, c]) => `<div class="kpi"><small>${l}</small><b class="${c}">${cnt(v, f)}</b><em>${l === 'Expectancy' ? 'per trade' : l === 'Profit factor' ? `max drawdown ${dd.toFixed(1)}R` : l === 'Win rate' ? `${wins.length}W ${losses.length}L` : esc(BT.strat || 'pick a strategy')}</em></div>`).join('')}</div>
  <div class="grid g-2" style="margin-top:var(--gap)">
    ${card('Backtest equity', 'Cumulative R, in chart-date order', list.length > 1 ? equityChart([{ date: list[0].date, eq: 0, start: true }, ...curve], { h: 220, id: 'bt' }).replace(/\$/g, '') : '<div class="empty">Add a few trades to see the curve.</div>')}
    ${card('Backtest vs live', `${esc(BT.strat || '—')}: does your live trading match the test?`, `<div class="vs"><div><small>Backtest</small><b>${list.length ? fmtR(sum(rs) / list.length) : '—'}</b><em>${list.length} trades · ${list.length ? pct(wins.length / list.length) : '—'} win</em></div><div><small>Live</small><b>${liveR.length ? fmtR(sum(liveR) / liveR.length) : '—'}</b><em>${live.length} trades · ${live.length ? pct(live.filter((t) => net(t) > 0).length / live.length) : '—'} win</em></div></div>
      <p class="muted" style="font-size:var(--fs-md);margin:14px 0 0">${!list.length || !liveR.length ? 'Tag live trades with the same setup name to compare.' : (sum(liveR) / liveR.length) < (sum(rs) / list.length) - 0.3 ? 'Live results trail the backtest by a wide margin. Usually execution: late entries, early exits or skipped trades. Check Exit behaviour in Analytics.' : 'Live results are close to the backtest. The edge is carrying over.'}${list.length && list.length < 30 ? ' Fewer than 30 backtest trades: keep going before you trust it.' : ''}</p>`)}
    ${card('All strategies', 'Total R per strategy', all.length ? hbars(all, { fmt: (v) => fmtR(v) }) : '<div class="empty">No backtests yet.</div>')}
    ${card('Trades', `${list.length} in ${esc(BT.strat || '—')}`, list.length ? `<div class="txlist">${list.slice().reverse().slice(0, 40).map((t) => `<div class="txrow" style="cursor:default"><span class="prodico ${num(t.r) < 0 ? 'is-loss' : ''}">${icon(t.side === 'Short' ? 'trades' : 'up')}</span><span class="cell__text"><b>${esc(t.symbol || '')} ${esc(t.side)}</b><small>${esc(fmtDate(t.date, { day: 'numeric', month: 'short', year: 'numeric' }))}${t.note ? ' · ' + esc(t.note) : ''}</small></span><span class="amt ${tone(num(t.r))}">${fmtR(num(t.r))}</span><button class="ibtn" data-del="${t.id}" aria-label="Delete">${icon('trash')}</button></div>`).join('')}</div>` : '<div class="empty">Nothing logged for this strategy.</div>')}
  </div></div></div>`;
  $$('#btMode .chip', el).forEach((c) => (c.onclick = () => { BT.mode = c.dataset.m; H().refresh(); }));
  if (BT.mode !== 'log') V4m.bindAiBacktest(el);
  const side = $('#btSide', el); segInit(side); $$('button', side).forEach((b) => (b.onclick = () => { $$('button', side).forEach((x) => x.classList.toggle('is-on', x === b)); window.__segSelect?.(side, b); }));
  const add = (r) => {
    const f = formData($('#btForm', el)); const rv = r !== undefined ? r : f.r;
    if (!f.strategy.trim()) { shake($('[name=strategy]', el)); return; }
    if (rv === '' || !Number.isFinite(parseFloat(rv))) { shake($('[name=r]', el)); return; }
    save('bt', { id: uid(), strategy: f.strategy.trim(), symbol: f.symbol.toUpperCase().trim(), date: f.date || today(), side: $('#btSide .is-on', el)?.dataset.v || 'Long', r: parseFloat(rv), note: f.note });
    BT.strat = f.strategy.trim(); H().refresh(); setTimeout(() => $('[name=r]')?.focus(), 60);
  };
  $('[data-act="add"]', el).onclick = () => add();
  $('[name=r]', el).onkeydown = (e) => { if (e.key === 'Enter') add(); };
  $$('[data-quick]', el).forEach((b) => (b.onclick = () => add(+b.dataset.quick)));
  $$('#btTabs .chip', el).forEach((b) => (b.onclick = () => { BT.strat = b.dataset.s; H().refresh(); }));
  $$('[data-del]', el).forEach((b) => (b.onclick = () => { remove('bt', b.dataset.del); H().refresh(); }));
  after(el);
}

// ======================================================================= TOOLS
export function tools(el) {
  const r = P().risk || {}; const syms = Object.keys(POINT_VALUE).filter((k) => !/USD/.test(k)).concat(['EURUSD', 'GBPUSD', 'XAUUSD']);
  const def = (P().instruments || [])[0] || 'NQ';
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  el.innerHTML = `<div class="page">${phead('Quick maths before the trade', 'Tools', 'Position size, reward-to-risk and the economic calendar.', '')}
  <div class="grid g-2">
    <section class="card"><div class="chead"><span class="prodico">${icon('calc')}</span><div class="chead__text"><h3>Position size</h3><p>How many contracts for the risk you planned</p></div></div>
      <div class="stack" id="ps">
        ${field('Instrument', `<input class="in" name="sym" list="psSym" value="${esc(def)}"><datalist id="psSym">${syms.map((s) => `<option value="${s}">`).join('')}</datalist>`, '', '<span id="psPv"></span>')}
        ${r.byGrade ? `<div class="chips" id="psGrade">${['A+', 'B', 'C'].map((g) => `<button type="button" class="chip" data-v="${num(r.byGrade[g])}">${g} · ${money(r.byGrade[g])}</button>`).join('')}</div>` : ''}
        ${slider({ name: 'risk', label: 'Risk on this trade', value: num(r.byGrade?.B) || num(r.perTrade) || 200, min: 25, max: Math.max(500, num(r.maxDailyLoss) || 1000), step: 25, prefix: sym() })}
        <div class="grid g-2" style="gap:12px">${field('Stop distance (points)', inp('stop', 10, 'type="number" step="any" min="0"'))}${field('Target distance (points)', inp('target', 20, 'type="number" step="any" min="0"'))}</div>
        <div class="psout" id="psOut"></div>
      </div></section>
    <section class="card"><div class="chead"><span class="prodico">${icon('calendar')}</span><div class="chead__text"><h3>Economic calendar</h3><p>High and medium impact events · times in your timezone</p></div></div>
      <div id="econ" class="econ"><div class="empty">Loading calendar…</div></div>
      <p class="muted" style="font-size:var(--fs-xs);margin:8px 0 0">Calendar by TradingView.</p></section>
  </div></div>`;
  const ps = $('#ps', el);
  const calc = () => {
    const f = formData(ps); const pv = pointValue(f.sym); const stop = num(f.stop); const tgt = num(f.target); const risk = num(f.risk);
    $('#psPv', el).textContent = pv ? `${sym()}${pv} per point per contract` : 'Unknown point value: set it in Settings';
    if (!pv || !stop) { $('#psOut', el).innerHTML = '<div class="muted">Enter an instrument and stop distance.</div>'; return; }
    const perC = stop * pv; const qty = Math.floor(risk / perC); const micro = POINT_VALUE['M' + String(f.sym).toUpperCase()] ? Math.floor(risk / (stop * POINT_VALUE['M' + String(f.sym).toUpperCase()])) : null;
    $('#psOut', el).innerHTML = `<div class="grid g-3" style="gap:10px"><div class="kpi"><small>Contracts</small><b>${qty}</b><em>${money(perC)} risk each</em></div><div class="kpi"><small>Actual risk</small><b>${money(qty * perC)}</b><em>${qty ? pct(qty * perC / risk) + ' of plan' : 'stop too wide for this risk'}</em></div><div class="kpi"><small>Reward</small><b class="good">${money(qty * tgt * pv)}</b><em>${stop ? (tgt / stop).toFixed(2) : '—'} R</em></div></div>${micro !== null ? `<p class="muted" style="margin:10px 0 0;font-size:var(--fs-md)">Or ${micro} micro${micro === 1 ? '' : 's'} (M${esc(String(f.sym).toUpperCase())}) for finer sizing.</p>` : ''}`;
  };
  ps.addEventListener('input', calc);
  $$('#psGrade .chip', el).forEach((c) => (c.onclick = () => { const s = $('[name=risk]', ps).closest('.sl'); import('./ui.js?v=cfa49f3d').then((u) => { u.setSlider(s, +c.dataset.v); calc(); }); $$('#psGrade .chip', el).forEach((x) => x.classList.toggle('is-on', x === c)); }));
  calc();
  // TradingView economic calendar widget
  const box = $('#econ', el);
  const w = document.createElement('div'); w.className = 'tradingview-widget-container';
  w.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
  const s = document.createElement('script'); s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js'; s.async = true;
  s.innerHTML = JSON.stringify({ colorTheme: theme, isTransparent: true, width: '100%', height: 560, locale: 'en', importanceFilter: '0,1', countryFilter: 'us,eu,gb,jp,cn,in' });
  s.onerror = () => { box.innerHTML = '<div class="empty">Couldn\'t load the calendar. Check your connection or an ad blocker.</div>'; };
  w.append(s); setTimeout(() => { box.innerHTML = ''; box.append(w); }, 50);
  after(el);
}

// ======================================================================= MENTOR MODE
export function mentor(el) {
  el.innerHTML = `<div class="page">${phead('A second pair of eyes', 'Mentor mode', 'Share a read-only link with a mentor or trading friend. They see your trades and stats, and can leave notes on any trade. Turn a link off any time.', `<button class="btn btn--primary" data-act="new">${icon('link')}New share link</button>`)}
  ${S.local ? `<section class="card"><div class="empty">${icon('users')}<b>Needs an account</b>Mentor links work on thesmarttrade.in once you're signed in.</div></section>` : `<div class="grid g-2"><section class="card" id="shares"><div class="empty">Loading…</div></section><section class="card" id="notes"><div class="empty">Loading…</div></section></div>`}</div>`;
  $('[data-act="new"]', el).onclick = () => {
    if (S.local) return toast('Sign in on thesmarttrade.in to share', icon('info'));
    const m = modal('New share link', `<div class="stack">${field('Who is it for?', inp('label', '', 'placeholder="e.g. Coach Rahul"'))}<div class="row row--between"><span class="field"><span>Include my daily journal</span><em class="muted" style="font-style:normal;font-size:var(--fs-sm)">Pre-market plans and reviews. Payouts and costs are never shared.</em></span><button type="button" class="switch" id="incJ"></button></div></div>`, '<button class="btn" data-act="cancel">Cancel</button><button class="btn btn--primary" data-act="save">Create link</button>', 'modal modal--sm');
    $('#incJ', m.el).onclick = (e) => e.currentTarget.classList.toggle('is-on');
    m.on('save', async () => { try { const r = await API.share({ label: $('[name=label]', m.el).value || 'Mentor', includeJournal: $('#incJ', m.el).classList.contains('is-on') }); m.close(); loadShares(el); copyLink(r.share.token); } catch (e) { toast(e.message, icon('info')); } });
  };
  if (!S.local) loadShares(el);
  after(el);
}
const shareUrl = (token) => new URL('mentor.html#' + token, document.baseURI).href;
function copyLink(token) { const u = shareUrl(token); (navigator.clipboard?.writeText(u) || Promise.reject()).then(() => toast('Link copied', icon('copy'))).catch(() => window.prompt('Copy this link', u)); }
async function loadShares(el) {
  try {
    const [{ shares }, { notes }] = await Promise.all([API.shares(), API.mentorNotes()]);
    S.mentorNotes = notes;
    const sh = $('#shares', el); const nt = $('#notes', el); if (!sh) return;
    sh.innerHTML = `<div class="chead"><div class="chead__text"><h3>Share links</h3><p>${shares.length} active</p></div></div>${shares.length ? `<div class="txlist">${shares.map((s) => `<div class="txrow" style="cursor:default"><span class="prodico">${icon('link')}</span><span class="cell__text"><b>${esc(s.label)}</b><small>Created ${esc(fmtDate(new Date(s.created_at).toISOString().slice(0, 10)))}${s.include_journal ? ' · with journal' : ''} · ${notes.filter((n) => n.token === s.token).length} notes</small></span><button class="btn btn--sm" data-copy="${s.token}">${icon('copy')}Copy</button><a class="btn btn--sm btn--ghost" href="${esc(shareUrl(s.token))}" target="_blank" rel="noopener">Open</a><button class="ibtn" data-off="${s.token}" title="Turn off">${icon('trash')}</button></div>`).join('')}</div>` : `<div class="empty">${icon('link')}<b>No links yet</b>Create one and send it to your mentor.</div>`}`;
    nt.innerHTML = `<div class="chead"><div class="chead__text"><h3>Feedback</h3><p>Notes your mentors left</p></div></div>${notes.length ? `<div class="txlist">${notes.map((n) => { const t = S.trade.find((x) => x.id === n.trade_id); return `<div class="txrow" ${t ? `data-trade="${t.id}"` : 'style="cursor:default"'}><span class="av" style="width:36px;height:36px;font-size:13px">${esc((n.author || 'M').slice(0, 1).toUpperCase())}</span><span class="cell__text"><b style="white-space:normal">${esc(n.text)}</b><small>${esc(n.author || 'Mentor')} via ${esc(n.label || 'link')} · ${esc(fmtDate(new Date(n.created_at).toISOString().slice(0, 10)))}${t ? ` · on ${esc(t.symbol)} ${esc(fmtDate(t.date))}` : ''}</small></span></div>`; }).join('')}</div>` : `<div class="empty">${icon('users')}<b>No feedback yet</b>Notes appear here and on the trade itself.</div>`}`;
    $$('[data-copy]', sh).forEach((b) => (b.onclick = () => copyLink(b.dataset.copy)));
    $$('[data-off]', sh).forEach((b) => (b.onclick = () => confirmBox('Turn off this link?', 'Anyone with it loses access, and its notes are deleted.', async () => { await API.unshare(b.dataset.off); loadShares(el); }, 'Turn off')));
    $$('[data-trade]', nt).forEach((r) => (r.onclick = () => import('./views.js?v=cfa49f3d').then((V) => V.tradeModal(S.trade.find((t) => t.id === r.dataset.trade)))));
  } catch (e) { const sh = $('#shares', el); if (sh) sh.innerHTML = `<div class="empty"><b>Couldn't load</b>${esc(e.message)}</div>`; }
}

// ======================================================================= WEEKLY DIGEST
export async function weeklyDigest(box) {
  if (!box || !S.ai.configured) return;
  const ws = weekStart(today()); const prevFrom = addDays(ws, -7); const prevTo = addDays(ws, -1);
  const d = P().digest;
  const render = (x) => { box.innerHTML = `<div class="chead"><span class="prodico">${icon('coach')}</span><div class="chead__text"><h3>Weekly digest</h3><p>Week of ${esc(fmtDate(x.from))} · written by your coach</p></div></div><div class="ai-out">${md(x.text)}</div>`; box.hidden = false; };
  if (d && d.week === ws) return render(d);
  const trades = inRange(S.trade, prevFrom, prevTo); if (trades.length < 3) return;
  box.hidden = false; box.innerHTML = '<div class="chead"><div class="chead__text"><h3>Weekly digest</h3><p>Writing last week\'s digest…</p></div></div><span class="typing"><i></i><i></i><i></i></span>';
  try {
    const r = await API.ai({ mode: 'week', context: aiContext({ trades, focus: `last week ${prevFrom} to ${prevTo}` }), messages: [{ role: 'user', content: `Write my weekly digest for ${prevFrom} to ${prevTo}: net result, best and worst setup, the single most expensive habit (with the dollar cost), what improved vs the week before, and one focus for this week. Under 170 words.` }] });
    const x = { week: ws, from: prevFrom, text: r.text }; saveProfile({ ...P(), digest: x }); render(x);
  } catch (e) { box.hidden = true; }
}
