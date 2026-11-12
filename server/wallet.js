/* WendyCoin card in Apple Wallet: balance + a QR the cash desk / kiosk scans.
   Needs a Pass Type ID certificate from a paid Apple Developer account (env, see README). Without it the feature stays hidden.
   The balance on the card updates by itself: Apple's pass web service below + a push to the phone whenever coins change. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http2 = require('http2');
const zlib = require('zlib');
const db = require('./db');

let forge = null;
try { forge = require('node-forge'); } catch { /* not installed: Wallet is off */ }

db.exec(`CREATE TABLE IF NOT EXISTS wallet_passes (
  serial TEXT PRIMARY KEY, user_id INTEGER UNIQUE NOT NULL, auth_token TEXT NOT NULL, code TEXT NOT NULL, code_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallet_code ON wallet_passes(code_hash);
CREATE TABLE IF NOT EXISTS wallet_regs (
  device_id TEXT NOT NULL, serial TEXT NOT NULL, push_token TEXT NOT NULL, PRIMARY KEY (device_id, serial)
);`);

const env = k => String(process.env[k] || '').trim();
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const ABC = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => 'WP' + [...crypto.randomBytes(16)].map(b => ABC[b & 31]).join('');
const setting = (k, d) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? d;

/* ---------- certificates (read once) ---------- */
let cfg; // undefined = not read yet, null = Wallet is off
function config() {
  if (cfg !== undefined) return cfg;
  cfg = null;
  const id = env('APPLE_PASS_TYPE_ID'), team = env('APPLE_TEAM_ID');
  if (!forge || !id || !team) return cfg;
  try {
    const pass = env('APPLE_PASS_KEY_PASSWORD');
    let cert, key;
    if (env('APPLE_PASS_P12')) { // the .p12 exported from Keychain, base64
      const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(Buffer.from(env('APPLE_PASS_P12'), 'base64').toString('binary')), pass);
      cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0].cert;
      const kb = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
      key = kb[0].key;
    } else if (env('APPLE_PASS_CERT') && env('APPLE_PASS_KEY')) { // PEM, as is or base64
      const pem = v => (v.includes('-----BEGIN') ? v : Buffer.from(v, 'base64').toString('utf8')).replace(/\\n/g, '\n');
      cert = forge.pki.certificateFromPem(pem(env('APPLE_PASS_CERT')));
      const kp = pem(env('APPLE_PASS_KEY'));
      key = pass ? forge.pki.decryptRsaPrivateKey(kp, pass) : forge.pki.privateKeyFromPem(kp);
    } else return cfg;
    if (!key) throw new Error('wrong key password');
    cfg = { id, team, cert, key, certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(key) };
  } catch (e) { console.error('[wallet] certificate error:', e.message); cfg = null; }
  return cfg;
}
const enabled = () => !!config();

// Apple WWDR intermediate (G4): from env, else downloaded once from apple.com
let wwdr = null;
async function wwdrCert() {
  if (wwdr) return wwdr;
  const v = env('APPLE_WWDR_CERT');
  if (v) wwdr = forge.pki.certificateFromPem(v.includes('-----BEGIN') ? v.replace(/\\n/g, '\n') : Buffer.from(v, 'base64').toString('utf8'));
  else {
    const r = await fetch('https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer');
    if (!r.ok) throw new Error('cannot download Apple WWDR certificate');
    wwdr = forge.pki.certificateFromAsn1(forge.asn1.fromDer(Buffer.from(await r.arrayBuffer()).toString('binary')));
  }
  return wwdr;
}

/* ---------- the .pkpass file ---------- */
const IMG_DIR = path.join(__dirname, 'wallet');
const IMAGES = fs.existsSync(IMG_DIR) ? fs.readdirSync(IMG_DIR).filter(f => f.endsWith('.png')).map(f => ({ name: f, data: fs.readFileSync(path.join(IMG_DIR, f)) })) : [];

function zip(files) { // stored (no compression) zip: enough for a pass
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), crc = zlib.crc32(f.data) >>> 0, len = f.data.length;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt32LE(0x00210000, 10);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(len, 18); h.writeUInt32LE(len, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, name, f.data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10); c.writeUInt32LE(0x00210000, 12);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(len, 20); c.writeUInt32LE(len, 24); c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(off, 42);
    central.push(c, name);
    off += 30 + name.length + len;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}

function passJson(row, user, base) {
  const c = config(), coins = user.coins || 0, rate = Number(setting('coin_value', 1)) || 1;
  const fmt = n => new Intl.NumberFormat('ru-RU').format(n);
  return {
    formatVersion: 1, passTypeIdentifier: c.id, teamIdentifier: c.team, serialNumber: row.serial,
    organizationName: "Wendy's", description: 'WendyCoin', logoText: 'WendyCoin',
    foregroundColor: 'rgb(255, 255, 255)', backgroundColor: 'rgb(214, 24, 52)', labelColor: 'rgb(255, 214, 140)',
    ...(base.startsWith('https://') ? { webServiceURL: base + '/wallet', authenticationToken: row.auth_token } : {}),
    storeCard: {
      headerFields: [{ key: 'h', label: 'БАЛАНС', value: coins, numberStyle: 'PKNumberStyleDecimal', changeMessage: 'Баланс WendyCoin: %@' }],
      primaryFields: [{ key: 'balance', label: 'WendyCoin', value: coins, numberStyle: 'PKNumberStyleDecimal' }],
      secondaryFields: [{ key: 'name', label: 'КЛИЕНТ', value: user.name || user.phone || '' }],
      auxiliaryFields: [{ key: 'rate', label: '1 WENDYCOIN', value: `${fmt(rate)} so'm` }],
      backFields: [
        { key: 'how', label: 'Как оплатить', value: 'Покажите QR-код кассиру или поднесите к сканеру киоска самообслуживания в любом ресторане Wendy\'s.' },
        { key: 'earn', label: 'Как копить', value: `За каждый заказ в приложении возвращаем ${setting('coin_percent', 10)}% суммы в WendyCoin.` },
        { key: 'safe', label: 'Безопасность', value: 'Если кто-то сфотографировал ваш QR-код, перевыпустите карту в приложении: Профиль → История WendyCoin.' },
      ],
    },
    barcodes: [{ format: 'PKBarcodeFormatQR', message: row.code, messageEncoding: 'iso-8859-1', altText: row.code.replace(/^(..)(....)(....)(....)(....)$/, '$1 $2 $3 $4 $5') }],
    barcode: { format: 'PKBarcodeFormatQR', message: row.code, messageEncoding: 'iso-8859-1' },
  };
}

async function buildPass(row, base) {
  const c = config(); if (!c) throw new Error('Apple Wallet is not configured');
  const user = db.prepare('SELECT name,phone,coins FROM users WHERE id=?').get(row.user_id) || {};
  const files = [{ name: 'pass.json', data: Buffer.from(JSON.stringify(passJson(row, user, base))) }, ...IMAGES];
  const manifest = {}; for (const f of files) manifest[f.name] = crypto.createHash('sha1').update(f.data).digest('hex');
  const mStr = JSON.stringify(manifest);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(mStr, 'utf8');
  p7.addCertificate(c.cert); p7.addCertificate(await wwdrCert());
  p7.addSigner({ key: c.key, certificate: c.cert, digestAlgorithm: forge.pki.oids.sha256, authenticatedAttributes: [
    { type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() }] });
  p7.sign({ detached: true });
  const sig = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
  return zip([...files, { name: 'manifest.json', data: Buffer.from(mStr) }, { name: 'signature', data: sig }]);
}

/* ---------- one card per customer ---------- */
function passFor(userId) {
  let row = db.prepare('SELECT * FROM wallet_passes WHERE user_id=?').get(userId);
  if (!row) {
    const code = newCode();
    db.prepare('INSERT INTO wallet_passes (serial,user_id,auth_token,code,code_hash,updated_at) VALUES (?,?,?,?,?,?)')
      .run(crypto.randomUUID(), userId, crypto.randomBytes(24).toString('hex'), code, sha(code), Date.now());
    row = db.prepare('SELECT * FROM wallet_passes WHERE user_id=?').get(userId);
  }
  return row;
}
// customer by the code printed on the card (the cash desk scans it); null = unknown code
const userByCode = code => db.prepare('SELECT user_id FROM wallet_passes WHERE code_hash=?').get(sha(code))?.user_id ?? null;

/* ---------- tell the phones to fetch the new card (balance changed, code reissued) ---------- */
let apns = null;
function touch(userId) {
  const row = db.prepare('SELECT serial FROM wallet_passes WHERE user_id=?').get(userId); if (!row) return;
  db.prepare('UPDATE wallet_passes SET updated_at=? WHERE serial=?').run(Date.now(), row.serial);
  const c = config(); if (!c) return;
  const tokens = db.prepare('SELECT DISTINCT push_token FROM wallet_regs WHERE serial=?').all(row.serial).map(r => r.push_token);
  if (!tokens.length) return;
  try {
    if (!apns || apns.closed || apns.destroyed) {
      apns = http2.connect(env('APNS_HOST') || 'https://api.push.apple.com', { cert: c.certPem, key: c.keyPem });
      apns.on('error', e => { console.error('[wallet] push:', e.message); apns = null; });
      apns.unref();
    }
    for (const t of tokens) {
      const req = apns.request({ ':method': 'POST', ':path': '/3/device/' + t, 'apns-topic': c.id, 'content-type': 'application/json' });
      req.on('response', h => { if (h[':status'] === 410) db.prepare('DELETE FROM wallet_regs WHERE push_token=?').run(t); });
      req.on('error', () => { });
      req.end('{}');
    }
  } catch (e) { console.error('[wallet] push:', e.message); }
}

/* ---------- routes ---------- */
function mount(app, { auth, fail }) {
  const base = req => (env('PUBLIC_URL') || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const links = new Map(); // one-time download links: Safari opens them without the app's login token

  app.get('/api/wallet', auth, (req, res) => {
    const row = db.prepare('SELECT serial FROM wallet_passes WHERE user_id=?').get(req.user.id);
    res.json({ enabled: enabled(), added: !!(row && db.prepare('SELECT 1 FROM wallet_regs WHERE serial=?').get(row.serial)) });
  });
  app.post('/api/wallet/link', auth, (req, res) => {
    if (!enabled()) return fail(res, 503, 'Apple Wallet пока не подключён');
    passFor(req.user.id);
    const t = crypto.randomBytes(18).toString('hex'), now = Date.now();
    for (const [k, v] of links) if (v.exp < now) links.delete(k);
    links.set(t, { uid: req.user.id, exp: now + 5 * 60e3 });
    res.json({ url: `${base(req)}/wallet/add/${t}` });
  });
  app.post('/api/wallet/reissue', auth, (req, res) => {
    const row = passFor(req.user.id), code = newCode();
    db.prepare('UPDATE wallet_passes SET code=?, code_hash=? WHERE serial=?').run(code, sha(code), row.serial);
    touch(req.user.id); res.json({ ok: true });
  });
  app.get('/wallet/add/:t', async (req, res) => {
    const l = links.get(req.params.t);
    if (!l || l.exp < Date.now()) return res.status(410).type('text').send('Ссылка устарела. Откройте приложение Wendy\'s и нажмите «Добавить в Apple Wallet» ещё раз.');
    links.delete(req.params.t);
    try { sendPass(res, await buildPass(passFor(l.uid), base(req))); } catch (e) { console.error('[wallet]', e.message); res.status(500).type('text').send('Не удалось создать карту'); }
  });

  // Apple's pass web service (https://developer.apple.com/documentation/walletpasses)
  const passAuth = (req, res) => {
    const c = config(); if (!c || req.params.pt !== c.id) { res.sendStatus(404); return null; }
    const row = db.prepare('SELECT * FROM wallet_passes WHERE serial=?').get(req.params.serial);
    const tok = String(req.headers.authorization || '').replace(/^ApplePass\s+/i, '');
    if (!row || !tok || tok.length !== row.auth_token.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(row.auth_token))) { res.sendStatus(401); return null; }
    return row;
  };
  app.post('/wallet/v1/devices/:dev/registrations/:pt/:serial', (req, res) => {
    const row = passAuth(req, res); if (!row) return;
    const push = String(req.body?.pushToken || '').slice(0, 200), dev = String(req.params.dev).slice(0, 200);
    if (!push) return res.sendStatus(400);
    const had = db.prepare('SELECT 1 FROM wallet_regs WHERE device_id=? AND serial=?').get(dev, row.serial);
    db.prepare('INSERT INTO wallet_regs (device_id,serial,push_token) VALUES (?,?,?) ON CONFLICT(device_id,serial) DO UPDATE SET push_token=excluded.push_token').run(dev, row.serial, push);
    res.sendStatus(had ? 200 : 201);
  });
  app.delete('/wallet/v1/devices/:dev/registrations/:pt/:serial', (req, res) => {
    const row = passAuth(req, res); if (!row) return;
    db.prepare('DELETE FROM wallet_regs WHERE device_id=? AND serial=?').run(req.params.dev, row.serial); res.sendStatus(200);
  });
  app.get('/wallet/v1/devices/:dev/registrations/:pt', (req, res) => {
    const c = config(); if (!c || req.params.pt !== c.id) return res.sendStatus(404);
    const since = Number(req.query.passesUpdatedSince) || 0;
    const rows = db.prepare('SELECT p.serial, p.updated_at FROM wallet_regs r JOIN wallet_passes p ON p.serial=r.serial WHERE r.device_id=? AND p.updated_at>?').all(req.params.dev, since);
    if (!rows.length) return res.sendStatus(204);
    res.json({ serialNumbers: rows.map(r => r.serial), lastUpdated: String(Math.max(...rows.map(r => r.updated_at))) });
  });
  app.get('/wallet/v1/passes/:pt/:serial', async (req, res) => {
    const row = passAuth(req, res); if (!row) return;
    const ims = Date.parse(req.headers['if-modified-since'] || '');
    if (ims && Math.floor(row.updated_at / 1000) * 1000 <= ims) return res.sendStatus(304);
    try { res.setHeader('Last-Modified', new Date(row.updated_at).toUTCString()); sendPass(res, await buildPass(row, base(req))); } catch (e) { console.error('[wallet]', e.message); res.sendStatus(500); }
  });
  app.post('/wallet/v1/log', (req, res) => { console.log('[wallet] device log:', JSON.stringify(req.body?.logs || []).slice(0, 500)); res.sendStatus(200); });
}
function sendPass(res, buf) {
  res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
  res.setHeader('Content-Disposition', 'attachment; filename="WendyCoin.pkpass"');
  res.setHeader('Cache-Control', 'no-store');
  res.end(buf);
}

module.exports = { mount, enabled, touch, userByCode, passFor, buildPass, zip };
