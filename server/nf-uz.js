/* Uzbek text of the automatic notifications, for the phone's own notifications (lock screen),
   which the app shows without the website's translator. Same wording as public/i18n.js. */
const D = {
  'Мы уже начали готовить ваш заказ': 'Buyurtmangizni tayyorlashni boshladik',
  'Заказ готов и скоро будет доставлен': 'Buyurtma tayyor va tez orada yetkaziladi',
  'Заказ готов, можно забирать': 'Buyurtma tayyor, olib ketishingiz mumkin',
  'Оцените наш сервис': 'Xizmatimizni baholang',
  'Если это ошибка, напишите нам в поддержку': "Agar bu xato bo'lsa, yordam xizmatiga yozing",
  '🎂 С днём рождения!': "🎂 Tug'ilgan kuningiz bilan!",
  '🛒 Мы всё ещё ждём вас в корзине': '🛒 Savatda sizni hali ham kutyapmiz',
};
const VERB = { принят: 'qabul qilindi', готов: 'tayyor', доставлен: 'yetkazildi', выдан: 'topshirildi', отменён: 'bekor qilindi', оформлен: 'rasmiylashtirildi' };
const P = [
  [/^Заказ №(\d+) (принят|готов|доставлен|выдан|отменён|оформлен)$/, (n, v) => `№${n} buyurtma ${VERB[v]}`],
  [/^Курьер везёт заказ №(\d+)$/, n => `№${n} buyurtmani kuryer olib ketmoqda`],
  [/^Курьер (.*?)\s*уже в пути\. Следите за ним на карте$/, n => `${n ? 'Kuryer ' + n + ' y' : 'Kuryer y'}o'lda. Uni xaritada kuzating`],
  [/^Дарим вам (\d+) WendyCoin 🎁$/, n => `Sizga ${n} WendyCoin sovg'a qilamiz 🎁`],
  [/^(\d+) (?:товар ждёт|товара ждут|товаров ждут) вас — оформите заказ, пока всё горячее 🍔$/, n => `${n} ta mahsulot sizni kutyapti — hammasi issiqligida buyurtma bering 🍔`],
  [/^Оплата в ресторане (.+)$/, b => `Restoranda to'lov: ${b}`],
];
function uz(text) {
  const t = String(text || '');
  if (D[t]) return D[t];
  for (const [re, fn] of P) { const m = t.match(re); if (m) return fn(...m.slice(1)); }
  return t; // messages the admin wrote are sent as written
}
module.exports = { uz };
