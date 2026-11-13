/* Automatic messages to customers (shown in the app as notifications):
   - birthday: WendyCoin gift on the customer's birthday (Admin > Уведомления: on/off and amount)
   - cart: "we are still waiting for you in the cart" when items were left in the cart (on/off and delay)
   Runs every 5 minutes; only between 10:00 and 22:00 Tashkent time, so nobody gets a message at night. */
const db = require('./db');
const { notify, coinLog } = require('./shared');

const setting = (k, d) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? d;
const sqlTime = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
function tashkent() {
  const t = new Date(Date.now() + 5 * 3600e3);
  const pad = n => String(n).padStart(2, '0');
  const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return { y: t.getUTCFullYear(), md: `${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, h: t.getUTCHours(), leap: leap(t.getUTCFullYear()) };
}

function birthdays() {
  if (setting('birthday_coins_on', '0') !== '1') return;
  const amount = Math.trunc(Number(setting('birthday_coins', '0')));
  if (!(amount > 0)) return;
  const { y, md, leap } = tashkent();
  const days = [md];
  if (md === '02-28' && !leap) days.push('02-29'); // born on 29 February: the gift comes on the 28th
  const rows = db.prepare(`SELECT id FROM users WHERE COALESCE(blocked,0)=0 AND birthday<>'' AND substr(birthday,6,5) IN (${days.map(() => '?').join(',')}) AND COALESCE(birthday_bonus_year,0)<?`).all(...days, y);
  for (const r of rows) {
    const ch = db.prepare('UPDATE users SET coins=coins+?, birthday_bonus_year=? WHERE id=? AND COALESCE(birthday_bonus_year,0)<?').run(amount, y, r.id, y).changes;
    if (!ch) continue;
    coinLog(r.id, amount, 'Подарок на день рождения');
    notify(r.id, null, 'birthday', '🎂 С днём рождения!', `Дарим вам ${amount} WendyCoin 🎁`);
  }
}

function carts() {
  if (setting('cart_remind_on', '1') !== '1') return;
  const delay = Math.max(15, Math.trunc(Number(setting('cart_remind_min', '60'))) || 60) * 60e3;
  const now = Date.now();
  const rows = db.prepare("SELECT c.user_id, c.items_json, c.updated_at FROM carts c JOIN users u ON u.id=c.user_id WHERE c.reminded_at IS NULL AND c.items_json<>'[]' AND c.updated_at<? AND c.updated_at>? AND COALESCE(u.blocked,0)=0")
    .all(now - delay, now - 3 * 86400e3);
  for (const r of rows) {
    db.prepare('UPDATE carts SET reminded_at=? WHERE user_id=?').run(now, r.user_id);
    // ordered since the cart was left: nothing to remind
    if (db.prepare('SELECT 1 FROM orders WHERE user_id=? AND created_at>=?').get(r.user_id, sqlTime(r.updated_at))) continue;
    let n = 0; try { n = JSON.parse(r.items_json).reduce((s, i) => s + (Number(i.qty) || 0), 0); } catch { /* broken row */ }
    if (!n) continue;
    const m = n % 10, h = n % 100;
    const word = m === 1 && h !== 11 ? 'товар ждёт' : m >= 2 && m <= 4 && (h < 12 || h > 14) ? 'товара ждут' : 'товаров ждут';
    notify(r.user_id, null, 'cart', '🛒 Мы всё ещё ждём вас в корзине', `${n} ${word} вас — оформите заказ, пока всё горячее 🍔`);
  }
}

function run() {
  const { h } = tashkent();
  if (h < 10 || h >= 22) return;
  try { birthdays(); } catch (e) { console.error('[jobs] birthdays:', e.message); }
  try { carts(); } catch (e) { console.error('[jobs] carts:', e.message); }
}

function start() { setTimeout(run, 20e3); setInterval(run, 5 * 60e3).unref(); }
module.exports = { start, run, birthdays, carts };
