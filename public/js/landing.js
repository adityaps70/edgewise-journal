// Landing page motion: split headings, scroll reveals, count-ups, chart draw, parallax stage, live firm-rules demo.
import { icon, $, $$, clamp } from './core.js?v=c8ab25c2';
import { splitHeading, installGlint, installPress, switchTheme, reduced } from './motion.js?v=c8ab25c2';
import { slider } from './ui.js?v=c8ab25c2';
import { loadFirms, planRules, defaultDaily, dailyCap } from './firms.js?v=c8ab25c2';

const root = document.documentElement;
try { root.dataset.theme = localStorage.getItem('ew_theme') || 'dark'; } catch (e) { /* ignore */ }
$$('[data-ico]').forEach((el) => (el.innerHTML = icon(el.dataset.ico)));
$$('[data-ico-r]').forEach((el) => el.insertAdjacentHTML('beforeend', icon(el.dataset.icoR)));
const tBtn = $('#lTheme');
const setIco = () => (tBtn.innerHTML = icon(root.dataset.theme === 'dark' ? 'sun' : 'moon'));
setIco();
tBtn.onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); switchTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', r.left + r.width / 2, r.top + r.height / 2); setTimeout(setIco, 50); };
try { if (localStorage.getItem('ew_cache_local')) $$('[data-cta]').forEach((a) => { if (a.closest('.lnav')) a.textContent = 'Open my journal'; }); } catch (e) { /* ignore */ }

const FMT = { usdSign: (v) => (v >= 0 ? '+$' : '−$') + Math.round(Math.abs(v)).toLocaleString('en-US'), pct0: (v) => Math.round(v) + '%', dec: (v) => v.toFixed(2), r: (v) => '+' + v.toFixed(2) + 'R' };
const firmNames = ['Topstep', 'Apex Trader Funding', 'TopOne Futures', 'Tradeify', 'MyFundedFutures', 'Lucid Trading', 'Take Profit Trader', 'FTMO', 'FundingPips'];
$('#marq').innerHTML = [...firmNames, ...firmNames].map((n) => `<span>${n}</span><i>${icon('check')}</i>`).join('');

function count(el, delay = 0) {
  const to = parseFloat(el.dataset.count); const f = FMT[el.dataset.fmt];
  if (!window.gsap || reduced.matches) { el.textContent = f(to); return; }
  const s = { v: 0 }; window.gsap.to(s, { v: to, duration: 1.6, delay, ease: 'power3.out', onUpdate: () => (el.textContent = f(s.v)) });
}

function boot() {
  const g = window.gsap; const ST = window.ScrollTrigger;
  installGlint('.card, .hs, .bt'); installPress();
  if (!g || reduced.matches) { $$('[data-count]').forEach((el) => count(el)); return; }
  g.registerPlugin(ST);
  // nav
  g.fromTo('#lnav', { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out' });
  ST.create({ start: 40, onUpdate: (s) => $('#lnav').classList.toggle('is-scrolled', s.scroll() > 40) });
  // hero
  const h1 = $('.hero h1'); const chars = splitHeading(h1);
  const tl = g.timeline({ delay: 0.15 });
  tl    .fromTo(chars, { yPercent: 115, rotation: 6 }, { yPercent: 0, rotation: 0, duration: 0.9, ease: 'power4.out', stagger: 0.018 }, 0.1)
    .fromTo($$('.hero__sub, .hero__cta > *, .hero__fine'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.07, clearProps: 'transform,opacity' }, 0.45)
    .fromTo('.hs--main', { opacity: 0, y: 40, rotationX: 12, scale: 0.96 }, { opacity: 1, y: 0, rotationX: 0, scale: 1, duration: 1.1, ease: 'expo.out', transformPerspective: 1200 }, 0.3)
    .fromTo('.hs--acct', { opacity: 0, y: 60, rotation: -4, scale: 0.92 }, { opacity: 1, y: 0, rotation: -3, scale: 1, duration: 1, ease: 'back.out(1.4)' }, 0.55)
    .fromTo('.hs__line', { strokeDasharray: 900, strokeDashoffset: 900 }, { strokeDashoffset: 0, duration: 1.8, ease: 'power3.out' }, 0.6)
    .fromTo('.hs__area', { opacity: 0 }, { opacity: 1, duration: 1.2 }, 1.1)
    .fromTo('.hs__pt', { scale: 0, transformOrigin: 'center' }, { scale: 1, duration: 0.6, ease: 'back.out(3)', stagger: 0.15 }, 1.6)
    .fromTo('.hs__fill', { width: '0%' }, { width: '24%', duration: 1.2, ease: 'expo.out' }, 1)
    .fromTo('.hs__dot', { left: '40%' }, { left: '64%', duration: 1.2, ease: 'expo.out' }, 1)
    .fromTo('.hs--chip', { opacity: 0, y: 20, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'back.out(2)', stagger: 0.18 }, 1.2);
  $$('.hero [data-count]').forEach((el) => count(el, 0.7));
  // floating chips bob
  $$('.hs--chip').forEach((c, i) => g.to(c, { y: '+=8', duration: 2.4 + i * 0.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 2 + i * 0.3 }));
  // parallax stage on pointer
  const stage = $('#stage');
  const layers = [['.hs--main', 10], ['.hs--acct', 22], ['.hs--c1', 34], ['.hs--c2', 28], ['.hs--c3', 40]].map(([s, d]) => [stage.querySelector(s), d]);
  const qx = layers.map(([el]) => g.quickTo(el, 'x', { duration: 0.8, ease: 'power3.out' }));
  const qy = layers.map(([el]) => g.quickTo(el, 'yPercent', { duration: 0.8, ease: 'power3.out' }));
  addEventListener('pointermove', (e) => { const nx = e.clientX / innerWidth - 0.5; const ny = e.clientY / innerHeight - 0.5; layers.forEach(([, d], i) => { qx[i](nx * d); qy[i](ny * d / 12); }); }, { passive: true });
  // section headings + cards
  $$('.sec h2.hsplit, .final h2.hsplit').forEach((h) => {
    const cs = splitHeading(h);
    g.fromTo(cs, { yPercent: 115, rotation: 6 }, { yPercent: 0, rotation: 0, duration: 0.85, ease: 'power4.out', stagger: 0.016, scrollTrigger: { trigger: h, start: 'top 85%' } });
  });
  $$('.sec__head').forEach((hd) => g.fromTo(hd.querySelectorAll('p, .ticks li'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.06, scrollTrigger: { trigger: hd, start: 'top 82%' } }));
  ST.batch('.feat, .step3, .faq details', { start: 'top 88%', onEnter: (els) => g.fromTo(els, { opacity: 0, y: 40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'expo.out', stagger: 0.08, overwrite: true }) });
  g.set('.feat, .step3, .faq details', { opacity: 0 });
  g.fromTo('.step3__n', { scale: 0 }, { scale: 1, ease: 'back.out(3)', duration: 0.6, stagger: 0.2, scrollTrigger: { trigger: '.steps3', start: 'top 75%' } });
  g.fromTo('.mini-ladder i', { width: '0%' }, { width: '68%', duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.mini-ladder', start: 'top 90%' } });
  g.fromTo('#demo', { opacity: 0, y: 50, rotation: 1.5 }, { opacity: 1, y: 0, rotation: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '#demo', start: 'top 85%' } });
  // chat plays in
  const msgs = $$('#chat .msg');
  g.set(msgs, { opacity: 0, y: 16 });
  const ctl = g.timeline({ scrollTrigger: { trigger: '#chat', start: 'top 75%' } });
  msgs.forEach((m2, i) => ctl.to(m2, { opacity: 1, y: 0, duration: 0.55, ease: 'back.out(1.6)' }, i * 0.9));
  ctl.add(() => { const last = $('#chat .typing-msg'); last.innerHTML = '<h4>Tomorrow, 50K eval</h4><ul><li>Max loss today: <b>$650</b> (your stop, firm allows $1,250)</li><li>A+ only before 11:30 ET, max 3 trades</li><li>Size: A+ $250 risk, skip C</li></ul>'; g.fromTo(last.children, { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 0.12, duration: 0.45 }); }, '+=1.2');
  // final card
  g.fromTo('.final__card', { opacity: 0, y: 60, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.final', start: 'top 80%' } });
  // magnetic CTAs
  $$('[data-cta]').forEach((b) => {
    const mx = g.quickTo(b, 'x', { duration: 0.4, ease: 'power3.out' }); const my = g.quickTo(b, 'y', { duration: 0.4, ease: 'power3.out' });
    b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); mx((e.clientX - r.left - r.width / 2) * 0.18); my((e.clientY - r.top - r.height / 2) * 0.25); });
    b.addEventListener('pointerleave', () => { mx(0); my(0); });
  });
  // faq open animation
  $$('.faq details').forEach((d) => d.addEventListener('toggle', () => { if (d.open) g.fromTo(d.querySelector('p'), { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.4 }); }));
}

// live firm demo from the same catalog the app uses
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
    $('#dRules').innerHTML = [r.target ? `<span class="rp rp--good">${icon('target')}Target $${r.target.toLocaleString()}</span>` : '<span class="rp">No target once funded</span>', `<span class="rp rp--bad">${icon('shield')}Max loss $${r.maxLoss.toLocaleString()} <i>${r.ddType}</i></span>`, r.dailyLimit ? `<span class="rp rp--warn">${icon('flag')}Firm daily $${r.dailyLimit.toLocaleString()}</span>` : `<span class="rp">${icon('flag')}No firm daily limit</span>`, r.minDays ? `<span class="rp">${icon('calendar')}Min ${r.minDays} trading day${r.minDays > 1 ? 's' : ''}</span>` : '', r.consistency ? `<span class="rp">${r.consistency}% consistency</span>` : ''].join('');
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
    $$('#dFirms .fcard').forEach((b) => (b.onclick = () => { firm = cat.firms.find((f) => f.id === b.dataset.f); progId = firm.programs[0].id; draw(); pulse(); }));
    $$('#dProgs button').forEach((b) => (b.onclick = () => { progId = b.dataset.v; draw(); pulse(); }));
    $$('#dSizes button').forEach((b) => (b.onclick = () => { size = +b.dataset.v; draw(); pulse(); }));
    $$('#dStage button').forEach((b) => (b.onclick = () => { stage = b.dataset.v; $$('#dStage button').forEach((x) => x.classList.toggle('is-on', x === b)); window.__seg && window.__seg($('#dStage')); draw(); pulse(); }));
    import('./motion.js?v=c8ab25c2').then((mo) => { mo.segInit($('#dProgs')); mo.segInit($('#dSizes')); mo.segInit($('#dStage')); });
  };
  const pulse = () => { if (window.gsap && !reduced.matches) window.gsap.fromTo('#dRules .rp', { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 0.04, duration: 0.4, ease: 'power3.out' }); };
  draw();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { boot(); demo(); }); else { boot(); demo(); }
