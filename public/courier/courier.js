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
  if (S.map) { S.map.remove(); S.map = null; S.mk = {}; S.line = null; S.lineFromPos = false; S.arrived = false; }
  const mine = S.data.mine[0]; S.activeId = mine?.id || null;
  if (!mine) return drawList();
  const a = mine.address || {};
  shell(`<div class="mapwrap"><div id="cmap"></div><div id="mapchip" class="mapchip" hidden></div></div><div id="gpsbar" class="gpsbar" hidden></div><div class="glass ocard"><h3>Заказ №${mine.id}</h3><div class="muted">${esc(mine.customer?.name || '')}</div>
    ${itemsHtml(mine)}
    <div class="kv"><span>Адрес</span><b style="text-align:right">${esc(a.address || '')}</b></div>
    ${[['Подъезд', a.entrance], ['Этаж', a.floor], ['Квартира', a.apartment], ['Домофон', a.intercom]].filter(x => x[1]).map(x => `<div class="kv"><span>${x[0]}</span><b>${esc(x[1])}</b></div>`).join('')}
    ${a.comment ? `<div class="kv"><span>Комментарий</span><b style="text-align:right">${esc(a.comment)}</b></div>` : ''}
    <div class="kv"><span>Оплата</span><b>${esc(mine.payment)} · ${money(mine.total)} so'm</b></div>
    <div class="links"><a class="btn" href="tel:${esc(mine.customer?.phone || '')}">Позвонить клиенту</a></div>
    <div id="donebox"></div></div>`);
  S.map = L.map('cmap', { attributionControl: false, zoomControl: false, ...(MAPKEY ? { crs: L.CRS.EPSG3395 } : {}) }).setView([a.lat, a.lng], 14); tiles().addTo(S.map); S.map.on('zoomend', () => { const el = S.mk.me && S.mk.me._icon && S.mk.me._icon.querySelector('.narrow'); if (el) el.style.width = el.style.height = aSize(S.map.getZoom()) + 'px'; });
  S.mk.dest = L.marker([a.lat, a.lng], { icon: L.divIcon({ html: '<svg width="44" height="56" viewBox="0 0 44 56" style="display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,.45))"><line x1="8" y1="6" x2="8" y2="50" stroke="#1d1d1f" stroke-width="3" stroke-linecap="round"/><rect x="8" y="4" width="32" height="22" fill="#fff" stroke="#1d1d1f" stroke-width="2"/><g fill="#1d1d1f"><rect x="8" y="4" width="8" height="7.33"/><rect x="24" y="4" width="8" height="7.33"/><rect x="16" y="11.33" width="8" height="7.33"/><rect x="32" y="11.33" width="8" height="7.33"/><rect x="8" y="18.66" width="8" height="7.34"/><rect x="24" y="18.66" width="8" height="7.34"/></g><circle cx="8" cy="50" r="5" fill="#fff" stroke="#1d1d1f" stroke-width="3"/></svg>', className: 'bm', iconSize: [44, 56], iconAnchor: [8, 50] }) }).addTo(S.map); // checkered flag = the customer's address
  startGeo(); tick(true);
}
function drawList() {
  S.activeId = null; if (S.geo != null) { navigator.geolocation.clearWatch(S.geo); S.geo = null; }
  const list = S.data.available;
  shell(`<h3 style="margin:6px 4px 12px">Готовы к доставке (${list.length})</h3>${list.map(o => { const a = o.address || {}; return `<div class="glass ocard"><h3>№${o.id} · ${money(o.total)} so'm</h3>${itemsHtml(o)}<div class="kv"><span>Адрес</span><b style="text-align:right">${esc(a.address || '')}</b></div><div class="kv"><span>Оплата</span><b>${esc(o.payment)}</b></div><div class="swipe" data-act="accept" data-id="${o.id}"><div class="sw-fill"></div><div class="sw-label">Я забрал заказ</div><div class="sw-thumb">›</div></div></div>`; }).join('') || '<div class="glass card empty">Новых заказов пока нет. Когда касса отметит заказ готовым, здесь прозвучит сигнал.</div>'}
    ${S.profile.reviews.length ? `<h3 style="margin:22px 4px 10px">Отзывы обо мне</h3>${S.profile.reviews.slice(0, 8).map(r => `<div class="glass ocard" style="padding:14px"><b style="color:${r.stars < 3 ? 'var(--bad)' : '#ffc83d'}">${'★'.repeat(r.stars)}</b> <span class="faint">№${r.order_id}</span><div class="muted">${esc(r.comment) || '—'}</div></div>`).join('')}` : ''}`);
}
/* position + route */
function gpsNote(msg) { const n = document.getElementById('gpsbar'); if (n) { n.textContent = msg || ''; n.hidden = !msg; } }
const distM = (a, b) => { const r = x => x * Math.PI / 180, h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(h)); };
const bearing = (a, b) => (Math.atan2((b.lng - a.lng) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI + 360) % 360;
function startGeo() {
  if (S.geo != null) return;
  if (!navigator.geolocation) { S.gpsFailed = true; gpsNote('Этот браузер не умеет определять местоположение. Откройте страницу с телефона.'); updateDone(); return; }
  gpsNote('Определяем ваше местоположение… Разрешите доступ к геолокации в браузере.');
  S.geo = navigator.geolocation.watchPosition(p => {
    const np = { lat: p.coords.latitude, lng: p.coords.longitude };
    if (S.pos && distM(S.pos, np) > 4) S.heading = bearing(S.pos, np); // the arrow looks where the courier is going
    else if (!S.pos && Number.isFinite(p.coords.heading)) S.heading = p.coords.heading;
    S.pos = np; S.gpsFailed = false; gpsNote('');
    tick();
    if (Date.now() - S.lastSent > 3000) { S.lastSent = Date.now(); api('courier/location', 'POST', S.pos).catch(() => { }); }
  }, err => {
    S.gpsFailed = true; updateDone();
    gpsNote(err.code === 1 ? 'Геолокация запрещена: клиент не видит, где вы. Нажмите на значок слева от адреса сайта и выберите «Разрешить», затем обновите страницу.' : 'Не удалось определить местоположение. Проверьте GPS и интернет.');
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
const aSize = z => Math.max(26, Math.min(46, 26 + (z - 12) * 4)); // the courier's own arrow: smaller when zoomed out
function fmtDist(m) { return m < 1000 ? Math.max(10, Math.round(m / 10) * 10) + ' м' : (m / 1000).toFixed(1) + ' км'; }
function showChip(m, sec) { const c = document.getElementById('mapchip'); if (!c) return; c.hidden = false; c.textContent = Math.max(1, Math.round(sec / 60)) + ' мин · ' + fmtDist(m); }
/* the completion slider appears by itself when the courier has reached the customer (or at once when the phone gives no GPS) */
function updateDone() {
  const box = document.getElementById('donebox'); if (!box) return;
  const mine = S.data?.mine[0], a = mine?.address; if (!mine || !a) return;
  if (!S.arrived && ((S.pos && distM(S.pos, a) <= 120) || (!S.pos && S.gpsFailed))) S.arrived = true;
  if (S.arrived) { if (!box.firstChild || box.dataset.state !== 'on') { box.dataset.state = 'on'; box.innerHTML = '<div class="muted" style="margin-top:12px">Вы на месте. Передайте заказ и потяните вправо.</div><div class="swipe green" data-act="done" data-id="' + mine.id + '"><div class="sw-fill"></div><div class="sw-label">Заказ доставлен</div><div class="sw-thumb">›</div></div>'; } }
  else if (box.dataset.state !== 'wait') { box.dataset.state = 'wait'; box.innerHTML = '<div class="muted" style="margin-top:12px">Кнопка «Заказ доставлен» появится, когда вы доберётесь до клиента.</div>'; }
}
async function tick(fit) {
  if (!S.map) return;
  const mine = S.data?.mine[0]; if (!mine?.address) return;
  const a = mine.address;
  // the route starts at the courier's real GPS position; until GPS answers it starts at the restaurant (no courier arrow is shown at a made-up place)
  const from = S.pos || (mine.branch ? { lat: mine.branch.lat, lng: mine.branch.lng } : null);
  if (!from) return;
  if (S.pos) {
    const deg = Math.round(S.heading != null ? S.heading : bearing(S.pos, a));
    if (S.mk.me) S.mk.me.setLatLng([S.pos.lat, S.pos.lng]);
    else { const sz = aSize(S.map.getZoom()); S.mk.me = L.marker([S.pos.lat, S.pos.lng], { icon: L.divIcon({ html: `<div style="width:60px;height:60px;display:flex;align-items:center;justify-content:center"><div class="narrow" style="width:${sz}px;height:${sz}px;transition:transform .4s"><svg viewBox="0 0 40 40" width="100%" height="100%" style="display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))"><path d="M20 3 L35 36 L20 28 L5 36 Z" fill="#ffc22e" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></svg></div></div>`, className: 'bm', iconSize: [60, 60], iconAnchor: [30, 30] }) }).addTo(S.map); }
    const el = S.mk.me._icon && S.mk.me._icon.querySelector('.narrow'); if (el) el.style.transform = `rotate(${deg}deg)`;
  }
  updateDone();
  if (Date.now() - S.routeAt > 10000 || !S.line || (S.pos && !S.lineFromPos)) {
    S.routeAt = Date.now(); S.lineFromPos = !!S.pos; let pts = [[from.lat, from.lng], [a.lat, a.lng]], dashed = true, dist = distM(from, a), dur = dist / 5.5;
    try { const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${a.lng},${a.lat}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(6000) }); const j = await r.json(); if (j.routes?.[0]) { pts = j.routes[0].geometry.coordinates.map(p => [p[1], p[0]]); dashed = false; dist = j.routes[0].distance; dur = j.routes[0].duration; } } catch { /* straight dashed line */ }
    if (!S.map) return;
    showChip(dist, dur);
    if (S.line) S.map.removeLayer(S.line); S.line = L.polyline(pts, { color: '#e2203d', weight: 5, dashArray: dashed ? '8 10' : null }).addTo(S.map);
    if (fit || !S.fitted) { S.map.fitBounds([[from.lat, from.lng], [a.lat, a.lng]], { padding: [50, 50], maxZoom: 16 }); S.fitted = true; }
  }
}
/* slide-to-confirm: hold the round handle and drag it to the right end */
const SW = { box: null, x0: 0, max: 0, dx: 0 };
document.addEventListener('pointerdown', e => {
  const th = e.target.closest('.sw-thumb'); if (!th) return; const box = th.parentElement; if (box.classList.contains('busy')) return;
  SW.box = box; SW.x0 = e.clientX; SW.dx = 0; SW.max = box.clientWidth - th.offsetWidth - 8; th.style.transition = 'none'; box.querySelector('.sw-fill').style.transition = 'none';
  try { th.setPointerCapture(e.pointerId); } catch { /* ignore */ } e.preventDefault();
});
document.addEventListener('pointermove', e => {
  if (!SW.box) return; SW.dx = Math.max(0, Math.min(SW.max, e.clientX - SW.x0));
  SW.box.querySelector('.sw-thumb').style.transform = `translateX(${SW.dx}px)`; SW.box.querySelector('.sw-fill').style.width = (SW.dx + 56) + 'px'; SW.box.querySelector('.sw-label').style.opacity = String(1 - SW.dx / SW.max);
});
async function swipeEnd() {
  const box = SW.box; if (!box) return; SW.box = null;
  const th = box.querySelector('.sw-thumb'), fill = box.querySelector('.sw-fill');
  if (SW.dx >= SW.max * 0.92) {
    box.classList.add('busy'); th.style.transform = `translateX(${SW.max}px)`; fill.style.width = '100%'; const id = box.dataset.id;
    if (box.dataset.act === 'accept') await doAccept(id); else await doDone(id);
    box.classList.remove('busy');
  } else { th.style.transition = fill.style.transition = 'all .25s'; th.style.transform = 'translateX(0)'; fill.style.width = '0'; box.querySelector('.sw-label').style.opacity = '1'; }
}
document.addEventListener('pointerup', swipeEnd);
document.addEventListener('pointercancel', swipeEnd);
async function doAccept(id) { try { S.fitted = false; await api(`courier/orders/${id}/accept`, 'POST'); S.profile = await api('courier/me'); await refresh(true); } catch (er) { toast(er.message); refresh(true); } }
async function doDone(id) { try { await api(`courier/orders/${id}/delivered`, 'POST'); toast('Заказ доставлен. Клиенту отправлен запрос на оценку'); S.fitted = false; S.profile = await api('courier/me'); await refresh(true); } catch (er) { toast(er.message); refresh(true); } }
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.classList.contains('swipe')) return;
  if (b.dataset.act === 'out') { try { await api('auth/logout', 'POST'); } catch { /* ignore */ } signOut(); }
});
if (S.token) init(); else login();
