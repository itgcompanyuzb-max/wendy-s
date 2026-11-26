/* Order screen extras: chat between the customer and the courier, the legal documents (public offer, privacy policy,
 * WendyCoin rules) with the customer's consent, and WendyCoin expiry (1 month, as the rules say). */
const { coinLog, notify } = require('./shared');

const TERMS_VERSION = '2026-11-27';
const COIN_DAYS = 30; // WendyCoin burn after one month (the rules and the offer say so)

module.exports = function mountOrderX(app, { db, fail, auth }) {
  const now = () => Math.floor(Date.now() / 1000);
  for (const sql of [
    'ALTER TABLE users ADD COLUMN terms_at TEXT', 'ALTER TABLE users ADD COLUMN terms_ver TEXT',
    'ALTER TABLE users ADD COLUMN coin_remind_day TEXT',
  ]) { try { db.exec(sql); } catch { /* column exists */ } }
  db.exec(`CREATE TABLE IF NOT EXISTS order_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL,
    created_at INTEGER NOT NULL, seen_user INTEGER DEFAULT 0, seen_courier INTEGER DEFAULT 0
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_order_chat ON order_chat(order_id, id)');
  db.exec('CREATE TABLE IF NOT EXISTS coin_carry (user_id INTEGER PRIMARY KEY, amount INTEGER NOT NULL, at INTEGER NOT NULL)');

  const setting = k => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value || '';

  /* ---------- legal documents ---------- */
  const legal = () => require('./legal')({
    name: setting('legal_name'), inn: setting('legal_inn'), address: setting('legal_address'), bank: setting('legal_bank'),
    phone: setting('support_phone'), email: setting('support_email'), brand: setting('brand') || "Wendy's",
    coinPercent: Number(setting('coin_percent')) || 0, coinValue: Number(setting('coin_value')) || 1, coinDays: COIN_DAYS, version: TERMS_VERSION,
  });
  app.get('/api/legal', (req, res) => {
    const L = legal(), lang = req.query.lang === 'uz' ? 'uz' : 'ru';
    res.json({ version: TERMS_VERSION, docs: Object.entries(L).map(([id, d]) => ({ id, title: d[lang].title })) });
  });
  app.get('/api/legal/:id', (req, res) => {
    const d = legal()[req.params.id];
    if (!d) return fail(res, 404, 'Документ не найден');
    res.json({ version: TERMS_VERSION, ...d[req.query.lang === 'uz' ? 'uz' : 'ru'] });
  });
  // a signed-in customer who has not accepted the current version (accounts made before the documents existed)
  app.post('/api/me/accept-terms', auth, (req, res) => {
    db.prepare('UPDATE users SET terms_at=CURRENT_TIMESTAMP, terms_ver=? WHERE id=?').run(TERMS_VERSION, req.user.id);
    res.json({ ok: true, version: TERMS_VERSION });
  });

  /* ---------- chat with the courier (only while the courier has the order) ---------- */
  const chatOrder = (orderId, userId) => db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(orderId, userId);
  const msgs = id => db.prepare('SELECT id, sender, text, created_at FROM order_chat WHERE order_id=? ORDER BY id').all(id);
  app.get('/api/orders/:id/chat', auth, (req, res) => {
    const o = chatOrder(req.params.id, req.user.id);
    if (!o) return fail(res, 404, 'Заказ не найден');
    db.prepare("UPDATE order_chat SET seen_user=1 WHERE order_id=? AND sender='courier'").run(o.id);
    const c = o.courier_id ? db.prepare('SELECT name, phone FROM admin_users WHERE id=?').get(o.courier_id) : null;
    res.json({ open: !!c && o.status === 'delivering', courier: c, messages: msgs(o.id) });
  });
  app.post('/api/orders/:id/chat', auth, (req, res) => {
    const o = chatOrder(req.params.id, req.user.id);
    if (!o) return fail(res, 404, 'Заказ не найден');
    if (!o.courier_id || o.status !== 'delivering') return fail(res, 400, 'Чат с курьером открыт, пока он везёт заказ');
    const text = String(req.body.text || '').trim().slice(0, 500);
    if (!text) return fail(res, 400, 'Пустое сообщение');
    db.prepare("INSERT INTO order_chat (order_id, sender, text, created_at, seen_user) VALUES (?,'user',?,?,1)").run(o.id, text, now());
    res.json({ ok: true, messages: msgs(o.id) });
  });

  /* ---------- WendyCoin expiry ----------
   * Coins are spent oldest first, so what burns today = coins earned more than 30 days ago that were not spent (or burnt) since.
   * Counting starts when this feature started: balances held then count as earned on that day (coin_carry). */
  let start = Number(setting('coin_expiry_start'));
  if (!start) {
    start = now();
    db.prepare("INSERT INTO settings (key,value) VALUES ('coin_expiry_start',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(start));
    db.prepare('INSERT OR IGNORE INTO coin_carry (user_id, amount, at) SELECT id, coins, ? FROM users WHERE coins>0').run(start);
  }
  // coins of this user that are (or will be, by `at`) older than the limit and still unspent
  function dueBy(userId, at) {
    const cut = at - COIN_DAYS * 86400;
    const carry = db.prepare('SELECT amount, at FROM coin_carry WHERE user_id=?').get(userId);
    const earned = (carry && carry.at <= cut ? carry.amount : 0)
      + (db.prepare("SELECT COALESCE(SUM(delta),0) s FROM coin_log WHERE user_id=? AND delta>0 AND CAST(strftime('%s',created_at) AS INTEGER) BETWEEN ? AND ?").get(userId, start, cut).s);
    const used = -db.prepare("SELECT COALESCE(SUM(delta),0) s FROM coin_log WHERE user_id=? AND delta<0 AND CAST(strftime('%s',created_at) AS INTEGER) >= ?").get(userId, start).s;
    const bal = db.prepare('SELECT coins FROM users WHERE id=?').get(userId)?.coins || 0;
    return Math.max(0, Math.min(bal, earned - used));
  }
  function expireCoins() {
    const t = now(), day = new Date((t + 5 * 3600) * 1000).toISOString().slice(0, 10); // Tashkent date
    for (const u of db.prepare('SELECT id, coins, coin_remind_day FROM users WHERE coins>0').all()) {
      const due = dueBy(u.id, t);
      if (due > 0) {
        db.prepare('UPDATE users SET coins=coins-? WHERE id=? AND coins>=?').run(due, u.id, due);
        coinLog(u.id, -due, `Сгорели неиспользованные WendyCoin (срок ${COIN_DAYS} дней)`);
        notify(u.id, null, 'coins', `−${due} WendyCoin`, 'Срок действия этих WendyCoin закончился');
        continue;
      }
      const soon = dueBy(u.id, t + 3 * 86400); // a reminder 3 days before, once a day
      if (soon > 0 && u.coin_remind_day !== day) {
        db.prepare('UPDATE users SET coin_remind_day=? WHERE id=?').run(day, u.id);
        notify(u.id, null, 'coins', `Через 3 дня сгорят ${soon} WendyCoin`, 'Потратьте их на заказ или в ресторане');
      }
    }
  }
  app.get('/api/coins/expiring', auth, (req, res) => {
    const t = now();
    res.json({ days: COIN_DAYS, in7days: dueBy(req.user.id, t + 7 * 86400) });
  });
  setTimeout(() => { try { expireCoins(); } catch (e) { console.warn('[coins] expiry:', e.message); } }, 30e3);
  setInterval(() => { try { expireCoins(); } catch (e) { console.warn('[coins] expiry:', e.message); } }, 3600e3).unref();

  return { TERMS_VERSION, expireCoins, dueBy };
};

/* the courier side of the chat (mounted on the admin router, after sign-in) */
module.exports.courierChat = function courierChat(router, { db, fail, need }) {
  const now = () => Math.floor(Date.now() / 1000);
  const mine = (req) => db.prepare("SELECT * FROM orders WHERE id=? AND courier_id=?").get(req.params.id, req.admin.id);
  const msgs = id => db.prepare('SELECT id, sender, text, created_at FROM order_chat WHERE order_id=? ORDER BY id').all(id);
  router.get('/courier/orders/:id/chat', need('courier'), (req, res) => {
    const o = mine(req); if (!o) return fail(res, 404, 'Заказ не найден');
    db.prepare("UPDATE order_chat SET seen_courier=1 WHERE order_id=? AND sender='user'").run(o.id);
    res.json({ open: o.status === 'delivering', messages: msgs(o.id) });
  });
  router.post('/courier/orders/:id/chat', need('courier'), (req, res) => {
    const o = mine(req); if (!o) return fail(res, 404, 'Заказ не найден');
    if (o.status !== 'delivering') return fail(res, 400, 'Заказ уже закрыт');
    const text = String(req.body.text || '').trim().slice(0, 500);
    if (!text) return fail(res, 400, 'Пустое сообщение');
    db.prepare("INSERT INTO order_chat (order_id, sender, text, created_at, seen_courier) VALUES (?,'courier',?,?,1)").run(o.id, text, now());
    require('./shared').notify(o.user_id, o.id, 'chat', `Курьер: ${req.admin.name || 'сообщение'}`, text.slice(0, 120));
    res.json({ ok: true, messages: msgs(o.id) });
  });
};
