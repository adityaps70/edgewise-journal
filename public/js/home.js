// Landing page: the hero dashboard assembles from scattered pieces as you scroll, plus reveals and live demos.
import { icon, $, $$, clamp } from './core.js?v=3b5c48ce';
import { reduced, segInit } from './motion.js?v=3b5c48ce';
import { slider } from './ui.js?v=3b5c48ce';
import { loadFirms, planRules, defaultDaily, dailyCap } from './firms.js?v=3b5c48ce';

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
  const svg = $('#rpChart'); if (!svg) return;
  const W = 440, H = 170, N = 26, PAD = 22, ENTRY = 7, EXIT = 18, QTY = 2, PV = 20; // NQ $20 a point
  let seed = 11; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const bars = []; let p = 18410;
  for (let i = 0; i < N; i++) {
    const drift = i < ENTRY ? 1.6 : i <= EXIT ? -2.2 : 0.3; const o = p; const c = o + drift + (rnd() - 0.5) * 3.2;
    const h = Math.max(o, c) + 0.4 + rnd() * 1.4; const l = Math.min(o, c) - 0.4 - rnd() * 1.4; bars.push({ o, c, h, l }); p = c;
  }
  // scale the move so the trade is exactly +$400 (10 points on 2 NQ contracts)
  const e0 = bars[ENTRY].c, f = (400 / (QTY * PV)) / (e0 - bars[EXIT].c);
  bars.forEach((b) => ['o', 'c', 'h', 'l'].forEach((k) => (b[k] = e0 + (b[k] - e0) * f)));
  const entry = e0; const exit = bars[EXIT].c;
  const hi = Math.max(...bars.map((b) => b.h)) + 1; const lo = Math.min(...bars.map((b) => b.l)) - 1;
  const y = (v) => PAD + ((hi - v) / (hi - lo)) * (H - PAD * 2); const step = W / N; const x = (i) => i * step + step / 2; const bw = step * 0.56;
  const grid = [0.25, 0.5, 0.75].map((k) => `<line class="grid" x1="0" x2="${W}" y1="${PAD + k * (H - PAD * 2)}" y2="${PAD + k * (H - PAD * 2)}"/>`).join('');
  const cds = bars.map((b, i) => { const up = b.c >= b.o; const t = y(Math.max(b.o, b.c)); const hgt = Math.max(1.6, Math.abs(y(b.o) - y(b.c))); return `<g class="cd ${up ? 'u' : 'd'}"><line x1="${x(i)}" x2="${x(i)}" y1="${y(b.h)}" y2="${y(b.l)}" stroke-width="1.3"/><rect x="${x(i) - bw / 2}" y="${t}" width="${bw}" height="${hgt}" rx="1.5" stroke="none"/></g>`; }).join('');
  const ye = y(entry), yx = y(exit);
  const trade = `<g id="rpTrade" opacity="0"><rect x="${x(ENTRY)}" y="${ye}" width="${x(EXIT) - x(ENTRY)}" height="${yx - ye}" fill="#3ecf8e14"/><line x1="${x(ENTRY)}" x2="${x(EXIT)}" y1="${ye}" y2="${ye}" stroke="#ff5a6a" stroke-width="1.2" stroke-dasharray="4 3"/></g>
    <g id="rpIn" opacity="0"><rect x="${x(ENTRY) - 30}" y="${ye - 28}" width="60" height="17" rx="5" fill="#ff3048"/><text class="tag" x="${x(ENTRY)}" y="${ye - 16.5}" text-anchor="middle">SHORT 2</text><circle cx="${x(ENTRY)}" cy="${ye}" r="3.5" fill="#fff" stroke="#ff3048" stroke-width="2"/></g>
    <g id="rpOut" opacity="0"><rect x="${x(EXIT) - 27}" y="${yx + 11}" width="54" height="17" rx="5" fill="#0f9d6b"/><text class="tag" x="${x(EXIT)}" y="${yx + 22.5}" text-anchor="middle">+$400</text><circle cx="${x(EXIT)}" cy="${yx}" r="3.5" fill="#fff" stroke="#0f9d6b" stroke-width="2"/></g>`;
  svg.innerHTML = grid + cds + trade + `<line id="rpHead" x1="0" x2="0" y1="0" y2="${H}" stroke="#fff" stroke-width="1.6" style="filter:drop-shadow(0 0 5px #fff)"/>`;
  const cs = $$('.cd', svg); const head = $('#rpHead'); const pl = $('#rpPl'); const tr = $('#rpTrade'), inn = $('#rpIn'), out = $('#rpOut');
  const show = (n) => {
    cs.forEach((c, i) => c.classList.toggle('off', i > n)); head.setAttribute('x1', x(n) + step / 2); head.setAttribute('x2', x(n) + step / 2);
    inn.setAttribute('opacity', n >= ENTRY ? 1 : 0); out.setAttribute('opacity', n >= EXIT ? 1 : 0); tr.setAttribute('opacity', n >= EXIT ? 1 : 0);
    const v = n <= ENTRY ? 0 : Math.round(((entry - (n >= EXIT ? exit : bars[n].c)) * QTY * PV) / 10) * 10;
    pl.textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString(); pl.classList.toggle('up', v > 0);
  };
  if (reduced.matches) return show(N - 1);
  let n = -1, last = 0;
  const tick = (t) => { if (t - last > (n === N - 1 ? 2200 : 260)) { last = t; n = (n + 1) % N; show(n); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();

// ---------- AI coach question box ----------
(function ask() {
  const T = $('#askT'); if (!T) return; const A = $('#askA'), AH = $('#askAh'), AB = $('#askAb');
  const qa = [
    ['Am I overtrading?', 'Yes, on Tuesdays.', '14 trades, 9 of them after 11:30 ET. Those lost $610.'],
    ["What's my best setup?", 'Opening range break.', '64% win rate and +$2,140 this month across 3 accounts.'],
    ['How much can I risk today?', '$650 before your stop.', 'Your 50K eval allows $1,250, but your own limit comes first.'],
    ['Why was last week red?', 'Two revenge trades.', 'Both came after a loss on Thursday and cost you $820.'],
  ];
  if (reduced.matches) return;
  let k = 0; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = async () => {
    for (;;) {
      await wait(3200); A.classList.add('is-out'); k = (k + 1) % qa.length; const [q, h, b] = qa[k];
      T.textContent = ''; await wait(250);
      for (let i = 1; i <= q.length; i++) { T.textContent = q.slice(0, i); await wait(38 + Math.random() * 40); }
      await wait(500); AH.textContent = h; AB.textContent = b; A.classList.remove('is-out');
    }
  };
  run();
})();

// ---------- breach line chart (50K, $2,000 trailing, locks at the start balance) ----------
function ddChart() {
  const svg = $('#ddChart'); if (!svg) return;
  const W = 420, H = 200, L = 46, R = 14, T = 14, B = 26;
  const eq = [50000, 50320, 50180, 50760, 51240, 50980, 51420, 51900, 51610, 52040, 52480, 52230, 51890, 52360, 52600, 52310];
  let peak = 0; const br = eq.map((v) => { peak = Math.max(peak, v); return Math.min(peak - 2000, 50000); });
  const lo = 47600, hi = 53000; const x = (i) => L + (i / (eq.length - 1)) * (W - L - R); const y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const ln = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const brPath = br.map((v, i) => (i ? `L${x(i).toFixed(1)},${y(br[i - 1]).toFixed(1)} L${x(i).toFixed(1)},${y(v).toFixed(1)}` : `M${x(0)},${y(v)}`)).join(' ');
  const area = `${ln(eq)} ` + br.map((v, i) => [i, v]).reverse().map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') + ' Z';
  const ticks = [48000, 50000, 52000].map((v) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 8}" y="${y(v) + 3.5}" text-anchor="end">${v / 1000}K</text>`).join('');
  const bal = eq.at(-1), stop = bal - 650, n = eq.length - 1;
  svg.innerHTML = `<defs><linearGradient id="ddG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3ecf8e" stop-opacity=".22"/><stop offset="1" stop-color="#3ecf8e" stop-opacity=".02"/></linearGradient></defs>${ticks}
    <path d="${area}" fill="url(#ddG)" class="dd-area"/>
    <path class="br" d="${brPath}"/>
    <line class="st" x1="${x(n - 3)}" x2="${x(n)}" y1="${y(stop)}" y2="${y(stop)}"/>
    <path class="eq" id="ddEq" d="${ln(eq)}"/>
    <circle cx="${x(n)}" cy="${y(bal)}" r="4.5" fill="#fff" class="dd-dot"/><circle cx="${x(n)}" cy="${y(bal)}" r="10" fill="#ffffff22" class="dd-dot"/>
    <g class="dd-pill"><rect class="pill" x="${x(n) - 98}" y="${(y(bal) + y(50000)) / 2 - 11}" width="88" height="22" rx="11"/><text class="pillt" x="${x(n) - 54}" y="${(y(bal) + y(50000)) / 2 + 4}" text-anchor="middle">$2,310 room</text></g>
    <text class="ax" x="${x(2)}" y="${y(br[2]) + 16}" fill="#ff6b7a">trails your peak</text><text class="ax" x="${x(8)}" y="${y(50000) + 16}">locks at $50K</text>`;
  const g = window.gsap; if (!g || !window.ScrollTrigger || reduced.matches) return;
  const p = $('#ddEq'); const len = p.getTotalLength();
  const tl = g.timeline({ scrollTrigger: { trigger: svg, start: 'top 80%' } });
  tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.8, ease: 'power2.inOut' })
    .fromTo(svg.querySelectorAll('.br, .dd-area'), { opacity: 0 }, { opacity: 1, duration: 0.8 }, 0.5)
    .fromTo(svg.querySelectorAll('.dd-dot, .dd-pill, .st'), { opacity: 0, scale: 0.6, transformOrigin: 'center' }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)', stagger: 0.08 }, 1.6);
}

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
  $$('.shead, .nums__t, .steps__h, .cta3 > h2, .cta3 > p, .cta3 > a').forEach((el) => g.fromTo(el.children.length && !el.matches('.cta3 > *') ? el.children : el, { opacity: 0, y: 26, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: el, start: 'top 85%' } }));
  ST.batch('.tri, .bc, .sixi, .num, .st, .price__c, .cmp__r, .faq2 details, .row2 .vis, .row2 .txt', { start: 'top 88%', onEnter: (els) => g.fromTo(els, { opacity: 0, y: 36, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'expo.out', stagger: 0.08, overwrite: true }) });
  g.set('.tri, .bc, .sixi, .num, .st, .price__c, .cmp__r, .faq2 details, .row2 .vis, .row2 .txt', { opacity: 0 });
  // counters
  $$('[data-count]').forEach((el) => { const to = +el.dataset.count; const s = { v: 0 }; el.textContent = '0'; g.to(s, { v: to, duration: 1.6, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' }, onUpdate: () => (el.textContent = Math.round(s.v)) }); });
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
  const track = $('#dFirms');
  track.innerHTML = cat.firms.map((f) => `<button type="button" class="fcard" data-f="${f.id}"><span class="fmono fmono--sm">${f.mono}</span><b>${f.name}</b></button>`).join('');
  const pick = (f) => { firm = f; progId = firm.programs[0].id; draw(); };
  const centre = () => { const b = track.querySelector('.is-on'); if (b) track.scrollTo({ left: b.offsetLeft - track.clientWidth / 2 + b.offsetWidth / 2 }); };
  $$('.fcard', track).forEach((b) => (b.onclick = () => pick(cat.firms.find((f) => f.id === b.dataset.f))));
  $$('.fsel__nav').forEach((b) => (b.onclick = () => { const i = cat.firms.indexOf(firm); pick(cat.firms[(i + +b.dataset.d + cat.firms.length) % cat.firms.length]); }));
  const draw = () => {
    const prog = firm.programs.find((p) => p.id === progId) || firm.programs[0]; progId = prog.id;
    $('#dProgs').innerHTML = firm.programs.length < 2 ? '' : firm.programs.map((p) => `<button data-v="${p.id}" class="${p.id === prog.id ? 'is-on' : ''}">${p.name}</button>`).join('');
    if (!prog.sizes.some((s) => s.size === size)) size = prog.sizes[Math.min(1, prog.sizes.length - 1)].size;
    const st = prog.stages.includes(stage) ? stage : prog.stages[0]; $('#dStage').style.display = prog.stages.length > 1 ? '' : 'none';
    const r = planRules(firm, prog, size, st);
    $$('#dFirms .fcard').forEach((b) => b.classList.toggle('is-on', b.dataset.f === firm.id)); centre(); $('#dProgs').style.display = firm.programs.length < 2 ? 'none' : '';
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
    $$('#dProgs button').forEach((b) => (b.onclick = () => { progId = b.dataset.v; draw(); }));
    $$('#dSizes button').forEach((b) => (b.onclick = () => { size = +b.dataset.v; draw(); }));
    $$('#dStage button').forEach((b) => (b.onclick = () => { stage = b.dataset.v; $$('#dStage button').forEach((x) => x.classList.toggle('is-on', x === b)); draw(); }));
    segInit($('#dProgs')); segInit($('#dSizes')); segInit($('#dStage'));
  };
  draw(); if (window.ScrollTrigger) window.ScrollTrigger.refresh();
}

const start = () => { assemble(); reveals(); ddChart(); demo(); if (window.ScrollTrigger) window.ScrollTrigger.refresh(); };
// gsap is loaded with defer, so it is ready once the document has parsed; fonts change layout, so wait for them too
const go = () => (document.fonts?.ready || Promise.resolve()).then(start);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
