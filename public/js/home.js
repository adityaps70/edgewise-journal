// Landing page: the hero dashboard assembles from scattered pieces as you scroll, plus reveals and live demos.
import { icon, $, $$, clamp } from './core.js?v=066a67fb';
import { reduced, segInit } from './motion.js?v=066a67fb';
import { slider } from './ui.js?v=066a67fb';
import { loadFirms, planRules, defaultDaily, dailyCap } from './firms.js?v=066a67fb';

document.documentElement.dataset.theme = 'dark';
$$('[data-ico]').forEach((el) => (el.innerHTML = icon(el.dataset.ico)));
try { if (localStorage.getItem('ew_cache_local')) $$('.hn [data-cta]').forEach((a) => (a.textContent = 'Open my journal')); } catch (e) { /* ignore */ }

// ---------- nav ----------
const hn = $('#hn');
const onScroll = () => hn.classList.toggle('is-scrolled', scrollY > 20);
addEventListener('scroll', onScroll, { passive: true }); onScroll();
$('#hnBurger').onclick = () => { const o = hn.classList.toggle('is-open'); $('#hnBurger').setAttribute('aria-expanded', o); };
$$('#hnLinks a').forEach((a) => (a.onclick = () => hn.classList.remove('is-open')));

// ---------- stars ----------
(function stars() {
  const c = $('#stars'); const x = c.getContext('2d'); let pts = []; let W = 0; let H = 0;
  const size = () => { const r = c.getBoundingClientRect(); W = c.width = r.width * devicePixelRatio; H = c.height = r.height * devicePixelRatio; pts = Array.from({ length: Math.round(r.width * r.height / 9000) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: (Math.random() * 1.1 + 0.3) * devicePixelRatio, p: Math.random() * 6.28, s: 0.4 + Math.random() * 1.2 })); };
  size(); addEventListener('resize', size);
  const draw = (t) => { x.clearRect(0, 0, W, H); pts.forEach((p) => { const a = reduced.matches ? 0.5 : 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(p.p + t / 1000 * p.s)); x.globalAlpha = a; x.fillStyle = '#fff'; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.283); x.fill(); }); if (!reduced.matches) requestAnimationFrame(draw); };
  requestAnimationFrame(draw);
})();

// ---------- dashboard fake content ----------
(function miniCal() {
  const res = { 3: 'w', 4: 'l', 5: 'w2', 6: 'w', 10: 'w', 11: 'w2', 12: 'l', 13: 'w', 17: 'w2', 18: 'w', 19: 'l', 20: 'w', 23: 'w t' };
  const cells = []; for (let i = 0; i < 6; i++) cells.push('<span></span>');
  for (let d = 1; d <= 30; d++) cells.push(`<span class="${res[d] || ''}">${d}</span>`);
  $('#miniCal').innerHTML = cells.slice(0, 35).join('');
})();

// ---------- the assembly ----------
const stage = $('#dstage'); const scaler = $('#dscale'); const dash = $('#dash');
let S = 1;
const fit = () => { S = Math.min(1, stage.clientWidth / 1160); scaler.style.transform = `scale(${S})`; stage.style.height = 790 * S + 'px'; };
fit(); addEventListener('resize', fit);
// where each piece waits before the scroll, as a share of the first screen (x, y), with its tilt
const SCATTER = {
  k1: [0.12, 0.24, -12, 10, -16, 0.9], k2: [0.26, 0.11, 6, -8, 12, 0.85], k3: [0.76, 0.11, -7, 10, -12, 0.85], k4: [0.89, 0.27, 10, -10, 14, 0.9],
  acct: [0.15, 0.53, -8, 20, -14, 0.74], eq: [0.85, 0.52, 7, -20, 14, 0.66], cal: [0.11, 0.86, 9, 16, -10, 0.8],
  tr: [0.73, 0.93, -5, -14, 10, 0.75], ai: [0.9, 0.78, 6, -16, 12, 0.8], safe: [0.29, 0.9, -7, 12, -10, 0.9],
};
function assemble() {
  const g = window.gsap; const ST = window.ScrollTrigger;
  const pieces = $$('.pc[data-p]');
  if (!g || !ST || reduced.matches || innerWidth < 760) { if (g) g.fromTo(dash, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', delay: 0.3 }); return; }
  g.registerPlugin(ST);
  const hero = $('#hero').getBoundingClientRect(); const vw = innerWidth; const vh = innerHeight;
  const from = (el) => { const [fx, fy, rz, ry, rx, sc] = SCATTER[el.dataset.p]; const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height / 2 - hero.top; return { x: (fx * vw - cx) / S, y: (fy * vh - cy) / S, rotation: rz, rotationY: ry, rotationX: rx, scale: sc / Math.max(S, 0.55) * 0.9 }; };
  g.set(pieces, { transformPerspective: 1100, transformOrigin: '50% 50%' });
  const targets = pieces.map(from);
  // intro: the pieces drift in to their waiting spots
  pieces.forEach((p, i) => g.fromTo(p, { ...targets[i], opacity: 0, y: targets[i].y + 60 / S, scale: targets[i].scale * 0.85 }, { ...targets[i], opacity: 1, duration: 1.4, delay: 0.35 + i * 0.06, ease: 'expo.out' }));
  g.fromTo('.dash__side, .dash__top, .dash__head, .slot', { opacity: 0 }, { opacity: 1, duration: 1.2, delay: 0.5, stagger: 0.02 });
  // scroll: each piece flies into its slot, the last ones land just as the dashboard is centred
  const tl = g.timeline({ scrollTrigger: { trigger: '#hero', start: 'top top', endTrigger: '#dstage', end: 'center 55%', scrub: 0.9, invalidateOnRefresh: true } });
  const order = ['k1', 'k2', 'k3', 'k4', 'acct', 'eq', 'safe', 'cal', 'tr', 'ai'];
  order.forEach((k, i) => { const el = $(`.pc[data-p="${k}"]`); const t = targets[pieces.indexOf(el)]; tl.fromTo(el, { ...t, immediateRender: false }, { x: 0, y: 0, rotation: 0, rotationX: 0, rotationY: 0, scale: 1, ease: 'power2.inOut', duration: 1 }, i * 0.12); });
  tl.fromTo('.hero2__copy', { opacity: 1, y: 0 }, { opacity: 0.25, y: -40, ease: 'none', duration: 1 }, 0.2);
  tl.fromTo('.beam i:last-child', { opacity: 0.9 }, { opacity: 0.5, ease: 'none', duration: 1 }, 0);
  // pointer parallax on the waiting pieces, only while the page is at the top
  const qx = pieces.map((p) => g.quickTo(p, 'xPercent', { duration: 1, ease: 'power3.out' })); const qy = pieces.map((p) => g.quickTo(p, 'yPercent', { duration: 1, ease: 'power3.out' }));
  addEventListener('pointermove', (e) => { if (scrollY > 40) return; const nx = e.clientX / vw - 0.5; const ny = e.clientY / vh - 0.5; pieces.forEach((p, i) => { const d = 4 + (i % 4) * 2; qx[i](nx * d); qy[i](ny * d); }); }, { passive: true });
  addEventListener('scroll', () => { if (scrollY > 40) pieces.forEach((p, i) => { qx[i](0); qy[i](0); }); }, { passive: true });
}

// ---------- replay card ----------
(function replay() {
  const box = $('#rpChart'); const N = 34; let p = 100; const bars = [];
  let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < N; i++) { const o = p; const drift = i < 8 ? 0.2 : i < 24 ? -1.1 : 0.4; const c = o + (rnd() - 0.5) * 4 + drift; const h = Math.max(o, c) + rnd() * 2; const l = Math.min(o, c) - rnd() * 2; bars.push({ o, c, h, l }); p = c; }
  const hi = Math.max(...bars.map((b) => b.h)); const lo = Math.min(...bars.map((b) => b.l)); const y = (v) => ((hi - v) / (hi - lo)) * 100;
  const w = 100 / N;
  box.innerHTML = bars.map((b, i) => { const top = y(Math.max(b.o, b.c)); const bot = y(Math.min(b.o, b.c)); const cls = (b.c >= b.o ? 'u' : 'd') + (i === 8 ? ' mk in' : i === 24 ? ' mk out' : ''); const lab = i === 8 ? 'data-l="SHORT 2"' : i === 24 ? 'data-l="+$400"' : ''; return `<i class="${cls}" ${lab} style="left:${i * w + w * 0.18}%;width:${w * 0.64}%;top:${top}%;height:${Math.max(1.5, bot - top)}%"><b style="top:${((y(b.h) - top) / Math.max(1.5, bot - top) * 100).toFixed(1)}%;bottom:${((bot - y(b.l)) / Math.max(1.5, bot - top) * 100).toFixed(1)}%" class="wk"></b></i>`; }).join('');
  // body heights are % of the chart, positioned with margins; whiskers via ::before
  const cs = $$('i', box); const head = $('#rpHead'); const card = box.parentElement;
  if (reduced.matches) return;
  let t0 = performance.now();
  const tick = (t) => { const k = ((t - t0) / 7000) % 1; const n = Math.floor(k * N); cs.forEach((c, i) => (c.style.opacity = i <= n ? 1 : 0.18)); head.style.left = `calc(14px + (100% - 28px) * ${((n + 0.5) / N).toFixed(4)})`; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();

// ---------- reveals ----------
function reveals() {
  const g = window.gsap; const ST = window.ScrollTrigger;
  $$('[data-count]').forEach((el) => (el.textContent = el.dataset.count));
  if (!g || !ST || reduced.matches) return;
  g.registerPlugin(ST);
  g.fromTo('.hero2__copy > *', { opacity: 0, y: 24, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.1, ease: 'expo.out', stagger: 0.09, delay: 0.1 });
  g.fromTo('#hn', { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'expo.out' });
  // word-by-word statement
  const rv = $('#reveal');
  const wrap = (node) => { [...node.childNodes].forEach((n) => { if (n.nodeType === 3) { const f = document.createDocumentFragment(); n.textContent.split(/(\s+)/).forEach((w) => { if (!w) return; if (/^\s+$/.test(w)) f.append(w); else { const s = document.createElement('span'); s.className = 'w'; s.textContent = w; f.append(s); } }); n.replaceWith(f); } else wrap(n); }); };
  wrap(rv);
  g.fromTo($$('.w', rv), { opacity: 0.12, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)', stagger: 0.08, ease: 'none', scrollTrigger: { trigger: rv, start: 'top 80%', end: 'bottom 45%', scrub: 0.6 } });
  // headings and blocks fade up
  $$('.shead, .nums__t, .steps__h, .cta2 > :not(.beam)').forEach((el) => g.fromTo(el.children.length && !el.matches('.cta2 > *') ? el.children : el, { opacity: 0, y: 26, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: el, start: 'top 85%' } }));
  ST.batch('.tri, .bc, .sixi, .num, .st, .price__c, .cmp__r, .faq2 details, .row2 .vis, .row2 .txt', { start: 'top 88%', onEnter: (els) => g.fromTo(els, { opacity: 0, y: 36, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'expo.out', stagger: 0.08, overwrite: true }) });
  g.set('.tri, .bc, .sixi, .num, .st, .price__c, .cmp__r, .faq2 details, .row2 .vis, .row2 .txt', { opacity: 0 });
  // counters
  $$('[data-count]').forEach((el) => { const to = +el.dataset.count; const s = { v: 0 }; el.textContent = '0'; g.to(s, { v: to, duration: 1.6, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' }, onUpdate: () => (el.textContent = Math.round(s.v)) }); });
  // drawdown gauge
  g.fromTo('#gaugeFg', { strokeDashoffset: 528 }, { strokeDashoffset: 150, duration: 2, ease: 'expo.out', scrollTrigger: { trigger: '.gauge', start: 'top 80%' } });
  // chat plays in
  const msgs = $$('#chat .msg2'); g.set(msgs, { opacity: 0, y: 14 });
  const ctl = g.timeline({ scrollTrigger: { trigger: '#chat', start: 'top 75%' } });
  msgs.forEach((m, i) => ctl.to(m, { opacity: 1, y: 0, duration: 0.55, ease: 'back.out(1.6)' }, i * 0.9));
  ctl.add(() => { const last = $('#chat .msg2--typing'); last.innerHTML = '<b>Tomorrow, 50K eval</b><ul><li>Max loss today: <b>$650</b> (your stop; the firm allows $1,250)</li><li>A+ setups only before 11:30 ET, three trades at most</li><li>Risk $250 on A+, skip C</li></ul>'; g.fromTo(last, { opacity: 0.4 }, { opacity: 1, duration: 0.5 }); }, '+=0.6');
  // magnetic white buttons
  $$('.wbtn').forEach((b) => { const mx = g.quickTo(b, 'x', { duration: 0.4, ease: 'power3.out' }); const my = g.quickTo(b, 'y', { duration: 0.4, ease: 'power3.out' }); b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); mx((e.clientX - r.left - r.width / 2) * 0.15); my((e.clientY - r.top - r.height / 2) * 0.25); }); b.addEventListener('pointerleave', () => { mx(0); my(0); }); });
  // FAQ
  $$('.faq2 details').forEach((d) => d.addEventListener('toggle', () => { if (d.open) g.fromTo(d.querySelector('p'), { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.4 }); }));
}

// ---------- live firm-rules demo (same catalog as the app) ----------
async function demo() {
  const cat = await loadFirms(); if (!cat.firms.length) return;
  let firm = cat.firms[0]; let progId = firm.programs[0].id; let size = 50000; let stage = 'challenge';
  const draw = () => {
    const prog = firm.programs.find((p) => p.id === progId) || firm.programs[0]; progId = prog.id;
    $('#dProgs').innerHTML = firm.programs.map((p) => `<button data-v="${p.id}" class="${p.id === prog.id ? 'is-on' : ''}">${p.name}</button>`).join('');
    if (!prog.sizes.some((s) => s.size === size)) size = prog.sizes[Math.min(1, prog.sizes.length - 1)].size;
    const st = prog.stages.includes(stage) ? stage : prog.stages[0]; $('#dStage').style.display = prog.stages.length > 1 ? '' : 'none';
    const r = planRules(firm, prog, size, st);
    $('#dFirms').innerHTML = cat.firms.map((f) => `<button type="button" class="fcard ${f.id === firm.id ? 'is-on' : ''}" data-f="${f.id}"><span class="fmono fmono--sm">${f.mono}</span><b>${f.name}</b></button>`).join('');
    $('#dSizes').innerHTML = prog.sizes.map((s) => `<button data-v="${s.size}" class="${s.size === size ? 'is-on' : ''}">${s.size / 1000}K</button>`).join('');
    $('#dRules').innerHTML = [r.target ? `<span class="rp rp--good">${icon('target')}Target $${r.target.toLocaleString()}</span>` : '<span class="rp">No target once funded</span>', `<span class="rp rp--bad">${icon('shield')}Max loss $${r.maxLoss.toLocaleString()} ${r.ddType || ''}</span>`, r.dailyLimit ? `<span class="rp">${icon('flag')}Daily limit $${r.dailyLimit.toLocaleString()}</span>` : `<span class="rp">${icon('flag')}No firm daily limit</span>`, r.consistency ? `<span class="rp">${icon('analytics')}${r.consistency}% consistency</span>` : ''].join('');
    const cap = dailyCap(r); const cur = Math.min(defaultDaily(r), cap);
    $('#dSlider').innerHTML = slider({ name: 'demoStop', label: 'Your daily stop', value: cur, min: 50, max: cap, step: 25, prefix: '$', hint: r.dailyLimit ? `firm limit $${r.dailyLimit.toLocaleString()}` : `max loss $${r.maxLoss.toLocaleString()}` });
    const lo = -r.maxLoss; const hi = r.target || r.maxLoss;
    const place = (stop) => {
      const z = (0 - lo) / (hi - lo) * 100; const s = clamp((-stop - lo) / (hi - lo), 0, 1) * 100;
      $('#dZero').style.left = z + '%'; $('#dStop').style.left = s + '%'; $('#dDot').style.left = z + '%'; $('#dFill').style.cssText = `left:${s}%;width:${z - s}%`;
      $('#dLo').textContent = `Breach −$${r.maxLoss.toLocaleString()}`; $('#dHi').textContent = r.target ? `Target +$${r.target.toLocaleString()}` : '';
      $('#dCap').textContent = `You stop at −$${Number(stop).toLocaleString()} today; the firm would breach you at −$${(r.dailyLimit || r.maxLoss).toLocaleString()}.`;
    };
    place(cur);
    $('#dSlider').querySelector('.sl__num').addEventListener('input', (e) => place(+e.target.value || 0));
    $$('#dFirms .fcard').forEach((b) => (b.onclick = () => { firm = cat.firms.find((f) => f.id === b.dataset.f); progId = firm.programs[0].id; draw(); }));
    $$('#dProgs button').forEach((b) => (b.onclick = () => { progId = b.dataset.v; draw(); }));
    $$('#dSizes button').forEach((b) => (b.onclick = () => { size = +b.dataset.v; draw(); }));
    $$('#dStage button').forEach((b) => (b.onclick = () => { stage = b.dataset.v; $$('#dStage button').forEach((x) => x.classList.toggle('is-on', x === b)); draw(); }));
    segInit($('#dProgs')); segInit($('#dSizes')); segInit($('#dStage'));
  };
  draw();
}

const start = () => { assemble(); reveals(); demo(); if (window.ScrollTrigger) window.ScrollTrigger.refresh(); };
// gsap is loaded with defer, so it is ready once the document has parsed; fonts change layout, so wait for them too
const go = () => (document.fonts?.ready || Promise.resolve()).then(start);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
