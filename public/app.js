/* ============ helpers ============ */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NB = ' ';
const money = n => new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/\s/g, NB) + NB + "so'm";
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const VERSION = '1.0.0';

const St = {
  token: LS.get('token', null), user: null, menu: null, cart: LS.get('cart', []),
  mode: LS.get('mode', 'delivery'), addrId: LS.get('addrId', null), branchId: LS.get('branchId', null),
  addresses: [], cards: [], orders: [], promo: LS.get('promo', null),
  cat: null, q: '', searchOpen: false, promoOpen: false,
  pay: 'card', pickupTime: 'asap', pickupMethod: 'tray', map: null,
};

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(St.token ? { Authorization: 'Bearer ' + St.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && St.token && !opts.noLogout) { logoutLocal(); }
  if (!r.ok) { const e = new Error(j.error || 'Ошибка сети'); e.data = j; throw e; }
  return j;
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  $('#app').appendChild(t); setTimeout(() => t.remove(), 2800);
}

/* Tashkent time */
function tashkentMinutes() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  return (Number(p.find(x => x.type === 'hour').value) % 24) * 60 + Number(p.find(x => x.type === 'minute').value);
}
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
function openAt(b, m) {
  const o = toMin(b.open_time); let c = toMin(b.close_time); if (c === 0) c = 1440;
  return c > o ? (m >= o && m < c) : (m >= o || m < c);
}
const isOpen = b => !!b.active && openAt(b, tashkentMinutes());
const fmtT = t => t.replace(/^0(\d:)/, '$1');
const hhmm = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
function slots(b) {
  const out = []; const now = tashkentMinutes();
  let t = Math.ceil((now + 10) / 15) * 15;
  for (let i = 0; i < 56; i++, t += 15) {
    if (openAt(b, t % 1440)) out.push(hhmm(t)); else if (out.length) break;
  }
  return out;
}
const branches = () => St.menu?.branches || [];
const curBranch = () => branches().find(b => b.id === St.branchId);
const curAddr = () => St.addresses.find(a => a.id === St.addrId);
const anyOpen = () => branches().some(isOpen);

/* ============ cart ============ */
const prod = id => St.menu.products.find(p => p.id === id);
const qty = id => St.cart.find(c => c.id === id && !c.coin)?.qty || 0;
const coinsInCart = () => St.cart.reduce((n, c) => n + (c.coin ? (prod(c.id)?.coin_cost || 0) * c.qty : 0), 0);
const cartCount = () => St.cart.reduce((s, c) => s + c.qty, 0);
function saveCart() { LS.set('cart', St.cart); }
function totals() {
  let sub = 0, full = 0;
  for (const c of St.cart) { const p = prod(c.id); if (!p || c.coin) continue; sub += p.price * c.qty; full += (p.old_price || p.price) * c.qty; }
  let discount = 0;
  if (St.promo) discount = Math.min(sub, St.promo.percent ? Math.round(sub * St.promo.percent / 100) : St.promo.fixed);
  const fee = St.mode === 'delivery' ? (St.quote?.ok ? St.quote.fee : (St.menu.settings.delivery_fee || 0)) : 0;
  const total = sub - discount + fee;
  return { spent: coinsInCart(), sub, full: full + fee, discount, fee, total, coins: Math.round(total * (St.menu.settings.coin_percent || 10) / 100) };
}
const A = {};
A.add = id => { const c = St.cart.find(x => x.id === id && !x.coin); if (c) c.qty = Math.min(50, c.qty + 1); else St.cart.push({ id, qty: 1 }); cartChanged(); };
A.dec = id => { const c = St.cart.find(x => x.id === id && !x.coin); if (!c) return; c.qty--; if (c.qty <= 0) St.cart = St.cart.filter(x => x !== c); cartChanged(); };
A.del = id => { St.cart = St.cart.filter(x => x.id !== id || x.coin); cartChanged(); };
A.addCoin = id => {
  const p = prod(id);
  if (!St.user) return go('login');
  if (coinsInCart() + p.coin_cost > (St.user.coins || 0)) return toast('Недостаточно WendyCoin');
  const c = St.cart.find(x => x.id === id && x.coin);
  if (c) c.qty = Math.min(50, c.qty + 1); else St.cart.push({ id, qty: 1, coin: true });
  cartChanged();
};
A.decCoin = id => { const c = St.cart.find(x => x.id === id && x.coin); if (!c) return; c.qty--; if (c.qty <= 0) St.cart = St.cart.filter(x => x !== c); cartChanged(); };
A.clearCart = () => { St.cart = []; St.promo = null; LS.del('promo'); cartChanged(); Sh.close('cart'); };
function cartChanged() {
  St.cart = St.cart.filter(c => prod(c.id));
  saveCart();
  document.querySelectorAll('[data-pill]').forEach(el => { el.innerHTML = pillInner(prod(Number(el.dataset.pill))); });
  renderFab();
  if (St.promo && totals().sub === 0) { St.promo = null; LS.del('promo'); }
  Sh.refresh('cart'); Sh.refresh('coinshop');
  if (Sh.stack.checkout) Sh.refresh('checkout');
  if (St.mode === 'delivery' && St.addrId) { // the nearest branch (and so the delivery price) depends on the basket
    clearTimeout(cartChanged.t);
    cartChanged.t = setTimeout(() => refreshQuote().then(() => { Sh.refresh('cart'); Sh.refresh('checkout'); renderFab(); }), 350);
  }
}

/* ============ sheets ============ */
const Sh = {
  stack: {},
  open(name, render, cls = '', onclose) {
    this.close(name);
    const w = document.createElement('div'); w.className = 'shwrap'; w.dataset.sh = name;
    w.innerHTML = `<div class="back" onclick="Sh.close('${name}')"></div><div class="sheet ${cls}"></div>`;
    $('#app').appendChild(w);
    this.stack[name] = { render, el: w, onclose };
    this.refresh(name);
  },
  refresh(name) {
    const s = this.stack[name]; if (!s) return;
    const sheet = s.el.querySelector('.sheet'); const old = sheet.querySelector('.body');
    const top = old ? old.scrollTop : 0;
    sheet.innerHTML = s.render();
    const nb = sheet.querySelector('.body'); if (nb) nb.scrollTop = top;
  },
  close(name) {
    const s = this.stack[name]; if (!s) return;
    s.el.remove(); delete this.stack[name]; if (s.onclose) s.onclose();
  },
  closeAll() { Object.keys(this.stack).forEach(n => this.close(n)); },
};

/* ============ view routing ============ */
function go(name, arg) {
  Sh.closeAll();
  if (St.map) { St.map.remove(); St.map = null; }
  const v = $('#view'); v.innerHTML = '';
  ({ login: loginView, phone: phoneView, code: codeView, name: nameView, map: mapView, home: homeView })[name](arg);
}
function logoutLocal() { St.token = null; St.user = null; St.addresses = []; St.cards = []; LS.del('token'); }

/* ============ login ============ */
function loginView() {
  $('#view').innerHTML = `
  <div class="view login">
    <div class="top-row"><button onclick="go('home')">${I.x()}</button><div class="langsw"><button class="${LANG === 'ru' ? 'on' : ''}" onclick="setLang('ru')">RU</button><button class="${LANG === 'uz' ? 'on' : ''}" onclick="setLang('uz')">UZ</button></div><button class="link-or" onclick="A.support()">Поддержка</button></div>
    <div class="hero"></div>
    <h1>Войдите в профиль</h1>
    <div class="sub">Чтобы копить коины и получать персональные скидки</div>
    <button class="btn" onclick="go('phone')">Указать телефон</button>
    <div class="legal"><a href="#" onclick="A.legal();return false">Правовые документы</a><br>Версия ${VERSION}</div>
  </div>`;
}
A.support = () => Sh.open('support', () => `<div class="grab"></div><div class="body" style="padding:24px 20px">
  <h2 style="margin:0 0 10px;font-size:26px">Поддержка</h2>
  <p class="gray-t" style="font-size:17px;line-height:1.4">Позвоните нам или напишите — поможем с заказом.</p>
  <a class="btn" style="margin-top:14px;text-decoration:none" href="tel:${esc((branches()[0]?.phone || '').replace(/[^+\d]/g, ''))}">Позвонить ${esc(branches()[0]?.phone || '')}</a></div>`);
A.legal = () => Sh.open('legal', () => `<div class="grab"></div><div class="body" style="padding:24px 20px"><h2 style="margin:0 0 10px;font-size:24px">Правовые документы</h2><p class="gray-t" style="line-height:1.5">Пользовательское соглашение и политика конфиденциальности.<br><br>Картографические данные: © участники OpenStreetMap (openstreetmap.org/copyright).</p></div>`);

/* ============ phone ============ */
let PH_DIGITS = '';
const fmtPhone = d => [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
function phoneView() {
  $('#view').innerHTML = `
  <div class="view form-view">
    <div class="top-row"><button onclick="go('login')">${I.x()}</button></div>
    <h2>Укажите телефон, чтобы войти в профиль</h2>
    <div class="phone-box"><div class="cc">+998 ${I.down(18, '#8e8e93')}</div><input id="ph" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="Номер телефона" maxlength="12" value="${fmtPhone(PH_DIGITS)}"></div>
    <div class="err" id="err"></div>
    <div class="spacer"></div>
    <button class="btn" id="go" disabled>Продолжить</button>
  </div>`;
  const inp = $('#ph'), btn = $('#go');
  const upd = () => { btn.disabled = PH_DIGITS.length !== 9; };
  inp.addEventListener('input', () => {
    let d = inp.value.replace(/\D/g, '');
    if (d.startsWith('998') && d.length > 9) d = d.slice(3); // вставили номер целиком
    PH_DIGITS = d.slice(0, 9);
    inp.value = fmtPhone(PH_DIGITS); $('#err').textContent = ''; upd();
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && PH_DIGITS.length === 9) btn.click(); });
  btn.onclick = async () => {
    if (PH_DIGITS.length !== 9) { $('#err').textContent = 'Введите 9 цифр номера'; return; }
    btn.disabled = true;
    try { const r = await api('/auth/request', { body: { phone: '+998' + PH_DIGITS } }); go('code', { resend: r.resend_in }); }
    catch (e) { if (e.data?.resend_in) return go('code', { resend: e.data.resend_in }); $('#err').textContent = e.message; upd(); }
  };
  upd(); setTimeout(() => inp.focus(), 50);
}

/* ============ code ============ */
let codeTimer = null;
function codeView(o = {}) {
  clearInterval(codeTimer);
  let left = o.resend || 60;
  const phoneFull = '+998 ' + fmtPhone(PH_DIGITS);
  $('#view').innerHTML = `
  <div class="view form-view">
    <div class="top-row"><button onclick="clearInterval(codeTimer);go('phone')">${I.back()}</button></div>
    <h2>Введите код из <span style="color:var(--tg)">Telegram</span> или СМС</h2>
    <div class="code-sub">на номер ${esc(phoneFull)}</div>
    <div class="code-row" id="cr">${[0, 1, 2, 3].map(i => `<div class="code-cell" data-i="${i}"></div>`).join('')}
      <input class="code-input" id="ci" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="4"></div>
    <div class="err" id="err"></div>
    <div class="spacer"></div>
    <div class="resend-note" id="rn"></div>
    <button class="btn" id="rb" disabled>Получить новый код</button>
  </div>`;
  const ci = $('#ci'), cells = [...document.querySelectorAll('.code-cell')];
  const paint = () => { const v = ci.value; cells.forEach((c, i) => { c.textContent = v[i] || ''; c.classList.toggle('act', i === Math.min(v.length, 3)); }); };
  const tick = () => {
    $('#rn').innerHTML = left > 0 ? `Если код не пришел,<br>запросите новый через ${left} сек` : 'Если код не пришел,<br>запросите новый';
    $('#rb').disabled = left > 0;
  };
  tick(); paint();
  codeTimer = setInterval(() => { left = Math.max(0, left - 1); tick(); if (left <= 0) clearInterval(codeTimer); }, 1000);
  let busy = false;
  ci.addEventListener('input', async () => {
    ci.value = ci.value.replace(/\D/g, '').slice(0, 4); paint(); $('#cr').classList.remove('bad'); $('#err').textContent = '';
    if (ci.value.length === 4 && !busy) {
      busy = true;
      try {
        const r = await api('/auth/verify', { body: { phone: '+998' + PH_DIGITS, code: ci.value }, noLogout: true });
        clearInterval(codeTimer);
        St.token = r.token; LS.set('token', r.token); St.user = r.user;
        await loadUserData();
        if (!r.user.name) go('name'); else go(St.addrId || St.branchId ? 'home' : 'map', 'delivery');
      } catch (e) {
        $('#cr').classList.add('bad'); $('#err').textContent = e.message; ci.value = ''; paint();
      }
      busy = false;
    }
  });
  $('#rb').onclick = async () => {
    try { const r = await api('/auth/request', { body: { phone: '+998' + PH_DIGITS } }); left = r.resend_in; $('#err').textContent = ''; tick(); clearInterval(codeTimer); codeTimer = setInterval(() => { left = Math.max(0, left - 1); tick(); if (left <= 0) clearInterval(codeTimer); }, 1000); }
    catch (e) { $('#err').textContent = e.message; }
  };
  $('#cr').onclick = () => ci.focus();
  setTimeout(() => ci.focus(), 60);
}

/* ============ name (face follows the last typed letter) ============ */
function eyeOffset(ch) {
  const c = ch.toLowerCase(), code = c.charCodeAt(0);
  let t;
  if (code >= 97 && code <= 122) t = (code - 97) / 25;
  else if (code >= 1072 && code <= 1103) t = (code - 1072) / 31;
  else if (code >= 48 && code <= 57) t = (code - 48) / 9;
  else t = (code * 37 % 100) / 100;
  const vowel = 'aeiouyаеёиоуыэюя'.includes(c);
  return { dx: (t * 2 - 1) * 6, dy: vowel ? -3 : ((code % 3) - 1) * 2.4 };
}
const faceHTML = () => `<img class="face" id="face" src="/img/avatars/9.png" alt="">`;
function nameView() {
  let notify = true;
  $('#view').innerHTML = `
  <div class="view form-view">
    <div class="top-row" style="justify-content:flex-end"><button class="link-or" id="skip">Пропустить</button></div>
    ${faceHTML()}
    <h2 style="margin:6px 0 8px;font-size:25px">Придумайте имя</h2>
    <div class="code-sub" style="margin:0">Так будем обращаться к вам в ${esc(St.menu.settings.brand)}</div>
    <input class="name-input" id="nm" maxlength="30" autocomplete="given-name" placeholder="Ваше имя">
    <div class="spacer"></div>
    <button class="btn" id="ct">Продолжить</button>
  </div>`;
  const nm = $('#nm'), face = $('#face');
  nm.addEventListener('input', () => { // the head leans toward the side of the last typed letter
    const v = nm.value;
    if (!v) { face.style.transform = ''; return; }
    const { dx, dy } = eyeOffset(v[v.length - 1]);
    face.style.transform = `translate(${dx * 1.6}px,${dy * 1.2}px) rotate(${dx * 1.4}deg)`;
  });
  const done = async skip => {
    try { const r = await api('/me', { method: 'PUT', body: { name: skip ? '' : nm.value.trim(), notify } }); St.user = r.user; } catch (e) { toast(e.message); }
    go('map', 'delivery');
  };
  $('#skip').onclick = () => done(true);
  $('#ct').onclick = () => done(false);
  nm.addEventListener('keydown', e => { if (e.key === 'Enter') done(false); });
  setTimeout(() => nm.focus(), 60);
}

/* ============ map: delivery pin + pizzerias ============ */
const TASH = [41.3111, 69.2797];
const tile = () => {
  const key = St.menu.settings.yandex_key;
  if (key) return L.tileLayer(`https://tiles.api-maps.yandex.ru/v1/tiles/?lang=ru_RU&x={x}&y={y}&z={z}&l=map&apikey=${key}`, { maxZoom: 19 });
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
};
const flag = `<span style="font-size:20px">🇺🇿</span>`;
let M = null;

function mapView(mode = 'delivery') {
  M = { mode, lat: TASH[0], lng: TASH[1], address: '', step: 1, label: 'home', selBranch: null, q: '', onlyOpen: false, cluster: null, markers: {}, geoTimer: null, f: {} };
  $('#view').innerHTML = `
  <div class="view map-view" id="mv">
    <div id="mapbox" style="position:absolute;left:0;right:0;top:0;bottom:300px"><div id="map"></div><img class="center-pin" id="cpin" src="/img/pin.png" alt="" style="top:50%"></div>
    <button class="map-x" id="mx">${I.xw()}</button>
    <div class="seg with-x" id="seg"><button data-m="delivery">${I.walk(24, '#fff')} Доставка</button><button data-m="pickup">${I.fork(24)} В пиццерии</button></div>
    <div class="bubble up" id="b1" style="top:92px;left:56%">Выберите тип заказа</div>
    <button class="locate" id="loc">${I.locate()}</button>
    <div class="map-sheet" id="msheet"></div>
  </div>`;
  const map = St.map = L.map('map', { zoomControl: false, attributionControl: false, zoomSnap: .5, ...(St.menu.settings.yandex_key ? { crs: L.CRS.EPSG3395 } : {}) }).setView(TASH, 12);
  tile().addTo(map);
  $('#mx').onclick = () => go('home');
  document.querySelectorAll('#seg button').forEach(b => b.onclick = () => setMapMode(b.dataset.m));
  $('#loc').onclick = locateMe;
  const ro = new ResizeObserver(() => {
    const sh = $('#msheet'); if (!sh) return;
    const h = sh.offsetHeight;
    $('#mapbox').style.bottom = Math.max(0, h - 28) + 'px'; $('#loc').style.bottom = (h + 14) + 'px';
    map.invalidateSize();
  });
  ro.observe($('#msheet'));
  map.on('movestart', () => { $('#cpin')?.classList.add('lift'); $('#b1')?.remove(); $('#b2')?.remove(); });
  map.on('moveend', () => {
    $('#cpin')?.classList.remove('lift');
    if (M.mode !== 'delivery') return;
    const c = map.getCenter(); M.lat = c.lat; M.lng = c.lng;
    clearTimeout(M.geoTimer); M.geoTimer = setTimeout(reverseGeo, 450);
    const co = $('#coord'); if (co) co.textContent = `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
  });
  const sa = curAddr();
  setMapMode(mode, true);
  if (mode === 'delivery' && sa) map.setView([sa.lat, sa.lng], 17);
}
function setMapMode(mode, first) {
  M.mode = mode; M.selBranch = null; M.step = 1;
  document.querySelectorAll('#seg button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
  $('#cpin').style.display = mode === 'delivery' ? '' : 'none';
  if (M.cluster) { St.map.removeLayer(M.cluster); M.cluster = null; }
  $('#b2')?.remove();
  if (mode === 'delivery') {
    renderDeliverySheet();
    if (first && !LS.get('hintShown', false)) {
      LS.set('hintShown', true);
      const b = document.createElement('div'); b.className = 'bubble down'; b.id = 'b2'; b.textContent = 'Укажите адрес доставки';
      b.style.cssText = 'left:50%;top:calc(50% - 130px)'; $('#mv').appendChild(b);
      setTimeout(() => { $('#b1')?.remove(); b.remove(); }, 4500);
    } else $('#b1')?.remove();
    const c = St.map.getCenter(); M.lat = c.lat; M.lng = c.lng; reverseGeo();
  } else {
    $('#b1')?.remove(); renderPickupMarkers(); renderPickupSheet();
  }
}
async function reverseGeo() {
  if (M.mode !== 'delivery') return;
  try {
    const r = await api(`/reverse?lat=${M.lat}&lng=${M.lng}`);
    const inp = $('#addr');
    if (inp && document.activeElement !== inp && r.address) { inp.value = r.address; M.address = r.address; updDeliverBtn(); }
  } catch { /* ignore */ }
}
function locateMe() {
  const b = $('#loc'); if (!navigator.geolocation) return toast('Геолокация не поддерживается');
  b.classList.add('busy');
  navigator.geolocation.getCurrentPosition(p => {
    b.classList.remove('busy'); St.map.flyTo([p.coords.latitude, p.coords.longitude], 17, { duration: .8 });
  }, () => { b.classList.remove('busy'); toast('Разрешите доступ к геолокации в браузере'); }, { enableHighAccuracy: true, timeout: 10000 });
}
function renderDeliverySheet() {
  const sh = $('#msheet');
  const step2 = M.step === 2;
  sh.innerHTML = `
    <div class="chip-country">${flag} Узбекистан</div>
    <label class="field single ${M.f.bad ? 'bad' : ''}" style="height:62px"><label style="top:9px">Город, улица и дом</label>
      <input id="addr" value="${esc(M.address)}" placeholder="" autocomplete="off" style="padding:26px 18px 6px"></label>
    <div class="coord" id="coord">${M.lat.toFixed(6)}, ${M.lng.toFixed(6)}</div>
    ${step2 ? `
    <div class="labels">
      ${[['home', 'Дом', I.home(22)], ['work', 'Работа', I.work(22)], ['other', 'Другое', I.pinI(22)]].map(([k, t, ic]) => `<button class="lab ${M.label === k ? 'on' : ''}" onclick="M.label='${k}';renderDeliverySheet()">${ic}${t}</button>`).join('')}
    </div>
    <div class="row2"><label class="field"><label>Подъезд</label><input id="f_en" value="${esc(M.f.entrance || '')}" maxlength="10"></label>
      <label class="field"><label>Домофон</label><input id="f_ic" value="${esc(M.f.intercom || '')}" maxlength="20"></label>
      <label class="field"><label>Этаж</label><input id="f_fl" value="${esc(M.f.floor || '')}" maxlength="10" inputmode="numeric"></label>
      <label class="field"><label>Квартира</label><input id="f_ap" value="${esc(M.f.apartment || '')}" maxlength="10"></label></div>
    <label class="field"><label>Комментарий для курьера</label><input id="f_cm" value="${esc(M.f.comment || '')}" maxlength="100"></label>
    <button class="btn" id="dbtn" onclick="saveAddress()">Доставить сюда</button>`
      : `<button class="btn" id="dbtn" onclick="mapSaveStep()">Сохранить</button>`}`;
  const inp = $('#addr');
  inp.oninput = () => { M.address = inp.value; M.f.bad = false; updDeliverBtn(); };
  ['en:entrance', 'ic:intercom', 'fl:floor', 'ap:apartment', 'cm:comment'].forEach(s => { const [k, f] = s.split(':'); const e = $('#f_' + k); if (e) e.oninput = () => { M.f[f] = e.value; }; });
  updDeliverBtn();
}
function updDeliverBtn() { const b = $('#dbtn'); if (b) b.disabled = !M.address.trim(); }
function mapSaveStep() {
  if (!M.address.trim()) { M.f.bad = true; return renderDeliverySheet(); }
  M.step = 2; renderDeliverySheet();
}
async function saveAddress() {
  if (!M.address.trim()) return;
  if (!St.token) { toast('Войдите в профиль, чтобы сохранить адрес'); return go('login'); }
  const g = id => ($(id)?.value || '').trim();
  try {
    const r = await api('/addresses', { body: { label: M.label, address: M.address.trim(), lat: M.lat, lng: M.lng, entrance: g('#f_en'), intercom: g('#f_ic'), floor: g('#f_fl'), apartment: g('#f_ap'), comment: g('#f_cm') } });
    St.addresses.unshift(r.address); St.addrId = r.address.id; St.mode = 'delivery';
    LS.set('addrId', St.addrId); LS.set('mode', 'delivery');
    const after = St.afterMap; St.afterMap = null;
    go('home'); if (after) after();
  } catch (e) { toast(e.message); }
}

/* pickup */
function renderPickupMarkers() {
  const map = St.map;
  M.cluster = L.markerClusterGroup({
    showCoverageOnHover: false, maxClusterRadius: 70,
    iconCreateFunction: c => L.divIcon({ html: `<div class="cluster">${c.getChildCount()}</div>`, className: 'bm', iconSize: [48, 48] }),
  });
  M.markers = {};
  branches().forEach(b => {
    const open = isOpen(b);
    const m = L.marker([b.lat, b.lng], {
      icon: L.icon({ iconUrl: open ? '/img/branch.png' : '/img/branch_closed.png', iconSize: [48, 76], iconAnchor: [24, 72], className: open ? '' : 'closed' }),
    });
    m.on('click', () => selectBranch(b.id));
    M.cluster.addLayer(m); M.markers[b.id] = m;
  });
  map.addLayer(M.cluster);
  const pts = branches().map(b => [b.lat, b.lng]);
  if (pts.length) map.fitBounds(pts, { padding: [60, 60], maxZoom: 12 });
}
function renderPickupSheet() {
  const sh = $('#msheet'); const q = M.q.trim().toLowerCase();
  const list = branches().filter(b => (!M.onlyOpen || isOpen(b)) && (!q || (b.name + ' ' + b.address + ' ' + b.city).toLowerCase().includes(q)));
  sh.innerHTML = `
    <div class="chip-country">${flag} Узбекистан</div>
    <label class="field single" style="height:62px"><input id="bq" placeholder="Найти пиццерию" value="${esc(M.q)}" autocomplete="off"></label>
    <div class="filters"><button class="f ${M.onlyOpen ? 'on' : ''}" onclick="M.onlyOpen=!M.onlyOpen;renderPickupSheet()">Открыто</button></div>
    ${(q || M.onlyOpen) ? `<div class="search-list" style="margin-top:12px">${list.map(b => `<div class="it" onclick="selectBranch(${b.id},true)"><b>${esc(b.city)}, ${esc(b.address)}</b><span>${isOpen(b) ? 'Открыто до ' + fmtT(b.close_time) : 'Закрыто'}</span></div>`).join('') || '<div class="empty" style="padding:20px">Ничего не найдено</div>'}</div>` : ''}`;
  const bq = $('#bq'); bq.oninput = () => { const pos = bq.selectionStart; M.q = bq.value; renderPickupSheet(); const n = $('#bq'); n.focus(); n.setSelectionRange(pos, pos); };
}
function selectBranch(id, fly) {
  const b = branches().find(x => x.id === id); if (!b) return;
  M.selBranch = id;
  if (fly) St.map.flyTo([b.lat, b.lng], 16, { duration: .6 });
  else St.map.panTo([b.lat, b.lng]);
  const open = isOpen(b);
  $('#msheet').innerHTML = `
    <div class="br-top"><button class="pill" onclick="A.routes(${b.id})">${I.route(22)} Маршрут</button><button class="circle" style="width:44px;height:44px" onclick="renderPickupSheet();M.selBranch=null">${I.xw(20)}</button></div>
    <div class="br-city">${esc(b.city)}</div>
    <div class="br-addr">${esc(b.address)}</div>
    <div class="br-open">${open ? `<span class="g">Открыто</span> до ${fmtT(b.close_time)}` : `<span class="r">Закрыто</span> · откроется в ${fmtT(b.open_time)}`}</div>
    <div class="kv"><div class="k">Время работы</div><div>${fmtT(b.open_time)} - ${fmtT(b.close_time)} Пн, Вт, Ср, Чт, Пт, Сб, Вс</div>
      ${b.phone ? `<div class="k">Телефон</div><a class="orange" href="tel:${esc(b.phone.replace(/[^+\d]/g, ''))}" style="text-decoration:none">${esc(b.phone)}</a>` : ''}</div>
    <button class="btn" onclick="chooseBranch(${b.id})">Заказать здесь</button>`;
}
function chooseBranch(id) {
  St.branchId = id; St.mode = 'pickup'; LS.set('branchId', id); LS.set('mode', 'pickup');
  const after = St.afterMap; St.afterMap = null; go('home'); if (after) after();
}
A.routes = id => {
  const b = branches().find(x => x.id === id);
  const ll = `${b.lat},${b.lng}`;
  const links = {
    yandex: `https://yandex.com/maps/?rtext=~${ll}&rtt=auto`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    apple: `https://maps.apple.com/?daddr=${ll}&dirflg=d`,
  };
  const isApple = /iPhone|iPad|Macintosh/.test(navigator.userAgent);
  Sh.open('routes', () => `<div class="grab"></div><div class="body" style="padding:14px 16px 8px">
    <h2 style="text-align:center;font-size:27px;margin:20px 0 26px">Выберите карты</h2>
    <div style="display:flex;justify-content:center;gap:34px;margin-bottom:30px">
      <a href="${links.yandex}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center;font-size:19px">${I.yandex(76)}<div style="margin-top:8px">Яндекс</div></a>
      <a href="${links.google}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center;font-size:19px">${I.google(76)}<div style="margin-top:8px">Google</div></a>
      ${isApple ? `<a href="${links.apple}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center;font-size:19px">${I.apple(76)}<div style="margin-top:8px">Apple</div></a>` : ''}
    </div>
    <div style="display:flex;justify-content:center"><button class="pill" style="height:58px;padding:0 28px" onclick="A.copyLink('${esc(links.google)}')">${I.copy(24)} Скопировать адрес</button></div></div><div style="height:24px"></div>`);
};
A.copyLink = async url => {
  try { await navigator.clipboard.writeText(url); } catch {
    const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* ignore */ } t.remove();
  }
  toast('Ссылка скопирована'); Sh.close('routes');
};

/* ============ home / menu ============ */
const avatarColor = () => ['#ffc2d6', '#c9e7ff', '#d9f5c6', '#ffe3b0', '#e2d4ff'][(Number((St.user?.phone || '0').slice(-1)) || 0) % 5];
function ph(p) {
  const cat = St.menu.categories.find(c => c.id === p.category_id);
  return PH[cat?.icon] || PH.burger;
}
const imgOf = p => p.image ? `style="background-image:url('${esc(p.image)}')"` : '';
function pillInner(p) {
  const n = qty(p.id);
  if (St.mode === 'pickup' && St.branchId && (St.menu.stock_off?.[St.branchId] || []).includes(p.id)) return `<button class="price-pill" disabled style="opacity:.5">Нет в наличии</button>`;
  if (n > 0) return `<div class="stepper"><button onclick="A.dec(${p.id})">${I.minus()}</button><b>${n}</b><button onclick="A.add(${p.id})">${I.plus(22)}</button></div>`;
  return `<button class="price-pill" onclick="A.add(${p.id})">${p.old_price ? `<s>${money(p.old_price)}</s>` : ''}${money(p.price)}</button>`;
}
function productCard(p) {
  if (p.big) return `<div class="big" onclick="A.product(${p.id})">
    <div class="im" ${imgOf(p)}>${p.image ? '' : ph(p)}</div>
    <div class="bigb">${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}<h3>${esc(loc(p, 'name'))}</h3><p>${esc(loc(p, 'description'))}</p>
    <div class="prow" onclick="event.stopPropagation()">${p.old_price ? `<s>${money(p.old_price)}</s>` : ''}<div data-pill="${p.id}" style="min-width:180px">${pillInner(p)}</div></div></div></div>`;
  return `<div class="pc" onclick="A.product(${p.id})">${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
    <div class="im" ${imgOf(p)}>${p.image ? '' : ph(p)}</div><h3>${esc(loc(p, 'name'))}</h3><p>${esc(loc(p, 'description'))}</p>
    <div data-pill="${p.id}" onclick="event.stopPropagation()">${pillInner(p)}</div></div>`;
}
function headerTitle() {
  if (St.mode === 'pickup') { const b = curBranch(); return b ? `${b.address}` : 'Выберите пиццерию'; }
  const a = curAddr(); return a ? a.address : 'Укажите адрес доставки';
}
function homeView() {
  const v = $('#view'); const m = St.menu;
  if (!St.cat) St.cat = m.categories[0]?.id;
  v.innerHTML = `
  <div class="view" style="background:#000">
    <div class="home-head">
      <button class="circle" style="width:52px;height:52px" onclick="A.addrSheet()">${St.mode === 'pickup' ? I.fork(26, '#e2203d') : I.walk(26, '#e2203d')}</button>
      <button class="addr" onclick="A.addrSheet()"><span>${esc(headerTitle())}</span>${I.down(20)}</button>
      <button class="avatar" onclick="A.profile()">${avatarInner()}</button>
    </div>
    <div class="home-body" id="hb">
      <div class="stories">${m.banners.map(b => `<div class="story" style="background-color:${esc(b.color)};${b.image ? `background-image:url('${esc(b.image)}')` : ''}"><span>${esc(loc(b, 'title'))}</span></div>`).join('')}</div>
      <div class="catbar" id="catbar"><button class="sbtn" onclick="A.toggleSearch()">${I.search()}</button><button class="sbtn coinbtn" onclick="A.coinShop()" aria-label="WendyCoin"><img src="/img/coin.png" alt=""></button>
        ${m.categories.map(c => `<button class="ch ${c.id === St.cat ? 'on' : ''}" data-cat="${c.id}" onclick="A.gotoCat(${c.id})">${esc(loc(c, 'name'))}</button>`).join('')}</div>
      ${St.searchOpen ? `<div class="searchrow"><input id="sq" placeholder="Поиск по меню" value="${esc(St.q)}"></div>` : ''}
      <div id="sections"></div>
      <div style="height:110px"></div>
    </div>
    <div id="fab"></div>
  </div>`;
  renderSections(); renderFab();
  const hb = $('#hb');
  hb.addEventListener('scroll', () => {
    if (St.q || St.lock) return;
    const top = hb.getBoundingClientRect().top + 110; let cur = St.cat;
    document.querySelectorAll('[data-sec]').forEach(s => { if (s.getBoundingClientRect().top <= top) cur = Number(s.dataset.sec); });
    if (cur !== St.cat) {
      St.cat = cur;
      document.querySelectorAll('.catbar .ch').forEach(c => { const on = Number(c.dataset.cat) === cur; c.classList.toggle('on', on); if (on) centerChip(c); });
    }
  }, { passive: true });
  const sq = $('#sq'); if (sq) { sq.focus(); sq.oninput = () => { St.q = sq.value; renderSections(); }; }
}
function renderSections() {
  const m = St.menu, q = St.q.trim().toLowerCase();
  let html = '';
  for (const c of m.categories) {
    let items = m.products.filter(p => p.category_id === c.id);
    if (q) items = items.filter(p => (p.name + ' ' + p.description + ' ' + loc(p, 'name') + ' ' + loc(p, 'description')).toLowerCase().includes(q));
    if (!items.length) continue;
    const bigs = items.filter(p => p.big), smalls = items.filter(p => !p.big);
    html += `<section data-sec="${c.id}"><div class="sec-title">${esc(loc(c, 'name'))}</div>${bigs.map(productCard).join('')}${smalls.length ? `<div class="grid" style="margin-top:12px">${smalls.map(productCard).join('')}</div>` : ''}</section>`;
  }
  $('#sections').innerHTML = html || '<div class="empty">Ничего не найдено</div>';
}
function renderFab() {
  const f = $('#fab'); if (!f) return;
  const n = cartCount();
  f.innerHTML = n ? `<button class="cart-fab" onclick="A.cart()">${I.bag(30)}${money(totals().total)}</button>` : '';
}
A.toggleSearch = () => { St.searchOpen = !St.searchOpen; if (!St.searchOpen) St.q = ''; homeView(); };
const centerChip = c => { const bar = c.parentElement; bar.scrollTo({ left: c.offsetLeft - (bar.clientWidth - c.offsetWidth) / 2, behavior: 'smooth' }); };
A.gotoCat = id => {
  St.q = ''; St.cat = id; St.lock = true;
  const s = document.querySelector(`[data-sec="${id}"]`); const hb = $('#hb');
  if (s) hb.scrollTo({ top: Math.max(0, s.offsetTop - 64), behavior: 'smooth' });
  document.querySelectorAll('.catbar .ch').forEach(c => { const on = Number(c.dataset.cat) === id; c.classList.toggle('on', on); if (on) centerChip(c); });
  clearTimeout(A.gotoCat.t); A.gotoCat.t = setTimeout(() => { St.lock = false; }, 1200);
};
A.product = id => {
  const p = prod(id);
  Sh.open('product', () => `<div class="grab"></div><div class="body" style="padding:0 0 8px">
    <div class="pc" style="background:none;min-height:0;cursor:default;padding:12px 16px">
      <div class="im" style="aspect-ratio:1.2;background-color:#1b1b1e;background-size:cover;background-position:center;${p.image ? `background-image:url('${esc(p.image)}')` : ''}">${p.image ? '' : ph(p)}</div>
      <h3 style="font-size:28px;margin:16px 0 8px">${esc(loc(p, 'name'))}</h3><p style="font-size:16px;-webkit-line-clamp:unset;margin:0 0 4px">${esc(loc(p, 'description'))}</p></div>${(p.addons || []).map(prod).filter(Boolean).length ? `<div style="padding:4px 16px 8px"><div class="h2" style="font-size:21px;margin:14px 0 12px">С этим берут</div><div class="hscroll">${p.addons.map(prod).filter(Boolean).map(a => `<div class="rec"><div class="im" ${imgOf(a)}>${a.image ? '' : ph(a)}</div><b>${esc(loc(a, 'name'))}</b><span></span><div data-pill="${a.id}">${pillInner(a)}</div></div>`).join('')}</div></div>` : ''}</div>
    <div class="foot">${p.coin_cost > 0 && St.user ? `<button class="btn gray" style="margin-bottom:10px" onclick="A.addCoin(${p.id});Sh.close('product')">${I.coin(22)}&nbsp;Обменять на ${p.coin_cost} WendyCoin</button>` : ''}<button class="btn" onclick="A.add(${p.id});Sh.close('product')">Добавить в корзину за ${money(p.price)}</button></div>`);
};

/* address / mode sheet */
A.addrSheet = () => Sh.open('addr', () => `<div class="grab"></div><div class="body">
  <div class="seg" style="position:static;margin:8px 0 18px;padding:5px">
    <button class="${St.mode === 'delivery' ? 'on' : ''}" onclick="A.setMode('delivery')">${I.walk(22, '#fff')} Доставка</button>
    <button class="${St.mode === 'pickup' ? 'on' : ''}" onclick="A.setMode('pickup')">${I.fork(22)} В пиццерии</button></div>
  ${St.mode === 'delivery' ? `
    ${St.addresses.map(a => `<div class="list-it ${a.id === St.addrId ? 'on' : ''}" onclick="A.pickAddr(${a.id})"><div style="min-width:0"><b>${esc(a.address)}</b><small>${esc([a.entrance && 'подъезд ' + a.entrance, a.floor && 'этаж ' + a.floor, a.apartment && 'кв. ' + a.apartment].filter(Boolean).join(', ') || { home: 'Дом', work: 'Работа', other: 'Другое' }[a.label])}</small></div><button onclick="event.stopPropagation();A.delAddr(${a.id})">${I.trash(22, '#8e8e93')}</button></div>`).join('')}
    <button class="btn gray" style="margin-top:6px" onclick="A.openMap('delivery')">${I.plus(20)} Добавить адрес</button>`
    : `<div class="list-it" onclick="A.openMap('pickup')"><div><b>${esc(curBranch()?.address || 'Выберите пиццерию')}</b><small>${curBranch() ? esc(curBranch().city) + ' · ' + fmtT(curBranch().open_time) + ' - ' + fmtT(curBranch().close_time) : 'На карте'}</small></div>${I.right()}</div>`}
  </div>`);
A.setMode = m => {
  St.mode = m; LS.set('mode', m);
  if ((m === 'delivery' && !curAddr()) || (m === 'pickup' && !curBranch())) { Sh.close('addr'); return go('map', m); }
  Sh.close('addr'); homeView(); cartChanged();
};
A.pickAddr = id => { St.addrId = id; LS.set('addrId', id); St.mode = 'delivery'; LS.set('mode', 'delivery'); Sh.close('addr'); homeView(); if (Sh.stack.checkout) refreshQuote().then(() => Sh.refresh('checkout')); };
A.delAddr = async id => {
  try { await api('/addresses/' + id, { method: 'DELETE' }); St.addresses = St.addresses.filter(a => a.id !== id); if (St.addrId === id) { St.addrId = St.addresses[0]?.id || null; LS.set('addrId', St.addrId); } homeView(); A.addrSheet(); } catch (e) { toast(e.message); }
};
A.openMap = (m, after) => { St.afterMap = after || null; go('map', m); };

/* ============ cart sheet ============ */
A.cart = () => Sh.open('cart', renderCart, 'tall');
function renderCart() {
  const t = totals(); const n = cartCount();
  if (!n) return `<div class="grab"></div><div class="empty">Корзина пуста</div>`;
  const rec = St.menu.products.filter(p => p.recommended && !qty(p.id));
  return `<div class="grab"></div>
  <div class="sh-head"><button class="link-or" onclick="Sh.close('cart')">Закрыть</button><button onclick="A.clearCart()">${I.trash()}</button></div>
  <div class="body">
    ${St.cart.map(c => { const p = prod(c.id); const coin = !!c.coin; return `<div class="ci"><div class="th" ${imgOf(p)}>${p.image ? '' : ph(p)}</div><div class="inf"><h4>${esc(loc(p, 'name'))}</h4>
      <div class="gray-t" style="font-size:15px;line-height:1.3">${coin ? 'Обмен на WendyCoin' : esc(loc(p, 'description').slice(0, 60))}</div>
      <div class="bot"><div class="st"><button onclick="${coin ? 'A.decCoin' : 'A.dec'}(${p.id})">${I.minus()}</button><b>${c.qty}</b><button onclick="${coin ? 'A.addCoin' : 'A.add'}(${p.id})">${I.plus(22)}</button></div>
      <div class="pr">${coin ? `<span class="coin-sm" style="font-size:19px">${p.coin_cost * c.qty} ${I.coin(20)}</span>` : `${p.old_price ? `<s>${money(p.old_price * c.qty)}</s>` : ''}${money(p.price * c.qty)}`}</div></div></div></div>`; }).join('')}
    ${rec.length ? `<div class="h2">Всегда кстати</div><div class="hscroll">${rec.map(p => `<div class="rec"><div class="im" ${imgOf(p)}>${p.image ? '' : ph(p)}</div><b>${esc(loc(p, 'name'))}</b><span></span><button class="price-pill" style="height:42px;font-size:15px" onclick="A.add(${p.id})">${money(p.price)}</button></div>`).join('')}</div>` : ''}
    ${St.promo ? `<div class="promo-ok"><div><b>${esc(St.promo.code)}</b><br><span>${St.promo.percent ? '−' + St.promo.percent + '%' : '−' + money(St.promo.fixed)} применён</span></div><button class="gray-t" onclick="A.removePromo()">${I.x('#8e8e93', 24)}</button></div>`
      : St.promoOpen ? `<div class="promo-box"><input id="pc" placeholder="Промокод" autocapitalize="characters" autocomplete="off" maxlength="30"><button onclick="A.applyPromo()">Применить</button></div><div class="err" id="perr" style="margin:6px 0 0"></div>`
        : `<button class="btn gray promo-btn" onclick="A.openPromo()">Ввести промокод</button>`}
    <div class="h2" style="margin-top:28px">Детали</div>
    <div class="det"><span>${n} ${plural(n, 'товар', 'товара', 'товаров')}</span><span>${money(t.sub)}</span></div>
    ${t.discount ? `<div class="det"><span>Скидка по промокоду</span><span style="color:var(--green)">−${money(t.discount)}</span></div>` : ''}
    <div class="det"><span>WendyCoin</span><span class="coin-sm">+${new Intl.NumberFormat('ru-RU').format(t.coins).replace(/\s/g, NB)} ${I.coin(20)}</span></div>
    ${t.spent ? `<div class="det"><span>Оплата WendyCoin</span><span class="coin-sm">−${t.spent} ${I.coin(20)}</span></div>` : ''}
    <div style="height:10px"></div>
  </div>
  <div class="foot"><button class="btn" onclick="A.checkout()"><span style="font-size:20px">${money(t.total)} ${t.full > t.total ? `<s style="opacity:.6;font-size:18px;margin-left:6px">${money(t.full)}</s>` : ''}</span><small>Оформить заказ</small></button></div>`;
}
A.openPromo = () => {
  St.promoOpen = true; Sh.refresh('cart');
  const i = $('#pc'); if (i) { i.focus(); i.oninput = () => { const p = i.selectionStart; i.value = i.value.toUpperCase(); i.setSelectionRange(p, p); }; i.onkeydown = e => { if (e.key === 'Enter') A.applyPromo(); }; }
};
A.applyPromo = async () => {
  const code = ($('#pc').value || '').trim().toUpperCase(); if (!code) return;
  try {
    const r = await api('/promo/check', { body: { code, subtotal: totals().sub } });
    St.promo = { code: r.code, percent: r.percent, fixed: r.fixed }; LS.set('promo', St.promo); St.promoOpen = false; cartChanged();
  } catch (e) { $('#perr').textContent = e.message; }
};
A.removePromo = () => { St.promo = null; LS.del('promo'); St.promoOpen = false; cartChanged(); };

/* ============ checkout ============ */
A.checkout = async () => {
  if (!St.token) { Sh.closeAll(); toast('Войдите, чтобы оформить заказ'); return go('login'); }
  St.pay = St.pay || 'card';
  if (St.mode === 'pickup' && curBranch()) { const b = curBranch(); const s = slots(b); if (St.pickupTime !== 'asap' && !s.includes(St.pickupTime)) St.pickupTime = isOpen(b) ? 'asap' : (s[0] || 'asap'); if (St.pickupTime === 'asap' && !isOpen(b)) St.pickupTime = s[0] || 'asap'; }
  St.quote = null;
  Sh.open('checkout', renderCheckout, 'full');
  await refreshQuote();
  Sh.refresh('checkout');
};
function payOpts() {
  return [
    { id: 'card', html: `${I.card(26)} Новой картой` },
    ...St.cards.map(c => ({ id: 'c' + c.id, html: `${I.card(26)} ${esc(c.brand)} •••• ${esc(c.last4)}` })),
    { id: 'click', html: I.click(30) },
    { id: 'payme', html: I.payme(30) },
    { id: 'cash', html: `${I.cash(26)} Наличными` },
    ...(St.user ? [{ id: 'coins', html: `${I.coin(26)} WendyCoin · ${new Intl.NumberFormat('ru-RU').format(St.user.coins || 0).replace(/\s/g, NB)}` }] : []),
  ];
}
function renderCheckout() {
  const t = totals(); const n = cartCount(); const del = St.mode === 'delivery';
  const a = curAddr(), b = curBranch();
  let btnHTML = '', disabled = false, btnAct = 'A.placeOrder()';
  if (del) {
    if (!a) { btnHTML = 'Добавить адрес доставки'; btnAct = "Sh.close('checkout');A.openMap('delivery',A.checkout)"; }
    else if (St.quote && !St.quote.ok) { btnHTML = St.quote.error === 'closed' ? 'Пока не принимаем заказы' : St.quote.error === 'radius' ? 'Доставка недоступна' : 'Нет в наличии'; disabled = true; }
    else btnHTML = 'Оформить заказ';
  } else {
    if (!b) { btnHTML = 'Выбрать пиццерию'; btnAct = "Sh.close('checkout');A.openMap('pickup',A.checkout)"; }
    else btnHTML = 'Оформить заказ';
  }
  const coinNeed = Math.ceil(t.total / (St.menu.settings.coin_value || 1)) + t.spent;
  if (del && St.quote?.ok && St.quote.min_order > t.sub && !disabled) { btnHTML = `Минимальный заказ ${money(St.quote.min_order)}`; disabled = true; }
  if (St.pay === 'coins' && !disabled) {
    if (coinNeed > (St.user?.coins || 0)) { btnHTML = `Не хватает ${coinNeed - (St.user?.coins || 0)} WendyCoin`; disabled = true; }
    else btnHTML = `Оплатить ${coinNeed} WendyCoin`;
  }
  if (St.pay === 'card' && t.total > 0 && !disabled && btnAct === 'A.placeOrder()') { btnHTML = `Добавить карту<small>И оплатить заказ</small>`; btnAct = 'A.cardForm(true)'; }
  const sl = b ? slots(b) : [];
  return `<div class="sh-head" style="padding:max(14px,env(safe-area-inset-top)) 16px 0"><button onclick="Sh.close('checkout')">${I.x()}</button></div>
  <div class="body" style="padding-top:0">
    <div class="co-title">${del ? 'Доставка' : 'В пиццерии'}</div>
    ${del ? `
      <button class="co-row" onclick="A.checkoutAddr()"><span>${a ? `<b style="font-weight:600">${esc(a.address)}</b><small>${esc([a.entrance && 'подъезд ' + a.entrance, a.floor && 'этаж ' + a.floor, a.apartment && 'кв. ' + a.apartment].filter(Boolean).join(', '))}</small>` : 'Добавить адрес'}</span>${a ? I.right() : I.plus(30)}</button>
      <div class="co-sec">Время доставки</div>
      ${St.quote && !St.quote.ok ? `<div class="co-note">${I.clock(34)}<div><b>${St.quote.error === 'closed' ? 'Пока не принимаем заказы' : 'Доставка недоступна'}</b><span>${esc(St.quote.message)}</span></div></div>`
        : `<div class="co-note">${I.clock(34)}<div><b>Как можно скорее</b><span class="gray-t">Обычно 40–60 минут</span></div></div>${St.quote?.ok ? `<div class="co-note" style="margin-top:10px">${I.pinI(30)}<div><b>Готовит: ${esc(St.quote.branch.name)}</b><span class="gray-t">≈ ${St.quote.distance_km} км от вас</span></div></div>` : ''}`}`
    : `
      <button class="co-row" onclick="Sh.close('checkout');A.openMap('pickup',A.checkout)"><span>${b ? `<b style="font-weight:600">${esc(b.city)}, ${esc(b.address)}</b><small>С ${fmtT(b.open_time)} до ${fmtT(b.close_time)}</small>` : 'Выбрать пиццерию'}</span>${I.right()}</button>
      <div class="co-sec">Время выдачи</div>
      <div class="opts">
        <button class="opt ${St.pickupTime === 'asap' ? 'on' : ''} ${b && isOpen(b) ? '' : 'dis'}" onclick="${b && isOpen(b) ? "A.setTime('asap')" : "toast('Сейчас закрыто, выберите время')"}">Побыстрее</button>
        ${sl.slice(0, 2).map(s => `<button class="opt ${St.pickupTime === s ? 'on' : ''}" onclick="A.setTime('${s}')">${s}</button>`).join('')}
        <button class="opt ${St.pickupTime !== 'asap' && !sl.slice(0, 2).includes(St.pickupTime) ? 'on' : ''}" onclick="A.otherTime()">${St.pickupTime !== 'asap' && !sl.slice(0, 2).includes(St.pickupTime) ? St.pickupTime : 'Другое'}</button></div>
      <div class="co-sec">Способ получения</div>
      <div class="opts">${[['tray', 'Выдать<br>на подносе'], ['takeaway', 'Самовывоз'], ['table', 'Принести<br>к столику']].map(([k, tx]) => `<button class="meth ${St.pickupMethod === k ? 'on' : ''}" onclick="St.pickupMethod='${k}';Sh.refresh('checkout')">${ILL[k]}${tx}</button>`).join('')}</div>`}
    <div class="co-sec">Оплата</div>
    <div class="opts">${payOpts().map(o => `<button class="opt ${St.pay === o.id ? 'on' : ''}" onclick="St.pay='${o.id}';Sh.refresh('checkout')">${o.html}</button>`).join('')}</div>
    <div class="co-sec">Детали</div>
    <div class="det"><span>${n} ${plural(n, 'товар', 'товара', 'товаров')}</span><span>${money(t.sub)}</span></div>
    ${t.discount ? `<div class="det"><span>Промокод ${esc(St.promo.code)}</span><span style="color:var(--green)">−${money(t.discount)}</span></div>` : ''}
    <div class="det"><span>WendyCoin</span><span class="coin-sm">+${new Intl.NumberFormat('ru-RU').format(t.coins).replace(/\s/g, NB)} ${I.coin(20)}</span></div>
    ${t.spent ? `<div class="det"><span>Оплата WendyCoin</span><span class="coin-sm">−${t.spent} ${I.coin(20)}</span></div>` : ''}
    ${del ? `<div class="det"><span>Доставка</span><span>${t.fee ? money(t.fee) : 'Бесплатно'}</span></div>${St.quote?.ok && St.quote.free_from > 0 && t.fee ? `<div class="hint" style="margin:0 0 6px">Бесплатная доставка от ${money(St.quote.free_from)}</div>` : ''}` : ''}
    <div style="height:30px"></div>
  </div>
  <div class="foot" style="background:#1a1a1d;border-radius:22px 22px 0 0"><div class="tot"><span>Итого</span><span>${money(t.total)}</span></div>
    <button class="btn ${disabled ? 'gray' : ''}" ${disabled ? 'disabled' : ''} onclick="${btnAct}">${btnHTML}</button></div>`;
}
A.checkoutAddr = () => { Sh.close('checkout'); A.addrSheet(); };
A.setTime = t => { St.pickupTime = t; Sh.refresh('checkout'); };
A.otherTime = () => {
  const b = curBranch(); const s = slots(b);
  Sh.open('time', () => `<div class="grab"></div><div class="body"><h2 style="margin:10px 0 16px;font-size:24px">Время выдачи</h2>
    ${s.length ? `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${s.map(x => `<button class="opt ${St.pickupTime === x ? 'on' : ''}" style="height:52px;padding:0;justify-content:center;font-size:17px" onclick="A.setTime('${x}');Sh.close('time')">${x}</button>`).join('')}</div>` : '<div class="empty">Сегодня филиал уже не работает</div>'}</div>`);
};

A.cardForm = (thenOrder) => Sh.open('card', () => `<div class="grab"></div><div class="body">
  <h2 style="margin:10px 0 6px;font-size:26px">Новая карта</h2>
  <div class="hint">Платёжная система пока не подключена: введите тестовую карту (например 4242 4242 4242 4242). Номер не сохраняется, хранятся только последние 4 цифры.</div>
  <label class="field"><label>Номер карты</label><input id="cn" inputmode="numeric" maxlength="19" autocomplete="cc-number" placeholder="0000 0000 0000 0000"></label>
  <label class="field"><label>Срок действия</label><input id="ce" inputmode="numeric" maxlength="5" autocomplete="cc-exp" placeholder="ММ/ГГ"></label>
  <div class="err" id="cerr"></div></div>
  <div class="foot"><button class="btn" onclick="A.saveCard(${thenOrder ? 'true' : 'false'})">${thenOrder ? 'Добавить и оплатить' : 'Добавить карту'}</button></div>`, '', null);
document.addEventListener('input', e => {
  if (e.target.id === 'cn') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  if (e.target.id === 'ce') { let v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); e.target.value = v; }
});
A.saveCard = async thenOrder => {
  try {
    const r = await api('/cards', { body: { number: $('#cn').value, exp: $('#ce').value } });
    St.cards.push(r.card); St.pay = 'c' + r.card.id; Sh.close('card');
    if (thenOrder) A.placeOrder(); else { Sh.refresh('cards'); Sh.refresh('checkout'); }
  } catch (e) { $('#cerr').textContent = e.message; }
};

A.placeOrder = async () => {
  const del = St.mode === 'delivery';
  const pay = St.pay.startsWith('c') && !['cash', 'click', 'coins'].includes(St.pay) ? 'card' : St.pay;
  try {
    const body = { type: del ? 'delivery' : 'pickup', items: St.cart.map(c => ({ product_id: c.id, qty: c.qty, with_coins: !!c.coin })), promo: St.promo?.code || '', payment: pay === 'card' ? 'card' : pay };
    if (del) body.address_id = St.addrId; else { body.branch_id = St.branchId; body.pickup_time = St.pickupTime; body.pickup_method = St.pickupMethod; }
    const r = await api('/orders', { body });
    St.cart = []; St.promo = null; LS.del('promo'); saveCart();
    api('/me').then(m => { St.user = m.user; }).catch(() => { });
    Sh.closeAll(); renderFab(); homeView();
    Sh.open('done', () => `<div class="body"><div class="success"><div class="ok">${I.check(54)}</div><h2>Заказ №${r.order.id} оформлен</h2>
      <p>Готовит: ${esc(r.branch_name)}<br>${del ? 'Мы сообщим, когда ресторан примет заказ и курьер выедет к вам.' : `Заказ будет готов ${r.order.pickup_time === 'asap' ? 'как можно скорее' : 'к ' + esc(r.order.pickup_time)}.`}<br>Сумма: ${money(r.order.total)}${r.order.coins_spent ? ` + ${r.order.coins_spent} WendyCoin` : ''}</p></div></div>
      <div class="foot"><button class="btn" onclick="Sh.close('done')">Отлично</button></div>`);
  } catch (e) { toast(e.message); }
};

/* ============ profile ============ */
A.profile = async () => {
  if (!St.token) return go('login');
  api('/orders').then(r => { St.orders = r.orders; Sh.refresh('profile'); }).catch(() => { });
  Sh.open('profile', renderProfile, 'full');
};
const ST_NAMES = { new: 'Ожидает подтверждения', cooking: 'Готовится', ready: 'Готов', delivering: 'В пути', done: 'Выполнен', cancelled: 'Отменён' };
function renderProfile() {
  const u = St.user || {}; const promos = St.menu.promos || [];
  return `<div class="sh-head" style="padding:max(14px,env(safe-area-inset-top)) 16px 0"><button class="circle" style="width:50px;height:50px" onclick="Sh.close('profile')">${I.xw(22)}</button>
    <div style="display:flex;align-items:center;gap:8px"><button class="pill" style="height:50px" onclick="A.support()">${I.support(22)} Поддержка</button>
    <div style="display:flex;align-items:center"><div class="avatar" style="width:50px;height:50px">${avatarInner()}</div><button class="circle" style="width:50px;height:50px;margin-left:-8px;background:#1b1b1e;border:3px solid var(--bg)" onclick="A.settings()">${I.gear(22)}</button></div></div></div>
  <div class="body" style="padding-top:14px">
    <div style="font-size:30px;font-weight:700;margin:6px 4px 16px">${esc(u.name || 'Гость')}<div class="gray-t" style="font-size:16px;font-weight:600;margin-top:2px">${esc(u.phone || '')}</div></div>
    <div class="tiles">
      <button class="tile dash" onclick="Sh.close('profile');A.coinShop()"><div>${I.coin(54)}</div><div><div class="orange" style="font-size:24px">${new Intl.NumberFormat('ru-RU').format(u.coins || 0).replace(/\s/g, NB)} WendyCoin</div><span class="tag" style="margin-top:10px">Копите коины</span></div></button>
      <button class="tile" onclick="Sh.close('profile')"><span>${St.orders.length ? 'Закажите ещё' : 'Сделайте первый заказ'}</span><span class="tag">Смотреть меню</span></button>
      <button class="tile" onclick="A.cards()"><span>${I.card(40)}<br>Способы оплаты</span><span class="tag">Карты</span></button>
      <button class="tile" onclick="Sh.close('profile');A.addrSheet()"><span>${I.pinI(38)}<br>Мои адреса</span><span class="tag">Адреса</span></button>
    </div>
    ${promos.length ? `<div class="h2">Акции</div>${promos.map(p => `<div class="tk"><div class="tk-l"><div><div class="tk-eb">${esc(loc(p, 'info') || 'НА ЛЮБОЙ ТИП ЗАКАЗА')}</div><div class="tk-h">${esc(loc(p, 'title'))}</div>${p.valid_until ? `<div class="tk-d">до ${new Date(p.valid_until + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>` : ''}</div>${St.promo?.code === p.code ? `<button class="tk-btn" onclick="A.removePromo();Sh.refresh('profile')">Отменить</button>` : `<button class="tk-btn" onclick="A.usePromo('${esc(p.code)}')">Применить</button>`}</div><div class="tk-r"><div class="tk-info">${I.info(11, '#bcbcc2')}</div><div class="tk-art"><img class="tk-gold" src="/img/coin.png" alt=""><div class="tk-pc">%</div><span class="tk-star s1">✦</span><span class="tk-star s2">✦</span></div></div></div>`).join('')}` : ''}
    ${St.orders.length ? `<div class="h2">Мои заказы</div>${St.orders.map(o => `<div class="ord"><div class="t"><span>Заказ №${o.id}</span><span>${money(o.total)}</span></div>
      <div class="s"><span class="st-tag">${ST_NAMES[o.status] || o.status}</span> · ${o.type === 'delivery' ? 'Доставка' : 'В пиццерии'} · ${esc(String(o.created_at).slice(0, 16))}<br>${o.items.map(i => esc(prod(i.product_id) ? loc(prod(i.product_id), 'name') : i.name) + ' × ' + i.qty).join(', ')}</div>${orderActions(o)}</div>`).join('')}` : ''}
    <div style="height:20px"></div>
  </div>
  <a class="powered pf" href="https://t.me/anvarbek707" target="_blank" rel="noopener">Powered by <i></i> <b>ITG</b></a>`;
}
A.usePromo = async code => {
  try { const r = await api('/promo/check', { body: { code, subtotal: Math.max(totals().sub, 1) } }); St.promo = { code: r.code, percent: r.percent, fixed: r.fixed }; LS.set('promo', St.promo); toast('Промокод ' + code + ' применён'); Sh.refresh('profile'); } catch (e) { toast(e.message); }
};
A.cards = () => Sh.open('cards', () => `<div class="grab"></div><div class="body"><h2 style="margin:10px 0 16px;font-size:26px">Способы оплаты</h2>
  ${St.cards.map(c => `<div class="list-it"><div>${I.card(22)} <b>${esc(c.brand)} •••• ${esc(c.last4)}</b><small>до ${esc(c.exp)}</small></div><button onclick="A.delCard(${c.id})">${I.trash(22, '#8e8e93')}</button></div>`).join('') || '<div class="empty" style="padding:24px">Карт пока нет</div>'}
  <button class="btn" style="margin-top:8px" onclick="A.cardForm(false)">Добавить карту</button></div>`);
A.delCard = async id => { try { await api('/cards/' + id, { method: 'DELETE' }); St.cards = St.cards.filter(c => c.id !== id); if (St.pay === 'c' + id) St.pay = 'card'; Sh.refresh('cards'); } catch (e) { toast(e.message); } };
const avatarInner = () => `<img src="/img/avatars/${St.user?.avatar > 0 ? St.user.avatar : 9}.png" alt="">`;
A.settings = () => {
  if (!St.token) return go('login');
  St.draft = { name: St.user.name, notify: !!St.user.notify };
  Sh.open('settings', renderSettings, 'full');
};
const fmtFull = p => '+998 ' + p.slice(4, 6) + ' ' + p.slice(6, 9) + ' ' + p.slice(9, 11) + ' ' + p.slice(11, 13);
function renderSettings() {
  const u = St.user, d = St.draft;
  return `<div class="sh-head" style="padding:max(14px,env(safe-area-inset-top)) 18px 0;justify-content:flex-end"><button class="link-or" onclick="A.saveSettings()">Готово</button></div>
  <div class="body" style="padding:0">
    <div style="position:relative;width:184px;height:184px;margin:10px auto 36px"><div class="ava-big">${avatarInner()}</div>
      <button class="pill" style="position:absolute;left:50%;bottom:-22px;transform:translateX(-50%);white-space:nowrap;background:#2c2c30" onclick="A.avatarPicker()">Изменить аватар</button></div>
    <div class="set-f"><small>Ваше имя в ${esc(St.menu.settings.brand)}</small><input id="sn" value="${esc(d.name)}" maxlength="30" oninput="St.draft.name=this.value"></div>
    <button class="set-f" style="width:100%;text-align:left" onclick="A.changePhone()"><small>Телефон</small><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:19px">${esc(fmtFull(u.phone))}</span><span class="link-or" style="font-size:15px">Изменить</span></div></button>
    <div class="set-f" style="display:flex;align-items:center;gap:14px;border:0"><div style="flex:1"><b style="font-size:19px">Разрешить уведомления</b><small style="margin:4px 0 0">О рекламных предложениях и новинках в пушах и СМС</small></div><div class="sw ${d.notify ? 'on' : ''}" onclick="St.draft.notify=!St.draft.notify;this.classList.toggle('on',St.draft.notify)"></div></div>
    <div style="height:14px;background:#000"></div>
    <button class="set-r" onclick="A.langSheet()"><span>Язык приложения</span><span style="display:flex;align-items:center;gap:8px"><span class="gray-t">${LANG === 'uz' ? 'O‘zbekcha' : 'Русский'}</span>${I.right()}</span></button>
    <button class="set-r" onclick="A.legal()">Правовые документы ${I.right()}</button>
    <div style="height:14px;background:#000"></div>
    <button class="set-r" onclick="A.logout()">Выйти из профиля</button>
    <button class="set-r" style="color:var(--red)" onclick="A.deleteAccount()">Удалить аккаунт</button>
    <div style="height:30px"></div>
  </div>`;
}
A.saveSettings = async () => {
  try {
    const r = await api('/me', { method: 'PUT', body: { name: St.draft.name, notify: St.draft.notify } });
    St.user = r.user; Sh.close('settings'); homeView();
  } catch (e) { toast(e.message); }
};
A.avatarPicker = () => {
  St.pickAva = St.user.avatar || 9;
  Sh.open('avatar', () => {
    const cur = St.user.avatar || 9, sel = St.pickAva;
    return `<div class="sh-head" style="padding:max(14px,env(safe-area-inset-top)) 16px 0"><button onclick="Sh.close('avatar')">${I.x()}</button><b style="font-size:18px">Аватар</b><span style="width:28px"></span></div>
    <div style="flex:none;display:grid;place-items:center;padding:16px 0 26px"><div class="ava-big" style="width:230px;height:230px"><img src="/img/avatars/${sel}.png" alt=""></div></div>
    <div class="body" style="background:var(--card);border-radius:28px 28px 0 0;padding:20px 12px 110px">
      <div class="gray-t" style="font-size:13px;font-weight:600;letter-spacing:.04em;margin:0 8px 14px">ВАШИ АВАТАРЫ</div>
      <div class="ava-grid">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="ava-it ${n === sel ? 'on' : ''}" onclick="St.pickAva=${n};Sh.refresh('avatar')"><img src="/img/avatars/${n}.png" alt=""></button>`).join('')}</div></div>
    <div class="foot" style="position:absolute;left:0;right:0;bottom:0;background:linear-gradient(transparent,var(--card) 40%)"><button class="btn" ${sel === cur ? 'disabled' : ''} onclick="A.setAvatar()">${sel === cur ? 'Установлен' : 'Установить'}</button></div>`;
  }, 'full');
};
A.setAvatar = async () => {
  try { const r = await api('/me', { method: 'PUT', body: { avatar: St.pickAva } }); St.user = r.user; Sh.close('avatar'); Sh.refresh('settings'); homeView(); } catch (e) { toast(e.message); }
};

/* change phone: new number -> code sent to the NEW number -> confirm */
A.changePhone = () => {
  const S = { step: 1, digits: '', err: '', left: 0, t: null };
  const tickStart = left => {
    S.left = left; clearInterval(S.t);
    S.t = setInterval(() => {
      S.left = Math.max(0, S.left - 1);
      const n = $('#pcl'); if (n) n.textContent = S.left ? `Новый код через ${S.left} сек` : '';
      const b = $('#pcr'); if (b) b.disabled = S.left > 0;
      if (!S.left) clearInterval(S.t);
    }, 1000);
  };
  const render = () => {
    Sh.refresh('phonechg');
    const p = $('#pcp');
    if (p) {
      p.oninput = () => { let d = p.value.replace(/\D/g, ''); if (d.startsWith('998') && d.length > 9) d = d.slice(3); S.digits = d.slice(0, 9); p.value = fmtPhone(S.digits); $('#pcb').disabled = S.digits.length !== 9; $('#pce').textContent = ''; };
      p.focus();
    }
    const c = $('#pcc');
    if (c) { c.oninput = () => { c.value = c.value.replace(/\D/g, '').slice(0, 4); if (c.value.length === 4) A.pcVerify(); }; c.focus(); }
  };
  A.pcSend = async () => {
    if (S.digits.length !== 9) return;
    try {
      const r = await api('/me/phone/request', { body: { phone: '+998' + S.digits } });
      S.step = 2; render(); tickStart(r.resend_in);
    } catch (e) {
      if (e.data?.resend_in) { S.step = 2; render(); tickStart(e.data.resend_in); }
      else { const n = $('#pce'); if (n) n.textContent = e.message; }
    }
  };
  A.pcVerify = async () => {
    try {
      const r = await api('/me/phone/verify', { body: { phone: '+998' + S.digits, code: $('#pcc').value } });
      St.user = r.user; Sh.close('phonechg'); Sh.refresh('settings'); toast('Номер обновлён');
    } catch (e) { $('#pce').textContent = e.message; $('#pcc').value = ''; }
  };
  Sh.open('phonechg', () => S.step === 1 ? `<div class="grab"></div><div class="body" style="padding:12px 16px 16px">
      <h2 style="margin:10px 4px 18px;font-size:25px">Новый номер телефона</h2>
      <div class="phone-box"><div class="cc">+998</div><input id="pcp" type="tel" inputmode="numeric" placeholder="Номер телефона" maxlength="12" value="${fmtPhone(S.digits)}"></div>
      <div class="err" id="pce"></div></div>
      <div class="foot"><button class="btn" id="pcb" ${S.digits.length === 9 ? '' : 'disabled'} onclick="A.pcSend()">Получить код</button></div>`
    : `<div class="grab"></div><div class="body" style="padding:12px 16px 16px">
      <h2 style="margin:10px 4px 6px;font-size:25px">Введите код из <span style="color:var(--tg)">Telegram</span></h2>
      <div class="gray-t" style="margin:0 4px 18px">на номер +998 ${fmtPhone(S.digits)}</div>
      <input id="pcc" class="name-input" style="margin:0;letter-spacing:.6em;text-indent:.6em" inputmode="numeric" autocomplete="one-time-code" maxlength="4" placeholder="••••">
      <div class="err" id="pce"></div><div class="gray-t" id="pcl" style="text-align:center;margin-top:8px"></div></div>
      <div class="foot"><button class="btn gray" id="pcr" disabled onclick="A.pcSend()">Получить новый код</button></div>`,
  '', () => clearInterval(S.t));
  render();
};
A.deleteAccount = () => Sh.open('delacc', () => `<div class="grab"></div><div class="body" style="padding:18px 20px 8px">
  <h2 style="margin:6px 0 10px;font-size:25px">Удалить аккаунт?</h2>
  <p class="gray-t" style="font-size:16px;line-height:1.45;margin:0 0 6px">Будут безвозвратно удалены ваш профиль, адреса, карты, переписка с поддержкой и <b style="color:#fff">${new Intl.NumberFormat('ru-RU').format(St.user?.coins || 0).replace(/\s/g, NB)} WendyCoin</b>. Восстановить их будет нельзя.</p></div>
  <div class="foot"><button class="btn" style="background:var(--red)" onclick="A.deleteAccountGo()">Удалить навсегда</button><button class="btn gray" style="margin-top:10px" onclick="Sh.close('delacc')">Отмена</button></div>`);
A.deleteAccountGo = async () => {
  try {
    await api('/me', { method: 'DELETE' });
    logoutLocal(); St.addrId = null; St.branchId = null; St.orders = []; St.cart = []; St.promo = null; ['addrId', 'branchId', 'cart', 'promo'].forEach(k => LS.del(k)); PH_DIGITS = '';
    Sh.closeAll(); toast('Аккаунт удалён'); go('login');
  } catch (e) { toast(e.message); }
};
A.langSheet = () => Sh.open('lang', () => `<div class="grab"></div><div class="body" style="padding:14px 16px 6px">
  <h2 style="margin:6px 4px 16px;font-size:24px">Язык приложения</h2>
  ${[['ru', 'Русский'], ['uz', 'O‘zbekcha']].map(([k, t]) => `<button class="list-it ${LANG === k ? 'on' : ''}" onclick="setLang('${k}')"><b>${t}</b>${LANG === k ? I.check(22) : ''}</button>`).join('')}</div><div style="height:16px"></div>`);
A.logout = async () => { try { await api('/logout', { method: 'POST', body: {} }); } catch { /* ignore */ } logoutLocal(); St.addrId = null; St.orders = []; PH_DIGITS = ''; go('login'); };

/* ============ boot ============ */
async function loadUserData() {
  const [a, c] = await Promise.all([api('/addresses'), api('/cards')]);
  St.addresses = a.addresses; St.cards = c.cards;
  if (!St.addresses.find(x => x.id === St.addrId)) St.addrId = St.addresses[0]?.id || null;
  LS.set('addrId', St.addrId);
}
(async function boot() {
  try {
    St.menu = await api('/menu');
    if (St.token) {
      try { St.user = (await api('/me', { noLogout: true })).user; await loadUserData(); } catch { logoutLocal(); }
    }
    if (St.branchId && !curBranch()) St.branchId = null;
    cartChanged();
    go(St.user ? 'home' : 'login');
  } catch (e) {
    $('#view').innerHTML = `<div class="empty">Не удалось загрузить меню.<br>${esc(e.message)}</div>`;
  }
})();
