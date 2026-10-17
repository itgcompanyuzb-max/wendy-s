/* Wendy's website (desktop). Talks to the same API as the mobile app: menu, Telegram-code login, addresses,
 * delivery zones, orders and live tracking. Cart, token and language are shared with the mobile site (localStorage). */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const LANG = (() => { try { const s = localStorage.getItem('lang'); return s ? (s === 'uz' ? 'uz' : 'ru') : (/^uz/i.test(navigator.language || '') ? 'uz' : 'ru'); } catch { return 'ru'; } })();
document.documentElement.lang = LANG;
const NB = ' ';
const num = n => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0)).replace(/\s/g, NB);
const money = n => num(n) + NB + "so'm";
const loc = (o, f) => (!o || !o[f] ? '' : (LANG === 'uz' && o[f + '_uz'] ? o[f + '_uz'] : o[f]));

/* ---------- texts ---------- */
const TX = {
  promos: ['Акции', 'Aksiyalar'], coins: ['WendyCoin', 'WendyCoin'], zones: ['Зоны доставки', 'Yetkazib berish hududi'], about: ['О нас', 'Biz haqimizda'],
  lang: ['Язык', 'Til'], branchesN: [n => `${n} ${plural(n, 'ресторан', 'ресторана', 'ресторанов')}`, n => `${n} ta filial`],
  citiesN: [n => `в ${n} ${plural(n, 'городе', 'городах', 'городах')}`, n => `${n} ta shaharda`],
  pickAddr: ['Укажите адрес доставки', 'Yetkazish manzilini tanlang'], min: ['мин', 'daqiqa'], login: ['Войти', 'Kirish'],
  cart: ['Корзина', 'Savat'], popular: ['Часто заказывают', 'Ko‘p buyurtma qilinadi'], from: ['от', 'dan'], choose: ['Выбрать', 'Tanlash'],
  appTitle: ['Лучшие предложения в приложении', 'Eng yaxshi takliflar ilovada'], appSub: ['Скачайте и копите WendyCoin', 'Yuklab oling va WendyCoin to‘plang'],
  deliveryIn: [c => `Доставка в ${c}`, c => `${c} bo‘ylab yetkazib berish`], limited: ['Зона доставки ограничена', 'Yetkazib berish hududi cheklangan'],
  zoneThumb: ['Зона доставки', 'Yetkazib berish zonasi'], minOrder: ['Минимальная сумма заказа на доставку', 'Yetkazib berish uchun minimal buyurtma summasi'],
  freeFrom: ['Бесплатная доставка при заказе от этой суммы', 'Shu summadan boshlab yetkazib berish bepul'], fee: ['Стоимость доставки', 'Yetkazib berish narxi'],
  freeDel: ['Бесплатно', 'Bepul'], imgs: ['Изображения блюд могут отличаться от заказанных.', 'Taom rasmlari buyurtma qilingan mahsulotdan farq qilishi mumkin.'],
  zonesCount: [n => `Работаем в ${n} ${plural(n, 'зоне', 'зонах', 'зонах')}. Проверьте свой адрес на карте.`, n => `${n} ta hududda ishlaymiz. Manzilingizni xaritada tekshiring.`],
  stripTx: [p => `Возвращаем ${p}% каждого заказа в WendyCoin — оплачивайте ими следующие заказы`, p => `Har bir buyurtmaning ${p}% WendyCoin bo‘lib qaytadi — keyingi buyurtmalarni ular bilan to‘lang`],
  more: ['Подробнее', 'Batafsil'], company: ['Компания', 'Kompaniya'], help: ['Помощь', 'Yordam'], contacts: ['Контакты', 'Aloqa'],
  legal: ['Правовая информация', 'Huquqiy ma’lumot'], mobile: ['Мобильная версия', 'Mobil versiya'], ourBranches: ['Наши рестораны', 'Filiallarimiz'],
  ordersMonth: [n => `${plural(n, 'заказ', 'заказа', 'заказов')} в этом месяце`, () => 'ta buyurtma — shu oy'], restaurants: [n => plural(n, 'ресторан', 'ресторана', 'ресторанов'), () => 'ta filial'],
  soon: ['скоро', 'tez kunda'], download: ['Загрузите в', 'Yuklab oling'], getOn: ['Доступно в', 'Mavjud'],
  emptyCart: ['Ой, пусто!', 'Savat bo‘sh'], emptyCartTx: ['Добавьте бургеры и напитки из меню', 'Menyudan burger va ichimliklarni qo‘shing'],
  checkout: ['Оформить заказ', 'Buyurtmani rasmiylashtirish'], toCart: ['В корзину', 'Savatga'], add: ['Добавить в корзину за', 'Savatga qo‘shish:'],
  withIt: ['С этим берут', 'Bu bilan olishadi'], total: ['Итого', 'Jami'], items: ['Товары', 'Mahsulotlar'], discount: ['Скидка', 'Chegirma'], delivery: ['Доставка', 'Yetkazib berish'],
  pickup: ['Самовывоз', 'Olib ketish'], phoneT: ['Вход на сайт', 'Saytga kirish'], phoneSub: ['Код придёт в Telegram', 'Kod Telegram orqali keladi'],
  getCode: ['Получить код', 'Kod olish'], codeT: ['Введите код', 'Kodni kiriting'], codeSent: [p => `Отправили код на ${p}`, p => `${p} raqamiga kod yubordik`],
  resend: ['Отправить ещё раз', 'Qayta yuborish'], resendIn: [s => `Новый код через ${s} с`, s => `Yangi kod ${s} soniyadan keyin`], change: ['Изменить номер', 'Raqamni o‘zgartirish'],
  nameT: ['Как вас зовут?', 'Ismingiz nima?'], name: ['Имя', 'Ism'], save: ['Сохранить', 'Saqlash'], skip: ['Пропустить', 'O‘tkazib yuborish'],
  addrT: ['Адрес доставки', 'Yetkazish manzili'], addr: ['Улица, дом', 'Ko‘cha, uy'], entrance: ['Подъезд', 'Podyezd'], floor: ['Этаж', 'Qavat'], apt: ['Кв./офис', 'Xonadon'],
  intercom: ['Домофон', 'Domofon'], comment: ['Комментарий', 'Izoh'], moveMap: ['Передвиньте карту, чтобы поставить точку на ваш дом', 'Xaritani suring — belgini uyingizga qo‘ying'],
  checking: ['Проверяем адрес…', 'Manzil tekshirilmoqda…'], delivers: [(b, km) => `Доставит ресторан «${b}» · ${km} км`, (b, km) => `«${b}» filiali yetkazadi · ${km} km`],
  saveAddr: ['Сохранить адрес', 'Manzilni saqlash'], newAddr: ['+ Новый адрес', '+ Yangi manzil'], myAddrs: ['Мои адреса', 'Manzillarim'],
  pay: ['Оплата', 'To‘lov'], cash: ['Наличными', 'Naqd'], promo: ['Промокод', 'Promokod'], apply: ['Применить', 'Qo‘llash'],
  place: ['Заказать', 'Buyurtma berish'], branch: ['Ресторан', 'Filial'], asap: ['Как можно скорее', 'Iloji boricha tez'], closed: ['закрыт', 'yopiq'],
  okT: ['Заказ принят!', 'Buyurtma qabul qilindi!'], okTx: [n => `Номер заказа №${n}. Мы сообщим, когда он будет готов.`, n => `Buyurtma raqami №${n}. Tayyor bo‘lganda xabar beramiz.`],
  track: ['Отследить', 'Kuzatish'], profile: ['Профиль', 'Profil'], orders: ['Мои заказы', 'Buyurtmalarim'], noOrders: ['Заказов пока нет', 'Hali buyurtmalar yo‘q'],
  logout: ['Выйти', 'Chiqish'], close: ['Закрыть', 'Yopish'], minFor: [m => `Минимальная сумма для доставки — ${m}`, m => `Yetkazib berish uchun minimal summa — ${m}`],
  needAddr: ['Укажите адрес доставки', 'Yetkazish manzilini kiriting'], needBranch: ['Выберите ресторан', 'Filialni tanlang'],
  coinsT: ['WendyCoin', 'WendyCoin'], coinsTx: [p => `За каждый заказ возвращаем ${p}% суммы в WendyCoin. Ими можно оплатить следующий заказ или обменять на соусы и напитки в мобильном приложении.`, p => `Har bir buyurtma uchun summaning ${p}% WendyCoin bo‘lib qaytadi. Ular bilan keyingi buyurtmani to‘lash yoki mobil ilovada sous va ichimliklarga almashtirish mumkin.`],
  balance: ['Ваш баланс', 'Balansingiz'], courier: ['Курьер', 'Kuryer'], legalTx: ['Пользовательское соглашение и политика конфиденциальности. Картографические данные: © участники OpenStreetMap.', 'Foydalanuvchi shartnomasi va maxfiylik siyosati. Xarita ma’lumotlari: © OpenStreetMap ishtirokchilari.'],
  rating: ['оценка', 'reyting'], netErr: ['Ошибка сети', 'Tarmoq xatosi'], outZone: ['Адрес вне зоны доставки', 'Manzil yetkazish hududidan tashqarida'],
  tray: ['На подносе', 'Patnisda'], takeaway: ['С собой', 'Olib ketish'], table: ['К столику', 'Stolga olib kelish'],
  searchPh: ['Найти бургер, напиток…', 'Burger, ichimlik qidirish…'], notFound: ['Ничего не нашли', 'Hech narsa topilmadi'],
  zoneBranches: ['доставляют', 'yetkazadi'], all: ['Меню', 'Menyu'], phone: ['Телефон', 'Telefon'], payNote: ['Оплата Click/Payme — ссылка придёт после подтверждения заказа', 'Click/Payme orqali to‘lov — havola buyurtma tasdiqlangach keladi'],
};
const ST_NAMES = { new: ['Ожидает подтверждения', 'Tasdiqlanishi kutilmoqda'], cooking: ['Готовится', 'Tayyorlanmoqda'], ready: ['Готов', 'Tayyor'], delivering: ['В пути', 'Yo‘lda'], done: ['Выполнен', 'Bajarildi'], cancelled: ['Отменён', 'Bekor qilindi'] };
function plural(n, a, b, c) { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; }
const t = (k, ...a) => { const v = TX[k]?.[LANG === 'uz' ? 1 : 0] ?? k; return typeof v === 'function' ? v(...a) : v; };
// server messages come in Russian; translate the common ones for Uzbek visitors
const SRV_UZ = [[/вне зоны доставки/, 'Manzil yetkazish hududidan tashqarida. Hududlarni xaritada ko‘ring'], [/Пока не принимаем заказы/, 'Hozir buyurtma qabul qilinmayapti. Keyinroq urinib ko‘ring'],
  [/Неверный код/, 'Kod noto‘g‘ri'], [/Код устарел/, 'Kod eskirgan. Yangisini so‘rang'], [/Подождите/, 'Qayta yuborishdan oldin kuting'], [/Минимальная сумма/, 'Buyurtma summasi minimaldan kam'],
  [/Промокод не найден/, 'Promokod topilmadi'], [/Введите номер/, 'Raqamni to‘liq kiriting'], [/Не удалось отправить код/, 'Kod yuborilmadi. Raqamda Telegram borligini tekshiring'], [/Сейчас нет в наличии/, 'Hozir mavjud emas']];
const srv = m => (LANG === 'uz' ? (SRV_UZ.find(([r]) => r.test(m || ''))?.[1] || m) : m);

/* ---------- state + api ---------- */
const St = { token: LS.get('token', null), user: null, menu: null, zones: [], cart: LS.get('cart', []), addrs: [], addrId: LS.get('addrId', null), mode: LS.get('mode', 'delivery'), branchId: LS.get('branchId', null), promo: null, pay: 'cash', pickupMethod: 'takeaway', quote: null, orders: [] };
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(St.token ? { Authorization: 'Bearer ' + St.token } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && St.token) { St.token = null; St.user = null; LS.del('token'); renderHead(); }
  if (!r.ok) throw Object.assign(new Error(srv(j.error) || t('netErr')), { data: j, status: r.status });
  return j;
}
function toast(m) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = m; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); }

const prods = () => St.menu?.products || [];
const prod = id => prods().find(p => p.id === id);
const branches = () => St.menu?.branches || [];
const img = (p, cls = '') => (p?.image ? `<img class="${cls}" src="${esc(p.image)}" alt="${esc(loc(p, 'name'))}" loading="lazy">` : `<div class="noimg ${cls}">${phOf(p)}</div>`);
const phOf = p => PH[St.menu?.categories.find(c => c.id === p?.category_id)?.icon] || PH.burger; // icons.js (shared with the mobile app)
const brand = () => St.menu?.settings?.brand || "Wendy's";
const cartItems = () => St.cart.filter(c => !c.coin && prod(c.id));
const qty = id => St.cart.find(c => c.id === id && !c.coin)?.qty || 0;
function totals() {
  let sub = 0; for (const c of cartItems()) sub += prod(c.id).price * c.qty;
  const discount = St.promo ? Math.min(sub, St.promo.percent ? Math.round(sub * St.promo.percent / 100) : St.promo.fixed || 0) : 0;
  return { sub, discount, count: cartItems().reduce((n, c) => n + c.qty, 0) };
}
function setQty(id, d) {
  const c = St.cart.find(x => x.id === id && !x.coin);
  if (c) { c.qty = Math.max(0, Math.min(50, c.qty + d)); if (!c.qty) St.cart = St.cart.filter(x => x !== c); } else if (d > 0) St.cart.push({ id, qty: 1 });
  LS.set('cart', St.cart); St.quote = null; refreshCart();
}
function refreshCart() {
  renderCartBtns();
  for (const el of $$('[data-buy]')) el.outerHTML = buyHTML(prod(Number(el.dataset.buy)));
  if ($('#drawer')) openCart(true);
}

/* ---------- icons ---------- */
const IC = {
  bag: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7V6a5 5 0 0 1 10 0v1h2.2a1 1 0 0 1 1 .92l1 13a1 1 0 0 1-1 1.08H3.8a1 1 0 0 1-1-1.08l1-13A1 1 0 0 1 4.8 7zm2 0h6V6a3 3 0 0 0-6 0z"/></svg>',
  fork: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M9 3v10M17 21V3c-2.5 1.5-3 5-3 8h3"/></svg>',
  chev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  phone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  globe: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 20 20" class="icon"><circle cx="10" cy="10" r="7.25" stroke="currentColor" stroke-width="1.5"/><path d="M2.75 10h14.5M10 2.75c1.9 2 2.85 4.42 2.85 7.25S11.9 15.25 10 17.25M10 2.75C8.1 4.75 7.15 7.17 7.15 10S8.1 15.25 10 17.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  coin: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M7.5 9l1.8 6 2.7-5 2.7 5 1.8-6"/></svg>',
  apple: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8a4.6 4.6 0 0 0-3.6-2c-1.5-.2-3 .9-3.8.9s-2-.9-3.3-.8a5 5 0 0 0-4.2 2.5c-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8 2.2-1.3 3-2.5a10 10 0 0 0 1.4-2.8 4.4 4.4 0 0 1-2.7-4.3zM14 5.2A4.4 4.4 0 0 0 15 2a4.6 4.6 0 0 0-3 1.5 4.2 4.2 0 0 0-1 3.1A3.8 3.8 0 0 0 14 5.2z"/></svg>',
  play: '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2.5v19l10-9.5z" fill="#34a853"/><path d="M4 2.5l10 9.5 3-2.9L5.4 2.2z" fill="#4285f4"/><path d="M4 21.5l10-9.5 3 2.9-11.6 6.9z" fill="#ea4335"/><path d="M17 9.1L14 12l3 2.9 3.4-2a1 1 0 0 0 0-1.8z" fill="#fbbc04"/></svg>',
  ig: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  tg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M21.4 4.1L2.9 11.2c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.5-1.4zM9.8 14.6l-.4 4 .1-.1-1.5-4.6 10.3-6.5z"/></svg>',
  fb: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M14 8V6.2c0-.8.2-1.2 1.4-1.2H17V2h-2.6C11.3 2 10 3.5 10 6v2H8v3h2v11h4V11h2.6l.4-3z"/></svg>',
  pin: '<svg class="pinc" viewBox="0 0 44 54"><path d="M22 53s20-17.4 20-31A20 20 0 0 0 2 22c0 13.6 20 31 20 31z" fill="#e2203d"/><circle cx="22" cy="21" r="8" fill="#fff"/></svg>',
};

/* ---------- maps ---------- */
const tiles = () => { const k = St.menu?.settings?.yandex_key; return k ? L.tileLayer(`https://tiles.api-maps.yandex.ru/v1/tiles/?lang=${LANG === 'uz' ? 'uz_UZ' : 'ru_RU'}&x={x}&y={y}&z={z}&l=map&apikey=${k}`, { maxZoom: 19 }) : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }); };
const newMap = (el, o = {}) => L.map(el, { attributionControl: false, zoomControl: false, ...(St.menu?.settings?.yandex_key ? { crs: L.CRS.EPSG3395 } : {}), ...o });
const logoIcon = () => L.divIcon({ className: '', html: '<div class="zmk"><img src="/img/brand.png" alt=""></div>', iconSize: [52, 60], iconAnchor: [26, 60] });
function drawZones(map, opts = {}) {
  const layers = St.zones.map(z => L.polygon(z.polys, { color: z.color || '#e2203d', weight: opts.weight ?? 2.5, fillOpacity: opts.fill ?? .28 }).addTo(map));
  if (layers.length) map.fitBounds(L.featureGroup(layers).getBounds(), { padding: opts.pad || [30, 30] });
  else if (branches().length) map.fitBounds(branches().map(b => [b.lat, b.lng]), { padding: [60, 60], maxZoom: 12 });
  return layers;
}
function inRing(lat, lng, ring) { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [yi, xi] = ring[i], [yj, xj] = ring[j]; if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ins = !ins; } return ins; }

/* ---------- page ---------- */
function render() {
  const s = St.menu.settings, st = St.menu.stats || {};
  const cats = St.menu.categories.filter(c => prods().some(p => p.category_id === c.id));
  const popular = prods().filter(p => p.recommended).concat(prods().filter(p => !p.recommended && p.old_price > p.price)).slice(0, 5);
  const city = branches()[0]?.city || 'Ташкент';
  const minOrder = Math.min(...branches().map(b => b.min_order || 0).filter(Boolean), Infinity);
  const freeFrom = Math.min(...branches().map(b => b.free_from || 0).filter(Boolean), Infinity);
  $('#site').innerHTML = `
  <div class="topbar"><div class="wrap">
    <button class="live" data-a="zones">${t('zones')}</button>
    ${s.about_text ? `<button data-a="about" class="hide-s">${t('about')}</button>` : ''}
    ${St.menu.promos.length ? `<button data-a="promos">${t('promos')}</button>` : ''}
    <button data-a="coins">${t('coins')}</button>
    ${s.support_phone ? `<a href="tel:${esc(s.support_phone.replace(/[^+\d]/g, ''))}" class="hide-s">${IC.phone}${esc(s.support_phone)}</a>` : ''}
    <span class="sp"></span>
    <div class="dd" id="langdd"><button data-a="langdd">${IC.globe}${LANG === 'uz' ? 'O‘zbekcha' : 'Русский'} ${IC.chev}</button><div class="menu"><button data-a="lang" data-v="uz" class="${LANG === 'uz' ? 'on' : ''}">O‘zbekcha</button><button data-a="lang" data-v="ru" class="${LANG === 'ru' ? 'on' : ''}">Русский</button></div></div>
  </div></div>
  <header class="head"><div class="wrap">
    <a class="logo" href="#top" data-a="top"><span class="mk"><img src="/img/brand.png" alt=""></span><span><b>${esc(brand())}</b><small>${t('branchesN', st.branches ?? branches().length)} ${st.cities > 1 ? t('citiesN', st.cities) : ''}</small></span></a>
    <button class="addr" data-a="addr" id="addrbtn"></button>
    <span class="sp"></span>
    <span id="cartslot"></span>
    <span id="userslot"></span>
  </div></header>
  ${St.menu.banners.length ? `<section class="wrap stories">${St.menu.banners.slice(0, 6).map(b => `<button class="story ${b.image ? '' : 'noimg'}" data-a="banner" data-id="${b.id}" style="background:${esc(b.color || '#e2203d')}">${b.image ? `<img src="${esc(b.image)}" alt="" onerror="this.remove()">` : ''}<span>${esc(loc(b, 'title'))}</span></button>`).join('')}</section>` : ''}
  <div class="sheet"><div class="wrap layout">
    <main>
      <nav class="cats" id="cats"><span class="mini"><img src="/img/brand.png" alt=""></span><button class="sbtn" data-a="search" aria-label="search">${I.search(22)}</button><button class="sbtn coin" data-a="coins" aria-label="WendyCoin"><img src="/img/coin.png" alt=""></button><span class="sbox"><input id="sinp" placeholder="${t('searchPh')}" autocomplete="off"><button data-a="sclose" aria-label="close">${I.x('#a3a3ab', 20)}</button></span><div class="pills">${cats.map(c => `<a class="pill" href="#c${c.id}" data-cat="${c.id}">${esc(loc(c, 'name'))}</a>`).join('')}</div><button class="navcart" data-a="cart"></button></nav>
      ${popular.length ? `<h2 class="h2 popular-h" style="margin-top:6px">${t('popular')}</h2><div class="popular">${popular.map(p => `<div class="pop" data-a="prod" data-id="${p.id}">${img(p)}<b>${esc(loc(p, 'name'))}</b><span class="pr">${money(p.price)}</span></div>`).join('')}</div>` : ''}
      <div class="empty" id="nofound" hidden><b>${t('notFound')}</b></div>
      ${cats.map(c => `<section class="cat" id="c${c.id}" data-sec="${c.id}"><h2>${esc(loc(c, 'name'))}</h2><div class="grid">${prods().filter(p => p.category_id === c.id).map(card).join('')}</div></section>`).join('')}
      <section class="deliv" id="delivery"><h2 class="h2">${esc(t('deliveryIn', city))}</h2><div class="g">
        <div><div class="cap">${t('limited')}</div><div class="zonethumb" data-a="zones"><div class="lm" id="thumbmap"></div><span>${t('zoneThumb')}</span></div></div>
        <div class="facts">
          ${Number.isFinite(minOrder) ? `<div class="f"><b>${t('from')} ${money(minOrder)}</b><span>${t('minOrder')}</span></div>` : ''}
          <div class="f"><b>${s.delivery_fee > 0 ? money(s.delivery_fee) : t('freeDel')}</b><span>${t('fee')}</span></div>
          ${Number.isFinite(freeFrom) && s.delivery_fee > 0 ? `<div class="f"><b>${t('from')} ${money(freeFrom)}</b><span>${t('freeFrom')}</span></div>` : ''}
          ${St.zones.length ? `<div class="f plain"><span>${t('zonesCount', St.zones.length)}</span></div>` : ''}
          <div class="f plain"><span>${t('imgs')}</span></div>
        </div></div></section>
    </main>
    <aside class="aside"><div class="appcard"><h3>${t('appTitle')}</h3><p>${t('appSub')}</p><div class="badges">${storeBadges(true)}</div><div class="coins"></div><div class="art"><div class="tile"><img src="/img/brand.png" alt=""></div></div></div></aside>
  </div></div>
  <div class="wrap strip"><div class="in"><span class="ic">${IC.coin}</span><span>${esc(t('stripTx', s.coin_percent || 10))}</span><span class="sp"></span><button data-a="coins">${t('more')}</button></div></div>
  <footer><div class="wrap">
    <div class="cols">
      <div><h4>${esc(brand())}</h4>${s.about_text ? `<button data-a="about">${t('about')}</button>` : ''}<button data-a="zones">${t('ourBranches')}</button><button data-a="legal">${t('legal')}</button><a href="/?m=1">${t('mobile')}</a></div>
      <div><h4>${t('help')}</h4><button data-a="zones">${t('zones')}</button><button data-a="coins">WendyCoin</button>${St.menu.promos.length ? `<button data-a="promos">${t('promos')}</button>` : ''}</div>
      <div><h4>${t('contacts')}</h4>${s.support_phone ? `<a href="tel:${esc(s.support_phone.replace(/[^+\d]/g, ''))}">${esc(s.support_phone)}</a>` : ''}${s.support_email ? `<a href="mailto:${esc(s.support_email)}">${esc(s.support_email)}</a>` : ''}</div>
      <div class="stores">${storeBadges(false)}</div>
    </div>
    <div class="stats"><div><b>${num(st.orders_month || 0)}</b><span>${t('ordersMonth', st.orders_month || 0)}</span></div><div><b>${num(st.branches ?? branches().length)} ${t('restaurants', st.branches ?? branches().length)}</b><span>${esc(city)}</span></div>${st.rating ? `<div><b>★ ${st.rating.toFixed(2)}</b><span>${t('rating')} · ${num(st.reviews)}</span></div>` : ''}</div>
    <div class="bottom"><span class="brand">${esc(brand())}</span><span>© ${new Date().getFullYear()}</span><button data-a="legal">${t('legal')}</button><span class="sp"></span>
      ${[['instagram_url', IC.ig, 'Instagram'], ['telegram_url', IC.tg, 'Telegram'], ['facebook_url', IC.fb, 'Facebook']].filter(([k]) => s[k]).map(([k, i, n]) => `<a class="soc" href="${esc(s[k])}" target="_blank" rel="noopener" aria-label="${n}">${i}</a>`).join('')}</div>
  </div></footer>`;
  renderHead(); renderCartBtns(); thumbMap(); spy();
}
function storeBadges(compact) {
  const s = St.menu.settings;
  const b = (url, icon, small, big) => (url ? `<a class="store" href="${esc(url)}" target="_blank" rel="noopener">${icon}<span><small>${small}</small>${big}</span></a>` : `<span class="store soon">${icon}<span><small>${t('soon')}</small>${big}</span></span>`);
  if (compact && !s.app_store_url && !s.google_play_url) return '';
  return b(s.app_store_url, IC.apple, t('download'), 'App Store') + b(s.google_play_url, IC.play, t('getOn'), 'Google Play');
}
function card(p) {
  return `<div class="prod" data-a="prod" data-id="${p.id}"><div class="ph">${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}${img(p)}</div>
    <h3>${esc(loc(p, 'name'))}</h3><p>${esc(loc(p, 'description'))}</p><span class="sp"></span>
    ${p.old_price > p.price ? `<div class="old">${money(p.old_price)}</div>` : ''}${buyHTML(p)}</div>`;
}
function buyHTML(p) {
  const q = qty(p.id);
  return q ? `<div class="stepper" data-buy="${p.id}"><button data-a="dec" data-id="${p.id}">−</button><b>${q}</b><button data-a="inc" data-id="${p.id}">+</button></div>`
    : `<button class="buy" data-buy="${p.id}" data-a="inc" data-id="${p.id}">${money(p.price)}</button>`;
}
function renderCartBtns() {
  const { sub, count } = totals();
  const html = `${I.bag(22)}<span>${count ? money(sub) : t('cart')}</span>${count ? `<span class="n">${count}</span>` : ''}`;
  if ($('#cartslot')) $('#cartslot').innerHTML = `<button class="cartbtn" data-a="cart">${html}</button>`;
  if ($('.navcart')) $('.navcart').innerHTML = html;
}
function renderHead() {
  const st = St.menu?.stats || {};
  const a = St.addrs.find(x => x.id === St.addrId);
  const city = branches()[0]?.city || 'Ташкент';
  const time = st.delivery_min ? `${st.delivery_min} ${t('min')}` : `30–45 ${t('min')}`;
  if ($('#addrbtn')) $('#addrbtn').innerHTML = `<span class="ic">${St.mode === 'pickup' ? I.fork(24) : I.walk(24)}</span><span style="min-width:0"><span class="l1">${a ? `<em>${esc(city)},</em><span>${esc(a.address.replace(/^(Ташкент|Toshkent|Tashkent|город Ташкент)\s*,?\s*/i, ''))}</span>` : `<span>${t('pickAddr')}</span>`}${IC.chev}</span><small>${time}${st.rating ? ` · ${st.rating.toFixed(2)} <span class="st">★</span>` : ''}</small></span>`;
  if ($('#userslot')) $('#userslot').innerHTML = St.token ? `<button class="avatar" data-a="profile" aria-label="${t('profile')}"><img src="/img/avatars/${St.user?.avatar > 0 ? St.user.avatar : 9}.png" alt=""></button>` : `<button class="loginbtn" data-a="login">${t('login')}</button>`;
}
function thumbMap() {
  const el = $('#thumbmap'); if (!el || !window.L) return;
  const m = newMap(el, { dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false });
  tiles().addTo(m); setTimeout(() => { m.invalidateSize(); drawZones(m, { weight: 1.5, fill: .25, pad: [10, 10] }); }, 50);
}
function spy() {
  const nav = $('#cats'); if (!nav) return;
  let stuck = null, raf = 0;
  const upd = () => { raf = 0; const s = scrollY > 0 && nav.getBoundingClientRect().top <= 0.5; if (s !== stuck) { stuck = s; nav.classList.toggle('stuck', s); } };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true }); upd();
  const pills = $('.cats .pills');
  const io = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) {
      $$('.cats .pill').forEach(p => p.classList.toggle('on', p.dataset.cat === e.target.dataset.sec));
      const on = $('.cats .pill.on'); if (on) pills.scrollTo({ left: on.offsetLeft - 24, behavior: 'smooth' }); // only the pill row moves, never the page
    }
  }, { rootMargin: '-120px 0px -65% 0px' });
  $$('section.cat').forEach(s => io.observe(s));
}

/* ---------- modals ---------- */
function modal(html, cls = '', onClose) {
  closeModals();
  const o = document.createElement('div'); o.className = 'ov' + (cls.includes('side') ? ' side' : ''); o.innerHTML = html;
  o.addEventListener('mousedown', e => { if (e.target === o) closeModals(); });
  o._close = onClose; $('#modals').appendChild(o); document.body.style.overflow = 'hidden';
  return o;
}
function closeModals() { for (const o of $$('#modals .ov')) { o._close?.(); o.remove(); } document.body.style.overflow = ''; }
const X = `<button class="x" data-a="close" aria-label="close">${IC.x}</button>`;

function openProduct(id) {
  const p = prod(id); if (!p) return;
  const adds = (p.addons || []).map(prod).filter(Boolean);
  const sel = new Set();
  const draw = () => {
    const sum = p.price + [...sel].reduce((n, i) => n + prod(i).price, 0);
    o.querySelector('.md').innerHTML = `${X}<div class="pmd"><div class="big">${p.image ? `<img src="${esc(p.image)}" alt="">` : `<div class="noimg" style="width:80%;aspect-ratio:1;border-radius:50%;background:var(--card);display:grid;place-items:center">${phOf(p)}</div>`}</div>
      <div class="info"><div class="sc"><h2>${esc(loc(p, 'name'))}</h2>${p.old_price > p.price ? `<div class="faint" style="text-decoration:line-through;margin-bottom:6px">${money(p.old_price)}</div>` : ''}<p class="muted" style="line-height:1.5;margin:6px 0 0">${esc(loc(p, 'description'))}</p>
      ${adds.length ? `<h3 style="margin:22px 0 0;font-size:18px">${t('withIt')}</h3><div class="addons">${adds.map(a => `<button class="addon ${sel.has(a.id) ? 'on' : ''}" data-tog="${a.id}">${img(a)}${esc(loc(a, 'name'))}<small>+${money(a.price)}</small></button>`).join('')}</div>` : ''}</div>
      <button class="btn red wide" style="margin-top:18px;height:56px" data-addp>${t('add')} ${money(sum)}</button></div></div>`;
  };
  const o = modal(`<div class="md wide"></div>`); draw();
  o.addEventListener('click', e => {
    const tg = e.target.closest('[data-tog]'); if (tg) { const i = Number(tg.dataset.tog); sel.has(i) ? sel.delete(i) : sel.add(i); draw(); }
    if (e.target.closest('[data-addp]')) { setQty(p.id, 1); sel.forEach(i => setQty(i, 1)); closeModals(); toast(`${loc(p, 'name')} — ${LANG === 'uz' ? 'savatga qo‘shildi' : 'в корзине'}`); }
  });
}

function openCart(keep) {
  const items = cartItems(); const { sub, discount } = totals();
  const body = items.length ? items.map(c => { const p = prod(c.id); return `<div class="ci">${img(p)}<span><b>${esc(loc(p, 'name'))}</b><small>${money(p.price * c.qty)}</small></span><div class="stepper"><button data-a="dec" data-id="${p.id}">−</button><b>${c.qty}</b><button data-a="inc" data-id="${p.id}">+</button></div></div>`; }).join('')
    : `<div class="empty"><div class="emptyic">${I.bag(64, '#6f6f78')}</div><b>${t('emptyCart')}</b>${t('emptyCartTx')}</div>`;
  const html = `<div class="drawer" id="drawer"><div class="hd"><h2>${t('cart')}</h2>${X.replace('class="x"', 'class="x" style="position:static;background:var(--card)"')}</div><div class="bd">${body}</div>
    ${items.length ? `<div class="ft"><div class="row"><span class="muted">${t('items')}</span><span>${money(sub)}</span></div>${discount ? `<div class="row"><span class="muted">${t('discount')}</span><span>−${money(discount)}</span></div>` : ''}<div class="row tot"><span>${t('total')}</span><span>${money(sub - discount)}</span></div><button class="btn red wide" style="margin-top:14px;height:58px;font-size:18px" data-a="checkout">${t('checkout')}</button></div>` : ''}</div>`;
  if (keep && $('#drawer')) { $('#drawer').outerHTML = html; return; }
  modal(html, 'side');
}

/* login: phone -> Telegram code -> name */
function openLogin(next) {
  let phone = '', timer = null;
  const o = modal(`<div class="md"></div>`, '', () => clearInterval(timer));
  const md = o.querySelector('.md');
  const stepPhone = (err = '') => {
    md.innerHTML = `${X}<h2>${t('phoneT')}</h2><p class="muted" style="margin:0 0 18px">${t('phoneSub')}</p><div class="phone"><span>+998</span><input id="ph" inputmode="numeric" autocomplete="tel-national" maxlength="12" placeholder="90 123 45 67" value="${esc(phone)}"></div><div class="err">${esc(err)}</div><button class="btn red wide" id="go">${t('getCode')}</button>`;
    const inp = $('#ph', md); inp.focus();
    inp.addEventListener('input', () => { const d = inp.value.replace(/\D/g, '').slice(0, 9); inp.value = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' '); });
    const go = async () => {
      phone = inp.value; const d = phone.replace(/\D/g, '');
      if (d.length !== 9) return stepPhone(LANG === 'uz' ? 'Raqamning 9 ta raqamini kiriting' : 'Введите 9 цифр номера');
      $('#go', md).disabled = true;
      try { const r = await api('/auth/request', { body: { phone: '+998' + d } }); stepCode(r.resend_in || 60); } catch (e) { if (e.status === 429 && e.data?.resend_in) stepCode(e.data.resend_in); else stepPhone(e.message); }
    };
    $('#go', md).onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
  };
  const stepCode = (wait, err = '') => {
    const d = phone.replace(/\D/g, '');
    md.innerHTML = `${X}<h2>${t('codeT')}</h2><p class="muted" style="margin:0">${t('codeSent', '+998 ' + phone)}</p><div class="code">${[0, 1, 2, 3].map(i => `<input inputmode="numeric" maxlength="1" data-i="${i}" autocomplete="${i ? 'off' : 'one-time-code'}">`).join('')}</div><div class="err" style="text-align:center">${esc(err)}</div>
      <button class="btn wide" id="rs" disabled></button><button class="btn wide" style="margin-top:8px;background:none" id="chg">${t('change')}</button>`;
    const ins = $$('.code input', md); ins[0].focus();
    let left = wait; const tick = () => { const b = $('#rs', md); if (!b) return; b.disabled = left > 0; b.textContent = left > 0 ? t('resendIn', left) : t('resend'); left--; };
    clearInterval(timer); tick(); timer = setInterval(tick, 1000);
    $('#rs', md).onclick = async () => { try { const r = await api('/auth/request', { body: { phone: '+998' + d } }); stepCode(r.resend_in || 60); } catch (e) { stepCode(e.data?.resend_in || 30, e.message); } };
    $('#chg', md).onclick = () => { clearInterval(timer); stepPhone(); };
    const verify = async () => {
      const code = ins.map(i => i.value).join(''); if (code.length < 4) return;
      try {
        const r = await api('/auth/verify', { body: { phone: '+998' + d, code } });
        clearInterval(timer); St.token = r.token; St.user = r.user; LS.set('token', r.token); await loadUser();
        if (r.isNew || !r.user.name) stepName(); else { closeModals(); renderHead(); next?.(); }
      } catch (e) { ins.forEach(i => { i.value = ''; }); ins[0].focus(); md.querySelector('.err').textContent = e.message; }
    };
    ins.forEach((inp, i) => {
      inp.addEventListener('input', () => { const v = inp.value.replace(/\D/g, ''); if (v.length > 1) { v.split('').slice(0, 4).forEach((ch, k) => { if (ins[k]) ins[k].value = ch; }); verify(); return; } inp.value = v; if (v && ins[i + 1]) ins[i + 1].focus(); if (ins.every(x => x.value)) verify(); });
      inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !inp.value && ins[i - 1]) ins[i - 1].focus(); });
    });
  };
  const stepName = () => {
    md.innerHTML = `<h2>${t('nameT')}</h2><label class="f"><span>${t('name')}</span><input class="inp" id="nm" maxlength="40"></label><div class="err"></div><button class="btn red wide" id="sv">${t('save')}</button><button class="btn wide" style="margin-top:8px;background:none" id="sk">${t('skip')}</button>`;
    $('#nm', md).focus();
    const done = () => { closeModals(); renderHead(); next?.(); };
    $('#sv', md).onclick = async () => { const name = $('#nm', md).value.trim(); if (!name) return; try { St.user = (await api('/me', { method: 'PUT', body: { name } })).user; done(); } catch (e) { md.querySelector('.err').textContent = e.message; } };
    $('#sk', md).onclick = done;
  };
  stepPhone();
}
const needLogin = fn => (St.token ? fn() : openLogin(fn));

/* address picker: map with delivery zones, pin in the centre, quote for the point */
function openAddress(next) {
  needLogin(async () => {
    const o = modal(`<div class="md map"><div class="amd"><div class="mapbox"><div class="lm" id="amap"></div>${IC.pin}</div>
      <div class="side"><h2>${t('addrT')}</h2>
      ${St.addrs.length ? `<div class="muted" style="font-size:14px;margin-top:10px">${t('myAddrs')}</div>${St.addrs.map(a => `<button class="opt ${a.id === St.addrId ? 'on' : ''}" data-pick="${a.id}"><span class="rd"></span><span class="t">${esc(a.address)}<small>${[a.apartment && t('apt') + ' ' + a.apartment, a.floor && t('floor') + ' ' + a.floor].filter(Boolean).map(esc).join(', ')}</small></span></button>`).join('')}<div class="muted" style="font-size:14px;margin-top:22px">${t('newAddr').replace('+ ', '')}</div>` : ''}
      <p class="muted" style="font-size:14px;margin:6px 0 0">${t('moveMap')}</p>
      <label class="f"><span>${t('addr')}</span><input class="inp" id="aa" maxlength="200"></label>
      <div class="g4"><label class="f"><span>${t('entrance')}</span><input class="inp" id="ae" maxlength="10"></label><label class="f"><span>${t('floor')}</span><input class="inp" id="af" maxlength="10"></label><label class="f"><span>${t('apt')}</span><input class="inp" id="ap" maxlength="10"></label><label class="f"><span>${t('intercom')}</span><input class="inp" id="ai" maxlength="10"></label></div>
      <label class="f"><span>${t('comment')}</span><input class="inp" id="ac" maxlength="100"></label>
      <div class="note" id="aq">${t('checking')}</div>
      <button class="btn red wide" style="margin-top:14px" id="as" disabled>${t('saveAddr')}</button></div></div>${X}</div>`, '', () => map.remove());
    const map = newMap($('#amap', o), { zoomControl: true }); tiles().addTo(map);
    o.querySelector('.mapbox').classList.add('dark-tiles');
    drawZones(map, { fill: .12, weight: 2 });
    const cur = St.addrs.find(a => a.id === St.addrId);
    if (cur) map.setView([cur.lat, cur.lng], 16); else if (!St.zones.length) map.setView([41.3111, 69.2797], 12);
    let seq = 0, ok = false;
    const check = async () => {
      const c = map.getCenter(), my = ++seq; ok = false; $('#as', o).disabled = true; $('#aq', o).className = 'note'; $('#aq', o).textContent = t('checking');
      const items = cartItems().map(x => x.id);
      const [rv, q] = await Promise.all([api(`/reverse?lat=${c.lat}&lng=${c.lng}`).catch(() => ({})), api('/delivery/quote', { body: { lat: c.lat, lng: c.lng, items, subtotal: totals().sub } }).catch(e => ({ ok: false, message: e.message }))]);
      if (my !== seq) return;
      if (rv.address && !$('#aa', o).dataset.touched) $('#aa', o).value = rv.address;
      ok = !!q.ok; $('#as', o).disabled = !ok;
      $('#aq', o).className = 'note ' + (ok ? 'ok' : 'bad');
      $('#aq', o).textContent = ok ? t('delivers', q.branch.name, q.distance_km) : srv(q.message) || t('outZone');
    };
    let deb; map.on('moveend', () => { clearTimeout(deb); deb = setTimeout(check, 350); }); setTimeout(() => { map.invalidateSize(); check(); }, 60);
    $('#aa', o).addEventListener('input', e => { e.target.dataset.touched = 1; });
    o.addEventListener('click', e => { const p = e.target.closest('[data-pick]'); if (p) { St.addrId = Number(p.dataset.pick); LS.set('addrId', St.addrId); St.quote = null; closeModals(); renderHead(); next?.(); } });
    $('#as', o).onclick = async () => {
      if (!ok) return; const c = map.getCenter(); const v = id => $(id, o).value.trim();
      if (!v('#aa')) { $('#aa', o).focus(); return; }
      try {
        const r = await api('/addresses', { body: { address: v('#aa'), lat: c.lat, lng: c.lng, entrance: v('#ae'), floor: v('#af'), apartment: v('#ap'), intercom: v('#ai'), comment: v('#ac'), label: 'other' } });
        St.addrs.unshift(r.address); St.addrId = r.address.id; LS.set('addrId', St.addrId); St.quote = null; closeModals(); renderHead(); next?.();
      } catch (e) { $('#aq', o).className = 'note bad'; $('#aq', o).textContent = e.message; }
    };
  });
}

/* checkout */
async function quote() {
  const a = St.addrs.find(x => x.id === St.addrId); if (!a) { St.quote = null; return; }
  try { St.quote = await api('/delivery/quote', { body: { lat: a.lat, lng: a.lng, items: cartItems().map(c => c.id), subtotal: Math.max(0, totals().sub - totals().discount) } }); } catch (e) { St.quote = { ok: false, message: e.message }; }
}
function openCheckout() {
  if (!cartItems().length) return;
  needLogin(async () => {
    if (St.mode === 'delivery' && !St.quote) await quote();
    const o = modal(`<div class="md" style="max-width:560px"></div>`); const md = o.querySelector('.md');
    const draw = (err = '') => {
      const del = St.mode === 'delivery'; const { sub, discount } = totals(); const a = St.addrs.find(x => x.id === St.addrId);
      const q = St.quote; const fee = del && q?.ok ? q.fee : 0; const minO = del && q?.ok ? q.min_order : 0;
      const open = branches().filter(b => b.open_now);
      if (!del && !branches().some(b => b.id === St.branchId)) St.branchId = open[0]?.id || null;
      let block = '';
      if (del && !a) block = t('needAddr'); else if (del && q && !q.ok) block = srv(q.message); else if (del && minO && sub < minO) block = t('minFor', money(minO)); else if (!del && !St.branchId) block = t('needBranch');
      md.innerHTML = `${X}<h2>${t('checkout')}</h2>
        <div class="seg"><button class="${del ? 'on' : ''}" data-m="delivery">${I.walk(22)}${t('delivery')}</button><button class="${del ? '' : 'on'}" data-m="pickup">${I.fork(22, del ? '#fff' : '#111')}${t('pickup')}</button></div>
        ${del ? `<button class="opt on" data-a="addr2"><span class="t">${a ? esc(a.address) : t('pickAddr')}<small>${a ? [a.apartment && t('apt') + ' ' + a.apartment, a.floor && t('floor') + ' ' + a.floor, q?.ok && t('delivers', q.branch.name, q.distance_km)].filter(Boolean).map(esc).join(' · ') : ''}</small></span>${IC.chev}</button>`
        : branches().map(b => `<button class="opt ${b.id === St.branchId ? 'on' : ''}" data-br="${b.id}" ${b.open_now ? '' : 'disabled style="opacity:.5"'}><span class="rd"></span><span class="t">${esc(b.name || b.address)}<small>${esc(b.address)} · ${esc(b.open_time)}–${esc(b.close_time)}${b.open_now ? '' : ' · ' + t('closed')}</small></span></button>`).join('')}
        ${del ? '' : `<div class="meths">${[['tray', t('tray')], ['takeaway', t('takeaway')], ['table', t('table')]].map(([k, n]) => `<button class="meth ${St.pickupMethod === k ? 'on' : ''}" data-meth="${k}">${ILL[k]}<span>${n}</span></button>`).join('')}</div>`}
        <div class="muted" style="font-size:14px;margin:18px 0 0 4px">${t('pay')}</div>
        <div class="pays" style="margin-top:8px">${[['cash', t('cash'), I.cash(24)], ['click', '', I.click(30)], ['payme', '', I.payme(30)]].map(([k, n, ic]) => `<button class="opt ${St.pay === k ? 'on' : ''}" data-pay="${k}">${ic}${n}</button>`).join('')}</div>
        ${St.pay !== 'cash' ? `<div class="faint" style="font-size:13px;margin:8px 4px 0">${t('payNote')}</div>` : ''}
        <div class="g2" style="grid-template-columns:1fr auto;align-items:end"><label class="f"><span>${t('promo')}</span><input class="inp" id="pc" value="${esc(St.promo?.code || '')}" maxlength="30"></label><button class="btn" style="margin-top:14px" data-a="promo">${t('apply')}</button></div>
        <label class="f"><span>${t('comment')}</span><input class="inp" id="cm" maxlength="200"></label>
        <div style="margin-top:18px"><div class="row"><span class="muted">${t('items')}</span><span>${money(sub)}</span></div>${discount ? `<div class="row"><span class="muted">${t('discount')} ${esc(St.promo.code)}</span><span>−${money(discount)}</span></div>` : ''}${del ? `<div class="row"><span class="muted">${t('delivery')}</span><span>${q?.ok ? (fee ? money(fee) : t('freeDel')) : '—'}</span></div>` : ''}<div class="row tot"><span>${t('total')}</span><span>${money(sub - discount + fee)}</span></div></div>
        ${block ? `<div class="note bad">${esc(block)}</div>` : ''}<div class="err">${esc(err)}</div>
        <button class="btn red wide" style="height:58px;font-size:18px" id="place" ${block ? 'disabled' : ''}>${t('place')} · ${money(sub - discount + fee)}</button>`;
    };
    draw();
    md.addEventListener('click', async e => {
      const m = e.target.closest('[data-m]'); if (m) { St.mode = m.dataset.m; LS.set('mode', St.mode); if (St.mode === 'delivery' && !St.quote) await quote(); return draw(); }
      const br = e.target.closest('[data-br]'); if (br) { St.branchId = Number(br.dataset.br); LS.set('branchId', St.branchId); return draw(); }
      const py = e.target.closest('[data-pay]'); if (py) { St.pay = py.dataset.pay; return draw(); }
      const me = e.target.closest('[data-meth]'); if (me) { St.pickupMethod = me.dataset.meth; return draw(); }
      if (e.target.closest('[data-a=addr2]')) return openAddress(openCheckout);
      if (e.target.closest('[data-a=promo]')) {
        const code = $('#pc', md).value.trim(); if (!code) { St.promo = null; return draw(); }
        try { St.promo = await api('/promo/check', { body: { code, subtotal: totals().sub } }); St.quote = null; if (St.mode === 'delivery') await quote(); draw(); } catch (er) { St.promo = null; draw(er.message); }
        return;
      }
      if (e.target.closest('#place')) {
        const del = St.mode === 'delivery'; const btn = $('#place', md); btn.disabled = true;
        const body = { type: del ? 'delivery' : 'pickup', items: cartItems().map(c => ({ product_id: c.id, qty: c.qty })), promo: St.promo?.code || '', payment: St.pay, comment: $('#cm', md).value.trim() };
        if (del) body.address_id = St.addrId; else { body.branch_id = St.branchId; body.pickup_time = 'asap'; body.pickup_method = St.pickupMethod; }
        try {
          const r = await api('/orders', { body });
          St.cart = St.cart.filter(c => c.coin); St.promo = null; St.quote = null; LS.set('cart', St.cart); refreshCart();
          md.innerHTML = `${X}<div style="text-align:center;padding:10px 0"><div class="okic">${I.check(56)}</div><h2>${t('okT')}</h2><p class="muted">${t('okTx', r.order.id)}</p><div style="display:flex;gap:10px;justify-content:center;margin-top:18px">${del ? `<button class="btn red" data-track="${r.order.id}">${t('track')}</button>` : ''}<button class="btn" data-a="close">${t('close')}</button></div></div>`;
        } catch (er) { draw(er.message); }
      }
    });
  });
}

/* profile + orders + live tracking */
async function loadUser() {
  if (!St.token) return;
  try {
    const [me, ad] = await Promise.all([api('/me'), api('/addresses')]);
    St.user = me.user; St.addrs = ad.addresses;
    if (!St.addrs.some(a => a.id === St.addrId)) { St.addrId = St.addrs[0]?.id || null; LS.set('addrId', St.addrId); }
  } catch { /* logged out */ }
}
async function openProfile() {
  const o = modal(`<div class="md" style="max-width:560px"><div class="skel" style="height:300px"></div></div>`); const md = o.querySelector('.md');
  try { St.orders = (await api('/orders')).orders; } catch { St.orders = []; }
  const u = St.user || {};
  md.innerHTML = `${X}<div style="display:flex;gap:16px;align-items:center"><div class="avatar" style="width:72px;height:72px"><img src="/img/avatars/${u.avatar > 0 ? u.avatar : 9}.png" alt=""></div><div><h2 style="margin:0">${esc(u.name || t('profile'))}</h2><div class="muted">${esc(u.phone || '')}</div></div></div>
    <div class="note" style="display:flex;justify-content:space-between;align-items:center;margin-top:18px"><span>${t('balance')}</span><b style="font-size:22px">${num(u.coins || 0)} WendyCoin</b></div>
    <h3 style="margin:24px 0 4px">${t('orders')}</h3>${St.orders.length ? St.orders.slice(0, 12).map(ord => `<div class="order"><div class="top"><span>№${ord.id} · ${money(ord.total)}</span><span class="st ${ord.status}">${ST_NAMES[ord.status]?.[LANG === 'uz' ? 1 : 0] || ord.status}</span></div><div class="faint" style="font-size:13px;margin-top:6px">${esc(ord.created_at)} · ${ord.items.map(i => esc(loc(prod(i.product_id), 'name') || i.name) + ' × ' + i.qty).join(', ')}</div>${ord.type === 'delivery' && ['new', 'cooking', 'ready', 'delivering'].includes(ord.status) ? `<button class="btn red" style="height:40px;margin-top:10px" data-track="${ord.id}">${t('track')}</button>` : ''}</div>`).join('') : `<div class="empty" style="padding:24px">${t('noOrders')}</div>`}
    <button class="btn wide" style="margin-top:20px" data-a="logout">${t('logout')}</button>`;
}
function openTrack(id) {
  let timer, map, mk = {}, line;
  const o = modal(`<div class="md map"><div class="mapbox dark-tiles" style="height:560px"><div class="lm" id="tmap"></div></div><div style="padding:18px 24px" id="tinfo"><div class="skel" style="height:40px"></div></div>${X}</div>`, '', () => { clearInterval(timer); map?.remove(); });
  map = newMap($('#tmap', o), { zoomControl: true }); tiles().addTo(map); drawZones(map, { fill: .06, weight: 1.5 });
  const cIcon = L.divIcon({ className: '', html: '<img src="/img/courier.png" style="width:46px" alt="">', iconSize: [46, 46], iconAnchor: [23, 23] });
  const dIcon = L.divIcon({ className: '', html: IC.pin.replace('class="pinc"', 'style="width:36px;height:44px"'), iconSize: [36, 44], iconAnchor: [18, 44] });
  let fitted = false;
  const upd = async () => {
    let r; try { r = await api(`/orders/${id}/track`); } catch { return; }
    const pts = [];
    if (r.dest) { pts.push([r.dest.lat, r.dest.lng]); mk.d = mk.d || L.marker([r.dest.lat, r.dest.lng], { icon: dIcon }).addTo(map); }
    if (r.courier?.lat) { const ll = [r.courier.lat, r.courier.lng]; pts.push(ll); if (mk.c) mk.c.setLatLng(ll); else mk.c = L.marker(ll, { icon: cIcon }).addTo(map); }
    else if (r.branch) pts.push([r.branch.lat, r.branch.lng]);
    if (line) map.removeLayer(line);
    if (pts.length === 2) line = L.polyline(pts, { color: '#e2203d', weight: 5, dashArray: '10 12' }).addTo(map);
    if (!fitted && pts.length) { map.fitBounds(pts, { padding: [70, 70], maxZoom: 16 }); fitted = true; }
    $('#tinfo', o).innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:20px">№${r.id} · ${ST_NAMES[r.status]?.[LANG === 'uz' ? 1 : 0] || r.status}</b>${r.courier ? `<span class="muted">${t('courier')}: ${esc(r.courier.name || '')}</span>` : ''}</div>${r.dest ? `<div class="muted" style="margin-top:4px">${esc(r.dest.address)}</div>` : ''}`;
    if (['done', 'cancelled'].includes(r.status)) clearInterval(timer);
  };
  setTimeout(() => { map.invalidateSize(); upd(); }, 60); timer = setInterval(upd, 5000);
}

/* delivery zones map (all zones + restaurants, grouped when zoomed out) */
function openZones() {
  let map;
  const o = modal(`<div class="md map"><div class="mapbox dark-tiles" style="height:min(78vh,700px)"><div class="lm" id="zmapw"></div>
    ${St.zones.length ? `<div class="zlegend"><h4>${t('zones')}</h4>${St.zones.map(z => `<div class="z"><i style="background:${esc(z.color)}"></i><span>${esc(z.name)}<small>${t('zoneBranches')}: ${z.branch_ids.map(id => esc(branches().find(b => b.id === id)?.name || '')).filter(Boolean).join(', ') || '—'}</small></span></div>`).join('')}</div>` : ''}</div>${X}</div>`, '', () => map?.remove());
  map = newMap($('#zmapw', o), { zoomControl: true }); tiles().addTo(map);
  map.zoomControl.setPosition('bottomright');
  const grp = L.markerClusterGroup ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 60, iconCreateFunction: c => L.divIcon({ className: '', html: `<div class="zcl">${c.getChildCount()}</div>`, iconSize: [52, 52] }) }) : L.layerGroup();
  for (const b of branches()) grp.addLayer(L.marker([b.lat, b.lng], { icon: logoIcon() }).bindPopup(`<b>${esc(b.name || b.address)}</b><br>${esc(b.address)}<br>${esc(b.open_time)}–${esc(b.close_time)}${b.phone ? '<br>' + esc(b.phone) : ''}`));
  setTimeout(() => {
    map.invalidateSize(); const zl = drawZones(map, { fill: .32, weight: 2.5 }); grp.addTo(map);
    zl.forEach((l, i) => l.bindTooltip(esc(St.zones[i].name), { sticky: true }));
  }, 60);
}

function openBanner(id) {
  const b = St.menu.banners.find(x => x.id === id); if (!b) return;
  const link = /^https?:\/\//i.test(b.link || '') ? b.link : '';
  modal(`<div class="md" style="max-width:520px;padding:0;overflow:hidden">${X}${b.image ? `<img src="${esc(b.image)}" alt="" style="width:100%;max-height:70vh;object-fit:contain;background:#000">` : `<div style="height:260px;background:${esc(b.color)};display:grid;place-items:center;font-size:30px;font-weight:800">${esc(loc(b, 'title'))}</div>`}
    <div style="padding:20px 24px 24px"><h2>${esc(loc(b, 'title'))}</h2>${link ? `<a class="btn red wide" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${t('more')}</a>` : ''}</div></div>`);
}
function openPromos() {
  modal(`<div class="md">${X}<h2>${t('promos')}</h2>${St.menu.promos.map(p => `<div class="order"><div class="faint" style="font-size:12px;font-weight:700;text-transform:uppercase">${esc(loc(p, 'info'))}</div><div style="font-size:20px;font-weight:800;margin-top:4px">${esc(loc(p, 'title'))}</div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px"><span class="st">${t('promo')}: <b>${esc(p.code)}</b></span>${p.valid_until ? `<span class="faint" style="font-size:13px">${LANG === 'uz' ? 'gacha' : 'до'} ${esc(p.valid_until)}</span>` : ''}</div></div>`).join('')}</div>`);
}
function openCoins() {
  const p = St.menu.settings.coin_percent || 10;
  modal(`<div class="md">${X}<div style="width:64px;height:64px;border-radius:50%;background:var(--red);display:grid;place-items:center;margin-bottom:14px">${IC.coin}</div><h2>${t('coinsT')}</h2><p class="muted" style="line-height:1.5">${esc(t('coinsTx', p))}</p>
    ${St.token ? `<div class="note" style="display:flex;justify-content:space-between"><span>${t('balance')}</span><b>${num(St.user?.coins || 0)}</b></div>` : `<button class="btn red wide" style="margin-top:10px" data-a="login">${t('login')}</button>`}</div>`);
}
const openText = (title, text) => modal(`<div class="md">${X}<h2>${esc(title)}</h2><p class="muted" style="line-height:1.6;white-space:pre-line">${esc(text)}</p></div>`);

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const tr = e.target.closest('[data-track]'); if (tr) return openTrack(Number(tr.dataset.track));
  const el = e.target.closest('[data-a]'); if (!el) { $('#langdd')?.classList.remove('open'); return; }
  const a = el.dataset.a, id = Number(el.dataset.id);
  if (a !== 'langdd') $('#langdd')?.classList.remove('open');
  if (['inc', 'dec'].includes(a)) { e.stopPropagation(); setQty(id, a === 'inc' ? 1 : -1); return; }
  ({
    prod: () => openProduct(id), cart: () => openCart(), close: closeModals, checkout: openCheckout, addr: () => openAddress(), login: () => openLogin(),
    profile: openProfile, zones: openZones, banner: () => openBanner(id), promos: openPromos, coins: openCoins,
    about: () => openText(t('about'), St.menu.settings.about_text), legal: () => openText(t('legal'), t('legalTx')),
    top: () => { e.preventDefault(); scrollTo({ top: 0 }); },
    search: () => { $('#cats').classList.add('searching'); $('#sinp').focus(); },
    sclose: () => { $('#sinp').value = ''; filter(''); $('#cats').classList.remove('searching'); },
    langdd: () => el.parentElement.classList.toggle('open'),
    lang: () => { try { localStorage.setItem('lang', el.dataset.v); } catch { /* ignore */ } location.reload(); },
    logout: async () => { try { await api('/logout', { method: 'POST' }); } catch { /* already out */ } St.token = null; St.user = null; St.addrs = []; St.addrId = null; LS.del('token'); LS.del('addrId'); closeModals(); renderHead(); },
  })[a]?.();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });
document.addEventListener('input', e => { if (e.target.id === 'sinp') filter(e.target.value); });
function filter(q) {
  q = q.trim().toLowerCase(); let any = false;
  for (const s of $$('section.cat')) {
    let n = 0;
    for (const c of $$('.prod', s)) { const p = prod(Number(c.dataset.id)); const hit = !q || [p.name, p.name_uz, p.description, p.description_uz].some(v => (v || '').toLowerCase().includes(q)); c.hidden = !hit; n += hit; }
    s.hidden = !n; any = any || n > 0;
  }
  $$('.popular, .popular + h2, h2.popular-h').forEach(x => { x.hidden = !!q; });
  $('#nofound').hidden = any; if (q) $('#cats').scrollIntoView({ block: 'start' });
}

(async function boot() {
  $('#site').innerHTML = '<div class="wrap" style="padding-top:150px"><div class="skel" style="height:240px"></div><div class="skel" style="height:420px;margin-top:20px"></div></div>';
  try {
    const [menu, z] = await Promise.all([api('/menu'), api('/zones').catch(() => ({ zones: [] }))]);
    St.menu = menu; St.zones = z.zones;
    document.body.classList.toggle('shape-circle', menu.settings.product_image_shape === 'circle'); // admin: round or square product photos
    St.cart = St.cart.filter(c => prod(c.id)); LS.set('cart', St.cart);
    await loadUser(); render();
  } catch (e) { $('#site').innerHTML = `<div class="empty" style="padding-top:160px"><b>${t('netErr')}</b>${esc(e.message)}</div>`; }
})();
