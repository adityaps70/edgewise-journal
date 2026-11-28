// App shell: boot, auth, onboarding, sidebar + router, header tools.
import {
  APP, LOGO, WORDMARK, S, P, $, $$, esc, uid, num, sum, clamp, iso, today, addDays, parseISO, fmtDate, money, short, pct, local, icon, API, hydrate, loadCache,
  saveProfile, save, remove, sync, flush, MARKETS, DEFAULT_SETUPS, SESSIONS, safeToRisk, accountMetrics, isLive, missionMetrics, net, runAgents,
  goalIdea,
} from './core.js?v=79ab0b80';
import { bootShell, enterPage, animateData, movePill, segInit, segSelect, installGlint, installPress, switchTheme, leavePage, toast, wobble, pop, shake, reduced, revealHeading } from './motion.js?v=79ab0b80';
import { slider, liveRate, fxAgo } from './ui.js?v=79ab0b80';
import { loadFirms, mountPicker, defaultDaily, mono } from './firms.js?v=79ab0b80';
window.__segInit = segInit; window.__segSelect = segSelect;
import * as V from './views.js?v=79ab0b80';
import * as V2 from './views2.js?v=79ab0b80';
import * as V3 from './views3.js?v=79ab0b80';
import * as PL from './plan.js?v=79ab0b80';
import * as V4 from './views4.js?v=79ab0b80';

// ---------------------------------------------------------------- formatters used by count-ups
window.__fmt = {
  money: (v) => money(v), moneySign: (v) => money(v, { sign: true }), moneyShort: (v) => (v > 0.5 ? '+' : '') + short(v),
  pct: (v) => pct(v), int: (v) => String(Math.round(v)), mins: (v) => (v ? (v < 60 ? Math.round(v) + ' min' : (v / 60).toFixed(1) + ' h') : '—'), dec: (v) => (v >= 99 ? '∞' : v.toFixed(2)), r: (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + 'R',
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
  app.innerHTML = `<div class="boot">${LOGO}</div>`;
  try {
    const me = await API.me();
    S.user = me.user; S.ai = me.ai || {}; S.sub = me.plan || null;
  } catch (e) {
    if (e.offline) { S.local = true; S.user = { id: 'local', name: '' }; S.ai = { configured: false }; }
    else if (e.status === 401) return auth();
    else { app.innerHTML = `<div class="solo"><div class="solo__card"><h1>Can't reach the server</h1><p>${esc(e.message)}</p><button class="btn btn--primary" onclick="location.reload()">Try again</button></div></div>`; return; }
  }
  await loadFirms();
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
    ${LOGO}
    <h1>Your trading journal,<br>with a coach built in.</h1>
    <p>Track every trade, prop account and payout. The AI coach reads it all and tells you where the money leaks.</p>
    <div id="gBox" class="gbox" hidden><div id="gBtn"></div><div class="or"><span>or with email</span></div></div>
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
  googleButton(card);
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

async function googleButton(card) {
  let cfg; try { cfg = await (await fetch(new URL('api/config', document.baseURI))).json(); } catch (e) { return; }
  if (!cfg?.googleClientId) return;
  await new Promise((res, rej) => { if (window.google?.accounts?.id) return res(); const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = res; s.onerror = rej; document.head.append(s); }).catch(() => null);
  if (!window.google?.accounts?.id) return;
  window.google.accounts.id.initialize({ client_id: cfg.googleClientId, ux_mode: 'popup', auto_select: false, callback: async ({ credential }) => {
    try {
      const r = await fetch(new URL('api/auth/google', document.baseURI), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Google sign-in failed');
      S.user = d.user; if (window.gsap && !reduced.matches) await window.gsap.to(card, { scale: 0.96, opacity: 0, duration: 0.3, ease: 'power2.in' }); boot();
    } catch (err) { $('#authErr').textContent = err.message; shake(card); }
  } });
  const box = $('#gBox'); if (!box) return; box.hidden = false;
  window.google.accounts.id.renderButton($('#gBtn'), { theme: document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center', width: Math.min(360, ($('#gBox').clientWidth || 340)) });
}

// ---------------------------------------------------------------- onboarding
const RULES = ['Max 3 trades a day', 'Stop after 2 losses in a row', 'No trades in the first 5 minutes', 'Always set a hard stop', 'No trading during red-folder news', 'Only A+ setups from my playbook', 'Walk away after hitting the daily goal'];
const GRADES = [['A+', 'High conviction', 'Everything lines up: your best setup, best time, clear invalidation.'], ['B', 'Normal', 'A valid setup with one thing missing.'], ['C', 'Low probability', 'Scouting or reduced-size trades.']];
const STEPS = ['You', 'Markets', 'Accounts', 'Goal', 'Style', 'Risk', 'Ready'];
const round25 = (v) => Math.max(25, Math.round(v / 25) * 25);
let ob;
async function onboarding() {
  const p = S.profile || {};
  await loadFirms();
  ob = {
    step: 0, name: p.name || S.user?.name || '', currency: p.currency || 'USD', localCode: p.local?.code ?? 'INR', rate: p.local?.rate || '', rateAuto: p.local?.auto !== false, rateMeta: null,
    markets: p.markets || [], instruments: p.instruments || [],
    accounts: S.account.length ? S.account.map((a) => ({ ...a })) : [],
    hasGoal: p.mission ? true : null, mission: p.mission || { name: '', target: 2000, start: today(), end: addDays(today(), 41) }, monthEst: '',
    style: p.style || '', sessions: p.sessions || [], sessionTz: p.sessionTz || 'IST',
    setups: S.setup.length ? S.setup.map((s) => s.name) : DEFAULT_SETUPS.slice(0, 3), allSetups: [...new Set([...DEFAULT_SETUPS, ...S.setup.map((s) => s.name)])],
    riskMode: p.risk?.mode || 'grade', grades: p.risk?.byGrade || null, fixed: p.risk?.perTrade || '', maxDailyLoss: p.risk?.maxDailyLoss || '', maxTrades: p.risk?.maxTrades ?? 3,
    rules: S.rule.length ? S.rule.map((r) => r.text) : RULES.slice(2, 4), allRules: [...new Set([...RULES, ...S.rule.map((r) => r.text)])],
    imported: null,
  };
  app.innerHTML = `<div class="solo"><div class="solo__card solo__card--wide" id="ob">
    <div class="row row--between"><a class="row" href="index.html" style="gap:10px">${LOGO}${WORDMARK}</a><span class="ob-count" id="obCount"></span></div>
    <ol class="steps" style="margin-top:22px">${STEPS.map((s) => `<li title="${s}"><i></i></li>`).join('')}</ol>
    <div id="obBody"></div>
    <div class="row row--between ob-nav"><button class="btn btn--ghost" id="obBack">${icon('left')}Back</button><button class="btn btn--primary btn--lg" id="obNext">Continue${icon('right')}</button></div>
    ${S.local ? '' : `<p class="ob-who">Signed in as <b>${esc(S.user?.email || S.user?.name || 'you')}</b><span>·</span>Not you? <button type="button" class="linkbtn" id="obOut">${icon('logout')}Sign out</button></p>`}
  </div></div>`;
  if (window.gsap && !reduced.matches) window.gsap.fromTo('#ob', { opacity: 0, y: 30, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'expo.out' });
  $('#obBack').onclick = () => obGo(-1);
  $('#obNext').onclick = () => obGo(1);
  obRender(0);
}
const chipRow = (id, all, on, labels = {}, add = true) => `<div class="chips" id="${id}">${all.map((v) => `<button type="button" class="chip ${on.includes(v) ? 'is-on' : ''}" data-v="${esc(v)}">${esc(labels[v] || v)}</button>`).join('')}${add ? `<button type="button" class="chip chip--add" data-add="${id}">${icon('plus')} Add</button>` : ''}</div>`;
const dailyBase = () => { const d = ob.accounts.map((a) => num(a.personalDaily)).filter(Boolean); return d.length ? Math.min(...d) : 500; };
function gradeDefaults(base) { return { 'A+': round25(base * 0.5), B: round25(base * 0.3), C: round25(base * 0.15) }; }
const sym2 = (c) => ({ USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', CAD: 'C$', AED: 'AED ', SGD: 'S$' }[c] ?? c + ' ');
function rateLine() {
  if (!ob.localCode || ob.localCode === ob.currency) return '';
  if (!ob.rateAuto) return `<label class="field"><span>Your rate</span><input class="in" id="o_rate" type="number" step="any" value="${esc(ob.rate)}" placeholder="1 ${esc(ob.currency)} = ?"><em><button type="button" class="linkbtn" id="o_live">Use the live rate instead</button></em></label>`;
  const m = ob.rateMeta;
  return `<div class="fxline" id="o_fx">${m ? `<span class="live"></span><span>1 ${esc(ob.currency)} = <b>${sym2(ob.localCode)}${m.rate.toFixed(2)}</b></span><small>live · ${esc(m.source)} · ${fxAgo(m.at)}</small>` : '<span class="typing"><i></i><i></i><i></i></span><small>Fetching today\'s rate…</small>'}<button type="button" class="linkbtn" id="o_manual">Set my own</button></div>`;
}
async function obFetchRate() {
  if (!ob.localCode || ob.localCode === ob.currency || !ob.rateAuto) return;
  const r = await liveRate(ob.currency, ob.localCode);
  if (!ob || ob.step !== 0) return;
  if (r) { ob.rateMeta = r; ob.rate = +r.rate.toFixed(4); } else { ob.rateAuto = false; toast('Couldn\'t fetch a live rate. Enter yours.', icon('info')); }
  const box = $('#o_fxbox'); if (box) { box.innerHTML = rateLine(); bindRate(); if (window.gsap) window.gsap.fromTo(box.firstElementChild, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.4 }); }
}
function bindRate() {
  const man = $('#o_manual'); if (man) man.onclick = () => { ob.rateAuto = false; $('#o_fxbox').innerHTML = rateLine(); bindRate(); $('#o_rate')?.focus(); };
  const lv = $('#o_live'); if (lv) lv.onclick = () => { ob.rateAuto = true; ob.rateMeta = null; $('#o_fxbox').innerHTML = rateLine(); bindRate(); obFetchRate(); };
}
function obRender(dir) {
  const s = ob.step; const body = $('#obBody');
  { const o = $('#obOut'); if (o && !o.onclick) o.onclick = async () => { o.disabled = true; try { await API.logout(); } catch (e) {} location.replace('app'); }; }
  $('#obCount').innerHTML = `<b>${STEPS[s]}</b> · ${s + 1} of ${STEPS.length}`;
  $$('.steps li').forEach((li, i) => { const fill = li.firstElementChild; const done = i <= s; if (window.gsap && !reduced.matches) window.gsap.to(fill, { scaleX: done ? 1 : 0, duration: 0.7, ease: 'expo.out' }); else fill.style.transform = `scaleX(${done ? 1 : 0})`; });
  $('#obBack').style.visibility = s ? 'visible' : 'hidden';
  $('#obNext').innerHTML = s === STEPS.length - 1 ? `${icon('bolt')}Open my journal` : `Continue${icon('right')}`;
  // instruments: suggestions appear only for the markets picked; picks from markets you un-tick are dropped, your own additions stay
  const allEx = new Set(Object.values(MARKETS).flatMap((m) => m.examples)); const picked = new Set(ob.markets.flatMap((m) => MARKETS[m].examples));
  ob.instruments = ob.instruments.filter((v) => picked.has(v) || !allEx.has(v));
  const own = ob.instruments.filter((v) => !allEx.has(v));
  const instChips = (list) => list.map((v) => `<button type="button" class="chip ${ob.instruments.includes(v) ? 'is-on' : ''}" data-v="${esc(v)}">${esc(v)}</button>`).join('');
  const instNew = !ob._instShown; ob._instShown = ob.markets.length > 0;
  const instHTML = ob.markets.length ? `<div class="ob-inst ${instNew ? 'ob-inst--new' : ''}"><p class="ob-q ob-q--sm">Which instruments?</p><p class="ob-sub">Tap the ones you trade. They become quick picks when you log a trade.</p>
      <div id="o_in" class="ob-groups">${ob.markets.map((m) => `<div class="ob-grp">${ob.markets.length > 1 ? `<span class="ob-grp__h">${esc(MARKETS[m].label)}</span>` : ''}<div class="chips">${instChips(MARKETS[m].examples)}</div></div>`).join('')}
      <div class="ob-grp">${ob.markets.length > 1 || own.length ? `<span class="ob-grp__h">${own.length ? 'Your own' : 'Something else?'}</span>` : ''}<div class="chips">${instChips(own)}<button type="button" class="chip chip--add" data-add="o_in">${icon('plus')} Add</button></div></div></div></div>` : '';
  const screens = [
    () => `<p class="ob-q">First, who's trading?</p><p class="ob-sub">Sets your greeting, your account currency and how payouts convert to your bank currency.</p>
      <div class="form" style="grid-template-columns:1fr 1fr">
      <label class="field full"><span>Your name</span><input class="in" id="o_name" value="${esc(ob.name)}" placeholder="Name" autocomplete="given-name"></label>
      <label class="field"><span>Account currency</span><select class="in" id="o_cur">${['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD'].map((c) => `<option ${c === ob.currency ? 'selected' : ''}>${c}</option>`).join('')}</select><em>What your P&amp;L and prop accounts are in</em></label>
      <label class="field"><span>Payouts land in</span><select class="in" id="o_loc"><option value="">Same currency</option>${['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'].map((c) => `<option ${c === ob.localCode ? 'selected' : ''}>${c}</option>`).join('')}</select><em>Your bank's currency</em></label>
      <div class="full" id="o_fxbox">${rateLine()}</div></div>`,
    () => `<p class="ob-q">What do you trade?</p><p class="ob-sub">Pick all that apply. It sets units (contracts, lots, shares) and lets the journal calculate P&amp;L for you.</p>
      ${chipRow('o_mk', Object.keys(MARKETS), ob.markets, Object.fromEntries(Object.entries(MARKETS).map(([k, v]) => [k, v.label])), false)}
      ${instHTML}`,
    () => `<p class="ob-q">Which accounts do you trade?</p><p class="ob-sub">Pick your prop firm, plan and size. The journal fills in the firm's rules: profit target, max loss and daily limit. Then set your own daily stop, which is usually tighter than the firm's.</p>
      <div class="explain">${icon('info')}<span>Prop firm path: you buy a <b>challenge</b>, pass it, and the firm gives you a <b>funded</b> account. Add each account at the stage it's in now; you can move it to funded later.</span></div>
      <div id="o_picker"></div>
      <details class="imp"><summary>${icon('sheet')}Already tracking in a spreadsheet? Import it</summary>
      <div class="drop" id="o_drop" style="margin-top:12px">${icon('sheet')}<div style="flex:1"><b>Import from Excel / Google Sheets export</b><span class="muted" style="font-size:var(--fs-sm)" id="o_dropInfo">${ob.imported ? esc(ob.imported) : 'Reads an accounts table with Firm, Cost and Quantity columns'}</span></div><input type="file" id="o_file" accept=".xlsx,.xls,.csv" hidden><button type="button" class="btn btn--sm" id="o_pick">Choose file</button></div></details>`,
    () => `<p class="ob-q">Working toward a payout goal?</p><p class="ob-sub">Go full time, a first big payout, a house. Name it and you'll get a progress card, a pace check and a forecast.</p>
      <div class="seg seg--accent" id="o_goalSeg" style="margin-bottom:18px"><button data-v="yes" class="${ob.hasGoal !== false ? 'is-on' : ''}">Yes, I have a goal</button><button data-v="no" class="${ob.hasGoal === false ? 'is-on' : ''}">Not right now</button></div>
      <div class="form" style="grid-template-columns:1fr 1fr" id="o_goal" ${ob.hasGoal === false ? 'hidden' : ''}>
        <label class="field full"><span>Name it</span><input class="in" id="o_gn" value="${esc(ob.mission.name)}" placeholder="${goalIdea()}"></label>
        <div class="field">${slider({ name: 'o_gt', label: `Payout target`, value: ob.mission.target || 2000, min: 0, max: 50000, step: 100, prefix: sym2(ob.currency) })}</div>
        <div class="field">${slider({ name: 'o_me', label: 'Expected payout this month', value: ob.monthEst || 0, min: 0, max: 20000, step: 100, prefix: sym2(ob.currency), zero: 'Skip' })}</div>
        <label class="field"><span>Start</span><input class="in" id="o_gs" type="date" value="${esc(ob.mission.start)}"></label>
        <label class="field"><span>Deadline</span><input class="in" id="o_ge" type="date" value="${esc(ob.mission.end)}"></label></div>`,
    () => `<p class="ob-q">How do you trade?</p><p class="ob-sub">Used to group your stats and to brief the AI coach.</p>
      <div class="stack"><div class="field"><span>Style</span>${chipRow('o_st', ['Scalping', 'Day trading', 'Swing', 'Positional'], [ob.style], {}, false)}</div>
      <div class="field"><span>Sessions you trade</span>${chipRow('o_ss', SESSIONS, ob.sessions, {}, false)}</div>
      <div class="row row--between"><span class="field"><span>I log trade times in</span></span><div class="seg" id="o_tz"><button data-v="IST" class="${ob.sessionTz === 'IST' ? 'is-on' : ''}">India (IST)</button><button data-v="ET" class="${ob.sessionTz === 'ET' ? 'is-on' : ''}">New York (ET)</button></div></div>
      <div class="field"><span>Setups in your playbook</span>${chipRow('o_su', ob.allSetups, ob.setups)}</div></div>`,
    () => {
      const base = num(ob.maxDailyLoss) || dailyBase(); const g = ob.grades || gradeDefaults(base); const c = sym2(ob.currency);
      return `<p class="ob-q">Your risk, your way</p><p class="ob-sub">The journal compares every trade with these, and the coach flags when you drift.</p>
      <div class="stack">
      <div class="riskbox"><div class="row row--between" style="flex-wrap:wrap;gap:10px"><b>How do you size trades?</b><div class="seg seg--accent" id="o_rm"><button data-v="grade" class="${ob.riskMode === 'grade' ? 'is-on' : ''}">By setup quality</button><button data-v="fixed" class="${ob.riskMode === 'fixed' ? 'is-on' : ''}">Same every trade</button><button data-v="none" class="${ob.riskMode === 'none' ? 'is-on' : ''}">I'll decide each time</button></div></div>
        <div id="o_rbox">${riskBox(g, base, c)}</div></div>
      <div class="grid g-2" style="gap:14px">${slider({ name: 'o_md', label: 'Max loss per day (all accounts)', value: base, min: 50, max: Math.max(base * 2, 1000), step: 25, prefix: c, hint: ob.accounts.length ? 'starts at your tightest daily stop' : '' })}${slider({ name: 'o_mt', label: 'Max trades per day', value: ob.maxTrades ?? 3, min: 0, max: 15, step: 1, zero: 'No limit' })}</div>
      <div class="field"><span>Rules to check every trade against</span>${chipRow('o_ru', ob.allRules, ob.rules)}</div></div>`;
    },
    () => summary(),
  ];
  body.innerHTML = screens[s]();
  if (window.gsap && !reduced.matches) {
    window.gsap.fromTo(body, { opacity: 0, x: 26 * (dir || 1) }, { opacity: 1, x: 0, duration: 0.6, ease: 'expo.out' });
    window.gsap.fromTo(body.querySelectorAll('.ob-q, .ob-sub, .chip, .field, .drop, .seg, .sl, .explain, .fcard, .riskbox, .bento > *'), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', stagger: 0.014, delay: 0.05, clearProps: 'transform,opacity' });
  }
  $$('.seg', body).forEach(segInit);
  const toggle = (id, single = false) => $$(`#${id} .chip:not(.chip--add)`, body).forEach((c) => c.onclick = () => { if (single) $$(`#${id} .chip`, body).forEach((x) => x !== c && x.classList.remove('is-on')); c.classList.toggle('is-on'); pop(c); if (id === 'o_mk') { obCollect(); obRender(0); } });
  ['o_mk', 'o_in', 'o_ss', 'o_su', 'o_ru'].forEach((id) => toggle(id)); toggle('o_st', true);
  $$('[data-add]', body).forEach((b) => b.onclick = () => {
    const id = b.dataset.add; const input = document.createElement('input'); input.className = 'in'; input.style.cssText = 'width:200px;height:36px;border-radius:99px';
    input.placeholder = 'Type and press Enter'; b.replaceWith(input); input.focus();
    input.onkeydown = (e) => { if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); const v = id === 'o_in' ? input.value.trim().toUpperCase() : input.value.trim(); obCollect(); ({ o_in: () => ob.instruments.push(v), o_su: () => { ob.allSetups.push(v); ob.setups.push(v); }, o_ru: () => { ob.allRules.push(v); ob.rules.push(v); } })[id]?.(); obRender(0); } if (e.key === 'Escape') obRender(0); };
  });
  if (s === 0) {
    bindRate(); obFetchRate();
    const recur = () => { obCollect(); ob.rateMeta = null; $('#o_fxbox').innerHTML = rateLine(); bindRate(); obFetchRate(); };
    $('#o_cur').onchange = recur; $('#o_loc').onchange = recur;
  }
  if (s === 2) obAccounts();
  if (s === 3) $$('#o_goalSeg button', body).forEach((b) => b.onclick = () => { segSelect($('#o_goalSeg'), b); ob.hasGoal = b.dataset.v === 'yes'; const g = $('#o_goal'); g.hidden = !ob.hasGoal; if (ob.hasGoal && window.gsap) window.gsap.fromTo(g.children, { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.04, duration: 0.45, ease: 'power3.out' }); });
  if (s === 4) $$('#o_tz button', body).forEach((b) => b.onclick = () => { segSelect($('#o_tz'), b); ob.sessionTz = b.dataset.v; });
  if (s === 5) {
    $$('#o_rm button', body).forEach((b) => b.onclick = () => {
      obCollect(); segSelect($('#o_rm'), b); ob.riskMode = b.dataset.v;
      const base = num(ob.maxDailyLoss) || dailyBase(); const box = $('#o_rbox'); box.innerHTML = riskBox(ob.grades || gradeDefaults(base), base, sym2(ob.currency));
      if (window.gsap) window.gsap.fromTo(box.children, { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 0.05, duration: 0.4, ease: 'power3.out' });
    });
  }
  if (s === 6) animateSummary(body);
}
function riskBox(g, base, c) {
  if (ob.riskMode === 'none') return `<p class="muted" style="margin:12px 0 0;font-size:var(--fs-md)">No preset sizes. Log the risk on each trade and the journal works out your R multiples.</p>`;
  if (ob.riskMode === 'fixed') return `<div style="margin-top:12px">${slider({ name: 'o_rf', label: 'Risk per trade', value: ob.fixed || g.B, min: 25, max: Math.max(base, 100), step: 25, prefix: c })}</div>`;
  return `<p class="muted" style="margin:10px 0 4px;font-size:var(--fs-md)">Tag each trade with its grade when you log it. Your stats show how each grade performs.</p>
    <div class="grades">${GRADES.map(([k, t, d]) => `<div class="grade"><span class="grade__tag g-${k === 'A+' ? 'a' : k.toLowerCase()}">${k}</span><div class="grade__body">${slider({ name: 'o_g_' + k, label: `${t}`, value: g[k], min: 25, max: Math.max(base, 100), step: 25, prefix: c, hint: d })}</div></div>`).join('')}</div>`;
}
function summary() {
  const c = sym2(ob.currency); const base = num(ob.maxDailyLoss) || dailyBase(); const g = ob.grades || gradeDefaults(base);
  const goalOn = ob.hasGoal !== false && ob.mission.name;
  const days = goalOn ? Math.max(0, Math.round((parseISO(ob.mission.end) - parseISO(ob.mission.start)) / 864e5)) : 0;
  return `<div class="bento">
    <div class="bt bt--hero"><small>${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</small><h2>You're set, ${esc((ob.name || 'trader').split(' ')[0])}.</h2><p>Your journal is ready. Log your first trade from the <b>+</b> button, or import a CSV from your platform.</p>
      ${ob.localCode && ob.localCode !== ob.currency ? `<span class="pill pill--accent"><span class="live"></span>${esc(ob.currency)} → ${esc(ob.localCode)} ${ob.rate ? `at ${c}1 = ${sym2(ob.localCode)}${Number(ob.rate).toFixed(2)}` : ''} ${ob.rateAuto ? '· live' : ''}</span>` : ''}</div>
    <div class="bt bt--accs"><div class="bt__h">${icon('accounts')}<b>Accounts</b><span>${ob.accounts.length}</span></div>
      <div class="minis">${ob.accounts.slice(0, 4).map((a, i) => `<div class="mini" style="--i:${i}"><span class="fmono fmono--sm">${esc(mono(a))}</span><div><b>${esc(a.name)}</b><small>${a.size ? short(a.size).replace(/^\$/, c) : ''} · ${a.type === 'personal' ? 'own capital' : a.stage === 'funded' || a.type === 'funded' ? 'funded' : 'challenge'}</small></div><em>stop ${c}${num(a.personalDaily).toLocaleString()}</em></div>`).join('')}${ob.accounts.length > 4 ? `<small class="muted">+${ob.accounts.length - 4} more</small>` : ''}</div></div>
    <div class="bt bt--goal"><div class="bt__h">${icon('target')}<b>Goal</b></div>${goalOn ? `<div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" class="ring__bg"/><circle cx="60" cy="60" r="50" class="ring__fg" pathLength="100" style="stroke-dasharray:100;stroke-dashoffset:96"/></svg><div><b>${c}${num(ob.mission.target).toLocaleString()}</b><small>${days} days</small></div></div><p class="bt__p">${esc(ob.mission.name)}</p>` : '<p class="bt__p muted">No goal yet. Add one any time in Settings.</p>'}</div>
    <div class="bt bt--risk"><div class="bt__h">${icon('shield')}<b>Risk</b></div><div class="bt__big">${c}${base.toLocaleString()}<small> max loss / day</small></div>
      ${ob.riskMode === 'grade' ? `<div class="gbars">${GRADES.map(([k]) => `<div><span class="grade__tag g-${k === 'A+' ? 'a' : k.toLowerCase()}">${k}</span><i style="--w:${Math.min(100, (num(g[k]) / base) * 100)}%"></i><b>${c}${num(g[k]).toLocaleString()}</b></div>`).join('')}</div>` : ob.riskMode === 'fixed' ? `<p class="bt__p">${c}${num(ob.fixed).toLocaleString()} per trade</p>` : '<p class="bt__p">Risk logged per trade</p>'}
      <p class="bt__p muted">${num(ob.maxTrades) ? `Max ${ob.maxTrades} trades a day` : 'No trade-count limit'}</p></div>
    <div class="bt bt--mk"><div class="bt__h">${icon('trades')}<b>Markets</b></div><div class="chips">${(ob.markets.length ? ob.markets : ['futures']).map((m) => `<span class="chip is-on">${esc(MARKETS[m].label)}</span>`).join('')}${ob.instruments.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div></div>
    <div class="bt bt--pb"><div class="bt__h">${icon('playbook')}<b>Playbook</b><span>${ob.setups.length} setups · ${ob.rules.length} rules</span></div><ul class="ticks">${ob.setups.slice(0, 4).map((s) => `<li>${icon('check')}${esc(s)}</li>`).join('')}${ob.rules.slice(0, 2).map((r) => `<li class="muted">${icon('flag')}${esc(r)}</li>`).join('')}</ul></div>
  </div>`;
}
function animateSummary(body) {
  const g = window.gsap; if (!g || reduced.matches) return;
  g.fromTo($$('.bt', body), { opacity: 0, y: 24, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'expo.out', stagger: 0.07, clearProps: 'transform,opacity' });
  g.fromTo($$('.mini', body), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.06, delay: 0.35, ease: 'power3.out', clearProps: 'transform,opacity' });
  const r = $('.ring__fg', body); if (r) g.fromTo(r, { strokeDashoffset: 100 }, { strokeDashoffset: 96, duration: 1.4, delay: 0.5, ease: 'expo.out' });
  g.fromTo($$('.gbars i', body), { scaleX: 0 }, { scaleX: 1, duration: 1, stagger: 0.08, delay: 0.5, ease: 'expo.out', transformOrigin: 'left' });
  const h = $('.bt--hero h2', body); if (h) revealHeading(h, 0.15);
}
function obAccounts() {
  mountPicker($('#o_picker'), Object.assign(ob._pk ||= {}, { accounts: ob.accounts, markets: ob.markets, allowOwn: true, onChange: () => {} }));
  $('#o_pick').onclick = () => $('#o_file').click();
  const handle = async (file) => {
    if (!file) return;
    $('#o_dropInfo').textContent = 'Reading…';
    try {
      const res = await importWorkbook(file);
      res.patch.accounts.forEach((a) => { a.personalDaily ||= defaultDaily(a) || 500; });
      Object.assign(ob, res.patch);
      ob.imported = `${file.name}: ${res.summary}`;
      obRender(0); $('details.imp')?.setAttribute('open', ''); toast('Sheet imported', icon('check'));
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
  const sv = (n) => { const el = $(`[name="${n}"]`); return el ? num(el.value) : undefined; };
  const on = (id) => $$(`#${id} .chip.is-on`).map((c) => c.dataset.v);
  switch (ob.step) {
    case 0: ob.name = v('o_name') ?? ob.name; ob.currency = v('o_cur') || ob.currency; ob.localCode = v('o_loc') ?? ob.localCode; if (!ob.rateAuto && $('#o_rate')) ob.rate = v('o_rate'); break;
    case 1: ob.markets = on('o_mk'); ob.instruments = on('o_in'); break;
    case 3: if (ob.hasGoal === null) ob.hasGoal = true; ob.mission = { ...ob.mission, name: v('o_gn') ?? ob.mission.name, target: sv('o_gt') ?? ob.mission.target, start: v('o_gs') || ob.mission.start, end: v('o_ge') || ob.mission.end }; ob.monthEst = sv('o_me') ?? ob.monthEst; break;
    case 4: ob.style = on('o_st')[0] || ''; ob.sessions = on('o_ss'); ob.setups = on('o_su'); break;
    case 5:
      ob.maxDailyLoss = sv('o_md') ?? ob.maxDailyLoss; ob.maxTrades = sv('o_mt') ?? ob.maxTrades; ob.rules = on('o_ru');
      if (ob.riskMode === 'grade' && $('[name="o_g_B"]')) ob.grades = { 'A+': sv('o_g_A+'), B: sv('o_g_B'), C: sv('o_g_C') };
      if (ob.riskMode === 'fixed' && $('[name="o_rf"]')) ob.fixed = sv('o_rf');
      break;
    default:
  }
}
function obGo(d) {
  obCollect();
  if (d > 0) {
    if (ob.step === 0 && !ob.name.trim()) { shake($('#o_name')); $('#o_name').focus(); return; }
    if (ob.step === 1 && !ob.markets.length) { shake($('#o_mk')); toast('Pick at least one market', icon('info')); return; }
    if (ob.step === 2 && !ob.accounts.length) { shake($('#o_picker')); toast('Add at least one account', icon('info')); return; }
    if (ob.step === 2 && !ob.maxDailyLoss) ob.grades = null;
    if (ob.step === STEPS.length - 1) return obFinish();
  }
  ob.step = clamp(ob.step + d, 0, STEPS.length - 1); obRender(d);
}
async function obFinish() {
  const btn = $('#obNext'); btn.disabled = true;
  const base = num(ob.maxDailyLoss) || dailyBase();
  const prof = {
    ...(S.profile || {}), name: ob.name.trim(), currency: ob.currency,
    local: ob.localCode && ob.localCode !== ob.currency ? { code: ob.localCode, rate: num(ob.rate), auto: ob.rateAuto, at: ob.rateMeta?.at || Date.now() } : null,
    markets: ob.markets, instruments: ob.instruments, funding: ob.accounts.some((a) => a.type !== 'personal') ? ['prop'] : ['own'], firms: [...new Set(ob.accounts.map((a) => a.firm).filter(Boolean))],
    style: ob.style, sessions: ob.sessions, sessionTz: ob.sessionTz,
    risk: { maxDailyLoss: base, maxTrades: num(ob.maxTrades) || '', mode: ob.riskMode, byGrade: ob.riskMode === 'grade' ? (ob.grades || gradeDefaults(base)) : null, perTrade: ob.riskMode === 'fixed' ? num(ob.fixed) : '' },
    mission: ob.hasGoal !== false && ob.mission.name ? { ...ob.mission, target: num(ob.mission.target) } : null,
    monthlyTargets: { ...((S.profile || {}).monthlyTargets || {}), ...(ob.monthlyTargets || {}), ...(num(ob.monthEst) ? { [today().slice(0, 7)]: num(ob.monthEst) } : {}) },
    onboardedAt: Date.now(),
  };
  saveProfile(prof);
  const keep = new Set(ob.accounts.map((a) => a.id));
  S.account.filter((a) => !keep.has(a.id)).forEach((a) => remove('account', a.id));
  ob.accounts.forEach((a) => save('account', { ddType: 'trailing', ...a, id: a.id || uid() }));
  const existing = new Set(S.setup.map((s) => s.name)); ob.setups.filter((n) => !existing.has(n)).forEach((name) => save('setup', { name }));
  const er = new Set(S.rule.map((r) => r.text)); ob.rules.filter((t) => !er.has(t)).forEach((text) => save('rule', { text }));
  if (ob.plan && !S.plan.length) save('plan', ob.plan);
  await flush();
  if (window.gsap && !reduced.matches) await window.gsap.to('#ob', { scale: 0.96, opacity: 0, y: -10, duration: 0.4, ease: 'power2.in' });
  location.hash = '#overview'; shell(true);
}

// spreadsheet import (an accounts table with Firm, Cost and Quantity columns, plus optional goal and plan blocks)
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
  mindset: ['Mindset', 'brain', V2.mindset], firms: ['Prop firms', 'shield', V2.firms], reports: ['Reports', 'sheet', V2.reports],
  coach: ['AI coach', 'coach', V.coach], settings: ['Settings', 'settings', V.settings],
  notebook: ['Notebook', 'note', V3.notebook], agents: ['Agents', 'agent', V3.agents], backtest: ['Backtesting', 'flask', V3.backtest],
  tools: ['Tools', 'calc', V3.tools], mentor: ['Mentor mode', 'users', V3.mentor], connections: ['Connections', 'link', V4.connections], admin: ['Admin', 'shield', PL.admin], economic: ['Economic calendar', 'calendar', V3.economic],
};
// ---- menu sections: each groups related pages, shown as tabs at the top of the page
const HUBS = [
  ['overview', 'Overview', 'overview', ['overview']],
  ['trades', 'Trades', 'trades', ['trades', 'calendar']],
  ['analytics', 'Analytics', 'analytics', ['analytics', 'mindset', 'reports']],
  ['journal', 'Journal', 'journal', ['journal', 'notebook', 'plan']],
  ['playbook', 'Playbook', 'playbook', ['playbook', 'backtest']],
  ['accounts', 'Accounts', 'accounts', ['accounts', 'firms', 'payouts']],
  ['tools', 'Tools', 'calc', ['agents', 'tools', 'economic', 'connections', 'mentor']],
];
const TAB_LABEL = { trades: 'Trade log', analytics: 'Stats', journal: 'Daily journal', accounts: 'Your accounts', firms: 'Firms & costs', tools: 'Calculators' };
const hubOf = (id) => HUBS.find((h) => h[3].includes(id)) || null;
const lastTab = {};
function hubTabs(el, id) {
  const h = hubOf(id); if (!h) return; lastTab[h[0]] = id;
  const allowed = navItems(); const subs = h[3].filter((x) => allowed.includes(x)); if (subs.length < 2) return;
  const head = $('.phead', el); if (!head) return;
  head.insertAdjacentHTML('afterend', `<nav class="tabs hubtabs" aria-label="${esc(h[1])}">${subs.map((x) => `<a href="#${x}" class="${x === id ? 'is-on' : ''}" ${x === id ? 'aria-current="page"' : ''}>${icon(VIEWS[x][1])}${esc(TAB_LABEL[x] || VIEWS[x][0])}</a>`).join('')}</nav>`);
  // on narrow screens the tab row scrolls: keep the current tab in view and fade the edge that has more tabs
  const nav = head.nextElementSibling; const on = nav.querySelector('.is-on');
  const edge = () => { nav.classList.toggle('has-more', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4); nav.classList.toggle('has-less', nav.scrollLeft > 4); };
  if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2);
  nav.addEventListener('scroll', edge, { passive: true }); requestAnimationFrame(edge);
}
function navItems() { // every page this trader can open (the menu shows them grouped by HUBS)
  const p = P(); const prop = (p.funding || []).some((f) => f !== 'own') || S.account.some((a) => a.type !== 'personal');
  const list = ['overview', 'trades', 'calendar', 'analytics', 'mindset', 'playbook', 'journal', 'notebook', 'backtest'];
  if (S.account.length || prop) list.push('accounts');
  if (prop) list.push('firms');
  if (prop || S.payout.length) list.push('payouts');
  if (prop || p.mission || S.plan.length) list.push('plan');
  list.push('connections', 'agents', 'reports', 'mentor', 'tools', 'economic', 'coach');
  if (S.user?.admin) list.push('admin');
  return list;
}
let current = null;
function shell(first = false) {
  setTimeout(paintPlan, 0);
  import('./pet.js?v=79ab0b80').then((m) => m.mountPet()).catch(() => {});
  const p = P();
  app.innerHTML = `<div class="app"><div class="slab" id="slab">
    <aside class="side"><div class="side__top">${LOGO}<a class="side__name" href="index.html" aria-label="${APP.name} home">${WORDMARK}</a><button class="side__fold" id="fold" aria-label="Collapse sidebar">${icon('fold')}</button></div>
      <nav class="nav" id="nav" aria-label="Sections"><span class="nav__pill"></span></nav>
      <div id="usage"></div>
      <div class="safe" id="safe"></div>
      <div class="side__me"><span class="av">${esc(initials())}<i class="av__dot"></i></span><span class="me__text"><b>${esc(p.name || 'Trader')}</b><small>${esc(S.local ? 'Local mode' : S.user?.email || '')}</small></span><button class="ibtn" id="meMore" aria-label="Account menu">${icon('more')}</button></div>
    </aside>
    <div class="stage">
      <header class="head"><button class="rbtn head__menu" id="menu" aria-label="Menu">${icon('menu')}</button>
        <label class="head__search">${icon('search')}<input id="q" placeholder="${innerWidth <= 760 ? 'Search' : 'Search trades, symbols, setups'}" autocomplete="off"><span class="kbd">⌘K</span></label>
        <button class="rbtn rbtn--accent" id="hLog" aria-label="Log trade" title="Log trade">${icon('plus')}</button>
        <button class="rbtn" id="hFilter" aria-label="Filter" title="Filter (F)">${icon('filter')}<i class="rbtn__badge rbtn__badge--n" hidden></i></button>
        <button class="rbtn" id="hAI" aria-label="AI coach" title="AI coach">${icon('coach')}</button>
        <span class="head__sep"></span>
        <button class="rbtn rbtn--plain" id="hTheme" aria-label="Switch theme" title="Switch theme">${icon(root.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
        <button class="rbtn rbtn--plain" id="hBell" aria-label="Alerts">${icon('bell')}<i class="rbtn__badge" hidden></i></button>
      </header>
      <div class="fbar" id="fbar" hidden></div>
      <main class="main" id="main"></main>
    </div></div></div>`;
  buildNav();
  updateSide();
  $('#fold').onclick = () => { $('#slab').classList.toggle('is-rail'); setTimeout(() => movePill($('#nav'), false), 520); };
  $('#menu').onclick = (e) => { e.stopPropagation(); $('#slab').classList.toggle('is-open'); };
  $('.stage').addEventListener('click', (e) => { const s = $('#slab'); if (s.classList.contains('is-open') && !e.target.closest('#menu')) { e.preventDefault(); e.stopPropagation(); s.classList.remove('is-open'); } }, true);
  $('#hLog').onclick = (e) => { wobble(e.currentTarget.firstElementChild); V.tradeModal(); };
  $('#hAI').onclick = (e) => { wobble(e.currentTarget.firstElementChild); go('coach'); };
  $('#hFilter').onclick = (e) => { wobble(e.currentTarget.firstElementChild); V3.filterModal(); };
  if (!S.local) API.mentorNotes().then((r) => { S.mentorNotes = r.notes; }).catch(() => {});
  $('#meMore').onclick = () => go('settings');
  $('#hTheme').onclick = (e) => { const next = root.dataset.theme === 'dark' ? 'light' : 'dark'; const r = e.currentTarget.getBoundingClientRect(); switchTheme(next, r.left + r.width / 2, r.top + r.height / 2); e.currentTarget.innerHTML = icon(next === 'dark' ? 'sun' : 'moon'); pop(e.currentTarget); };
  $('#hBell').onclick = (e) => { wobble(e.currentTarget.firstElementChild); alertsModal(); };
  const q = $('#q');
  q.onkeydown = (e) => { if (e.key === 'Enter') { V.setTradeQuery(q.value.trim()); go('trades', {}, true); q.blur(); } if (e.key === 'Escape') q.blur(); };
  document.onkeydown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); q.focus(); q.select(); }
    if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !/input|textarea|select/i.test(document.activeElement.tagName) && !$('.scrim')) { e.preventDefault(); V3.filterModal(); }
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !/input|textarea|select/i.test(document.activeElement.tagName) && !$('.scrim')) { e.preventDefault(); V.tradeModal(); }
  };
  sync.onChange = () => { const d = $('.side__me .av__dot'); if (d) d.style.background = sync.state === 'error' ? 'var(--bad)' : sync.state === 'saving' ? 'var(--warn)' : 'var(--mint)'; };
  route(first);
  if (first) { bootShell(app); refreshFx(); setTimeout(() => V4.syncAll(), 1500); }
}
async function refreshFx() {
  const L = P().local; if (!L || !L.code || L.auto === false) return;
  const r = await liveRate(P().currency || 'USD', L.code); if (!r) return;
  if (Math.abs((L.rate || 0) - r.rate) > 1e-4 || !L.at) saveProfile({ ...P(), local: { ...L, rate: +r.rate.toFixed(4), at: r.at } });
}
const initials = () => (P().name || S.user?.email || 'T').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
function buildNav() {
  const nav = $('#nav'); const items = navItems();
  const todayN = S.trade.filter((t) => t.date === today()).length;
  const atRisk = S.account.filter(isLive).filter((a) => { const m = accountMetrics(a); return m.buffer !== null && m.maxLoss && m.buffer < m.maxLoss * 0.3; }).length;
  const pending = S.payout.filter((p) => p.status === 'requested').length;
  const cur = hubOf(current)?.[0] || current;
  const hubs = HUBS.filter((h) => h[3].some((x) => items.includes(x)));
  nav.innerHTML = '<span class="nav__pill"></span>' + [...hubs.map((h) => h[0]), ...(items.includes('admin') ? ['admin'] : []), 'settings'].map((hid) => {
    const h = HUBS.find((x) => x[0] === hid); const label = h ? h[1] : VIEWS[hid][0]; const ic = h ? h[2] : VIEWS[hid][1];
    const subs = h ? h[3].filter((x) => items.includes(x)) : [hid]; const href = lastTab[hid] && subs.includes(lastTab[hid]) ? lastTab[hid] : subs[0];
    const badge = hid === 'trades' && todayN ? `<span class="nav__count">${todayN}</span>` : hid === 'accounts' && atRisk ? `<span class="nav__count" style="background:var(--bad-soft);color:var(--bad)">${atRisk}</span>` : hid === 'accounts' && pending ? `<span class="nav__count">${pending}</span>` : '';
    return `<a class="nav__item${hid === (items.includes('admin') ? 'admin' : 'settings') ? ' nav__item--gap' : ''}" href="#${href}" data-id="${hid}" ${hid === cur ? 'aria-current="page"' : ''}>${icon(ic)}<span class="nav__label">${label}</span>${badge}</a>`;
  }).join('');
  $$('.nav__item', nav).forEach((a) => a.onclick = () => $('#slab').classList.remove('is-open'));
  requestAnimationFrame(() => movePill(nav, false));
  // keep the red highlight on the current page if the menu's layout shifts later (fonts loading, badges, sidebar fold, window resize)
  if (!nav.__ro && window.ResizeObserver) { nav.__ro = new ResizeObserver(() => movePill(nav, false)); nav.__ro.observe(nav); }
  document.fonts?.ready.then(() => movePill(nav, false));
}
function updateSide() {
  const r = safeToRisk(); const box = $('#safe'); if (!box) return;
  const m = missionMetrics();
  const bar = (k) => `<div class="safe__bar ${k < 0.3 ? 'is-bad' : k < 0.6 ? 'is-warn' : ''}"><i style="width:${clamp(k, 0, 1) * 100}%"></i></div>`;
  if (r.amount !== null) {
    const chip = r.tradesLeft !== null ? `<span class="safe__chip">${r.tradesLeft} trade${r.tradesLeft === 1 ? '' : 's'} left</span>` : '';
    box.innerHTML = `<div class="safe__h"><small>Safe to risk today</small>${chip}</div><b>${money(r.amount)}</b>${r.rule ? bar(r.amount / r.rule) : ''}<p><span>${r.todayNet ? `Today ${money(r.todayNet, { sign: true })}` : 'No trades yet today'}</span>${r.rule ? `<span>of ${money(r.rule)}</span>` : ''}</p>${r.limitBy ? `<p><span>Capped by ${esc(r.limitBy)}</span></p>` : ''}`;
  } else if (m) {
    box.innerHTML = `<div class="safe__h"><small>${esc(m.name)}</small><span class="safe__chip">${m.tdLeft} days left</span></div><b>${money(m.actual)}</b>${bar(Math.max(m.progress, 0.6))}<p><span>${Math.round(m.progress * 100)}% done</span><span>of ${money(m.target)}</span></p>`;
    $('.safe__bar', box).className = 'safe__bar is-goal'; $('.safe__bar i', box).style.width = clamp(m.progress, 0, 1) * 100 + '%';
  } else box.innerHTML = `<div class="safe__h"><small>Today</small></div><b>${money(r.todayNet, { sign: true })}</b><p><span>${r.tradesToday} trades</span><span>set limits in Playbook</span></p>`;
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
  runAgents(null).filter(([, agent]) => agent !== 'Risk agent').forEach(([lvl, agent, title, body]) => out.push([lvl, agent === 'Habit agent' ? 'coffee' : 'agent', title, `${agent}: ${body}`]));
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
  let id = (location.hash || '#overview').slice(1);
  if (!VIEWS[id]) id = 'overview';
  if (!items.includes(id)) id = 'overview';
  const main = $('#main'); if (!main) return;
  const render = () => {
    current = id;
    const hid = hubOf(id)?.[0] || id;
    $$('.nav__item').forEach((a) => (a.dataset.id === hid ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    { const a = $(`.nav__item[data-id="${hid}"]`); if (a) a.setAttribute('href', '#' + id); }
    movePill($('#nav'), !first);
    main.scrollTop = 0;
    VIEWS[id][2](main, pendingOpts); pendingOpts = {}; hubTabs(main, id);
    V3.renderFilterBar(id);
    document.title = `${VIEWS[id][0]} · ${APP.name}`;
    enterPage(main, { first });
  };
  if (first || !main.firstElementChild) render(); else leavePage(main, render);
}
window.addEventListener('hashchange', () => { if ($('#main')) route(false); });

function paintPlan() {
  const u = $('#usage'); if (u) { u.innerHTML = PL.usageHTML(true); PL.bindUsage(u); }
  const b = S.sub?.banner; const stage = $('.stage'); let bar = $('#banner');
  let seen = ''; try { seen = localStorage.getItem('st_banner_seen') || ''; } catch (e) {}
  if (b && b !== seen && stage) { if (!bar) { stage.insertAdjacentHTML('afterbegin', '<div class="banner" id="banner"><span></span><button class="ibtn" aria-label="Dismiss">' + icon('close') + '</button></div>'); bar = $('#banner'); } $('span', bar).textContent = b; $('button', bar).onclick = () => { try { localStorage.setItem('st_banner_seen', b); } catch (e) {} bar.remove(); }; }
  else if (bar) bar.remove();
}
addEventListener('st:upgrade', (e) => PL.upgradeModal(e.detail?.reason));
addEventListener('st:refresh', () => refresh());
addEventListener('st:usage', () => paintPlan());
function refresh() {
  const main = $('#main'); if (!main || !current) return;
  const y = main.scrollTop;
  VIEWS[current][2](main, {}); hubTabs(main, current);
  main.scrollTop = y;
  V3.renderFilterBar(current);
  // light re-entrance: headings stay, data re-animates
  const h1 = $('.phead h1', main); if (h1) h1.dataset.split = '1';
  animateData(main);
  buildNav(); updateSide(); paintPlan();
}
function rerenderShell() { shell(false); }

V.setHooks({ go, refresh, rerenderShell, updateSide, onboard: () => onboarding() });
if (window.gsap) window.gsap.config({ nullTargetWarn: false });
installGlint(); installPress();
boot();
