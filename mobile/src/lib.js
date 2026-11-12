// Shared helpers for the native screens: server, money, language, haptics.
import * as Haptics from 'expo-haptics';

export const BASE = 'https://wendy-s-r2cm.onrender.com';
export const RED = '#e2203d';
export const C = { bg: '#000', card: '#18181b', card2: '#27272b', text: '#fff', gray: '#9a9aa0', gold: '#ffc72c', green: '#34c759' };

export const img = (u) => (!u ? null : /^https?:/.test(u) ? u : BASE + u);
export const fmt = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0)).replace(/\s/g, ' ');
export const money = (n) => `${fmt(n)} so'm`;

export async function api(path, { token, method, body } = {}) {
  const r = await fetch(BASE + '/api' + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Ошибка сети'); e.status = r.status; throw e; }
  return j;
}

export function haptic(k) {
  try {
    if (k === 'select') Haptics.selectionAsync();
    else if (k === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (k === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (k === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else if (k === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (k === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else if (k === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch { /* no haptic engine */ }
}

// Russian is the source language (like the website); Uzbek from this dictionary
const UZ = {
  'Поиск по меню': 'Menyudan qidirish', 'Ничего не найдено': 'Hech narsa topilmadi', 'Нет в наличии': 'Mavjud emas',
  'С этим берут': 'Bu bilan olishadi', 'Корзина': 'Savat', 'Корзина пуста': 'Savat bo\'sh', 'Очистить': 'Tozalash',
  'Оформить заказ': 'Buyurtmani rasmiylashtirish', 'Товары': 'Mahsulotlar', 'Итого': 'Jami', 'Скидка': 'Chegirma',
  'Доставка рассчитается при оформлении': 'Yetkazib berish narxi rasmiylashtirishda hisoblanadi',
  'Обмен на WendyCoin': 'WendyCoin ga almashtirish', 'Мои заказы': 'Buyurtmalarim', 'Войти': 'Kirish',
  'Копите WendyCoin': 'WendyCoin to\'plang', 'QR-код': 'QR-kod', 'QR-код для оплаты в ресторане': 'Restoranda to\'lash uchun QR-kod',
  'Открыть': 'Ochish', 'Обменять на товары': 'Mahsulotga almashtirish', 'История': 'Tarix', 'Как это работает': 'Qanday ishlaydi',
  'Пока нет операций. За каждый заказ мы начисляем WendyCoin.': 'Hozircha amallar yo\'q. Har bir buyurtma uchun WendyCoin hisoblaymiz.',
  'Загружаем…': 'Yuklanmoqda…', 'Начисление': 'Hisoblandi', 'Списание': 'Sarflandi',
  'Возвращаем на баланс в WendyCoin': 'WendyCoin bo\'lib balansingizga qaytadi', 'По этому курсу коины списываются при оплате': 'To\'lovda coinlar shu kurs bo\'yicha yechiladi',
  'Оплата в ресторане': 'Restoranda to\'lov', 'Покажите QR-код кассиру или поднесите к сканеру киоска': 'QR-kodni kassirga ko\'rsating yoki kiosk skaneriga tuting',
  'Обмен на товары': 'Mahsulotga almashtirish', 'Соусы, напитки и другие позиции — прямо в приложении': 'Souslar, ichimliklar va boshqa mahsulotlar — ilovaning o\'zida',
  'Покажите код кассиру или поднесите к сканеру киоска': 'Kodni kassirga ko\'rsating yoki kiosk skaneriga tuting',
  'Создаём код…': 'Kod yaratilmoqda…', 'Оплачено': 'To\'landi', 'Готово': 'Tayyor', 'На балансе': 'Balansda',
  'Укажите адрес доставки': 'Yetkazib berish manzilini kiriting', 'Выберите пиццерию': 'Restoranni tanlang',
  'Нет подключения': 'Internet yo\'q', 'Повторить': 'Qayta urinish', 'Проверьте интернет и попробуйте ещё раз': 'Internetni tekshiring va qayta urinib ko\'ring',
  'Закрыть': 'Yopish', 'Добавить': 'Qo\'shish',
};
let LANG = 'ru';
export const setLang = (l) => { LANG = l === 'uz' ? 'uz' : 'ru'; };
export const getLang = () => LANG;
export function t(s) {
  if (LANG !== 'uz') return s;
  if (UZ[s]) return UZ[s];
  let m;
  if ((m = s.match(/^(\d+)% с каждого заказа$/))) return `Har bir buyurtmadan ${m[1]}%`;
  if ((m = s.match(/^Обновится через (.+)$/))) return `${m[1]} dan keyin yangilanadi`;
  if ((m = s.match(/^Заказ №(\d+)$/))) return `№${m[1]} buyurtma`;
  if ((m = s.match(/^Оплата в ресторане: (.+)$/))) return `Restoranda to'lov: ${m[1]}`;
  if ((m = s.match(/^Возврат за отменённый заказ №(\d+)$/))) return `Bekor qilingan №${m[1]} buyurtma uchun qaytarildi`;
  return s;
}
// menu fields: *_uz when the app is in Uzbek
export const loc = (o, f) => (!o || !o[f] ? '' : LANG === 'uz' && o[f + '_uz'] ? o[f + '_uz'] : o[f]);

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
// "2026-11-12 19:44:41" (UTC) → "12 ноября, 23:44" in Tashkent time
export function when(s) {
  const d = new Date(String(s).replace(' ', 'T') + 'Z'); if (isNaN(d)) return String(s);
  const tz = new Date(d.getTime() + 5 * 3600e3);
  const hm = String(tz.getUTCHours()).padStart(2, '0') + ':' + String(tz.getUTCMinutes()).padStart(2, '0');
  return LANG === 'uz' ? `${tz.getUTCDate()}-${MONTHS_UZ[tz.getUTCMonth()]}, ${hm}` : `${tz.getUTCDate()} ${MONTHS_RU[tz.getUTCMonth()]}, ${hm}`;
}
