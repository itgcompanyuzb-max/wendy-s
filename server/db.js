const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dir = require('./paths').dataDir;
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, 'app.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT '',
  notify INTEGER DEFAULT 1,
  coins INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  used INTEGER DEFAULT 0,
  channel TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER,
  role TEXT DEFAULT 'user',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  label TEXT DEFAULT 'other',
  address TEXT NOT NULL,
  lat REAL, lng REAL,
  entrance TEXT DEFAULT '', intercom TEXT DEFAULT '', floor TEXT DEFAULT '', apartment TEXT DEFAULT '',
  comment TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  brand TEXT, last4 TEXT, exp TEXT, holder TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT DEFAULT '',
  city TEXT DEFAULT 'Ташкент',
  address TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL,
  phone TEXT DEFAULT '',
  open_time TEXT DEFAULT '10:00',
  close_time TEXT DEFAULT '23:30',
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, icon TEXT DEFAULT 'burger', sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER, name TEXT NOT NULL, description TEXT DEFAULT '',
  price INTEGER NOT NULL, old_price INTEGER DEFAULT 0, image TEXT DEFAULT '',
  badge TEXT DEFAULT '', big INTEGER DEFAULT 0, recommended INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT DEFAULT '', image TEXT DEFAULT '', color TEXT DEFAULT '#ff6900',
  text TEXT DEFAULT '', sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS promos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL, percent INTEGER DEFAULT 0, fixed INTEGER DEFAULT 0,
  min_total INTEGER DEFAULT 0, title TEXT DEFAULT '', active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'new',
  branch_id INTEGER,
  address_json TEXT,
  items_json TEXT NOT NULL,
  subtotal INTEGER, discount INTEGER DEFAULT 0, delivery_fee INTEGER DEFAULT 0, total INTEGER,
  promo TEXT DEFAULT '',
  payment TEXT, pay_status TEXT DEFAULT 'pending',
  pickup_time TEXT DEFAULT '', pickup_method TEXT DEFAULT '',
  comment TEXT DEFAULT '',
  coins INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sender TEXT NOT NULL,
  text TEXT DEFAULT '',
  image TEXT DEFAULT '',
  read_by_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  branch_id INTEGER,
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  failed INTEGER DEFAULT 0,
  locked_until INTEGER DEFAULT 0,
  last_login TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  ip TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER, email TEXT, action TEXT, entity TEXT, entity_id TEXT, detail TEXT, ip TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS branch_stock (
  branch_id INTEGER NOT NULL, product_id INTEGER NOT NULL, available INTEGER DEFAULT 1,
  PRIMARY KEY (branch_id, product_id)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);

db.exec(`CREATE TABLE IF NOT EXISTS admin_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL, code TEXT NOT NULL,
  attempts INTEGER DEFAULT 0, used INTEGER DEFAULT 0, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);`);
try { db.exec('ALTER TABLE admin_users ADD COLUMN phone TEXT'); } catch { /* column exists */ }
db.exec('DROP INDEX IF EXISTS idx_admin_phone');
// one number can be an admin-side user AND a courier at the same time (and a customer too)
db.exec('DROP INDEX IF EXISTS idx_admin_phone_ctx');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_phone_role ON admin_users(phone, role, COALESCE(branch_id, 0)) WHERE phone IS NOT NULL');
try { db.exec('ALTER TABLE users ADD COLUMN avatar INTEGER DEFAULT 0'); } catch { /* column exists */ }

for (const sql of [
  'ALTER TABLE branches ADD COLUMN delivery_radius REAL DEFAULT 7',
  'ALTER TABLE branches ADD COLUMN pos_key_hash TEXT',
  'ALTER TABLE products ADD COLUMN coin_price INTEGER DEFAULT 0',
  'ALTER TABLE orders ADD COLUMN courier_id INTEGER',
  'ALTER TABLE orders ADD COLUMN accepted_at TEXT',
  'ALTER TABLE orders ADD COLUMN ready_at TEXT',
  'ALTER TABLE orders ADD COLUMN delivered_at TEXT',
  'ALTER TABLE orders ADD COLUMN coins_spent INTEGER DEFAULT 0',
]) { try { db.exec(sql); } catch { /* column exists */ } }
for (const sql of ['ALTER TABLE products ADD COLUMN name_uz TEXT DEFAULT \'\'', 'ALTER TABLE products ADD COLUMN description_uz TEXT DEFAULT \'\'', 'ALTER TABLE categories ADD COLUMN name_uz TEXT DEFAULT \'\'', 'ALTER TABLE banners ADD COLUMN title_uz TEXT DEFAULT \'\'', 'ALTER TABLE promos ADD COLUMN title_uz TEXT DEFAULT \'\'', 'ALTER TABLE promos ADD COLUMN info_uz TEXT DEFAULT \'\'', 'ALTER TABLE branches ADD COLUMN delivery_fee INTEGER DEFAULT -1', 'ALTER TABLE branches ADD COLUMN free_from INTEGER DEFAULT 0', 'ALTER TABLE branches ADD COLUMN min_order INTEGER DEFAULT 0', 'ALTER TABLE promos ADD COLUMN info TEXT DEFAULT \'\'', 'ALTER TABLE promos ADD COLUMN valid_until TEXT DEFAULT \'\'', 'ALTER TABLE products ADD COLUMN external_id TEXT', 'ALTER TABLE categories ADD COLUMN external_id TEXT']) { try { db.exec(sql); } catch { /* exists */ } }
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_prod_ext ON products(external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_ext ON categories(external_id) WHERE external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS product_addons (product_id INTEGER NOT NULL, addon_id INTEGER NOT NULL, sort INTEGER DEFAULT 0, PRIMARY KEY (product_id, addon_id));
`);
db.exec(`
CREATE TABLE IF NOT EXISTS courier_location (courier_id INTEGER PRIMARY KEY, lat REAL, lng REAL, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, order_id INTEGER, kind TEXT, title TEXT, body TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, id);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER UNIQUE NOT NULL, user_id INTEGER, branch_id INTEGER, courier_id INTEGER,
  stars INTEGER NOT NULL, comment TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS coin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, delta INTEGER NOT NULL, reason TEXT, admin_id INTEGER, order_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// A fresh install starts from server/menu.seed.json (the real menu, branches, banners) when that file exists.
function loadSeedFile() {
  const f = path.join(__dirname, 'menu.seed.json');
  if (!fs.existsSync(f)) return false;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const ins = (table, row) => {
    const keys = Object.keys(row);
    return Number(db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => row[k])).lastInsertRowid);
  };
  const cid = {};
  for (const c of d.categories) cid[c.name] = ins('categories', c);
  for (const p of d.products) { const { category, ...rest } = p; ins('products', { ...rest, category_id: cid[category] }); }
  for (const b of d.branches) ins('branches', b);
  for (const b of d.banners) ins('banners', b);
  for (const p of d.promos) ins('promos', p);
  for (const [k, v] of Object.entries(d.settings || {})) db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run(k, String(v));
  return true;
}

function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM categories').get().c > 0) return;
  if (loadSeedFile()) return;
  const cat = db.prepare('INSERT INTO categories (name,icon,sort) VALUES (?,?,?)');
  const cats = [['Комбо', 'combo'], ['Бургеры', 'burger'], ['Закуски', 'fries'], ['Напитки', 'cup'], ['Десерты', 'dessert']];
  const ids = cats.map((c, i) => Number(cat.run(c[0], c[1], i).lastInsertRowid));
  const p = db.prepare('INSERT INTO products (category_id,name,description,price,old_price,badge,big,recommended,sort) VALUES (?,?,?,?,?,?,?,?,?)');
  const items = [
    [0, 'Комбо на двоих', 'Два бургера на выбор, большая картошка и два напитка. Выгоднее, чем по отдельности.', 159000, 225000, 'до -35%', 1, 0],
    [0, 'Комбо Баконатор', 'Баконатор, картошка фри и холодный напиток.', 95000, 109000, 'выгодно', 0, 0],
    [0, 'Комбо Наггетс', '9 наггетсов, соус на выбор, картошка и напиток.', 79000, 92000, 'до -18%', 0, 0],
    [1, 'Дэйвс Сингл', 'Сочная говяжья котлета, свежие овощи и фирменный соус.', 42000, 0, '', 0, 0],
    [1, 'Баконатор', 'Две котлеты, бекон, сыр чеддер, кетчуп и майонез.', 68000, 0, 'хит', 0, 0],
    [1, 'Спайси Чикен', 'Хрустящая острая куриная котлета, салат и майонез.', 38000, 0, '', 0, 0],
    [2, 'Картошка фри', 'Золотистая картошка с морской солью.', 18000, 0, '', 0, 0],
    [2, 'Наггетсы 6 шт', 'Хрустящие куриные наггетсы с соусом.', 28000, 0, '', 0, 1],
    [2, 'Крылья Барбекю', 'Куриные крылья в соусе барбекю, 340 г.', 55000, 0, '', 0, 1],
    [3, 'Морс Клюква', 'Домашний морс, 0,38 л.', 17000, 0, '', 0, 1],
    [3, 'Кола 0,5 л', 'Холодный газированный напиток.', 12000, 0, '', 0, 0],
    [4, 'Фростик ваниль', 'Густой молочный десерт.', 20000, 0, '', 0, 0],
  ];
  items.forEach((it, i) => p.run(ids[it[0]], it[1], it[2], it[3], it[4], it[5], it[6], it[7], i));

  const b = db.prepare('INSERT INTO branches (name,address,lat,lng,phone,open_time,close_time) VALUES (?,?,?,?,?,?,?)');
  [
    ['Беруни', 'улица Беруни, 47', 41.3396, 69.2012, '+998 77 343 49 07', '10:00', '00:00'],
    ['Чиланзар', 'Чиланзар, квартал 9', 41.2755, 69.2034, '+998 77 343 49 08', '10:00', '23:30'],
    ['Юнусабад', 'Юнусабад, 4-й квартал', 41.3641, 69.2858, '+998 77 343 49 09', '10:00', '23:00'],
    ['Мирзо-Улугбек', 'Мирзо-Улугбекский район, Буюк Ипак Йули', 41.3395, 69.3340, '+998 77 343 49 10', '10:00', '23:30'],
    ['Сергели', 'Сергелийский район, Янги Сергели', 41.2250, 69.2230, '+998 77 343 49 11', '10:00', '22:00'],
    ['Центр', 'улица Амира Темура, 15', 41.3111, 69.2797, '+998 77 343 49 12', '09:00', '00:00'],
  ].forEach(r => b.run(...r));

  const bn = db.prepare('INSERT INTO banners (title,color,text,sort) VALUES (?,?,?,?)');
  [['Новые бургеры', '#e2133d', 'Новинка', 0], ['Халяль', '#0f9d58', 'Халяль', 1], ['Комбо недели', '#ff6900', 'Выгодно', 2], ['Напиток в подарок', '#6a3df0', 'Подарок', 3]]
    .forEach(r => bn.run(...r));

  db.prepare('INSERT INTO promos (code,percent,title) VALUES (?,?,?)').run('WELCOME10', 10, 'Скидка 10%');
  const s = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  s.run('delivery_fee', '0'); s.run('coin_percent', '10'); s.run('brand', "Wendy's");
}
seed();

module.exports = db;
