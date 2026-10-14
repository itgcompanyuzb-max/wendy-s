/* Courier app: phone + Telegram code login, ready-order alerts, route to the customer, live GPS. */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
const S = { token: sessionStorage.getItem('ctoken') || '', me: null, data: null, seen: null, timer: null, geo: null, pos: null, lastSent: 0, map: null, mk: {}, line: null, routeAt: 0, idle: null, activeId: null };
let MAPKEY = '';
fetch('/api/menu').then(r => r.json()).then(m => { MAPKEY = m.settings.yandex_key || ''; }).catch(() => { });
const tiles = () => (MAPKEY ? L.tileLayer(`https://tiles.api-maps.yandex.ru/v1/tiles/?lang=ru_RU&x={x}&y={y}&z={z}&l=map&apikey=${MAPKEY}`, { maxZoom: 19 }) : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }));

async function api(path, method = 'GET', body) {
  const r = await fetch('/api/admin/' + path, { method, headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith('auth/request') && !path.startsWith('auth/verify')) { signOut(j.error); throw new Error(j.error || 'Сессия истекла'); }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Ошибка'), { data: j });
  return j;
}
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2800); }
function beep() { try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 760; g.gain.value = .1; o.start(); setTimeout(() => { o.frequency.value = 980; }, 160); setTimeout(() => { o.stop(); c.close(); }, 380); } catch { /* ignore */ } try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ } }
function signOut(msg) { clearInterval(S.timer); if (S.geo != null) navigator.geolocation.clearWatch(S.geo); S.geo = null; S.token = ''; S.me = null; S.data = null; sessionStorage.removeItem('ctoken'); login(msg); }
function bumpIdle() { clearTimeout(S.idle); if (S.token) S.idle = setTimeout(() => signOut('Вы вышли из-за неактивности'), 29 * 60 * 1000); }
['click', 'touchstart', 'keydown'].forEach(e => document.addEventListener(e, bumpIdle, { passive: true }));

/* ---------- login ---------- */
const fmtPh = d => [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
function login(msg, step = 1, st = {}) {
  const frame = inner => `<div class="login"><form class="glass box" id="lf" autocomplete="off"><div class="brand" style="padding:0"><img class="logo" src="/img/brand.png" alt=""><span>Курьер</span></div>${inner}<div class="err" id="err">${esc(msg || '')}</div></form></div>`;
  if (step === 1) {
    $('#root').innerHTML = frame(`<h1>Вход</h1><p class="muted" style="margin:0">Введите номер телефона. Код придёт в Telegram.</p>
      <label class="field"><span>Телефон</span><div style="display:flex;gap:8px;align-items:center"><span class="pill" style="height:46px;font-size:15px;padding:0 16px">+998</span><input id="ph" type="tel" inputmode="numeric" maxlength="12" placeholder="Номер телефона" value="${fmtPh(st.digits || '')}"></div></label>
      <button class="btn primary" id="go" style="width:100%;margin-top:18px" disabled>Получить код</button>`);
    const ph = $('#ph'), go = $('#go');
    const upd = () => { go.disabled = (st.digits || '').length !== 9; };
    ph.addEventListener('input', () => { let d = ph.value.replace(/\D/g, ''); if (d.startsWith('998') && d.length > 9) d = d.slice(3); st.digits = d.slice(0, 9); ph.value = fmtPh(st.digits); upd(); }); upd();
    $('#lf').addEventListener('submit', async e => { e.preventDefault(); if (st.digits.length !== 9) return; go.disabled = true; try { await api('auth/request', 'POST', { phone: '+998' + st.digits, app: 'courier' }); login('', 2, st); } catch (er) { if (er.data?.resend_in) return login('', 2, st); $('#err').textContent = er.message; go.disabled = false; } });
    return;
  }
  $('#root').innerHTML = frame(`<h1>Код из Telegram</h1><p class="muted" style="margin:0">4-значный код отправлен на +998 ${fmtPh(st.digits)}</p>
    <label class="field"><span>Код</span><input id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="4" style="font-size:26px;letter-spacing:.5em;text-align:center;height:60px" autofocus></label>
    <div style="margin-top:14px"><button class="btn" type="button" id="back">Назад</button></div>`);
  $('#back').onclick = () => login('', 1, { digits: st.digits });
  let busy = false;
  $('#cd').addEventListener('input', async e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (e.target.value.length !== 4 || busy) return; busy = true;
    try {
      const r = await api('auth/verify', 'POST', { phone: '+998' + st.digits, code: e.target.value, app: 'courier' });
      if (r.choose) {
        $('#root').innerHTML = `<div class="login"><div class="glass box"><h1>Выберите филиал</h1>${r.choose.map(c => `<button class="btn" style="width:100%;margin-top:12px" data-id="${c.id}">Курьер${c.branch ? ' · ' + esc(c.branch) : ''}</button>`).join('')}<div class="err" id="err"></div></div></div>`;
        $('#root').querySelectorAll('button[data-id]').forEach(b => b.addEventListener('click', async () => { try { const x = await api('auth/choose', 'POST', { ticket: r.ticket, id: b.dataset.id }); S.token = x.token; sessionStorage.setItem('ctoken', x.token); init(); } catch (er) { $('#err').textContent = er.message; } }));
        return;
      }
      S.token = r.token; sessionStorage.setItem('ctoken', r.token); init();
    }
    catch (er) { $('#err').textContent = er.message; e.target.value = ''; busy = false; }
  });
}

/* ---------- main ---------- */
async function init() {
  try {
    const me = (await api('auth/me')).admin;
    if (me.role !== 'courier') { signOut('Этот вход только для курьеров'); return; }
    S.me = me; S.profile = await api('courier/me');
  } catch { return; }
  bumpIdle(); await refresh(true); clearInterval(S.timer); S.timer = setInterval(() => refresh(false), 5000);
}
async function refresh(first) {
  try {
    const d = await api('courier/orders'); const ids = new Set(d.available.map(o => o.id));
    if (S.seen && d.available.some(o => !S.seen.has(o.id))) { beep(); toast('Новый заказ готов к выдаче!'); }
    S.seen = ids; S.data = d;
    const key = [...ids].join(',');
    if (!first && !d.mine.length && !S.activeId && key === S.listKey) return;
    S.listKey = key;
    if (first || d.mine[0]?.id !== S.activeId || !$('#cmap') && d.mine.length) draw(); else if (!d.mine.length) drawList(); else tick();
  } catch { /* retry */ }
}
const itemsHtml = o => `<ul>${o.items.map(i => `<li>${esc(i.name)} × ${i.qty}</li>`).join('')}</ul>`;
function shell(inner) {
  const p = S.profile;
  $('#root').innerHTML = `<div class="cwrap"><div class="chead"><img src="/img/brand.png" alt="" style="width:44px;height:44px;object-fit:contain"><div><b style="font-size:18px">${esc(p.name || 'Курьер')}</b><div class="muted" style="font-size:13px">${esc(p.branch?.name || '')}</div></div><span class="sp"></span><button class="btn sm" data-act="out">Выйти</button></div>
    <div class="stat3"><div class="glass"><b>${p.stats.month_n}</b><small>за месяц</small></div><div class="glass"><b>${p.stats.total_n}</b><small>всего</small></div><div class="glass"><b>${p.stats.rating ? '★ ' + p.stats.rating : '—'}</b><small>рейтинг</small></div></div>${inner}</div>`;
}
function draw() {
  if (S.map) { S.map.remove(); S.map = null; S.mk = {}; S.line = null; }
  const mine = S.data.mine[0]; S.activeId = mine?.id || null;
  if (!mine) return drawList();
  const a = mine.address || {};
  shell(`<div id="cmap"></div><div class="glass ocard"><h3>Заказ №${mine.id}</h3><div class="muted">${esc(mine.customer?.name || '')}</div>
    ${itemsHtml(mine)}
    <div class="kv"><span>Адрес</span><b style="text-align:right">${esc(a.address || '')}</b></div>
    ${[['Подъезд', a.entrance], ['Этаж', a.floor], ['Квартира', a.apartment], ['Домофон', a.intercom]].filter(x => x[1]).map(x => `<div class="kv"><span>${x[0]}</span><b>${esc(x[1])}</b></div>`).join('')}
    ${a.comment ? `<div class="kv"><span>Комментарий</span><b style="text-align:right">${esc(a.comment)}</b></div>` : ''}
    <div class="kv"><span>Оплата</span><b>${esc(mine.payment)} · ${money(mine.total)} so'm</b></div>
    <div class="links"><a class="btn" href="tel:${esc(mine.customer?.phone || '')}">Позвонить клиенту</a><a class="btn" target="_blank" rel="noopener" href="https://yandex.com/maps/?rtext=~${a.lat},${a.lng}&rtt=auto">Яндекс</a><a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}">Google</a></div>
    <button class="btn primary" data-act="done" data-id="${mine.id}">Доставлено</button></div>`);
  S.map = L.map('cmap', { attributionControl: false, zoomControl: false, ...(MAPKEY ? { crs: L.CRS.EPSG3395 } : {}) }).setView([a.lat, a.lng], 14); tiles().addTo(S.map);
  S.mk.dest = L.marker([a.lat, a.lng], { icon: L.icon({ iconUrl: '/img/pin.png', iconSize: [30, 48], iconAnchor: [15, 46] }) }).addTo(S.map);
  if (mine.branch) S.mk.br = L.marker([mine.branch.lat, mine.branch.lng], { icon: L.icon({ iconUrl: '/img/branch.png', iconSize: [36, 57], iconAnchor: [18, 54] }) }).addTo(S.map);
  startGeo(); tick(true);
}
function drawList() {
  S.activeId = null; if (S.geo != null) { navigator.geolocation.clearWatch(S.geo); S.geo = null; }
  const list = S.data.available;
  shell(`<h3 style="margin:6px 4px 12px">Готовы к доставке (${list.length})</h3>${list.map(o => { const a = o.address || {}; return `<div class="glass ocard"><h3>№${o.id} · ${money(o.total)} so'm</h3>${itemsHtml(o)}<div class="kv"><span>Адрес</span><b style="text-align:right">${esc(a.address || '')}</b></div><div class="kv"><span>Оплата</span><b>${esc(o.payment)}</b></div><button class="btn primary" data-act="accept" data-id="${o.id}">Принять заказ</button></div>`; }).join('') || '<div class="glass card empty">Новых заказов пока нет. Когда касса отметит заказ готовым, здесь прозвучит сигнал.</div>'}
    ${S.profile.reviews.length ? `<h3 style="margin:22px 4px 10px">Отзывы обо мне</h3>${S.profile.reviews.slice(0, 8).map(r => `<div class="glass ocard" style="padding:14px"><b style="color:${r.stars < 3 ? 'var(--bad)' : '#ffc83d'}">${'★'.repeat(r.stars)}</b> <span class="faint">№${r.order_id}</span><div class="muted">${esc(r.comment) || '—'}</div></div>`).join('')}` : ''}`);
}
/* position + route */
function startGeo() {
  if (S.geo != null || !navigator.geolocation) return;
  S.geo = navigator.geolocation.watchPosition(p => { S.pos = { lat: p.coords.latitude, lng: p.coords.longitude }; tick(); if (Date.now() - S.lastSent > 4500) { S.lastSent = Date.now(); api('courier/location', 'POST', S.pos).catch(() => { }); } }, () => toast('Включите геолокацию, чтобы клиент видел вас на карте'), { enableHighAccuracy: true, maximumAge: 3000 });
}
async function tick(fit) {
  if (!S.map || !S.pos) return;
  const mine = S.data?.mine[0]; if (!mine?.address) return;
  const a = mine.address;
  if (S.mk.me) S.mk.me.setLatLng([S.pos.lat, S.pos.lng]); else S.mk.me = L.marker([S.pos.lat, S.pos.lng], { icon: L.divIcon({ html: '<div style="width:40px;height:40px;border-radius:50%;background:#e2203d;border:3px solid #fff;display:grid;place-items:center;font-size:20px">🛵</div>', className: 'bm', iconSize: [40, 40], iconAnchor: [20, 20] }) }).addTo(S.map);
  if (Date.now() - S.routeAt > 15000 || !S.line) {
    S.routeAt = Date.now(); let pts = [[S.pos.lat, S.pos.lng], [a.lat, a.lng]], dashed = true;
    try { const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${S.pos.lng},${S.pos.lat};${a.lng},${a.lat}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(6000) }); const j = await r.json(); if (j.routes?.[0]) { pts = j.routes[0].geometry.coordinates.map(p => [p[1], p[0]]); dashed = false; } } catch { /* straight line */ }
    if (S.line) S.map.removeLayer(S.line); S.line = L.polyline(pts, { color: '#e2203d', weight: 5, dashArray: dashed ? '8 10' : null }).addTo(S.map);
    if (fit || !S.fitted) { S.map.fitBounds([[S.pos.lat, S.pos.lng], [a.lat, a.lng]], { padding: [50, 50], maxZoom: 16 }); S.fitted = true; }
  }
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act;
  if (act === 'out') { try { await api('auth/logout', 'POST'); } catch { /* ignore */ } signOut(); return; }
  if (act === 'accept') { try { S.fitted = false; await api(`courier/orders/${b.dataset.id}/accept`, 'POST'); S.profile = await api('courier/me'); await refresh(true); } catch (er) { toast(er.message); refresh(true); } }
  if (act === 'done') {
    if (!confirm('Подтвердить, что заказ доставлен клиенту?')) return;
    try { await api(`courier/orders/${b.dataset.id}/delivered`, 'POST'); toast('Заказ доставлен. Клиенту отправлен запрос на оценку'); S.fitted = false; S.profile = await api('courier/me'); await refresh(true); } catch (er) { toast(er.message); }
  }
});
if (S.token) init(); else login();
