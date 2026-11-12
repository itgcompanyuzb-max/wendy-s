/* WendyCoin pay QR: shown to the cashier or held up to the self-order kiosk scanner.
   The code lives a short time (admin setting), renews itself, and the screen turns into "paid" once the restaurant takes the coins. */
const CQ = { code: '', exp: 0, tick: null, poll: null, done: null, err: '' };
const cqFmt = n => new Intl.NumberFormat('ru-RU').format(n || 0).replace(/\s/g, ' ');
const cqLeft = () => Math.max(0, Math.round((CQ.exp - Date.now()) / 1000));
const cqStop = () => { clearInterval(CQ.tick); clearInterval(CQ.poll); CQ.tick = CQ.poll = null; };

function renderCoinQR() {
  const head = `<div class="grab"></div>`;
  if (CQ.done) {
    return `${head}<div class="body cq"><div class="cq-done">
      <svg class="cq-ok" viewBox="0 0 52 52" width="104" height="104"><circle cx="26" cy="26" r="25" fill="#34c759"/><path d="M15 27l7 7 15-16" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <h2>Оплачено</h2><div class="cq-spent">−${cqFmt(CQ.done.spent)} <img src="/img/coin.png" alt=""></div>
      <p class="gray-t">${CQ.done.branch ? esc(CQ.done.branch) + '<br>' : ''}На балансе: ${cqFmt(CQ.done.coins)} WendyCoin</p>
      <button class="btn" onclick="Sh.close('coinqr')">Готово</button></div></div>`;
  }
  const left = cqLeft(), total = CQ.total || 120;
  return `${head}<div class="body cq">
    <h2 class="cq-t">Оплата WendyCoin</h2>
    <p class="cq-sub">Покажите код кассиру или поднесите к сканеру киоска</p>
    <div class="cq-frame"><div class="cq-card">${CQ.code ? QR.svg(CQ.code, { logo: '/img/coin.png' }) : `<div class="cq-wait">${CQ.err ? esc(CQ.err) : ''}</div>`}</div></div>
    <div class="cq-code">${CQ.code ? CQ.code.replace(/^(..)(....)(....)(..)$/, '$1 $2 $3 $4') : '&nbsp;'}</div>
    <div class="cq-timer"><div class="cq-bar"><i style="width:${CQ.code ? (left / total) * 100 : 0}%"></i></div><span id="cqt">${CQ.code ? `Обновится через ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Создаём код…'}</span></div>
    <div class="cq-bal"><span>На балансе</span><b>${cqFmt(St.user?.coins)} <img src="/img/coin.png" alt=""></b></div>
  </div>`;
}

async function cqNew() {
  try {
    const r = await api('/coins/qr', { method: 'POST' });
    CQ.code = r.code; CQ.total = r.expires_in; CQ.exp = Date.now() + r.expires_in * 1000; CQ.err = '';
    if (St.user) St.user.coins = r.coins;
    renderCoinBar();
  } catch (e) { CQ.code = ''; CQ.err = e.message; }
  Sh.refresh('coinqr');
}

A.coinQR = () => {
  if (!St.token) return toast('Войдите, чтобы платить WendyCoin');
  cqStop(); CQ.code = ''; CQ.done = null; CQ.err = '';
  Sh.open('coinqr', renderCoinQR, '', cqStop);
  haptic('light');
  cqNew();
  CQ.tick = setInterval(() => {
    if (!CQ.code || CQ.done) return;
    const left = cqLeft(), t = document.getElementById('cqt'), bar = document.querySelector('.cq-bar i');
    if (left <= 0) { CQ.code = ''; Sh.refresh('coinqr'); cqNew(); return; }
    if (t) t.textContent = `Обновится через ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (bar) bar.style.width = (left / (CQ.total || 120)) * 100 + '%';
  }, 1000);
  CQ.poll = setInterval(async () => {
    if (!CQ.code || CQ.done) return;
    try {
      const r = await api('/coins/qr/' + CQ.code);
      if (r.state === 'used') {
        CQ.done = r; if (St.user) St.user.coins = r.coins;
        clearInterval(CQ.poll); haptic('success'); Sh.refresh('coinqr'); Sh.refresh('profile'); Sh.refresh('coinshop'); Sh.refresh('coins'); renderCoinBar();
      }
    } catch { /* offline for a moment: try again on the next tick */ }
  }, 2500);
};

/* ---------- WendyCoin screen: balance, QR for the restaurant, history ---------- */
const CL = { items: null, err: '', tab: 'hist' };
const clDate = s => { const d = new Date(String(s).replace(' ', 'T') + 'Z'); return isNaN(d) ? s : d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); };
const clIcon = it => it.delta > 0 ? I.plus(20, '#34c759') : /ресторан/i.test(it.reason) ? I.qr(20, '#ddd') : I.bag(20, '#ddd');
function renderCoins() {
  const list = CL.items, coins = St.user?.coins || 0, pct = St.menu.settings.coin_percent || 10, rate = St.menu.settings.coin_value || 1;
  const hist = list === null ? `<div class="gray-t" style="padding:24px;text-align:center">${CL.err ? esc(CL.err) : 'Загружаем…'}</div>`
    : list.length ? list.map(it => `<div class="cl-it"><span class="cl-ic ${it.delta > 0 ? 'in' : 'out'}">${clIcon(it)}</span><div class="cl-tx"><b>${esc(clDate(it.created_at))}</b><small>${esc(it.reason || (it.delta > 0 ? 'Начисление' : 'Списание'))}</small></div><span class="cl-d ${it.delta > 0 ? 'in' : 'out'}">${it.delta > 0 ? '+' : '−'}${cqFmt(Math.abs(it.delta))}</span></div>`).join('')
      : '<div class="gray-t" style="padding:28px 10px;text-align:center">Пока нет операций. За каждый заказ мы начисляем WendyCoin.</div>';
  const ic = d => `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const steps = [
    ['earn', ic('<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'), `${pct}% с каждого заказа`, 'Возвращаем на баланс в WendyCoin'],
    ['rate', '<img src="/img/coin.png" alt="">', `1 WendyCoin = ${cqFmt(rate)} so'm`, 'По этому курсу коины списываются при оплате'],
    ['qr', I.qr(26), 'Оплата в ресторане', 'Покажите QR-код кассиру или поднесите к сканеру киоска'],
    ['shop', ic('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-1.5-3-5-4-5-1.5S10 8 12 8zM12 8c1.5-3 5-4 5-1.5S14 8 12 8z"/>'), 'Обмен на товары', 'Соусы, напитки и другие позиции — прямо в приложении'],
  ];
  const how = `<div class="cl-how">${steps.map(([k, icon, t, d]) => `<div class="cl-step"><span class="cl-sic ${k}">${icon}</span><div><b>${t}</b><small>${d}</small></div></div>`).join('')}</div>`;
  return `<div class="cl-top">
      <div class="cl-h"><span>WendyCoin</span><button onclick="Sh.close('coins')" aria-label="close">${I.down(26)}</button></div>
      <div class="cl-big"><img src="/img/coin.png" alt=""><b>${cqFmt(coins)}</b></div>
      <div class="cl-qr"><span>QR-код для оплаты в ресторане</span><button onclick="A.coinQR()">${I.qr(22, '#111')} Открыть</button></div>
      ${coins ? `<button class="cl-main" onclick="Sh.close('coins');A.coinShop()">Обменять на товары</button>` : ''}
    </div>
    <div class="body cl">
      <div class="seg cl-seg" style="position:static;margin:4px 0 14px;padding:5px"><button class="${CL.tab === 'hist' ? 'on' : ''}" onclick="CL.tab='hist';Sh.refresh('coins')">История</button><button class="${CL.tab === 'how' ? 'on' : ''}" onclick="CL.tab='how';Sh.refresh('coins')">Как это работает</button></div>
      ${CL.tab === 'hist' ? hist : how}
    </div>`;
}
A.coins = () => {
  if (!St.token) return A.profile();
  CL.items = null; CL.err = ''; CL.tab = 'hist';
  haptic('light');
  Sh.open('coins', renderCoins, 'full');
  api('/coins/history').then(r => { CL.items = r.items; if (St.user) St.user.coins = r.coins; renderCoinBar(); }).catch(e => { CL.err = e.message; }).finally(() => Sh.refresh('coins'));
};
A.coinLog = A.coins;

/* ---------- the bar on the menu: balance + QR ---------- */
function coinBarHTML() {
  if (!St.token) return `<button class="coinbar" onclick="A.profile()"><span class="cb-l"><img src="/img/coin.png" alt=""><span class="cb-tx">Копите WendyCoin</span></span><span class="cb-qr">Войти</span></button>`;
  return `<div class="coinbar"><button class="cb-l" onclick="A.coins()"><img src="/img/coin.png" alt=""><b>${cqFmt(St.user?.coins)}</b></button><button class="cb-qr" onclick="A.coinQR()">${I.qr(24)} QR-код</button></div>`;
}
function renderCoinBar() { const el = document.getElementById('coinbar'); if (el) el.innerHTML = coinBarHTML(); }
