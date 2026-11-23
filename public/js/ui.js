// Shared UI pieces: sliders, glass date picker, live exchange rates.
import { $, $$, esc, iso, today, parseISO, clamp, num, icon } from './core.js?v=daca8531';

const G = () => window.gsap;
const RM = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ slider
// Range + editable number in one control. The number input carries `name`, so forms read it like any field.
export function slider({ name, label, value, min = 0, max = 100, step = 1, prefix = '', suffix = '', hint = '', zero = '', id = '' }) {
  const v = value === '' || value === undefined || value === null ? min : Number(value);
  const p = max > min ? clamp((v - min) / (max - min), 0, 1) * 100 : 0;
  const fmt = (n) => (n >= 1000 ? Number(n).toLocaleString('en-US') : n);
  return `<div class="sl${zero && v === min ? ' is-zero' : ''}" style="--p:${p}%" ${id ? `id="${id}"` : ''} data-zero="${esc(zero)}">
    <div class="sl__top"><span class="sl__label">${label}</span>
      <label class="sl__val"><span class="sl__pre">${esc(prefix)}</span><input class="sl__num" type="number" inputmode="decimal" name="${name}" value="${v}" min="${min}" step="${step}" aria-label="${esc(String(label).replace(/<[^>]+>/g, ''))}"><span class="sl__suf">${esc(suffix)}</span><span class="sl__zero">${esc(zero)}</span></label></div>
    <input class="sl__range" type="range" min="${min}" max="${max}" step="${step}" value="${clamp(v, min, max)}" tabindex="-1" aria-hidden="true">
    <div class="sl__foot"><span>${zero || esc(prefix) + fmt(min) + esc(suffix)}</span>${hint ? `<em>${hint}</em>` : '<em></em>'}<span>${esc(prefix)}${fmt(max)}${esc(suffix)}</span></div>
  </div>`;
}
function paint(sl, v) {
  const r = $('.sl__range', sl); const min = +r.min; const max = +r.max;
  sl.style.setProperty('--p', (max > min ? clamp((v - min) / (max - min), 0, 1) * 100 : 0) + '%');
  sl.classList.toggle('is-zero', !!sl.dataset.zero && Number(v) === min);
}
export function setSlider(sl, v, { max } = {}) {
  if (!sl) return;
  const r = $('.sl__range', sl); const n = $('.sl__num', sl);
  if (max !== undefined) { r.max = max; const f = $('.sl__foot span:last-child', sl); if (f) f.textContent = ($('.sl__pre', sl).textContent || '') + Number(max).toLocaleString('en-US') + ($('.sl__suf', sl).textContent || ''); }
  n.value = v; r.value = clamp(v, +r.min, +r.max); paint(sl, v);
}
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.classList?.contains('sl__range')) {
    const sl = t.closest('.sl'); const n = $('.sl__num', sl); n.value = t.value; paint(sl, +t.value);
    n.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (t.classList?.contains('sl__num')) {
    const sl = t.closest('.sl'); const r = $('.sl__range', sl);
    if (e.isTrusted) r.value = clamp(num(t.value), +r.min, +r.max);
    paint(sl, num(t.value));
  }
});
document.addEventListener('pointerdown', (e) => {
  const r = e.target.closest?.('.sl__range'); if (!r || !G() || RM()) return;
  const val = r.closest('.sl').querySelector('.sl__val');
  G().fromTo(val, { scale: 1 }, { scale: 1.08, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1 });
});

// ------------------------------------------------------------------ date picker
// Every <input type="date"> anywhere in the app becomes a glass button + popover calendar.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtBtn = (v) => (v ? parseISO(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick a date');
function enhance(input) {
  if (input.dataset.dp) return;
  input.dataset.dp = '1';
  const cls = input.className; const style = input.getAttribute('style') || '';
  input.type = 'hidden';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'dp ' + cls; if (style) btn.setAttribute('style', style);
  btn.innerHTML = `${icon('calendar')}<span>${esc(fmtBtn(input.value))}</span>`;
  input.after(btn);
  input.__dpBtn = btn;
  btn.addEventListener('click', (e) => { e.preventDefault(); openPicker(input, btn); });
}
export function refreshDate(input) { if (input?.__dpBtn) input.__dpBtn.querySelector('span').textContent = fmtBtn(input.value); }
let open = null;
function closePicker() {
  if (!open) return; const { pop } = open; open = null;
  document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', onKey, true);
  if (G() && !RM()) G().to(pop, { opacity: 0, y: -6, scale: 0.97, duration: 0.16, ease: 'power2.in', onComplete: () => pop.remove() }); else pop.remove();
}
const outside = (e) => { if (open && !open.pop.contains(e.target) && !open.btn.contains(e.target)) closePicker(); };
const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePicker(); } };
function openPicker(input, btn) {
  if (open && open.input === input) { closePicker(); return; }
  closePicker();
  const sel = input.value || ''; const base = parseISO(sel || today());
  let y = base.getFullYear(); let m = base.getMonth();
  const pop = document.createElement('div'); pop.className = 'dpop'; pop.setAttribute('role', 'dialog');
  document.body.append(pop);
  const render = (dir = 0) => {
    const first = new Date(y, m, 1); const startDow = (first.getDay() + 6) % 7; const days = new Date(y, m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(y, m, 1 - startDow + i); const v = iso(d);
      const out = d.getMonth() !== m;
      cells += `<button type="button" class="dpop__d${out ? ' is-out' : ''}${v === today() ? ' is-today' : ''}${v === input.value ? ' is-sel' : ''}${d.getDay() % 6 === 0 ? ' is-we' : ''}" data-v="${v}">${d.getDate()}</button>`;
    }
    pop.innerHTML = `<div class="dpop__head"><button type="button" class="dpop__nav" data-n="-12" aria-label="Previous year">«</button><button type="button" class="dpop__nav" data-n="-1" aria-label="Previous month">${icon('left')}</button>
      <div class="dpop__title"><b>${MONTHS[m]}</b> <span>${y}</span></div>
      <button type="button" class="dpop__nav" data-n="1" aria-label="Next month">${icon('right')}</button><button type="button" class="dpop__nav" data-n="12" aria-label="Next year">»</button></div>
      <div class="dpop__dow">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="dpop__grid">${cells}</div>
      <div class="dpop__foot"><button type="button" data-q="today">Today</button><button type="button" data-q="+7">+1 week</button><button type="button" data-q="+30">+30 days</button><button type="button" data-q="clear" class="muted">Clear</button></div>`;
    if (dir && G() && !RM()) G().fromTo($('.dpop__grid', pop), { x: 18 * dir, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: 'expo.out' });
    $$('.dpop__nav', pop).forEach((b) => (b.onclick = () => { const n = +b.dataset.n; const d = new Date(y, m + n, 1); y = d.getFullYear(); m = d.getMonth(); render(Math.sign(n)); }));
    $$('.dpop__d', pop).forEach((b) => (b.onclick = () => pick(b.dataset.v)));
    $$('[data-q]', pop).forEach((b) => (b.onclick = () => { const q = b.dataset.q; if (q === 'clear') pick(''); else if (q === 'today') pick(today()); else { const d = parseISO(input.value || today()); d.setDate(d.getDate() + num(q)); pick(iso(d)); } }));
  };
  const pick = (v) => {
    input.value = v; refreshDate(input);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    const cell = v && pop.querySelector(`[data-v="${v}"]`);
    if (cell && G() && !RM()) { $$('.is-sel', pop).forEach((c) => c.classList.remove('is-sel')); cell.classList.add('is-sel'); G().fromTo(cell, { scale: 0.7 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', onComplete: closePicker }); }
    else closePicker();
  };
  render();
  // place under (or above) the button
  const r = btn.getBoundingClientRect(); const w = 300; const h = pop.offsetHeight || 340;
  let left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
  let top = r.bottom + 8; if (top + h > innerHeight - 8 && r.top - h - 8 > 8) top = r.top - h - 8;
  Object.assign(pop.style, { left: left + 'px', top: top + 'px', width: w + 'px' });
  if (G() && !RM()) G().fromTo(pop, { opacity: 0, y: -8, scale: 0.96, transformOrigin: '20% 0%' }, { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: 'back.out(1.6)' });
  open = { pop, input, btn };
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', onKey, true); });
}
new MutationObserver(() => $$('input[type="date"]:not([data-dp])').forEach(enhance)).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('resize', closePicker);
document.addEventListener('scroll', (e) => { if (open && !open.pop.contains(e.target)) closePicker(); }, true);

// ------------------------------------------------------------------ live exchange rates
// Free keyless sources, cached for 6 hours. Rates by ExchangeRate-API (https://www.exchangerate-api.com).
export async function liveRate(from = 'USD', to = 'INR', { force = false } = {}) {
  if (!from || !to || from === to) return { rate: 1, at: Date.now(), source: 'same' };
  const key = `ew_fx_${from}_${to}`;
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && !force && Date.now() - c.at < 6 * 3600e3) return c; } catch (e) { /* ignore */ }
  const sources = [
    async () => { const r = await fetch(`https://open.er-api.com/v6/latest/${from}`); const j = await r.json(); if (j.result !== 'success' || !j.rates[to]) throw 0; return { rate: j.rates[to], source: 'ExchangeRate-API' }; },
    async () => { const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`); const j = await r.json(); if (!j.rates?.[to]) throw 0; return { rate: j.rates[to], source: 'Frankfurter (ECB)' }; },
  ];
  for (const s of sources) {
    try {
      const out = { ...(await s()), at: Date.now() };
      try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) { /* ignore */ }
      return out;
    } catch (e) { /* try next */ }
  }
  return null;
}
export const fxAgo = (at) => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

// ---- slider sound: a soft detent click as the thumb moves, pitch rises with the value
let AC = null; let lastTick = 0; const detent = new WeakMap();
export const soundOn = () => { try { return localStorage.getItem('st_sound') !== 'off'; } catch (e) { return true; } };
export const setSound = (on) => { try { localStorage.setItem('st_sound', on ? 'on' : 'off'); } catch (e) {} };
function tick(p, edge) {
  if (!soundOn()) return;
  const now = performance.now(); if (now - lastTick < 26 && !edge) return; lastTick = now;
  try {
    AC ||= new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume();
    const t = AC.currentTime; const o = AC.createOscillator(); const g = AC.createGain(); const f = AC.createBiquadFilter();
    o.type = edge ? 'sine' : 'triangle'; o.frequency.setValueAtTime(edge ? 1400 : 520 + 900 * p, t); o.frequency.exponentialRampToValueAtTime((edge ? 1400 : 520 + 900 * p) * 0.6, t + 0.04);
    f.type = 'highpass'; f.frequency.value = 300;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(edge ? 0.07 : 0.045, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + (edge ? 0.09 : 0.045));
    o.connect(f).connect(g).connect(AC.destination); o.start(t); o.stop(t + 0.1);
  } catch (e) { /* no audio available */ }
}
document.addEventListener('input', (e) => {
  const r = e.target; if (!(r instanceof HTMLInputElement) || r.type !== 'range') return;
  const min = +r.min || 0; const max = +r.max || 100; const p = max > min ? (r.value - min) / (max - min) : 0;
  const d = Math.round(p * 40); if (detent.get(r) === d) return; detent.set(r, d);
  tick(p, p <= 0 || p >= 1);
}, true);
