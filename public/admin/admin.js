/* Admin SPA. No inline handlers (strict CSP): everything goes through data-act delegation. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
const S = { token: sessionStorage.getItem('atoken') || '', me: null, branch: null, tab: null, sub: 'products', branchId: '', branches: [], cats: [], lastOrderIds: null, timer: null, idle: null };

const ICON = {
  dashboard: '<path d="M4 13h6V4H4zM14 20h6V11h-6zM14 4h6v4h-6zM4 20h6v-4H4z"/>',
  orders: '<path d="M6 3h12l1 18-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  branches: '<path d="M12 21s7-6 7-11.5A7 7 0 0 0 5 9.5C5 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  menu: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M9 3v10M17 21V3c-2.5 1.5-3 5-3 8h3"/>',
  banners: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
  promos: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  customers: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.3 5"/>',
  chats: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
  staff: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.5-4 3.5-6 7-6s6.5 2 7 6"/>',
  delivery: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  couriers: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l-2-8h3M8 9h3"/>',
  reviews: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  coins: '<circle cx="12" cy="12" r="9"/><path d="M7.5 9l1.8 6 2.7-5 2.7 5 1.8-6"/>',
  pos: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  audit: '<path d="M8 4h11v16H8zM5 7v13h3M11 9h5M11 13h5"/>',
  security: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  stock: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12l3 3 5-6"/>',
  theme: '<path d="M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z"/>',
  logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
};
const icon = (k, w = 22) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k] || ''}</svg>`;
const ROLE_NAMES = { super: 'Администратор', manager: 'Менеджер филиала', staff: 'Сотрудник', courier: 'Курьер' };
const NAV = {
  super: [['dashboard', 'Дашборд'], ['orders', 'Заказы'], ['branches', 'Филиалы'], ['delivery', 'Доставка'], ['menu', 'Товары'], ['banners', 'Баннеры'], ['promos', 'Промокоды'], ['customers', 'Клиенты'], ['chats', 'Чат'], ['staff', 'Команда'], ['couriers', 'Курьеры'], ['reviews', 'Отзывы'], ['coins', 'WendyCoin'], ['pos', 'POS'], ['audit', 'Журнал'], ['security', 'Безопасность']],
  manager: [['dashboard', 'Дашборд'], ['orders', 'Заказы'], ['stock', 'Наличие'], ['staff', 'Команда'], ['couriers', 'Курьеры'], ['reviews', 'Отзывы'], ['security', 'Безопасность']],
  staff: [['orders', 'Заказы'], ['security', 'Безопасность']],
};
const STATUS = { new: 'Новый', cooking: 'Готовится', ready: 'Готов', delivering: 'В пути', done: 'Выдан', cancelled: 'Отменён' };

/* ---------- maps: Yandex tiles when a key is configured, otherwise OpenStreetMap ---------- */
let MAPKEY = '';
fetch('/api/menu').then(r => r.json()).then(m => { MAPKEY = m.settings.yandex_key || ''; }).catch(() => { });
const tiles = () => (MAPKEY ? L.tileLayer(`https://tiles.api-maps.yandex.ru/v1/tiles/?lang=ru_RU&x={x}&y={y}&z={z}&l=map&apikey=${MAPKEY}`, { maxZoom: 19 }) : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }));
const newMap = el => L.map(el, { attributionControl: false, ...(MAPKEY ? { crs: L.CRS.EPSG3395 } : {}) });
const cabinet = (w = 44) => L.icon({ iconUrl: '/img/branch.png', iconSize: [w, Math.round(w * 1.58)], iconAnchor: [w / 2, Math.round(w * 1.5)], popupAnchor: [0, -Math.round(w * 1.4)] });

/* ---------- api ---------- */
async function api(path, method = 'GET', body, confirm) {
  const r = await fetch('/api/admin/' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}), ...(confirm ? { 'X-Confirm': 'yes' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith('auth/login')) { signOut(j.error); throw new Error(j.error || 'Сессия истекла'); }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Ошибка'), { data: j });
  return j;
}
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
function signOut(msg) { S.token = ''; S.me = null; sessionStorage.removeItem('atoken'); clearInterval(S.timer); render(msg); }
function bumpIdle() { clearTimeout(S.idle); if (S.token) S.idle = setTimeout(() => { api('auth/logout', 'POST').catch(() => { }); signOut('Вы вышли из-за неактивности'); }, 29 * 60 * 1000); }
['click', 'keydown', 'mousemove', 'touchstart'].forEach(e => document.addEventListener(e, bumpIdle, { passive: true }));

/* ---------- confirm dialog (all sensitive actions) ---------- */
function ask(title, text, okLabel = 'Подтвердить', danger = true) {
  return new Promise(res => {
    const o = overlay(`<div class="glass modal" style="max-width:420px"><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="foot"><button class="btn" data-act="cancel">Отмена</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(okLabel)}</button></div></div>`);
    o.addEventListener('click', e => { const a = e.target.closest('[data-act]')?.dataset.act; if (a === 'ok') { o.remove(); res(true); } else if (a === 'cancel' || e.target === o) { o.remove(); res(false); } });
  });
}
function overlay(html) { const o = document.createElement('div'); o.className = 'overlay'; o.innerHTML = html; document.body.appendChild(o); return o; }

/* ---------- shell ---------- */
function render(msg) {
  const root = $('#root');
  if (!S.token) { renderLogin(msg); return; }
  if (!S.me) { api('auth/me').then(r => { S.me = r.admin; S.branch = r.branch; if (S.me.role !== 'super') S.branchId = S.me.branch_id; S.tab = S.tab || NAV[S.me.role][0][0]; render(); }).catch(() => { }); root.innerHTML = '<div class="login"><div class="glass box"><div class="skeleton"></div></div></div>'; return; }
  bumpIdle();
  const nav = NAV[S.me.role];
  if (!nav.some(n => n[0] === S.tab)) S.tab = nav[0][0];
  root.innerHTML = `<div class="app"><aside class="glass side"><div class="brand"><img class="logo" src="/img/brand.png" alt=""><span>Wendy's</span></div>
    ${nav.map(([k, t]) => `<button class="nav ${k === S.tab ? 'on' : ''}" data-act="nav" data-tab="${k}">${icon(k)}<span>${t}</span>${k === 'orders' ? '<span class="dot" id="obadge" hidden></span>' : ''}</button>`).join('')}
    <div class="sp"></div>
    ${S.me.role === 'super' ? '' : `<div class="who"><b>${esc(S.me.name || '')}</b><span class="muted">${ROLE_NAMES[S.me.role]}${S.branch ? ' · ' + esc(S.branch.name) : ''}</span></div>`}
    <button class="nav" data-act="theme">${icon('theme')}<span>Тема</span></button>
    <button class="nav" data-act="logout">${icon('logout')}<span>Выйти</span></button></aside><main id="main"></main></div>`;
  loadTab();
}
async function ensureBranches() { if (!S.branches.length) S.branches = (await api('branches')).rows; return S.branches; }
function branchSelect(all = true) {
  if (S.me.role !== 'super') return '';
  return `<select data-change="branch">${all ? '<option value="">Все филиалы</option>' : ''}${S.branches.map(b => `<option value="${b.id}" ${String(b.id) === String(S.branchId) ? 'selected' : ''}>${esc(b.name || b.address)}</option>`).join('')}</select>`;
}
const head = (title, tools = '') => `<div class="top"><h1>${title}</h1><div class="tools">${tools}</div></div>`;
async function loadTab() {
  clearInterval(S.timer);
  const main = $('#main'); main.innerHTML = '<div class="grid"><div class="skeleton"></div><div class="skeleton"></div></div>';
  try { await ensureBranches(); await VIEWS[S.tab](main); } catch (e) { if (S.token) main.innerHTML = `<div class="glass card empty">${esc(e.message)}</div>`; }
}

/* ---------- login: phone -> Telegram code -> (TOTP) ---------- */
const fmtPh = d => [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
function renderLogin(msg, step = 1, st = {}) {
  const frame = inner => `<div class="login"><form class="glass box" id="lf" autocomplete="off"><div class="brand" style="padding:0"><img class="logo" src="/img/brand.png" alt=""><span>Wendy's</span></div>${inner}<div class="err" id="err">${esc(msg || '')}</div></form></div>`;
  if (step === 1) {
    $('#root').innerHTML = frame(`<h1>Вход</h1><p class="muted" style="margin:0">Введите номер телефона. Код придёт в Telegram.</p>
      <label class="field"><span>Телефон</span><div style="display:flex;gap:8px;align-items:center"><span class="pill" style="height:46px;font-size:15px;padding:0 16px">+998</span><input id="ph" type="tel" inputmode="numeric" maxlength="12" placeholder="Номер телефона" value="${fmtPh(st.digits || '')}" autofocus></div></label>
      <button class="btn primary" id="go" style="width:100%;margin-top:18px" type="submit" disabled>Получить код</button>`);
    const ph = $('#ph'), go = $('#go');
    const upd = () => { go.disabled = (st.digits || '').length !== 9; };
    ph.addEventListener('input', () => { let d = ph.value.replace(/\D/g, ''); if (d.startsWith('998') && d.length > 9) d = d.slice(3); st.digits = d.slice(0, 9); ph.value = fmtPh(st.digits); upd(); });
    upd();
    $('#lf').addEventListener('submit', async e => {
      e.preventDefault(); if (st.digits.length !== 9) return; go.disabled = true;
      try { const r = await api('auth/request', 'POST', { phone: '+998' + st.digits }); renderLogin('', 2, { ...st, left: r.resend_in }); }
      catch (er) { if (er.data?.resend_in) return renderLogin('', 2, { ...st, left: er.data.resend_in }); $('#err').textContent = er.message; go.disabled = false; }
    });
    return;
  }
  $('#root').innerHTML = frame(`<h1>Код из Telegram</h1><p class="muted" style="margin:0">Мы отправили 4-значный код на +998 ${fmtPh(st.digits)}</p>
    <label class="field"><span>${step === 3 ? 'Код 2FA (6 цифр)' : 'Код'}</span><input id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="${step === 3 ? 6 : 4}" style="font-size:26px;letter-spacing:.5em;text-align:center;height:60px" autofocus></label>
    <p class="muted" id="rs" style="text-align:center;font-size:13px;margin:12px 0 0"></p>
    <div style="display:flex;gap:10px;margin-top:14px"><button class="btn" type="button" id="back">Назад</button><button class="btn" type="button" id="resend" disabled>Отправить снова</button></div>`);
  const cd = $('#cd'); let left = st.left || 0, t = null;
  const tick = () => { $('#rs').textContent = left ? `Новый код можно запросить через ${left} сек` : ''; $('#resend').disabled = left > 0; };
  tick(); clearInterval(t); t = setInterval(() => { left = Math.max(0, left - 1); if (!$('#rs')) return clearInterval(t); tick(); if (!left) clearInterval(t); }, 1000);
  $('#back').onclick = () => { clearInterval(t); renderLogin('', 1, { digits: st.digits }); };
  $('#resend').onclick = async () => { try { const r = await api('auth/request', 'POST', { phone: '+998' + st.digits }); left = r.resend_in; tick(); $('#err').textContent = ''; } catch (er) { $('#err').textContent = er.message; } };
  let busy = false;
  const need = step === 3 ? 6 : 4;
  cd.addEventListener('input', async () => {
    cd.value = cd.value.replace(/\D/g, '').slice(0, need);
    if (cd.value.length !== need || busy) return; busy = true;
    try {
      const body = { phone: '+998' + st.digits, code: step === 3 ? st.code : cd.value, ...(step === 3 ? { totp: cd.value } : {}) };
      const r = await api('auth/verify', 'POST', body);
      if (r.need_totp) { busy = false; return renderLogin('', 3, { ...st, code: cd.value }); }
      if (r.choose) { clearInterval(t); return renderChoose(r); }
      clearInterval(t); S.token = r.token; sessionStorage.setItem('atoken', r.token); S.me = null; S.tab = null; render();
    } catch (er) { $('#err').textContent = er.message; cd.value = ''; busy = false; if (step === 3) { /* wrong TOTP: stay */ } }
  });
}

/* the same number holds several roles: pick which one to enter */
function renderChoose(r) {
  $('#root').innerHTML = `<div class="login"><div class="glass box"><div class="brand" style="padding:0"><img class="logo" src="/img/brand.png" alt=""><span>Wendy's</span></div><h1>Войти как</h1><p class="muted" style="margin:0 0 6px">У этого номера несколько ролей</p>
    ${r.choose.map(c => `<button class="btn" style="width:100%;margin-top:12px;justify-content:flex-start" data-id="${c.id}">${esc(ROLE_NAMES[c.role] || c.role)}${c.branch ? ' · ' + esc(c.branch) : ''}</button>`).join('')}<div class="err" id="err"></div></div></div>`;
  $('#root').querySelectorAll('button[data-id]').forEach(b => b.addEventListener('click', async () => {
    try { const x = await api('auth/choose', 'POST', { ticket: r.ticket, id: b.dataset.id }); S.token = x.token; sessionStorage.setItem('atoken', x.token); S.me = null; S.tab = null; render(); }
    catch (er) { $('#err').textContent = er.message; }
  }));
}

/* ---------- views ---------- */
const VIEWS = {};

VIEWS.dashboard = async main => {
  const load = async () => {
    const q = S.branchId ? `?branch_id=${S.branchId}` : '';
    const d = await api('dashboard' + q);
    const delta = d.yesterday.rev ? Math.round((d.today.rev - d.yesterday.rev) / d.yesterday.rev * 100) : null;
    const max = Math.max(1, ...d.series.map(x => x.rev));
    const avg = d.today.n ? d.today.rev / d.today.n : 0;
    $('#dash').innerHTML = `<div class="grid kpis">
      <div class="glass kpi"><small>Выручка сегодня</small><b>${money(d.today.rev)}</b>${delta === null ? '<span class="pill">нет данных за вчера</span>' : `<span class="pill ${delta >= 0 ? 'ok' : 'bad'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% к вчера</span>`}</div>
      <div class="glass kpi"><small>Заказы сегодня</small><b>${d.today.n}</b><span class="pill info">средний чек ${money(avg)}</span></div>
      <div class="glass kpi"><small>Филиалы</small><b>${d.branches.open}<span class="faint" style="font-size:18px"> / ${d.branches.total}</span></b><span class="pill ok">открыто сейчас</span></div>
      ${d.customers !== null ? `<div class="glass kpi"><small>Клиенты</small><b>${d.customers}</b><span class="pill">в базе</span></div>` : ''}</div>
      <div class="grid cols2"><div class="glass card"><h3>Выручка за 7 дней</h3><div class="bars">${d.series.map(x => `<div class="bar"><span>${money(x.rev / 1000)}k</span><div style="height:${Math.max(3, x.rev / max * 78)}%"></div><span>${esc(x.day)}</span></div>`).join('')}</div></div>
      <div class="glass card"><h3>Топ товаров (7 дней)</h3>${d.top.map(t => `<div class="row"><span>${esc(t.name)}</span><b>${t.qty} шт</b></div>`).join('') || '<div class="empty">Пока нет продаж</div>'}
      <h3 style="margin-top:20px">Статусы сегодня</h3>${d.status.map(s => `<div class="row"><span>${STATUS[s.status] || s.status}</span><b>${s.n}</b></div>`).join('') || '<span class="muted">—</span>'}</div></div>`;
  };
  main.innerHTML = head('Дашборд', branchSelect()) + '<div id="dash"></div>';
  S.reload = load; await load(); S.timer = setInterval(load, 20000);
};

const COLS = [['new', 'Новые', 'info'], ['cooking', 'Готовятся', 'warn'], ['ready', 'Готовы', 'ok'], ['delivering', 'В пути', 'info'], ['done', 'Завершены', '']];
VIEWS.orders = async main => {
  const load = async () => {
    const q = S.branchId ? `?branch_id=${S.branchId}` : '';
    const { rows } = await api('orders' + q);
    const ids = new Set(rows.map(o => o.id)); const fresh = new Set();
    if (S.lastOrderIds) rows.forEach(o => { if (!S.lastOrderIds.has(o.id)) fresh.add(o.id); });
    if (fresh.size) toast(`Новых заказов: ${fresh.size}`);
    S.lastOrderIds = ids;
    const card = o => `<div class="oc ${fresh.has(o.id) ? 'fresh' : ''}">
      <div class="h"><b>№${o.id}</b><span class="faint" style="font-size:12px">${esc(String(o.created_at).slice(11, 16))}</span></div>
      <div style="font-size:13px"><span class="pill ${o.type === 'delivery' ? 'info' : 'warn'}">${o.type === 'delivery' ? 'Доставка' : 'В пиццерии'}</span> <span class="pill">${esc(o.payment)}</span></div>
      <ul>${o.items.map(i => `<li>${esc(i.name)} × ${i.qty}</li>`).join('')}</ul>
      <div class="muted" style="font-size:13px">${esc(o.user_name || '')} ${esc(o.phone || '')}<br>${o.type === 'delivery' && o.address ? esc(o.address.address) + (o.address.apartment ? ', кв. ' + esc(o.address.apartment) : '') : esc(o.branch_name || '') + ' · ' + (o.pickup_time === 'asap' ? 'побыстрее' : 'к ' + esc(o.pickup_time))}</div>
      ${o.courier_name ? `<div style="margin-top:6px" class="pill ok">${icon('couriers', 14)} ${esc(o.courier_name)}</div>` : ''}
      <div class="row" style="border:0;padding:8px 0 0"><b>${money(o.total)} so'm</b>${S.me.role === 'super' ? `<span class="faint" style="font-size:12px">${esc(o.branch_name || '')}</span>` : ''}</div></div>`;
    $('#board').innerHTML = COLS.map(([k, t, tone]) => { const list = rows.filter(o => o.status === k); return `<section class="glass col"><h3>${t}<span class="pill ${tone}">${list.length}</span></h3>${list.map(card).join('') || '<div class="faint" style="text-align:center;padding:30px 0;font-size:13px">Пусто</div>'}</section>`; }).join('');
    const nb = $('#obadge'); const n = rows.filter(o => o.status === 'new').length; if (nb) { nb.hidden = !n; nb.textContent = n; }
    $('#cancelled').innerHTML = rows.filter(o => o.status === 'cancelled').length ? `<div class="muted" style="margin:6px">Отменённых: ${rows.filter(o => o.status === 'cancelled').length}</div>` : '';
  };
  main.innerHTML = head('Ход заказов', branchSelect() + '<button class="btn" data-act="reload">Обновить</button>') + '<p class="muted" style="margin:-8px 6px 16px">Только просмотр: заказы принимает и отмечает готовыми POS-система филиала, доставку завершает курьер.</p><div class="board" id="board"></div><div id="cancelled"></div>';
  S.lastOrderIds = null; S.reload = load; await load(); S.timer = setInterval(load, 6000);
};

VIEWS.stock = async main => {
  if (S.me.role === 'super' && !S.branchId) S.branchId = S.branches[0]?.id || '';
  const q = `?branch_id=${S.branchId}`;
  const { rows, categories } = await api('stock' + q);
  main.innerHTML = head('Наличие в филиале', S.me.role === 'super' ? branchSelect(false) : `<span class="pill info">${esc(S.branch?.name || '')}</span>`) +
    categories.map(c => { const items = rows.filter(r => r.category_id === c.id); return items.length ? `<div class="glass card" style="margin-bottom:14px"><h3>${esc(c.name)}</h3>${items.map(p => `<div class="stockrow">${p.image ? `<img src="${esc(p.image)}" alt="">` : '<div class="ph"></div>'}<div class="nm">${esc(p.name)}<div class="faint" style="font-size:12px;font-weight:500">${money(p.price)} so'm</div></div>${p.available ? '' : '<span class="pill bad">нет в наличии</span>'}<div class="sw ${p.available ? 'on' : ''}" data-act="stock" data-pid="${p.id}" data-on="${p.available}" role="switch" tabindex="0"></div></div>`).join('')}</div>` : ''; }).join('');
};

/* branches: list + map */
VIEWS.branches = async main => {
  S.branches = (await api('branches')).rows;
  const view = S.bview || 'list';
  main.innerHTML = head('Филиалы', `<div class="tabs" style="margin:0"><button class="${view === 'list' ? 'on' : ''}" data-act="bview" data-v="list">Список</button><button class="${view === 'map' ? 'on' : ''}" data-act="bview" data-v="map">Карта</button></div><button class="btn primary" data-act="add" data-t="branches">+ Филиал</button>`) +
    (view === 'map' ? '<div class="glass" style="padding:10px"><div id="pick" style="height:560px"></div></div>' : table('branches', S.branches, ['name', 'address', 'phone', 'hours', 'delivery_radius', 'has_pos', 'active']));
  if (view === 'map') {
    const map = newMap('pick').setView([41.3111, 69.2797], 11);
    tiles().addTo(map);
    S.branches.forEach(b => L.marker([b.lat, b.lng], { icon: cabinet(46) }).addTo(map).bindPopup(`<b>${esc(b.name)}</b><br>${esc(b.address)}<br>${esc(b.open_time)}–${esc(b.close_time)}`));
    if (S.branches.length) map.fitBounds(S.branches.map(b => [b.lat, b.lng]), { padding: [40, 40], maxZoom: 13 });
  }
};

/* menu */
VIEWS.menu = async main => {
  S.cats = (await api('categories')).rows;
  const sub = S.sub;
  const tabs = `<div class="tabs">${[['products', 'Товары'], ['categories', 'Категории'], ['stock', 'Наличие по филиалам']].map(([k, t]) => `<button class="${sub === k ? 'on' : ''}" data-act="sub" data-v="${k}">${t}</button>`).join('')}</div>`;
  if (sub === 'stock') { const tmp = document.createElement('div'); S.branchId = S.branchId || S.branches[0]?.id; await VIEWS.stock(tmp); main.innerHTML = tabs + tmp.innerHTML; return; }
  const rows = (await api(sub)).rows;
  main.innerHTML = head('Товары', `<button class="btn primary" data-act="add" data-t="${sub}">+ ${sub === 'products' ? 'Товар' : 'Категория'}</button>`) + tabs + table(sub, rows, sub === 'products' ? ['image', 'name', 'category_id', 'price', 'old_price', 'recommended', 'active'] : ['sort', 'name', 'icon', 'active']);
};

/* banners */
VIEWS.banners = async main => {
  const rows = (await api('banners')).rows;
  main.innerHTML = head('Баннеры', '<button class="btn primary" data-act="add" data-t="banners">+ Загрузить баннер</button>') +
    (rows.length ? `<div class="grid media">${rows.map(b => `<div class="glass mcard"><div class="img" style="background-color:${esc(b.color)};${b.image ? `background-image:url('${esc(b.image)}')` : ''}">${b.image ? '' : esc(b.title)}</div>
      <div class="bd"><b>${esc(b.title) || 'Без названия'}</b><span class="pill ${b.active ? 'ok' : 'bad'}">${b.active ? 'показывается' : 'скрыт'}</span>
      <div class="acts"><button class="btn sm" data-act="edit" data-t="banners" data-id="${b.id}">Изменить</button><button class="btn sm danger" data-act="del" data-t="banners" data-id="${b.id}">Удалить</button></div></div></div>`).join('')}</div>` : '<div class="glass card empty">Баннеров пока нет. Нажмите «Загрузить баннер».</div>');
};
VIEWS.promos = async main => { const rows = (await api('promos')).rows; main.innerHTML = head('Промокоды', '<button class="btn primary" data-act="add" data-t="promos">+ Промокод</button>') + table('promos', rows, ['code', 'percent', 'fixed', 'min_total', 'title', 'active']); };
VIEWS.customers = async main => { const rows = (await api('customers')).rows; main.innerHTML = head(`Клиенты (${rows.length})`) + `<div class="glass scrollx"><table class="tbl"><thead><tr><th>ID</th><th>Телефон</th><th>Имя</th><th>Коины</th><th>Регистрация</th></tr></thead><tbody>${rows.map(u => `<tr><td>${u.id}</td><td>${esc(u.phone)}</td><td>${esc(u.name)}</td><td>${u.coins}</td><td>${esc(u.created_at)}</td></tr>`).join('')}</tbody></table></div>`; };

VIEWS.chats = async main => {
  const { rows } = await api('chats');
  main.innerHTML = head('Чат с клиентами', '<button class="btn" data-act="reload">Обновить</button>') + (rows.length ? `<div class="glass scrollx"><table class="tbl"><thead><tr><th>Клиент</th><th>Последнее</th><th>Новых</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.name || 'Без имени')}<div class="faint">${esc(r.phone)}</div></td><td>${r.last_image ? '📷 ' : ''}${esc(r.last_text)}</td><td>${r.unread ? `<span class="pill bad">${r.unread}</span>` : ''}</td><td class="acts"><button class="btn sm primary" data-act="openchat" data-id="${r.user_id}" data-name="${esc(r.name || r.phone)}">Открыть</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="glass card empty">Сообщений пока нет</div>');
  S.reload = () => VIEWS.chats(main);
};

VIEWS.staff = async main => {
  const { rows } = await api('staff');
  main.innerHTML = head('Команда и роли', '<button class="btn primary" data-act="addstaff">+ Сотрудник</button>') + `<div class="glass scrollx"><table class="tbl"><thead><tr><th>Пользователь</th><th>Роль</th><th>Филиал</th><th>2FA</th><th>Вход</th><th></th></tr></thead><tbody>${rows.map(a => `<tr><td><b>${esc(a.name || '—')}</b><div class="faint">${esc(a.phone)}</div></td><td>${ROLE_NAMES[a.role]}</td><td>${esc(a.branch_name || '—')}</td><td>${a.totp_enabled ? '<span class="pill ok">вкл</span>' : '<span class="pill">нет</span>'}</td><td class="faint">${esc(a.last_login || '—')}</td>
    <td class="acts">${a.id === S.me.id ? '<span class="pill info">это вы</span>' : `<button class="btn sm" data-act="stafftoggle" data-id="${a.id}" data-on="${a.active}">${a.active ? 'Отключить' : 'Включить'}</button> <button class="btn sm danger" data-act="staffdel" data-id="${a.id}">Удалить</button>`}</td></tr>`).join('')}</tbody></table></div>`;
};
VIEWS.audit = async main => { const { rows } = await api('audit'); main.innerHTML = head('Журнал действий', '<button class="btn" data-act="reload">Обновить</button>') + `<div class="glass scrollx"><table class="tbl"><thead><tr><th>Время (UTC)</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Детали</th><th>IP</th></tr></thead><tbody>${rows.map(r => `<tr><td class="faint">${esc(r.created_at)}</td><td>${esc(r.email)}</td><td><span class="pill ${/failed/.test(r.action) ? 'bad' : ''}">${esc(r.action)}</span></td><td>${esc(r.entity)} ${esc(r.entity_id)}</td><td class="muted">${esc(r.detail)}</td><td class="faint">${esc(r.ip)}</td></tr>`).join('')}</tbody></table></div>`; S.reload = () => VIEWS.audit(main); };

VIEWS.security = async main => {
  let settings = '';
  if (S.me.role === 'super') {
    const s = Object.fromEntries((await api('settings')).rows.map(r => [r.key, r.value]));
    settings = `<div class="glass card" style="margin-top:16px"><h3>Системные настройки</h3><form data-form="settings"><div class="g2">
      <label class="field"><span>Название бренда</span><input name="brand" value="${esc(s.brand)}"></label>
      <label class="field"><span>Телефон поддержки</span><input name="support_phone" value="${esc(s.support_phone)}"></label>
      <label class="field"><span>WendyCoin за заказ, %</span><input type="number" name="coin_percent" value="${esc(s.coin_percent)}"></label></div><div style="margin-top:16px"><button class="btn primary" type="submit">Сохранить</button></div></form></div>`;
  }
  main.innerHTML = head('Безопасность') + `<div class="glass card"><h3>Сессия</h3><p class="muted">Вход по коду из Telegram. Автовыход через 30 минут бездействия, максимум 12 часов. Все важные действия записываются в журнал.</p><button class="btn" data-act="logout">Выйти</button></div>${settings}`;
};

/* ---------- delivery: radius on the map + prices per branch ---------- */
VIEWS.delivery = async main => {
  const set = Object.fromEntries((await api('settings')).rows.map(r => [r.key, r.value]));
  S.branches = (await api('branches')).rows;
  main.innerHTML = head('Доставка') + `<div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(280px,1fr);align-items:start">
    <div class="glass" style="padding:10px"><div id="pick" style="height:600px"></div></div>
    <div><div class="glass card" id="dform"><h3>Зона доставки филиала</h3><p class="muted" style="margin:0">Выберите филиал на карте. Нажатие на карту задаёт границу радиуса доставки.</p></div>
    <div class="glass card" style="margin-top:16px"><h3>Цена по умолчанию</h3><form data-form="deliverydef"><label class="field"><span>Доставка, so'm (0 = бесплатно). Применяется там, где у филиала не задана своя цена</span><input type="number" min="0" name="delivery_fee" value="${esc(set.delivery_fee)}"></label><div style="margin-top:14px"><button class="btn primary" type="submit">Сохранить</button></div></form></div></div></div>`;
  const map = newMap('pick').setView([41.3111, 69.2797], 11); tiles().addTo(map);
  const circles = {}, markers = {}; let cur = null;
  const draw = b => { if (circles[b.id]) map.removeLayer(circles[b.id]); circles[b.id] = L.circle([b.lat, b.lng], { radius: b.delivery_radius * 1000, color: '#e2203d', weight: cur === b.id ? 3 : 1.5, fillOpacity: cur === b.id ? .16 : .07 }).addTo(map); };
  S.branches.forEach(b => { draw(b); markers[b.id] = L.marker([b.lat, b.lng], { icon: cabinet(42) }).addTo(map).on('click', () => pick(b.id)); });
  if (S.branches.length) map.fitBounds(S.branches.map(b => [b.lat, b.lng]), { padding: [60, 60], maxZoom: 12 });
  const form = b => {
    $('#dform').innerHTML = `<h3>${esc(b.name || b.address)}</h3><p class="muted" style="margin:-8px 0 0;font-size:13px">${esc(b.address)}</p>
      <form data-form="deliverybranch"><label class="field"><span>Радиус доставки, км (можно кликнуть по карте)</span><input type="number" step="0.5" min="0.5" max="100" name="delivery_radius" value="${b.delivery_radius}"></label>
      <label class="field"><span>Цена доставки, so'm (пусто = цена по умолчанию, 0 = бесплатно)</span><input type="number" min="0" name="delivery_fee" value="${b.delivery_fee >= 0 ? b.delivery_fee : ''}" placeholder="по умолчанию ${esc(set.delivery_fee)}"></label>
      <label class="field"><span>Бесплатно от суммы заказа, so'm (0 = нет)</span><input type="number" min="0" name="free_from" value="${b.free_from || 0}"></label>
      <label class="field"><span>Минимальная сумма заказа, so'm (0 = нет)</span><input type="number" min="0" name="min_order" value="${b.min_order || 0}"></label>
      <div style="margin-top:16px"><button class="btn primary" type="submit">Сохранить</button></div></form>`;
    $('[data-form=deliverybranch]').addEventListener('input', e => { if (e.target.name === 'delivery_radius') { const v = parseFloat(e.target.value); if (v > 0) { b.delivery_radius = v; draw(b); } } });
    $('[data-form=deliverybranch]').addEventListener('submit', async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      try { await api('branches/' + b.id, 'PUT', { delivery_radius: f.delivery_radius, delivery_fee: f.delivery_fee === '' ? -1 : f.delivery_fee, free_from: f.free_from, min_order: f.min_order }); b.delivery_fee = f.delivery_fee === '' ? -1 : Number(f.delivery_fee); b.free_from = Number(f.free_from); b.min_order = Number(f.min_order); toast('Сохранено'); } catch (er) { toast(er.message); }
    });
  };
  const pick = id => { cur = id; S.branches.forEach(draw); form(S.branches.find(b => b.id === id)); };
  map.on('click', e => {
    const b = S.branches.find(x => x.id === cur); if (!b) return;
    const km = Math.max(0.5, Math.round(map.distance([b.lat, b.lng], e.latlng) / 500) / 2);
    b.delivery_radius = km; draw(b); const i = $('[name=delivery_radius]'); if (i) i.value = km;
  });
};

/* ---------- couriers, reviews, WendyCoin, POS ---------- */
VIEWS.couriers = async main => {
  const { rows } = await api('couriers');
  main.innerHTML = head('Курьеры', S.me.role !== 'staff' ? '<button class="btn primary" data-act="addstaff">+ Курьер</button>' : '') + `<div class="glass scrollx"><table class="tbl"><thead><tr><th>Курьер</th><th>Филиал</th><th>Доставлено за месяц</th><th>Всего</th><th>Рейтинг</th><th>Статус</th></tr></thead><tbody>${rows.map(c => `<tr><td><b>${esc(c.name || '—')}</b><div class="faint">${esc(c.phone)}</div></td><td>${esc(c.branch_name || '—')}</td><td><b>${c.month_n}</b></td><td>${c.total_n}</td><td>${c.rating ? '★ ' + c.rating + ` <span class="faint">(${c.reviews})</span>` : '—'}</td><td><span class="pill ${c.active ? 'ok' : 'bad'}">${c.active ? 'активен' : 'отключён'}</span></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">Курьеров пока нет. Добавьте курьера и выберите его филиал.</div></td></tr>'}</tbody></table></div>`;
};
VIEWS.reviews = async main => {
  const { rows } = await api('reviews');
  const avg = rows.length ? (rows.reduce((n, r) => n + r.stars, 0) / rows.length).toFixed(2) : '—';
  main.innerHTML = head('Отзывы клиентов', `<span class="pill info">средняя оценка ${avg}</span>`) + (rows.length ? `<div class="grid media">${rows.map(r => `<div class="glass card"><div class="row" style="border:0;padding:0 0 8px"><b style="color:${r.stars < 3 ? 'var(--bad)' : '#ffc83d'};font-size:20px">${'★'.repeat(r.stars)}<span class="faint">${'★'.repeat(5 - r.stars)}</span></b><span class="faint">№${r.order_id}</span></div><p style="margin:0 0 10px">${esc(r.comment) || '<span class="faint">без комментария</span>'}</p><div class="muted" style="font-size:13px">${esc(r.user_name || r.phone || '')} · ${esc(r.branch_name || '')}${r.courier_name ? ' · курьер ' + esc(r.courier_name) : ''}<br>${esc(r.created_at)}</div></div>`).join('')}</div>` : '<div class="glass card empty">Отзывов пока нет</div>');
};
VIEWS.coins = async main => {
  const d = await api('coins');
  const cs = Object.fromEntries((await api('settings')).rows.map(r => [r.key, r.value]));
  main.innerHTML = head('WendyCoin') + `<div class="glass card" style="margin-bottom:16px"><h3>Настройки WendyCoin</h3><form data-form="coinset"><div class="g2"><label class="field"><span>Начисление за заказ, % от суммы</span><input type="number" min="0" max="100" name="coin_percent" value="${esc(cs.coin_percent)}"></label><label class="field"><span>Стоимость 1 WendyCoin при оплате, so'm</span><input type="number" min="1" name="coin_value" value="${esc(cs.coin_value || 1)}"></label></div><div style="margin-top:14px"><button class="btn primary" type="submit">Сохранить</button></div></form></div>`
    + `<div class="grid kpis"><div class="glass kpi"><small>Коинов у клиентов</small><b>${money(d.total)}</b><span class="pill info">в обороте</span></div>
    <div class="glass kpi"><small>Товаров для обмена</small><b>${d.products.filter(p => p.coin_price > 0).length}</b><span class="pill">из ${d.products.length}</span></div></div>
    <div class="grid cols2"><div class="glass card"><h3>Баланс клиентов</h3><div class="scrollx"><table class="tbl"><thead><tr><th>Клиент</th><th>WendyCoin</th><th></th></tr></thead><tbody>${d.customers.map(u => `<tr><td>${esc(u.name || 'Без имени')}<div class="faint">${esc(u.phone)}</div></td><td><b>${money(u.coins)}</b></td><td class="acts"><button class="btn sm" data-act="coinadj" data-id="${u.id}" data-name="${esc(u.name || u.phone)}">Изменить</button></td></tr>`).join('') || '<tr><td colspan="3"><div class="empty">Клиентов нет</div></td></tr>'}</tbody></table></div></div>
    <div class="glass card"><h3>Обмен на товары</h3><p class="muted" style="margin-top:0">Укажите цену в WendyCoin в карточке товара — клиент увидит кнопку «Обменять».</p>${d.products.map(p => `<div class="row"><span>${esc(p.name)}<div class="faint" style="font-size:12px">${money(p.price)} so'm</div></span><span style="display:flex;align-items:center;gap:8px">${p.coin_price > 0 ? `<span class="pill warn">${p.coin_price} W</span>` : '<span class="faint">нет</span>'}<button class="btn sm" data-act="coinprice" data-id="${p.id}">Цена</button></span></div>`).join('')}</div></div>
    <div class="glass card" style="margin-top:16px"><h3>История операций</h3><div class="scrollx"><table class="tbl"><thead><tr><th>Время (UTC)</th><th>Клиент</th><th>Сумма</th><th>Причина</th></tr></thead><tbody>${d.log.map(l => `<tr><td class="faint">${esc(l.created_at)}</td><td>${esc(l.phone || '')}</td><td><b style="color:${l.delta > 0 ? 'var(--ok)' : 'var(--bad)'}">${l.delta > 0 ? '+' : ''}${l.delta}</b></td><td class="muted">${esc(l.reason)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">Операций нет</div></td></tr>'}</tbody></table></div></div>`;
};
VIEWS.pos = async main => {
  const rows = (await api('branches')).rows; const origin = location.origin; const ck = (await api('catalog-key')).has;
  main.innerHTML = head('POS-интеграция', `<a class="btn" href="/pos/" target="_blank" rel="noopener">Открыть встроенный POS-терминал</a>`) +
    `<div class="glass scrollx"><table class="tbl"><thead><tr><th>Филиал</th><th>Статус</th><th></th></tr></thead><tbody>${rows.map(b => `<tr><td><b>${esc(b.name || b.address)}</b><div class="faint">${esc(b.address)}</div></td><td>${b.has_pos ? '<span class="pill ok">ключ выдан</span>' : '<span class="pill">нет ключа</span>'}</td><td class="acts"><button class="btn sm primary" data-act="poskey" data-id="${b.id}">${b.has_pos ? 'Перевыпустить ключ' : 'Создать ключ'}</button>${b.has_pos ? ` <button class="btn sm danger" data-act="posrevoke" data-id="${b.id}">Отозвать</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="glass card" style="margin-top:16px"><h3>Перенос товаров из POS на сайт</h3><p class="muted" style="margin-top:0">Касса одним запросом передаёт все категории и товары (цены, фото-ссылки, допы). Для этого нужен отдельный ключ синхронизации — он общий для всего меню.</p>
    <div id="catkey" style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${ck ? '<span class="pill ok">ключ выдан</span>' : '<span class="pill">нет ключа</span>'}<button class="btn sm primary" data-act="catkey">${ck ? 'Перевыпустить ключ' : 'Создать ключ'}</button>${ck ? '<button class="btn sm danger" data-act="catkeyoff">Отозвать</button>' : ''}</div>
    <div class="code">PUT ${origin}/api/pos/catalog  (заголовок X-Catalog-Key)<br>{ "full_sync": true,<br>&nbsp;"categories": [ { "external_id": "c1", "name": "Хот-доги", "sort": 1 } ],<br>&nbsp;"products": [ { "external_id": "p10", "name": "Хот-дог", "price": 25000, "category_external_id": "c1",<br>&nbsp;&nbsp;"description": "...", "image": "https://...", "addons": ["p20", "p21"] } ] }</div>
    <p class="muted">Повторная отправка обновляет товары по external_id. С <b>full_sync: true</b> товары, которых нет в списке, скрываются. Ответ содержит число созданных/обновлённых позиций и список ошибок.</p></div>
    <div class="glass card" style="margin-top:16px"><h3>Как подключить кассу (API)</h3><p class="muted" style="margin-top:0">Каждая касса использует свой ключ в заголовке <b>X-POS-Key</b>. Ключ видит только его филиал.</p>
    <div class="code">GET  ${origin}/api/pos/orders            — новые, готовящиеся и готовые заказы<br>POST ${origin}/api/pos/orders/{номер}/accept   — «Принять» → клиенту: «Заказ принят»<br>POST ${origin}/api/pos/orders/{номер}/ready    — «Готов» → клиенту и курьерам филиала<br>POST ${origin}/api/pos/orders/{номер}/complete — выдан клиенту (самовывоз)</div>
    <p class="muted">В ответе на GET: номер заказа, состав (название, количество, цена, сумма), итог, оплата, клиент.</p><div class="code">curl -H "X-POS-Key: wpos_..." ${origin}/api/pos/orders</div></div>`;
};

/* ---------- generic tables / forms ---------- */
const COLN = { delivery_radius: 'Радиус', has_pos: 'POS', coin_price: 'WendyCoin', name: 'Название', address: 'Адрес', phone: 'Телефон', hours: 'Часы', active: 'Статус', sort: '№', icon: 'Иконка', image: 'Фото', category_id: 'Категория', price: 'Цена', old_price: 'Старая', recommended: 'Кстати', title: 'Заголовок', code: 'Код', percent: '%', fixed: 'Фикс.', min_total: 'Мин. сумма' };
function cell(t, f, r) {
  const v = r[f];
  if (f === 'active') return `<span class="pill ${v ? 'ok' : 'bad'}">${v ? 'активен' : 'скрыт'}</span>`;
  if (f === 'recommended') return v ? '<span class="pill info">да</span>' : '';
  if (f === 'image') return v ? `<img src="${esc(v)}" alt="">` : '<span class="faint">—</span>';
  if (f === 'category_id') return esc(S.cats.find(c => c.id === v)?.name || '');
  if (f === 'delivery_radius') return `${v} км`;
  if (f === 'has_pos') return v ? '<span class="pill ok">подключён</span>' : '<span class="pill">нет</span>';
  if (f === 'hours') return `${esc(r.open_time)} – ${esc(r.close_time)}`;
  if (['price', 'old_price', 'fixed', 'min_total'].includes(f)) return v ? money(v) : '—';
  return esc(v);
}
function table(t, rows, cols) {
  return `<div class="glass scrollx"><table class="tbl"><thead><tr>${cols.map(c => `<th>${COLN[c] || c}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${cell(t, c, r)}</td>`).join('')}<td class="acts"><button class="btn sm" data-act="edit" data-t="${t}" data-id="${r.id}">Изменить</button> <button class="btn sm danger" data-act="del" data-t="${t}" data-id="${r.id}">Удалить</button></td></tr>`).join('') || `<tr><td colspan="${cols.length + 1}"><div class="empty">Пока пусто</div></td></tr>`}</tbody></table></div>`;
}
const ICONS = ['combo', 'burger', 'fries', 'cup', 'dessert'];
const SCHEMA = {
  branches: { title: 'Филиал', cls: 'g2', f: [['name', 'Название', 'text'], ['city', 'Город', 'text'], ['address', 'Адрес', 'text'], ['phone', 'Телефон', 'text'], ['open_time', 'Открывается', 'time'], ['close_time', 'Закрывается (00:00 = полночь)', 'time'], ['delivery_radius', 'Радиус доставки, км', 'number'], ['lat', 'Широта', 'number'], ['lng', 'Долгота', 'number'], ['_map', '', 'map'], ['active', 'Активен', 'check']] },
  categories: { title: 'Категория', f: [['name', 'Название', 'text'], ['name_uz', 'Название на узбекском', 'text'], ['icon', 'Иконка по умолчанию', 'select', ICONS], ['sort', 'Порядок', 'number'], ['active', 'Показывать', 'check']] },
  products: { title: 'Товар', f: [['name', 'Название', 'text'], ['category_id', 'Категория', 'cat'], ['description', 'Описание', 'textarea'], ['name_uz', 'Название на узбекском (необязательно)', 'text'], ['description_uz', 'Описание на узбекском (необязательно)', 'textarea'], ['price', "Цена, so'm", 'number'], ['old_price', 'Старая цена (0 = нет)', 'number'], ['coin_price', 'Цена в WendyCoin (0 = нельзя обменять)', 'number'], ['badge', 'Плашка (напр. «до -35%»)', 'text'], ['image', 'Фото товара', 'image'], ['big', 'Большая карточка', 'check'], ['addons', 'С этим берут (до 8 товаров: соусы, напитки…)', 'addons'], ['recommended', 'В «Всегда кстати»', 'check'], ['sort', 'Порядок', 'number'], ['active', 'Показывать', 'check']] },
  banners: { title: 'Баннер', f: [['title', 'Заголовок', 'text'], ['title_uz', 'Заголовок на узбекском', 'text'], ['image', 'Картинка баннера', 'image'], ['color', 'Цвет фона (если нет картинки)', 'color'], ['sort', 'Порядок', 'number'], ['active', 'Показывать', 'check']] },
  promos: { title: 'Промокод', f: [['code', 'Код', 'text'], ['percent', 'Скидка, %', 'number'], ['fixed', "Или фикс. скидка, so'm", 'number'], ['min_total', 'Минимальная сумма заказа', 'number'], ['title', 'Заголовок акции для клиента, напр. «Скидка 10%» (пусто = не показывать в профиле)', 'text'], ['info', 'Подпись над заголовком, напр. «НА ЛЮБОЙ ТИП ЗАКАЗА»', 'text'], ['title_uz', 'Заголовок на узбекском', 'text'], ['info_uz', 'Подпись на узбекском', 'text'], ['valid_until', 'Действует до (пусто = без срока)', 'date'], ['active', 'Активен', 'check']] },
};
const DEFAULTS = { active: 1, sort: 0, lat: 41.3111, lng: 69.2797, open_time: '10:00', close_time: '23:30', city: 'Ташкент', icon: 'burger', color: '#e2203d' };

async function editForm(t, row) {
  const sc = SCHEMA[t]; const d = { ...DEFAULTS, ...(row || {}) };
  if (!row && t === 'products') d.category_id = S.cats[0]?.id;
  if (t === 'products' && !S.cats.length) S.cats = (await api('categories')).rows;
  const ALL = t === 'products' ? (await api('products')).rows : [];
  const fields = sc.f.map(([f, label, type, extra]) => {
    const v = d[f] ?? '';
    if (type === 'check') return `<label class="check"><span class="sw ${v ? 'on' : ''}" data-sw="${f}"></span><span>${label}</span><input type="hidden" name="${f}" value="${v ? 1 : 0}"></label>`;
    if (type === 'textarea') return `<label class="field"><span>${label}</span><textarea name="${f}" rows="3">${esc(v)}</textarea></label>`;
    if (type === 'select') return `<label class="field"><span>${label}</span><select name="${f}">${extra.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
    if (type === 'cat') return `<label class="field"><span>${label}</span><select name="${f}">${S.cats.map(c => `<option value="${c.id}" ${c.id == v ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`;
    if (type === 'image') return `<div class="field"><span>${label}</span><div class="imgpick"><button type="button" class="btn sm" data-act="pickfile">Загрузить с компьютера</button><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-file="${f}"><input type="text" name="${f}" value="${esc(v)}" placeholder="или вставьте ссылку https://..." inputmode="url"></div><img class="preview" data-prev="${f}" src="${esc(v)}" alt="" ${v ? '' : 'hidden'}></div>`;
    if (type === 'addons') return `<div class="field"><span>${label}</span><div class="addon-list">${ALL.filter(p => p.id !== row?.id).map(p => `<label class="addon"><input type="checkbox" name="addons" value="${p.id}" ${(d.addons || []).includes(p.id) ? 'checked' : ''}><span>${esc(p.name)}</span><small>${money(p.price)}</small></label>`).join('') || '<div class="faint" style="padding:10px">Других товаров пока нет</div>'}</div><div class="faint" style="margin:6px 14px;font-size:12px">Клиент увидит отмеченные товары в карточке этого товара и сможет добавить их в корзину за их цену.</div></div>`;
    if (type === 'map') return '<div class="field" style="grid-column:1/-1"><span>Точка на карте (перетащите маркер или нажмите на карту)</span><div id="pick"></div></div>';
    return `<label class="field"><span>${label}</span><input name="${f}" type="${type === 'number' ? 'number' : type === 'color' ? 'color' : type === 'time' ? 'time' : type === 'date' ? 'date' : 'text'}" ${type === 'number' ? 'step="any"' : ''} value="${esc(v)}"></label>`;
  }).join('');
  const o = overlay(`<form class="glass modal" id="ef"><h2>${row ? 'Изменить' : 'Добавить'}: ${sc.title}</h2><div class="${sc.cls || ''}">${fields}</div><div class="err" id="fe"></div><div class="foot"><button type="button" class="btn" data-act="cancel">Отмена</button><button class="btn primary" type="submit">Сохранить</button></div></form>`);
  o.addEventListener('click', e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'cancel' || e.target === o) o.remove();
    if (a === 'pickfile') e.target.closest('.imgpick').querySelector('input[type=file]').click();
    const sw = e.target.closest('[data-sw]'); if (sw) { sw.classList.toggle('on'); sw.nextElementSibling.nextElementSibling.value = sw.classList.contains('on') ? 1 : 0; }
  });
  const setPreview = (f, url) => { const p = $(`[data-prev="${f}"]`, o); if (p) { p.src = url; p.hidden = !url; } };
  o.addEventListener('input', e => { const n = e.target.name; if (n && $(`[data-prev="${n}"]`, o)) setPreview(n, e.target.value.trim()); });
  o.addEventListener('change', e => {
    const f = e.target.dataset?.file; if (!f || !e.target.files[0]) return;
    const rd = new FileReader();
    rd.onload = async () => { try { const r = await api('upload', 'POST', { data: rd.result }); $(`input[name="${f}"]`, o).value = r.url; setPreview(f, r.url); } catch (er) { $('#fe', o).textContent = er.message; } };
    rd.readAsDataURL(e.target.files[0]);
  });
  if (t === 'branches') {
    const lat = Number(d.lat), lng = Number(d.lng);
    const map = newMap($('#pick', o)).setView([lat, lng], 13);
    tiles().addTo(map);
    const mk = L.marker([lat, lng], { draggable: true, icon: cabinet(44) }).addTo(map);
    const setLL = ll => { $('[name=lat]', o).value = ll.lat.toFixed(6); $('[name=lng]', o).value = ll.lng.toFixed(6); };
    mk.on('dragend', () => setLL(mk.getLatLng())); map.on('click', e => { mk.setLatLng(e.latlng); setLL(e.latlng); });
    ['lat', 'lng'].forEach(n => $(`[name=${n}]`, o).addEventListener('change', () => { const a = parseFloat($('[name=lat]', o).value), b = parseFloat($('[name=lng]', o).value); if (isFinite(a) && isFinite(b)) { mk.setLatLng([a, b]); map.panTo([a, b]); } }));
    setTimeout(() => map.invalidateSize(), 80);
  }
  $('#ef', o).addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target); const body = {}; for (const [k, v] of fd) if (k !== 'addons') body[k] = v;
    if (t === 'products') { body.addons = fd.getAll('addons').map(Number); if (body.addons.length > 8) { $('#fe', o).textContent = 'Можно выбрать не больше 8 товаров'; return; } }
    try { await api(row ? `${t}/${row.id}` : t, row ? 'PUT' : 'POST', body); o.remove(); toast('Сохранено'); loadTab(); } catch (er) { $('#fe', o).textContent = er.message; }
  });
}

/* ---------- chat modal ---------- */
function openChat(uid, name) {
  const o = overlay(`<div class="glass modal"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h2>${esc(name)}</h2><button class="btn sm" data-act="cancel">Закрыть</button></div><div class="chat" id="cl"></div>
    <div style="display:flex;gap:8px;margin-top:12px;align-items:center"><input id="ct" placeholder="Ответ клиенту" maxlength="1000"><button class="btn icon" data-act="cattach" title="Фото">＋</button><input type="file" id="cf" accept="image/png,image/jpeg,image/webp" hidden><button class="btn primary" data-act="csend">Отправить</button></div><div class="err" id="ce"></div></div>`);
  const list = $('#cl', o);
  const draw = async () => { try { const { messages } = await api('chats/' + uid); const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 80; list.innerHTML = messages.map(m => `<div class="cb ${m.sender === 'admin' ? 'adm' : ''}">${m.image ? `<a href="${esc(m.image)}" target="_blank" rel="noopener"><img src="${esc(m.image)}" alt=""></a>` : ''}${esc(m.text)}<small>${esc(String(m.created_at).slice(5, 16))}</small></div>`).join(''); if (stick) list.scrollTop = list.scrollHeight; } catch { /* retry */ } };
  draw(); const t = setInterval(draw, 4000);
  const close = () => { clearInterval(t); o.remove(); loadTab(); };
  const send = async image => { const text = $('#ct', o).value.trim(); if (!text && !image) return; try { await api('chats/' + uid, 'POST', { text, image }); $('#ct', o).value = ''; $('#ce', o).textContent = ''; draw(); } catch (e) { $('#ce', o).textContent = e.message; } };
  o.addEventListener('click', e => { const a = e.target.closest('[data-act]')?.dataset.act; if (a === 'cancel' || e.target === o) close(); if (a === 'csend') send(); if (a === 'cattach') $('#cf', o).click(); });
  $('#ct', o).addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  $('#cf', o).addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => send(rd.result); rd.readAsDataURL(f); e.target.value = ''; });
}

/* ---------- staff modals ---------- */
function staffForm() {
  const isSuper = S.me.role === 'super';
  const o = overlay(`<form class="glass modal" id="sf"><h2>Новый сотрудник</h2><div class="g2"><label class="field"><span>Имя</span><input name="name"></label><label class="field"><span>Телефон (+998…)</span><input name="phone" type="tel" inputmode="numeric" placeholder="+998 90 123 45 67" required></label>
    ${isSuper ? `<label class="field"><span>Роль</span><select name="role"><option value="manager">Менеджер филиала</option><option value="courier">Курьер</option><option value="staff">Сотрудник</option><option value="super">Super Admin</option></select></label><label class="field"><span>Филиал</span><select name="branch_id">${S.branches.map(b => `<option value="${b.id}">${esc(b.name || b.address)}</option>`).join('')}</select></label>` : `<label class="field"><span>Роль</span><select name="role"><option value="courier">Курьер</option><option value="staff">Сотрудник</option></select></label><div class="muted" style="margin-top:14px">Будет добавлен в ваш филиал${S.branch ? ' «' + esc(S.branch.name) + '»' : ''}.</div>`}
<div class="muted" style="grid-column:1/-1;margin-top:12px;font-size:13px">Вход по этому номеру: код придёт в Telegram. Курьеры работают в приложении по адресу /courier/</div></div><div class="err" id="fe"></div><div class="foot"><button type="button" class="btn" data-act="cancel">Отмена</button><button class="btn primary" type="submit">Создать</button></div></form>`);
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-act=cancel]')) o.remove(); });
  $('#sf', o).addEventListener('submit', async e => { e.preventDefault(); try { const body = Object.fromEntries(new FormData(e.target)); body.phone = '+998' + body.phone.replace(/\D/g, '').replace(/^998/, ''); await api('staff', 'POST', body); o.remove(); toast('Сотрудник создан'); loadTab(); } catch (er) { $('#fe', o).textContent = er.message; } });
}

/* ---------- actions ---------- */
const ACT = {
  nav: el => { S.tab = el.dataset.tab; S.lastOrderIds = null; render(); },
  logout: async () => { try { await api('auth/logout', 'POST'); } catch { /* ignore */ } signOut(); },
  theme: () => { const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); const n = cur === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = n; try { localStorage.setItem('theme', n); } catch { /* ignore */ } },
  reload: () => (S.reload ? S.reload() : loadTab()),
  sub: el => { S.sub = el.dataset.v; loadTab(); },
  bview: el => { S.bview = el.dataset.v; loadTab(); },
  add: el => editForm(el.dataset.t, null),
  edit: async el => { const rows = (await api(el.dataset.t)).rows; editForm(el.dataset.t, rows.find(r => r.id == el.dataset.id)); },
  del: async el => { if (!(await ask('Удалить?', 'Это действие нельзя отменить.', 'Удалить'))) return; try { await api(`${el.dataset.t}/${el.dataset.id}`, 'DELETE', null, true); toast('Удалено'); loadTab(); } catch (e) { toast(e.message); } },
  ostatus_disabled: async el => {
    const id = el.closest('[data-oid]').dataset.oid, s = el.dataset.s;
    if (s === 'cancelled' && !(await ask('Отменить заказ?', `Заказ №${id} будет отменён.`, 'Отменить заказ'))) return;
    try { await api('orders/' + id, 'PUT', { status: s }); S.reload(); } catch (e) { toast(e.message); }
  },
  stock: async el => { const on = el.dataset.on === '1'; try { await api('stock', 'PUT', { branch_id: S.branchId, product_id: el.dataset.pid, available: on ? 0 : 1 }); loadTab(); } catch (e) { toast(e.message); } },
  addstaff: () => staffForm(),
  poskey: async el => {
    if (!(await ask('Выдать новый ключ?', 'Старый ключ этого филиала перестанет работать. Новый ключ будет показан один раз.', 'Выдать ключ', false))) return;
    try { const r = await api(`branches/${el.dataset.id}/pos-key`, 'POST', {}, true); const o = overlay(`<div class="glass modal"><h2>Ключ POS</h2><p class="muted">Скопируйте и сохраните ключ в кассе. После закрытия окна он больше не будет показан.</p><div class="code" id="kk">${esc(r.key)}</div><div class="foot"><button class="btn" data-act="copykey">Скопировать</button><button class="btn primary" data-act="cancel">Готово</button></div></div>`); o.addEventListener('click', async e => { const a = e.target.closest('[data-act]')?.dataset.act; if (a === 'copykey') { try { await navigator.clipboard.writeText(r.key); toast('Скопировано'); } catch { toast('Выделите и скопируйте вручную'); } } if (a === 'cancel' || e.target === o) { o.remove(); loadTab(); } }); } catch (e) { toast(e.message); }
  },
  catkey: async () => {
    if (!(await ask('Выдать ключ синхронизации?', 'Старый ключ перестанет работать. Новый будет показан один раз.', 'Выдать', false))) return;
    try { const r = await api('catalog-key', 'POST', {}, true); const o = overlay(`<div class="glass modal"><h2>Ключ синхронизации меню</h2><p class="muted">Сохраните ключ в POS. Больше он показан не будет.</p><div class="code">${esc(r.key)}</div><div class="foot"><button class="btn" data-act="copykey">Скопировать</button><button class="btn primary" data-act="cancel">Готово</button></div></div>`); o.addEventListener('click', async e => { const a = e.target.closest('[data-act]')?.dataset.act; if (a === 'copykey') { try { await navigator.clipboard.writeText(r.key); toast('Скопировано'); } catch { toast('Выделите и скопируйте вручную'); } } if (a === 'cancel' || e.target === o) { o.remove(); loadTab(); } }); } catch (e) { toast(e.message); }
  },
  catkeyoff: async () => { if (!(await ask('Отозвать ключ?', 'Касса больше не сможет обновлять меню.', 'Отозвать'))) return; try { await api('catalog-key', 'DELETE', null, true); loadTab(); } catch (e) { toast(e.message); } },
  posrevoke: async el => { if (!(await ask('Отозвать ключ?', 'Касса филиала потеряет доступ к заказам.', 'Отозвать'))) return; try { await api(`branches/${el.dataset.id}/pos-key`, 'DELETE', null, true); loadTab(); } catch (e) { toast(e.message); } },
  coinadj: el => {
    const o = overlay(`<form class="glass modal" id="cf2"><h2>Баланс WendyCoin</h2><p class="muted">${esc(el.dataset.name)}</p><label class="field"><span>Изменение (например 100 или -50)</span><input name="delta" type="number" step="1" required></label><label class="field"><span>Причина</span><input name="reason" maxlength="120" placeholder="Подарок / компенсация"></label><div class="err" id="fe"></div><div class="foot"><button type="button" class="btn" data-act="cancel">Отмена</button><button class="btn primary" type="submit">Применить</button></div></form>`);
    o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-act=cancel]')) o.remove(); });
    $('#cf2', o).addEventListener('submit', async e => { e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); try { await api('coins/adjust', 'POST', { user_id: el.dataset.id, delta: Number(b.delta), reason: b.reason }, true); o.remove(); toast('Баланс обновлён'); loadTab(); } catch (er) { $('#fe', o).textContent = er.message; } });
  },
  coinprice: async el => { const rows = (await api('products')).rows; editForm('products', rows.find(r => r.id == el.dataset.id)); },
  stafftoggle: async el => { const on = el.dataset.on === '1'; if (on && !(await ask('Отключить доступ?', 'Сотрудник не сможет войти.', 'Отключить'))) return; try { await api('staff/' + el.dataset.id, 'PUT', { active: on ? 0 : 1 }); loadTab(); } catch (e) { toast(e.message); } },
  staffdel: async el => { if (!(await ask('Удалить сотрудника?', 'Доступ будет закрыт навсегда.', 'Удалить'))) return; try { await api('staff/' + el.dataset.id, 'DELETE', null, true); loadTab(); } catch (e) { toast(e.message); } },
  openchat: el => openChat(el.dataset.id, el.dataset.name),
  tfaon: async () => {
    const r = await api('auth/2fa/setup', 'POST');
    $('#tfa').innerHTML = `<p class="muted">Добавьте ключ в Google Authenticator / 1Password / Authy («ввести ключ вручную»):</p><div class="code">${esc(r.secret)}</div><div class="code" style="font-size:12px">${esc(r.uri)}</div>
      <label class="field"><span>Код из приложения</span><input id="tcode" inputmode="numeric" maxlength="6"></label><div class="err" id="terr"></div><button class="btn primary" data-act="tfaconfirm">Включить</button>`;
  },
  tfaconfirm: async () => { try { await api('auth/2fa/enable', 'POST', { code: $('#tcode').value }); S.me.totp_enabled = true; toast('2FA включена'); loadTab(); } catch (e) { $('#terr').textContent = e.message; } },
  tfaoff: async () => { const code = prompt('Для отключения введите текущий код 2FA (6 цифр):'); if (!code) return; try { await api('auth/2fa/disable', 'POST', { code }); S.me.totp_enabled = false; toast('2FA отключена'); loadTab(); } catch (e) { toast(e.message); } },
};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && ACT[el.dataset.act] && !el.closest('.overlay')) ACT[el.dataset.act](el, e); });
document.addEventListener('change', e => { if (e.target.dataset?.change === 'branch') { S.branchId = e.target.value; S.lastOrderIds = null; loadTab(); } });
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.sw[data-act]')) { e.preventDefault(); e.target.click(); } });
document.addEventListener('submit', async e => {
  const f = e.target.dataset?.form; if (!f) return; e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    if (f === 'coinset' || f === 'deliverydef') { if (!(await ask('Сохранить настройки?', 'Изменения сразу применятся в приложении.', 'Сохранить', false))) return; await api('settings', 'PUT', body, true); toast('Сохранено'); return; }
    if (f === 'settings') { if (!(await ask('Сохранить настройки?', 'Изменения сразу применятся в приложении.', 'Сохранить', false))) return; await api('settings', 'PUT', body, true); toast('Сохранено'); }
  } catch (er) { const x = $('#pwerr'); if (x) x.textContent = er.message; else toast(er.message); }
});
try { const t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* ignore */ }
render();
