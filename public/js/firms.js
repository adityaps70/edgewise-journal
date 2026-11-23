// Prop firm catalog + picker. Rules live in data/firms.json so they can be updated without touching code.
import { $, $$, esc, uid, num, today, money, short, icon, S, P } from './core.js?v=6dca6492';
import { slider } from './ui.js?v=6dca6492';

let CAT = null;
export async function loadFirms() {
  if (CAT) return CAT;
  try { CAT = await (await fetch(new URL('data/firms.json', document.baseURI))).json(); } catch (e) { CAT = { firms: [], verified: '' }; }
  return CAT;
}
// built-in catalog + firms/plans the user added themselves (stored as 'firm' docs, synced like everything else)
export const catalog = () => {
  const base = CAT || { firms: [], verified: '' }; const cus = S.firm || [];
  if (!cus.length) return base;
  const firms = base.firms.map((f) => { const c = cus.find((x) => x.id === f.id); return c ? { ...f, programs: [...f.programs, ...c.programs] } : f; })
    .concat(cus.filter((c) => !base.firms.some((f) => f.id === c.id)));
  return { ...base, firms };
};
export const firstStage = (program, want) => (program.stages.includes(want) ? want : program.stages[0]);
export const isInstant = (program) => program && !program.stages.includes('challenge');
export const firmById = (id) => catalog().firms.find((f) => f.id === id);
export const mono = (a) => firmById(a?.firmId)?.mono || (catalog().firms.find((f) => f.name === a?.firm)?.mono) || (a?.firm ? a.firm.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() : 'ME');
export const STAGE_LABEL = { challenge: 'Challenge', verification: 'Verification', funded: 'Funded' };
const k = (n) => (n >= 1000 ? Math.round(n / 1000) + 'K' : n);

export function planRules(firm, program, size, stage) {
  const s = program.sizes.find((x) => x.size === size) || program.sizes[0];
  const funded = stage === 'funded';
  return {
    size: s.size,
    target: funded ? '' : stage === 'verification' ? s.target2 || s.target : s.target,
    maxLoss: s.maxLoss,
    ddType: program.ddType,
    ddNote: program.ddNote,
    dailyLimit: funded && s.fundedDaily ? s.fundedDaily : s.daily || '',
    minDays: funded ? '' : program.minDays || '',
    consistency: program.consistency || '',
    split: program.split || '',
    cost: funded && !isInstant(program) ? '' : s.price || '',
    priceCurrency: program.priceCurrency || 'USD',
    activation: program.activation || '',
    note: program.note || '',
  };
}
export function accountFromPlan(firm, program, size, stage, n = 1) {
  const r = planRules(firm, program, size, stage);
  return {
    id: uid(), name: `${firm.name.split(' ')[0]} ${k(size)} ${program.name}${n > 1 ? ' #' + n : ''}`,
    firm: firm.name, firmId: firm.id, programId: program.id, stage,
    type: stage === 'funded' ? 'funded' : 'challenge', status: stage === 'funded' ? 'funded' : 'active',
    size: r.size, cost: r.cost, target: r.target, maxLoss: r.maxLoss, ddType: r.ddType,
    dailyLimit: r.dailyLimit, personalDaily: defaultDaily(r), minDays: r.minDays, consistency: r.consistency, split: r.split,
    purchaseDate: today(), startPnl: '', rulesFrom: program.custom ? `${firm.name} ${program.name}, added by you` : `${firm.name} ${program.name}, catalog ${catalog().verified}`,
  };
}
export const defaultDaily = (a) => num(a.dailyLimit) || Math.round(num(a.maxLoss) * 0.5 / 50) * 50 || '';
export const dailyCap = (a) => num(a.dailyLimit) || num(a.maxLoss) || Math.max(500, Math.round(num(a.size) * 0.05));

export function rulePills(a) {
  const p = [];
  if (num(a.target)) p.push(`<span class="rp rp--good">${icon('target')}Target ${money(a.target)}</span>`);
  if (num(a.maxLoss)) p.push(`<span class="rp rp--bad">${icon('shield')}Max loss ${money(a.maxLoss)} <i>${a.ddType === 'static' ? 'static' : 'trailing'}</i></span>`);
  p.push(num(a.dailyLimit) ? `<span class="rp rp--warn">${icon('flag')}Firm daily ${money(a.dailyLimit)}</span>` : `<span class="rp">${icon('flag')}No firm daily limit</span>`);
  if (num(a.minDays)) p.push(`<span class="rp">${icon('calendar')}Min ${a.minDays} trading day${a.minDays > 1 ? 's' : ''}</span>`);
  if (num(a.consistency)) p.push(`<span class="rp">${icon('analytics')}${a.consistency}% consistency</span>`);
  return p.join('');
}

// ------------------------------------------------------------------ picker
// mount(container, { accounts, markets, onChange }) renders firm cards → plan config → added accounts with daily-stop sliders.
export function mountPicker(box, state) {
  const shownF = () => { const firms = catalog().firms.filter((f) => !state.markets?.length || state.markets.some((m) => (f.market === 'forex' ? ['forex', 'crypto', 'stocks'].includes(m) : ['futures', 'options', 'indian'].includes(m)))).concat(catalog().firms.filter(() => false));
  return firms.length ? firms : catalog().firms; };
  let shown = shownF();
  let sel = null; // {firm, program, size, stage, qty}
  const draw = () => {
    const cfg = sel ? (() => {
      const { firm, program, size, stage, qty } = sel; const r = planRules(firm, program, size, stage);
      return `<div class="fp__cfg">
        <div class="fp__cfghead"><span class="fmono">${esc(firm.mono || firm.name.slice(0, 2))}</span><div><b>${esc(firm.name)}</b><small>${program.custom ? 'Added by you' : `Rules as published · checked ${esc(catalog().verified)}`}${firm.url ? ` · <a href="${esc(firm.url)}" target="_blank" rel="noopener">confirm on site ↗</a>` : ''}</small></div><button type="button" class="ibtn" data-x aria-label="Close">${icon('close')}</button></div>
        <div class="fp__f"><span class="fp__lab">Account type</span><div class="fp__plans">${firm.programs.map((p) => `<button type="button" data-plan="${p.id}" class="chip ${p.id === program.id ? 'is-on' : ''}">${esc(p.name)}${isInstant(p) ? '<em>instant</em>' : ''}${p.custom ? '<em>yours</em>' : ''}</button>`).join('')}<button type="button" class="chip chip--add" data-missing>${icon('plus')}Not listed?</button></div></div>
        <div class="fp__pair"><div class="fp__f"><span class="fp__lab">Size</span><div class="seg seg--accent fp__seg" data-k="size">${program.sizes.map((s) => `<button type="button" data-v="${s.size}" class="${s.size === size ? 'is-on' : ''}">${k(s.size)}</button>`).join('')}</div></div>
        <div class="fp__f"><span class="fp__lab">Stage</span>${isInstant(program) ? '<div class="seg fp__seg"><button type="button" class="is-on" disabled>Funded from day one</button></div>' : `<div class="seg fp__seg" data-k="stage">${program.stages.map((s) => `<button type="button" data-v="${s}" class="${s === stage ? 'is-on' : ''}">${STAGE_LABEL[s]}</button>`).join('')}</div>`}</div></div>
        <div class="fp__rules">${rulePills(r)}${r.cost ? `<span class="rp rp--list" title="The firm's list price. Your journal uses what you actually paid.">List ${r.priceCurrency === 'EUR' ? '€' : '$'}${r.cost}${program.billing === 'monthly' ? '/mo' : ''}</span>` : ''}</div>
        ${r.note ? `<p class="fp__note">${icon('info')}${esc(r.note)}</p>` : ''}
        <div class="fp__paid"><label class="fp__f"><span class="fp__lab">What you paid, per account${program.billing === 'monthly' ? ' (this month)' : ''}</span><span class="fp__pay"><i>${r.priceCurrency === 'EUR' ? '€' : '$'}</i><input type="number" min="0" step="0.01" inputmode="decimal" data-paid value="${sel.paid ?? ''}" placeholder="${r.cost ? 'List ' + r.cost : 'e.g. 49'}"></span><em>After coupons and discounts. Enter 0 if it was free.</em></label><span class="fp__total" data-total></span></div>
        <div class="fp__row fp__row--end"><span>How many?</span><div class="stepper"><button type="button" data-q="-1">−</button><b>${qty}</b><button type="button" data-q="1">+</button></div><button type="button" class="btn btn--primary btn--sm" data-add>${icon('plus')}Add ${qty > 1 ? qty + ' accounts' : 'account'}</button></div>
      </div>`;
    })() : '';
    box.innerHTML = `<div class="fp__grid">${shown.map((f) => `<button type="button" class="fcard ${sel?.firm.id === f.id ? 'is-on' : ''}" data-f="${f.id}"><span class="fmono">${esc(f.mono || f.name.slice(0, 2))}</span><b>${esc(f.name)}</b><small>${f.market === 'forex' ? 'Forex / CFD' : 'Futures'} · ${f.programs.length} plan${f.programs.length > 1 ? 's' : ''}</small></button>`).join('')}
      <button type="button" class="fcard fcard--other" data-f="_other"><span class="fmono">${icon('plus')}</span><b>Firm not listed?</b><small>Add it once, reuse it</small></button>
      ${state.allowOwn ? `<button type="button" class="fcard fcard--other" data-f="_own"><span class="fmono">${icon('payouts')}</span><b>Own capital</b><small>Personal broker account</small></button>` : ''}</div>
      ${cfg}
      <div class="fp__list">${state.accounts.map((a, i) => accRow(a, i)).join('')}</div>`;
    $$('.seg', box).forEach((s) => window.__segInit?.(s));
    bind();
  };
  const accRow = (a, i) => `<div class="facc" data-i="${i}">
    <div class="facc__top"><span class="fmono fmono--sm">${esc(mono(a))}</span><input class="facc__name" data-f="name" value="${esc(a.name)}" aria-label="Account name"><span class="pill ${a.stage === 'funded' || a.type === 'funded' ? 'pill--good' : a.type === 'personal' ? '' : 'pill--info'}">${a.type === 'personal' ? 'Own capital' : STAGE_LABEL[a.stage] || 'Challenge'}</span><button type="button" class="ibtn" data-rm="${i}" aria-label="Remove">${icon('trash')}</button></div>
    ${a.type === 'personal' ? slider({ name: 'size', label: 'Account size', value: a.size || 10000, min: 1000, max: 250000, step: 1000, prefix: '$' }) : `<div class="fp__rules">${rulePills(a)}<label class="rp facc__paid">Paid $<input type="number" min="0" step="0.01" inputmode="decimal" data-f="cost" value="${a.cost === '' || a.cost === undefined ? '' : num(a.cost)}" placeholder="0" aria-label="Price paid"></label></div>`}
    ${a.firmId === '_other' ? `<div class="grid g-3" style="gap:10px;margin-top:8px">${slider({ name: 'target', label: 'Profit target', value: a.target || 3000, min: 0, max: 20000, step: 250, prefix: '$', zero: 'None' })}${slider({ name: 'maxLoss', label: 'Max loss', value: a.maxLoss || 2000, min: 0, max: 15000, step: 250, prefix: '$' })}${slider({ name: 'dailyLimit', label: 'Firm daily limit', value: a.dailyLimit || 0, min: 0, max: 10000, step: 50, prefix: '$', zero: 'None' })}</div>` : ''}
    ${slider({ name: 'personalDaily', label: 'Your daily stop', value: a.personalDaily || defaultDaily(a), min: 50, max: dailyCap(a), step: 50, prefix: '$', hint: num(a.dailyLimit) ? `firm limit ${money(a.dailyLimit)}` : `max loss ${money(a.maxLoss || dailyCap(a))}` })}
  </div>`;
  const bind = () => {
    $$('.fcard', box).forEach((c) => (c.onclick = () => {
      const id = c.dataset.f;
      if (id === '_other') { addMissing(null); return; }
      if (id === '_own') { state.accounts.push({ id: uid(), name: 'Personal account', firm: '', firmId: '_own', type: 'personal', status: 'funded', size: 10000, maxLoss: '', dailyLimit: '', personalDaily: 300, purchaseDate: today() }); sel = null; done(); return; }
      const f = firmById(id); const p = f.programs[0];
      sel = sel?.firm.id === id ? null : { firm: f, program: p, size: (p.sizes.find((s) => s.size === 50000) || p.sizes[0]).size, stage: firstStage(p, 'challenge'), qty: 1 };
      draw(); anim();
    }));
    $$('.fp__seg button', box).forEach((b) => (b.onclick = () => {
      const kk = b.parentElement.dataset.k; window.__segSelect?.(b.parentElement, b);
      if (kk === 'program') { sel.program = sel.firm.programs.find((p) => p.id === b.dataset.v); if (!sel.program.sizes.some((s) => s.size === sel.size)) sel.size = sel.program.sizes[0].size; sel.stage = firstStage(sel.program, sel.stage); }
      if (kk === 'size') sel.size = +b.dataset.v;
      if (kk === 'stage') sel.stage = b.dataset.v;
      setTimeout(() => { draw(); const r = $('.fp__rules', box); if (r && window.gsap) window.gsap.fromTo(r.children, { opacity: 0, y: 6 }, { opacity: 1, y: 0, stagger: 0.03, duration: 0.35 }); }, kk === 'program' ? 0 : 120);
    }));
    $$('[data-plan]', box).forEach((b) => (b.onclick = () => { sel.program = sel.firm.programs.find((p) => p.id === b.dataset.plan); if (!sel.program.sizes.some((s) => s.size === sel.size)) sel.size = (sel.program.sizes.find((s) => s.size === 50000) || sel.program.sizes[0]).size; sel.stage = firstStage(sel.program, sel.stage); draw(); const r = $('.fp__rules', box); if (r && window.gsap) window.gsap.fromTo(r.children, { opacity: 0, y: 6 }, { opacity: 1, y: 0, stagger: 0.03, duration: 0.35 }); }));
    const ms = $('[data-missing]', box); if (ms) ms.onclick = () => addMissing(sel.firm);
    const x = $('[data-x]', box); if (x) x.onclick = () => { sel = null; draw(); };
    $$('[data-q]', box).forEach((b) => (b.onclick = () => { sel.qty = Math.max(1, Math.min(20, sel.qty + +b.dataset.q)); draw(); }));
    const paid = $('[data-paid]', box);
    const total = () => { const t = $('[data-total]', box); if (!t || !sel) return; const v = sel.paid; t.innerHTML = v !== '' && v !== undefined && sel.qty > 1 ? `${sel.qty} × ${money(num(v))} = <b>${money(num(v) * sel.qty)}</b>` : ''; };
    if (paid) { paid.oninput = () => { sel.paid = paid.value; total(); }; total(); }
    const add = $('[data-add]', box);
    if (add) add.onclick = () => {
      if (sel.paid === undefined || sel.paid === '') { const pf = $('.fp__pay', box); pf?.classList.remove('is-bad'); void pf?.offsetWidth; pf?.classList.add('is-bad'); paid?.focus(); return; }
      const same = state.accounts.filter((a) => a.firmId === sel.firm.id && a.programId === sel.program.id && a.size === sel.size).length;
      for (let i = 0; i < sel.qty; i++) state.accounts.push({ ...accountFromPlan(sel.firm, sel.program, sel.size, sel.stage, sel.qty + same > 1 ? same + i + 1 : 1), cost: num(sel.paid) });
      sel = null; done();
    };
    $$('.facc', box).forEach((row) => {
      const a = state.accounts[+row.dataset.i];
      $$('[data-f], .sl__num', row).forEach((inp) => inp.addEventListener('input', () => {
        const f = inp.dataset.f || inp.name; a[f] = inp.type === 'number' ? num(inp.value) : inp.value; state.onChange?.();
      }));
    });
    $$('[data-rm]', box).forEach((b) => (b.onclick = () => { state.accounts.splice(+b.dataset.rm, 1); draw(); state.onChange?.(); }));
  };
  // user-added firm or plan: saved once, then it's in the list like any other
  const addMissing = (firm) => import('./views.js?v=6dca6492').then((V) => V.planModal({ firm, size: sel?.size || 50000, onSave: ({ firmId, programId, size }) => {
    shown = shownF(); const f = firmById(firmId); const p = f.programs.find((x) => x.id === programId);
    sel = { firm: f, program: p, size, stage: firstStage(p, 'challenge'), qty: 1 }; draw(); anim();
  } }));
  const anim = () => { const c = $('.fp__cfg', box); if (c && window.gsap) { window.gsap.fromTo(c, { opacity: 0, y: -10, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.5)' }); window.gsap.fromTo(c.querySelectorAll('.fp__row, .rp'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 0.025, duration: 0.4, delay: 0.1, clearProps: 'transform,opacity' }); } };
  const done = () => { draw(); state.onChange?.(); const last = box.querySelector('.facc:last-child'); if (last && window.gsap) window.gsap.fromTo(last, { opacity: 0, y: 14, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.6)' }); };
  draw();
  return { redraw: draw };
}
