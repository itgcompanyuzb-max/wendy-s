/* Sign-in "by face" for the admin, manager and courier areas.
 * It uses passkeys (WebAuthn): the phone's own Face ID / fingerprint unlocks a key that never leaves the device.
 * The server keeps only the public key, never a photo or any other biometric data
 * (biometric data must stay inside Uzbekistan by law; this way none is collected at all).
 *
 * Two ways in:
 *  - on the device that holds the passkey: "Войти по лицу" on the login screen;
 *  - on a computer: the login screen shows a QR code, the phone scans it, the person confirms with Face ID,
 *    the phone shows a tick and the computer opens the panel. */
const crypto = require('crypto');
const {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

module.exports = function passkeys({ db, fail, audit, now, sha, ipOf, limited, hits, areaRoles, inList, startSession }) {
  db.exec(`CREATE TABLE IF NOT EXISTS admin_passkeys (
    cred_id TEXT PRIMARY KEY, phone TEXT NOT NULL, public_key BLOB NOT NULL, counter INTEGER DEFAULT 0,
    transports TEXT DEFAULT '', device TEXT DEFAULT '', created_at INTEGER NOT NULL, last_used INTEGER
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_admin_passkeys_phone ON admin_passkeys(phone)');

  const AREA_NAMES = { admin: 'админ-панель', manager: 'панель менеджера', courier: 'приложение курьера' };
  const QR_TTL = 120, CHALLENGE_TTL = 300;
  const challenges = new Map(); // id -> { challenge, exp, phone? }
  const qrs = new Map(); // sha(token) -> { app, exp, adminId, ip }
  const sweep = () => { const t = now(); for (const m of [challenges, qrs, invites]) for (const [k, v] of m) if (v.exp < t) m.delete(k); };
  const rp = req => ({ rpID: req.hostname, origin: `${req.protocol}://${req.get('host')}` });
  // one face for every role of the same number: the WebAuthn user handle is derived from the phone
  const userHandle = phone => Buffer.from(sha('wendys-admin:' + phone).slice(0, 32));
  const throttle = (req, res) => {
    const ip = ipOf(req);
    if (limited(ip)) { fail(res, 429, 'Слишком много попыток. Попробуйте позже'); return true; }
    hits.get(ip).push(Date.now()); return false;
  };
  // the account this phone uses in an area (a number may hold several roles); null if it has none there
  const accountFor = (phone, app) => {
    const roles = areaRoles(app);
    return db.prepare(`SELECT * FROM admin_users WHERE phone=? AND active=1 AND role IN (${inList(roles)})
      ORDER BY CASE role WHEN 'super' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, id LIMIT 1`).get(phone, ...roles);
  };

  /* ---------- registration, shared by "turn on for myself" and "add an employee's face" ---------- */
  async function regOptions(req, phone, name) {
    const mine = db.prepare('SELECT cred_id, transports FROM admin_passkeys WHERE phone=?').all(phone);
    return generateRegistrationOptions({
      rpName: "Wendy's", rpID: rp(req).rpID,
      userName: phone, userDisplayName: name ? `${name} (${phone})` : phone,
      userID: userHandle(phone), attestationType: 'none', timeout: 60000,
      excludeCredentials: mine.map(k => ({ id: k.cred_id, transports: k.transports ? k.transports.split(',') : undefined })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
  }
  async function saveKey(req, phone, response, challenge, device) {
    const { rpID, origin } = rp(req);
    let v;
    try {
      v = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
    } catch (e) { console.warn('[passkey] register:', e.message); v = null; }
    if (!v?.verified) return false;
    const c = v.registrationInfo.credential;
    db.prepare('INSERT OR REPLACE INTO admin_passkeys (cred_id, phone, public_key, counter, transports, device, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(c.id, phone, Buffer.from(c.publicKey), c.counter, (c.transports || []).join(','), String(device || '').slice(0, 60), now());
    return true;
  }

  /* ---------- an admin adds an employee's face from the computer: a one-time QR the employee scans with their phone ---------- */
  const INVITE_TTL = 300;
  const invites = new Map(); // sha(token) -> { adminId, by, exp, status: 'pending'|'done', challenge }
  const ROLE_RU = { super: 'Администратор', manager: 'Менеджер филиала', staff: 'Сотрудник', courier: 'Курьер' };
  const inviteOf = token => { const i = invites.get(sha(String(token || ''))); return i && i.exp >= now() ? i : null; };

  /* ---------- public: sign in ---------- */
  function publicRoutes(router) {
    // 1. the browser asks for a challenge; no list of keys is sent, the phone offers the passkey it holds
    router.post('/auth/passkey/options', async (req, res) => {
      if (throttle(req, res)) return;
      sweep();
      const options = await generateAuthenticationOptions({ rpID: rp(req).rpID, userVerification: 'required', timeout: 60000 });
      const id = crypto.randomBytes(16).toString('hex');
      challenges.set(id, { challenge: options.challenge, exp: now() + CHALLENGE_TTL });
      res.json({ id, options });
    });

    // 2. the signed answer. With `qr` it approves the computer that shows that QR code; without it, signs in here.
    router.post('/auth/passkey/verify', async (req, res) => {
      if (throttle(req, res)) return;
      const ch = challenges.get(String(req.body.id || ''));
      challenges.delete(String(req.body.id || ''));
      if (!ch || ch.exp < now()) return fail(res, 400, 'Время подтверждения истекло. Попробуйте ещё раз');
      const response = req.body.response || {};
      const key = db.prepare('SELECT * FROM admin_passkeys WHERE cred_id=?').get(String(response.id || ''));
      if (!key) return fail(res, 401, 'Этот ключ не найден. Войдите по номеру телефона и включите вход по лицу заново');

      let qr = null, qrKey = '';
      if (req.body.qr) {
        qrKey = sha(String(req.body.qr)); qr = qrs.get(qrKey);
        if (!qr || qr.exp < now() || qr.adminId) return fail(res, 400, 'QR-код устарел. Обновите страницу на компьютере и отсканируйте снова');
      }
      const app = qr ? qr.app : String(req.body.app || 'admin');
      const a = accountFor(key.phone, app);
      if (!a) { audit(req, 'login_failed', 'phone', key.phone, 'passkey: нет роли'); return fail(res, 403, `У этого номера нет доступа: ${AREA_NAMES[app] || app}`); }
      if (a.locked_until > now()) return fail(res, 429, 'Вход временно заблокирован. Попробуйте позже');

      const { rpID, origin } = rp(req);
      let v;
      try {
        v = await verifyAuthenticationResponse({
          response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
          credential: { id: key.cred_id, publicKey: new Uint8Array(key.public_key), counter: key.counter, transports: key.transports ? key.transports.split(',') : undefined },
        });
      } catch (e) { console.warn('[passkey] verify:', e.message); v = null; }
      if (!v?.verified) { req.admin = a; audit(req, 'login_failed', 'phone', key.phone, 'passkey'); return fail(res, 401, 'Не удалось подтвердить. Попробуйте ещё раз'); }
      db.prepare('UPDATE admin_passkeys SET counter=?, last_used=? WHERE cred_id=?').run(v.authenticationInfo.newCounter, now(), key.cred_id);

      req.admin = a;
      if (qr) {
        qr.adminId = a.id;
        audit(req, 'qr_login_approved', 'admin', a.id, `с телефона, IP компьютера ${qr.ip}`);
        return res.json({ ok: true, approved: true, area: AREA_NAMES[app] || app, name: a.name || '' });
      }
      res.json({ token: startSession(req, a, 'login_passkey') });
    });

    // the computer: a fresh QR code, then ask every 2 seconds whether a phone approved it
    router.post('/auth/qr/start', (req, res) => {
      if (throttle(req, res)) return;
      sweep();
      const app = ['admin', 'manager', 'courier'].includes(req.body.app) ? req.body.app : 'admin';
      const token = crypto.randomBytes(24).toString('base64url');
      qrs.set(sha(token), { app, exp: now() + QR_TTL, adminId: null, ip: ipOf(req) });
      res.json({ token, url: `${req.protocol}://${req.get('host')}/admin/qr.html#${token}`, expires_in: QR_TTL });
    });
    router.post('/auth/qr/status', (req, res) => {
      const k = sha(String(req.body.token || '')), q = qrs.get(k);
      if (!q || q.exp < now()) { qrs.delete(k); return res.json({ status: 'expired' }); }
      if (!q.adminId) return res.json({ status: 'pending' });
      qrs.delete(k); // one QR = one session
      const a = db.prepare('SELECT * FROM admin_users WHERE id=? AND active=1').get(q.adminId);
      if (!a) return res.json({ status: 'expired' });
      res.json({ status: 'ok', token: startSession(req, a, 'login_qr') });
    });
    // the employee's phone, opened from the admin's QR: who is being added, then the Face ID registration
    router.post('/auth/enroll/info', (req, res) => {
      const i = inviteOf(req.body.token);
      if (!i || i.status !== 'pending') return res.json({ valid: false });
      const a = db.prepare('SELECT name, phone, role FROM admin_users WHERE id=? AND active=1').get(i.adminId);
      if (!a) return res.json({ valid: false });
      res.json({ valid: true, name: a.name || '', phone: a.phone.slice(0, 4) + ' ** *** ' + a.phone.slice(-4, -2) + ' ' + a.phone.slice(-2), role: ROLE_RU[a.role] || a.role });
    });
    router.post('/auth/enroll/options', async (req, res) => {
      if (throttle(req, res)) return;
      const i = inviteOf(req.body.token);
      if (!i || i.status !== 'pending') return fail(res, 400, 'QR-код устарел. Попросите показать новый');
      const a = db.prepare('SELECT * FROM admin_users WHERE id=? AND active=1').get(i.adminId);
      if (!a) return fail(res, 400, 'Сотрудник отключён');
      const options = await regOptions(req, a.phone, a.name);
      i.challenge = options.challenge;
      res.json({ options });
    });
    router.post('/auth/enroll/finish', async (req, res) => {
      if (throttle(req, res)) return;
      const i = inviteOf(req.body.token);
      if (!i || i.status !== 'pending' || !i.challenge) return fail(res, 400, 'QR-код устарел. Попросите показать новый');
      const a = db.prepare('SELECT * FROM admin_users WHERE id=? AND active=1').get(i.adminId);
      if (!a) return fail(res, 400, 'Сотрудник отключён');
      const challenge = i.challenge; i.challenge = null;
      if (!(await saveKey(req, a.phone, req.body.response, challenge, req.body.device))) return fail(res, 400, 'Не удалось сохранить. Попробуйте ещё раз');
      i.status = 'done';
      req.admin = { id: i.by }; audit(req, 'passkey_added', 'admin', a.id, `по QR от администратора, ${String(req.body.device || '').slice(0, 40)}`);
      res.json({ ok: true, name: a.name || '' });
    });

    // the phone page shows what it is about to approve
    router.post('/auth/qr/info', (req, res) => {
      const q = qrs.get(sha(String(req.body.token || '')));
      if (!q || q.exp < now() || q.adminId) return res.json({ valid: false });
      res.json({ valid: true, area: AREA_NAMES[q.app] || q.app });
    });
  }

  /* ---------- signed in: turn the face sign-in on / off for this number ---------- */
  function privateRoutes(router) {
    router.get('/auth/passkeys', (req, res) => {
      res.json({ rows: db.prepare('SELECT cred_id, device, created_at, last_used FROM admin_passkeys WHERE phone=? ORDER BY created_at DESC').all(req.admin.phone) });
    });
    router.post('/auth/passkey/register-options', async (req, res) => {
      if (!req.admin.phone) return fail(res, 400, 'У аккаунта нет номера телефона');
      const options = await regOptions(req, req.admin.phone, req.admin.name);
      challenges.set('reg:' + req.admin.id, { challenge: options.challenge, exp: now() + CHALLENGE_TTL });
      res.json({ options });
    });
    router.post('/auth/passkey/register', async (req, res) => {
      const ch = challenges.get('reg:' + req.admin.id);
      challenges.delete('reg:' + req.admin.id);
      if (!ch || ch.exp < now()) return fail(res, 400, 'Время истекло. Попробуйте ещё раз');
      const device = String(req.body.device || '').slice(0, 60);
      if (!(await saveKey(req, req.admin.phone, req.body.response, ch.challenge, device))) return fail(res, 400, 'Не удалось сохранить. Попробуйте ещё раз');
      audit(req, 'passkey_added', 'admin', req.admin.id, device);
      res.json({ ok: true });
    });
    // who may add / remove an employee's face: the owner for anyone, a manager for staff and couriers of their branch
    const canManage = (me, t) => me.role === 'super' || t.id === me.id || (me.role === 'manager' && t.branch_id === me.branch_id && ['staff', 'courier'].includes(t.role));
    router.post('/staff/:id/face-invite', (req, res) => {
      const t = db.prepare('SELECT * FROM admin_users WHERE id=?').get(Number(req.params.id));
      if (!t || !canManage(req.admin, t)) return fail(res, 403, 'Недостаточно прав');
      if (!t.active) return fail(res, 400, 'Сотрудник отключён');
      if (!t.phone) return fail(res, 400, 'У сотрудника нет номера телефона');
      sweep(); for (const [k, v] of invites) if (v.exp < now() || v.adminId === t.id) invites.delete(k); // one live QR per employee
      const token = crypto.randomBytes(24).toString('base64url');
      invites.set(sha(token), { adminId: t.id, by: req.admin.id, exp: now() + INVITE_TTL, status: 'pending', challenge: null });
      audit(req, 'face_invite', 'admin', t.id, t.phone);
      res.json({ token, url: `${req.protocol}://${req.get('host')}/admin/face.html#${token}`, expires_in: INVITE_TTL });
    });
    router.post('/staff/face-invite/status', (req, res) => {
      const i = inviteOf(req.body.token);
      if (!i || i.by !== req.admin.id) return res.json({ status: 'expired' });
      res.json({ status: i.status });
    });
    router.delete('/staff/:id/faces', (req, res) => {
      const t = db.prepare('SELECT * FROM admin_users WHERE id=?').get(Number(req.params.id));
      if (!t || !canManage(req.admin, t)) return fail(res, 403, 'Недостаточно прав');
      const r = db.prepare('DELETE FROM admin_passkeys WHERE phone=?').run(t.phone || '');
      audit(req, 'passkey_removed', 'admin', t.id, `все устройства (${r.changes})`);
      res.json({ ok: true, removed: r.changes });
    });
    router.delete('/auth/passkeys/:id', (req, res) => {
      const r = db.prepare('DELETE FROM admin_passkeys WHERE cred_id=? AND phone=?').run(req.params.id, req.admin.phone);
      if (!r.changes) return fail(res, 404, 'Не найдено');
      audit(req, 'passkey_removed', 'admin', req.admin.id);
      res.json({ ok: true });
    });
  }

  return { publicRoutes, privateRoutes };
};
