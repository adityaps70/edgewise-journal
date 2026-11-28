// Milestones: passing a challenge, becoming eligible for a payout, getting paid, and the certificates that mark them.
import {
  S, P, $, $$, esc, uid, num, sum, today, fmtDate, money, icon, save, accountMetrics, accName, isLive,
  passStatus, payoutStatus, isChallenge, isFundedAcc, copiersOf, daysBetween, accCost,
} from './core.js?v=6b792348';
import { modal, helpers, payoutModal, accountModal } from './views.js?v=6b792348';
import { toast } from './motion.js?v=6b792348';
import { firmById, accountFromPlan } from './firms.js?v=6b792348';

const H = () => helpers.hooks();
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------- confetti
export function confetti({ count = 160, ms = 2600 } = {}) {
  if (reduced.matches) return;
  const c = document.createElement('canvas'); c.className = 'confetti'; document.body.append(c);
  const dpr = Math.min(2, devicePixelRatio || 1); const W = innerWidth; const Hh = innerHeight; c.width = W * dpr; c.height = Hh * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr);
  const cols = ['#ff3048', '#ff6b7a', '#ffd166', '#ffffff', '#3ecf8e', '#ff9f43'];
  const P0 = Array.from({ length: count }, (_, i) => { const left = i % 2 === 0; return { x: left ? -10 : W + 10, y: Hh * (0.55 + Math.random() * 0.35), vx: (left ? 1 : -1) * (6 + Math.random() * 9), vy: -(10 + Math.random() * 11), w: 6 + Math.random() * 7, h: 9 + Math.random() * 9, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], shape: i % 5 }; });
  const t0 = performance.now();
  const tick = (t) => {
    const k = (t - t0) / ms; g.clearRect(0, 0, W, Hh);
    P0.forEach((p) => { p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.7) / 0.3); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; if (p.shape === 0) { g.beginPath(); g.arc(0, 0, p.w / 2, 0, 7); g.fill(); } else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.4 + Math.abs(Math.sin(p.r)) * 0.6)); g.restore(); });
    if (k < 1) requestAnimationFrame(tick); else c.remove();
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- certificates (derived from your data, nothing extra to store)
const code = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(0, 7); };
const fullDate = (d) => { try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return d; } };
const accLine = (kind, a, fallback) => { const base = `${a?.firm || fallback || 'Personal'} ${a ? kSize(a.size) : ''} ${kind}`.replace(/\s+/g, ' ').trim(); return a?.name && !a.name.toLowerCase().startsWith(String(a.firm || '').toLowerCase().split(' ')[0] || '~') ? `${base} · ${a.name}` : base; };
const kSize = (n) => (num(n) >= 1000 ? Math.round(num(n) / 1000) + 'K' : num(n) ? String(n) : '');
export function certificates() {
  const name = P().name || 'Trader'; const out = [];
  const passedAcc = S.account.filter((a) => a.passedDate || a.status === 'passed' || (a.fundedId && S.account.some((x) => x.id === a.fundedId)));
  passedAcc.forEach((a) => {
    const m = accountMetrics(a); const firm = a.firm || 'Personal';
    out.push({ kind: 'pass', id: 'P-' + code(a.id), date: a.passedDate || [...m.trades].map((t) => t.date).sort().pop() || a.purchaseDate || today(), name, title: 'Challenge Passed', line: accLine(a.stage === 'verification' ? 'verification' : 'evaluation', a), acc: a.name, stats: [['Profit', money(m.pnl)], ['Trading days', String(m.tradingDays)], ['Target', a.target ? money(num(a.target)) : '—']], accountId: a.id });
  });
  const pays = S.payout.filter((p) => p.status === 'credited').sort((x, y) => (x.creditDate || x.reqDate || '').localeCompare(y.creditDate || y.reqDate || ''));
  pays.forEach((p, i) => { const a = S.account.find((x) => x.id === p.accountId); const nOnAcc = pays.filter((q) => q.accountId === p.accountId && (q.creditDate || q.reqDate || '') <= (p.creditDate || p.reqDate || '')).length; out.push({ kind: 'payout', id: 'Y-' + code(p.id), date: p.creditDate || p.reqDate || today(), name, title: 'Payout Received', line: accLine('funded account', a, accName(p.accountId)), acc: a?.name || '', amount: num(p.amount), stats: [['Payout', money(num(p.amount))], ['Payout no.', `#${nOnAcc} on this account`], ['Lifetime no.', `#${i + 1}`]], payoutId: p.id }); });
  out.sort((x, y) => y.date.localeCompare(x.date));
  const total = sum(pays, (p) => num(p.amount));
  const life = [
    { kind: 'life-pass', id: 'L-P-' + code(name + 'pass'), date: today(), name, title: 'Funded Trader', line: 'Lifetime evaluations passed', big: String(passedAcc.length), bigLabel: passedAcc.length === 1 ? 'challenge passed' : 'challenges passed', stats: [['Firms', String(new Set(passedAcc.map((a) => a.firm || 'Personal')).size)], ['Funded accounts', String(S.account.filter((a) => a.type === 'funded' || a.status === 'funded').length)], ['Since', passedAcc.length ? fullDate(passedAcc.map((a) => a.passedDate || a.purchaseDate || today()).sort()[0]) : '—']], locked: !passedAcc.length },
    { kind: 'life-pay', id: 'L-Y-' + code(name + 'pay'), date: today(), name, title: 'Paid Trader', line: 'Lifetime payouts received', big: money(total), bigLabel: `across ${pays.length} payout${pays.length === 1 ? '' : 's'}`, stats: [['Payouts', String(pays.length)], ['Largest', pays.length ? money(Math.max(...pays.map((p) => num(p.amount)))) : '—'], ['Firms paid by', String(new Set(pays.map((p) => S.account.find((a) => a.id === p.accountId)?.firm || '')).size)]], locked: !pays.length },
  ];
  return { list: out, life, passed: passedAcc.length, payouts: pays.length, total };
}

// the certificate itself, drawn on a canvas so it can be downloaded as a PNG
let logo = null;
const loadLogo = () => logo || (logo = new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = 'brand/mark.svg?v=8'; }));
export async function certCanvas(cert, W = 1600) {
  await document.fonts?.ready; const img = await loadLogo();
  const Hh = Math.round(W * 0.625); const c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d'); const u = W / 1600; const F = (w, s) => `${w} ${Math.round(s * u)}px Urbanist, system-ui, sans-serif`;
  const pay = cert.kind === 'payout' || cert.kind === 'life-pay'; const accent = pay ? '#3ecf8e' : '#ff3048'; const accent2 = pay ? '#1f8f60' : '#b3122a';
  // background
  const bg = g.createLinearGradient(0, 0, W, Hh); bg.addColorStop(0, '#141417'); bg.addColorStop(1, '#09090a'); g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  const glow = g.createRadialGradient(W * 0.85, Hh * 0.05, 0, W * 0.85, Hh * 0.05, W * 0.6); glow.addColorStop(0, pay ? 'rgba(62,207,142,.22)' : 'rgba(255,48,72,.24)'); glow.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, Hh);
  // fine guilloche lines
  g.save(); g.globalAlpha = 0.07; g.strokeStyle = '#ffffff'; g.lineWidth = 1 * u; for (let i = 0; i < 26; i++) { g.beginPath(); for (let x = 0; x <= W; x += 8 * u) { const y = Hh * 0.72 + Math.sin(x / (90 * u) + i * 0.45) * (18 + i * 3) * u + i * 6 * u; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } g.restore();
  // frame
  const pad = 46 * u; g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2 * u; rr(g, pad, pad, W - pad * 2, Hh - pad * 2, 28 * u); g.stroke();
  g.strokeStyle = accent; g.globalAlpha = 0.55; g.lineWidth = 3 * u; rr(g, pad + 14 * u, pad + 14 * u, W - (pad + 14 * u) * 2, Hh - (pad + 14 * u) * 2, 20 * u); g.stroke(); g.globalAlpha = 1;
  // header
  const L = pad + 70 * u; let y = pad + 104 * u;
  if (img) g.drawImage(img, L, y - 46 * u, 56 * u, 56 * u);
  g.fillStyle = '#ffffff'; g.font = F(700, 30); g.textBaseline = 'middle'; g.fillText('The Smart Trade', L + 74 * u, y - 18 * u);
  g.fillStyle = 'rgba(255,255,255,.5)'; g.font = F(600, 18); g.fillText('thesmarttrade.in', L + 74 * u, y + 12 * u);
  g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.55)'; g.font = F(600, 18); g.fillText(`Certificate ${cert.id}`, W - L, y - 18 * u); g.fillText(fullDate(cert.date), W - L, y + 12 * u); g.textAlign = 'left';
  // title
  y += 150 * u;
  g.fillStyle = accent; g.font = F(700, 22); g.fillText((cert.kind.startsWith('life') ? 'LIFETIME ACHIEVEMENT' : 'CERTIFICATE OF ACHIEVEMENT').split('').join(String.fromCharCode(8202)), L, y);
  y += 78 * u; g.fillStyle = '#ffffff'; g.font = F(700, 92); g.fillText(cert.title, L, y);
  y += 70 * u; g.fillStyle = 'rgba(255,255,255,.62)'; g.font = F(500, 30); g.fillText('Awarded to', L, y);
  y += 66 * u; g.fillStyle = '#ffffff'; g.font = F(700, 64); g.fillText(cert.name, L, y);
  y += 58 * u; g.fillStyle = 'rgba(255,255,255,.72)'; g.font = F(500, 30); g.fillText(cert.line, L, y);
  // big figure on the right
  const bx = W - L; const by = pad + 360 * u;
  if (cert.big || cert.amount) {
    g.textAlign = 'right'; g.fillStyle = '#ffffff'; g.font = F(700, cert.big && cert.big.length > 7 ? 96 : 140); g.fillText(cert.big || money(cert.amount), bx, by);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = F(600, 26); g.fillText(cert.bigLabel || 'paid to you', bx, by + 74 * u); g.textAlign = 'left';
  } else {
    // seal
    const sx = bx - 120 * u; const sy = by; const R = 112 * u;
    const sg = g.createRadialGradient(sx - 30 * u, sy - 30 * u, 10 * u, sx, sy, R); sg.addColorStop(0, accent); sg.addColorStop(1, accent2); g.fillStyle = sg;
    g.beginPath(); for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; const rr2 = i % 2 ? R : R * 0.92; g.lineTo(sx + Math.cos(a) * rr2, sy + Math.sin(a) * rr2); } g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2 * u; g.beginPath(); g.arc(sx, sy, R * 0.72, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = F(700, 34); g.fillText('PASSED', sx, sy - 8 * u); g.font = F(600, 17); g.fillText(fullDate(cert.date), sx, sy + 26 * u); g.textAlign = 'left';
  }
  // stats row
  const sy2 = Hh - pad - 120 * u; const colW = (W - L * 2) / 3;
  (cert.stats || []).forEach(([k, v], i) => { const x = L + i * colW; g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x, sy2 - 44 * u, 2 * u, 82 * u); g.fillStyle = 'rgba(255,255,255,.55)'; g.font = F(600, 20); g.fillText(k, x + 22 * u, sy2 - 18 * u); g.fillStyle = '#ffffff'; g.font = F(700, 36); g.fillText(v, x + 22 * u, sy2 + 20 * u); });
  // footer
  g.fillStyle = 'rgba(255,255,255,.36)'; g.font = F(500, 16); g.fillText('Recorded from the trader\'s own journal on The Smart Trade. Not issued or verified by the prop firm.', L, Hh - pad - 34 * u);
  return c;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export async function certURL(cert, W) { return (await certCanvas(cert, W)).toDataURL('image/png'); }
export async function downloadCert(cert) {
  const c = await certCanvas(cert, 2000); c.toBlob(async (b) => {
    const file = `the-smart-trade-${cert.kind}-${cert.id}.png`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}
async function shareCert(cert) {
  try {
    const c = await certCanvas(cert, 1600); const b = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    const f = new File([b], `the-smart-trade-${cert.id}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: cert.title, text: `${cert.title} · tracked on The Smart Trade` });
    else downloadCert(cert);
  } catch (e) { /* share cancelled */ }
}
export function certModal(cert) {
  const m = modal(cert.title, `<div class="certview"><img class="certimg" alt="${esc(cert.title)} certificate" id="cvImg"></div>`, `<button class="btn" data-act="cancel">Close</button>${navigator.share ? `<button class="btn" data-act="share">${icon('send')}Share</button>` : ''}<button class="btn btn--primary" data-act="dl">${icon('download')}Download PNG</button>`, 'modal modal--wide');
  certURL(cert, 1600).then((u) => { const i = $('#cvImg', m.el); if (i) i.src = u; });
  m.on('dl', () => downloadCert(cert)); m.on('share', () => shareCert(cert));
}

// ---------------------------------------------------------------- celebrations
function celebrate({ title, sub, cert, stats = [], body = '', actions = '', on = {} }) {
  confetti();
  const m = modal(title, `<div class="celebrate"><p class="celebrate__sub">${sub}</p>${stats.length ? `<div class="celebrate__stats">${stats.map(([k, v]) => `<div><small>${esc(k)}</small><b>${v}</b></div>`).join('')}</div>` : ''}${cert ? '<img class="certimg" id="celImg" alt="Your certificate">' : ''}${body}</div>`, actions || `<button class="btn" data-act="cancel">Close</button>`, 'modal modal--wide modal--celebrate');
  if (cert) certURL(cert, 1600).then((u) => { const i = $('#celImg', m.el); if (i) i.src = u; });
  Object.entries(on).forEach(([k, fn]) => m.on(k, () => fn(m)));
  if (cert) m.on('dl', () => downloadCert(cert));
  return m;
}

// A challenge hit every pass rule: celebrate, then mark it passed and set up the funded account in one go.
export function passModal(a) {
  const st = passStatus(a); const m0 = accountMetrics(a); const firm = firmById(a.firmId); const prog = firm?.programs.find((p) => p.id === a.programId);
  const days = st.firstDay && st.lastDay ? daysBetween(st.firstDay, st.lastDay) + 1 : 0;
  const cert = { kind: 'pass', id: 'P-' + code(a.id), date: st.lastDay || today(), name: P().name || 'Trader', title: 'Challenge Passed', line: accLine(a.stage === 'verification' ? 'verification' : 'evaluation', a), acc: a.name, stats: [['Profit', money(m0.pnl)], ['Trading days', String(m0.tradingDays)], ['Target', money(num(a.target))]] };
  const act = num(prog?.activation);
  const next = nextStage(a, prog); const nextLbl = next === 'verification' ? 'verification' : 'funded';
  const m = celebrate({
    title: 'Challenge passed 🎉',
    sub: `<b>${esc(a.name)}</b> hit every rule${num(a.minDays) ? ' including the minimum days' : ''}${num(a.consistency) ? ' and the consistency rule' : ''}. That's ${money(m0.pnl)} in ${m0.tradingDays} trading day${m0.tradingDays === 1 ? '' : 's'}${days ? ` (${days} calendar days)` : ''}.`,
    stats: [['Profit', money(m0.pnl)], ['Trading days', m0.tradingDays], ['Best day', money(st.best)], ['Cost of this pass', money(accCost(a))]],
    cert,
    body: `<div class="passnext"><b>Next: your ${nextLbl} account</b><p class="muted">Once ${esc(a.firm || 'the firm')} confirms the pass, add the ${nextLbl} account here so new trades${next === 'funded' ? ' and payouts' : ''} land in the right place${copiersOf(a.id).length ? `. The ${copiersOf(a.id).length} account${copiersOf(a.id).length === 1 ? '' : 's'} copying this one will copy the new account instead` : ''}.</p>
      <div class="grid g-2" style="gap:12px">${helpers.field(`${next === 'verification' ? 'Verification' : 'Funded'} account name`, helpers.inp('fname', `${a.name.replace(/\s*(challenge|evaluation|eval|combine|test|phase ?1|step ?1)\b/i, '').trim()} ${next === 'verification' ? 'Verification' : 'Funded'}`))}${helpers.field(next === 'verification' ? 'Fee for this stage (if any)' : 'Activation fee you paid', helpers.inp('fact', '', `type="number" step="any" placeholder="${act ? 'List ' + act : '0'}"`), '', 'what you actually paid, after any coupon')}</div></div>`,
    actions: `<button class="btn" data-act="later">Not confirmed yet</button><button class="btn" data-act="dl">${icon('download')}Certificate</button><button class="btn" data-act="only">Mark passed only</button><button class="btn btn--primary" data-act="funded">${icon('check')}Mark passed &amp; add ${nextLbl} account</button>`,
    on: {
      later: (mm) => { save('account', { ...a, passSeen: st.lastDay || today() }); mm.close(); toast('Okay. Mark it passed from Accounts when the firm confirms.', icon('info')); },
      only: (mm) => { markPassed(a, null); mm.close(); },
      funded: (mm) => { const f = helpers.formData(mm.el); markPassed(a, { name: f.fname, activation: f.fact }); mm.close(); },
    },
  });
  return m;
}
const nextStage = (a, prog) => { const st = prog?.stages || ['challenge', 'funded']; const i = st.indexOf(a.stage || 'challenge'); return st[i + 1] || 'funded'; };
function markPassed(a, funded) {
  const passedDate = passStatus(a).lastDay || today();
  let fa = null;
  if (funded) {
    const firm = firmById(a.firmId); const prog = firm?.programs.find((p) => p.id === a.programId); const next = nextStage(a, prog); const ver = next === 'verification';
    fa = firm && prog && prog.stages.includes(next) ? accountFromPlan(firm, prog, num(a.size) || prog.sizes[0].size, next) : { id: uid(), firm: a.firm, firmId: a.firmId, programId: a.programId, size: a.size, maxLoss: a.maxLoss, ddType: a.ddType, dailyLimit: a.dailyLimit, personalDaily: a.personalDaily, split: a.split };
    Object.assign(fa, { name: funded.name || `${a.name} ${ver ? 'Verification' : 'Funded'}`, status: ver ? 'active' : 'funded', type: ver ? 'challenge' : 'funded', stage: next, cost: '', activationFee: num(funded.activation) || '', purchaseDate: today(), fundedDate: ver ? '' : today(), fromId: a.id, copyOf: a.copyOf || '', copyRatio: a.copyRatio || 1, brokerAccount: '' });
    save('account', fa);
    copiersOf(a.id).forEach((c) => save('account', { ...c, copyOf: fa.id }));
  }
  save('account', { ...a, status: 'passed', passedDate, passSeen: passedDate, fundedId: fa?.id || a.fundedId || '' });
  H().refresh(); toast(fa ? `${a.name} passed. ${fa.name} is ready for trades${num(fa.payWinDays) || num(fa.payMin) ? ' and its payout rules are set' : ''}.` : `${a.name} marked passed`, icon('check'), 4);
}

// payout ready: tell the trader once per cycle
export function payReadyModal(a) {
  const ps = payoutStatus(a);
  const m = celebrate({
    title: 'You can request a payout 💸',
    sub: `<b>${esc(a.name)}</b> meets ${esc(a.firm || 'the firm')}'s payout rules for this cycle. You can request about <b>${money(ps.amount)}</b>${ps.split ? `, ${money(ps.amount * ps.split / 100)} to you after the ${ps.split}% split` : ''}.`,
    stats: ps.checks.slice(0, 4).map((c) => [c.label, `${c.have}${c.need !== undefined && typeof c.need !== 'string' ? ' / ' + c.need : ''}`]),
    body: a.payNote ? `<p class="muted" style="margin:12px 0 0;font-size:var(--fs-sm)">${esc(a.payNote)} Check the firm's dashboard before requesting.</p>` : '',
    actions: `<button class="btn" data-act="later">Later</button><button class="btn btn--primary" data-act="req">${icon('payouts')}Log my payout request</button>`,
    on: { later: (mm) => { save('account', { ...a, payReadySeen: ps.cycleStart || 'start' }); mm.close(); }, req: (mm) => { save('account', { ...a, payReadySeen: ps.cycleStart || 'start' }); mm.close(); requestPayout(a); } },
  });
  return m;
}
export function requestPayout(a) {
  const ps = payoutStatus(a);
  payoutModal(null, { accountId: a.id, status: 'requested', reqDate: today(), gross: ps.amount || '', estimate: ps.amount ? Math.round(ps.amount * (ps.split || 100) / 100) : '' });
}
// a payout was marked credited: celebrate it with its certificate
export function payoutCelebrate(p) {
  const a = S.account.find((x) => x.id === p.accountId); const all = certificates(); const cert = all.list.find((c) => c.payoutId === p.id);
  celebrate({
    title: 'Payout received 🎉',
    sub: `<b>${money(num(p.amount))}</b> from ${esc(a?.name || 'your funded account')}. That's payout #${all.payouts} overall and ${money(all.total)} lifetime.`,
    stats: [['This payout', money(num(p.amount))], ['Lifetime payouts', String(all.payouts)], ['Lifetime total', money(all.total)]],
    cert,
    body: a ? `<p class="muted" style="margin:12px 0 0;font-size:var(--fs-sm)">The payout count for ${esc(a.name)} starts again from today.${payoutStatus(a).todo.length ? ` Next one: ${esc(payoutStatus(a).todo.join(', '))}.` : ''}</p>` : '',
    actions: `<button class="btn" data-act="cancel">Close</button><button class="btn" data-act="all">All certificates</button><button class="btn btn--primary" data-act="dl">${icon('download')}Download certificate</button>`,
    on: { all: (mm) => { mm.close(); H().go('certs'); } },
  });
}
// drawdown used up: ask before marking it breached (the firm's numbers can differ from ours)
export function breachModal(a) {
  const m0 = accountMetrics(a); const cost = accCost(a);
  const m = modal('Did this account breach?', `<p class="muted" style="margin:0">By your journal, <b>${esc(a.name)}</b> has used its whole ${money(num(a.maxLoss))} drawdown (buffer ${money(m0.buffer)}). If ${esc(a.firm || 'the firm')} closed it, mark it breached so your stats and costs stay right.${cost ? ` It cost you ${money(cost)} in total.` : ''}</p>`,
    `<button class="btn" data-act="no">Not breached</button><button class="btn btn--primary" data-act="yes" style="background:var(--bad);color:#fff">Mark breached</button>`, 'modal modal--sm');
  m.on('no', () => { save('account', { ...a, breachSeen: Math.round(m0.buffer) }); m.close(); });
  m.on('yes', () => { save('account', { ...a, status: 'failed', failedDate: today(), breachSeen: Math.round(m0.buffer) }); m.close(); H().refresh(); toast(`${a.name} marked breached. It happens; the next one is a fresh start.`, icon('info'), 4); });
}

// ---------------------------------------------------------------- the check that runs after trades and payouts change
let busy = false;
export function checkMilestones() {
  if (busy || $('.scrim') || !S.account?.length) return;
  for (const a of S.account) {
    if (isChallenge(a)) { const st = passStatus(a); if (st.applies && st.passed && !a.passSeen) { busy = true; save('account', { ...a, passSeen: st.lastDay || today() }); passModal(S.account.find((x) => x.id === a.id)); return release(); } }
    if (isLive(a) && num(a.maxLoss) && a.breachSeen === undefined) { const m0 = accountMetrics(a); if (m0.buffer !== null && m0.buffer <= 0 && m0.trades.length) { busy = true; save('account', { ...a, breachSeen: Math.round(m0.buffer) }); breachModal(S.account.find((x) => x.id === a.id)); return release(); } }
    if (isFundedAcc(a)) { const ps = payoutStatus(a); if (ps.hasRules && ps.eligible && !ps.pending.length && a.payReadySeen !== (ps.cycleStart || 'start')) { busy = true; save('account', { ...a, payReadySeen: ps.cycleStart || 'start' }); payReadyModal(S.account.find((x) => x.id === a.id)); return release(); } }
  }
}
const release = () => setTimeout(() => (busy = false), 800);

// ---------------------------------------------------------------- payout tracker (Payouts page and Overview)
export function trackerHTML({ compact = false } = {}) {
  const funded = S.account.filter(isFundedAcc); const chall = S.account.filter((a) => isChallenge(a) && num(a.target) && (!compact || accountMetrics(a).progress >= 0.8));
  if (!funded.length && !chall.length) return '';
  const row = (a) => {
    const ps = payoutStatus(a);
    const pct = ps.checks.length ? ps.checks.filter((c) => c.ok).length / ps.checks.length : 0;
    const state = ps.pending.length ? `<span class="pill pill--warn">Payout pending ${money(num(ps.pending[0].estimate || ps.pending[0].amount))}</span>` : ps.eligible ? '<span class="pill pill--good">Payout ready</span>' : !ps.hasRules ? '<span class="pill">Add payout rules</span>' : `<span class="pill">${Math.round(pct * 100)}% there</span>`;
    return `<div class="ptrack" data-pt="${a.id}"><div class="ptrack__h"><span class="cell__text"><b>${esc(a.name)}</b><small>${esc(a.firm || '')} · ${ps.payoutsTaken} payout${ps.payoutsTaken === 1 ? '' : 's'} taken${ps.countLeft !== null ? ` · ${Math.max(0, ps.countLeft)} left` : ''} · cycle from ${ps.cycleStart ? esc(fmtDate(ps.cycleStart)) : 'start'}</small></span>${state}</div>
      ${ps.hasRules ? `<div class="ptrack__checks">${ps.checks.map((c) => `<span class="pchk ${c.ok ? 'is-ok' : ''}">${icon(c.ok ? 'check' : 'clock')}<em>${esc(c.label)}</em><b>${esc(String(c.have))}${typeof c.need === 'number' ? ' / ' + c.need : ''}</b></span>`).join('')}</div>` : `<p class="muted" style="margin:6px 0 0;font-size:var(--fs-sm)">Add this firm's payout rules in the account settings and we'll count your qualifying days.</p>`}
      <div class="ptrack__f">${ps.eligible ? `<span class="good"><b>Up to ${money(ps.amount)}</b> can be requested${ps.split ? ` · ${money(ps.amount * ps.split / 100)} to you` : ''}</span>` : ps.todo.length ? `<span class="muted">Next payout: ${esc(ps.todo.join(' · '))}</span>` : '<span class="muted">Profit this cycle: ' + money(ps.cycleProfit) + '</span>'}
      <span class="ptrack__btns">${ps.hasRules ? '' : `<button class="btn btn--sm" data-ptedit="${a.id}">Payout rules</button>`}<button class="btn btn--sm ${ps.eligible ? 'btn--primary' : ''}" data-ptreq="${a.id}">${icon('payouts')}Log payout</button></span></div></div>`;
  };
  const crow = (a) => { const st = passStatus(a); const left = st.checks.filter((c) => !c.ok).map((c) => c.left).filter(Boolean); return `<div class="ptrack ptrack--ch"><div class="ptrack__h"><span class="cell__text"><b>${esc(a.name)}</b><small>${esc(a.firm || '')} challenge</small></span>${st.passed ? '<span class="pill pill--good">Passed</span>' : `<span class="pill">${Math.round(Math.max(0, Math.min(1, st.profit / num(a.target))) * 100)}% of target</span>`}</div><div class="ptrack__checks">${st.checks.map((c) => `<span class="pchk ${c.ok ? 'is-ok' : ''}">${icon(c.ok ? 'check' : 'clock')}<em>${esc(c.label)}</em><b>${esc(String(c.have))} / ${esc(String(c.need))}</b></span>`).join('')}</div><div class="ptrack__f"><span class="muted">${st.passed ? 'Every rule met. Mark it passed when the firm confirms.' : 'To pass: ' + esc(left.join(' · '))}</span>${st.passed ? `<span class="ptrack__btns"><button class="btn btn--sm btn--primary" data-ptpass="${a.id}">${icon('check')}I passed</button></span>` : ''}</div></div>`; };
  return `<section class="card ptracker"><div class="chead"><div class="chead__text"><h3>Next milestones</h3><p>What each account needs for its pass or its next payout</p></div></div>
    <div class="stack" style="gap:10px">${funded.map(row).join('')}${chall.map(crow).join('')}</div></section>`;
}
export function bindTracker(root) {
  $$('[data-ptreq]', root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); requestPayout(S.account.find((a) => a.id === b.dataset.ptreq)); }));
  $$('[data-ptedit]', root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); accountModal(S.account.find((a) => a.id === b.dataset.ptedit)); }));
  $$('[data-ptpass]', root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); passModal(S.account.find((a) => a.id === b.dataset.ptpass)); }));
}

// ---------------------------------------------------------------- certificates page
export function certs(el) {
  const C = certificates();
  const card = (c) => `<button type="button" class="certcard ${c.locked ? 'is-locked' : ''}" data-cert="${esc(c.id)}"><span class="certcard__img"><img alt="" data-cimg="${esc(c.id)}"></span><span class="certcard__t"><b>${esc(c.title)}</b><small>${esc(c.kind.startsWith('life') ? `${c.big} ${c.bigLabel}` : `${c.line} · ${fmtDate(c.date)}`)}</small></span></button>`;
  el.innerHTML = `<div class="page">${helpers.phead('Proof of the work', 'Certificates', 'Every challenge you pass and every payout you take earns a certificate. Download or share any of them.', '')}
    <div class="grid g-3">${[['Challenges passed', C.passed, 'int'], ['Payouts taken', C.payouts, 'int'], ['Paid out in total', C.total, 'money']].map(([l, v, f]) => `<div class="kpi"><small>${l}</small><b class="${f === 'money' && v ? 'good' : ''}">${helpers.cnt(v, f)}</b></div>`).join('')}</div>
    <section class="card" style="margin-top:var(--gap)"><div class="chead"><div class="chead__text"><h3>Lifetime</h3><p>These grow with every pass and payout</p></div></div><div class="certgrid certgrid--life">${C.life.map(card).join('')}</div></section>
    <section class="card" style="margin-top:var(--gap)"><div class="chead"><div class="chead__text"><h3>Your certificates</h3><p>${C.list.length ? `${C.list.length} earned` : 'Pass a challenge or log a credited payout to earn your first'}</p></div></div>
      ${C.list.length ? `<div class="certgrid">${C.list.map(card).join('')}</div>` : `<div class="empty">${icon('star')}<b>No certificates yet</b>When a challenge hits its target and rules, or a payout is credited, it shows up here.</div>`}</section></div>`;
  const all = [...C.life, ...C.list];
  $$('[data-cimg]', el).forEach((i) => { const c = all.find((x) => x.id === i.dataset.cimg); if (c) certURL(c, 800).then((u) => (i.src = u)); });
  $$('[data-cert]', el).forEach((b) => (b.onclick = () => { const c = all.find((x) => x.id === b.dataset.cert); if (c.locked) return toast(c.kind === 'life-pass' ? 'Pass your first challenge to unlock this one.' : 'Log your first credited payout to unlock this one.', icon('info')); certModal(c); }));
  helpers.after(el);
}
export { isChallenge, isFundedAcc };
