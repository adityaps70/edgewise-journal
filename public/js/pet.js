// Trading buddy: an optional little character that lives in the corner of the app.
// It sleeps when you're away, wakes when the mouse comes near, follows the cursor with its eyes,
// and talks only when something matters: your risk left today, losing streaks, news, your prep, your wins.
import { S, P, $, esc, money, num, today, sum, net, safeToRisk, saveProfile, icon, API, addDays } from './core.js?v=7c85ad91';

export const PETS = {
  pip: { name: 'Pip', blurb: 'A little flame. Burns brighter when you stick to the plan.' },
  puff: { name: 'Puff', blurb: 'A calm cloud for calm trading.' },
  botty: { name: 'Botty', blurb: 'A chatty bot that keeps score.' },
  spook: { name: 'Spook', blurb: 'A friendly ghost. Haunts revenge trades.' },
};

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let el = null; let st = null;

// ---------- drawings (original, simple SVG) ----------
function wavyCircle(cx, cy, r, amp, n) { let d = ''; for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; const rr = r + amp * Math.sin(a * n); d += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(1) + ' ' + (cy + rr * Math.sin(a)).toFixed(1) + ' '; } return d + 'Z'; }
function body(kind) {
  if (kind === 'puff') return `<defs><radialGradient id="pfG" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9edff"/></radialGradient></defs>
    <path class="pet__glow" d="${wavyCircle(60, 64, 40, 4.5, 9)}" fill="none" stroke="#4b63ff" stroke-width="6" opacity=".35"/>
    <path class="pet__shape" d="${wavyCircle(60, 64, 40, 4.5, 9)}" fill="url(#pfG)" stroke="#4b63ff" stroke-width="2"/>`;
  if (kind === 'botty') return `<defs><linearGradient id="btG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f7bff"/><stop offset="1" stop-color="#1f3fe0"/></linearGradient></defs>
    <path class="pet__shape" d="M28 26 H92 A22 22 0 0 1 114 48 V76 A22 22 0 0 1 92 98 H84 L90 112 L70 98 H28 A22 22 0 0 1 6 76 V48 A22 22 0 0 1 28 26 Z" transform="translate(0 -4)" fill="url(#btG)"/>
    <path d="M24 30 H70" stroke="#ffffff40" stroke-width="5" stroke-linecap="round" transform="translate(0 -4)"/>`;
  if (kind === 'spook') return `<defs><linearGradient id="spG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9f3ff"/><stop offset=".35" stop-color="#ffd9f3"/><stop offset=".7" stop-color="#fff6c4"/><stop offset="1" stop-color="#c9ffd9"/></linearGradient></defs>
    <path class="pet__shape" d="M60 12 C 88 12, 100 34, 100 58 V 104 C 94 96, 88 96, 82 104 C 76 112, 70 112, 66 104 C 62 96, 56 96, 52 104 C 48 112, 42 112, 38 104 C 32 96, 26 96, 20 104 V 58 C 20 34, 32 12, 60 12 Z" fill="url(#spG)"/>
    <ellipse cx="44" cy="32" rx="10" ry="6" fill="#ffffff" opacity=".7"/>`;
  return `<defs><radialGradient id="ppG" cx="50%" cy="80%" r="75%"><stop offset="0" stop-color="#ffe066"/><stop offset=".35" stop-color="#ff7a1f"/><stop offset=".75" stop-color="#ff2a3d"/><stop offset="1" stop-color="#e3122d"/></radialGradient></defs>
    <g class="pet__flame"><path class="pet__shape" d="M60 8 C 66 24, 78 30, 84 18 C 96 38, 106 56, 104 78 C 102 102, 84 114, 60 114 C 36 114, 18 102, 16 78 C 15 60, 22 46, 30 34 C 34 44, 42 46, 46 38 C 49 28, 54 20, 60 8 Z" fill="url(#ppG)"/></g>`;
}
const EYES = {
  pip: { y: 76, dx: 13, open: '<ellipse rx="4.2" ry="5.4" fill="#1a0505"/><circle cx="1.4" cy="-1.8" r="1.4" fill="#fff"/>' },
  puff: { y: 62, dx: 11, open: '<ellipse rx="3.6" ry="6" fill="#111"/>' },
  botty: { y: 52, dx: 15, open: '<rect x="-4.5" y="-9" width="9" height="18" rx="4.5" fill="#fff"/>' },
  spook: { y: 52, dx: 14, open: '<ellipse rx="4" ry="5.6" fill="#111"/>' },
};
const MOUTH = { happy: 'M-7 0 Q0 7 7 0', calm: 'M-4 1 Q0 3 4 1', worried: 'M-6 3 Q-3 -1 0 3 Q3 -1 6 3', sad: 'M-6 4 Q0 -3 6 4', wow: '' };
function svg(kind) {
  const e = EYES[kind] || EYES.pip; const my = e.y + (kind === 'botty' ? 20 : 14); const ink = kind === 'botty' ? '#fff' : kind === 'pip' ? '#1a0505' : '#111';
  return `<svg viewBox="0 0 120 120" class="pet__svg" aria-hidden="true">${body(kind)}
    <g class="pet__cheeks" opacity=".55"><ellipse cx="${60 - e.dx - 9}" cy="${e.y + 9}" rx="5" ry="3" fill="#ff7b8a"/><ellipse cx="${60 + e.dx + 9}" cy="${e.y + 9}" rx="5" ry="3" fill="#ff7b8a"/></g>
    <g class="pet__eyes" style="--ex:0px;--ey:0px"><g class="pet__open"><g transform="translate(${60 - e.dx} ${e.y})"><g class="pet__eye">${e.open}</g></g><g transform="translate(${60 + e.dx} ${e.y})"><g class="pet__eye">${e.open}</g></g></g>
      <g class="pet__shut" stroke="${ink}" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M${60 - e.dx - 5} ${e.y} q5 4 10 0"/><path d="M${60 + e.dx - 5} ${e.y} q5 4 10 0"/></g></g>
    <path class="pet__mouth" transform="translate(60 ${my})" d="${MOUTH.calm}" stroke="${ink}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <path class="pet__sweat" d="M100 30 q6 10 0 14 q-6 -4 0 -14z" fill="#8fd3ff"/>
    <g class="pet__spark" fill="#ffe27a"><path d="M14 22 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/><path d="M104 14 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z"/></g>
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
export function mountPet() {
  const cfg = P().pet || {}; const on = !!cfg.on && !hiddenToday();
  if (!on) { unmountPet(); return; }
  if (el) { think(); return; }
  unmountPet();
  const kind = 'pip';
  el = document.createElement('div'); el.className = `pet pet--${kind}`; el.dataset.kind = kind; el.setAttribute('role', 'button'); el.setAttribute('aria-label', `${PETS[kind].name}, your trading buddy. Click for quick actions.`); el.tabIndex = 0;
  el.innerHTML = `<div class="pet__say" hidden><p></p><div class="pet__acts"></div></div><div class="pet__body">${svg(kind)}</div><span class="pet__shadow"></span>`;
  document.body.append(el);
  st = { mood: '', last: '', sleep: false, idleT: Date.now(), saidAt: 0, timers: [] };
  place(); drag(); eyes(); blink(); think(true);
  st.timers.push(setInterval(() => { nextNews().then(() => think()); }, 60000));
  st.timers.push(setInterval(() => { if (!st.sleep && Date.now() - st.idleT > 90000) sleep(true); }, 5000));
  addEventListener('st:trade', onTrade); addEventListener('st:prep', onPrep);
  nextNews().then(() => think());
  if (window.gsap && !reduced.matches) window.gsap.fromTo(el, { scale: 0, rotation: -20 }, { scale: 1, rotation: 0, duration: 0.8, ease: 'back.out(2)' });
}
export function unmountPet() {
  if (!el) return; st?.timers.forEach(clearInterval); removeEventListener('st:trade', onTrade); removeEventListener('st:prep', onPrep);
  removeEventListener('pointermove', onMove); el.remove(); el = null; st = null;
}
const HIDE_KEY = 'st_pet_hidden';
const hiddenToday = () => { try { return localStorage.getItem(HIDE_KEY) === today(); } catch (e) { return false; } };

function place() {
  let pos = null; try { pos = JSON.parse(localStorage.getItem('st_pet_pos') || 'null'); } catch (e) {}
  const w = 84; const x = pos ? Math.min(Math.max(8, pos.x * innerWidth), innerWidth - w - 8) : innerWidth - w - 24; const y = pos ? Math.min(Math.max(70, pos.y * innerHeight), innerHeight - w - 8) : innerHeight - w - 24;
  el.style.left = x + 'px'; el.style.top = y + 'px'; el.classList.toggle('is-left', x < innerWidth / 2); el.classList.toggle('is-top', y < 220);
}
function drag() {
  let sx = 0; let sy = 0; let ox = 0; let oy = 0; let moved = false; let down = false;
  const b = $('.pet__body', el);
  b.addEventListener('pointerdown', (e) => { down = true; moved = false; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; b.setPointerCapture(e.pointerId); wake(); });
  b.addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - sx; const dy = e.clientY - sy; if (!moved && Math.hypot(dx, dy) < 5) return; moved = true; el.classList.add('is-drag'); el.style.left = ox + dx + 'px'; el.style.top = oy + dy + 'px'; });
  b.addEventListener('pointerup', () => { down = false; el.classList.remove('is-drag');
    if (moved) { try { localStorage.setItem('st_pet_pos', JSON.stringify({ x: el.offsetLeft / innerWidth, y: el.offsetTop / innerHeight })); } catch (e) {} place(); bounce(); return; }
    menu(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menu(); } });
  addEventListener('resize', () => el && place());
}
function onMove(e) {
  if (!el) return; st.idleT = Date.now();
  const r = $('.pet__body', el).getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
  const dx = e.clientX - cx; const dy = e.clientY - cy; const d = Math.hypot(dx, dy) || 1;
  if (st.sleep && d < 170) wake();
  const k = Math.min(1, d / 260); const ey = $('.pet__eyes', el);
  ey.style.setProperty('--ex', (dx / d) * 4.5 * k + 'px'); ey.style.setProperty('--ey', (dy / d) * 3.5 * k + 'px');
  el.classList.toggle('is-near', d < 140);
}
function eyes() { addEventListener('pointermove', onMove, { passive: true }); }
function blink() { const go = () => { if (!el) return; if (!st.sleep) { el.classList.add('is-blink'); setTimeout(() => el && el.classList.remove('is-blink'), 140); } st.timers.push(setTimeout(go, 2800 + Math.random() * 3200)); }; st.timers.push(setTimeout(go, 2000)); }
function sleep(on) { if (!el) return; st.sleep = on; el.classList.toggle('is-asleep', on); if (on) say('Zzz…', null, 0, true); }
function wake() { if (!el || !st.sleep) return; sleep(false); hide(); setMood(st.mood || 'calm'); if (Date.now() - st.saidAt > 20000) setTimeout(() => think(true), 300); }
function bounce(h = 18) { if (!window.gsap || reduced.matches) return; window.gsap.fromTo($('.pet__body', el), { y: 0 }, { y: -h, duration: 0.22, ease: 'power2.out', yoyo: true, repeat: 1 }); }
function setMood(m) { if (!el) return; st.mood = m; ['happy', 'calm', 'worried', 'sad'].forEach((x) => el.classList.toggle('m-' + x, x === m)); $('.pet__mouth', el).setAttribute('d', MOUTH[m] || MOUTH.calm); }

function say(text, action, hold = 7, quiet = false) {
  if (!el) return; const b = $('.pet__say', el); clearTimeout(st.sayT);
  $('p', b).textContent = text; $('.pet__acts', b).innerHTML = action ? `<button type="button" data-go="${esc(action[0])}">${esc(action[1])} →</button>` : '';
  const a = $('[data-go]', b); if (a) a.onclick = (e) => { e.stopPropagation(); location.hash = '#' + a.dataset.go; hide(); };
  b.hidden = false; b.classList.toggle('is-quiet', quiet); b.classList.remove('is-menu');
  if (!quiet) st.saidAt = Date.now();
  if (window.gsap && !reduced.matches) window.gsap.fromTo(b, { opacity: 0, y: 6, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(2)' });
  if (hold) st.sayT = setTimeout(hide, hold * 1000);
}
function hide() { if (el) $('.pet__say', el).hidden = true; }

function think(force = false) {
  if (!el) return; const [mood, text, action] = read();
  setMood(mood); if (st.sleep) return;
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
  const r = safeToRisk();
  $('p', b).innerHTML = r.amount !== null ? `Risk left today: <b>${esc(money(r.amount))}</b>` : `Hi, I'm ${esc(PETS[el.dataset.kind].name)}.`;
  $('.pet__acts', b).innerHTML = `<button type="button" data-a="log">${icon('plus')}Log trade</button><button type="button" data-a="shot">${icon('image')}From screenshot</button><button type="button" data-a="coach">${icon('coach')}Ask coach</button><button type="button" data-a="journal">${icon('journal')}Start my day</button><button type="button" data-a="hide" class="pet__mute">Hide for today</button>`;
  b.hidden = false; b.classList.add('is-menu'); b.classList.remove('is-quiet'); clearTimeout(st.sayT); st.sayT = setTimeout(hide, 9000);
  b.querySelectorAll('[data-a]').forEach((x) => (x.onclick = async (e) => {
    e.stopPropagation(); hide(); const a = x.dataset.a;
    if (a === 'log' || a === 'shot') { const V = await import('./views.js?v=7c85ad91'); V.tradeModal(null, {}, a === 'shot' ? { shot: true } : {}); }
    else if (a === 'coach') location.hash = '#coach'; else if (a === 'journal') location.hash = '#journal';
    else if (a === 'hide') { try { localStorage.setItem(HIDE_KEY, today()); } catch (err) {} if (window.gsap && !reduced.matches) window.gsap.to(el, { scale: 0, duration: 0.3, ease: 'back.in(2)', onComplete: unmountPet }); else unmountPet(); }
  }));
}
export function setPet(on) { saveProfile({ ...P(), pet: { on, kind: 'pip' } }); try { if (on) localStorage.removeItem(HIDE_KEY); } catch (e) {} mountPet(); }
export function petPreview(kind) { return `<span class="petpv petpv--${kind}">${svg(kind)}</span>`; }
