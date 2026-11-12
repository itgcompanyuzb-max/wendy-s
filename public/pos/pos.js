/* Built-in POS terminal: same API a real cash register uses (X-POS-Key). */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
let key = sessionStorage.getItem('poskey') || '', timer = null, seen = null;

async function call(path, method = 'GET', body) {
  const r = await fetch('/api/pos/' + path, { method, headers: { 'X-POS-Key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
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
  $('#root').innerHTML = `<div class="pos"><div class="top"><h1>Касса · <span id="bn"></span></h1><div class="tools"><button class="btn primary" data-act="coins"><img src="/img/coin.png" alt="" style="width:22px;height:22px;vertical-align:-5px"> Списать WendyCoin</button><button class="btn" data-act="out">Выйти</button></div></div><div class="board3" id="cols"></div></div>`;
  load(); timer = setInterval(load, 4000);
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'out') { sessionStorage.removeItem('poskey'); key = ''; login(); return; }
  if (b.dataset.act === 'coins') { coinDialog(); return; }
  if (b.dataset.act === 'cq-close') { closeCoin(); return; }
  if (b.dataset.act === 'cq-cam') { camScan(); return; }
  try { await call(`orders/${b.dataset.id}/${b.dataset.act}`, 'POST'); load(); } catch (er) { toast(er.message); }
});
/* ---------- WendyCoin: scan the customer's QR (USB/2D scanner types it like a keyboard, or the camera) ---------- */
let cq = null, camStream = null;
const NUM = n => new Intl.NumberFormat('ru-RU').format(n || 0);
function closeCoin() { if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; } document.querySelector('.overlay.cq')?.remove(); cq = null; }
function coinDialog(code) {
  closeCoin();
  const o = document.createElement('div'); o.className = 'overlay cq';
  o.innerHTML = `<div class="glass modal" style="max-width:460px"><h2>Списать WendyCoin</h2><p class="muted" style="margin:4px 0 0">Отсканируйте QR-код из приложения клиента сканером или камерой.</p>
    <form id="cqf"><label class="field"><span>Код клиента</span><input name="code" id="cqcode" autocomplete="off" placeholder="WC XXXX XXXX XX" style="font-family:ui-monospace,monospace;letter-spacing:1px;text-transform:uppercase"></label></form>
    <video id="cqv" playsinline muted style="display:none;width:100%;border-radius:18px;margin-top:12px;background:#000"></video>
    <div id="cqbody"></div><div class="err" id="cqerr"></div>
    <div class="foot"><button class="btn" data-act="cq-cam" id="cqcam">Камера</button><button class="btn" data-act="cq-close">Закрыть</button></div></div>`;
  document.body.appendChild(o);
  o.addEventListener('click', e => { if (e.target === o) closeCoin(); });
  const inp = $('#cqcode'); inp.focus();
  if (!('BarcodeDetector' in window)) $('#cqcam').style.display = 'none';
  $('#cqf').addEventListener('submit', e => { e.preventDefault(); checkCode(inp.value); });
  if (code) { inp.value = code; checkCode(code); }
}
async function checkCode(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); if (!code) return;
  $('#cqerr').textContent = ''; $('#cqbody').innerHTML = '<p class="muted">Проверяем…</p>';
  try {
    const r = await call('coins/check', 'POST', { code });
    cq = { code, ...r };
    $('#cqbody').innerHTML = `<div class="glass" style="padding:16px;border-radius:18px;margin-top:14px"><div class="row" style="border:0;padding:0"><span><b>${esc(r.customer.name || 'Клиент')}</b><div class="faint">${esc(r.customer.phone)}${r.source === 'wallet' ? ' · Apple Wallet' : ''}</div></span><span style="text-align:right"><small class="faint">Баланс</small><div style="font-size:24px;font-weight:800">${NUM(r.balance)} <img src="/img/coin.png" alt="" style="width:22px;height:22px;vertical-align:-3px"></div></span></div></div>
      <form id="cqr"><label class="field"><span>Сколько списать (WendyCoin)</span><input name="amount" id="cqam" type="number" min="1" max="${r.balance}" step="1" required inputmode="numeric"></label>
      <div class="faint" id="cqsum" style="margin:6px 0 0 14px">1 WendyCoin = ${NUM(r.coin_value)} so'm</div>
      <label class="field"><span>Комментарий (необязательно)</span><input name="note" maxlength="80" placeholder="например, чек 1042"></label>
      <button class="btn primary" style="width:100%;margin-top:14px">Списать</button></form>`;
    const am = $('#cqam'); am.focus();
    am.addEventListener('input', () => { $('#cqsum').textContent = `= ${NUM((Number(am.value) || 0) * r.coin_value)} so'm`; });
    $('#cqr').addEventListener('submit', redeem);
  } catch (er) { $('#cqbody').innerHTML = ''; $('#cqerr').textContent = er.message; $('#cqcode').select(); }
}
async function redeem(e) {
  e.preventDefault(); if (!cq) return;
  const f = new FormData(e.target), amount = Number(f.get('amount'));
  try {
    const r = await call('coins/redeem', 'POST', { code: cq.code, amount, note: f.get('note') });
    beep();
    $('#cqbody').innerHTML = `<div style="text-align:center;padding:18px 0 4px"><div style="font-size:44px">✅</div><h2 style="margin:6px 0">Списано ${NUM(r.spent)} WendyCoin</h2><p class="muted">= ${NUM(r.sum)} so'm · остаток у клиента ${NUM(r.balance)}</p></div>`;
    $('#cqcode').value = ''; cq = null; setTimeout(() => $('#cqcode')?.focus(), 50);
  } catch (er) { $('#cqerr').textContent = er.message; }
}
async function camScan() {
  try {
    const det = new BarcodeDetector({ formats: ['qr_code'] }), v = $('#cqv');
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    v.srcObject = camStream; v.style.display = 'block'; await v.play();
    const loop = async () => {
      if (!camStream) return;
      const [c] = await det.detect(v).catch(() => []);
      if (c && /^(WC[0-9A-Z]{10}|WP[0-9A-Z]{16})$/.test(c.rawValue)) { camStream.getTracks().forEach(t => t.stop()); camStream = null; v.style.display = 'none'; $('#cqcode').value = c.rawValue; checkCode(c.rawValue); return; }
      requestAnimationFrame(loop);
    };
    loop();
  } catch { toast('Камера недоступна'); }
}
// a scanner plugged into the cash desk "types" the code and Enter: catch it even when the dialog is closed
let kb = '', kbT = 0;
document.addEventListener('keydown', e => {
  if (!key || e.target.closest?.('input, textarea')) return;
  const now = Date.now(); if (now - kbT > 80) kb = ''; kbT = now;
  if (e.key === 'Enter') { if (/^(WC[0-9A-Z]{10}|WP[0-9A-Z]{16})$/i.test(kb)) coinDialog(kb.toUpperCase()); kb = ''; return; }
  if (e.key.length === 1) kb += e.key;
});

if (key) { call('orders').then(start).catch(() => login()); } else login();
