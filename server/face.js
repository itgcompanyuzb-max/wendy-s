/* Sign-in with the camera (face recognition) for the admin, manager and courier areas.
 * The browser turns a face into 128 numbers (a "face print", face-api.js); no photo is sent or stored.
 * Face prints ARE biometric data: under the Uzbek personal-data law (ZRU-547 as amended by ZRU-1125, 2026)
 * they must be stored on a server inside Uzbekistan and only with the employee's written consent.
 * They are kept encrypted (AES-256-GCM); the key is FACE_KEY from the environment, or a key file next to the database. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports = function faceLogin({ db, fail, audit, now, ipOf, limited, hits, areaRoles, inList, startSession, dataDir }) {
  db.exec(`CREATE TABLE IF NOT EXISTS admin_faces (
    id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL, vec BLOB NOT NULL,
    created_at INTEGER NOT NULL, created_by INTEGER, consent_by INTEGER
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_admin_faces_phone ON admin_faces(phone)');

  /* ---------- encryption at rest ---------- */
  function loadKey() {
    if (process.env.FACE_KEY) return crypto.createHash('sha256').update(process.env.FACE_KEY).digest();
    const f = path.join(dataDir, 'face.key');
    try { return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex'); } catch { /* first start */ }
    const k = crypto.randomBytes(32);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(f, k.toString('hex'), { mode: 0o600 });
    return k;
  }
  const KEY = loadKey();
  const seal = vec => {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const body = Buffer.concat([c.update(Buffer.from(Float32Array.from(vec).buffer)), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]);
  };
  const open = blob => {
    const b = Buffer.from(blob), d = crypto.createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    const raw = Buffer.concat([d.update(b.subarray(28)), d.final()]);
    return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  };

  /* ---------- matching ---------- */
  const MATCH = 0.42; // euclidean distance; face-api's usual "same person" line is 0.6, stricter here
  const MARGIN = 0.06; // the best person must beat the next one clearly
  const dist = (a, b) => { let s = 0; for (let i = 0; i < 128; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };
  const okVec = v => Array.isArray(v) && v.length === 128 && v.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 2);
  // the closest phone (and the runner-up) among the given rows
  function nearest(vec, rows) {
    const best = new Map();
    for (const r of rows) {
      let v; try { v = open(r.vec); } catch { continue; } // a row sealed with another key
      const d = dist(vec, v);
      if (!best.has(r.phone) || d < best.get(r.phone)) best.set(r.phone, d);
    }
    const sorted = [...best].sort((x, y) => x[1] - y[1]);
    return { phone: sorted[0]?.[0], d: sorted[0]?.[1] ?? 9, next: sorted[1]?.[1] ?? 9 };
  }
  const throttle = (req, res) => {
    const ip = ipOf(req);
    if (limited(ip)) { fail(res, 429, 'Слишком много попыток. Попробуйте позже'); return true; }
    hits.get(ip).push(Date.now()); return false;
  };
  const accountFor = (phone, app) => {
    const roles = areaRoles(app);
    return db.prepare(`SELECT * FROM admin_users WHERE phone=? AND active=1 AND role IN (${inList(roles)})
      ORDER BY CASE role WHEN 'super' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, id LIMIT 1`).get(phone, ...roles);
  };

  /* ---------- public: sign in by camera ---------- */
  function publicRoutes(router) {
    router.post('/auth/face/login', (req, res) => {
      if (throttle(req, res)) return;
      const vec = req.body.descriptor, app = ['admin', 'manager', 'courier'].includes(req.body.app) ? req.body.app : 'admin';
      if (!okVec(vec)) return fail(res, 400, 'Лицо не найдено');
      const roles = areaRoles(app);
      // only people who may enter this area take part in the search
      const rows = db.prepare(`SELECT f.phone, f.vec FROM admin_faces f WHERE f.phone IN
        (SELECT phone FROM admin_users WHERE active=1 AND role IN (${inList(roles)}))`).all(...roles);
      const m = nearest(vec, rows);
      if (!m.phone || m.d > MATCH || m.next - m.d < MARGIN) {
        audit(req, 'login_failed', 'face', '', `камера: не распознано (${m.d.toFixed(2)})`);
        return fail(res, 401, 'Лицо не распознано. Попробуйте ещё раз при хорошем свете или войдите по номеру');
      }
      const a = accountFor(m.phone, app);
      if (!a) return fail(res, 401, 'Лицо не распознано');
      if (a.locked_until > now()) return fail(res, 429, 'Вход временно заблокирован. Попробуйте позже');
      res.json({ token: startSession(req, a, 'login_face'), name: a.name || '' });
    });
  }

  /* ---------- signed in: add / remove an employee's face ---------- */
  function privateRoutes(router) {
    const canManage = (me, t) => me.role === 'super' || t.id === me.id || (me.role === 'manager' && t.branch_id === me.branch_id && ['staff', 'courier'].includes(t.role));
    function saveFace(req, res, t, self) {
      if (!t.active || !t.phone) return fail(res, 400, 'Сотрудник отключён или без номера');
      if (req.body.consent !== true) return fail(res, 400, 'Нужно письменное согласие сотрудника на обработку биометрических данных');
      const samples = req.body.samples;
      if (!Array.isArray(samples) || samples.length < 3 || samples.length > 6 || !samples.every(okVec)) return fail(res, 400, 'Не удалось снять лицо. Попробуйте ещё раз');
      // the same face already belongs to someone else? then sign-in would be ambiguous
      const others = db.prepare('SELECT phone, vec FROM admin_faces WHERE phone<>?').all(t.phone);
      for (const s of samples) {
        const m = nearest(s, others);
        if (m.phone && m.d < MATCH + MARGIN) {
          const who = db.prepare('SELECT name FROM admin_users WHERE phone=? LIMIT 1').get(m.phone);
          return fail(res, 400, `Это лицо очень похоже на лицо сотрудника «${who?.name || m.phone}». Добавьте другое лицо или удалите старое`);
        }
      }
      const ins = db.prepare('INSERT INTO admin_faces (phone, vec, created_at, created_by, consent_by) VALUES (?,?,?,?,?)');
      db.prepare('DELETE FROM admin_faces WHERE phone=?').run(t.phone); // re-taking replaces the old face
      for (const s of samples) ins.run(t.phone, seal(s), now(), req.admin.id, req.admin.id);
      audit(req, 'face_added', 'admin', t.id, `камера, ${samples.length} снимка, ${self ? 'согласие дал сам сотрудник' : 'согласие подтвердил администратор'}`);
      res.json({ ok: true });
    }
    router.post('/staff/:id/camface', (req, res) => {
      const t = db.prepare('SELECT * FROM admin_users WHERE id=?').get(Number(req.params.id));
      if (!t || !canManage(req.admin, t)) return fail(res, 403, 'Недостаточно прав');
      saveFace(req, res, t, t.id === req.admin.id);
    });
    // the signed-in person's own face (every role, couriers included: their area only reaches /auth and /courier)
    router.get('/auth/camface', (req, res) => res.json({ n: db.prepare('SELECT COUNT(*) c FROM admin_faces WHERE phone=?').get(req.admin.phone || '').c }));
    router.post('/auth/camface', (req, res) => saveFace(req, res, db.prepare('SELECT * FROM admin_users WHERE id=?').get(req.admin.id), true));
    router.delete('/auth/camface', (req, res) => {
      db.prepare('DELETE FROM admin_faces WHERE phone=?').run(req.admin.phone || '');
      audit(req, 'face_removed', 'admin', req.admin.id, 'камера, сам');
      res.json({ ok: true });
    });
    router.delete('/staff/:id/camface', (req, res) => {
      const t = db.prepare('SELECT * FROM admin_users WHERE id=?').get(Number(req.params.id));
      if (!t || !canManage(req.admin, t)) return fail(res, 403, 'Недостаточно прав');
      db.prepare('DELETE FROM admin_faces WHERE phone=?').run(t.phone || '');
      audit(req, 'face_removed', 'admin', t.id, 'камера');
      res.json({ ok: true });
    });
  }

  return { publicRoutes, privateRoutes };
};
