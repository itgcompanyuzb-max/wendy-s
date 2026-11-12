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
