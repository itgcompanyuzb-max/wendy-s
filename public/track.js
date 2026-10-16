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
/* move a marker smoothly to a new point (the courier position arrives every few seconds) */
function glide(m, to, ms) {
  const from = m.getLatLng(), t0 = performance.now(); cancelAnimationFrame(m._raf);
  const step = t => { const k = Math.min(1, (t - t0) / (ms || 3500)); m.setLatLng([from.lat + (to.lat - from.lat) * k, from.lng + (to.lng - from.lng) * k]); if (k < 1) m._raf = requestAnimationFrame(step); };
  m._raf = requestAnimationFrame(step);
}
/* the customer on his own map: white pill with his profile name and a stick down to the delivery point */
const pillName = () => { const n = String(St.user?.name || '').trim() || 'Вы'; return n.length > 16 ? n.slice(0, 15) + '…' : n; };
const pillIcon = () => L.divIcon({ html: `<div class="cpill-w"><div class="cpill"><i><svg width=\"26\" height=\"26\" viewBox=\"0 0 26 26\"><circle cx=\"15\" cy=\"6\" r=\"3.6\" fill=\"#1d1d1f\"/><path d=\"M10 11.2h7.2c1 0 1.8.5 2.3 1.3l3.2 5.4-2.2 1.3-2.7-4.4V24H10.4v-10.6c0-.2-.1-.3-.4-.2z\" fill=\"#1d1d1f\"/><rect x=\"1.5\" y=\"11.4\" width=\"9\" height=\"2.6\" rx=\"1.3\" fill=\"#1d1d1f\"/></svg></i><b>${esc(pillName())}</b></div><div class="cp-stick"></div></div>`, className: 'bm', iconSize: [0, 0], iconAnchor: [0, 0] });
const TRACK_TEXT = { new: 'Ресторан скоро подтвердит заказ', cooking: 'Ваш заказ готовится', ready: 'Заказ готов, ждём курьера', delivering: 'Курьер везёт заказ', done: 'Заказ доставлен', cancelled: 'Заказ отменён' };
A.track = id => {
  const T = { map: null, timer: null, m: {}, line: null, routeAt: 0, fitted: false };
  Sh.open('track', () => `<div class="sh-head" style="padding:max(14px,env(safe-area-inset-top)) 16px 8px"><button onclick="Sh.close('track')">${I.x()}</button><b style="font-size:18px">Заказ №${id}</b><span style="width:28px"></span></div>
    <div id="tmap"></div><div class="tpanel" id="tpanel">Загрузка…</div>`, 'full', () => { clearInterval(T.timer); if (T.geo != null) navigator.geolocation.clearWatch(T.geo); });
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
    const live = !!(r.courier && r.courier.lat != null); // the courier phone sends its real GPS position
    if (r.dest) { mk('dest', [r.dest.lat, r.dest.lng], pillIcon()); pts.push([r.dest.lat, r.dest.lng]); }
    if (r.branch && !live) pts.push([r.branch.lat, r.branch.lng]); // the restaurant is not drawn on the map; it only frames the view until the courier's GPS arrives
    let text = TRACK_TEXT[r.status] || r.status, sub = r.branch ? `Готовит: ${r.branch.name || r.branch.address}` : '';
    const c = r.courier;
    if (live) {
      const ll = { lat: c.lat, lng: c.lng };
      if (T.m.c) glide(T.m.c, ll); else mk('c', [ll.lat, ll.lng], courierIcon(T.map.getZoom()));
      pts.push([ll.lat, ll.lng]);
      if (r.dest) { // the picture looks 37 degrees clockwise from north: turn it toward the customer
        const brg = Math.atan2((r.dest.lng - ll.lng) * Math.cos(ll.lat * Math.PI / 180), r.dest.lat - ll.lat) * 180 / Math.PI;
        const im = T.m.c?._icon?.querySelector('img'); if (im) im.style.transform = `rotate(${Math.round(brg - 37)}deg)`;
        drawRoute(ll, r.dest); // red line: courier -> customer
        const left = km(ll.lat, ll.lng, r.dest.lat, r.dest.lng); const eta = Math.max(1, Math.round(left / 0.35));
        sub = `${c.name ? 'Курьер ' + c.name + ' · ' : ''}осталось ≈ ${left.toFixed(1)} км, около ${eta} мин`;
      }
    } else if (r.status === 'delivering') {
      // no GPS from the courier yet: no courier picture at a made-up place, only the way from the restaurant
      sub = 'Курьер выехал к вам' + (c?.name ? ' · ' + c.name : '') + ' · ждём его геолокацию';
      if (r.dest && r.branch) drawRoute({ lat: r.branch.lat, lng: r.branch.lng }, r.dest);
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
