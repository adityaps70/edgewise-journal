// App shell: boot, auth, onboarding, sidebar + router, header tools.
import {
  APP, S, P, $, $$, esc, uid, num, sum, clamp, iso, today, addDays, parseISO, fmtDate, money, short, pct, local, icon, API, hydrate, loadCache,
  saveProfile, save, sync, flush, MARKETS, DEFAULT_SETUPS, SESSIONS, safeToRisk, accountMetrics, isLive, missionMetrics, net,
} from './core.js';
import { bootShell, enterPage, animateData, movePill, segInit, segSelect, installGlint, installPress, switchTheme, leavePage, toast, wobble, pop, shake, reduced } from './motion.js';
import * as V from './views.js';

// ---------------------------------------------------------------- formatters used by count-ups
window.__fmt = {
  money: (v) => money(v), moneySign: (v) => money(v, { sign: true }), moneyShort: (v) => (v > 0.5 ? '+' : '') + short(v),
  pct: (v) => pct(v), int: (v) => String(Math.round(v)), dec: (v) => (v >= 99 ? '∞' : v.toFixed(2)), r: (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + 'R',
};

// ---------------------------------------------------------------- theme
const root = document.documentElement;
try {
  root.dataset.theme = localStorage.getItem('ew_theme') || 'dark';
  const fr = localStorage.getItem('ew_frost'); if (fr) root.style.setProperty('--frost', fr);
  if (localStorage.getItem('ew_rm') === '1' && window.gsap) window.gsap.globalTimeline.timeScale(1000);
} catch (e) { root.dataset.theme = 'dark'; }
window.__switchTheme = (v, x, y) => switchTheme(v, x, y);

const app = $('#app');

// ---------------------------------------------------------------- boot
async function boot() {
  app.innerHTML = `<div class="boot"><span class="mark">${icon('logo')}</span></div>`;
  try {
    const me = await API.me();
    S.user = me.user; S.ai = me.ai || {};
  } catch (e) {
    if (e.offline) { S.local = true; S.user = { id: 'local', name: '' }; S.ai = { configured: false }; }
    else if (e.status === 401) return auth();
    else { app.innerHTML = `<div class="solo"><div class="solo__card"><h1>Can't reach the server</h1><p>${esc(e.message)}</p><button class="btn btn--primary" onclick="location.reload()">Try again</button></div></div>`; return; }
  }
  const cached = loadCache();
  if (S.local) { if (cached) hydrate(cached); }
  else {
    if (cached) hydrate(cached);
    try { const { data } = await API.data(); hydrate(data); } catch (e) { if (!cached) toast('Offline: showing nothing yet', icon('info')); }
  }
  if (!S.profile) onboarding(); else shell(true);
}

// ---------------------------------------------------------------- auth
function auth(mode = 'login') {
  app.innerHTML = `<div class="solo"><div class="solo__card" id="authCard">
    <span class="mark">${icon('logo')}</span>
    <h1>Your trading journal,<br>with a coach built in.</h1>
    <p>Track every trade, prop account and payout. Claude reads it all and tells you where the money leaks.</p>
    <div class="seg seg--accent" id="authSeg" style="margin-bottom:18px"><button data-v="login" class="${mode === 'login' ? 'is-on' : ''}">Sign in</button><button data-v="signup" class="${mode === 'signup' ? 'is-on' : ''}">Create account</button></div>
    <form class="stack" id="authForm">
      <label class="field" id="nameF" ${mode === 'login' ? 'hidden' : ''}><span>Name</span><input class="in" name="name" autocomplete="name"></label>
      <label class="field"><span>Email</span><input class="in" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input class="in" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="8" required></label>
      <div class="err" id="authErr"></div>
      <button class="btn btn--primary" style="height:46px">${mode === 'login' ? 'Sign in' : 'Create my journal'}</button>
    </form></div></div>`;
  const card = $('#authCard');
  if (window.gsap && !reduced.matches) {
    window.gsap.fromTo(card, { opacity: 0, y: 30, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'expo.out' });
    window.gsap.fromTo(card.children, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.06, ease: 'expo.out', delay: 0.1, clearProps: 'transform,opacity' });
  }
  segInit($('#authSeg'));
  $$('#authSeg button').forEach((b) => b.onclick = () => { segSelect($('#authSeg'), b); const s = b.dataset.v === 'signup'; mode = b.dataset.v; $('#nameF').hidden = !s; $('#authForm button').textContent = s ? 'Create my journal' : 'Sign in'; if (window.gsap) window.gsap.fromTo('#authForm', { opacity: 0.4, y: 6 }, { opacity: 1, y: 0, duration: 0.4 }); });
  $('#authForm').onsubmit = async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const btn = $('#authForm button'); btn.disabled = true;
    try {
      const r = mode === 'login' ? await API.login(f) : await API.signup(f);
      S.user = r.user;
      if (window.gsap && !reduced.matches) await window.gsap.to(card, { scale: 0.96, opacity: 0, duration: 0.3, ease: 'power2.in' });
      boot();
    } catch (err) { $('#authErr').textContent = err.message; shake(card); btn.disabled = false; }
  };
}

// ---------------------------------------------------------------- onboarding
const FIRMS = ['Topstep', 'TopOne Futures', 'Apex Trader Funding', 'Tradeify', 'MyFundedFutures', 'Lucid Trading', 'Take Profit Trader', 'FTMO', 'The5ers', 'FundingPips', 'Alpha Capital'];
const RULES = ['Max 3 trades a day', 'Stop after 2 losses in a row', 'No trades in the first 5 minutes', 'Always set a hard stop', 'No trading during red-folder news', 'Only A+ setups from my playbook', 'Walk away after hitting the daily goal'];
let ob;
function onboarding() {
  const p = S.profile || {};
  ob = {
    step: 0, name: p.name || S.user?.name || '', currency: p.currency || 'USD', localCode: p.local?.code || 'INR', rate: p.local?.rate || '',
    markets: p.markets || [], instruments: p.instruments || [], funding: p.funding || [], firms: p.firms || [],
    accounts: S.account.length ? S.account.map((a) => ({ ...a })) : [],
    hasGoal: p.mission ? true : null, mission: p.mission || { name: '', target: '', start: today(), end: addDays(today(), 41) }, monthEst: '',
    style: p.style || '', sessions: p.sessions || [], sessionTz: p.sessionTz || 'IST',
    setups: S.setup.length ? S.setup.map((s) => s.name) : DEFAULT_SETUPS.slice(0, 4), allSetups: [...new Set([...DEFAULT_SETUPS, ...S.setup.map((s) => s.name)])],
    risk: p.risk || {}, rules: S.rule.length ? S.rule.map((r) => r.text) : [], allRules: [...new Set([...RULES, ...S.rule.map((r) => r.text)])],
    imported: null,
  };
  app.innerHTML = `<div class="solo"><div class="solo__card solo__card--wide" id="ob">
    <div class="row row--between"><span class="row"><span class="mark">${icon('logo')}</span><b style="font-size:var(--fs-2xl)">${APP.name}</b></span><span class="muted" id="obCount"></span></div>
    <ol class="steps" style="margin-top:22px">${[0, 1, 2, 3, 4, 5, 6].map(() => '<li><i></i></li>').join('')}</ol>
    <div id="obBody"></div>
    <div class="row row--between" style="margin-top:26px"><button class="btn btn--ghost" id="obBack">${icon('left')}Back</button><button class="btn btn--primary" id="obNext">Continue${icon('right')}</button></div>
  </div></div>`;
  if (window.gsap && !reduced.matches) window.gsap.fromTo('#ob', { opacity: 0, y: 30, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'expo.out' });
  $('#obBack').onclick = () => obGo(-1);
  $('#obNext').onclick = () => obGo(1);
  obRender(0);
}
const chipRow = (id, all, on, labels = {}) => `<div class="chips" id="${id}">${all.map((v) => `<button type="button" class="chip ${on.includes(v) ? 'is-on' : ''}" data-v="${esc(v)}">${esc(labels[v] || v)}</button>`).join('')}<button type="button" class="chip chip--add" data-add="${id}">${icon('plus')} Add</button></div>`;
function obRender(dir) {
  const s = ob.step; const body = $('#obBody');
  $('#obCount').textContent = `Step ${s + 1} of 7`;
  $$('.steps li').forEach((li, i) => { const fill = li.firstElementChild; const done = i <= s; if (window.gsap && !reduced.matches) window.gsap.to(fill, { scaleX: done ? 1 : 0, duration: 0.7, ease: 'expo.out', delay: done ? 0.05 * (i === s) : 0 }); else fill.style.transform = `scaleX(${done ? 1 : 0})`; });
  $('#obBack').style.visibility = s ? 'visible' : 'hidden';
  $('#obNext').innerHTML = s === 6 ? `${icon('bolt')}Build my dashboard` : `Continue${icon('right')}`;
  const ex = (ob.markets.length ? ob.markets : ['futures']).flatMap((m) => MARKETS[m].examples);
  const instAll = [...new Set([...ex, ...ob.instruments])];
  const prop = ob.funding.includes('prop') || ob.funding.includes('funded');
  const screens = [
    () => `<p class="ob-q">First, who's trading?</p><p class="ob-sub">This sets your greeting, currency and how payouts convert.</p>
      <div class="form" style="grid-template-columns:1fr 1fr">
      <label class="field full"><span>Your name</span><input class="in" id="o_name" value="${esc(ob.name)}" placeholder="Prakhar"></label>
      <label class="field"><span>Account currency</span><select class="in" id="o_cur">${['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD'].map((c) => `<option ${c === ob.currency ? 'selected' : ''}>${c}</option>`).join('')}</select><em>What your P&amp;L and prop accounts are in</em></label>
      <label class="field"><span>Payouts land in</span><select class="in" id="o_loc"><option value="">Same currency</option>${['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'].map((c) => `<option ${c === ob.localCode ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field"><span>Conversion rate</span><input class="in" id="o_rate" type="number" step="any" value="${esc(ob.rate)}" placeholder="e.g. 88"><em>1 ${esc(ob.currency)} = ? — update any time in Settings</em></label></div>`,
    () => `<p class="ob-q">What do you trade?</p><p class="ob-sub">Pick all that apply. It changes units (contracts, lots, shares) and lets the journal calculate P&amp;L for you.</p>
      ${chipRow('o_mk', Object.keys(MARKETS), ob.markets, Object.fromEntries(Object.entries(MARKETS).map(([k, v]) => [k, v.label]))).replace(/<button type="button" class="chip chip--add"[^]*?<\/button>/, '')}
      <p class="ob-q" style="font-size:var(--fs-xl);margin-top:24px">Your main instruments</p><p class="ob-sub">These show up as quick picks when you log a trade.</p>${chipRow('o_in', instAll, ob.instruments)}`,
    () => `<p class="ob-q">How is your trading funded?</p><p class="ob-sub">Prop firm traders get account cards with drawdown buffers, payout tracking and weekly plans.</p>
      ${chipRow('o_fd', ['prop', 'funded', 'own'], ob.funding, { prop: 'Prop firm challenges', funded: 'Funded prop accounts', own: 'My own capital' }).replace(/<button type="button" class="chip chip--add"[^]*?<\/button>/, '')}
      ${prop ? `<p class="ob-q" style="font-size:var(--fs-xl);margin-top:24px">Which firms?</p>${chipRow('o_fm', [...new Set([...FIRMS, ...ob.firms])], ob.firms)}` : ''}`,
    () => `<p class="ob-q">Your accounts</p><p class="ob-sub">Already tracking in a spreadsheet? Import it and we'll pull your accounts, costs, goal and weekly plan.</p>
      <div class="drop" id="o_drop">${icon('sheet')}<div style="flex:1"><b>Import from Excel / Google Sheets export</b><span class="muted" style="font-size:var(--fs-sm)" id="o_dropInfo">${ob.imported ? esc(ob.imported) : '.xlsx with an accounts table (Firm, Cost, Quantity…)'}</span></div><input type="file" id="o_file" accept=".xlsx,.xls,.csv" hidden><button type="button" class="btn btn--sm" id="o_pick">Choose file</button></div>
      <div style="margin-top:18px" id="o_accs"></div>
      <button type="button" class="btn btn--sm" id="o_addAcc" style="margin-top:6px">${icon('plus')}Add account</button>
      <p class="muted" style="font-size:var(--fs-xs);margin-top:12px">Targets, drawdown and daily limits can be added per account later on the Accounts page.</p>`,
    () => `<p class="ob-q">Are you working toward a payout goal?</p><p class="ob-sub">Like clearing a debt or hitting a monthly number. You'll get a progress card, a pace check and a forecast.</p>
      <div class="seg seg--accent" id="o_goalSeg" style="margin-bottom:18px"><button data-v="yes" class="${ob.hasGoal !== false ? 'is-on' : ''}">Yes, I have a goal</button><button data-v="no" class="${ob.hasGoal === false ? 'is-on' : ''}">Not right now</button></div>
      <div class="form" style="grid-template-columns:1fr 1fr" id="o_goal" ${ob.hasGoal === false ? 'hidden' : ''}>
        <label class="field full"><span>Name it</span><input class="in" id="o_gn" value="${esc(ob.mission.name)}" placeholder="Mission No Debt"></label>
        <label class="field"><span>Payout target (${esc(ob.currency)})</span><input class="in" id="o_gt" type="number" step="any" value="${esc(ob.mission.target)}" placeholder="2900"></label>
        <label class="field"><span>This month's payout estimate</span><input class="in" id="o_me" type="number" step="any" value="${esc(ob.monthEst)}" placeholder="900"></label>
        <label class="field"><span>Start</span><input class="in" id="o_gs" type="date" value="${esc(ob.mission.start)}"></label>
        <label class="field"><span>Deadline</span><input class="in" id="o_ge" type="date" value="${esc(ob.mission.end)}"></label></div>`,
    () => `<p class="ob-q">How do you trade?</p><p class="ob-sub">Your style, sessions, setups and the rules you want to be held to.</p>
      <div class="stack"><div class="field"><span>Style</span>${chipRow('o_st', ['Scalping', 'Day trading', 'Swing', 'Positional'], [ob.style]).replace(/<button type="button" class="chip chip--add"[^]*?<\/button>/, '')}</div>
      <div class="field"><span>Sessions you trade</span>${chipRow('o_ss', SESSIONS, ob.sessions).replace(/<button type="button" class="chip chip--add"[^]*?<\/button>/, '')}</div>
      <div class="row row--between"><span class="field"><span>I log trade times in</span></span><div class="seg" id="o_tz"><button data-v="IST" class="${ob.sessionTz === 'IST' ? 'is-on' : ''}">India (IST)</button><button data-v="ET" class="${ob.sessionTz === 'ET' ? 'is-on' : ''}">New York (ET)</button></div></div>
      <div class="field"><span>Setups in your playbook</span>${chipRow('o_su', ob.allSetups, ob.setups)}</div>
      <div class="form" style="grid-template-columns:repeat(4,1fr)"><label class="field"><span>Max daily loss</span><input class="in" id="o_rd" type="number" value="${esc(ob.risk.maxDailyLoss ?? '')}" placeholder="500"></label><label class="field"><span>Max trades / day</span><input class="in" id="o_rt" type="number" value="${esc(ob.risk.maxTrades ?? '')}" placeholder="3"></label><label class="field"><span>Risk per trade</span><input class="in" id="o_rp" type="number" value="${esc(ob.risk.perTrade ?? '')}" placeholder="150"></label><label class="field"><span>Stop after N losses</span><input class="in" id="o_rl" type="number" value="${esc(ob.risk.stopAfterLosses ?? '')}" placeholder="2"></label></div>
      <div class="field"><span>Rules to check every trade against</span>${chipRow('o_ru', ob.allRules, ob.rules)}</div></div>`,
    () => {
      const items = [
        [`Hi ${esc(ob.name || 'trader')}`, `${ob.currency}${ob.localCode && ob.localCode !== ob.currency ? ` → ${ob.localCode}${ob.rate ? ' at ' + ob.rate : ''}` : ''}`],
        ['Markets', ob.markets.map((m) => MARKETS[m].label).join(', ') || 'Futures'], ['Instruments', ob.instruments.join(', ') || '—'],
        ['Accounts', ob.accounts.length ? ob.accounts.map((a) => a.name).join(', ') : 'One personal account'],
        ['Goal', ob.hasGoal !== false && ob.mission.name ? `${ob.mission.name}: ${money(num(ob.mission.target), { c: ob.currency })} by ${fmtDate(ob.mission.end)}` : 'None'],
        ['Playbook', `${ob.setups.length} setups · ${ob.rules.length} rules`], ['Risk', ob.risk.maxDailyLoss ? `max ${money(num(ob.risk.maxDailyLoss), { c: ob.currency })}/day${ob.risk.maxTrades ? `, ${ob.risk.maxTrades} trades` : ''}` : 'Not set'],
      ];
      return `<p class="ob-q">Here's your journal</p><p class="ob-sub">Everything can be changed later in Settings, Accounts and Playbook.</p><div class="txlist">${items.map(([a, b]) => `<div class="txrow" style="cursor:default"><span class="prodico">${icon('check')}</span><span class="cell__text"><b>${a}</b><small>${esc(b)}</small></span></div>`).join('')}</div>`;
    },
  ];
  body.innerHTML = screens[s]();
  if (window.gsap && !reduced.matches) {
    window.gsap.fromTo(body, { opacity: 0, x: 26 * (dir || 1) }, { opacity: 1, x: 0, duration: 0.6, ease: 'expo.out' });
    window.gsap.fromTo(body.querySelectorAll('.ob-q, .ob-sub, .chip, .field, .drop, .txrow, .seg'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.012, delay: 0.05, clearProps: 'transform,opacity' });
  }
  $$('.seg', body).forEach(segInit);
  // chip toggles
  const toggle = (id, single = false) => $$(`#${id} .chip:not(.chip--add)`, body).forEach((c) => c.onclick = () => { if (single) $$(`#${id} .chip`, body).forEach((x) => x !== c && x.classList.remove('is-on')); c.classList.toggle('is-on'); pop(c); if (id === 'o_mk' || id === 'o_fd') { obCollect(); obRender(0); } });
  ['o_mk', 'o_in', 'o_fd', 'o_fm', 'o_ss', 'o_su', 'o_ru'].forEach((id) => toggle(id)); toggle('o_st', true);
  $$('[data-add]', body).forEach((b) => b.onclick = () => {
    const id = b.dataset.add; const input = document.createElement('input'); input.className = 'in'; input.style.cssText = 'width:180px;height:34px;border-radius:99px';
    input.placeholder = 'Type and press Enter'; b.replaceWith(input); input.focus();
    input.onkeydown = (e) => { if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); const v = id === 'o_in' ? input.value.trim().toUpperCase() : input.value.trim(); obCollect(); ({ o_in: () => ob.instruments.push(v), o_fm: () => ob.firms.push(v), o_su: () => { ob.allSetups.push(v); ob.setups.push(v); }, o_ru: () => { ob.allRules.push(v); ob.rules.push(v); } })[id]?.(); obRender(0); } if (e.key === 'Escape') obRender(0); };
  });
  if (s === 3) obAccounts();
  if (s === 4) $$('#o_goalSeg button', body).forEach((b) => b.onclick = () => { segSelect($('#o_goalSeg'), b); ob.hasGoal = b.dataset.v === 'yes'; const g = $('#o_goal'); g.hidden = !ob.hasGoal; if (ob.hasGoal && window.gsap) window.gsap.fromTo(g.children, { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.04, duration: 0.45, ease: 'power3.out' }); });
  if (s === 5) $$('#o_tz button', body).forEach((b) => b.onclick = () => { segSelect($('#o_tz'), b); ob.sessionTz = b.dataset.v; });
}
function obAccounts() {
  const box = $('#o_accs');
  const draw = () => {
    box.innerHTML = ob.accounts.length ? `<div class="ob-acc muted" style="font-size:var(--fs-2xs);font-weight:700"><span>NAME</span><span>FIRM</span><span>TYPE</span><span>COST</span><span>STATUS</span><span></span></div>` + ob.accounts.map((a, i) => `<div class="ob-acc" data-i="${i}">
      <input class="in" data-f="name" value="${esc(a.name)}" placeholder="Topstep 50K #1"><input class="in" data-f="firm" value="${esc(a.firm || '')}" list="obFirms" placeholder="Firm">
      <select class="in" data-f="type">${[['challenge', 'Challenge'], ['funded', 'Funded'], ['personal', 'Own']].map(([v, l]) => `<option value="${v}" ${a.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input class="in" data-f="cost" type="number" step="any" value="${esc(a.cost ?? '')}" placeholder="Cost">
      <select class="in" data-f="status">${[['active', 'Active'], ['funded', 'Funded'], ['passed', 'Passed'], ['failed', 'Failed']].map(([v, l]) => `<option value="${v}" ${a.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button type="button" class="ibtn" data-rm="${i}" aria-label="Remove">${icon('close')}</button></div>`).join('') + `<datalist id="obFirms">${[...FIRMS, ...ob.firms].map((f) => `<option value="${esc(f)}">`).join('')}</datalist>`
      : `<div class="empty" style="padding:18px">${icon('accounts')}<b>No accounts yet</b>Add one, or import your sheet.</div>`;
    $$('[data-f]', box).forEach((inp) => inp.oninput = inp.onchange = () => { const a = ob.accounts[+inp.closest('[data-i]').dataset.i]; a[inp.dataset.f] = inp.type === 'number' ? (inp.value === '' ? '' : num(inp.value)) : inp.value; if (inp.dataset.f === 'type' && inp.value === 'funded') a.status = 'funded'; });
    $$('[data-rm]', box).forEach((b) => b.onclick = () => { ob.accounts.splice(+b.dataset.rm, 1); draw(); });
  };
  draw();
  $('#o_addAcc').onclick = () => {
    const firm = ob.firms[0] || ''; const n = ob.accounts.filter((a) => a.firm === firm).length + 1;
    ob.accounts.push({ id: uid(), name: firm ? `${firm} 50K #${n}` : 'Personal', firm, type: ob.funding.includes('prop') ? 'challenge' : ob.funding.includes('funded') ? 'funded' : 'personal', status: ob.funding.includes('prop') ? 'active' : 'funded', cost: '', size: firm ? 50000 : '', purchaseDate: today(), ddType: 'trailing' });
    draw(); const last = box.querySelector('.ob-acc:last-of-type'); if (window.gsap && last) window.gsap.fromTo(last, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.6)' });
  };
  $('#o_pick').onclick = () => $('#o_file').click();
  const handle = async (file) => {
    if (!file) return;
    $('#o_dropInfo').textContent = 'Reading…';
    try {
      const res = await importWorkbook(file);
      Object.assign(ob, res.patch);
      ob.imported = `${file.name}: ${res.summary}`;
      obRender(0); toast('Sheet imported', icon('check'));
    } catch (e) { $('#o_dropInfo').textContent = e.message; shake($('#o_drop')); }
  };
  $('#o_file').onchange = (e) => handle(e.target.files[0]);
  const drop = $('#o_drop');
  drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; };
  drop.ondragleave = () => (drop.style.borderColor = '');
  drop.ondrop = (e) => { e.preventDefault(); drop.style.borderColor = ''; handle(e.dataTransfer.files[0]); };
}
function obCollect() {
  const v = (id) => $('#' + id)?.value;
  const on = (id) => $$(`#${id} .chip.is-on`).map((c) => c.dataset.v);
  switch (ob.step) {
    case 0: ob.name = v('o_name') ?? ob.name; ob.currency = v('o_cur') || ob.currency; ob.localCode = v('o_loc') ?? ob.localCode; ob.rate = v('o_rate') ?? ob.rate; break;
    case 1: ob.markets = on('o_mk'); ob.instruments = on('o_in'); break;
    case 2: ob.funding = on('o_fd'); if ($('#o_fm')) ob.firms = on('o_fm'); break;
    case 4: if (ob.hasGoal === null) ob.hasGoal = true; ob.mission = { ...ob.mission, name: v('o_gn') ?? ob.mission.name, target: v('o_gt') ?? ob.mission.target, start: v('o_gs') || ob.mission.start, end: v('o_ge') || ob.mission.end }; ob.monthEst = v('o_me') ?? ob.monthEst; break;
    case 5: ob.style = on('o_st')[0] || ''; ob.sessions = on('o_ss'); ob.setups = on('o_su'); ob.rules = on('o_ru'); ob.risk = { maxDailyLoss: num(v('o_rd')) || '', maxTrades: num(v('o_rt')) || '', perTrade: num(v('o_rp')) || '', stopAfterLosses: num(v('o_rl')) || '' }; break;
    default:
  }
}
function obGo(d) {
  obCollect();
  if (d > 0) {
    if (ob.step === 0 && !ob.name.trim()) { shake($('#o_name')); $('#o_name').focus(); return; }
    if (ob.step === 1 && !ob.markets.length) { shake($('#o_mk')); toast('Pick at least one market', icon('info')); return; }
    if (ob.step === 2 && !ob.funding.length) { shake($('#o_fd')); toast('Pick how you are funded', icon('info')); return; }
    if (ob.step === 3 && !ob.accounts.length) ob.accounts.push({ id: uid(), name: ob.funding.includes('own') ? 'Personal' : `${ob.firms[0] || 'Prop'} account`, firm: ob.funding.includes('own') ? '' : ob.firms[0] || '', type: ob.funding.includes('own') ? 'personal' : 'challenge', status: ob.funding.includes('own') ? 'funded' : 'active', purchaseDate: today() });
    if (ob.step === 6) return obFinish();
  }
  ob.step = clamp(ob.step + d, 0, 6); obRender(d);
}
async function obFinish() {
  const btn = $('#obNext'); btn.disabled = true;
  const prof = {
    ...(S.profile || {}), name: ob.name.trim(), currency: ob.currency, local: ob.localCode && ob.localCode !== ob.currency ? { code: ob.localCode, rate: num(ob.rate) } : null,
    markets: ob.markets, instruments: ob.instruments, funding: ob.funding, firms: ob.firms, style: ob.style, sessions: ob.sessions, sessionTz: ob.sessionTz, risk: ob.risk,
    mission: ob.hasGoal !== false && ob.mission.name ? { ...ob.mission, target: num(ob.mission.target) } : null,
    monthlyTargets: { ...((S.profile || {}).monthlyTargets || {}), ...(ob.monthlyTargets || {}), ...(ob.monthEst ? { [today().slice(0, 7)]: num(ob.monthEst) } : {}) },
    onboardedAt: Date.now(),
  };
  saveProfile(prof);
  ob.accounts.forEach((a) => save('account', { ddType: 'trailing', ...a, id: a.id || uid() }));
  const existing = new Set(S.setup.map((s) => s.name)); ob.setups.filter((n) => !existing.has(n)).forEach((name) => save('setup', { name }));
  const er = new Set(S.rule.map((r) => r.text)); ob.rules.filter((t) => !er.has(t)).forEach((text) => save('rule', { text }));
  if (ob.plan && !S.plan.length) save('plan', ob.plan);
  await flush();
  if (window.gsap && !reduced.matches) await window.gsap.to('#ob', { scale: 0.96, opacity: 0, y: -10, duration: 0.4, ease: 'power2.in' });
  location.hash = '#overview'; shell(true);
}

// spreadsheet import (works with the "Mission No Debt" layout and similar)
async function importWorkbook(file) {
  if (!window.XLSX) throw new Error('Spreadsheet reader failed to load.');
  const wb = window.XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const norm = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9%]/g, '');
  const dt = (x) => (x instanceof Date ? iso(new Date(x.getTime() + 12 * 3600e3)) : typeof x === 'number' && x > 30000 ? iso(new Date(Math.round((x - 25569) * 864e5) + 12 * 3600e3)) : '');
  const patch = { accounts: [], monthlyTargets: {} }; const notes = [];
  let accRows = []; let planRows = []; let mission = null; let title = '';
  const sheets = wb.SheetNames.map((n) => ({ name: n, rows: window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
  for (const { name, rows } of sheets) {
    rows.forEach((r, i) => {
      const cells = r.map(norm);
      if (!title && i < 3 && r[0] && typeof r[0] === 'string' && r.filter((x) => x !== '').length === 1) title = r[0];
      // accounts table: Firm | Cost | Quantity | Passed | Ongoing Funded | Date
      if (cells[0] === 'firm' && cells.includes('cost') && cells.includes('quantity') && !accRows.length) {
        const ix = (k) => cells.findIndex((c) => c.startsWith(k));
        for (let j = i + 1; j < rows.length; j++) {
          const row = rows[j]; if (!row[0] || /^total/i.test(row[0])) break;
          accRows.push({ firm: String(row[0]).trim(), cost: num(row[ix('cost')]), qty: num(row[ix('quantity')]) || 1, passed: num(row[ix('passed')]), funded: num(row[ix('ongoingfunded')] ?? row[ix('ongoing')]), failed: ix('failed') >= 0 ? num(row[ix('failed')]) : 0, date: dt(row[ix('date')]) });
        }
      }
      // first 5-day plan block: Firm | BALANCE START | WEEKLY GOAL | PER DAY | PAYOUT AMOUNT
      if (cells[0] === 'firm' && cells.includes('balancestart') && !planRows.length) {
        const ix = (k) => cells.findIndex((c) => c.startsWith(k));
        for (let j = i + 1; j < rows.length; j++) { const row = rows[j]; if (!row[0] || /^total/i.test(row[0])) break; planRows.push({ label: String(row[0]).trim(), balanceStart: num(row[ix('balancestart')]), goal: num(row[ix('weeklygoal')]), payout: num(row[ix('payoutamount')]) }); }
      }
      // mission: Month | Est. Payout | Actual ... (first data row) and Start Date | End Date
      if (cells[0] === 'month' && cells.some((c) => c.startsWith('estpayout'))) {
        const ix = cells.findIndex((c) => c.startsWith('estpayout'));
        for (let j = i + 1; j < Math.min(rows.length, i + 14); j++) {
          const row = rows[j]; if (!row[0] || /^total/i.test(row[0])) continue;
          const lab = String(row[0]); const est = num(row[ix]);
          const mIdx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(lab.slice(0, 3).toLowerCase());
          if (mIdx >= 0 && est) { const yr = (mission?.start || today()).slice(0, 4); patch.monthlyTargets[`${yr}-${String(mIdx + 1).padStart(2, '0')}`] = est; }
          else if (est && !mission) mission = { label: lab, target: est };
        }
      }
      if (cells[0] === 'startdate' && cells[1] === 'enddate') { const row = rows[i + 1] || []; mission = { ...(mission || {}), start: dt(row[0]), end: dt(row[1]) }; }
    });
  }
  // build accounts, naming them after the plan rows when they match the firm
  const used = new Set();
  accRows.forEach((a) => {
    const key = norm(a.firm);
    const labels = planRows.filter((p) => norm(p.label).startsWith(key) && !used.has(p.label));
    for (let k = 0; k < a.qty; k++) {
      const label = labels[k]?.label; if (label) used.add(label);
      const sizeM = (label || '').match(/(\d+)\s*k/i);
      const isFunded = k < a.funded; const isPassed = !isFunded && k < a.funded + a.passed - (a.funded ? Math.min(a.funded, a.passed) : 0);
      const isFailed = !isFunded && !isPassed && k >= a.qty - a.failed;
      const pr = planRows.find((p) => p.label === label);
      patch.accounts.push({ id: uid(), name: label || `${a.firm} #${k + 1}`, firm: a.firm, type: isFunded ? 'funded' : 'challenge', status: isFunded ? 'funded' : isPassed ? 'passed' : isFailed ? 'failed' : 'active', cost: a.cost, size: sizeM ? num(sizeM[1]) * 1000 : '', purchaseDate: a.date || today(), startPnl: pr ? pr.balanceStart : '', ddType: 'trailing' });
    }
  });
  if (!patch.accounts.length) throw new Error('No accounts table found (looking for a header row: Firm, Cost, Quantity).');
  const firms = [...new Set(accRows.map((a) => a.firm))];
  patch.firms = [...new Set([...(ob.firms || []), ...firms])];
  patch.funding = [...new Set([...(ob.funding || []), 'prop', ...(patch.accounts.some((a) => a.type === 'funded') ? ['funded'] : [])])];
  if (mission) {
    const nm = title ? title.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : 'Payout goal';
    patch.mission = { name: nm, target: mission.target || '', start: mission.start || today(), end: mission.end || addDays(today(), 41) };
    patch.hasGoal = true; notes.push(`goal ${nm}`);
    if (Object.keys(patch.monthlyTargets).length) { const k = Object.keys(patch.monthlyTargets).sort()[0]; patch.monthEst = patch.monthlyTargets[k]; }
  }
  if (planRows.length) {
    patch.plan = { id: uid(), title: 'First 5 trading days', start: patch.mission?.start || today(), days: 5, rows: planRows.map((p) => ({ accountId: patch.accounts.find((a) => a.name === p.label)?.id || '', label: p.label, balanceStart: p.balanceStart, goal: p.goal, payout: p.payout })) };
    notes.push('5-day plan');
  }
  patch.markets = ob.markets.length ? ob.markets : ['futures'];
  return { patch, summary: `${patch.accounts.length} accounts${notes.length ? ', ' + notes.join(', ') : ''}` };
}

// ---------------------------------------------------------------- shell
const VIEWS = {
  overview: ['Overview', 'overview', V.overview], trades: ['Trades', 'trades', V.trades], calendar: ['Calendar', 'calendar', V.calendar],
  accounts: ['Accounts', 'accounts', V.accounts], payouts: ['Payouts', 'payouts', V.payouts], plan: ['Weekly plan', 'plan', V.plan],
  analytics: ['Analytics', 'analytics', V.analytics], journal: ['Journal', 'journal', V.journal], playbook: ['Playbook', 'playbook', V.playbook],
  coach: ['AI coach', 'coach', V.coach], settings: ['Settings', 'settings', V.settings],
};
function navItems() {
  const p = P(); const prop = (p.funding || []).some((f) => f !== 'own') || S.account.some((a) => a.type !== 'personal');
  const list = ['overview', 'trades', 'calendar'];
  if (S.account.length) list.push('accounts');
  if (prop || S.payout.length) list.push('payouts');
  if (prop || p.mission || S.plan.length) list.push('plan');
  list.push('analytics', 'journal', 'playbook', 'coach');
  return list;
}
let current = null;
function shell(first = false) {
  const p = P();
  app.innerHTML = `<div class="app"><div class="slab" id="slab">
    <aside class="side"><div class="side__top"><span class="mark">${icon('logo')}</span><span class="side__name"><b>${APP.name}</b><small>${esc(p.mission?.name || (p.name ? p.name.split(' ')[0] + "'s journal" : APP.tagline))}</small></span><button class="side__fold" id="fold" aria-label="Collapse sidebar">${icon('fold')}</button></div>
      <nav class="nav" id="nav" aria-label="Sections"><span class="nav__pill"></span></nav>
      <div class="safe" id="safe"></div>
      <div class="side__me"><span class="av">${esc(initials())}<i class="av__dot"></i></span><span class="me__text"><b>${esc(p.name || 'Trader')}</b><small>${esc(S.local ? 'Local mode' : S.user?.email || '')}</small></span><button class="ibtn" id="meMore" aria-label="Account menu">${icon('more')}</button></div>
    </aside>
    <div class="stage">
      <header class="head"><button class="rbtn head__menu" id="menu" aria-label="Menu">${icon('menu')}</button>
        <label class="head__search">${icon('search')}<input id="q" placeholder="Search trades, symbols, setups" autocomplete="off"><span class="kbd">⌘K</span></label>
        <button class="rbtn rbtn--accent" id="hLog" aria-label="Log trade" title="Log trade">${icon('plus')}</button>
        <button class="rbtn" id="hAI" aria-label="AI coach" title="AI coach">${icon('coach')}</button>
        <span class="head__sep"></span>
        <button class="rbtn rbtn--plain" id="hTheme" aria-label="Switch theme" title="Switch theme">${icon(root.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
        <button class="rbtn rbtn--plain" id="hBell" aria-label="Alerts">${icon('bell')}<i class="rbtn__badge" hidden></i></button>
        <button class="rbtn head__me" id="hMe" aria-label="Settings"><span class="av" style="width:44px;height:44px">${esc(initials())}</span></button>
      </header>
      <main class="main" id="main"></main>
    </div></div></div>`;
  buildNav();
  updateSide();
  $('#fold').onclick = () => { $('#slab').classList.toggle('is-rail'); setTimeout(() => movePill($('#nav'), false), 520); };
  $('#menu').onclick = (e) => { e.stopPropagation(); $('#slab').classList.toggle('is-open'); };
  $('.stage').addEventListener('click', (e) => { const s = $('#slab'); if (s.classList.contains('is-open') && !e.target.closest('#menu')) { e.preventDefault(); e.stopPropagation(); s.classList.remove('is-open'); } }, true);
  $('#hLog').onclick = (e) => { wobble(e.currentTarget.firstElementChild); V.tradeModal(); };
  $('#hAI').onclick = (e) => { wobble(e.currentTarget.firstElementChild); go('coach'); };
  $('#hMe').onclick = () => go('settings');
  $('#meMore').onclick = () => go('settings');
  $('#hTheme').onclick = (e) => { const next = root.dataset.theme === 'dark' ? 'light' : 'dark'; const r = e.currentTarget.getBoundingClientRect(); switchTheme(next, r.left + r.width / 2, r.top + r.height / 2); e.currentTarget.innerHTML = icon(next === 'dark' ? 'sun' : 'moon'); pop(e.currentTarget); };
  $('#hBell').onclick = (e) => { wobble(e.currentTarget.firstElementChild); alertsModal(); };
  const q = $('#q');
  q.onkeydown = (e) => { if (e.key === 'Enter') { V.setTradeQuery(q.value.trim()); go('trades', {}, true); q.blur(); } if (e.key === 'Escape') q.blur(); };
  document.onkeydown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); q.focus(); q.select(); }
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !/input|textarea|select/i.test(document.activeElement.tagName) && !$('.scrim')) { e.preventDefault(); V.tradeModal(); }
  };
  sync.onChange = () => { const d = $('.side__me .av__dot'); if (d) d.style.background = sync.state === 'error' ? 'var(--bad)' : sync.state === 'saving' ? 'var(--warn)' : 'var(--mint)'; };
  route(first);
  if (first) bootShell(app);
}
const initials = () => (P().name || S.user?.email || 'T').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
function buildNav() {
  const nav = $('#nav'); const items = navItems();
  const todayN = S.trade.filter((t) => t.date === today()).length;
  const atRisk = S.account.filter(isLive).filter((a) => { const m = accountMetrics(a); return m.buffer !== null && m.maxLoss && m.buffer < m.maxLoss * 0.3; }).length;
  const pending = S.payout.filter((p) => p.status === 'requested').length;
  nav.innerHTML = '<span class="nav__pill"></span>' + [...items, 'settings'].map((id) => {
    const [label, ic] = VIEWS[id];
    const badge = id === 'trades' && todayN ? `<span class="nav__count">${todayN}</span>` : id === 'accounts' && atRisk ? `<span class="nav__count" style="background:var(--bad-soft);color:var(--bad)">${atRisk}</span>` : id === 'payouts' && pending ? `<span class="nav__count">${pending}</span>` : id === 'coach' ? '<span class="nav__ai">AI</span>' : '';
    return `<a class="nav__item${id === 'settings' ? ' nav__item--gap' : ''}" href="#${id}" data-id="${id}" ${id === current ? 'aria-current="page"' : ''}>${icon(ic)}<span class="nav__label">${label}</span>${badge}</a>`;
  }).join('');
  $$('.nav__item', nav).forEach((a) => a.onclick = () => $('#slab').classList.remove('is-open'));
  requestAnimationFrame(() => movePill(nav, false));
}
function updateSide() {
  const r = safeToRisk(); const box = $('#safe'); if (!box) return;
  const m = missionMetrics();
  if (r.amount !== null) {
    box.innerHTML = `<small>Safe to risk today</small><b>${money(r.amount)}</b><p>${r.tradesLeft !== null ? `${r.tradesLeft} trade${r.tradesLeft === 1 ? '' : 's'} left · ` : ''}${r.todayNet ? `today ${money(r.todayNet, { sign: true })}` : 'no trades yet today'}</p>${r.rule ? `<div class="meter ${r.amount < r.rule * 0.3 ? 'meter--bad' : ''}"><i style="width:${clamp(r.amount / r.rule, 0, 1) * 100}%"></i></div>` : ''}`;
  } else if (m) {
    box.innerHTML = `<small>${esc(m.name)}</small><b>${money(m.actual)}</b><p>of ${money(m.target)} · ${m.tdLeft} trading days left</p><div class="meter"><i style="width:${m.progress * 100}%"></i></div>`;
  } else box.innerHTML = `<small>Today</small><b>${money(r.todayNet, { sign: true })}</b><p>${r.tradesToday} trades · set limits in Playbook</p>`;
  const alerts = getAlerts(); const badge = $('#hBell .rbtn__badge'); if (badge) badge.hidden = !alerts.length;
}
function getAlerts() {
  const out = [];
  S.account.filter(isLive).forEach((a) => {
    const m = accountMetrics(a);
    if (m.buffer !== null && m.maxLoss && m.buffer < m.maxLoss * 0.3) out.push(['bad', 'shield', `${a.name}: only ${money(m.buffer)} drawdown left`, 'Size down or sit out until you rebuild a cushion.']);
    if (m.dailyLeft !== null && m.dailyLeft <= 0) out.push(['bad', 'flag', `${a.name}: daily loss limit hit`, 'Done for today on this account.']);
    if (m.target && m.progress >= 1 && a.status === 'active') out.push(['good', 'target', `${a.name} reached its profit target`, `${m.tradingDays}${a.minDays ? '/' + a.minDays : ''} trading days. Mark it passed when confirmed.`]);
  });
  const r = safeToRisk(); if (r.rule && r.amount !== null && r.amount <= 0) out.push(['bad', 'flag', 'Personal daily stop reached', 'Close the platform. Tomorrow is another session.']);
  if (r.maxTrades && r.tradesToday >= r.maxTrades) out.push(['warn', 'clock', `Max ${r.maxTrades} trades reached`, 'Any more today would break your rule.']);
  S.payout.filter((p) => p.status === 'requested').forEach((p) => out.push(['warn', 'payouts', `Payout pending: ${money(p.amount || p.estimate)}`, `${accName2(p.accountId)} · requested ${fmtDate(p.reqDate)}`]));
  const m = missionMetrics(); if (m && m.elapsed > m.progress + 0.25 && m.daysLeft > 0) out.push(['warn', 'target', `${m.name} is behind pace`, `${pct(m.elapsed)} of the time gone, ${pct(m.progress)} of the goal paid out.`]);
  if (S.trade.some((t) => t.date === today()) && !S.journal.some((j) => j.date === today())) out.push(['info', 'journal', 'Journal today\'s session', 'Five minutes now saves the lesson.']);
  return out;
}
const accName2 = (id) => S.account.find((a) => a.id === id)?.name || '—';
function alertsModal() {
  const al = getAlerts();
  const m = V.modal('Alerts', al.length ? `<div class="txlist">${al.map(([t, ic, a, b]) => `<div class="txrow" style="cursor:default"><span class="prodico ${t === 'bad' ? 'is-loss' : t === 'warn' ? 't3' : t === 'info' ? 't4' : ''}">${icon(ic)}</span><span class="cell__text"><b style="white-space:normal">${esc(a)}</b><small>${esc(b)}</small></span></div>`).join('')}</div>` : `<div class="empty">${icon('check')}<b>All clear</b>No limits close, nothing pending.</div>`, '<button class="btn" data-act="cancel">Close</button>', 'modal modal--sm');
  if (window.gsap) window.gsap.fromTo($$('.txrow', m.el), { opacity: 0, x: -12 }, { opacity: 1, x: 0, stagger: 0.05, duration: 0.45, ease: 'power3.out', delay: 0.15 });
}

// ---------------------------------------------------------------- router
let pendingOpts = {};
function go(id, opts = {}, force = false) {
  pendingOpts = opts;
  if (('#' + id) === location.hash && force) route(false); else location.hash = '#' + id;
}
function route(first = false) {
  const items = [...navItems(), 'settings'];
  let id = (location.hash || '#overview').slice(1); if (!VIEWS[id]) id = 'overview';
  if (!items.includes(id)) id = 'overview';
  const main = $('#main'); if (!main) return;
  const render = () => {
    current = id;
    $$('.nav__item').forEach((a) => (a.dataset.id === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    movePill($('#nav'), !first);
    main.scrollTop = 0;
    VIEWS[id][2](main, pendingOpts); pendingOpts = {};
    document.title = `${VIEWS[id][0]} · ${APP.name}`;
    enterPage(main, { first });
  };
  if (first || !main.firstElementChild) render(); else leavePage(main, render);
}
window.addEventListener('hashchange', () => { if ($('#main')) route(false); });

function refresh() {
  const main = $('#main'); if (!main || !current) return;
  const y = main.scrollTop;
  VIEWS[current][2](main, {});
  main.scrollTop = y;
  // light re-entrance: headings stay, data re-animates
  const h1 = $('.phead h1', main); if (h1) h1.dataset.split = '1';
  animateData(main);
  buildNav(); updateSide();
}
function rerenderShell() { shell(false); }

V.setHooks({ go, refresh, rerenderShell, onboard: () => onboarding() });
if (window.gsap) window.gsap.config({ nullTargetWarn: false });
installGlint(); installPress();
boot();
