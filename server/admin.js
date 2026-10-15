/* Admin API: email+password (+optional TOTP 2FA) auth, strict RBAC, per-branch isolation, audit log.
 * Auth uses a bearer token kept in sessionStorage (never a cookie), so classic CSRF does not apply.
 * All SQL is parameterized; table/column names come from fixed whitelists. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

const { setStatus, notify, coinLog } = require('./shared');

module.exports = function mountAdmin(app, { db, fail, addChat, isOpenNow, sendCode }) {
  const router = express.Router();
  const now = () => Math.floor(Date.now() / 1000);
  const SESSION_MAX = 12 * 3600, SESSION_IDLE = 30 * 60;
  const sha = s => crypto.createHash('sha256').update(s).digest('hex');
  const ipOf = req => String(req.ip || '').slice(0, 64);

  /* ---------- passwords ---------- */
  const hashPw = pw => { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`; };
  function checkPw(pw, stored) {
    const [alg, saltHex, hashHex] = String(stored || '').split('$');
    if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
    const h = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 64);
    const want = Buffer.from(hashHex, 'hex');
    return want.length === h.length && crypto.timingSafeEqual(h, want);
  }
  const pwOk = pw => typeof pw === 'string' && pw.length >= 10 && pw.length <= 128;

  /* ---------- TOTP (RFC 6238) ---------- */
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const b32enc = buf => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };
  const b32dec = s => { let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
  function totpAt(secret, counter) {
    const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
    const h = crypto.createHmac('sha1', b32dec(secret)).update(buf).digest();
    const o = h[h.length - 1] & 15;
    return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
  }
  function totpOk(secret, code) {
    const c = Math.floor(Date.now() / 30000); const given = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(given)) return false;
    return [-1, 0, 1].some(d => crypto.timingSafeEqual(Buffer.from(totpAt(secret, c + d)), Buffer.from(given)));
  }

  /* ---------- audit ---------- */
  function audit(req, action, entity = '', entityId = '', detail = '') {
    try {
      db.prepare('INSERT INTO audit_log (admin_id,email,action,entity,entity_id,detail,ip) VALUES (?,?,?,?,?,?,?)')
        .run(req.admin?.id ?? null, req.admin?.phone ?? req.admin?.email ?? String(req.body?.phone || '').slice(0, 120), action, entity, String(entityId), String(detail).slice(0, 500), ipOf(req));
    } catch { /* never break a request because of logging */ }
  }

  /* ---------- seed super admin bound to ADMIN_PHONE (the only number allowed in at first) ---------- */
  const PHONE_RE = /^\+998\d{9}$/;
  const ADMIN_PHONE = (process.env.ADMIN_PHONE || '+998705044515').replace(/[\s()-]/g, '');
  if (!PHONE_RE.test(ADMIN_PHONE)) throw new Error('ADMIN_PHONE должен быть в формате +998XXXXXXXXX');
  const unusable = () => hashPw(crypto.randomBytes(24).toString('hex')); // password login is disabled
  let sup = db.prepare("SELECT * FROM admin_users WHERE role='super' ORDER BY id LIMIT 1").get();
  if (!sup) {
    db.prepare('INSERT INTO admin_users (email,name,password_hash,role,phone) VALUES (?,?,?,?,?)').run(`${ADMIN_PHONE}@phone.local`, 'Super Admin', unusable(), 'super', ADMIN_PHONE);
  } else if (sup.phone !== ADMIN_PHONE) {
    db.prepare("UPDATE admin_users SET phone=NULL WHERE phone=? AND id<>? AND role='super'").run(ADMIN_PHONE, sup.id);
    db.prepare('UPDATE admin_users SET phone=? WHERE id=?').run(ADMIN_PHONE, sup.id);
    db.prepare('DELETE FROM admin_sessions WHERE admin_id=?').run(sup.id);
  }

  /* ---------- login rate limit (per IP) ---------- */
  const hits = new Map();
  function limited(ip) {
    const t = Date.now(), arr = (hits.get(ip) || []).filter(x => t - x < 15 * 60 * 1000);
    hits.set(ip, arr); return arr.length >= 20;
  }

  const CODE_TTL = 5 * 60, RESEND = 60;
  const phoneOf = v => String(v || '').replace(/[\s()-]/g, '');
  // Step 1: ask for a code. The answer is identical for unknown numbers (no way to probe who is an admin).
  router.post('/auth/request', async (req, res) => {
    const ip = ipOf(req);
    if (limited(ip)) return fail(res, 429, 'Слишком много попыток. Попробуйте позже');
    hits.get(ip).push(Date.now());
    const phone = phoneOf(req.body.phone);
    if (!PHONE_RE.test(phone)) return fail(res, 400, 'Введите номер из 9 цифр после +998');
    const ctx = req.body.app === 'courier' ? 1 : 0; // /courier/ signs in couriers only, /admin/ everyone else
    const a = db.prepare("SELECT * FROM admin_users WHERE phone=? AND active=1 AND (role='courier')=? ORDER BY id").get(phone, ctx);
    if (!a) { audit(req, 'login_unknown_phone', 'phone', phone); return res.json({ ok: true, resend_in: RESEND }); }
    if (a.locked_until > now()) return fail(res, 429, 'Вход временно заблокирован. Попробуйте позже');
    const last = db.prepare('SELECT * FROM admin_codes WHERE phone=? ORDER BY id DESC LIMIT 1').get(phone);
    if (last && now() - last.created_at < RESEND) return res.status(429).json({ error: 'Подождите перед повторной отправкой', resend_in: RESEND - (now() - last.created_at) });
    if (db.prepare('SELECT COUNT(*) c FROM admin_codes WHERE phone=? AND created_at>?').get(phone, now() - 3600).c >= 15) return fail(res, 429, 'Слишком много запросов кода. Попробуйте через час');
    const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    const channel = await sendCode(phone, code);
    if (!channel) return fail(res, 502, 'Не удалось отправить код в Telegram. Проверьте баланс Telegram Gateway и что у номера есть Telegram');
    db.prepare('INSERT INTO admin_codes (phone,code,expires_at,created_at) VALUES (?,?,?,?)').run(phone, code, now() + CODE_TTL, now());
    audit(req, 'login_code_sent', 'phone', phone, channel);
    res.json({ ok: true, resend_in: RESEND });
  });
  const tickets = new Map(); // choice tickets for numbers that hold several roles
  router.post('/auth/choose', (req, res) => {
    const key = sha(String(req.body.ticket || '')), t = tickets.get(key);
    if (!t || t.exp < now()) return fail(res, 401, 'Время выбора истекло, войдите заново');
    const id = Number(req.body.id);
    if (!t.ids.includes(id)) return fail(res, 400, 'Неверный выбор');
    const a = db.prepare('SELECT * FROM admin_users WHERE id=? AND active=1').get(id);
    if (!a) return fail(res, 400, 'Аккаунт отключён');
    if (a.totp_enabled && !totpOk(a.totp_secret, req.body.totp)) return fail(res, 401, 'Неверный код 2FA');
    tickets.delete(key);
    db.prepare('UPDATE admin_users SET last_login=CURRENT_TIMESTAMP WHERE id=?').run(a.id);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO admin_sessions (token_hash,admin_id,created,last_seen,ip) VALUES (?,?,?,?,?)').run(sha(token), a.id, now(), now(), ipOf(req));
    req.admin = a; audit(req, 'login');
    res.json({ token });
  });
  // Step 2: verify the code (+ TOTP if the admin enabled it)
  router.post('/auth/verify', (req, res) => {
    const phone = phoneOf(req.body.phone), code = String(req.body.code || '');
    const generic = () => { audit(req, 'login_failed', 'phone', phone); return fail(res, 401, 'Неверный или устаревший код'); };
    const ctx = req.body.app === 'courier' ? 1 : 0;
    const accts = PHONE_RE.test(phone) ? db.prepare("SELECT u.*, b.name AS branch_name FROM admin_users u LEFT JOIN branches b ON b.id=u.branch_id WHERE u.phone=? AND u.active=1 AND (u.role='courier')=? ORDER BY u.id").all(phone, ctx) : [];
    const a = accts[0];
    if (!a || !/^\d{4}$/.test(code)) return generic();
    if (a.locked_until > now()) return fail(res, 429, 'Вход временно заблокирован. Попробуйте позже');
    const row = db.prepare('SELECT * FROM admin_codes WHERE phone=? AND used=0 ORDER BY id DESC LIMIT 1').get(phone);
    if (!row || row.expires_at < now() || row.attempts >= 5) return generic();
    if (row.code !== code) {
      db.prepare('UPDATE admin_codes SET attempts=attempts+1 WHERE id=?').run(row.id);
      const failed = a.failed + 1;
      db.prepare('UPDATE admin_users SET failed=?, locked_until=? WHERE id=?').run(failed >= 8 ? 0 : failed, failed >= 8 ? now() + 15 * 60 : 0, a.id);
      return generic();
    }
    if (accts.length > 1) { // same number, several roles: consume the code once, then let the person pick
      db.prepare('UPDATE admin_codes SET used=1 WHERE id=?').run(row.id);
      db.prepare('UPDATE admin_users SET failed=0, locked_until=0 WHERE id=?').run(a.id);
      for (const [k, v] of tickets) if (v.exp < now()) tickets.delete(k);
      const ticket = crypto.randomBytes(16).toString('hex');
      tickets.set(sha(ticket), { ids: accts.map(x => x.id), exp: now() + 120 });
      return res.json({ choose: accts.map(x => ({ id: x.id, role: x.role, branch: x.branch_name || '' })), ticket });
    }
    if (a.totp_enabled) {
      if (!req.body.totp) return res.json({ need_totp: true });
      if (!totpOk(a.totp_secret, req.body.totp)) { audit(req, 'login_2fa_failed', 'phone', phone); return fail(res, 401, 'Неверный код 2FA'); }
    }
    db.prepare('UPDATE admin_codes SET used=1 WHERE id=?').run(row.id);
    db.prepare('UPDATE admin_users SET failed=0, locked_until=0, last_login=CURRENT_TIMESTAMP WHERE id=?').run(a.id);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO admin_sessions (token_hash,admin_id,created,last_seen,ip) VALUES (?,?,?,?,?)').run(sha(token), a.id, now(), now(), ipOf(req));
    req.admin = a; audit(req, 'login');
    res.json({ token });
  });

  /* ---------- everything below requires a valid session ---------- */
  function adminAuth(req, res, next) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return fail(res, 401, 'Нужен вход');
    const row = db.prepare(`SELECT s.token_hash, s.created, s.last_seen, a.id, a.phone, a.email, a.name, a.role, a.branch_id, a.active, a.totp_enabled
      FROM admin_sessions s JOIN admin_users a ON a.id=s.admin_id WHERE s.token_hash=?`).get(sha(token));
    if (!row || !row.active || now() - row.created > SESSION_MAX || now() - row.last_seen > SESSION_IDLE) {
      if (row) db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(row.token_hash);
      return fail(res, 401, 'Сессия истекла. Войдите снова');
    }
    db.prepare('UPDATE admin_sessions SET last_seen=? WHERE token_hash=?').run(now(), row.token_hash);
    req.admin = row; req.tokenHash = row.token_hash;
    next();
  }
  router.use(adminAuth);
  router.use((req, res, next) => ((req.admin.role === 'courier' && !/^\/(courier|auth)(\/|$)/.test(req.path)) ? fail(res, 403, 'Недостаточно прав') : next()));

  const need = (...roles) => (req, res, next) => (roles.includes(req.admin.role) ? next() : fail(res, 403, 'Недостаточно прав'));
  const confirmed = (req, res, next) => (req.headers['x-confirm'] === 'yes' ? next() : fail(res, 428, 'Требуется подтверждение действия'));
  // Managers and staff are hard-locked to their own branch; super may pass ?branch_id=
  const branchScope = req => (req.admin.role === 'super' ? (Number(req.query.branch_id || req.body?.branch_id) || null) : req.admin.branch_id);

  router.get('/auth/me', (req, res) => {
    const branch = req.admin.branch_id ? db.prepare('SELECT id,name,address FROM branches WHERE id=?').get(req.admin.branch_id) : null;
    res.json({ admin: { id: req.admin.id, phone: req.admin.phone, email: req.admin.email, name: req.admin.name, role: req.admin.role, branch_id: req.admin.branch_id, totp_enabled: !!req.admin.totp_enabled }, branch });
  });
  router.post('/auth/logout', (req, res) => { db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(req.tokenHash); audit(req, 'logout'); res.json({ ok: true }); });
  router.post('/auth/2fa/setup', (req, res) => {
    const secret = b32enc(crypto.randomBytes(20));
    db.prepare('UPDATE admin_users SET totp_secret=?, totp_enabled=0 WHERE id=?').run(secret, req.admin.id);
    res.json({ secret, uri: `otpauth://totp/Wendys%20Admin:${encodeURIComponent(req.admin.email)}?secret=${secret}&issuer=Wendys%20Admin` });
  });
  router.post('/auth/2fa/enable', (req, res) => {
    const a = db.prepare('SELECT totp_secret FROM admin_users WHERE id=?').get(req.admin.id);
    if (!a.totp_secret || !totpOk(a.totp_secret, req.body.code)) return fail(res, 400, 'Неверный код');
    db.prepare('UPDATE admin_users SET totp_enabled=1 WHERE id=?').run(req.admin.id); audit(req, '2fa_enabled', 'admin', req.admin.id); res.json({ ok: true });
  });
  router.post('/auth/2fa/disable', (req, res) => {
    const a = db.prepare('SELECT * FROM admin_users WHERE id=?').get(req.admin.id);
    if (!a.totp_secret || !totpOk(a.totp_secret, req.body.code)) return fail(res, 400, 'Введите текущий код 2FA');
    db.prepare('UPDATE admin_users SET totp_enabled=0, totp_secret=NULL WHERE id=?').run(a.id); audit(req, '2fa_disabled', 'admin', a.id); res.json({ ok: true });
  });

  /* ---------- time helpers (Asia/Tashkent = UTC+5, no DST) ---------- */
  const fmt = d => d.toISOString().slice(0, 19).replace('T', ' ');
  function dayStartUtc(offsetDays = 0) {
    const t = new Date(Date.now() + 5 * 3600e3); t.setUTCHours(0, 0, 0, 0);
    return new Date(t.getTime() - 5 * 3600e3 + offsetDays * 86400e3);
  }

  /* ---------- dashboard ---------- */
  router.get('/dashboard', (req, res) => {
    const b = branchScope(req);
    const bw = b ? ' AND branch_id=?' : ''; const bp = b ? [b] : [];
    const sum = (from, to) => db.prepare(`SELECT COALESCE(SUM(total),0) rev, COUNT(*) n FROM orders WHERE status<>'cancelled' AND created_at>=? AND created_at<?${bw}`).get(fmt(from), fmt(to), ...bp);
    const today = sum(dayStartUtc(0), dayStartUtc(1)), yest = sum(dayStartUtc(-1), dayStartUtc(0));
    const series = [];
    for (let i = 6; i >= 0; i--) { const r = sum(dayStartUtc(-i), dayStartUtc(-i + 1)); series.push({ day: fmt(new Date(dayStartUtc(-i).getTime() + 5 * 3600e3)).slice(5, 10), rev: r.rev, n: r.n }); }
    const rows = db.prepare(`SELECT items_json FROM orders WHERE status<>'cancelled' AND created_at>=?${bw}`).all(fmt(dayStartUtc(-6)), ...bp);
    const tally = {};
    for (const r of rows) for (const it of JSON.parse(r.items_json)) { tally[it.name] = tally[it.name] || { name: it.name, qty: 0, rev: 0 }; tally[it.name].qty += it.qty; tally[it.name].rev += it.qty * it.price; }
    const status = db.prepare(`SELECT status, COUNT(*) n FROM orders WHERE created_at>=?${bw} GROUP BY status`).all(fmt(dayStartUtc(0)), ...bp);
    const branches = db.prepare('SELECT * FROM branches WHERE active=1').all();
    res.json({
      today, yesterday: yest, series, status,
      top: Object.values(tally).sort((x, y) => y.qty - x.qty).slice(0, 6),
      branches: { total: branches.length, open: branches.filter(isOpenNow).length },
      customers: req.admin.role === 'super' ? db.prepare('SELECT COUNT(*) c FROM users').get().c : null,
    });
  });

  /* ---------- orders (board) ---------- */
  const ORDER_STATUSES = ['new', 'cooking', 'ready', 'delivering', 'done', 'cancelled'];
  router.get('/orders', (req, res) => {
    const b = branchScope(req);
    const rows = db.prepare(`SELECT o.*, u.phone, u.name AS user_name, br.name AS branch_name, br.address AS branch_address, ca.name AS courier_name
      FROM orders o LEFT JOIN users u ON u.id=o.user_id LEFT JOIN branches br ON br.id=o.branch_id LEFT JOIN admin_users ca ON ca.id=o.courier_id
      WHERE (o.status NOT IN ('done','cancelled') OR o.created_at>=?)${b ? ' AND o.branch_id=?' : ''} ORDER BY o.id DESC LIMIT 300`)
      .all(fmt(dayStartUtc(-1)), ...(b ? [b] : []))
      .map(o => ({ ...o, items: JSON.parse(o.items_json), address: o.address_json ? JSON.parse(o.address_json) : null, items_json: undefined, address_json: undefined }));
    res.json({ rows });
  });
  router.put('/orders/:id', need('super'), confirmed, (req, res) => {
    const status = ORDER_STATUSES.includes(req.body.status) ? req.body.status : null;
    if (!status) return fail(res, 400, 'Неверный статус');
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!o) return fail(res, 404, 'Нет заказа');
    setStatus(o.id, status); audit(req, 'order_status_forced', 'order', o.id, `${o.status} -> ${status}`); res.json({ ok: true });
  });

  /* ---------- per-branch stock ("out of stock") ---------- */
  router.get('/stock', (req, res) => {
    const b = branchScope(req);
    if (!b) return fail(res, 400, 'Выберите филиал');
    const rows = db.prepare(`SELECT p.id, p.name, p.category_id, p.image, p.price, COALESCE(s.available,1) available
      FROM products p LEFT JOIN branch_stock s ON s.product_id=p.id AND s.branch_id=? WHERE p.active=1 ORDER BY p.category_id, p.sort, p.id`).all(b);
    res.json({ rows, branch_id: b, categories: db.prepare('SELECT id,name FROM categories ORDER BY sort,id').all() });
  });
  router.put('/stock', (req, res) => {
    const b = branchScope(req); const pid = Number(req.body.product_id);
    if (!b || !db.prepare('SELECT id FROM products WHERE id=?').get(pid)) return fail(res, 400, 'Неверные данные');
    const available = req.body.available ? 1 : 0;
    db.prepare('INSERT INTO branch_stock (branch_id,product_id,available) VALUES (?,?,?) ON CONFLICT(branch_id,product_id) DO UPDATE SET available=excluded.available').run(b, pid, available);
    audit(req, 'stock', 'product', pid, `branch ${b}: ${available ? 'in stock' : 'out of stock'}`);
    res.json({ ok: true });
  });

  /* ---------- super-only: menu, branches, banners, promos ---------- */
  const TABLES = {
    branches: ['name', 'city', 'address', 'lat', 'lng', 'phone', 'open_time', 'close_time', 'active', 'delivery_radius', 'delivery_fee', 'free_from', 'min_order'],
    categories: ['name', 'icon', 'sort', 'active', 'name_uz'],
    products: ['category_id', 'name', 'description', 'price', 'old_price', 'image', 'badge', 'big', 'recommended', 'sort', 'active', 'coin_price', 'name_uz', 'description_uz'],
    banners: ['title', 'text', 'image', 'color', 'sort', 'active', 'title_uz'],
    promos: ['code', 'percent', 'fixed', 'min_total', 'title', 'info', 'valid_until', 'active', 'title_uz', 'info_uz'],
  };
  const NUMERIC = new Set(['lat', 'lng', 'sort', 'active', 'price', 'old_price', 'big', 'recommended', 'category_id', 'percent', 'fixed', 'min_total', 'delivery_radius', 'coin_price', 'delivery_fee', 'free_from', 'min_order']);
  const imageOk = v => v === '' || /^\/uploads\/[\w.-]+$/.test(v) || (/^https?:\/\/[^\s"'<>]+$/i.test(v) && v.length <= 600);
  function pick(table, body) {
    const out = {};
    for (const f of TABLES[table]) {
      if (body[f] === undefined) continue;
      out[f] = NUMERIC.has(f) ? Number(body[f]) || 0 : String(body[f]).slice(0, 1000);
    }
    if (out.code) out.code = out.code.trim().toUpperCase();
    if (table === 'banners' && out.title !== undefined && out.title.trim() === '') out.title_uz = '';
    if (out.color && !/^#[0-9a-fA-F]{6}$/.test(out.color)) out.color = '#ff6900';
    if (out.valid_until !== undefined && out.valid_until !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(out.valid_until)) throw new Error('Дата в формате ГГГГ-ММ-ДД');
    if (out.image !== undefined) { out.image = out.image.trim(); if (!imageOk(out.image)) throw new Error('Неверная ссылка на изображение'); }
    for (const f of ['open_time', 'close_time']) if (out[f] !== undefined && !/^\d{2}:\d{2}$/.test(out[f])) throw new Error('Время в формате ЧЧ:ММ');
    return out;
  }
  const isTable = (req, res, next) => (TABLES[req.params.table] ? next() : next('router'));

  router.get('/customers', need('super'), (req, res) => res.json({ rows: db.prepare('SELECT id,phone,name,coins,created_at FROM users ORDER BY id DESC LIMIT 500').all() }));
  router.get('/settings', need('super'), (req, res) => res.json({ rows: db.prepare("SELECT * FROM settings WHERE key NOT LIKE '%_hash'").all() }));
  router.put('/settings', need('super'), confirmed, (req, res) => {
    const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    for (const k of ['delivery_fee', 'coin_percent', 'coin_value', 'brand', 'support_phone']) if (req.body[k] !== undefined) up.run(k, String(req.body[k]).slice(0, 200));
    audit(req, 'settings_changed', 'settings'); res.json({ ok: true });
  });

  /* chat with customers */
  router.get('/chats', need('super'), (req, res) => res.json({ rows: db.prepare(`SELECT u.id user_id, u.phone, u.name,
      (SELECT text FROM chat_messages c WHERE c.user_id=u.id ORDER BY id DESC LIMIT 1) last_text,
      (SELECT image FROM chat_messages c WHERE c.user_id=u.id ORDER BY id DESC LIMIT 1) last_image,
      (SELECT MAX(id) FROM chat_messages c WHERE c.user_id=u.id) last_id,
      (SELECT COUNT(*) FROM chat_messages c WHERE c.user_id=u.id AND sender='user' AND read_by_admin=0) unread
    FROM users u WHERE EXISTS (SELECT 1 FROM chat_messages c WHERE c.user_id=u.id) ORDER BY last_id DESC`).all() }));
  router.get('/chats/:userId', need('super'), (req, res) => {
    db.prepare("UPDATE chat_messages SET read_by_admin=1 WHERE user_id=? AND sender='user'").run(req.params.userId);
    res.json({ messages: db.prepare('SELECT id,sender,text,image,created_at FROM chat_messages WHERE user_id=? ORDER BY id').all(req.params.userId) });
  });
  router.post('/chats/:userId', need('super'), (req, res) => {
    if (!db.prepare('SELECT id FROM users WHERE id=?').get(req.params.userId)) return fail(res, 404, 'Нет клиента');
    const m = addChat(Number(req.params.userId), 'admin', req.body, res);
    if (m) { audit(req, 'chat_reply', 'user', req.params.userId); res.json({ message: m }); }
  });

  /* staff / roles */
  router.get('/staff', need('super', 'manager'), (req, res) => {
    const where = req.admin.role === 'super' ? '' : 'WHERE a.branch_id=?';
    const rows = db.prepare(`SELECT a.id,a.phone,a.name,a.role,a.branch_id,a.active,a.totp_enabled,a.last_login,b.name branch_name
      FROM admin_users a LEFT JOIN branches b ON b.id=a.branch_id ${where} ORDER BY a.id`).all(...(where ? [req.admin.branch_id] : []));
    res.json({ rows });
  });
  router.post('/staff', need('super', 'manager'), (req, res) => {
    const phone = phoneOf(req.body.phone);
    const name = String(req.body.name || '').trim().slice(0, 60);
    let role = String(req.body.role || 'staff'), branch = Number(req.body.branch_id) || null;
    if (!PHONE_RE.test(phone)) return fail(res, 400, 'Введите номер в формате +998XXXXXXXXX');
    if (req.admin.role === 'manager') { role = role === 'courier' ? 'courier' : 'staff'; branch = req.admin.branch_id; } // managers can only add staff to their own branch
    if (!['super', 'manager', 'staff', 'courier'].includes(role)) return fail(res, 400, 'Неверная роль');
    if (role !== 'super' && !db.prepare('SELECT id FROM branches WHERE id=?').get(branch)) return fail(res, 400, 'Выберите филиал');
    if (role === 'super') branch = null;
    if (db.prepare('SELECT id FROM admin_users WHERE phone=? AND role=? AND COALESCE(branch_id,0)=COALESCE(?,0)').get(phone, role, branch)) return fail(res, 400, 'У этого номера уже есть такая роль в этом филиале');
    const id = Number(db.prepare('INSERT INTO admin_users (email,name,password_hash,role,branch_id,phone) VALUES (?,?,?,?,?,?)').run(`${phone}.${role}${branch || ''}@phone.local`, name, unusable(), role, branch, phone).lastInsertRowid);
    audit(req, 'staff_created', 'admin', id, `${phone} (${role})`); res.json({ id });
  });
  router.put('/staff/:id', need('super', 'manager'), (req, res) => {
    const t = db.prepare('SELECT * FROM admin_users WHERE id=?').get(req.params.id);
    if (!t) return fail(res, 404, 'Не найден');
    if (req.admin.role === 'manager' && (t.branch_id !== req.admin.branch_id || !['staff', 'courier'].includes(t.role))) return fail(res, 403, 'Недостаточно прав');
    if (t.id === req.admin.id && req.body.active === 0) return fail(res, 400, 'Нельзя отключить себя');
    if (req.body.active !== undefined) db.prepare('UPDATE admin_users SET active=? WHERE id=?').run(req.body.active ? 1 : 0, t.id);
    if (req.body.name !== undefined) db.prepare('UPDATE admin_users SET name=? WHERE id=?').run(String(req.body.name).slice(0, 60), t.id);
    if (req.admin.role === 'super' && req.body.role && ['super', 'manager', 'staff', 'courier'].includes(req.body.role) && t.id !== req.admin.id) db.prepare('UPDATE admin_users SET role=? WHERE id=?').run(req.body.role, t.id);
    if (req.admin.role === 'super' && req.body.branch_id !== undefined) db.prepare('UPDATE admin_users SET branch_id=? WHERE id=?').run(Number(req.body.branch_id) || null, t.id);
    if (req.body.active === 0) db.prepare('DELETE FROM admin_sessions WHERE admin_id=?').run(t.id);
    audit(req, 'staff_updated', 'admin', t.id, t.phone || t.email); res.json({ ok: true });
  });
  router.delete('/staff/:id', need('super', 'manager'), confirmed, (req, res) => {
    const t = db.prepare('SELECT * FROM admin_users WHERE id=?').get(req.params.id);
    if (!t) return fail(res, 404, 'Не найден');
    if (t.id === req.admin.id) return fail(res, 400, 'Нельзя удалить себя');
    if (req.admin.role === 'manager' && (t.branch_id !== req.admin.branch_id || !['staff', 'courier'].includes(t.role))) return fail(res, 403, 'Недостаточно прав');
    db.prepare('DELETE FROM admin_sessions WHERE admin_id=?').run(t.id);
    db.prepare('DELETE FROM admin_users WHERE id=?').run(t.id);
    audit(req, 'staff_deleted', 'admin', t.id, t.phone || t.email); res.json({ ok: true });
  });

  router.get('/audit', need('super'), (req, res) => res.json({ rows: db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all() }));

  /* images: upload from computer (PNG/JPG/WEBP/GIF, magic bytes checked) */
  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
  router.post('/upload', need('super'), (req, res) => {
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.data || ''));
    if (!m) return fail(res, 400, 'Нужна картинка PNG/JPG/WEBP/GIF');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) return fail(res, 400, 'Файл больше 8 МБ');
    const hex = buf.subarray(0, 4).toString('hex');
    if (!(hex.startsWith('89504e47') || hex.startsWith('ffd8ff') || hex === '52494646' || hex.startsWith('47494638'))) return fail(res, 400, 'Файл не похож на изображение');
    const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${EXT[m[1]]}`;
    fs.mkdirSync(require('./paths').uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(require('./paths').uploadsDir, name), buf);
    audit(req, 'upload', 'file', name); res.json({ url: `/uploads/${name}` });
  });

  /* ---------- branches list (never exposes the POS key hash) + POS key management ---------- */
  router.get('/branches', (req, res) => res.json({ rows: db.prepare('SELECT id,name,city,address,lat,lng,phone,open_time,close_time,active,delivery_radius,delivery_fee,free_from,min_order,(pos_key_hash IS NOT NULL) AS has_pos FROM branches ORDER BY id').all() }));
  router.post('/branches/:id/pos-key', need('super'), confirmed, (req, res) => {
    const b = db.prepare('SELECT id FROM branches WHERE id=?').get(req.params.id);
    if (!b) return fail(res, 404, 'Нет филиала');
    const key = 'wpos_' + crypto.randomBytes(24).toString('hex');
    db.prepare('UPDATE branches SET pos_key_hash=? WHERE id=?').run(sha(key), b.id);
    audit(req, 'pos_key_generated', 'branch', b.id); res.json({ key }); // shown once, only the hash is stored
  });
  router.delete('/branches/:id/pos-key', need('super'), confirmed, (req, res) => {
    db.prepare('UPDATE branches SET pos_key_hash=NULL WHERE id=?').run(req.params.id); audit(req, 'pos_key_revoked', 'branch', req.params.id); res.json({ ok: true });
  });

  /* ---------- couriers ---------- */
  const monthStart = () => { const t = new Date(Date.now() + 5 * 3600e3); t.setUTCDate(1); t.setUTCHours(0, 0, 0, 0); return fmt(new Date(t.getTime() - 5 * 3600e3)); };
  router.get('/couriers', need('super', 'manager'), (req, res) => {
    const b = req.admin.role === 'super' ? null : req.admin.branch_id;
    const rows = db.prepare(`SELECT a.id,a.name,a.phone,a.active,a.branch_id,br.name branch_name,
      (SELECT COUNT(*) FROM orders o WHERE o.courier_id=a.id AND o.status='done' AND o.delivered_at>=?) month_n,
      (SELECT COUNT(*) FROM orders o WHERE o.courier_id=a.id AND o.status='done') total_n,
      (SELECT ROUND(AVG(stars),2) FROM reviews r WHERE r.courier_id=a.id) rating,
      (SELECT COUNT(*) FROM reviews r WHERE r.courier_id=a.id) reviews
      FROM admin_users a LEFT JOIN branches br ON br.id=a.branch_id WHERE a.role='courier'${b ? ' AND a.branch_id=?' : ''} ORDER BY month_n DESC`).all(monthStart(), ...(b ? [b] : []));
    res.json({ rows });
  });
  router.get('/reviews', need('super', 'manager'), (req, res) => {
    const b = req.admin.role === 'super' ? null : req.admin.branch_id;
    const rows = db.prepare(`SELECT r.id,r.order_id,r.stars,r.comment,r.created_at,u.name user_name,u.phone,br.name branch_name,ca.name courier_name
      FROM reviews r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN branches br ON br.id=r.branch_id LEFT JOIN admin_users ca ON ca.id=r.courier_id
      ${b ? 'WHERE r.branch_id=?' : ''} ORDER BY r.id DESC LIMIT 300`).all(...(b ? [b] : []));
    res.json({ rows });
  });

  /* ---------- courier app API ---------- */
  const orderForCourier = o => ({
    id: o.id, status: o.status, total: o.total, payment: o.payment, comment: o.comment, ready_at: o.ready_at,
    items: JSON.parse(o.items_json).map(i => ({ name: i.name, qty: i.qty })),
    address: o.address_json ? JSON.parse(o.address_json) : null,
    customer: db.prepare('SELECT name,phone FROM users WHERE id=?').get(o.user_id),
    branch: db.prepare('SELECT name,address,lat,lng FROM branches WHERE id=?').get(o.branch_id),
  });
  router.get('/courier/orders', need('courier'), (req, res) => {
    const me = req.admin;
    const avail = db.prepare("SELECT * FROM orders WHERE branch_id=? AND type='delivery' AND status='ready' AND courier_id IS NULL ORDER BY id").all(me.branch_id);
    const mine = db.prepare("SELECT * FROM orders WHERE courier_id=? AND status='delivering' ORDER BY id").all(me.id);
    res.json({ available: avail.map(orderForCourier), mine: mine.map(orderForCourier) });
  });
  router.post('/courier/orders/:id/accept', need('courier'), (req, res) => {
    const r = db.prepare("UPDATE orders SET courier_id=? WHERE id=? AND branch_id=? AND type='delivery' AND status='ready' AND courier_id IS NULL").run(req.admin.id, req.params.id, req.admin.branch_id);
    if (!r.changes) return fail(res, 409, 'Заказ уже взял другой курьер или он недоступен');
    setStatus(Number(req.params.id), 'delivering', { courierName: req.admin.name });
    audit(req, 'courier_accept', 'order', req.params.id); res.json({ ok: true });
  });
  router.post('/courier/location', need('courier'), (req, res) => {
    const lat = Number(req.body.lat), lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail(res, 400, 'Неверные координаты');
    db.prepare('INSERT INTO courier_location (courier_id,lat,lng,updated_at) VALUES (?,?,?,?) ON CONFLICT(courier_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,updated_at=excluded.updated_at').run(req.admin.id, lat, lng, now());
    res.json({ ok: true });
  });
  router.post('/courier/orders/:id/delivered', need('courier'), (req, res) => {
    const o = db.prepare("SELECT * FROM orders WHERE id=? AND courier_id=? AND status='delivering'").get(req.params.id, req.admin.id);
    if (!o) return fail(res, 404, 'Заказ не найден');
    setStatus(o.id, 'done'); audit(req, 'courier_delivered', 'order', o.id); res.json({ ok: true });
  });
  router.get('/courier/me', need('courier'), (req, res) => {
    const me = req.admin;
    const stats = db.prepare("SELECT (SELECT COUNT(*) FROM orders WHERE courier_id=? AND status='done' AND delivered_at>=?) month_n, (SELECT COUNT(*) FROM orders WHERE courier_id=? AND status='done') total_n, (SELECT ROUND(AVG(stars),2) FROM reviews WHERE courier_id=?) rating").get(me.id, monthStart(), me.id, me.id);
    const reviews = db.prepare('SELECT order_id,stars,comment,created_at FROM reviews WHERE courier_id=? ORDER BY id DESC LIMIT 30').all(me.id);
    const branch = db.prepare('SELECT name,address FROM branches WHERE id=?').get(me.branch_id);
    res.json({ name: me.name, branch, stats, reviews });
  });

  /* ---------- WendyCoin: balances, manual adjustments, ledger ---------- */
  router.get('/coins', need('super'), (req, res) => res.json({
    customers: db.prepare('SELECT id,phone,name,coins FROM users ORDER BY coins DESC, id DESC LIMIT 500').all(),
    total: db.prepare('SELECT COALESCE(SUM(coins),0) s FROM users').get().s,
    log: db.prepare('SELECT l.*, u.phone FROM coin_log l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 100').all(),
    products: db.prepare('SELECT id,name,price,coin_price FROM products WHERE active=1 ORDER BY category_id,sort,id').all(),
  }));
  router.post('/coins/adjust', need('super'), confirmed, (req, res) => {
    const delta = Math.trunc(Number(req.body.delta)), u = db.prepare('SELECT id,coins FROM users WHERE id=?').get(req.body.user_id);
    if (!u || !delta || Math.abs(delta) > 1e7) return fail(res, 400, 'Неверные данные');
    if (u.coins + delta < 0) return fail(res, 400, 'Баланс не может быть отрицательным');
    db.prepare('UPDATE users SET coins=coins+? WHERE id=?').run(delta, u.id);
    coinLog(u.id, delta, String(req.body.reason || 'Корректировка администратором').slice(0, 120), req.admin.id);
    notify(u.id, null, 'coins', delta > 0 ? `+${delta} WendyCoin` : `${delta} WendyCoin`, String(req.body.reason || '').slice(0, 120));
    audit(req, 'coins_adjust', 'user', u.id, `${delta}`); res.json({ ok: true });
  });

  /* ---------- products with their "goes well with" add-ons ---------- */
  function saveAddons(pid, arr) {
    if (!Array.isArray(arr)) return;
    db.prepare('DELETE FROM product_addons WHERE product_id=?').run(pid);
    const seen = new Set(); let i = 0;
    for (const raw of arr) {
      const id = Number(raw);
      if (!Number.isInteger(id) || id === pid || seen.has(id) || seen.size >= 8 || !db.prepare('SELECT id FROM products WHERE id=?').get(id)) continue;
      seen.add(id); db.prepare('INSERT INTO product_addons (product_id,addon_id,sort) VALUES (?,?,?)').run(pid, id, i++);
    }
  }
  router.get('/products', (req, res) => {
    const ad = {};
    for (const r of db.prepare('SELECT product_id, addon_id FROM product_addons ORDER BY sort, addon_id').all()) (ad[r.product_id] = ad[r.product_id] || []).push(r.addon_id);
    res.json({ rows: db.prepare('SELECT * FROM products ORDER BY sort,id').all().map(p => ({ ...p, addons: ad[p.id] || [] })) });
  });
  router.post('/catalog-key', need('super'), confirmed, (req, res) => {
    const key = 'wcat_' + crypto.randomBytes(24).toString('hex');
    db.prepare("INSERT INTO settings (key,value) VALUES ('catalog_key_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(sha(key));
    audit(req, 'catalog_key_generated'); res.json({ key });
  });
  router.get('/catalog-key', need('super'), (req, res) => res.json({ has: !!db.prepare("SELECT value FROM settings WHERE key='catalog_key_hash'").get() }));
  router.delete('/catalog-key', need('super'), confirmed, (req, res) => { db.prepare("DELETE FROM settings WHERE key='catalog_key_hash'").run(); audit(req, 'catalog_key_revoked'); res.json({ ok: true }); });

  /* ---------- analytics (super: everything; manager: only their own branch) ---------- */
  const tzDay = d => new Date(d.getTime() + 5 * 3600e3).toISOString().slice(0, 10);
  const parseTs = t => new Date(String(t).replace(' ', 'T') + 'Z');
  const anScope = req => (req.admin.role === 'super' ? (Number(req.query.branch_id) || null) : req.admin.branch_id);

  router.get('/analytics/summary', need('super', 'manager'), (req, res) => {
    const period = ['today', '7', '30', 'all'].includes(req.query.period) ? req.query.period : '7';
    const b = anScope(req);
    const from = period === 'today' ? dayStartUtc(0) : period === '7' ? dayStartUtc(-6) : period === '30' ? dayStartUtc(-29) : new Date(0);
    const rows = db.prepare(`SELECT id,user_id,branch_id,type,status,total,payment,items_json,created_at FROM orders WHERE created_at>=?${b ? ' AND branch_id=?' : ''}`)
      .all(fmt(from), ...(b ? [b] : []));
    const valid = rows.filter(o => o.status !== 'cancelled');
    const revenue = valid.reduce((n, o) => n + o.total, 0);

    // days (no more than the last 90 in "all time")
    const days = [];
    const start = period === 'all' ? Math.max(from.getTime(), dayStartUtc(-89).getTime()) : from.getTime();
    for (let t = start; t < Date.now() + 3600e3; t += 86400e3) days.push(tzDay(new Date(t)));
    const dayMap = Object.fromEntries(days.map(d => [d, { day: d, orders: 0, revenue: 0, customers: 0 }]));
    for (const o of valid) { const k = dayMap[tzDay(parseTs(o.created_at))]; if (k) { k.orders++; k.revenue += o.total; } }
    if (req.admin.role === 'super' && !b) for (const u of db.prepare('SELECT created_at FROM users WHERE created_at>=?').all(fmt(new Date(start)))) { const k = dayMap[tzDay(parseTs(u.created_at))]; if (k) k.customers++; }

    // branches
    const branches = db.prepare('SELECT id,name,address FROM branches ORDER BY id').all().filter(x => !b || x.id === b);
    const by_branch = branches.map(x => {
      const list = valid.filter(o => o.branch_id === x.id), rev = list.reduce((n, o) => n + o.total, 0);
      return { id: x.id, name: x.name || x.address, orders: list.length, revenue: rev, avg: list.length ? Math.round(rev / list.length) : 0,
        delivery: list.filter(o => o.type === 'delivery').length, pickup: list.filter(o => o.type === 'pickup').length };
    }).sort((p1, p2) => p2.orders - p1.orders);

    // products (+ which branch sells each one most)
    const bname = Object.fromEntries(branches.map(x => [x.id, x.name || x.address]));
    const tally = {};
    for (const o of valid) for (const it of JSON.parse(o.items_json)) {
      const t = tally[it.name] = tally[it.name] || { name: it.name, qty: 0, revenue: 0, br: {} };
      t.qty += it.qty; t.revenue += it.price * it.qty; t.br[o.branch_id] = (t.br[o.branch_id] || 0) + it.qty;
    }
    const prodAll = Object.values(tally).sort((p1, p2) => p2.qty - p1.qty);
    const top_products = prodAll.slice(0, 12).map(t => { const best = Object.entries(t.br).sort((p1, p2) => p2[1] - p1[1])[0]; return { name: t.name, qty: t.qty, revenue: t.revenue, best_branch: best ? bname[best[0]] || '' : '' }; });

    // peak hours, order types, payments, statuses
    const by_hour = Array(24).fill(0);
    for (const o of valid) by_hour[(parseTs(o.created_at).getUTCHours() + 5) % 24]++;
    const count = (list, f) => list.reduce((m, o) => { const k = f(o); m[k] = (m[k] || 0) + 1; return m; }, {});

    // customers
    const buyers = new Set(valid.map(o => o.user_id));
    const allCounts = db.prepare(`SELECT user_id, COUNT(*) c FROM orders WHERE status<>'cancelled'${b ? ' AND branch_id=?' : ''} GROUP BY user_id`).all(...(b ? [b] : []));
    const repeat = allCounts.filter(r => buyers.has(r.user_id) && r.c >= 2).length;
    const customers = {
      total: b ? db.prepare('SELECT COUNT(DISTINCT user_id) c FROM orders WHERE branch_id=?').get(b).c : db.prepare('SELECT COUNT(*) c FROM users').get().c,
      new_in_period: b ? null : db.prepare('SELECT COUNT(*) c FROM users WHERE created_at>=?').get(fmt(from)).c,
      buyers: buyers.size, repeat_rate: buyers.size ? Math.round(repeat / buyers.size * 100) : 0,
    };
    res.json({
      period, branch_id: b,
      kpis: { orders: valid.length, revenue, avg: valid.length ? Math.round(revenue / valid.length) : 0, cancelled: rows.length - valid.length, done: rows.filter(o => o.status === 'done').length },
      days: Object.values(dayMap), by_branch, top_products, by_hour,
      by_type: count(valid, o => o.type), by_payment: count(valid, o => o.payment), by_status: count(rows, o => o.status), customers,
    });
  });

  router.get('/analytics/customers', need('super', 'manager'), (req, res) => {
    const b = anScope(req), q = `%${String(req.query.q || '').trim().replace(/[%_]/g, '')}%`;
    const rows = db.prepare(`SELECT u.id,u.phone,u.name,u.coins,u.created_at,
        COUNT(o.id) AS orders, COALESCE(SUM(CASE WHEN o.status<>'cancelled' THEN o.total END),0) AS spent, MAX(o.created_at) AS last_order
      FROM users u LEFT JOIN orders o ON o.user_id=u.id${b ? ' AND o.branch_id=?' : ''}
      WHERE (u.phone LIKE ? OR u.name LIKE ?)
      GROUP BY u.id${b ? ' HAVING orders>0' : ''} ORDER BY spent DESC, u.id DESC LIMIT 500`).all(...(b ? [b] : []), q, q);
    res.json({ rows });
  });
  router.get('/analytics/customers/:id/orders', need('super', 'manager'), (req, res) => {
    const b = anScope(req);
    const u = db.prepare('SELECT id,phone,name,coins,created_at FROM users WHERE id=?').get(req.params.id);
    if (!u) return fail(res, 404, 'Клиент не найден');
    const orders = db.prepare(`SELECT o.id,o.type,o.status,o.total,o.payment,o.created_at,o.coins_spent,o.items_json,br.name AS branch_name,o.branch_id
      FROM orders o LEFT JOIN branches br ON br.id=o.branch_id WHERE o.user_id=?${b ? ' AND o.branch_id=?' : ''} ORDER BY o.id DESC LIMIT 200`)
      .all(u.id, ...(b ? [b] : [])).map(o => ({ ...o, items: JSON.parse(o.items_json), items_json: undefined }));
    if (b && !orders.length) return fail(res, 403, 'Нет заказов этого клиента в вашем филиале');
    audit(req, 'customer_history_viewed', 'user', u.id);
    res.json({ user: u, orders });
  });

  /* generic CRUD for menu/branches/banners/promos (super only; reads open to every role so the board can show names) */
  router.get('/:table', isTable, (req, res) => res.json({ rows: db.prepare(`SELECT * FROM ${req.params.table} ORDER BY ${['categories', 'products', 'banners'].includes(req.params.table) ? 'sort,id' : 'id'}`).all() }));
  router.post('/:table', isTable, need('super'), (req, res) => {
    try {
      const t = req.params.table, d = pick(t, req.body), keys = Object.keys(d);
      if (!keys.length) return fail(res, 400, 'Пустые данные');
      const id = Number(db.prepare(`INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => d[k])).lastInsertRowid);
      if (t === 'products') saveAddons(id, req.body.addons);
      audit(req, 'create', t, id, d.name || d.title || d.code || ''); res.json({ row: db.prepare(`SELECT * FROM ${t} WHERE id=?`).get(id) });
    } catch (e) { fail(res, 400, e.message); }
  });
  router.put('/:table/:id', isTable, need('super'), (req, res) => {
    try {
      const t = req.params.table, d = pick(t, req.body), keys = Object.keys(d);
      if (!keys.length && !(t === 'products' && Array.isArray(req.body.addons))) return fail(res, 400, 'Пустые данные');
      if (keys.length) db.prepare(`UPDATE ${t} SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).run(...keys.map(k => d[k]), req.params.id);
      if (t === 'products') saveAddons(Number(req.params.id), req.body.addons);
      audit(req, 'update', t, req.params.id, d.name || d.title || d.code || ''); res.json({ row: db.prepare(`SELECT * FROM ${t} WHERE id=?`).get(req.params.id) });
    } catch (e) { fail(res, 400, e.message); }
  });
  router.delete('/:table/:id', isTable, need('super'), confirmed, (req, res) => {
    const t = req.params.table;
    db.prepare(`DELETE FROM ${t} WHERE id=?`).run(req.params.id);
    audit(req, 'delete', t, req.params.id); res.json({ ok: true });
  });

  router.use((req, res) => fail(res, 404, 'Не найдено'));
  app.use('/api/admin', router);
};
