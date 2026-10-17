/* Demo-only in-browser backend for the static preview.
   Replaces fetch('/api/...') so the whole customer flow works with no server:
   login (any code), addresses, cards, promo, delivery quote, orders with a simulated
   kitchen + courier timeline, notifications, reviews, support chat, coin shop.
   State lives in this page (and localStorage when allowed); nothing leaves the browser. */
(function () {
  const realFetch = window.fetch.bind(window);
  const KEY = 'wendys_demo_state_v1';
  const nowStr = (t = Date.now()) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
  const initial = () => ({
    user: { id: 1, name: 'Демо', phone: '+998901234567', avatar: 0, notify: 1, coins: 50000 },
    addresses: [{ id: 1, user_id: 1, label: 'home', address: 'Ташкент, улица Беруни, 45', lat: 41.341, lng: 69.205, entrance: '', intercom: '', floor: '', apartment: '', comment: '' }],
    cards: [], orders: [], notifs: [], chat: [], reviews: {}, seq: { addr: 2, card: 1, order: 1001, notif: 1, chat: 1 },
  });
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || initial(); } catch { S = initial(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage unavailable */ } };

  let menuP = null;
  const menu = () => menuP || (menuP = realFetch('menu.json').then(r => r.json()));
  const J = (o, s) => Promise.resolve(new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json' } }));
  const bad = (m, s) => J({ error: m }, s || 400);
  const km = (a, b, c, d) => {
    const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  };
  const luhn = n => { let s = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; } return s % 10 === 0; };

  const feeOf = (m, b, amount) => {
    const base = b.delivery_fee >= 0 ? b.delivery_fee : Number(m.settings.delivery_fee || 0);
    return b.free_from > 0 && amount >= b.free_from ? 0 : base;
  };
  const inRing = (lat, lng, ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [yi, xi] = ring[i], [yj, xj] = ring[j]; if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
  const inPolys = (lat, lng, polys) => polys.some(([outer, ...holes]) => inRing(lat, lng, outer) && !holes.some(h => inRing(lat, lng, h)));
  // same rule as the server: with delivery zones only the zone's branches deliver, otherwise each branch's radius
  const pickBranch = (m, lat, lng) => {
    let list = m.branches.filter(b => b.active).map(b => ({ b, d: km(lat, lng, b.lat, b.lng) }));
    if (m.zones && m.zones.length) {
      const ids = new Set(m.zones.filter(z => inPolys(lat, lng, z.polys)).flatMap(z => z.branch_ids));
      list = list.filter(x => ids.has(x.b.id));
    } else list = list.filter(x => x.d <= (x.b.delivery_radius || 7));
    return list.sort((a, b) => a.d - b.d)[0] || null;
  };
  const promoOf = (m, code) => (m.promos || []).find(p => p.code === String(code || '').trim().toUpperCase());

  /* order timeline in seconds since it was placed */
  const T_COOK = 8, T_READY = 25, T_GO = 32, T_DONE = 72, T_PICK_DONE = 60;
  function statusAt(o, t) {
    if (o.cancelled) return 'cancelled';
    const s = (t - o.t0) / 1000;
    if (s < T_COOK) return 'new';
    if (s < T_READY) return 'cooking';
    if (o.type === 'pickup') return s < T_PICK_DONE ? 'ready' : 'done';
    if (s < T_GO) return 'ready';
    return s < T_DONE ? 'delivering' : 'done';
  }
  const NOTE = {
    cooking: o => ({ kind: 'cooking', title: 'Заказ принят', body: `Заказ №${o.id} готовится` }),
    ready: o => ({ kind: 'ready', title: 'Заказ готов', body: o.type === 'pickup' ? `Заказ №${o.id} ждёт вас` : `Заказ №${o.id} готов, ищем курьера` }),
    delivering: o => ({ kind: 'delivering', title: 'Курьер в пути', body: `Курьер Азиз везёт заказ №${o.id}` }),
    done: o => ({ kind: o.type === 'delivery' ? 'delivered' : 'done', title: o.type === 'delivery' ? 'Заказ доставлен' : 'Приятного аппетита!', body: `Заказ №${o.id} выполнен. Оцените сервис` }),
  };
  /* bring every order up to date: status, notifications, coin reward */
  function tick() {
    const t = Date.now(); let dirty = false;
    for (const o of S.orders) {
      const st = statusAt(o, t);
      if (o.status === st) continue;
      const order = ['new', 'cooking', 'ready', 'delivering', 'done'];
      for (let i = order.indexOf(o.status) + 1; i <= order.indexOf(st); i++) {
        const k = order[i], mk = NOTE[k];
        if (mk && !(k === 'delivering' && o.type === 'pickup')) S.notifs.push({ id: S.seq.notif++, user_id: 1, order_id: o.id, ...mk(o), created_at: nowStr() });
        if (k === 'done' && o.coins) S.user.coins += o.coins;
      }
      o.status = st; dirty = true;
    }
    if (dirty) save();
  }
  const view = (o, m) => ({
    ...o, items: o.items, address: o.address, stars: S.reviews[o.id] ?? null,
    branch_name: (m.branches.find(b => b.id === o.branch_id) || {}).name || '',
  });

  async function route(method, path, body, query) {
    const m = await menu();
    tick();
    let mm;
    if (method === 'GET' && path === '/menu') return J(m);
    if (path === '/zones') return J({ zones: m.zones || [] });
    if (path === '/auth/request') return J({ ok: true, resend_in: 30 });
    if (path === '/auth/verify') return /^\d{4}$/.test(String(body.code)) ? J({ token: 'demo', user: S.user }) : bad('Неверный код');
    if (path === '/logout') return J({ ok: true });
    if (path === '/me') {
      if (method === 'PUT') {
        for (const k of ['name', 'notify', 'avatar']) if (body[k] !== undefined) S.user[k] = body[k];
        save(); return J({ user: S.user });
      }
      if (method === 'DELETE') { S = initial(); save(); return J({ ok: true }); }
      return J({ user: S.user });
    }
    if (path === '/me/phone/request') return J({ ok: true, resend_in: 30 });
    if (path === '/me/phone/verify') { S.user.phone = body.phone; save(); return J({ user: S.user }); }
    if (path === '/reverse') {
      const lat = +query.lat, lng = +query.lng;
      const near = m.branches.map(b => ({ b, d: km(lat, lng, b.lat, b.lng) })).sort((a, b) => a.d - b.d)[0];
      return J({ address: `Ташкент, рядом с «${near.b.name}», ${near.b.address}`, lat, lng });
    }
    if (path === '/promo/check') {
      const p = promoOf(m, body.code), sub = Number(body.subtotal || 0);
      if (!p) return bad('Промокод не найден', 404);
      if (sub < p.min_total) return bad(`Минимальная сумма заказа ${p.min_total} so'm`);
      return J({ code: p.code, percent: p.percent, fixed: p.fixed, discount: Math.min(sub, p.percent ? Math.round(sub * p.percent / 100) : p.fixed), title: p.title });
    }
    if (path === '/addresses') {
      if (method === 'POST') {
        const address = String(body.address || '').trim();
        if (!address) return bad('Укажите адрес');
        if (!Number.isFinite(+body.lat) || !Number.isFinite(+body.lng)) return bad('Не определены координаты');
        const a = { id: S.seq.addr++, user_id: 1, label: ['home', 'work', 'other'].includes(body.label) ? body.label : 'other', address: address.slice(0, 250), lat: +body.lat, lng: +body.lng };
        for (const k of ['entrance', 'intercom', 'floor', 'apartment', 'comment']) a[k] = String(body[k] || '').slice(0, 100);
        S.addresses.unshift(a); save(); return J({ address: a });
      }
      return J({ addresses: S.addresses });
    }
    if ((mm = /^\/addresses\/(\d+)$/.exec(path)) && method === 'DELETE') { S.addresses = S.addresses.filter(a => a.id !== +mm[1]); save(); return J({ ok: true }); }
    if (path === '/cards') {
      if (method === 'POST') {
        const num = String(body.number || '').replace(/\D/g, ''), exp = String(body.exp || '').replace(/\D/g, '');
        if (num.length !== 16 || !luhn(num)) return bad('Неверный номер карты');
        const mo = +exp.slice(0, 2), yy = +exp.slice(2, 4), d = new Date();
        if (exp.length !== 4 || mo < 1 || mo > 12 || (2000 + yy) * 12 + mo < d.getFullYear() * 12 + d.getMonth() + 1) return bad('Неверный срок действия');
        const brand = num.startsWith('8600') ? 'Uzcard' : num.startsWith('9860') ? 'Humo' : num[0] === '4' ? 'Visa' : num[0] === '5' ? 'Mastercard' : 'Карта';
        const c = { id: S.seq.card++, user_id: 1, brand, last4: num.slice(-4), exp: exp.slice(0, 2) + '/' + exp.slice(2) };
        S.cards.push(c); save(); return J({ card: c });
      }
      return J({ cards: S.cards });
    }
    if ((mm = /^\/cards\/(\d+)$/.exec(path)) && method === 'DELETE') { S.cards = S.cards.filter(c => c.id !== +mm[1]); save(); return J({ ok: true }); }
    if (path === '/delivery/quote') {
      const p = pickBranch(m, +body.lat, +body.lng);
      if (!p) return J({ ok: false, error: 'radius', message: m.zones && m.zones.length ? 'К сожалению, ваш адрес вне зоны доставки. Посмотрите зоны доставки на карте' : 'К сожалению, доставка на ваш адрес сейчас недоступна.' });
      return J({ ok: true, branch: { id: p.b.id, name: p.b.name || p.b.address, address: p.b.address }, distance_km: Math.round(p.d * 10) / 10, fee: feeOf(m, p.b, Number(body.subtotal) || 0), free_from: p.b.free_from });
    }
    if (path === '/orders' && method === 'POST') {
      const type = body.type === 'pickup' ? 'pickup' : 'delivery';
      const rows = Array.isArray(body.items) ? body.items : [];
      if (!rows.length) return bad('Корзина пуста');
      const items = []; let subtotal = 0, coinsSpent = 0;
      for (const r of rows) {
        const p = m.products.find(x => x.id === +r.product_id && x.active);
        if (!p) return bad('Товар недоступен');
        const qty = Math.max(1, Math.min(50, +r.qty || 1));
        if (r.with_coins) {
          if (!(p.coin_cost > 0)) return bad(`«${p.name}» нельзя обменять на WendyCoin`);
          items.push({ product_id: p.id, name: p.name, price: 0, qty, coin_price: p.coin_cost }); coinsSpent += p.coin_cost * qty;
        } else { items.push({ product_id: p.id, name: p.name, price: p.price, qty }); subtotal += p.price * qty; }
      }
      if (coinsSpent > S.user.coins) return bad('Недостаточно WendyCoin');
      let branch, address = null, fee = 0;
      if (type === 'pickup') {
        branch = m.branches.find(b => b.id === +body.branch_id && b.active);
        if (!branch) return bad('Выберите пиццерию');
      } else {
        address = S.addresses.find(a => a.id === +body.address_id);
        if (!address) return bad('Укажите адрес доставки');
        const p = pickBranch(m, address.lat, address.lng);
        if (!p) return bad('К сожалению, доставка на ваш адрес сейчас недоступна.');
        branch = p.b;
      }
      let discount = 0, promo = '';
      if (body.promo) {
        const p = promoOf(m, body.promo);
        if (!p) return bad('Промокод не найден');
        if (subtotal < p.min_total) return bad('Сумма заказа меньше минимальной для промокода');
        discount = Math.min(subtotal, p.percent ? Math.round(subtotal * p.percent / 100) : p.fixed); promo = p.code;
      }
      if (type === 'delivery') {
        if (subtotal < (branch.min_order || 0)) return bad(`Минимальная сумма заказа для доставки: ${branch.min_order} so'm`);
        fee = feeOf(m, branch, subtotal - discount);
      }
      const total = subtotal - discount + fee;
      const payment = ['card', 'click', 'payme', 'cash', 'coins'].includes(body.payment) ? body.payment : 'card';
      let coinPay = 0;
      if (payment === 'coins') {
        coinPay = Math.ceil(total / (Number(m.settings.coin_value) || 1));
        if (coinsSpent + coinPay > S.user.coins) return bad('Недостаточно WendyCoin для оплаты заказа');
      }
      const o = {
        id: S.seq.order++, user_id: 1, type, branch_id: branch.id, address, items, subtotal, discount, delivery_fee: fee, total, promo, payment,
        pay_status: payment === 'coins' ? 'paid' : 'pending', pickup_time: type === 'pickup' ? String(body.pickup_time || 'asap') : '',
        pickup_method: type === 'pickup' ? (body.pickup_method || 'tray') : '', comment: String(body.comment || '').slice(0, 200),
        coins: payment === 'coins' ? 0 : Math.round(total * Number(m.settings.coin_percent || 10) / 100), coins_spent: coinsSpent + coinPay,
        status: 'new', created_at: nowStr(), t0: Date.now(),
      };
      S.user.coins -= coinsSpent + coinPay;
      S.orders.unshift(o); save();
      return J({ order: o, branch_name: branch.name || branch.address });
    }
    if (path === '/orders') return J({ orders: S.orders.map(o => view(o, m)) });
    if ((mm = /^\/orders\/(\d+)\/track$/.exec(path))) {
      const o = S.orders.find(x => x.id === +mm[1]);
      if (!o) return bad('Заказ не найден', 404);
      const br = m.branches.find(b => b.id === o.branch_id);
      let courier = null;
      if (o.status === 'delivering' && o.address) {
        const f = Math.min(1, Math.max(0, ((Date.now() - o.t0) / 1000 - T_GO) / (T_DONE - T_GO)));
        courier = { name: 'Азиз', lat: br.lat + (o.address.lat - br.lat) * f, lng: br.lng + (o.address.lng - br.lng) * f, updated_at: nowStr() };
      }
      return J({ id: o.id, status: o.status, type: o.type, dest: o.address ? { lat: o.address.lat, lng: o.address.lng, address: o.address.address } : null, branch: br && { name: br.name, address: br.address, lat: br.lat, lng: br.lng }, courier });
    }
    if ((mm = /^\/orders\/(\d+)\/review$/.exec(path))) {
      const o = S.orders.find(x => x.id === +mm[1]);
      if (!o) return bad('Заказ не найден', 404);
      if (o.status !== 'done') return bad('Оценить можно после доставки');
      const stars = +body.stars;
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) return bad('Поставьте оценку от 1 до 5');
      if (S.reviews[o.id]) return bad('Вы уже оценили этот заказ');
      S.reviews[o.id] = stars; save(); return J({ ok: true });
    }
    if (path === '/notifications') {
      const after = +query.after || 0;
      return J({ items: S.notifs.filter(n => n.id > after).slice(0, 50) });
    }
    if (path === '/chat') {
      if (method === 'POST') {
        const text = String(body.text || '').trim().slice(0, 1000), image = body.image && /^data:image\//.test(body.image) ? body.image : '';
        if (!text && !image) return bad('Пустое сообщение');
        const msg = { id: S.seq.chat++, sender: 'user', text, image, created_at: nowStr() };
        S.chat.push(msg); save();
        setTimeout(() => { S.chat.push({ id: S.seq.chat++, sender: 'admin', text: 'Здравствуйте! Это демо-чат поддержки. В рабочей версии вам ответит оператор.', image: '', created_at: nowStr() }); save(); }, 2000);
        return J({ message: msg });
      }
      return J({ messages: S.chat.filter(c => c.id > (+query.after || 0)) });
    }
    return bad('Не найдено', 404);
  }

  window.fetch = function (u, o) {
    if (typeof u === 'string' && u.indexOf('/api/') === 0) {
      const [p, qs] = u.slice(4).split('?');
      const query = Object.fromEntries(new URLSearchParams(qs || ''));
      let body = {}; try { body = o && o.body ? JSON.parse(o.body) : {}; } catch { /* ignore */ }
      return route((o && o.method) || 'GET', p, body, query);
    }
    return realFetch(u, o);
  };
  window.__demoReset = () => { S = initial(); save(); location.reload(); };
})();
