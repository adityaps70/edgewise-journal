// Trading buddy: an optional little character that lives in the corner of the app.
// It sleeps when you're away, wakes when the mouse comes near, follows the cursor with its eyes,
// and talks only when something matters: your risk left today, losing streaks, news, your prep, your wins.
import { S, P, $, esc, money, num, today, sum, net, safeToRisk, saveProfile, icon, API, addDays } from './core.js?v=f81d9df3';

export const PETS = { pip: { name: 'Pip', blurb: 'A little flame. Burns brighter when you stick to the plan.' } };

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let el = null; let st = null;

// ---------- drawing: a chubby, glossy flame (original SVG) ----------
const MOUTH = { happy: 'M-6 -1 Q0 7 6 -1 Q0 3 -6 -1Z', calm: 'M-3.5 0 Q0 3.2 3.5 0', worried: 'M-5 3 Q-2.5 0 0 2.5 Q2.5 0 5 3', sad: 'M-5 3.5 Q0 -2 5 3.5', wow: '' };
let uid = 0;
function svg() {
  const u = 'p' + ++uid; // unique ids so the settings preview and the live pet don't share gradients
  const body = 'M60 8 C69 24 79 23 82 14 C93 31 105 50 105 78 C105 104 86 121 60 121 C34 121 15 104 15 78 C15 59 23 45 34 34 C36 44 42 47 46 40 C50 30 54 21 60 8 Z';
  return `<svg viewBox="0 0 120 130" class="pet__svg" aria-hidden="true"><defs>
      <radialGradient id="${u}b" cx="50%" cy="74%" r="72%"><stop offset="0" stop-color="#fff1b8"/><stop offset=".22" stop-color="#ffc04d"/><stop offset=".5" stop-color="#ff6d3a"/><stop offset=".8" stop-color="#ff2c48"/><stop offset="1" stop-color="#c80d33"/></radialGradient>
      <radialGradient id="${u}r" cx="38%" cy="42%" r="70%"><stop offset=".55" stop-color="#7a0018" stop-opacity="0"/><stop offset="1" stop-color="#5c0013" stop-opacity=".55"/></radialGradient>
      <radialGradient id="${u}c" cx="50%" cy="60%" r="60%"><stop offset="0" stop-color="#fff7d6"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>
      <filter id="${u}s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
      <filter id="${u}k" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
    </defs>
    <g class="pet__flame">
      <path class="pet__shape" d="${body}" fill="url(#${u}b)"/>
      <ellipse cx="60" cy="92" rx="30" ry="24" fill="url(#${u}c)" opacity=".75"/>
      <path d="${body}" fill="url(#${u}r)"/>
      <ellipse class="pet__gloss" cx="38" cy="60" rx="7" ry="13" transform="rotate(24 38 60)" fill="#fff" opacity=".6" filter="url(#${u}s)"/>
      <circle class="pet__gloss" cx="46" cy="42" r="2.6" fill="#fff" opacity=".85"/>
    </g>
    <g class="pet__face">
      <g class="pet__cheeks"><ellipse cx="34" cy="94" rx="7" ry="4.2" fill="#ff8aa0" opacity=".75" filter="url(#${u}k)"/><ellipse cx="86" cy="94" rx="7" ry="4.2" fill="#ff8aa0" opacity=".75" filter="url(#${u}k)"/></g>
      <g class="pet__eyes"><g class="pet__open">
        <g transform="translate(46 82)"><g class="pet__eye"><ellipse rx="6.6" ry="8.2" fill="#24070d"/><ellipse class="pet__hl" cx="-2" cy="-3.2" rx="2.6" ry="2.9" fill="#fff"/><circle class="pet__hl" cx="2.4" cy="2.8" r="1.2" fill="#fff" opacity=".9"/></g></g>
        <g transform="translate(74 82)"><g class="pet__eye"><ellipse rx="6.6" ry="8.2" fill="#24070d"/><ellipse class="pet__hl" cx="-2" cy="-3.2" rx="2.6" ry="2.9" fill="#fff"/><circle class="pet__hl" cx="2.4" cy="2.8" r="1.2" fill="#fff" opacity=".9"/></g></g></g>
        <g class="pet__shut" stroke="#24070d" stroke-width="2.6" stroke-linecap="round" fill="none"><path d="M40 83 q6 4.5 12 0"/><path d="M68 83 q6 4.5 12 0"/></g></g>
      <path class="pet__mouth" transform="translate(60 98)" d="${MOUTH.calm}" stroke="#24070d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="#24070d" fill-opacity="0"/>
    </g>
    <path class="pet__sweat" d="M100 40 q6 10 0 14 q-6 -4 0 -14z" fill="#8fd3ff"/>
    <g class="pet__spark" fill="#ffe27a"><path d="M10 34 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/><path d="M108 22 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z"/></g>
  </svg>`;
}

// ---------- what the buddy knows ----------
function dayStats() {
  const t = S.trade.filter((x) => x.date === today()).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  let lossRun = 0; for (let i = t.length - 1; i >= 0 && net(t[i]) < 0; i--) lossRun++;
  return { trades: t, n: t.length, pnl: sum(t, net), lossRun };
}
function prepDone() { const j = S.journal.find((e) => e.date === today()); return !!(j && ((j.checklist || []).length || j.pre)); }
function weekday() { const d = new Date().getDay(); return d > 0 && d < 6; }
let news = null; let newsAt = 0;
async function nextNews() {
  if (S.local || Date.now() - newsAt < 15 * 60000) return news; newsAt = Date.now();
  try { const r = await API.econ(); let cur = ['USD']; try { cur = JSON.parse(localStorage.getItem('st_econ') || '{}').cur || cur; } catch (e) {}
    news = (r.events || []).map((e) => ({ ...e, at: new Date(e.d) })).filter((e) => e.i === 'High' && cur.includes(e.c) && e.at > Date.now() - 5 * 60000).sort((a, b) => a.at - b.at)[0] || null; } catch (e) { news = null; }
  return news;
}
const hhmm = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// decide mood + one line; returns [mood, text, action]
function read() {
  const r = safeToRisk(); const d = dayStats();
  const stopped = (r.amount !== null && r.amount <= 0 && (r.rule || S.account.length)) || (r.tradesLeft === 0 && r.maxTrades);
  if (stopped) return ['sad', r.tradesLeft === 0 && r.maxTrades ? `That's your ${r.maxTrades} trades for today. Close the platform, tomorrow is another session.` : 'Daily stop reached. Close the platform, tomorrow is another session.', null];
  if (news) { const mins = Math.round((news.at - Date.now()) / 60000); if (mins <= 20 && mins >= -5) return ['worried', mins > 0 ? `${news.c} ${news.t} in ${mins} min. Flat before the release?` : `${news.c} ${news.t} just came out. Let the first candles settle.`, ['economic', 'Calendar']]; }
  if (d.lossRun >= 2) return ['worried', `${d.lossRun} losses in a row. Breathe. Is the next one really an A+ setup?`, null];
  if (r.amount !== null && r.rule && r.amount < r.rule * 0.3) return ['worried', `Only ${money(r.amount)} left before your daily stop. Size down or call it a day.`, null];
  if (weekday() && !prepDone() && new Date().getHours() < 21) return ['calm', d.n ? 'You traded without your Start my day check. Two minutes now?' : 'Morning! Tick your Start my day checklist before the first trade?', ['journal', 'Start my day']];
  if (d.n && d.pnl > 0) return ['happy', `Green day: ${money(d.pnl, { sign: true })} on ${d.n} trade${d.n > 1 ? 's' : ''}. Protect it.`, null];
  if (r.amount !== null) return ['calm', `You can still risk ${money(r.amount)} today${r.tradesLeft !== null ? `, ${r.tradesLeft} trade${r.tradesLeft === 1 ? '' : 's'} left` : ''}.`, null];
  return ['calm', 'Log your next trade and I will keep score.', null];
}

// ---------- the widget ----------
const coarse = matchMedia('(pointer: coarse)');
const cfg = () => P().pet || {};
const following = () => !!cfg().follow && !coarse.matches;
let mouse = { x: -1, y: -1, t: 0 };

export function mountPet() {
  const on = !!cfg().on && !hiddenToday();
  if (!on) { unmountPet(); return; }
  if (el) { el.classList.toggle('is-follow', following()); think(); return; }
  unmountPet();
  el = document.createElement('div'); el.className = 'pet pet--pip'; el.dataset.kind = 'pip'; el.setAttribute('role', 'button'); el.setAttribute('aria-label', 'Pip, your trading buddy. Click for quick actions.'); el.tabIndex = 0;
  el.innerHTML = `<div class="pet__say" hidden><button type="button" class="pet__x" aria-label="Close">${icon('close')}</button><p></p><div class="pet__acts"></div></div><div class="pet__tilt"><div class="pet__body">${svg()}</div></div><span class="pet__shadow"></span>`;
  document.body.append(el);
  st = { mood: '', last: '', sleep: false, idleT: Date.now(), saidAt: 0, timers: [], x: 0, y: 0, vx: 0, raf: 0, look: { x: 0, y: 0 }, cur: { x: 0, y: 0 } };
  el.classList.toggle('is-follow', following());
  place(); drag(); closers(); loop(); blink(); think(true);
  st.timers.push(setInterval(() => { nextNews().then(() => think()); }, 60000));
  st.timers.push(setInterval(() => { if (!st.sleep && Date.now() - st.idleT > 90000 && $('.pet__say', el).hidden) sleep(true); }, 5000));
  addEventListener('st:trade', onTrade); addEventListener('st:prep', onPrep); addEventListener('pointermove', onMove, { passive: true });
  nextNews().then(() => think());
  if (window.gsap && !reduced.matches) window.gsap.fromTo($('.pet__tilt', el), { scale: 0, rotation: -20 }, { scale: 1, rotation: 0, duration: 0.8, ease: 'back.out(2)' });
}
export function unmountPet() {
  if (!el) return; st?.timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); cancelAnimationFrame(st?.raf);
  removeEventListener('st:trade', onTrade); removeEventListener('st:prep', onPrep); removeEventListener('pointermove', onMove);
  document.removeEventListener('pointerdown', onOutside, true); document.removeEventListener('keydown', onEsc);
  el.remove(); el = null; st = null;
}
const HIDE_KEY = 'st_pet_hidden';
const hiddenToday = () => { try { return localStorage.getItem(HIDE_KEY) === today(); } catch (e) { return false; } };
const SIZE = () => (innerWidth <= 760 ? 64 : 84);

function setPos(x, y) {
  const w = SIZE(); st.x = Math.min(Math.max(8, x), innerWidth - w - 8); st.y = Math.min(Math.max(64, y), innerHeight - w - 8);
  el.style.transform = `translate3d(${st.x}px, ${st.y}px, 0)`;
  el.classList.toggle('is-left', st.x < innerWidth / 2); el.classList.toggle('is-top', st.y < 260);
}
function place() {
  let pos = null; try { pos = JSON.parse(localStorage.getItem('st_pet_pos') || 'null'); } catch (e) {}
  const w = SIZE(); setPos(pos ? pos.x * innerWidth : innerWidth - w - 24, pos ? pos.y * innerHeight : innerHeight - w - 24);
}
const savePos = () => { try { localStorage.setItem('st_pet_pos', JSON.stringify({ x: st.x / innerWidth, y: st.y / innerHeight })); } catch (e) {} };
function drag() {
  let sx = 0; let sy = 0; let ox = 0; let oy = 0; let moved = false; let down = false;
  const b = $('.pet__tilt', el);
  b.addEventListener('pointerdown', (e) => { down = true; moved = false; sx = e.clientX; sy = e.clientY; ox = st.x; oy = st.y; b.setPointerCapture(e.pointerId); wake(); });
  b.addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - sx; const dy = e.clientY - sy; if (!moved && Math.hypot(dx, dy) < 5) return; moved = true; el.classList.add('is-drag'); setPos(ox + dx, oy + dy); });
  b.addEventListener('pointerup', () => { down = false; el.classList.remove('is-drag');
    if (moved) { savePos(); bounce(); return; }
    if (isMenuOpen()) hide(); else menu(); });
  el.addEventListener('keydown', (e) => { if (e.target !== el) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isMenuOpen() ? hide() : menu(); } });
  addEventListener('resize', () => el && setPos(st.x, st.y));
}
const isMenuOpen = () => el && !$('.pet__say', el).hidden && $('.pet__say', el).classList.contains('is-menu');
function onOutside(e) { if (el && !el.contains(e.target)) hide(); }
function onEsc(e) { if (e.key === 'Escape' && el && !$('.pet__say', el).hidden) hide(); }
function closers() {
  $('.pet__x', el).addEventListener('click', (e) => { e.stopPropagation(); hide(); });
  document.addEventListener('pointerdown', onOutside, true); document.addEventListener('keydown', onEsc);
}

function onMove(e) {
  if (!el) return; st.idleT = Date.now(); mouse = { x: e.clientX, y: e.clientY, t: Date.now() };
  const w = SIZE(); const d = Math.hypot(e.clientX - (st.x + w / 2), e.clientY - (st.y + w / 2));
  if (st.sleep && d < 180) wake();
  el.classList.toggle('is-near', d < 140);
}
// one animation loop: eyes, face and body turn toward the cursor; in follow mode Pip trots after it on a short leash
function loop() {
  const tick = () => {
    if (!el) return; const w = SIZE(); const cx = st.x + w / 2; const cy = st.y + w / 2;
    // follow
    if (following() && mouse.t && !isMenuOpen() && !el.classList.contains('is-drag')) {
      const dx = mouse.x - cx; const dy = mouse.y - cy; const d = Math.hypot(dx, dy) || 1; const LEASH = 120; const REST = 78;
      if (d > LEASH || st.chasing) {
        st.chasing = d > REST + 4;
        const tx = mouse.x - (dx / d) * REST - w / 2; const ty = mouse.y - (dy / d) * REST - w / 2;
        const nx = st.x + (tx - st.x) * 0.09; const ny = st.y + (ty - st.y) * 0.09; st.vx = nx - st.x; setPos(nx, ny);
      } else st.vx *= 0.85;
      el.classList.toggle('is-moving', Math.abs(st.vx) > 0.6 || !!st.chasing);
    } else { st.vx *= 0.85; el.classList.remove('is-moving'); }
    // look
    let lx = 0; let ly = 0;
    if (mouse.t && !st.sleep) { const dx = mouse.x - cx; const dy = mouse.y - cy; const d = Math.hypot(dx, dy) || 1; const k = Math.min(1, d / 220); lx = (dx / d) * k; ly = (dy / d) * k; }
    st.cur.x += (lx - st.cur.x) * 0.14; st.cur.y += (ly - st.cur.y) * 0.14;
    const L = st.cur; const lean = Math.max(-14, Math.min(14, st.vx * 1.6));
    el.style.setProperty('--lx', L.x.toFixed(3)); el.style.setProperty('--ly', L.y.toFixed(3)); el.style.setProperty('--lean', lean.toFixed(2) + 'deg');
    st.raf = requestAnimationFrame(tick);
  };
  st.raf = requestAnimationFrame(tick);
}
function blink() { const go = () => { if (!el) return; if (!st.sleep) { el.classList.add('is-blink'); setTimeout(() => el && el.classList.remove('is-blink'), 140); } st.timers.push(setTimeout(go, 2800 + Math.random() * 3200)); }; st.timers.push(setTimeout(go, 2000)); }
function sleep(on) { if (!el) return; st.sleep = on; el.classList.toggle('is-asleep', on); if (on) say('Zzz…', null, 0, true); }
function wake() { if (!el || !st.sleep) return; sleep(false); hide(); setMood(st.mood || 'calm'); if (Date.now() - st.saidAt > 20000) setTimeout(() => think(true), 300); }
function bounce(h = 18) { if (!window.gsap || reduced.matches || !el) return; window.gsap.fromTo($('.pet__body', el), { y: 0, scaleY: 1, scaleX: 1 }, { keyframes: [{ y: 2, scaleY: 0.86, scaleX: 1.1, duration: 0.1 }, { y: -h, scaleY: 1.08, scaleX: 0.94, duration: 0.22, ease: 'power2.out' }, { y: 0, scaleY: 0.92, scaleX: 1.06, duration: 0.2, ease: 'power2.in' }, { scaleY: 1, scaleX: 1, duration: 0.25, ease: 'back.out(3)' }] }); }
function setMood(m) { if (!el) return; st.mood = m; ['happy', 'calm', 'worried', 'sad'].forEach((x) => el.classList.toggle('m-' + x, x === m)); const mo = $('.pet__mouth', el); mo.setAttribute('d', MOUTH[m] || MOUTH.calm); mo.setAttribute('fill-opacity', m === 'happy' ? 1 : 0); }

function say(text, action, hold = 7, quiet = false) {
  if (!el) return; const b = $('.pet__say', el); clearTimeout(st.sayT);
  $('p', b).textContent = text; $('.pet__acts', b).innerHTML = action ? `<button type="button" data-go="${esc(action[0])}">${esc(action[1])} →</button>` : '';
  const a = $('[data-go]', b); if (a) a.onclick = (e) => { e.stopPropagation(); location.hash = '#' + a.dataset.go; hide(); };
  b.hidden = false; b.classList.toggle('is-quiet', quiet); b.classList.remove('is-menu');
  if (!quiet) st.saidAt = Date.now();
  if (window.gsap && !reduced.matches) window.gsap.fromTo(b, { opacity: 0, y: 6, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(2)' });
  if (hold) st.sayT = setTimeout(hide, hold * 1000);
}
function hide() { if (!el) return; clearTimeout(st.sayT); const b = $('.pet__say', el); b.hidden = true; b.classList.remove('is-menu'); }

function think(force = false) {
  if (!el) return; const [mood, text, action] = read();
  setMood(mood); if (st.sleep || isMenuOpen()) return;
  const changed = text !== st.last; st.last = text;
  // speak when something changed, or now and then; never more than once every 3 minutes for the same line
  if (force || (changed && (mood !== 'calm' || Date.now() - st.saidAt > 180000))) { say(text, action, mood === 'sad' ? 12 : 7); if (mood === 'happy') bounce(); }
}
function onTrade(e) {
  const t = e.detail || {}; const p = net(t); wake();
  if (!isFinite(p)) return think(true);
  const tags = String(t.tags || '').toLowerCase();
  if (/after-2-losses|quick-reentry|overtrading/.test(tags)) { setMood('worried'); say(/quick-reentry/.test(tags) ? 'That came fast after a loss. Revenge trade? Take five minutes.' : /after-2-losses/.test(tags) ? 'Third trade after two losses. That is where the money leaks.' : 'That is a lot of trades today. Still following the plan?', null, 9); return; }
  if (p > 0) { setMood('happy'); bounce(24); say(`${money(p, { sign: true })}. Nice. Was it in your plan?`, null, 6); }
  else if (p < 0) { setMood('calm'); say(`${money(p, { sign: true })} logged. Losses inside your risk are part of the job.`, null, 7); }
  setTimeout(() => think(), 8000);
}
function onPrep() { wake(); setMood('happy'); bounce(); say('Prep done. Trade only what is on the list.', null, 6); }

function menu() {
  if (!el) return; wake(); const b = $('.pet__say', el);
  const r = safeToRisk(); const f = !!cfg().follow;
  $('p', b).innerHTML = r.amount !== null ? `Risk left today: <b>${esc(money(r.amount))}</b>` : "Hi, I'm Pip.";
  $('.pet__acts', b).innerHTML = `<button type="button" data-a="log">${icon('plus')}Log trade</button><button type="button" data-a="shot">${icon('image')}From screenshot</button><button type="button" data-a="coach">${icon('coach')}Ask coach</button><button type="button" data-a="journal">${icon('journal')}Start my day</button>
    <div class="pet__opts"><span>Pip</span><div class="pet__seg" role="group" aria-label="How Pip moves"><button type="button" data-a="stay" class="${f ? '' : 'is-on'}">Stays put</button><button type="button" data-a="follow" class="${f ? 'is-on' : ''}" ${coarse.matches ? 'disabled title="Needs a mouse"' : ''}>Follows cursor</button></div></div>
    <button type="button" data-a="hide" class="pet__mute">Hide for today</button>`;
  b.hidden = false; b.classList.add('is-menu'); b.classList.remove('is-quiet'); clearTimeout(st.sayT);
  if (window.gsap && !reduced.matches) window.gsap.fromTo(b, { opacity: 0, y: 6, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(2)' });
  b.querySelectorAll('[data-a]').forEach((x) => (x.onclick = async (e) => {
    e.stopPropagation(); const a = x.dataset.a;
    if (a === 'stay' || a === 'follow') { setFollow(a === 'follow'); b.querySelectorAll('.pet__seg button').forEach((y) => y.classList.toggle('is-on', y === x)); return; }
    hide();
    if (a === 'log' || a === 'shot') { const V = await import('./views.js?v=f81d9df3'); V.tradeModal(null, {}, a === 'shot' ? { shot: true } : {}); }
    else if (a === 'coach') location.hash = '#coach'; else if (a === 'journal') location.hash = '#journal';
    else if (a === 'hide') { try { localStorage.setItem(HIDE_KEY, today()); } catch (err) {} if (window.gsap && !reduced.matches) window.gsap.to($('.pet__tilt', el), { scale: 0, duration: 0.3, ease: 'back.in(2)', onComplete: unmountPet }); else unmountPet(); }
  }));
}
export function setFollow(on) { saveProfile({ ...P(), pet: { ...cfg(), follow: !!on } }); if (el) { el.classList.toggle('is-follow', following()); if (!on) savePos(); } }
export function setPet(on) { saveProfile({ ...P(), pet: { ...cfg(), on, kind: 'pip' } }); try { if (on) localStorage.removeItem(HIDE_KEY); } catch (e) {} mountPet(); }
export function petPreview() { return `<span class="petpv">${svg()}</span>`; }
