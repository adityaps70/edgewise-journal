// Charts as SVG/HTML strings; motion.js animates [data-draw], [data-fade], [data-grow], [data-pop].
import { esc, money, short, fmtDate, $$ } from './core.js';

const niceStep = (range, ticks = 4) => {
  const raw = range / ticks; const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
};

// Equity / balance curve with optional forecast & event dots
export function equityChart(points, { h = 200, events = [], forecast = null, goal = null, id = 'eq' } = {}) {
  const W = 640; const H = h; const L = 46; const R = 10; const T = 14; const B = 24;
  if (!points.length) return `<div class="empty" style="padding:50px 0">${'No trades yet — your equity curve draws itself as you log them.'}</div>`;
  const pts = [{ date: points[0].date, eq: 0, start: true }, ...points];
  const all = pts.map((p) => p.eq).concat(forecast ? forecast.map((f) => f.eq) : []).concat(goal ? [goal] : []);
  let min = Math.min(0, ...all); let max = Math.max(0, ...all);
  if (max === min) { max += 1; min -= 1; }
  const step = niceStep(max - min); min = Math.floor(min / step) * step; max = Math.ceil(max / step) * step;
  const n = pts.length + (forecast ? forecast.length : 0) - 1;
  const xs = (i) => L + (n ? (i / n) * (W - L - R) : 0);
  const ys = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p.eq).toFixed(1)}`).join('');
  const area = `${line}L${xs(pts.length - 1).toFixed(1)},${ys(min)}L${xs(0)},${ys(min)}Z`;
  let grid = '';
  for (let v = min; v <= max + 1e-9; v += step) grid += `<line class="${v === 0 ? 'zero-l' : 'grid-l'}" x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}"/><text x="${L - 8}" y="${ys(v) + 4}" text-anchor="end">${esc(short(v))}</text>`;
  let fc = '';
  if (forecast && forecast.length) {
    const start = pts.length - 1;
    fc = `<path d="M${xs(start)},${ys(pts[start].eq)}${forecast.map((f, i) => `L${xs(start + i + 1)},${ys(f.eq)}`).join('')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="3 5" opacity=".7" data-fade/>`;
    fc += `<line x1="${xs(start)}" x2="${xs(start)}" y1="${T}" y2="${H - B}" stroke="var(--line-2)" stroke-dasharray="2 3"/><g data-fade><rect x="${xs(start) - 22}" y="${T - 12}" width="44" height="18" rx="6" fill="var(--card-3)"/><text x="${xs(start)}" y="${T + 1}" text-anchor="middle" style="fill:var(--ink-2)">Today</text></g>`;
  }
  const goalL = goal ? `<line x1="${L}" x2="${W - R}" y1="${ys(goal)}" y2="${ys(goal)}" stroke="var(--warn)" stroke-dasharray="6 6" opacity=".7"/><text x="${W - R}" y="${ys(goal) - 6}" text-anchor="end" style="fill:var(--warn)">Goal ${esc(short(goal))}</text>` : '';
  const dots = events.map((e) => {
    const i = pts.findIndex((p) => p.date >= e.date); if (i < 0) return '';
    return `<circle data-pop cx="${xs(i)}" cy="${ys(pts[i].eq)}" r="5" fill="${e.color || 'var(--mint)'}" stroke="var(--panel)" stroke-width="2"><title>${esc(e.label)}</title></circle>`;
  }).join('');
  const hit = pts.map((p, i) => `<rect x="${xs(i) - (W - L - R) / n / 2}" y="${T}" width="${(W - L - R) / Math.max(1, n)}" height="${H - T - B}" fill="transparent" data-tip="${esc(p.start ? 'Start' : fmtDate(p.date, { day: 'numeric', month: 'short', year: 'numeric' }))}|${esc(money(p.eq, { sign: true }))}${p.net !== undefined ? '|day ' + esc(money(p.net, { sign: true })) : ''}"/>`).join('');
  const first = pts[1] || pts[0]; const last = pts[pts.length - 1];
  return `<div class="chartwrap" style="position:relative">
  <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">
    <defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".32"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${grid}${goalL}
    <path d="${area}" fill="url(#${id}g)" data-fade/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" data-draw vector-effect="non-scaling-stroke"/>
    ${fc}${dots}
    <text x="${L}" y="${H - 4}">${esc(fmtDate(first.date))}</text><text x="${xs(pts.length - 1)}" y="${H - 4}" text-anchor="end">${esc(fmtDate(last.date))}</text>
    ${hit}
  </svg><div class="tube-tip"></div></div>`;
}

// Capsule columns for daily/weekly/monthly P&L (positive up, negative down)
export function tubes(items, { h = 210 } = {}) {
  if (!items.length) return '<div class="empty" style="padding:50px 0">Log trades to see your P&amp;L bars.</div>';
  const max = Math.max(1, ...items.map((d) => Math.abs(d.value)));
  const hasNeg = items.some((d) => d.value < 0);
  const posH = hasNeg ? h * 0.62 : h; const negH = hasNeg ? h * 0.38 : 0;
  const step = niceStep(max, 3);
  const top = Math.ceil(max / step) * step;
  let ticks = '';
  for (let v = 0; v <= top + 1e-9; v += step) ticks += `<span style="bottom:${negH + (v / top) * posH}px">${esc(short(v))}</span>`;
  const cols = items.map((d) => {
    const ph = d.value > 0 ? Math.max(6, (d.value / top) * posH) : 0;
    const nh = d.value < 0 ? Math.max(6, (Math.abs(d.value) / top) * posH) : 0;
    return `<div class="tube" data-tip="${esc(d.tip || d.label)}|${esc(money(d.value, { sign: true }))}${d.sub ? '|' + esc(d.sub) : ''}">
      <div class="tube__pos" style="height:${posH}px"><i class="tube__sleeve"></i>${ph ? `<i class="tube__fill" data-grow style="height:${ph}px"></i>` : ''}</div>
      ${hasNeg ? `<div class="tube__neg" style="height:${negH}px"><i class="tube__sleeve"></i>${nh ? `<i class="tube__fill is-neg" data-grow="down" style="height:${Math.min(nh, negH)}px"></i>` : ''}</div>` : ''}
      <span class="tube__label${d.on ? ' is-on' : ''}">${esc(d.label)}</span></div>`;
  }).join('');
  return `<div class="tubes" style="--h:${h}px"><div class="tubes__axis">${ticks}</div><div class="tubes__cols" style="grid-template-columns:repeat(${items.length},minmax(0,1fr))">${cols}</div><div class="tube-tip"></div></div>`;
}

// Horizontal bars for breakdowns
export function hbars(rows, { fmt = (v) => money(v, { sign: true }) } = {}) {
  if (!rows.length) return '<div class="empty">Not enough data yet.</div>';
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  return `<div class="hbars">${rows.map((r) => `<div class="hbar">
      <div class="hbar__top"><b>${esc(r.key)}</b><span class="muted">${r.n} trade${r.n === 1 ? '' : 's'} · ${(r.winRate * 100).toFixed(0)}% win</span><span class="amt ${r.net >= 0 ? 'good' : 'bad'}">${esc(fmt(r.net))}</span></div>
      <div class="meter ${r.net < 0 ? 'meter--bad' : ''}"><i data-w="${(Math.abs(r.net) / max * 100).toFixed(1)}%"></i></div></div>`).join('')}</div>`;
}

// Tooltips for [data-tip] inside a chart container
export function bindTips(root) {
  $$('.chartwrap, .tubes', root).forEach((wrap) => {
    const tip = wrap.querySelector('.tube-tip'); if (!tip) return;
    const g = window.gsap;
    wrap.addEventListener('pointermove', (e) => {
      const t = e.target.closest('[data-tip]'); if (!t) { hide(); return; }
      const [a, b, c] = t.dataset.tip.split('|');
      tip.innerHTML = `<b>${b || ''}</b>${a || ''}${c ? ' · ' + c : ''}`;
      const r = wrap.getBoundingClientRect();
      let x = e.clientX - r.left + 14; const y = e.clientY - r.top - 44;
      if (x + tip.offsetWidth > r.width) x = e.clientX - r.left - tip.offsetWidth - 14;
      tip.style.left = x + 'px'; tip.style.top = Math.max(-10, y) + 'px';
      if (g) g.to(tip, { opacity: 1, duration: 0.2, overwrite: 'auto' }); else tip.style.opacity = 1;
      $$('.tube.is-hot', wrap).forEach((x2) => x2.classList.remove('is-hot')); t.classList.add('is-hot');
    });
    const hide = () => { if (g) g.to(tip, { opacity: 0, duration: 0.2, overwrite: 'auto' }); else tip.style.opacity = 0; $$('.tube.is-hot', wrap).forEach((x2) => x2.classList.remove('is-hot')); };
    wrap.addEventListener('pointerleave', hide);
  });
}
