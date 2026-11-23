// Free vs Pro: the upgrade screen, the usage meter, and the admin panel.
import { S, $, $$, esc, icon, API, isPro, tradesLeft, aiLeft } from './core.js?v=0489d084';
import { modal, confirmBox, helpers } from './views.js?v=0489d084';
import { toast } from './motion.js?v=0489d084';

const SUPPORT = 'support@thesmarttrade.in';
const price = () => S.sub?.price || '20';

// ---------------------------------------------------------------- upgrade
let open = false;
export function upgradeModal(reason = '') {
  if (open || isPro()) return; open = true;
  const why = reason === 'trades' ? `You've logged your ${S.sub?.trades.limit || 10} free trades.` : reason === 'ai' ? `You've used your ${S.sub?.ai.limit || 10} free AI requests.` : 'Get everything, without limits.';
  const pay = S.sub?.payLink;
  const m = modal('Upgrade to Pro', `<div class="upg">
    <p class="upg__why">${esc(why)} Pro keeps your journal going with no caps on trades.</p>
    <div class="upg__plans">
      <div class="upg__p"><small>Free</small><b>$0</b><ul><li>${icon('check')}${S.sub?.trades.limit || 10} trade logs</li><li>${icon('check')}${S.sub?.ai.limit || 10} AI coach requests</li><li>${icon('check')}Every feature to try</li></ul></div>
      <div class="upg__p upg__p--pro"><small>Pro</small><b>$${esc(price())}<em>/month</em></b><ul><li>${icon('check')}Unlimited trade logs and imports</li><li>${icon('check')}AI coach, 60 requests a day</li><li>${icon('check')}Screenshot logging, replay, AI backtests</li><li>${icon('check')}Broker sync and mentor links</li></ul></div>
    </div>
    <p class="upg__fine">${pay ? 'You pay on a secure checkout page. Your account switches to Pro as soon as the payment is confirmed.' : `Write to ${SUPPORT} and we'll switch your account to Pro.`}</p>
  </div>`, `<button class="btn" data-act="x">Not now</button>${pay ? `<a class="btn btn--primary" href="${esc(pay)}" target="_blank" rel="noopener" data-act="pay">Upgrade for $${esc(price())}/month</a>` : `<a class="btn btn--primary" href="mailto:${SUPPORT}?subject=${encodeURIComponent('Upgrade to Pro')}&body=${encodeURIComponent('Please switch my account to Pro: ' + (S.user?.email || ''))}">Email to upgrade</a>`}`);
  m.el.parentElement.style.zIndex = '400'; // above any open form
  const done = () => (open = false);
  const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { done(); obs.disconnect(); } }); obs.observe(document.body, { childList: true });
  m.on('pay', () => {});
}

// ---------------------------------------------------------------- usage meter (sidebar, settings)
export function usageHTML(compact = true) {
  if (isPro() || !S.sub) return '';
  const t = S.sub.trades; const a = S.sub.ai; const pct = (x) => Math.min(100, (x.used / x.limit) * 100);
  return `<div class="usage ${compact ? 'usage--side' : ''}"><div class="usage__h"><b>Free plan</b><button type="button" class="linkbtn" data-upgrade>Upgrade</button></div>
    <div class="usage__r"><span>Trades</span><em>${Math.min(t.used, t.limit)}/${t.limit}</em></div><div class="usage__bar"><i style="width:${pct(t)}%"></i></div>
    <div class="usage__r"><span>AI requests</span><em>${Math.min(a.used, a.limit)}/${a.limit}</em></div><div class="usage__bar"><i style="width:${pct(a)}%"></i></div></div>`;
}
export function bindUsage(root) { $$('[data-upgrade]', root).forEach((b) => (b.onclick = () => upgradeModal())); }
export { tradesLeft, aiLeft };

// ---------------------------------------------------------------- admin panel
const fmtD = (t) => (t ? new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
const ago = (t) => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); if (m < 2) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 48) return h + ' h ago'; return Math.round(h / 24) + ' days ago'; };
let AD = { q: '', filter: 'all', sort: 'new' };
export async function admin(el) {
  const { card, phead, after } = helpers;
  if (!S.user?.admin) { el.innerHTML = `<div class="page">${phead('', 'Admin', 'This page is only for admins.', '')}</div>`; return; }
  el.innerHTML = `<div class="page">${phead('Run the business', 'Admin', 'Users, plans, usage and app settings.', `<button class="btn" id="adCsv">${icon('download')}Export users</button>`)}<div id="adBody"><section class="card"><div class="empty"><span class="typing"><i></i><i></i><i></i></span>Loading…</div></section></div></div>`;
  after(el);
  let ov; let users; let st;
  try { [ov, users, st] = await Promise.all([API.adminOverview(), API.adminUsers().then((r) => r.users), API.adminSettings().then((r) => r.settings)]); }
  catch (e) { $('#adBody', el).innerHTML = `<section class="card"><div class="empty">${icon('info')}<b>Couldn't load admin data</b>${esc(e.message)}</div></section>`; return; }
  const isProU = (u) => u.admin || (u.plan === 'pro' && (!u.pro_until || u.pro_until > Date.now()));
  const spark = (arr, cls) => { const mx = Math.max(1, ...arr); return `<div class="adspark ${cls || ''}">${arr.map((v, i) => `<i style="height:${Math.max(4, (v / mx) * 100)}%" title="${ov.days[i]}: ${v}"></i>`).join('')}</div>`; };
  const draw = () => {
    const q = AD.q.toLowerCase();
    let list = users.filter((u) => (!q || (u.email + ' ' + (u.name || '')).toLowerCase().includes(q)) && (AD.filter === 'all' || (AD.filter === 'pro' ? isProU(u) : AD.filter === 'free' ? !isProU(u) : AD.filter === 'limit' ? !isProU(u) && Math.max(u.logged, u.trades) >= +st.free_trades : AD.filter === 'idle' ? (!u.last_seen || u.last_seen < Date.now() - 14 * 86400000) : true)));
    list = list.slice().sort((a, b) => AD.sort === 'active' ? (b.last_seen || 0) - (a.last_seen || 0) : AD.sort === 'trades' ? b.trades - a.trades : AD.sort === 'ai' ? b.ai - a.ai : b.created_at - a.created_at);
    $('#adBody', el).innerHTML = `
      <div class="grid g-4 adkpis">
        <section class="card adk"><small>Users</small><b>${ov.users}</b><span>+${ov.new7} this week · +${ov.new30} in 30 days</span>${spark(ov.signups)}</section>
        <section class="card adk"><small>Active</small><b>${ov.active7}</b><span>${ov.active1} today · last 7 days</span></section>
        <section class="card adk"><small>Pro</small><b>${ov.pro}</b><span>$${(ov.pro * +st.pro_price).toLocaleString()}/month at $${esc(st.pro_price)} · ${ov.atLimit} free users at the trade limit</span></section>
        <section class="card adk"><small>AI requests</small><b>${ov.aiToday}</b><span>today · ${ov.ai30} in 30 days</span>${spark(ov.aiDaily, 'adspark--ai')}</section>
      </div>
      <section class="card" style="margin-top:var(--gap)"><div class="chead"><div class="chead__text"><h3>Users</h3><p>${list.length} of ${users.length} · ${ov.trades.toLocaleString()} trades and ${ov.accounts} accounts across everyone</p></div></div>
        <div class="adbar"><input class="in" id="adQ" placeholder="Search email or name" value="${esc(AD.q)}"><div class="seg" id="adF">${[['all', 'All'], ['pro', 'Pro'], ['free', 'Free'], ['limit', 'At limit'], ['idle', 'Idle 14d+']].map(([v, l]) => `<button data-v="${v}" class="${AD.filter === v ? 'is-on' : ''}">${l}</button>`).join('')}</div>
          <select class="in" id="adS" style="width:auto">${[['new', 'Newest'], ['active', 'Last active'], ['trades', 'Most trades'], ['ai', 'Most AI']].map(([v, l]) => `<option value="${v}" ${AD.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="tablewrap"><table class="t adt"><thead><tr><th>User</th><th>Plan</th><th class="r">Trades</th><th class="r">AI</th><th class="r">Accounts</th><th>Joined</th><th>Last active</th><th></th></tr></thead><tbody>
        ${list.map((u) => `<tr data-u="${u.id}"><td><b>${esc(u.name || u.email.split('@')[0])}</b>${u.admin ? ' <span class="pill pill--accent">admin</span>' : ''}<small class="muted" style="display:block">${esc(u.email)}</small></td>
          <td>${isProU(u) ? `<span class="pill pill--good">Pro</span>${u.pro_until ? `<small class="muted" style="display:block">until ${fmtD(u.pro_until)}</small>` : ''}` : '<span class="pill">Free</span>'}</td>
          <td class="r">${u.trades}${!isProU(u) ? `<small class="muted">/${st.free_trades}</small>` : ''}</td><td class="r">${u.ai}</td><td class="r">${u.accounts}</td><td>${fmtD(u.created_at)}</td><td>${ago(u.last_seen)}</td>
          <td class="r"><div class="row" style="gap:6px;justify-content:flex-end">${u.admin ? '' : isProU(u) ? '<button class="btn btn--sm" data-a="free">Make free</button>' : '<button class="btn btn--sm btn--primary" data-a="pro">Give Pro</button>'}<button class="ibtn" data-a="more" aria-label="More">${icon('more')}</button></div></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty">No users match.</div></td></tr>'}
        </tbody></table></div></section>
      <section class="card" style="margin-top:var(--gap)"><div class="chead"><div class="chead__text"><h3>App settings</h3><p>Limits, price, checkout link and an announcement banner for everyone</p></div></div>
        <form class="grid g-3 adset" id="adSet">
          <label class="field"><span>Free trade logs</span><input class="in" name="free_trades" type="number" min="0" value="${esc(st.free_trades)}"></label>
          <label class="field"><span>Free AI requests</span><input class="in" name="free_ai" type="number" min="0" value="${esc(st.free_ai)}"></label>
          <label class="field"><span>Pro price (USD a month)</span><input class="in" name="pro_price" type="number" min="0" value="${esc(st.pro_price)}"></label>
          <label class="field" style="grid-column:1/-1"><span>Checkout link</span><input class="in" name="pay_link" placeholder="https://rzp.io/… or a Stripe payment link" value="${esc(st.pay_link)}"><small class="muted">Where "Upgrade" sends people. After a payment, give that user Pro here.</small></label>
          <label class="field" style="grid-column:1/-1"><span>Announcement banner</span><input class="in" name="banner" maxlength="200" placeholder="Shown at the top of the app for everyone. Leave empty for none." value="${esc(st.banner)}"></label>
          <label class="field"><span>New sign-ups</span><select class="in" name="signup"><option value="on" ${st.signup !== 'off' ? 'selected' : ''}>Open</option><option value="off" ${st.signup === 'off' ? 'selected' : ''}>Closed</option></select></label>
          <div class="row" style="grid-column:1/-1;justify-content:flex-end"><button class="btn btn--primary" type="submit">Save settings</button></div>
        </form></section>`;
    $('#adQ', el).oninput = (e) => { AD.q = e.target.value; const pos = e.target.selectionStart; draw(); const q2 = $('#adQ', el); q2.focus(); q2.setSelectionRange(pos, pos); };
    $$('#adF button', el).forEach((b) => (b.onclick = () => { AD.filter = b.dataset.v; draw(); }));
    $('#adS', el).onchange = (e) => { AD.sort = e.target.value; draw(); };
    $$('[data-u]', el).forEach((tr) => {
      const u = users.find((x) => x.id === tr.dataset.u);
      const pro = $('[data-a="pro"]', tr); if (pro) pro.onclick = () => givePro(u);
      const fr = $('[data-a="free"]', tr); if (fr) fr.onclick = async () => { await API.adminSetPlan(u.id, { plan: 'free' }); u.plan = 'free'; u.pro_until = null; toast(`${u.email} is on Free`, icon('check')); draw(); };
      $('[data-a="more"]', tr).onclick = () => more(u);
    });
    $('#adSet', el).onsubmit = async (e) => { e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); try { st = (await API.adminSaveSettings(b)).settings; toast('Settings saved', icon('check')); draw(); } catch (err) { toast(err.message, icon('info')); } };
  };
  const givePro = (u) => {
    const m = modal(`Give Pro to ${u.email}`, `<div class="stack"><p class="muted" style="margin:0">Use this after they pay, or to give a friend access.</p><div class="seg" id="gpLen"><button data-v="30" class="is-on">1 month</button><button data-v="90">3 months</button><button data-v="365">1 year</button><button data-v="0">No end date</button></div></div>`, '<button class="btn" data-act="x">Cancel</button><button class="btn btn--primary" data-act="ok">Give Pro</button>');
    $$('#gpLen button', m.el).forEach((b) => b.addEventListener('click', () => $$('#gpLen button', m.el).forEach((x) => x.classList.toggle('is-on', x === b))));
    m.on('ok', async () => { const d = +$('#gpLen .is-on', m.el).dataset.v; const until = d ? Date.now() + d * 86400000 : null; await API.adminSetPlan(u.id, { plan: 'pro', proUntil: until }); u.plan = 'pro'; u.pro_until = until; m.close(); toast(`${u.email} is now Pro`, icon('check')); draw(); });
  };
  const more = (u) => {
    const m = modal(u.email, `<div class="stack"><p class="muted" style="margin:0">Joined ${fmtD(u.created_at)} · last active ${ago(u.last_seen)} · ${u.trades} trades (${u.logged} logged in total) · ${u.ai} AI requests</p>
      <button class="btn" data-act="mail">${icon('send')}Email this user</button><button class="btn" data-act="ai">${icon('refresh')}Reset AI usage to 0</button>${u.admin ? '' : `<button class="btn" data-act="del" style="color:var(--bad)">${icon('trash')}Delete account and all data</button>`}</div>`, '<button class="btn" data-act="x">Close</button>');
    m.on('mail', () => { location.href = `mailto:${u.email}`; });
    m.on('ai', async () => { await API.adminResetAi(u.id); u.ai = 0; m.close(); toast('AI usage reset', icon('check')); draw(); });
    m.on('del', () => { m.close(); confirmBox(`Delete ${u.email}?`, 'Their account, trades, journal and images are deleted for good.', async () => { try { await API.adminDelete(u.id); users = users.filter((x) => x.id !== u.id); toast('Account deleted', icon('trash')); draw(); } catch (e) { toast(e.message, icon('info')); } }); });
  };
  $('#adCsv', el).onclick = () => {
    const rows = [['email', 'name', 'plan', 'pro_until', 'joined', 'last_active', 'trades', 'ai_requests', 'accounts']].concat(users.map((u) => [u.email, u.name || '', isProU(u) ? 'pro' : 'free', u.pro_until ? new Date(u.pro_until).toISOString().slice(0, 10) : '', new Date(u.created_at).toISOString().slice(0, 10), u.last_seen ? new Date(u.last_seen).toISOString().slice(0, 10) : '', u.trades, u.ai, u.accounts]));
    const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `smarttrade-users-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };
  draw();
}
