/* Order notifications, live courier tracking, rating, delivery quote */

/* ---------- which branch will cook a delivery order ---------- */
async function refreshQuote() {
  St.quote = null;
  const a = curAddr();
  if (St.mode !== 'delivery' || !a) return;
  try { St.quote = await api('/delivery/quote', { body: { lat: a.lat, lng: a.lng, items: St.cart.map(c => c.id), subtotal: Math.max(0, totals().sub - totals().discount) } }); } catch { St.quote = null; }
}

function orderActions(o) {
  const b = [];
  if (o.status === 'delivering' && o.type === 'delivery') b.push(`<button class="pill" onclick="A.track(${o.id})">Отследить курьера</button>`);
  if (o.status === 'done') b.push(o.stars ? `<span class="gray-t">${'★'.repeat(o.stars)}${'☆'.repeat(5 - o.stars)} ваша оценка</span>` : `<button class="pill" onclick="A.rate(${o.id})">Оценить</button>`);
  if (!['done', 'cancelled'].includes(o.status) && o.type === 'delivery') b.push(`<button class="pill" onclick="A.track(${o.id})">Статус</button>`);
  return b.length ? `<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">${b.join('')}</div>` : '';
}

/* ---------- notifications (polled) ---------- */
const Nf = { after: null, token: null };
function showNotif(n) {
  const el = document.createElement('div');
  el.className = 'nbanner';
  el.innerHTML = `<b>${esc(n.title)}</b><span>${esc(n.body)}</span>`;
  el.onclick = () => {
    el.remove();
    if (n.kind === 'delivering') A.track(n.order_id);
    else if (n.kind === 'delivered') A.rate(n.order_id);
    else if (n.order_id) A.profile();
  };
  $('#app').appendChild(el);
  try { navigator.vibrate?.(180); } catch { /* ignore */ }
  setTimeout(() => el.remove(), 9000);
  if (n.kind === 'delivered') setTimeout(() => A.rate(n.order_id), 700);
}
async function pollNotifs() {
  if (!St.token) { Nf.after = null; Nf.token = null; return; }
  if (Nf.token !== St.token) { Nf.token = St.token; Nf.after = null; }
  try {
    const r = await api('/notifications?after=' + (Nf.after ?? 0), { noLogout: true });
    const first = Nf.after === null;
    if (!r.items.length) { if (first) Nf.after = 0; return; }
    Nf.after = r.items[r.items.length - 1].id;
    // on the first poll after opening the app, only show things that happened in the last 3 minutes
    r.items.filter(n => !first || Date.now() - Date.parse(String(n.created_at).replace(' ', 'T') + 'Z') < 180000).forEach(showNotif);
    api('/me').then(m => { St.user = m.user; if (Sh.stack.profile) Sh.refresh('profile'); }).catch(() => { });
    if (Sh.stack.profile) api('/orders').then(o => { St.orders = o.orders; Sh.refresh('profile'); }).catch(() => { });
  } catch { /* offline: try again later */ }
}
setInterval(pollNotifs, 6000);
setTimeout(pollNotifs, 2000);

/* ---------- live tracking ---------- */
const km = (a, b, c, d) => { const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
/* courier = the courier picture; it shrinks when the map is zoomed out and grows when zoomed in */
const cSize = z => Math.max(22, Math.min(46, 22 + (z - 12) * 5));
const courierIcon = z => L.divIcon({ html: `<div style="width:60px;height:60px;display:flex;align-items:center;justify-content:center"><img class="cimg" src="/img/courier.png" alt="" style="width:${cSize(z)}px"></div>`, className: 'bm', iconSize: [60, 60], iconAnchor: [30, 30] });
const TRACK_TEXT = { new: 'Ресторан скоро подтвердит заказ', cooking: 'Ваш заказ готовится', ready: 'Заказ готов, ждём курьера', delivering: 'Курьер везёт заказ', done: 'Заказ доставлен', cancelled: 'Заказ отменён' };
A.track = id => {
  const T = { map: null, timer: null, m: {}, line: null, routeAt: 0, fitted: false };
  Sh.open('track', () => `<div class="sh-head" style="padding:max(14px,env(safe-area-inset-top)) 16px 8px"><button onclick="Sh.close('track')">${I.x()}</button><b style="font-size:18px">Заказ №${id}</b><span style="width:28px"></span></div>
    <div id="tmap"></div><div class="tpanel" id="tpanel">Загрузка…</div>`, 'full', () => clearInterval(T.timer));
  T.map = L.map('tmap', { zoomControl: false, attributionControl: false, ...(St.menu.settings.yandex_key ? { crs: L.CRS.EPSG3395 } : {}) }).setView([41.3111, 69.2797], 13);
  tile().addTo(T.map);
  T.map.on('zoomend', () => { const im = T.m.c?._icon?.querySelector('img'); if (im) im.style.width = cSize(T.map.getZoom()) + 'px'; });
  setTimeout(() => T.map.invalidateSize(), 150);
  const mk = (k, ll, icon) => { if (T.m[k]) T.m[k].setLatLng(ll); else T.m[k] = L.marker(ll, { icon }).addTo(T.map); };
  const drawRoute = async (c, d) => {
    if (Date.now() - T.routeAt < 15000 && T.line) return; T.routeAt = Date.now();
    let pts = [[c.lat, c.lng], [d.lat, d.lng]], dashed = true;
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${c.lng},${c.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(6000) });
      const j = await r.json(); if (j.routes?.[0]) { pts = j.routes[0].geometry.coordinates.map(p => [p[1], p[0]]); dashed = false; }
    } catch { /* straight line fallback */ }
    if (T.line) T.map.removeLayer(T.line);
    T.line = L.polyline(pts, { color: '#e2203d', weight: 5, opacity: .9, dashArray: dashed ? '8 10' : null }).addTo(T.map);
  };
  const upd = async () => {
    let r; try { r = await api(`/orders/${id}/track`); } catch { return; }
    if (!$('#tpanel')) return;
    if (r.status === 'done') { Sh.close('track'); A.rate(id); return; }
    const pts = [];
    const live = !!(r.courier && r.courier.lat != null); // the courier phone sends GPS
    if (r.dest) { mk('dest', [r.dest.lat, r.dest.lng], L.icon({ iconUrl: '/img/pin.png', iconSize: [30, 48], iconAnchor: [15, 46] })); pts.push([r.dest.lat, r.dest.lng]); }
    // while the courier has no GPS he is shown at the restaurant, so the restaurant icon is hidden under him
    const atBranch = r.status === 'delivering' && !live && r.branch;
    if (r.branch && !atBranch) { mk('br', [r.branch.lat, r.branch.lng], L.icon({ iconUrl: '/img/branch.png', iconSize: [40, 64], iconAnchor: [20, 60] })); pts.push([r.branch.lat, r.branch.lng]); }
    else if (T.m.br) { T.map.removeLayer(T.m.br); delete T.m.br; }
    let text = TRACK_TEXT[r.status] || r.status, sub = r.branch ? `Готовит: ${r.branch.name || r.branch.address}` : '';
    const c = r.courier, cp = live ? c : (atBranch ? { lat: r.branch.lat, lng: r.branch.lng } : null);
    if (cp) {
      mk('c', [cp.lat, cp.lng], courierIcon(T.map.getZoom())); pts.push([cp.lat, cp.lng]);
      if (r.dest) { // the picture looks 37 degrees clockwise from north: turn it toward the customer
        const brg = Math.atan2((r.dest.lng - cp.lng) * Math.cos(cp.lat * Math.PI / 180), r.dest.lat - cp.lat) * 180 / Math.PI;
        const im = T.m.c?._icon?.querySelector('img'); if (im) im.style.transform = `rotate(${Math.round(brg - 37)}deg)`;
        drawRoute({ lat: cp.lat, lng: cp.lng }, r.dest); // red line: courier -> customer
      }
      if (live && r.dest) {
        const left = km(c.lat, c.lng, r.dest.lat, r.dest.lng); const eta = Math.max(1, Math.round(left / 0.35));
        sub = `${c.name ? 'Курьер ' + c.name + ' · ' : ''}осталось ≈ ${left.toFixed(1)} км, около ${eta} мин`;
      } else sub = 'Курьер выехал к вам' + (c?.name ? ' · ' + c.name : '');
    }
    $('#tpanel').innerHTML = `<b>${esc(text)}</b><span>${esc(sub)}</span>`;
    if (!T.fitted && pts.length) { T.map.fitBounds(pts, { padding: [60, 60], maxZoom: 16 }); T.fitted = pts.length > 1; }
  };
  upd(); T.timer = setInterval(upd, 4000);
};

/* ---------- rating ---------- */
A.rate = id => {
  const R = { stars: 0, comment: '' };
  Sh.open('rate', () => {
    const msg = !R.stars ? '' : R.stars < 3 ? 'Мы приносим тысячу извинений. Расскажите, что пошло не так.' : 'Спасибо, что выбрали нас!';
    return `<div class="grab"></div><div class="body" style="text-align:center;padding:18px 20px 8px">
      <h2 style="margin:6px 0 4px;font-size:26px">Оцените наш сервис</h2><div class="gray-t" style="margin-bottom:16px">Заказ №${id}</div>
      <div class="stars">${[1, 2, 3, 4, 5].map(n => `<button class="${n <= R.stars ? 'on' : ''}" onclick="R_set(${n})" aria-label="${n}">★</button>`).join('')}</div>
      <p style="min-height:44px;font-size:17px;font-weight:600;margin:14px 0 10px">${msg}</p>
      ${R.stars ? `<textarea id="rc" class="rc" rows="3" maxlength="500" placeholder="${R.stars < 3 ? 'Что вам не понравилось?' : 'Комментарий (необязательно)'}" oninput="R_com(this.value)">${esc(R.comment)}</textarea>` : ''}</div>
      <div class="foot"><button class="btn" ${R.stars ? '' : 'disabled'} onclick="R_send()">Отправить</button></div>`;
  });
  window.R_set = n => { R.stars = n; Sh.refresh('rate'); };
  window.R_com = v => { R.comment = v; };
  window.R_send = async () => {
    try { await api(`/orders/${id}/review`, { body: { stars: R.stars, comment: R.comment } }); Sh.close('rate'); toast(R.stars < 3 ? 'Спасибо за честный отзыв, мы всё исправим' : 'Спасибо за оценку!'); if (Sh.stack.profile) api('/orders').then(o => { St.orders = o.orders; Sh.refresh('profile'); }); }
    catch (e) { toast(e.message); if (/уже оценили/.test(e.message)) Sh.close('rate'); }
  };
};
