/* WendyCoin shop: the whole menu priced in coins (sauces and cold drinks first). Opened from the coin next to the menu search. */
const coinQty = id => St.cart.find(c => c.id === id && c.coin)?.qty || 0;
const fmtN = n => new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/\s/g, NB);

function shopGroups() {
  const cats = St.menu.categories, first = ['Соусы', 'Холодные напитки'];
  const ordered = [...first.map(n => cats.find(c => c.name === n)).filter(Boolean), ...cats.filter(c => !first.includes(c.name))];
  return ordered.map(c => [c, St.menu.products.filter(p => p.category_id === c.id && p.coin_cost > 0)]).filter(g => g[1].length);
}
function shopPill(p) {
  const n = coinQty(p.id);
  if (n) return `<div class="stepper"><button onclick="A.decCoin(${p.id})">${I.minus()}</button><b>${n}</b><button onclick="A.addCoin(${p.id})">${I.plus(22)}</button></div>`;
  return `<button class="price-pill coinpill" onclick="A.addCoin(${p.id})">${I.coin(18)}<span>${fmtN(p.coin_cost)}</span></button>`;
}
function renderCoinShop() {
  const spent = coinsInCart(), left = (St.user?.coins || 0) - spent, pct = St.menu.settings.coin_percent || 10;
  return `<div class="sh-head" style="padding:max(14px,env(safe-area-inset-top)) 16px 0"><button onclick="Sh.close('coinshop')">${I.x()}</button><span></span></div>
  <div class="body" style="padding:6px 12px ${spent ? 110 : 24}px">
    <div class="cs-bal"><div class="cs-pill"><span>${fmtN(left)}</span><img src="/img/wcoin_logo.png" alt="WendyCoin"></div><div class="cs-cap">начисляем ${pct}% от каждого заказа</div></div>
    ${shopGroups().map(([c, list]) => `<div class="sec-title" style="margin:22px 6px 12px;font-size:26px">${esc(loc(c, 'name'))}</div>
      <div class="cs-grid">${list.map(p => `<div class="cs-card"><div class="cs-im" ${imgOf(p)}>${p.image ? '' : ph(p)}</div><h4>${esc(loc(p, 'name'))}</h4>${shopPill(p)}</div>`).join('')}</div>`).join('') || '<div class="empty">Пока нет товаров для обмена</div>'}
  </div>
  ${spent ? `<div class="foot"><button class="btn" onclick="Sh.close('coinshop');A.cart()">В корзину<small>−${fmtN(spent)} WendyCoin</small></button></div>` : ''}`;
}
A.coinShop = () => Sh.open('coinshop', renderCoinShop, 'full');
