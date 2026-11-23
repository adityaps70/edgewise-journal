// Motion system — GSAP recipes matching the Verdelo template:
// expo.out entrances, split-character headings, sliding nav pill / segment thumb,
// count-up figures, growing bars, cursor glint on glass, back.out pops, circular theme reveal.
import { $, $$, clamp } from './core.js?v=a8b6f7c0';

const G = () => window.gsap;
export const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
const X = (d) => (reduced.matches ? 0 : d);

// ---------------------------------------------------------------- headings
export function splitHeading(el) {
  if (!el || el.dataset.split) return [];
  el.dataset.split = '1';
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.innerHTML = text.split(/(\s+)/).map((w) => (/^\s+$/.test(w) ? w : `<span class="word" aria-hidden="true">${[...w].map((c) => `<span class="ch">${c}</span>`).join('')}</span>`)).join('');
  return $$('.ch', el);
}
export function revealHeading(el, delay = 0) {
  const chars = splitHeading(el);
  if (!G() || reduced.matches || !chars.length) return;
  G().fromTo(chars, { yPercent: 115, rotation: 6 }, { yPercent: 0, rotation: 0, duration: 0.85, ease: 'power4.out', stagger: 0.022, delay, clearProps: 'transform' });
}

// ---------------------------------------------------------------- numbers
export function countUp(el, to, fmt, { duration = 1.1, delay = 0, from = 0 } = {}) {
  if (!el) return;
  if (!G() || reduced.matches) { el.textContent = fmt(to); return; }
  const s = { v: from };
  el.textContent = fmt(from);
  G().to(s, { v: to, duration, delay, ease: 'power3.out', onUpdate: () => { el.textContent = fmt(s.v); }, onComplete: () => { el.textContent = fmt(to); } });
}
export function flash(el) { if (!el) return; el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash'); }

// ---------------------------------------------------------------- page entrance
export function enterPage(root, { first = false } = {}) {
  const g = G();
  const h1 = $('.phead h1', root);
  if (h1) revealHeading(h1, first ? 0.25 : 0.02);
  if (!g || reduced.matches) { finalize(root); return; }
  const base = first ? 0.3 : 0.06;
  const head = $$('.phead__eyebrow, .phead p, .phead__actions > *', root);
  g.fromTo(head, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.05, delay: base + 0.1, clearProps: 'transform,opacity' });
  const cards = $$('.page > .grid > .card, .page > .grid > .kpi, .page > .grid > div > .card, .page > .card, .page > .grid > .grid > .card, .page > .grid > .grid > .kpi, .page > .toolbar', root);
  g.fromTo(cards, { opacity: 0, y: 26, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'expo.out', stagger: 0.06, delay: base + 0.12, clearProps: 'transform,opacity' });
  const rows = $$('.txrow, .cat, table.t tbody tr, .cal__d, .cal__w', root).slice(0, 60);
  g.fromTo(rows, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.45, ease: 'power3.out', stagger: 0.022, delay: base + 0.3, clearProps: 'transform,opacity' });
  animateData(root, base + 0.25);
}
export function animateData(root, delay = 0) {
  const g = G();
  $$('[data-count]', root).forEach((el) => {
    const to = parseFloat(el.dataset.count); const fmt = window.__fmt[el.dataset.fmt || 'money'];
    countUp(el, to, fmt, { delay });
  });
  if (!g || reduced.matches) { finalize(root); return; }
  $$('.meter i[data-w]', root).forEach((el, i) => g.fromTo(el, { width: '0%' }, { width: el.dataset.w, duration: 1.1, ease: 'expo.out', delay: delay + 0.05 * i }));
  const bars = $$('[data-grow]', root);
  bars.forEach((b, i) => g.fromTo(b, { scaleY: 0 }, { scaleY: 1, duration: 0.95, delay: delay + i * 0.025, ease: 'expo.out', transformOrigin: b.dataset.grow === 'down' ? '50% 0%' : '50% 100%', clearProps: 'transform' }));
  $$('.split__seg', root).forEach((s, i) => g.fromTo(s, { scaleX: 0 }, { scaleX: 1, duration: 0.9, delay: delay + i * 0.06, ease: 'expo.out', clearProps: 'transform' }));
  $$('path[data-draw]', root).forEach((p) => {
    const L = p.getTotalLength ? p.getTotalLength() : 0; if (!L) return;
    g.fromTo(p, { strokeDasharray: L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 1.6, delay, ease: 'power3.out', clearProps: 'strokeDasharray,strokeDashoffset' });
  });
  $$('[data-fade]', root).forEach((p) => g.fromTo(p, { opacity: 0 }, { opacity: 1, duration: 1.2, delay: delay + 0.4, ease: 'power2.out' }));
  $$('.radar__shape', root).forEach((r) => g.fromTo(r, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.1, ease: 'back.out(1.4)', delay: delay + 0.2 }));
  $$('[data-pop]', root).forEach((p, i) => g.fromTo(p, { scale: 0, opacity: 0, transformOrigin: 'center' }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(3)', delay: delay + 0.6 + i * 0.04, clearProps: 'transform,opacity' }));
}
function finalize(root) { $$('.meter i[data-w]', root).forEach((el) => (el.style.width = el.dataset.w)); }

export function bootShell(app) {
  const g = G(); if (!g || reduced.matches) return;
  const tl = g.timeline();
  tl.fromTo(app.querySelector('.slab'), { opacity: 0, scale: 0.985 }, { opacity: 1, scale: 1, duration: 0.9, ease: 'expo.out', clearProps: 'transform,opacity' }, 0);
  tl.fromTo(app.querySelector('.head'), { y: -26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', clearProps: 'transform,opacity' }, 0.1);
  tl.fromTo(app.querySelectorAll('.side__top, .nav__item, .safe, .side__me'), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.55, ease: 'power3.out', stagger: 0.035, clearProps: 'transform,opacity' }, 0.12);
}

// ---------------------------------------------------------------- sliding pill / thumb
export function movePill(nav, animate = true) {
  const pill = $('.nav__pill', nav); const cur = $('.nav__item[aria-current="page"]', nav);
  if (!pill) return;
  if (!cur) { pill.style.opacity = 0; return; }
  const y = cur.offsetTop; const h = cur.offsetHeight;
  const g = G();
  if (!g || !animate || reduced.matches || pill.style.opacity !== '1') { pill.style.opacity = 1; pill.style.transform = `translateY(${y}px)`; pill.style.height = h + 'px'; if (g) g.set(pill, { y, height: h, opacity: 1 }); return; }
  g.to(pill, { y, height: h, duration: 0.55, ease: 'expo.out', overwrite: true });
  g.fromTo(pill, { scaleX: 0.94 }, { scaleX: 1, duration: 0.6, ease: 'back.out(2)' });
}
export function segInit(seg) {
  if (!seg) return;
  let thumb = $('.seg__thumb', seg);
  if (!thumb) { thumb = document.createElement('span'); thumb.className = 'seg__thumb'; seg.prepend(thumb); }
  const place = (animate) => {
    const on = $('button.is-on', seg); if (!on) { thumb.style.opacity = 0; return; }
    const props = { x: on.offsetLeft, width: on.offsetWidth, opacity: 1 };
    if (G() && animate && !reduced.matches) G().to(thumb, { ...props, duration: 0.5, ease: 'expo.out', overwrite: true });
    else if (G()) G().set(thumb, props); else Object.assign(thumb.style, { transform: `translateX(${props.x}px)`, width: props.width + 'px', opacity: 1 });
  };
  requestAnimationFrame(() => place(false));
  seg.__place = place;
}
export function segSelect(seg, btn) {
  $$('button', seg).forEach((b) => b.classList.toggle('is-on', b === btn));
  seg.__place?.(true);
}

// ---------------------------------------------------------------- glint (cursor light on glass)
export function installGlint(sel = '.card, .kpi, .safe') {
  if (!G() || reduced.matches) return;
  let current = null;
  const make = (el) => {
    const layer = document.createElement('span'); layer.className = 'glint'; layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<i class="glint__wash"></i><span class="glint__rim"><i></i></span>';
    el.prepend(layer);
    const wash = layer.querySelector('.glint__wash'); const rim = layer.querySelector('.glint__rim i');
    el.__g = { layer, x: G().quickTo(wash, 'x', { duration: 0.45, ease: 'power3.out' }), y: G().quickTo(wash, 'y', { duration: 0.45, ease: 'power3.out' }), rx: G().quickTo(rim, 'x', { duration: 0.3, ease: 'power3.out' }), ry: G().quickTo(rim, 'y', { duration: 0.3, ease: 'power3.out' }) };
    return el.__g;
  };
  const hide = (el) => el?.__g && G().to(el.__g.layer, { opacity: 0, duration: 0.5, ease: 'power2.out', overwrite: true });
  document.addEventListener('pointermove', (e) => {
    if (!fine.matches || e.pointerType !== 'mouse') return;
    const el = e.target.closest?.(sel) || null;
    if (el !== current) { hide(current); current = el; if (el) { const g = el.__g && el.contains(el.__g.layer) ? el.__g : make(el); G().to(g.layer, { opacity: 1, duration: 0.35, ease: 'power2.out', overwrite: true }); } }
    if (!el) return;
    const r = el.getBoundingClientRect(); const g = el.__g;
    const x = e.clientX - r.left; const y = e.clientY - r.top;
    g.x(x); g.y(y); g.rx(x); g.ry(y);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { hide(current); current = null; });
}

// ---------------------------------------------------------------- press feedback
export function installPress() {
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('.btn, .rbtn, .chip, .ibtn, .seg button, .nav__item, .wallet__bar button');
    if (!b || !G() || reduced.matches) return;
    G().to(b, { scale: 0.95, duration: 0.12, ease: 'power2.out', overwrite: 'auto' });
    const up = () => { G().to(b, { scale: 1, duration: 0.55, ease: 'back.out(3)', overwrite: 'auto', clearProps: 'transform' }); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
}
export function wobble(el) {
  if (!el || !G() || reduced.matches) return;
  G().fromTo(el, { rotation: 0 }, { keyframes: { rotation: [0, 16, -14, 10, -6, 0] }, duration: 0.8, ease: 'power2.out', transformOrigin: '50% 10%' });
}
export function pop(el) {
  if (!el || !G() || reduced.matches) return;
  G().fromTo(el, { y: -4, scale: 1.08 }, { y: 0, scale: 1, duration: 0.55, ease: 'back.out(2.4)', overwrite: 'auto', clearProps: 'transform' });
}
export function shake(el) {
  if (!el || !G() || reduced.matches) return;
  G().fromTo(el, { x: 0 }, { keyframes: { x: [0, -8, 7, -5, 3, 0] }, duration: 0.45, ease: 'power2.out' });
}

// ---------------------------------------------------------------- modal
export function openModal(scrim) {
  const g = G(); const panel = $('.modal', scrim);
  if (!g || reduced.matches) return;
  g.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.25 });
  g.fromTo(panel, { y: -18, scale: 0.97, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(1.6)', clearProps: 'transform,opacity' });
  g.fromTo($$('.modal__head, .tabs, .form > *, .stack > *, .modal__foot', panel).slice(0, 30), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.015, delay: 0.08, clearProps: 'transform,opacity' });
}
export function closeModal(scrim, done) {
  const g = G(); const panel = $('.modal', scrim);
  if (!g || reduced.matches) { done(); return; }
  g.to(panel, { y: -10, scale: 0.97, opacity: 0, duration: 0.18, ease: 'power2.in' });
  g.to(scrim, { opacity: 0, duration: 0.2, onComplete: done });
}

// ---------------------------------------------------------------- toast
export function toast(msg, ico = '', hold = 1.9) {
  let host = $('.toasts'); if (!host) { host = document.createElement('div'); host.className = 'toasts'; document.body.append(host); }
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = ico + `<span>${msg}</span>`; host.append(t);
  const g = G();
  if (!g || reduced.matches) { setTimeout(() => t.remove(), 700 + hold * 1000); return; }
  g.fromTo(t, { opacity: 0, y: 6, xPercent: -50, scale: 0.9 }, { keyframes: [{ opacity: 1, y: -12, scale: 1, duration: 0.35, ease: 'back.out(2)' }, { opacity: 0, y: -40, duration: 0.8, ease: 'power2.in', delay: hold }], onComplete: () => t.remove() });
}

// ---------------------------------------------------------------- theme reveal
export function switchTheme(next, x, y) {
  const apply = () => { document.documentElement.dataset.theme = next; try { localStorage.setItem('ew_theme', next); } catch (e) {} };
  if (!document.startViewTransition || reduced.matches) { apply(); return; }
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = document.startViewTransition(apply);
  vt.ready.then(() => {
    document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 750, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' });
  });
}

// ---------------------------------------------------------------- page swap
export function leavePage(root, done) {
  const g = G();
  if (!g || reduced.matches || !root.firstElementChild) { done(); return; }
  g.to(root.firstElementChild, { opacity: 0, y: 8, duration: 0.16, ease: 'power2.in', onComplete: done });
}

// ---------------------------------------------------------------- throwable / flippable card stack
export function cardStack(wrap, { onChange } = {}) {
  const cards = $$('.vcard', wrap);
  if (!cards.length) return { next() {}, prev() {}, flip() {} };
  let order = cards.slice(); let flipped = false; const g = G();
  const layout = (animate = true, skip = null) => {
    order.forEach((c, i) => {
      if (c === skip) return;
      const props = { x: 0, y: -i * 16, scale: 1 - i * 0.05, rotation: 0, opacity: i > 3 ? 0 : 1 - i * 0.18, zIndex: 50 - i, filter: `brightness(${1 - i * 0.12})` };
      if (g && animate && !reduced.matches) g.to(c, { ...props, duration: 0.7, ease: 'expo.out', overwrite: 'auto' }); else if (g) g.set(c, props);
      c.style.pointerEvents = i === 0 ? 'auto' : 'none';
    });
    onChange?.(cards.indexOf(order[0]));
  };
  const setFlip = (v) => { flipped = v; const f = $('.vcard__flip', order[0]); if (g) g.to(f, { rotationY: v ? 180 : 0, duration: 0.9, ease: 'back.out(1.6)' }); };
  const unflip = () => { if (flipped) { const f = $('.vcard__flip', order[0]); flipped = false; if (g) g.set(f, { rotationY: 0 }); } };
  let busy = false;
  const throwTop = (dir = 1, vx = 0) => {
    const top = order[0]; unflip();
    if (!g || reduced.matches) { order.push(order.shift()); layout(false); return; }
    busy = true; g.killTweensOf(top);
    g.to(top, { x: dir * (520 + Math.min(400, Math.abs(vx) * 200)), y: '-=30', rotation: dir * 22, rotationY: 0, scale: 0.96, opacity: 0, duration: 0.45, ease: 'power2.in', onComplete: () => { order.push(order.shift()); g.set(top, { x: 0, rotation: 0, scale: 1 }); top.classList.remove('is-held'); busy = false; layout(); } });
  };
  const back = () => { if (busy) return; unflip(); order.unshift(order.pop()); const c = order[0]; if (g && !reduced.matches) g.set(c, { x: -420, rotation: -14, opacity: 0 }); layout(); };
  // hold and drag to throw (the card lifts and tilts, the next one rises behind it); tap to flip
  cards.forEach((c) => {
    let sx = 0; let sy = 0; let dx = 0; let dy = 0; let dragging = false; let t0 = 0; let lx = 0; let lt = 0; let vx = 0;
    c.addEventListener('pointerdown', (e) => {
      if (order[0] !== c || busy || e.button > 0) return;
      dragging = true; sx = e.clientX; sy = e.clientY; dx = dy = vx = 0; t0 = lt = performance.now(); lx = e.clientX;
      c.setPointerCapture(e.pointerId); c.classList.add('is-held');
      if (g) { g.killTweensOf(c); g.to(c, { scale: 1.03, duration: 0.25, ease: 'power3.out' }); }
    });
    c.addEventListener('pointermove', (e) => {
      if (!dragging) return; e.preventDefault();
      dx = e.clientX - sx; dy = e.clientY - sy; const now = performance.now(); if (now - lt > 0) vx = vx * 0.6 + ((e.clientX - lx) / (now - lt)) * 0.4; lx = e.clientX; lt = now;
      if (!g) return;
      const ry = Math.max(-60, Math.min(60, dy)); // vertical travel is damped so the card stays near the stack
      g.set(c, { x: dx, y: ry * 0.35, rotation: dx / 16, rotationY: Math.max(-12, Math.min(12, dx / 22)) });
      const p = Math.min(1, Math.abs(dx) / 160); const nx = order[1];
      if (nx) g.set(nx, { y: -16 + 16 * p, scale: 0.95 + 0.05 * p, opacity: 0.82 + 0.18 * p, filter: `brightness(${0.88 + 0.12 * p})` });
    });
    const end = () => {
      if (!dragging) return; dragging = false;
      const held = performance.now() - t0;
      if (Math.abs(dx) > 120 || (Math.abs(vx) > 0.55 && Math.abs(dx) > 30)) { throwTop(Math.sign(dx) || Math.sign(vx) || 1, vx); return; }
      c.classList.remove('is-held');
      if (g) g.to(c, { x: 0, y: 0, rotation: 0, rotationY: 0, scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.6)' });
      layout(true, c);
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && held < 350) setFlip(!flipped);
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end); c.addEventListener('lostpointercapture', end);
  });
  layout(false);
  if (g && !reduced.matches) g.fromTo(cards, { y: 60, opacity: 0, rotation: (i) => (i % 2 ? 2.5 : -2.5), scale: 0.95 }, { y: (i) => -order.indexOf(cards[i]) * 16, opacity: (i) => { const k = order.indexOf(cards[i]); return k > 3 ? 0 : 1 - k * 0.18; }, rotation: 0, scale: (i) => 1 - order.indexOf(cards[i]) * 0.05, duration: 0.85, ease: 'back.out(1.4)', stagger: 0.08, delay: 0.35 });
  // shine sweep
  if (g && !reduced.matches) $$('.vcard__shine', wrap).forEach((s, i) => g.fromTo(s, { xPercent: -80 }, { xPercent: 140, duration: 1.6, ease: 'power2.inOut', delay: 1 + i * 0.1 }));
  return { next: () => throwTop(1), prev: back, flip: () => setFlip(!flipped) };
}

export { clamp };
