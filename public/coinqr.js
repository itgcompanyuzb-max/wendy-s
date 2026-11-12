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
    <div class="cq-more">${walletBtn()}<button class="cq-hist" onclick="A.coinLog()">История операций</button></div>
  </div>`;
}

async function cqNew() {
  try {
    const r = await api('/coins/qr', { method: 'POST' });
    CQ.code = r.code; CQ.total = r.expires_in; CQ.exp = Date.now() + r.expires_in * 1000; CQ.err = '';
    if (St.user) St.user.coins = r.coins;
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
        clearInterval(CQ.poll); haptic('success'); Sh.refresh('coinqr'); Sh.refresh('profile'); Sh.refresh('coinshop');
      }
    } catch { /* offline for a moment: try again on the next tick */ }
  }, 2500);
};

/* ---------- WendyCoin history ---------- */
const CL = { items: null, err: '' };
const clDate = s => { const d = new Date(String(s).replace(' ', 'T') + 'Z'); return isNaN(d) ? s : d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); };
const clIcon = it => it.delta > 0 ? '＋' : /ресторан/i.test(it.reason) ? '🏪' : /заказ/i.test(it.reason) ? '🛍' : '−';
function renderCoinLog() {
  const list = CL.items;
  return `<div class="grab"></div><div class="body cl">
    <h2 class="cq-t" style="text-align:left;margin:4px 4px 14px">История WendyCoin</h2>
    <div class="cl-bal"><div><small>Баланс</small><b>${cqFmt(St.user?.coins)}</b></div><img src="/img/coin.png" alt=""></div>
    <div class="cl-acts"><button onclick="A.coinQR()">${I.qr(20)} QR для оплаты</button>${walletBtn()}</div>
    ${list === null ? `<div class="gray-t" style="padding:24px;text-align:center">${CL.err ? esc(CL.err) : 'Загружаем…'}</div>`
      : list.length ? list.map(it => `<div class="cl-it"><span class="cl-ic ${it.delta > 0 ? 'in' : 'out'}">${clIcon(it)}</span><div class="cl-tx"><b>${esc(it.reason || (it.delta > 0 ? 'Начисление' : 'Списание'))}</b><small>${esc(clDate(it.created_at))}</small></div><span class="cl-d ${it.delta > 0 ? 'in' : 'out'}">${it.delta > 0 ? '+' : '−'}${cqFmt(Math.abs(it.delta))}</span></div>`).join('')
      : '<div class="gray-t" style="padding:28px 10px;text-align:center">Пока нет операций. За каждый заказ мы начисляем WendyCoin.</div>'}
    ${St.menu.settings.wallet && isApple() ? `<button class="cl-reissue" onclick="A.walletReissue()">Перевыпустить карту Apple Wallet</button>` : ''}
  </div>`;
}
A.coinLog = () => {
  if (!St.token) return toast('Войдите, чтобы видеть историю');
  CL.items = null; CL.err = '';
  Sh.open('coinlog', renderCoinLog, 'full');
  api('/coins/history').then(r => { CL.items = r.items; if (St.user) St.user.coins = r.coins; }).catch(e => { CL.err = e.message; }).finally(() => Sh.refresh('coinlog'));
};

/* ---------- Apple Wallet card ---------- */
const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
function walletBtn() {
  if (!St.menu?.settings?.wallet || !isApple()) return '';
  return `<button class="wallet-btn" onclick="A.addWallet()"><svg width="26" height="20" viewBox="0 0 26 20"><rect x="1" y="1" width="24" height="18" rx="4" fill="#fff"/><rect x="3" y="4" width="20" height="4" rx="1.5" fill="#34aadc"/><rect x="3" y="7" width="20" height="4" rx="1.5" fill="#ffcc00"/><rect x="3" y="10" width="20" height="4" rx="1.5" fill="#ff3b30"/><path d="M1 12h7c1 0 1.5 2.5 5 2.5S17 12 18 12h7v3a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4z" fill="#fff"/></svg><span>Добавить в<br><b>Apple Wallet</b></span></button>`;
}
A.addWallet = async () => {
  haptic('light');
  try {
    const r = await api('/wallet/link', { method: 'POST' });
    // inside the iPhone app the pass opens in Safari, which shows the "Add to Wallet" sheet
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ open: r.url }));
    else location.href = r.url;
  } catch (e) { toast(e.message); }
};
A.walletReissue = async () => {
  if (!confirm('Старый QR-код на карте перестанет работать, карта в Wallet обновится сама. Продолжить?')) return;
  try { await api('/wallet/reissue', { method: 'POST' }); haptic('success'); toast('Карта перевыпущена'); } catch (e) { toast(e.message); }
};
