// Writes the current menu, branches, banners and promos to server/menu.seed.json (no customers, orders or keys).
const fs = require('fs'), path = require('path');
const db = require('./db');
const cats = db.prepare('SELECT * FROM categories ORDER BY sort,id').all();
const name = Object.fromEntries(cats.map(c => [c.id, c.name]));
const strip = (o, drop) => { const r = { ...o }; for (const k of drop) delete r[k]; return r; };
const out = {
  categories: cats.map(c => strip(c, ['id', 'external_id'])),
  products: db.prepare('SELECT * FROM products ORDER BY sort,id').all().map(p => ({ ...strip(p, ['id', 'external_id', 'category_id']), category: name[p.category_id] })),
  branches: db.prepare('SELECT * FROM branches ORDER BY id').all().map(b => strip(b, ['id', 'pos_key_hash'])),
  banners: db.prepare('SELECT * FROM banners ORDER BY sort,id').all().map(b => strip(b, ['id'])),
  promos: db.prepare('SELECT * FROM promos ORDER BY id').all().map(p => strip(p, ['id'])),
  settings: Object.fromEntries(db.prepare("SELECT key,value FROM settings WHERE key NOT LIKE '%_hash'").all().map(r => [r.key, r.value])),
};
fs.writeFileSync(path.join(__dirname, 'menu.seed.json'), JSON.stringify(out, null, 1));
console.log(`exported ${out.categories.length} categories, ${out.products.length} products, ${out.branches.length} branches`);
