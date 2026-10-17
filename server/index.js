const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const express = require('express');
const db = require('./db');

const PORT = Number(process.env.PORT || 3000);
const TG_TOKEN = process.env.TELEGRAM_GATEWAY_TOKEN || '';
const CODE_TTL = 5 * 60; // seconds
const RESEND_COOLDOWN = 60; // seconds

const app = express();
const isReplitPreview = process.env.NODE_ENV === 'development' && !!process.env.REPLIT_DEV_DOMAIN;
app.set('trust proxy', 1); // behind the host's HTTPS proxy: real client IP for rate limits
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!isReplitPreview) res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', req.path.startsWith('/api') ? 'no-store' : 'no-cache');
  if (/^\/(admin|manager|courier|pos|analytics)(\/|$)/.test(req.path)) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://router.project-osrm.org; " + (isReplitPreview ? "" : "frame-ancestors 'none'; ") + "base-uri 'none'; form-action 'self'");
  }
  next();
});
app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.use(express.json({ limit: '12mb' }));
const paths = require('./paths');
app.use('/uploads', express.static(paths.uploadsDir), express.static(paths.repoUploads));
app.use(express.static(path.join(__dirname, '..', 'public'), { setHeaders: res => res.setHeader('Cache-Control', 'no-cache') })); // always revalidate: users get new JS right after an update

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, status, message) => res.status(status).json({ error: message });
const now = () => Math.floor(Date.now() / 1000);

// ---------- helpers ----------
const PHONE_RE = /^\+998\d{9}$/;

function tashkentMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const h = Number(parts.find(p => p.type === 'hour').value) % 24;
  return h * 60 + Number(parts.find(p => p.type === 'minute').value);
}
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
function openAt(b, m) {
  const o = toMin(b.open_time);
  let c = toMin(b.close_time);
  if (c === 0) c = 1440;
  if (c > o) return m >= o && m < c;
  return m >= o || m < c;
}
const isOpenNow = b => !!b.active && openAt(b, tashkentMinutes());
function dist(aLat, aLng, bLat, bLng) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const setting = (k, d) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? d;

function tashkentDate() { return new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10); }

function publicBranch(b) {
  return { ...b, open_now: isOpenNow(b) };
}

// ---------- auth ----------
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const s = token && db.prepare('SELECT * FROM sessions WHERE token=? AND role=?').get(token, 'user');
  if (!s) return fail(res, 401, 'Требуется вход');
  req.user = db.prepare('SELECT * FROM users WHERE id=?').get(s.user_id);
  if (!req.user) return fail(res, 401, 'Требуется вход');
  next();
}
const newToken = () => crypto.randomBytes(24).toString('hex');

async function sendViaTelegram(phone, code) {
  if (!TG_TOKEN) throw new Error('TELEGRAM_GATEWAY_TOKEN не задан');
  const r = await fetch('https://gatewayapi.telegram.org/sendVerificationMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TG_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phone, code, ttl: CODE_TTL }),
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.error || `Telegram Gateway HTTP ${r.status}`);
  return j.result;
}
// SMS-провайдер подключается позже (например Eskiz / Playmobile)
async function sendViaSms(/* phone, code */) {
  throw new Error('SMS-провайдер ещё не подключён');
}

async function issueCode(phone, res) {
  if (!PHONE_RE.test(phone)) return fail(res, 400, 'Введите номер из 9 цифр после +998');
  const last = db.prepare('SELECT * FROM codes WHERE phone=? ORDER BY id DESC LIMIT 1').get(phone);
  if (last && now() - last.created_at < RESEND_COOLDOWN) {
    return res.status(429).json({ error: 'Подождите перед повторной отправкой', resend_in: RESEND_COOLDOWN - (now() - last.created_at) });
  }
  const hourAgo = now() - 3600;
  if (db.prepare('SELECT COUNT(*) c FROM codes WHERE phone=? AND created_at>?').get(phone, hourAgo).c >= 5) {
    return fail(res, 429, 'Слишком много попыток. Попробуйте через час');
  }
  const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  let channel = null;
  try { await sendViaTelegram(phone, code); channel = 'telegram'; }
  catch (e) {
    console.warn('[auth] Telegram:', e.message);
    try { await sendViaSms(phone, code); channel = 'sms'; } catch (e2) { console.warn('[auth] SMS:', e2.message); }
  }
  if (!channel) return fail(res, 502, 'Не удалось отправить код. Проверьте, что у номера есть Telegram, и попробуйте ещё раз');
  db.prepare('INSERT INTO codes (phone,code,channel,expires_at,created_at) VALUES (?,?,?,?,?)')
    .run(phone, code, channel, now() + CODE_TTL, now());
  res.json({ ok: true, channel, resend_in: RESEND_COOLDOWN });
}

app.post('/api/auth/request', wrap(async (req, res) => {
  const phone = String(req.body.phone || '').replace(/[\s()-]/g, '');
  await issueCode(phone, res);
}));

app.post('/api/auth/verify', wrap(async (req, res) => {
  const phone = String(req.body.phone || '').replace(/[\s()-]/g, '');
  const code = String(req.body.code || '');
  if (!PHONE_RE.test(phone) || !/^\d{4}$/.test(code)) return fail(res, 400, 'Неверные данные');
  const row = db.prepare('SELECT * FROM codes WHERE phone=? AND used=0 ORDER BY id DESC LIMIT 1').get(phone);
  if (!row || row.expires_at < now()) return fail(res, 400, 'Код устарел. Запросите новый');
  if (row.attempts >= 5) return fail(res, 429, 'Слишком много попыток. Запросите новый код');
  if (row.code !== code) {
    db.prepare('UPDATE codes SET attempts=attempts+1 WHERE id=?').run(row.id);
    return fail(res, 400, 'Неверный код');
  }
  db.prepare('UPDATE codes SET used=1 WHERE id=?').run(row.id);
  let user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  const isNew = !user;
  if (!user) {
    const id = Number(db.prepare('INSERT INTO users (phone) VALUES (?)').run(phone).lastInsertRowid);
    user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  }
  const token = newToken();
  db.prepare('INSERT INTO sessions (token,user_id,role) VALUES (?,?,?)').run(token, user.id, 'user');
  res.json({ token, user, isNew });
}));

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));
app.put('/api/me', auth, (req, res) => {
  const name = String(req.body.name ?? req.user.name).trim().slice(0, 40);
  const notify = req.body.notify === undefined ? req.user.notify : (req.body.notify ? 1 : 0);
  let avatar = req.user.avatar;
  if (req.body.avatar !== undefined) {
    avatar = Number(req.body.avatar);
    if (!Number.isInteger(avatar) || avatar < 0 || avatar > 9) return fail(res, 400, 'Неверный аватар');
  }
  db.prepare('UPDATE users SET name=?, notify=?, avatar=? WHERE id=?').run(name, notify, avatar, req.user.id);
  res.json({ user: db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id) });
});
// Full account deletion. Orders stay (anonymised) because they are accounting records; everything personal goes.
app.delete('/api/me', auth, (req, res) => {
  const uid = req.user.id;
  if (db.prepare("SELECT COUNT(*) c FROM orders WHERE user_id=? AND status IN ('new','cooking','ready','delivering')").get(uid).c) {
    return fail(res, 400, 'Нельзя удалить аккаунт, пока есть незавершённые заказы. Дождитесь их выполнения');
  }
  for (const m of db.prepare("SELECT image FROM chat_messages WHERE user_id=? AND image<>''").all(uid)) {
    try { fs.unlinkSync(path.join(paths.uploadsDir, 'chat', path.basename(m.image))); } catch { /* already gone */ }
  }
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM chat_messages WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM notifications WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM coin_log WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM addresses WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM cards WHERE user_id=?').run(uid);
    db.prepare("UPDATE reviews SET user_id=0, comment='' WHERE user_id=?").run(uid);
    db.prepare("UPDATE orders SET user_id=0, address_json=NULL, comment='' WHERE user_id=?").run(uid);
    db.prepare('DELETE FROM codes WHERE phone=?').run(req.user.phone);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM users WHERE id=?').run(uid);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.json({ ok: true });
});
app.post('/api/me/phone/request', auth, wrap(async (req, res) => {
  const phone = String(req.body.phone || '').replace(/[\s()-]/g, '');
  if (!PHONE_RE.test(phone)) return fail(res, 400, 'Введите номер из 9 цифр после +998');
  if (phone === req.user.phone) return fail(res, 400, 'Это ваш текущий номер');
  if (db.prepare('SELECT id FROM users WHERE phone=?').get(phone)) return fail(res, 400, 'Этот номер уже используется');
  await issueCode(phone, res);
}));
app.post('/api/me/phone/verify', auth, (req, res) => {
  const phone = String(req.body.phone || '').replace(/[\s()-]/g, '');
  const code = String(req.body.code || '');
  if (!PHONE_RE.test(phone) || !/^\d{4}$/.test(code)) return fail(res, 400, 'Неверные данные');
  const row = db.prepare('SELECT * FROM codes WHERE phone=? AND used=0 ORDER BY id DESC LIMIT 1').get(phone);
  if (!row || row.expires_at < now()) return fail(res, 400, 'Код устарел. Запросите новый');
  if (row.attempts >= 5) return fail(res, 429, 'Слишком много попыток. Запросите новый код');
  if (row.code !== code) { db.prepare('UPDATE codes SET attempts=attempts+1 WHERE id=?').run(row.id); return fail(res, 400, 'Неверный код'); }
  if (db.prepare('SELECT id FROM users WHERE phone=? AND id<>?').get(phone, req.user.id)) return fail(res, 400, 'Этот номер уже используется');
  db.prepare('UPDATE codes SET used=1 WHERE id=?').run(row.id);
  db.prepare('UPDATE users SET phone=? WHERE id=?').run(phone, req.user.id);
  res.json({ user: db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id) });
});
app.post('/api/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  res.json({ ok: true });
});

// ---------- public data ----------
app.get('/api/menu', (req, res) => {
  res.json({
    categories: db.prepare('SELECT * FROM categories WHERE active=1 ORDER BY sort,id').all(),
    products: (() => {
      const ad = {};
      for (const r of db.prepare('SELECT product_id, addon_id FROM product_addons ORDER BY sort, addon_id').all()) (ad[r.product_id] = ad[r.product_id] || []).push(r.addon_id);
      return db.prepare('SELECT id,category_id,name,description,name_uz,description_uz,price,old_price,image,badge,big,recommended,sort,active,coin_price FROM products WHERE active=1 ORDER BY sort,id').all().map(p => ({ ...p, coin_cost: coinCost(p), addons: ad[p.id] || [] }));
    })(),
    banners: db.prepare('SELECT * FROM banners WHERE active=1 ORDER BY sort,id').all(),
    branches: db.prepare('SELECT id,name,city,address,lat,lng,phone,open_time,close_time,active,delivery_radius,delivery_fee,free_from,min_order FROM branches WHERE active=1').all().map(publicBranch),
    stock_off: db.prepare('SELECT branch_id, product_id FROM branch_stock WHERE available=0').all()
      .reduce((m, r) => { (m[r.branch_id] = m[r.branch_id] || []).push(r.product_id); return m; }, {}),
    promos: db.prepare("SELECT code,percent,fixed,title,info,title_uz,info_uz,valid_until FROM promos WHERE active=1 AND title<>'' AND (valid_until='' OR valid_until>=?)").all(tashkentDate()),
    settings: {
      delivery_fee: Number(setting('delivery_fee', 0)),
      coin_percent: Number(setting('coin_percent', 10)),
      brand: setting('brand', "Wendy's"),
      support_phone: setting('support_phone', ''),
      coin_value: Number(setting('coin_value', 1)) || 1,
      yandex_key: process.env.YANDEX_MAPS_KEY || '',
    },
  });
});

const geoCache = new Map();
app.get('/api/reverse', wrap(async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail(res, 400, 'lat/lng');
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (geoCache.has(key)) return res.json(geoCache.get(key));
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=ru&lat=${lat}&lon=${lng}`, {
      headers: { 'User-Agent': 'wendys-delivery-app/1.0' }, signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    const a = j.address || {};
    const city = a.city || a.town || a.village || a.state || '';
    const street = a.road || a.pedestrian || a.neighbourhood || a.suburb || '';
    const parts = [city, street, a.house_number].filter(Boolean);
    const out = { address: parts.join(', ') || j.display_name || '', lat, lng };
    geoCache.set(key, out);
    res.json(out);
  } catch {
    res.json({ address: '', lat, lng });
  }
}));

app.post('/api/promo/check', (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const subtotal = Number(req.body.subtotal || 0);
  const p = db.prepare("SELECT * FROM promos WHERE code=? AND active=1 AND (valid_until='' OR valid_until>=?)").get(code, tashkentDate());
  if (!p) return fail(res, 404, 'Промокод не найден');
  if (subtotal < p.min_total) return fail(res, 400, `Минимальная сумма заказа ${p.min_total} so'm`);
  const discount = Math.min(subtotal, p.percent ? Math.round(subtotal * p.percent / 100) : p.fixed);
  res.json({ code: p.code, percent: p.percent, fixed: p.fixed, discount, title: p.title });
});

// ---------- addresses ----------
app.get('/api/addresses', auth, (req, res) => {
  res.json({ addresses: db.prepare('SELECT * FROM addresses WHERE user_id=? ORDER BY id DESC').all(req.user.id) });
});
app.post('/api/addresses', auth, (req, res) => {
  const b = req.body;
  const address = String(b.address || '').trim();
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!address) return fail(res, 400, 'Укажите адрес');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail(res, 400, 'Не определены координаты');
  const label = ['home', 'work', 'other'].includes(b.label) ? b.label : 'other';
  const s = v => String(v || '').trim().slice(0, 100);
  const id = Number(db.prepare(
    'INSERT INTO addresses (user_id,label,address,lat,lng,entrance,intercom,floor,apartment,comment) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(req.user.id, label, address.slice(0, 250), lat, lng, s(b.entrance), s(b.intercom), s(b.floor), s(b.apartment), s(b.comment)).lastInsertRowid);
  res.json({ address: db.prepare('SELECT * FROM addresses WHERE id=?').get(id) });
});
app.delete('/api/addresses/:id', auth, (req, res) => {
  db.prepare('DELETE FROM addresses WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------- cards (хранятся только маска, номер и CVV не сохраняются) ----------
function luhn(n) {
  let sum = 0, alt = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}
app.get('/api/cards', auth, (req, res) => res.json({ cards: db.prepare('SELECT * FROM cards WHERE user_id=?').all(req.user.id) }));
app.post('/api/cards', auth, (req, res) => {
  const number = String(req.body.number || '').replace(/\D/g, '');
  const exp = String(req.body.exp || '').replace(/\D/g, '');
  if (number.length !== 16 || !luhn(number)) return fail(res, 400, 'Неверный номер карты');
  const mm = Number(exp.slice(0, 2)), yy = Number(exp.slice(2, 4));
  const nowD = new Date();
  if (exp.length !== 4 || mm < 1 || mm > 12 || (2000 + yy) * 12 + mm < nowD.getFullYear() * 12 + nowD.getMonth() + 1) {
    return fail(res, 400, 'Неверный срок действия');
  }
  const brand = number.startsWith('8600') ? 'Uzcard' : number.startsWith('9860') ? 'Humo' : number[0] === '4' ? 'Visa' : number[0] === '5' ? 'Mastercard' : 'Карта';
  const id = Number(db.prepare('INSERT INTO cards (user_id,brand,last4,exp) VALUES (?,?,?,?)')
    .run(req.user.id, brand, number.slice(-4), `${exp.slice(0, 2)}/${exp.slice(2)}`).lastInsertRowid);
  res.json({ card: db.prepare('SELECT * FROM cards WHERE id=?').get(id) });
});
app.delete('/api/cards/:id', auth, (req, res) => {
  db.prepare('DELETE FROM cards WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// delivery price of a branch: its own price (or the global one when -1), free above "free_from"
// price of a product in WendyCoin: its own coin_price, else the so'm price divided by the coin value; -1 = not exchangeable
function coinCost(p) {
  if (p.coin_price < 0) return 0;
  if (p.coin_price > 0) return p.coin_price;
  return Math.max(1, Math.ceil(p.price / (Number(setting('coin_value', 1)) || 1)));
}
function branchFee(b, amount) {
  const base = b.delivery_fee >= 0 ? b.delivery_fee : Number(setting('delivery_fee', 0));
  return b.free_from > 0 && amount >= b.free_from ? 0 : base;
}

// ---------- delivery routing: nearest open branch that can deliver ----------
function pickBranch(lat, lng, items) {
  const open = db.prepare('SELECT * FROM branches WHERE active=1').all().filter(isOpenNow);
  if (!open.length) return { error: 'closed' };
  const inRadius = open.filter(b => dist(lat, lng, b.lat, b.lng) <= (b.delivery_radius || 7));
  if (!inRadius.length) { // tell the customer how far the nearest open branch is and what its delivery radius is
    const near = open.map(b => ({ b, d: dist(lat, lng, b.lat, b.lng) })).sort((x, y) => x.d - y.d)[0];
    return { error: 'radius', near: { name: near.b.name || near.b.address, km: Math.round(near.d * 10) / 10, radius: near.b.delivery_radius || 7 } };
  }
  const off = {};
  for (const r of db.prepare('SELECT branch_id, product_id FROM branch_stock WHERE available=0').all()) (off[r.branch_id] = off[r.branch_id] || new Set()).add(r.product_id);
  const missing = b => items.find(i => off[b.id]?.has(i.product_id))?.name || '';
  const ok = inRadius.filter(b => !missing(b));
  if (!ok.length) return { error: 'stock', name: missing(inRadius[0]) };
  ok.forEach(b => { b.d = dist(lat, lng, b.lat, b.lng); });
  ok.sort((a, b) => a.d - b.d);
  const load = b => db.prepare("SELECT COUNT(*) c FROM orders WHERE branch_id=? AND status IN ('new','cooking','ready','delivering')").get(b.id).c;
  const near = ok.filter(b => b.d - ok[0].d <= 0.3); // "almost the same distance": prefer the less busy branch
  near.sort((a, b) => load(a) - load(b) || a.d - b.d);
  return { branch: near[0], distance: near[0].d };
}
const pickMessage = r => (r.error === 'closed' ? 'Пока не принимаем заказы. Попробуйте заказать позже'
  : r.error === 'radius' ? 'К сожалению, доставка на ваш адрес сейчас недоступна.' + (r.near ? ` Ближайший филиал «${r.near.name}» — ${r.near.km} км, зона доставки — ${r.near.radius} км.` : '') : `Сейчас нет в наличии: ${r.name}`);
app.post('/api/delivery/quote', (req, res) => {
  const lat = Number(req.body.lat), lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail(res, 400, 'Нет координат');
  const ids = (Array.isArray(req.body.items) ? req.body.items : []).map(Number);
  const items = ids.map(id => db.prepare('SELECT id AS product_id, name FROM products WHERE id=?').get(id)).filter(Boolean);
  const r = pickBranch(lat, lng, items);
  if (r.error) return res.json({ ok: false, error: r.error, message: pickMessage(r) });
  res.json({ ok: true, branch: { id: r.branch.id, name: r.branch.name || r.branch.address, address: r.branch.address }, distance_km: Math.round(r.distance * 10) / 10, fee: branchFee(r.branch, Number(req.body.subtotal) || 0), free_from: r.branch.free_from || 0, min_order: r.branch.min_order || 0 });
});

// ---------- orders ----------
app.post('/api/orders', auth, (req, res) => {
  const b = req.body;
  const type = b.type === 'pickup' ? 'pickup' : 'delivery';
  const rows = Array.isArray(b.items) ? b.items : [];
  if (!rows.length) return fail(res, 400, 'Корзина пуста');

  const items = [];
  let subtotal = 0, coinsSpent = 0;
  for (const r of rows) {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(Number(r.product_id));
    const qty = Math.max(1, Math.min(50, Number(r.qty) || 1));
    if (!p) return fail(res, 400, 'Товар недоступен');
    if (r.with_coins) {
      const cc = coinCost(p);
      if (!(cc > 0)) return fail(res, 400, `«${p.name}» нельзя обменять на WendyCoin`);
      items.push({ product_id: p.id, name: p.name, price: 0, qty, coin_price: cc });
      coinsSpent += cc * qty;
    } else {
      items.push({ product_id: p.id, name: p.name, price: p.price, qty });
      subtotal += p.price * qty;
    }
  }
  if (coinsSpent > req.user.coins) return fail(res, 400, 'Недостаточно WendyCoin');

  const lacks = bid => {
    const off = new Set(db.prepare('SELECT product_id FROM branch_stock WHERE branch_id=? AND available=0').all(bid).map(r => r.product_id));
    return items.find(i => off.has(i.product_id))?.name || '';
  };
  let branch = null, address = null, fee = 0;
  if (type === 'pickup') {
    branch = db.prepare('SELECT * FROM branches WHERE id=? AND active=1').get(Number(b.branch_id));
    if (!branch) return fail(res, 400, 'Выберите пиццерию');
    if (lacks(branch.id)) return fail(res, 400, `В этом филиале нет в наличии: ${lacks(branch.id)}`);
    const t = String(b.pickup_time || 'asap');
    const m = tashkentMinutes();
    if (t === 'asap') {
      if (!openAt(branch, m)) return fail(res, 400, 'Филиал сейчас закрыт');
    } else {
      if (!/^\d{2}:\d{2}$/.test(t) || !openAt(branch, toMin(t))) return fail(res, 400, 'Время выдачи вне часов работы филиала');
    }
  } else {
    address = db.prepare('SELECT * FROM addresses WHERE id=? AND user_id=?').get(Number(b.address_id), req.user.id);
    if (!address) return fail(res, 400, 'Укажите адрес доставки');
    const pick = pickBranch(address.lat, address.lng, items);
    if (pick.error) return fail(res, 400, pickMessage(pick));
    branch = pick.branch;
  }

  let discount = 0, promoCode = '';
  if (b.promo) {
    const p = db.prepare("SELECT * FROM promos WHERE code=? AND active=1 AND (valid_until='' OR valid_until>=?)").get(String(b.promo).trim().toUpperCase(), tashkentDate());
    if (!p) return fail(res, 400, 'Промокод не найден');
    if (subtotal < p.min_total) return fail(res, 400, 'Сумма заказа меньше минимальной для промокода');
    discount = Math.min(subtotal, p.percent ? Math.round(subtotal * p.percent / 100) : p.fixed);
    promoCode = p.code;
  }
  if (type === 'delivery') {
    if (subtotal < (branch.min_order || 0)) return fail(res, 400, `Минимальная сумма заказа для доставки: ${branch.min_order} so'm`);
    fee = branchFee(branch, subtotal - discount);
  }
  const total = subtotal - discount + fee;
  const coins = Math.round(total * Number(setting('coin_percent', 10)) / 100);
  const payment = ['card', 'click', 'payme', 'cash', 'coins'].includes(b.payment) ? b.payment : 'card';
  let coinPay = 0; // paying the whole order with WendyCoin
  if (payment === 'coins') {
    coinPay = Math.ceil(total / (Number(setting('coin_value', 1)) || 1));
    if (coinsSpent + coinPay > req.user.coins) return fail(res, 400, 'Недостаточно WendyCoin для оплаты заказа');
  }
  const id = Number(db.prepare(`INSERT INTO orders
    (user_id,type,branch_id,address_json,items_json,subtotal,discount,delivery_fee,total,promo,payment,pickup_time,pickup_method,comment,coins,coins_spent)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    req.user.id, type, branch.id, address ? JSON.stringify(address) : null, JSON.stringify(items),
    subtotal, discount, fee, total, promoCode, payment,
    type === 'pickup' ? String(b.pickup_time || 'asap') : '',
    type === 'pickup' ? (['tray', 'takeaway', 'table'].includes(b.pickup_method) ? b.pickup_method : 'tray') : '',
    String(b.comment || '').slice(0, 200), payment === 'coins' ? 0 : coins, coinsSpent + coinPay).lastInsertRowid);
  const spentTotal = coinsSpent + coinPay;
  if (spentTotal > 0) { db.prepare('UPDATE users SET coins=coins-? WHERE id=?').run(spentTotal, req.user.id); require('./shared').coinLog(req.user.id, -spentTotal, payment === 'coins' ? `Оплата заказа №${id}` : `Обмен на товары, заказ №${id}`, null, id); }
  if (payment === 'coins') db.prepare("UPDATE orders SET pay_status='paid' WHERE id=?").run(id);
  res.json({ order: db.prepare('SELECT * FROM orders WHERE id=?').get(id), branch_name: branch.name || branch.address });
});
app.get('/api/orders', auth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.id)
    .map(o => ({ ...o, items: JSON.parse(o.items_json), address: o.address_json ? JSON.parse(o.address_json) : null,
      stars: db.prepare('SELECT stars FROM reviews WHERE order_id=?').get(o.id)?.stars ?? null,
      branch_name: db.prepare('SELECT name FROM branches WHERE id=?').get(o.branch_id)?.name || '' }));
  res.json({ orders });
});

// ---------- support chat (text + photos only) ----------
const CHAT_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
function saveChatImage(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) return false;
  const magic = buf.subarray(0, 4).toString('hex');
  const okMagic = magic.startsWith('89504e47') || magic.startsWith('ffd8ff') || buf.subarray(0, 4).toString() === 'RIFF';
  if (!okMagic) return null;
  const dir = path.join(paths.uploadsDir, 'chat');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${CHAT_EXT[m[1]]}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return `/uploads/chat/${name}`;
}
function addChat(userId, sender, body, res) {
  const text = String(body.text || '').trim().slice(0, 1000);
  let image = '';
  if (body.image) {
    const saved = saveChatImage(body.image);
    if (saved === false) { fail(res, 400, 'Фото больше 5 МБ'); return null; }
    if (!saved) { fail(res, 400, 'Можно отправлять только фото (PNG, JPG, WEBP)'); return null; }
    image = saved;
  }
  if (!text && !image) { fail(res, 400, 'Пустое сообщение'); return null; }
  const id = Number(db.prepare('INSERT INTO chat_messages (user_id,sender,text,image,read_by_admin) VALUES (?,?,?,?,?)')
    .run(userId, sender, text, image, sender === 'admin' ? 1 : 0).lastInsertRowid);
  return db.prepare('SELECT * FROM chat_messages WHERE id=?').get(id);
}
app.get('/api/chat', auth, (req, res) => {
  const after = Number(req.query.after) || 0;
  res.json({ messages: db.prepare('SELECT id,sender,text,image,created_at FROM chat_messages WHERE user_id=? AND id>? ORDER BY id LIMIT 200').all(req.user.id, after) });
});
app.post('/api/chat', auth, (req, res) => {
  const recent = db.prepare("SELECT COUNT(*) c FROM chat_messages WHERE user_id=? AND sender='user' AND created_at > datetime('now','-1 minute')").get(req.user.id).c;
  if (recent >= 20) return fail(res, 429, 'Слишком много сообщений, подождите минуту');
  const m = addChat(req.user.id, 'user', req.body, res);
  if (m) res.json({ message: m });
});
require('./ops')(app, { db, fail, auth });
require('./admin')(app, {
  db, fail, addChat, isOpenNow,
  sendCode: async (phone, code) => {
    try { await sendViaTelegram(phone, code); return 'telegram'; } catch (e) {
      console.warn('[admin-auth] Telegram:', e.message);
      try { await sendViaSms(phone, code); return 'sms'; } catch { return null; }
    }
  },
});

app.use('/api', (req, res) => fail(res, 404, 'Не найдено'));
app.use((err, req, res, next) => { // eslint-disable-line
  console.error(err);
  fail(res, 500, 'Ошибка сервера');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер: http://localhost:${PORT}   Админка: http://localhost:${PORT}/admin/`);
  if (!TG_TOKEN) console.warn('ВНИМАНИЕ: TELEGRAM_GATEWAY_TOKEN не задан');
});
