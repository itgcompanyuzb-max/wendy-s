// Emergency login code for the admin phone. Run on the server machine: npm run admin-code
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const db = require('./db');
const phone = (process.argv[2] || process.env.ADMIN_PHONE || '+998705044515').replace(/[\s()-]/g, '');
const asCourier = process.argv[3] === 'courier' ? 1 : 0;
if (!db.prepare("SELECT id FROM admin_users WHERE phone=? AND active=1 AND (role='courier')=?").get(phone, asCourier)) { console.error('Нет активного админа с номером', phone); process.exit(1); }
const code = String(crypto.randomInt(0, 10000)).padStart(4, '0'); const now = Math.floor(Date.now() / 1000);
db.prepare('INSERT INTO admin_codes (phone,code,expires_at,created_at) VALUES (?,?,?,?)').run(phone, code, now + 300, now - 3700);
console.log(`Код для входа ${phone}: ${code} (действует 5 минут)`);
