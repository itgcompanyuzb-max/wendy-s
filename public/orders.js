/* Order screen extras: the tracking card (time window, stage, buttons), order details, contact with the courier
   (call + chat), the legal documents (offer, privacy, WendyCoin rules) and the customer's consent to them. */
const TERMS_VER = '2026-11-27';
const uzL = () => window.LANG === 'uz';
const tr2 = (ru, uz) => (uzL() ? uz : ru);
const OXI = {
  phone: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/></svg>',
  chat: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/></svg>',
  courier: '<img class="oxi" src="/img/ic-courier.png" alt="" width="30" height="30">',
  pin: '<img class="oxi" src="/img/ic-pin.png" alt="" width="30" height="30">',
  list: '<img class="oxi" src="/img/ic-list.png" alt="" width="30" height="30">',
  chef: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14a4 4 0 1 1 2-7.5A4 4 0 0 1 17 7a4 4 0 0 1 0 7z"/><path d="M8 14v5h8v-5"/></svg>',
  bag: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  wait: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  done: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  doc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/></svg>',
};

/* ---------- time window: when the order should arrive ---------- */
const utc = s => (s ? new Date(String(s).replace(' ', 'T') + 'Z') : null);
const oxHM = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const round5 = d => new Date(Math.ceil(d.getTime() / 300000) * 300000);
function etaInfo(r) {
  const now = Date.now(), minSince = s => (s ? (now - utc(s).getTime()) / 60000 : 0);
  const kmTo = (a, b) => (a && b ? km(a.lat, a.lng, b.lat, b.lng) : 3);
  const drive = k => Math.max(5, Math.round(k / 0.35)); // about 21 km/h in the city, as on the map
  let left, stage, sub;
  const c = r.courier, live = !!(c && c.lat != null);
  if (r.status === 'new') { left = 5 + 20 + drive(kmTo(r.branch, r.dest)); stage = 'wait'; sub = tr2('Ресторан скоро подтвердит заказ', 'Restoran tez orada buyurtmani tasdiqlaydi'); }
  else if (r.status === 'cooking') { left = Math.max(5, 20 - minSince(r.accepted_at)) + drive(kmTo(r.branch, r.dest)); stage = 'chef'; sub = tr2('Еду уже готовят — скоро передадим курьеру', 'Taom tayyorlanmoqda — tez orada kuryerga beramiz'); }
  else if (r.status === 'ready') { left = 5 + drive(kmTo(r.branch, r.dest)); stage = 'bag'; sub = tr2('Заказ собран, ждёт курьера', 'Buyurtma tayyor, kuryerni kutmoqda'); }
  else { left = live ? drive(kmTo(c, r.dest)) : drive(kmTo(r.branch, r.dest)); stage = 'courier'; sub = c?.name ? tr2(`Курьер ${c.name} уже едет к вам`, `Kuryer ${c.name} sizga kelmoqda`) : tr2('Курьер уже едет к вам', 'Kuryer sizga kelmoqda'); }
  left = Math.round(left);
  const from = round5(new Date(now + left * 60000)), to = new Date(from.getTime() + 10 * 60000);
  const title = left <= 15 ? tr2(`Ещё ${Math.max(1, left)}–${left + 5} мин`, `Yana ${Math.max(1, left)}–${left + 5} daqiqa`) : tr2(`Доставим к ${oxHM(from)}–${oxHM(to)}`, `${oxHM(from)}–${oxHM(to)} da yetkazamiz`);
  return { title, sub, stage };
}
// the status ring: 4 parts that fill one by one — accepted, ready, on the way, delivered
const RING_STEPS = { new: 0, cooking: 1, ready: 2, delivering: 3, done: 4 };
function stageRing(status, icon, title = '') {
  const done = RING_STEPS[status] ?? 0, C = 2 * Math.PI * 21, part = C / 4, gap = 5;
  const seg = i => `<circle class="${i < done ? 'v' : ''}" cx="24" cy="24" r="21" style="stroke-dasharray:${(part - gap).toFixed(2)} ${(C - part + gap).toFixed(2)};stroke-dashoffset:${(-(i * part) - gap / 2).toFixed(2)}"/>`;
  return `<div class="tc-stage" title="${esc(title)}" aria-label="${done}/4"><svg class="tc-ring" viewBox="0 0 48 48"><circle class="bg" cx="24" cy="24" r="21"/>${[0, 1, 2, 3].map(seg).join('')}</svg>${OXI[icon] || ''}</div>`;
}
// the card under the map
function trackCard(id, r) {
  const e = etaInfo(r), hasC = !!(r.courier && r.status === 'delivering');
  return `<div class="tc-top"><div class="tc-txt"><b>${esc(e.title)}</b><span>${esc(e.sub)}</span></div>
      ${stageRing(r.status, e.stage, e.sub)}</div>
    <div class="tc-acts">
      <button onclick="A.courierContact(${id})" ${hasC ? '' : 'disabled'}><i>${OXI.courier}${r.unread ? `<em>${r.unread}</em>` : ''}</i><span>${tr2('Курьер', 'Kuryer')}</span></button>
      <button onclick="A.addrInfo(${id})"><i>${OXI.pin}</i><span>${tr2('Адрес', 'Manzil')}</span></button>
      <button onclick="A.orderInfo(${id})"><i>${OXI.list}</i><span>${tr2('Детали заказа', 'Buyurtma tafsilotlari')}</span></button>
    </div>`;
}

/* ---------- "Мои заказы": the active order opens straight on the tracking screen ---------- */
A.myOrders = () => {
  const act = (St.orders || []).find(o => ACTIVE.includes(o.status));
  if (!act) return A.profile();
  if (act.type === 'delivery') A.track(act.id); else A.orderInfo(act.id);
};

async function orderById(id) {
  let o = (St.orders || []).find(x => x.id === Number(id));
  if (!o || !o.items?.length) { try { St.orders = (await api('/orders')).orders; o = St.orders.find(x => x.id === Number(id)); } catch { /* offline */ } }
  return o;
}
const PAY_NAMES = { card: ['Картой', 'Karta bilan'], cash: ['Наличными', 'Naqd pul'], click: ['Click', 'Click'], payme: ['Payme', 'Payme'], coins: ['WendyCoin', 'WendyCoin'] };

/* ---------- order details ---------- */
A.orderInfo = async id => {
  const o = await orderById(id);
  if (!o) return toast(tr2('Заказ не найден', 'Buyurtma topilmadi'));
  const del = o.type === 'delivery', active = ACTIVE.includes(o.status);
  const img = i => { const p = prod(i.product_id); return p?.image ? `<img src="${esc(p.image)}" alt="">` : '<span></span>'; };
  const nm = i => esc(prod(i.product_id) ? loc(prod(i.product_id), 'name') : i.name);
  const sub = o.items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
  const row = (k, v, old) => `<div class="od-row"><span>${k}</span><b>${old ? `<s>${old}</s> ` : ''}${v}</b></div>`;
  Sh.open('orderinfo', () => `<div class="sh-head" style="padding:max(14px,env(safe-area-inset-top)) 16px 8px"><button onclick="Sh.close('orderinfo')">${I.x()}</button><b style="font-size:18px">${esc(ST_NAMES[o.status] || o.status)}</b><span style="width:28px"></span></div>
    <div class="body od">
      <div class="od-card">
        <div class="od-status">${stageRing(o.status, { new: 'wait', cooking: 'chef', ready: 'bag', delivering: 'courier', done: 'done' }[o.status] || 'wait')}<div><b>${esc(ST_NAMES[o.status] || o.status)}</b><small>${tr2(`Этап ${RING_STEPS[o.status] ?? 0} из 4`, `${RING_STEPS[o.status] ?? 0}/4 bosqich`)}: ${[tr2('принят', 'qabul qilindi'), tr2('готов', 'tayyor'), del ? tr2('в пути', 'yo‘lda') : tr2('выдаётся', 'berilmoqda'), del ? tr2('доставлен', 'yetkazildi') : tr2('выдан', 'berildi')].map((t, i) => (i < (RING_STEPS[o.status] ?? 0) ? `<em>${t}</em>` : t)).join(' · ')}</small></div></div>
        <div class="od-head"><div><b>${tr2('Заказ', 'Buyurtma')} №${o.id}</b> <button class="od-copy" onclick="A.copyOrderNo(${o.id})" aria-label="copy">${I.copy ? I.copy(18) : '⧉'}</button><small>${esc(clDateFull(o.created_at))}</small></div><b>${money(o.total)}</b></div>
        <div class="od-kv"><small>${del ? tr2('Готовит', 'Tayyorlaydi') : tr2('Забрать в филиале', 'Filialdan olib ketish')}</small><b>${esc(o.branch_name || '')}</b></div>
        <div class="od-kv"><small>${tr2('Телефон для связи', 'Aloqa telefoni')}</small><b>${esc(St.user?.phone || '')}</b></div>
        <div class="od-btns">
          <button onclick="Sh.close('orderinfo');A.support()"><i>${I.support ? I.support(24) : OXI.chat}</i><span>${tr2('Поддержка', 'Yordam')}</span></button>
          ${del && active ? `<button onclick="Sh.close('orderinfo');A.track(${o.id})"><i>${OXI.pin}</i><span>${tr2('На карте', 'Xaritada')}</span></button>` : ''}
          ${del && o.status === 'delivering' ? `<button onclick="A.courierContact(${o.id})"><i>${OXI.courier}</i><span>${tr2('Курьер', 'Kuryer')}</span></button>` : ''}
        </div>
      </div>
      <div class="od-card"><h3>${tr2('Состав заказа', 'Buyurtma tarkibi')}</h3>
        ${o.items.map(i => `<div class="od-it">${img(i)}<div><b>${nm(i)}</b><small>${i.qty} ${tr2('шт', 'dona')}</small></div><div class="od-pr"><b>${i.coin_price ? `${i.coin_price * i.qty} WendyCoin` : money(i.price * i.qty)}</b>${i.qty > 1 && !i.coin_price ? `<small>${money(i.price)} / ${tr2('шт', 'dona')}</small>` : ''}</div></div>`).join('')}
      </div>
      <div class="od-card"><h3>${del ? tr2('Доставка и оплата', 'Yetkazish va to‘lov') : tr2('Оплата', 'To‘lov')}</h3>
        ${row(tr2('Стоимость блюд', 'Taomlar narxi'), money(sub - (o.discount || 0)), o.discount ? money(sub) : '')}
        ${o.promo ? row(tr2('Промокод', 'Promokod'), esc(o.promo)) : ''}
        ${del ? row(tr2('Доставка', 'Yetkazib berish') + (o.address?.address ? `<small>${esc(o.address.address)}</small>` : ''), o.delivery_fee ? money(o.delivery_fee) : tr2('Бесплатно', 'Bepul')) : ''}
        ${o.coins_spent ? row('WendyCoin', `−${o.coins_spent}`) : ''}
        ${row(tr2('Способ оплаты', 'To‘lov usuli'), (PAY_NAMES[o.payment] || [o.payment, o.payment])[uzL() ? 1 : 0])}
        <div class="od-total"><span>${tr2('Итого', 'Jami')}</span><b>${money(o.total)}</b></div>
        ${o.status === 'done' && o.coins ? `<p class="gray-t" style="margin:8px 0 0">+${o.coins} WendyCoin ${tr2('за этот заказ', 'shu buyurtma uchun')}</p>` : ''}
        ${o.status === 'done' && !o.stars ? `<button class="btn" style="margin-top:14px" onclick="Sh.close('orderinfo');A.rate(${o.id})">★ ${tr2('Оценить заказ', 'Buyurtmani baholash')}</button>` : ''}
      </div>
    </div>`, 'full');
};
A.copyOrderNo = n => { try { navigator.clipboard.writeText(String(n)); toast(tr2('Номер скопирован', 'Raqam nusxalandi')); } catch { /* old browser */ } };
const clDateFull = s => { const d = utc(s); return d ? `${d.toLocaleDateString(uzL() ? 'uz-UZ' : 'ru-RU', { day: 'numeric', month: 'long' })} ${oxHM(d)}` : ''; };

/* ---------- delivery address of the order ---------- */
A.addrInfo = async id => {
  const o = await orderById(id), a = o?.address || {};
  const line = (k, v) => (v ? `<div class="od-kv"><small>${k}</small><b>${esc(v)}</b></div>` : '');
  Sh.open('addrinfo', () => `<div class="grab"></div><div class="body" style="padding:18px 20px 10px"><h2 style="margin:4px 0 14px;font-size:24px">${tr2('Адрес доставки', 'Yetkazib berish manzili')}</h2>
    ${line(tr2('Адрес', 'Manzil'), a.address)}${line(tr2('Подъезд', 'Podyezd'), a.entrance)}${line(tr2('Этаж', 'Qavat'), a.floor)}${line(tr2('Квартира', 'Xonadon'), a.apartment)}${line(tr2('Домофон', 'Domofon'), a.intercom)}${line(tr2('Комментарий', 'Izoh'), a.comment || o?.comment)}
    <p class="gray-t" style="margin:12px 0 0">${tr2('Адрес нельзя изменить после оформления. Если ошиблись — напишите курьеру или в поддержку.', 'Buyurtmadan keyin manzilni o‘zgartirib bo‘lmaydi. Xato bo‘lsa — kuryerga yoki yordam xizmatiga yozing.')}</p></div>`);
};

/* ---------- contact with the courier: a call or a chat ---------- */
A.courierContact = async id => {
  let r; try { r = await api(`/orders/${id}/chat`); } catch (e) { return toast(e.message); }
  const c = r.courier || {};
  Sh.open('ccontact', () => `<div class="grab"></div><div class="body" style="padding:18px 20px 10px">
    <h2 style="margin:4px 0 4px;font-size:24px">${tr2('Курьер', 'Kuryer')} ${esc(c.name || '')}</h2><p class="gray-t" style="margin:0 0 14px">${tr2('Позвоните или напишите — курьер увидит сообщение в своём приложении', 'Qo‘ng‘iroq qiling yoki yozing — kuryer xabarni o‘z ilovasida ko‘radi')}</p>
    ${c.phone ? `<a class="btn" style="text-decoration:none;gap:10px" href="tel:${esc(String(c.phone).replace(/[^+\d]/g, ''))}">${OXI.phone} ${tr2('Позвонить', 'Qo‘ng‘iroq qilish')}</a>` : ''}
    <button class="btn gray" style="margin-top:10px;gap:10px" onclick="Sh.close('ccontact');A.orderChat(${id})" ${r.open ? '' : 'disabled'}>${OXI.chat} ${tr2('Написать', 'Yozish')}</button></div>`);
};
const OC = { id: 0, timer: null, items: [] };
function renderOChat() {
  const mine = m => m.sender === 'user';
  return `<div class="sh-head" style="padding:max(14px,env(safe-area-inset-top)) 16px 8px"><button onclick="Sh.close('ochat')">${I.x()}</button><b style="font-size:18px">${tr2('Чат с курьером', 'Kuryer bilan chat')}</b><span style="width:28px"></span></div>
    <div class="oc-list" id="ocl">${OC.items.length ? OC.items.map(m => `<div class="oc-m ${mine(m) ? 'me' : ''}"><span>${esc(m.text)}</span><small>${oxHM(new Date(m.created_at * 1000))}</small></div>`).join('') : `<p class="gray-t" style="text-align:center;margin-top:30px">${tr2('Напишите курьеру, например, как найти подъезд', 'Kuryerga yozing, masalan, podyezdni qanday topish')}</p>`}</div>
    <div class="oc-bar"><input id="oci" maxlength="500" placeholder="${tr2('Сообщение', 'Xabar')}" onkeydown="if(event.key==='Enter')A.ocSend()"><button onclick="A.ocSend()" aria-label="send">${I.right ? I.right() : '›'}</button></div>`;
}
A.orderChat = id => {
  OC.id = id; OC.items = [];
  Sh.open('ochat', renderOChat, 'full', () => clearInterval(OC.timer));
  const load = async () => {
    try { const r = await api(`/orders/${id}/chat`); if (r.messages.length !== OC.items.length) { OC.items = r.messages; const v = $('#oci')?.value || ''; Sh.refresh('ochat'); const i = $('#oci'); if (i) { i.value = v; } const l = $('#ocl'); if (l) l.scrollTop = l.scrollHeight; } } catch { /* try again */ }
  };
  load(); clearInterval(OC.timer); OC.timer = setInterval(load, 4000);
};
A.ocSend = async () => {
  const i = $('#oci'), text = (i?.value || '').trim();
  if (!text) return;
  i.value = '';
  try { const r = await api(`/orders/${OC.id}/chat`, { body: { text } }); OC.items = r.messages; Sh.refresh('ochat'); const l = $('#ocl'); if (l) l.scrollTop = l.scrollHeight; }
  catch (e) { toast(e.message); i.value = text; }
};

/* ---------- legal documents ---------- */
A.legal = async () => {
  let r; try { r = await api('/legal?lang=' + (uzL() ? 'uz' : 'ru'), { noLogout: true }); } catch (e) { return toast(e.message); }
  Sh.open('legal', () => `<div class="grab"></div><div class="body" style="padding:18px 16px 10px"><h2 style="margin:4px 4px 12px;font-size:24px">${tr2('Правовые документы', 'Huquqiy hujjatlar')}</h2>
    ${r.docs.map(d => `<button class="set-r" onclick="A.legalDoc('${d.id}')">${OXI.doc}<span style="flex:1;text-align:left;margin-left:10px">${esc(d.title)}</span>${I.right()}</button>`).join('')}
    <p class="gray-t" style="margin:14px 4px 0;font-size:13px">${tr2('Картографические данные: © участники OpenStreetMap.', 'Xarita ma’lumotlari: © OpenStreetMap ishtirokchilari.')}</p></div>`);
};
A.legalDoc = async id => {
  let d; try { d = await api(`/legal/${id}?lang=${uzL() ? 'uz' : 'ru'}`, { noLogout: true }); } catch (e) { return toast(e.message); }
  Sh.open('legaldoc', () => `<div class="sh-head" style="padding:max(14px,env(safe-area-inset-top)) 16px 8px"><button onclick="Sh.close('legaldoc')">${I.x()}</button><b style="font-size:17px">${esc(d.title)}</b><span style="width:28px"></span></div>
    <div class="body legal-doc"><p class="gray-t">${tr2('Редакция от', 'Tahrir sanasi:')} ${esc(d.updated)}</p>${d.sections.map(s => `<h3>${esc(s.h)}</h3>${s.p.map(p => `<p>${esc(p)}</p>`).join('')}`).join('')}</div>`, 'full');
};
// under "Продолжить" on the phone screen: continuing means agreeing to the documents
window.termsNote = () => (uzL()
  ? `<p class="terms-note">Davom etib, siz <a onclick="A.legalDoc('offer')">ommaviy oferta</a>, <a onclick="A.legalDoc('privacy')">maxfiylik siyosati</a> va <a onclick="A.legalDoc('coins')">WendyCoin qoidalari</a>ga rozilik bildirasiz</p>`
  : `<p class="terms-note">Продолжая, вы принимаете <a onclick="A.legalDoc('offer')">публичную оферту</a>, <a onclick="A.legalDoc('privacy')">политику конфиденциальности</a> и <a onclick="A.legalDoc('coins')">правила WendyCoin</a></p>`);

// accounts made before the documents (or before a new version): ask once, after sign-in
let termsAsked = false;
setInterval(() => {
  if (termsAsked || typeof St === 'undefined' || !St.token || !St.user || St.user.terms_ver === TERMS_VER || Sh.stack?.terms) return;
  termsAsked = true;
  Sh.open('terms', () => `<div class="grab"></div><div class="body" style="padding:20px 20px 10px">
    <h2 style="margin:4px 0 8px;font-size:24px">${tr2('Мы обновили условия', 'Shartlar yangilandi')}</h2>
    <p class="gray-t" style="margin:0 0 12px">${tr2('Чтобы продолжить заказывать, ознакомьтесь с документами и примите их. WendyCoin теперь действуют 30 дней с даты начисления.', 'Buyurtma berishda davom etish uchun hujjatlar bilan tanishib, ularni qabul qiling. WendyCoin endi berilgan kundan boshlab 30 kun amal qiladi.')}</p>
    ${['offer', 'privacy', 'coins'].map(k => `<button class="set-r" onclick="A.legalDoc('${k}')">${OXI.doc}<span style="flex:1;text-align:left;margin-left:10px">${{ offer: tr2('Публичная оферта', 'Ommaviy oferta'), privacy: tr2('Политика конфиденциальности', 'Maxfiylik siyosati'), coins: tr2('Правила WendyCoin', 'WendyCoin qoidalari') }[k]}</span>${I.right()}</button>`).join('')}
    <div class="foot"><button class="btn" onclick="A.acceptTerms()">${tr2('Принимаю', 'Qabul qilaman')}</button></div></div>`);
}, 3000);
A.acceptTerms = async () => {
  try { await api('/me/accept-terms', { body: {} }); if (St.user) St.user.terms_ver = TERMS_VER; Sh.close('terms'); } catch (e) { toast(e.message); }
};
