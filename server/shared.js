/* Shared helpers: notifications, order status machine, coin ledger. */
const db = require('./db');

function notify(userId, orderId, kind, title, body = '') {
  db.prepare('INSERT INTO notifications (user_id,order_id,kind,title,body) VALUES (?,?,?,?,?)').run(userId, orderId, kind, title, body);
}

function coinLog(userId, delta, reason, adminId = null, orderId = null) {
  db.prepare('INSERT INTO coin_log (user_id,delta,reason,admin_id,order_id) VALUES (?,?,?,?,?)').run(userId, delta, reason, adminId, orderId);
}

/* The only place where an order changes status. Sends the customer notification and moves coins. */
function setStatus(orderId, status, extra = {}) {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  if (!o || o.status === status) return o;
  const stamp = { cooking: 'accepted_at', ready: 'ready_at', done: 'delivered_at' }[status];
  db.prepare(`UPDATE orders SET status=?${stamp ? `, ${stamp}=CURRENT_TIMESTAMP` : ''} WHERE id=?`).run(status, o.id);
  const n = o.id;
  if (status === 'cooking') notify(o.user_id, n, 'accepted', `Заказ №${n} принят`, 'Мы уже начали готовить ваш заказ');
  else if (status === 'ready') notify(o.user_id, n, 'ready', `Заказ №${n} готов`, o.type === 'delivery' ? 'Заказ готов и скоро будет доставлен' : 'Заказ готов, можно забирать');
  else if (status === 'delivering') notify(o.user_id, n, 'delivering', `Курьер везёт заказ №${n}`, `${extra.courierName ? 'Курьер ' + extra.courierName + ' ' : 'Курьер '}уже в пути. Следите за ним на карте`);
  else if (status === 'done') {
    if (o.status !== 'cancelled' && o.coins > 0) { db.prepare('UPDATE users SET coins=coins+? WHERE id=?').run(o.coins, o.user_id); coinLog(o.user_id, o.coins, `Заказ №${n}`, null, n); }
    notify(o.user_id, n, 'delivered', o.type === 'delivery' ? `Заказ №${n} доставлен` : `Заказ №${n} выдан`, 'Оцените наш сервис');
  } else if (status === 'cancelled') {
    if (o.coins_spent > 0) { db.prepare('UPDATE users SET coins=coins+? WHERE id=?').run(o.coins_spent, o.user_id); coinLog(o.user_id, o.coins_spent, `Возврат за отменённый заказ №${n}`, null, n); }
    notify(o.user_id, n, 'cancelled', `Заказ №${n} отменён`, 'Если это ошибка, напишите нам в поддержку');
  }
  return db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
}

module.exports = { notify, coinLog, setStatus };
