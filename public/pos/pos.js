/* Built-in POS terminal: same API a real cash register uses (X-POS-Key). */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
let key = sessionStorage.getItem('poskey') || '', timer = null, seen = null;

async function call(path, method = 'GET') {
  const r = await fetch('/api/pos/' + path, { method, headers: { 'X-POS-Key': key } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Ошибка');
  return j;
}
function beep() { try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = .08; o.start(); setTimeout(() => { o.stop(); c.close(); }, 250); } catch { /* ignore */ } }
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); }

function login(msg) {
  clearInterval(timer);
  $('#root').innerHTML = `<div class="login"><form class="glass box" id="kf"><div class="brand" style="padding:0"><img class="logo" src="/img/brand.png" alt=""><span>POS</span></div><h1>Касса</h1><p class="muted" style="margin:0">Введите ключ филиала (его выдаёт администратор в разделе «POS»)</p>
    <label class="field"><span>Ключ POS</span><input type="password" name="k" autocomplete="off" required></label><div class="err" id="err">${esc(msg || '')}</div><button class="btn primary" style="width:100%;margin-top:6px">Войти</button></form></div>`;
  $('#kf').addEventListener('submit', async e => {
    e.preventDefault(); key = new FormData(e.target).get('k').trim();
    try { await call('orders'); sessionStorage.setItem('poskey', key); start(); } catch (er) { $('#err').textContent = er.message; }
  });
}
const TYPE = { delivery: 'Доставка', pickup: 'Самовывоз' };
function card(o) {
  const act = o.status === 'new' ? ['accept', 'Принять', 'primary'] : o.status === 'cooking' ? ['ready', 'Готово', 'primary'] : (o.type === 'pickup' ? ['complete', 'Выдан', 'primary'] : null);
  return `<div class="oc"><div class="h"><b style="font-size:20px">№${o.number}</b><span class="faint">${esc(String(o.created_at).slice(11, 16))}</span></div>
    <div><span class="pill ${o.type === 'delivery' ? 'info' : 'warn'}">${TYPE[o.type]}</span> <span class="pill">${esc(o.payment)}</span>${o.pickup_time && o.pickup_time !== 'asap' ? ` <span class="pill">к ${esc(o.pickup_time)}</span>` : ''}</div>
    <table class="lines">${o.items.map(i => `<tr><td>${esc(i.name)}${i.paid_with_coins ? ' <span class="pill warn">WendyCoin</span>' : ''}</td><td>× ${i.qty}</td><td>${i.paid_with_coins ? '—' : money(i.sum)}</td></tr>`).join('')}</table>
    <div class="row" style="border:0;padding:6px 0"><b>Итого</b><b>${money(o.total)} so'm</b></div>
    <div class="muted" style="font-size:13px">${esc(o.customer?.name || '')} ${esc(o.customer?.phone || '')}${o.comment ? '<br>' + esc(o.comment) : ''}</div>
    ${act ? `<div style="margin-top:12px"><button class="btn ${act[2]}" style="width:100%" data-act="${act[0]}" data-id="${o.number}">${act[1]}</button></div>` : '<div class="muted" style="margin-top:10px">Ждёт курьера</div>'}</div>`;
}
async function load() {
  try {
    const r = await call('orders');
    const ids = new Set(r.orders.map(o => o.number));
    if (seen && r.orders.some(o => o.status === 'new' && !seen.has(o.number))) { beep(); toast('Новый заказ!'); }
    seen = ids;
    $('#bn').textContent = r.branch;
    const col = (st, t) => `<section class="glass col"><h3>${t}<span class="pill">${r.orders.filter(o => o.status === st).length}</span></h3>${r.orders.filter(o => o.status === st).map(card).join('') || '<div class="faint" style="text-align:center;padding:24px">Пусто</div>'}</section>`;
    $('#cols').innerHTML = col('new', 'Новые') + col('cooking', 'Готовятся') + col('ready', 'Готовы');
  } catch (e) { if (/ключ/i.test(e.message)) { sessionStorage.removeItem('poskey'); login(e.message); } }
}
function start() {
  $('#root').innerHTML = `<div class="pos"><div class="top"><h1>Касса · <span id="bn"></span></h1><div class="tools"><button class="btn" data-act="out">Выйти</button></div></div><div class="board3" id="cols"></div></div>`;
  load(); timer = setInterval(load, 4000);
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'out') { sessionStorage.removeItem('poskey'); key = ''; login(); return; }
  try { await call(`orders/${b.dataset.id}/${b.dataset.act}`, 'POST'); load(); } catch (er) { toast(er.message); }
});
if (key) { call('orders').then(start).catch(() => login()); } else login();
