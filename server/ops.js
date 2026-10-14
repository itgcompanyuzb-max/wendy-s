/* Customer-facing order tracking, notifications, reviews + the POS integration API. */
const crypto = require('crypto');
const { setStatus } = require('./shared');

module.exports = function mountOps(app, { db, fail, auth }) {
  const sha = s => crypto.createHash('sha256').update(s).digest('hex');

  /* ---------- notifications (polled by the app) ---------- */
  app.get('/api/notifications', auth, (req, res) => {
    const after = Number(req.query.after) || 0;
    res.json({ items: db.prepare('SELECT id,order_id,kind,title,body,created_at FROM notifications WHERE user_id=? AND id>? ORDER BY id LIMIT 50').all(req.user.id, after) });
  });

  /* ---------- live tracking ---------- */
  app.get('/api/orders/:id/track', auth, (req, res) => {
    const o = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!o) return fail(res, 404, 'Заказ не найден');
    const addr = o.address_json ? JSON.parse(o.address_json) : null;
    const br = db.prepare('SELECT name,address,lat,lng FROM branches WHERE id=?').get(o.branch_id);
    let courier = null;
    if (o.courier_id && o.status === 'delivering') {
      const c = db.prepare('SELECT a.name, l.lat, l.lng, l.updated_at FROM admin_users a LEFT JOIN courier_location l ON l.courier_id=a.id WHERE a.id=?').get(o.courier_id);
      if (c) courier = { name: c.name, lat: c.lat, lng: c.lng, updated_at: c.updated_at };
    }
    res.json({ id: o.id, status: o.status, type: o.type, dest: addr ? { lat: addr.lat, lng: addr.lng, address: addr.address } : null, branch: br, courier });
  });

  /* ---------- reviews ---------- */
  app.post('/api/orders/:id/review', auth, (req, res) => {
    const o = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!o) return fail(res, 404, 'Заказ не найден');
    if (o.status !== 'done') return fail(res, 400, 'Оценить можно после доставки');
    const stars = Number(req.body.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return fail(res, 400, 'Поставьте оценку от 1 до 5');
    if (db.prepare('SELECT id FROM reviews WHERE order_id=?').get(o.id)) return fail(res, 400, 'Вы уже оценили этот заказ');
    const comment = String(req.body.comment || '').trim().slice(0, 500);
    db.prepare('INSERT INTO reviews (order_id,user_id,branch_id,courier_id,stars,comment) VALUES (?,?,?,?,?,?)').run(o.id, req.user.id, o.branch_id, o.courier_id, stars, comment);
    res.json({ ok: true });
  });

  /* ---------- catalog sync: the POS pushes its whole menu into the site ---------- */
  const imgOk = v => v === '' || /^\/uploads\/[\w.-]+$/.test(v) || (/^https?:\/\/[^\s"'<>]+$/i.test(v) && v.length <= 600);
  function catalogAuth(req, res, next) {
    const key = String(req.headers['x-catalog-key'] || '');
    const row = key && db.prepare("SELECT value FROM settings WHERE key='catalog_key_hash'").get();
    if (!row || row.value !== sha(key)) return fail(res, 401, 'Неверный или отсутствующий X-Catalog-Key');
    next();
  }
  app.put('/api/pos/catalog', catalogAuth, (req, res) => {
    const cats = Array.isArray(req.body.categories) ? req.body.categories : [];
    const prods = Array.isArray(req.body.products) ? req.body.products : [];
    if (prods.length > 3000 || cats.length > 200) return fail(res, 400, 'Слишком много позиций');
    const errors = []; const out = { categories: { created: 0, updated: 0 }, products: { created: 0, updated: 0, deactivated: 0 }, errors };
    const str = (v, n) => String(v ?? '').trim().slice(0, n);
    db.exec('BEGIN');
    try {
      const catId = {}; // external id / name -> id
      cats.forEach((c, i) => {
        const ext = str(c.external_id, 80), name = str(c.name, 80);
        if (!ext || !name) return errors.push(`category #${i}: external_id and name are required`);
        const icon = ['combo', 'burger', 'fries', 'cup', 'dessert'].includes(c.icon) ? c.icon : 'burger';
        const ex = db.prepare('SELECT id FROM categories WHERE external_id=?').get(ext);
        if (ex) { db.prepare('UPDATE categories SET name=?, sort=COALESCE(?,sort), icon=? WHERE id=?').run(name, Number.isFinite(Number(c.sort)) ? Number(c.sort) : null, icon, ex.id); catId[ext] = ex.id; out.categories.updated++; }
        else { catId[ext] = Number(db.prepare('INSERT INTO categories (external_id,name,icon,sort) VALUES (?,?,?,?)').run(ext, name, icon, Number(c.sort) || i).lastInsertRowid); out.categories.created++; }
      });
      const sent = []; const prodId = {};
      prods.forEach((p, i) => {
        const ext = str(p.external_id, 80), name = str(p.name, 120), price = Math.round(Number(p.price));
        if (!ext || !name || !Number.isFinite(price) || price < 0) return errors.push(`product #${i}: external_id, name and a valid price are required`);
        const image = str(p.image, 600); if (!imgOk(image)) return errors.push(`product ${ext}: invalid image url`);
        let cid = catId[str(p.category_external_id, 80)] || db.prepare('SELECT id FROM categories WHERE external_id=?').get(str(p.category_external_id, 80))?.id
          || db.prepare('SELECT id FROM categories WHERE name=?').get(str(p.category, 80))?.id;
        if (!cid) return errors.push(`product ${ext}: category not found`);
        const old = Math.max(0, Math.round(Number(p.old_price) || 0)), active = p.active === false || p.active === 0 ? 0 : 1;
        const ex = db.prepare('SELECT id FROM products WHERE external_id=?').get(ext);
        if (ex) {
          db.prepare('UPDATE products SET category_id=?, name=?, description=?, price=?, old_price=?, image=CASE WHEN ?<>\'\' THEN ? ELSE image END, badge=?, active=? WHERE id=?')
            .run(cid, name, str(p.description, 1000), price, old, image, image, str(p.badge, 40), active, ex.id); prodId[ext] = ex.id; out.products.updated++;
        } else {
          prodId[ext] = Number(db.prepare('INSERT INTO products (external_id,category_id,name,description,price,old_price,image,badge,active,sort) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(ext, cid, name, str(p.description, 1000), price, old, image, str(p.badge, 40), active, i).lastInsertRowid); out.products.created++;
        }
        sent.push(ext);
      });
      // add-ons by external id (up to 8 per product)
      prods.forEach(p => {
        const pid = prodId[str(p.external_id, 80)]; if (!pid || !Array.isArray(p.addons)) return;
        db.prepare('DELETE FROM product_addons WHERE product_id=?').run(pid); let k = 0;
        for (const a of p.addons.slice(0, 8)) { const aid = prodId[str(a, 80)] || db.prepare('SELECT id FROM products WHERE external_id=?').get(str(a, 80))?.id; if (aid && aid !== pid) db.prepare('INSERT OR IGNORE INTO product_addons (product_id,addon_id,sort) VALUES (?,?,?)').run(pid, aid, k++); }
      });
      if (req.body.full_sync === true && sent.length) {
        const mark = sent.map(() => '?').join(',');
        out.products.deactivated = db.prepare(`UPDATE products SET active=0 WHERE external_id IS NOT NULL AND active=1 AND external_id NOT IN (${mark})`).run(...sent).changes;
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); console.error('[catalog]', e.message); return fail(res, 500, 'Ошибка синхронизации'); }
    res.json({ ok: true, ...out });
  });
  app.get('/api/pos/catalog', catalogAuth, (req, res) => res.json({
    categories: db.prepare('SELECT id,external_id,name,sort FROM categories ORDER BY sort,id').all(),
    products: db.prepare('SELECT id,external_id,category_id,name,price,old_price,active FROM products ORDER BY id').all(),
  }));

  /* ---------- POS API (one secret key per branch, header X-POS-Key) ---------- */
  const calls = new Map();
  function pos(req, res, next) {
    const key = String(req.headers['x-pos-key'] || '');
    if (!key) return fail(res, 401, 'Нужен заголовок X-POS-Key');
    const t = Date.now(), arr = (calls.get(key) || []).filter(x => t - x < 60000);
    if (arr.length >= 240) return fail(res, 429, 'Слишком много запросов');
    arr.push(t); calls.set(key, arr);
    const br = db.prepare('SELECT id,name FROM branches WHERE pos_key_hash=? AND active=1').get(sha(key));
    if (!br) return fail(res, 401, 'Неверный ключ POS');
    req.posBranch = br; next();
  }
  const view = o => ({
    number: o.id, status: o.status, type: o.type, created_at: o.created_at, total: o.total, payment: o.payment, comment: o.comment,
    pickup_time: o.pickup_time || undefined,
    items: JSON.parse(o.items_json).map(i => ({ name: i.name, qty: i.qty, price: i.price, sum: i.price * i.qty, paid_with_coins: !!i.coin_price })),
    customer: db.prepare('SELECT name, phone FROM users WHERE id=?').get(o.user_id),
  });
  app.get('/api/pos/orders', pos, (req, res) => {
    const st = ['new', 'cooking', 'ready'].includes(req.query.status) ? [req.query.status] : ['new', 'cooking', 'ready'];
    const rows = db.prepare(`SELECT * FROM orders WHERE branch_id=? AND status IN (${st.map(() => '?').join(',')}) ORDER BY id`).all(req.posBranch.id, ...st);
    res.json({ branch: req.posBranch.name, orders: rows.map(view) });
  });
  const FLOW = { accept: ['new', 'cooking'], ready: ['cooking', 'ready'], complete: ['ready', 'done'] };
  app.post('/api/pos/orders/:id/:action', pos, (req, res) => {
    const step = FLOW[req.params.action];
    if (!step) return fail(res, 404, 'Неизвестное действие (accept | ready | complete)');
    const o = db.prepare('SELECT * FROM orders WHERE id=? AND branch_id=?').get(req.params.id, req.posBranch.id);
    if (!o) return fail(res, 404, 'Заказ не найден в этом филиале');
    if (o.status === step[1]) return res.json({ ok: true, status: o.status }); // idempotent
    if (o.status !== step[0]) return fail(res, 409, `Нельзя: заказ в статусе «${o.status}»`);
    if (req.params.action === 'complete' && o.type === 'delivery') return fail(res, 409, 'Доставку завершает курьер');
    const r = setStatus(o.id, step[1]);
    res.json({ ok: true, status: r.status });
  });
};
