/* Bridge for the native iPhone/Android app (mobile/). Only active inside it (window.__WENDYS_NATIVE__).
   The native app draws the menu, product, cart and WendyCoin screens itself; this page stays loaded behind it
   and handles login, checkout, address/map, profile, banners and the coin shop.
   - every ~400 ms the page tells the app its state (login token, language, mode, address title, cart, active order, idle)
   - the app calls WN.run('checkout', cart) etc. to open a web screen with the app's cart */
(function () {
  if (!window.__WENDYS_NATIVE__ || !window.ReactNativeWebView) return;
  document.documentElement.classList.add('in-native');
  const post = m => { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch { /* ignore */ } };
  let last = '';
  function state() {
    if (typeof St === 'undefined' || !St.menu) return null;
    const sheets = Object.keys(Sh.stack);
    const home = !!document.getElementById('hb');
    const act = (St.orders || []).find(o => ['new', 'cooking', 'ready', 'delivering'].includes(o.status));
    return {
      token: St.token || null, lang: window.LANG || 'ru', mode: St.mode, branchId: St.branchId, addrId: St.addrId,
      title: headerTitle(), cart: St.cart, coins: St.user ? St.user.coins || 0 : 0, name: St.user ? St.user.name || '' : '',
      avatar: St.user && St.user.avatar > 0 ? St.user.avatar : 9, activeOrder: act ? act.id : null,
      idle: !!(St.token && home && !sheets.length),
    };
  }
  setInterval(() => {
    const s = state(); if (!s) return;
    const j = JSON.stringify(s);
    if (j !== last) { last = j; post({ state: s }); }
  }, 400);
  window.WN = {
    // the app's cart becomes the page's cart, then the screen opens
    run(cmd, cart, arg) {
      if (typeof St === 'undefined' || !St.menu) { setTimeout(() => WN.run(cmd, cart, arg), 300); return; }
      if (Array.isArray(cart)) { St.cart = cart.filter(c => prod(c.id)); saveCart(); cartChanged(); }
      if (!St.token && cmd !== 'login') { go('login'); return; }
      Sh.closeAll();
      if (!document.getElementById('hb') && St.token) go('home');
      const f = {
        checkout: () => A.checkout(), profile: () => A.profile(), addr: () => A.addrSheet(), coinShop: () => A.coinShop(),
        banner: () => A.banner(arg), login: () => go('login'), settings: () => A.settings(),
      }[cmd];
      if (f) f();
      last = ''; // send the state again right away
    },
    // the app changed the cart while the page was hidden
    setCart(cart) { if (typeof St === 'undefined' || !St.menu || !Array.isArray(cart)) return; St.cart = cart.filter(c => prod(c.id)); saveCart(); cartChanged(); },
  };
})();
