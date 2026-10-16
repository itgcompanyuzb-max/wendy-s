/* Language: ru (default) / uz. The app is written in Russian; in Uzbek mode every text that appears in the page
 * (also toasts and server messages) is translated on the fly from this dictionary. Menu data has its own *_uz fields. */
(function () {
  let lang = 'ru';
  // no saved choice: follow the phone/browser language (Uzbek -> uz, anything else -> ru); Settings > "Язык приложения" still overrides it
  try {
    const saved = localStorage.getItem('lang');
    lang = saved ? (saved === 'uz' ? 'uz' : 'ru') : (/^uz/i.test(navigator.language || '') ? 'uz' : 'ru');
  } catch { lang = /^uz/i.test(navigator.language || '') ? 'uz' : 'ru'; }
  window.LANG = lang;
  window.loc = (o, f) => ((!o || !o[f]) ? '' : ((lang === 'uz' && o[f + '_uz']) ? o[f + '_uz'] : o[f])); // an emptied Russian text hides the Uzbek one too
  window.setLang = l => { try { localStorage.setItem('lang', l); } catch { /* ignore */ } location.reload(); };
  if (lang !== 'uz') return;
  document.documentElement.lang = 'uz';

  const D = {
    'Ошибка сети': 'Tarmoq xatosi', 'Недостаточно WendyCoin': 'WendyCoin yetarli emas',
    'Поддержка': 'Yordam xizmati', 'Войдите в профиль': 'Profilga kiring',
    'Чтобы копить коины и получать персональные скидки': 'WendyCoin to\'plash va shaxsiy chegirmalar olish uchun',
    'Указать телефон': 'Telefon raqamini kiriting', 'Правовые документы': 'Huquqiy hujjatlar', 'Версия': 'Versiya',
    'Позвоните нам или напишите — поможем с заказом.': 'Bizga qo\'ng\'iroq qiling yoki yozing — buyurtma bo\'yicha yordam beramiz.',
    'Позвонить': 'Qo\'ng\'iroq qilish',
    'Пользовательское соглашение и политика конфиденциальности.': 'Foydalanuvchi shartnomasi va maxfiylik siyosati.',
    'Картографические данные: © участники OpenStreetMap (openstreetmap.org/copyright).': 'Xarita ma\'lumotlari: © OpenStreetMap ishtirokchilari (openstreetmap.org/copyright).',
    'Укажите телефон, чтобы войти в профиль': 'Profilga kirish uchun telefon raqamini kiriting',
    'Номер телефона': 'Telefon raqami', 'Продолжить': 'Davom etish', 'Введите 9 цифр номера': 'Raqamning 9 ta raqamini kiriting',
    'Введите код из': 'Kodni kiriting:', 'или СМС': 'yoki SMS', 'Получить новый код': 'Yangi kod olish',
    'Если код не пришел,': 'Agar kod kelmagan bo\'lsa,', 'запросите новый': 'yangisini so\'rang',
    'Пропустить': 'O\'tkazib yuborish', 'Придумайте имя': 'Ismingizni kiriting', 'Ваше имя': 'Ismingiz',
    'Доставка': 'Yetkazib berish', 'В пиццерии': 'Restoranda', 'Выберите тип заказа': 'Buyurtma turini tanlang',
    'Укажите адрес доставки': 'Yetkazish manzilini kiriting', 'Геолокация не поддерживается': 'Geolokatsiya qo\'llab-quvvatlanmaydi',
    'Разрешите доступ к геолокации в браузере': 'Brauzerda geolokatsiyaga ruxsat bering', 'Узбекистан': 'O\'zbekiston',
    'Город, улица и дом': 'Shahar, ko\'cha va uy', 'Дом': 'Uy', 'Работа': 'Ish', 'Другое': 'Boshqa',
    'Подъезд': 'Kirish', 'Домофон': 'Domofon', 'Этаж': 'Qavat', 'Квартира': 'Xonadon', 'Комментарий для курьера': 'Kuryer uchun izoh',
    'Доставить сюда': 'Shu yerga yetkazish', 'Сохранить': 'Saqlash', 'Войдите в профиль, чтобы сохранить адрес': 'Manzilni saqlash uchun profilga kiring',
    'Найти пиццерию': 'Restoran qidirish', 'Открыто': 'Ochiq', 'Закрыто': 'Yopiq', 'Ничего не найдено': 'Hech narsa topilmadi',
    'Маршрут': 'Marshrut', 'Время работы': 'Ish vaqti', 'Телефон': 'Telefon', 'Заказать здесь': 'Shu yerdan buyurtma berish',
    'Выберите карты': 'Xaritani tanlang', 'Яндекс': 'Yandex', 'Скопировать адрес': 'Manzilni nusxalash', 'Ссылка скопирована': 'Havola nusxalandi',
    'Нет в наличии': 'Mavjud emas', 'Выберите пиццерию': 'Restoranni tanlang', 'Поиск по меню': 'Menyudan qidirish',
    'С этим берут': 'Bunga qo\'shib olishadi', 'Добавить адрес': 'Manzil qo\'shish', 'На карте': 'Xaritada', 'Корзина пуста': 'Savat bo\'sh',
    'Закрыть': 'Yopish', 'Обмен на WendyCoin': 'WendyCoin ga almashtirish', 'Всегда кстати': 'Har doim kerak',
    'Промокод': 'Promokod', 'Применить': 'Qo\'llash', 'Ввести промокод': 'Promokod kiritish', 'Детали': 'Tafsilotlar',
    'Скидка по промокоду': 'Promokod bo\'yicha chegirma', 'Оплата WendyCoin': 'WendyCoin bilan to\'lov',
    'Оформить заказ': 'Buyurtmani rasmiylashtirish', 'Войдите, чтобы оформить заказ': 'Buyurtma berish uchun kiring',
    'Новой картой': 'Yangi karta bilan', 'Наличными': 'Naqd pul', '💵 Наличными': '💵 Naqd pul', 'Добавить адрес доставки': 'Yetkazish manzilini qo\'shish',
    'Пока не принимаем заказы': 'Hozircha buyurtma qabul qilmaymiz', 'Доставка недоступна': 'Yetkazib berish mavjud emas',
    'Выбрать пиццерию': 'Restoran tanlash', 'Оплатить': 'To\'lash', 'Добавить карту': 'Karta qo\'shish', 'И оплатить заказ': 'va buyurtmani to\'lash',
    'Время доставки': 'Yetkazish vaqti', 'Как можно скорее': 'Imkon qadar tezroq', 'Обычно 40–60 минут': 'Odatda 40–60 daqiqa',
    'Время выдачи': 'Topshirish vaqti', 'Сейчас закрыто, выберите время': 'Hozir yopiq, vaqtni tanlang', 'Побыстрее': 'Tezroq',
    'Способ получения': 'Olish usuli', 'Выдать': 'Patnisda', 'на подносе': 'topshiriladi', 'Самовывоз': 'Olib ketish',
    'Принести': 'Stolga', 'к столику': 'olib kelinadi', 'Оплата': 'To\'lov', 'Бесплатно': 'Bepul', 'Итого': 'Jami',
    'Сегодня филиал уже не работает': 'Bugun filial ishlamaydi', 'Новая карта': 'Yangi karta',
    'Платёжная система пока не подключена: введите тестовую карту (например 4242 4242 4242 4242). Номер не сохраняется, хранятся только последние 4 цифры.': 'To\'lov tizimi hali ulanmagan: test kartasini kiriting (masalan 4242 4242 4242 4242). Karta raqami saqlanmaydi, faqat oxirgi 4 ta raqam saqlanadi.',
    'Номер карты': 'Karta raqami', 'Срок действия': 'Amal qilish muddati', 'ММ/ГГ': 'OY/YY', 'Добавить и оплатить': 'Qo\'shish va to\'lash',
    'Мы сообщим, когда ресторан примет заказ и курьер выедет к вам.': 'Restoran buyurtmani qabul qilganda va kuryer yo\'lga chiqqanda xabar beramiz.',
    'Отлично': 'Ajoyib', 'Ожидает подтверждения': 'Tasdiqlanishi kutilmoqda', 'Готовится': 'Tayyorlanmoqda', 'Готов': 'Tayyor',
    'В пути': 'Yo\'lda', 'Выполнен': 'Bajarildi', 'Отменён': 'Bekor qilindi', 'Гость': 'Mehmon', 'Копите коины': 'WendyCoin to\'plang',
    'Закажите ещё': 'Yana buyurtma bering', 'Сделайте первый заказ': 'Birinchi buyurtmani bering', 'Смотреть меню': 'Menyuni ko\'rish',
    'Способы оплаты': 'To\'lov usullari', 'Карты': 'Kartalar', 'Мои адреса': 'Manzillarim', 'Адреса': 'Manzillar', 'Акции': 'Aksiyalar',
    'НА ЛЮБОЙ ТИП ЗАКАЗА': 'HAR QANDAY BUYURTMA TURI UCHUN', 'Отменить': 'Bekor qilish', 'Мои заказы': 'Buyurtmalarim',
    'Карт пока нет': 'Hozircha kartalar yo\'q', 'Готово': 'Tayyor', 'Изменить аватар': 'Avatarni o\'zgartirish', 'Изменить': 'O\'zgartirish',
    'Разрешить уведомления': 'Bildirishnomalarga ruxsat berish', 'О рекламных предложениях и новинках в пушах и СМС': 'Reklama takliflari va yangiliklar haqida push va SMS orqali',
    'Выйти из профиля': 'Profildan chiqish', 'Удалить аккаунт': 'Akkauntni o\'chirish', 'Аватар': 'Avatar', 'ВАШИ АВАТАРЫ': 'SIZNING AVATARLARINGIZ',
    'Установлен': 'O\'rnatilgan', 'Установить': 'O\'rnatish', 'Номер обновлён': 'Raqam yangilandi', 'Новый номер телефона': 'Yangi telefon raqami',
    'Получить код': 'Kod olish', 'Удалить аккаунт?': 'Akkauntni o\'chirasizmi?',
    'Будут безвозвратно удалены ваш профиль, адреса, карты, переписка с поддержкой и': 'Profilingiz, manzillaringiz, kartalaringiz, yordam xizmati bilan yozishmalar va',
    '. Восстановить их будет нельзя.': 'butunlay o\'chiriladi. Ularni tiklab bo\'lmaydi.',
    'Удалить навсегда': 'Butunlay o\'chirish', 'Отмена': 'Bekor qilish', 'Аккаунт удалён': 'Akkaunt o\'chirildi',
    'Не удалось загрузить меню.': 'Menyuni yuklab bo\'lmadi.', 'Написать в чат': 'Chatga yozish',
    'Войдите в профиль, чтобы написать в чат': 'Chatga yozish uchun profilga kiring', 'Чат поддержки': 'Yordam chati',
    'Напишите нам — ответим как можно скорее': 'Bizga yozing — imkon qadar tezroq javob beramiz', 'Фото': 'Foto', 'Сообщение': 'Xabar',
    'Отправить': 'Yuborish', 'Можно отправлять только фото и текст': 'Faqat foto va matn yuborish mumkin', 'Не удалось открыть фото': 'Fotoni ochib bo\'lmadi',
    'Отследить курьера': 'Kuryerni kuzatish', 'Оценить': 'Baholash', 'Статус': 'Holat',
    'Ресторан скоро подтвердит заказ': 'Restoran tez orada buyurtmani tasdiqlaydi', 'Ваш заказ готовится': 'Buyurtmangiz tayyorlanmoqda',
    'Заказ готов, ждём курьера': 'Buyurtma tayyor, kuryerni kutmoqdamiz', 'Курьер везёт заказ': 'Kuryer buyurtmani olib ketmoqda',
    'Заказ доставлен': 'Buyurtma yetkazildi', 'Заказ отменён': 'Buyurtma bekor qilindi', 'Загрузка…': 'Yuklanmoqda…', 'Курьер': 'Kuryer',
    'Курьер взял заказ, ждём его геолокацию': 'Kuryer buyurtmani oldi, uning geolokatsiyasini kutmoqdamiz',
    'Мы приносим тысячу извинений. Расскажите, что пошло не так.': 'Ming bor uzr so\'raymiz. Nima noto\'g\'ri ketganini aytib bering.',
    'Спасибо, что выбрали нас!': 'Bizni tanlaganingiz uchun rahmat!', 'Оцените наш сервис': 'Xizmatimizni baholang',
    'Что вам не понравилось?': 'Sizga nima yoqmadi?', 'Комментарий (необязательно)': 'Izoh (ixtiyoriy)',
    'Спасибо за честный отзыв, мы всё исправим': 'Samimiy fikringiz uchun rahmat, hammasini tuzatamiz', 'Спасибо за оценку!': 'Bahoyingiz uchun rahmat!',
    'Язык приложения': 'Ilova tili', 'В корзину': 'Savatga', 'Пока нет товаров для обмена': 'Almashtirish uchun mahsulotlar hozircha yo\'q',
    /* server messages */
    'Требуется вход': 'Kirish talab qilinadi', 'Введите номер из 9 цифр после +998': '+998 dan keyin 9 ta raqamni kiriting',
    'Подождите перед повторной отправкой': 'Qayta yuborishdan oldin kuting', 'Слишком много попыток. Попробуйте через час': 'Juda ko\'p urinish. Bir soatdan keyin urinib ko\'ring',
    'Не удалось отправить код. Проверьте, что у номера есть Telegram, и попробуйте ещё раз': 'Kodni yuborib bo\'lmadi. Raqamda Telegram borligini tekshiring va qayta urinib ko\'ring',
    'Неверные данные': 'Ma\'lumotlar noto\'g\'ri', 'Код устарел. Запросите новый': 'Kod eskirgan. Yangisini so\'rang',
    'Слишком много попыток. Запросите новый код': 'Juda ko\'p urinish. Yangi kod so\'rang', 'Неверный код': 'Noto\'g\'ri kod', 'Неверный аватар': 'Avatar noto\'g\'ri',
    'Нельзя удалить аккаунт, пока есть незавершённые заказы. Дождитесь их выполнения': 'Tugallanmagan buyurtmalar bor ekan, akkauntni o\'chirib bo\'lmaydi. Ularning bajarilishini kuting',
    'Это ваш текущий номер': 'Bu sizning joriy raqamingiz', 'Этот номер уже используется': 'Bu raqam allaqachon ishlatilmoqda',
    'Промокод не найден': 'Promokod topilmadi', 'Укажите адрес': 'Manzilni kiriting', 'Не определены координаты': 'Koordinatalar aniqlanmadi',
    'Неверный номер карты': 'Karta raqami noto\'g\'ri', 'Неверный срок действия': 'Amal qilish muddati noto\'g\'ri', 'Карта': 'Karta',
    'Пока не принимаем заказы. Попробуйте заказать позже': 'Hozircha buyurtma qabul qilmaymiz. Keyinroq urinib ko\'ring',
    'К сожалению, доставка на ваш адрес сейчас недоступна.': 'Afsuski, hozir manzilingizga yetkazib berish mavjud emas.',
    'Нет координат': 'Koordinatalar yo\'q', 'Товар недоступен': 'Mahsulot mavjud emas', 'Филиал сейчас закрыт': 'Filial hozir yopiq',
    'Время выдачи вне часов работы филиала': 'Topshirish vaqti filial ish vaqtidan tashqarida',
    'Сумма заказа меньше минимальной для промокода': 'Buyurtma summasi promokod uchun minimaldan kam',
    'Недостаточно WendyCoin для оплаты заказа': 'Buyurtma uchun WendyCoin yetarli emas', 'Фото больше 5 МБ': 'Foto 5 MB dan katta',
    'Можно отправлять только фото (PNG, JPG, WEBP)': 'Faqat foto (PNG, JPG, WEBP) yuborish mumkin', 'Пустое сообщение': 'Bo\'sh xabar',
    'Слишком много сообщений, подождите минуту': 'Juda ko\'p xabar, bir daqiqa kuting', 'Не найдено': 'Topilmadi', 'Ошибка сервера': 'Server xatosi',
    'Заказ не найден': 'Buyurtma topilmadi', 'Оценить можно после доставки': 'Yetkazilgandan keyin baholash mumkin',
    'Поставьте оценку от 1 до 5': '1 dan 5 gacha baho qo\'ying', 'Вы уже оценили этот заказ': 'Siz bu buyurtmani allaqachon baholagansiz',
    'Мы уже начали готовить ваш заказ': 'Buyurtmangizni tayyorlashni boshladik', 'Заказ готов и скоро будет доставлен': 'Buyurtma tayyor va tez orada yetkaziladi',
    'Заказ готов, можно забирать': 'Buyurtma tayyor, olib ketishingiz mumkin', 'Если это ошибка, напишите нам в поддержку': 'Agar bu xato bo\'lsa, yordam xizmatiga yozing',
    'Достаточно': 'Yetarli',
  };
  const MONTHS = { января: 'yanvar', февраля: 'fevral', марта: 'mart', апреля: 'aprel', мая: 'may', июня: 'iyun', июля: 'iyul', августа: 'avgust', сентября: 'sentabr', октября: 'oktabr', ноября: 'noyabr', декабря: 'dekabr' };
  const VERB = { принят: 'qabul qilindi', готов: 'tayyor', доставлен: 'yetkazildi', выдан: 'topshirildi', отменён: 'bekor qilindi', оформлен: 'rasmiylashtirildi' };
  const P = [ // [regex, replacement function]
    [/^Заказ №(\d+) (принят|готов|доставлен|выдан|отменён|оформлен)$/, (n, v) => `№${n} buyurtma ${VERB[v]}`],
    [/^Заказ №(\d+)$/, n => `№${n} buyurtma`],
    [/^начисляем (\d+)% от каждого заказа$/, n => `har bir buyurtmadan ${n}% hisoblaymiz`],
    [/^Курьер везёт заказ №(\d+)$/, n => `№${n} buyurtmani kuryer olib ketmoqda`],
    [/^Курьер (.*?)\s*уже в пути\. Следите за ним на карте$/, n => `${n ? 'Kuryer ' + n + ' y' : 'Kuryer y'}o'lda. Uni xaritada kuzating`],
    [/^(?:Курьер (.+) · )?осталось ≈ ([\d.]+) км, около (\d+) мин$/, (n, km, m) => `${n ? 'Kuryer ' + n + ' · ' : ''}≈ ${km} km qoldi, taxminan ${m} daqiqa`],
    [/^(\d+) (?:товар|товара|товаров)$/, n => `${n} ta mahsulot`],
    [/^Готовит: (.+)$/, b => `Tayyorlaydi: ${b}`],
    [/^≈ ([\d.]+) км от вас$/, k => `≈ ${k} km uzoqlikda`],
    [/^Открыто до (.+)$/, t => `${t} gacha ochiq`],
    [/^до (\d.*?)$/, t => { const m = t.match(/^(\d+) (\S+)$/); return m && MONTHS[m[2]] ? `${m[1]}-${MONTHS[m[2]]}gacha` : `${t} gacha`; }],
    [/^· откроется в (.+)$/, t => `· ${t} da ochiladi`],
    [/^С (\d+:\d+) до (\d+:\d+)$/, (a, b) => `${a} dan ${b} gacha`],
    [/^(.+) Пн, Вт, Ср, Чт, Пт, Сб, Вс$/, t => `${t} Du, Se, Chor, Pay, Ju, Sha, Yak`],
    [/^запросите новый через (\d+) сек$/, n => `yangisini ${n} soniyadan keyin so'rang`],
    [/^Новый код через (\d+) сек$/, n => `Yangi kod ${n} soniyadan keyin`],
    [/^Новый код можно запросить через (\d+) сек$/, n => `Yangi kodni ${n} soniyadan keyin so'rash mumkin`],
    [/^на номер (.+)$/, t => `${t} raqamiga`],
    [/^Не хватает (\d+) WendyCoin$/, n => `${n} WendyCoin yetishmaydi`],
    [/^Оплатить (\d+) WendyCoin$/, n => `${n} WendyCoin to'lash`],
    [/^Минимальный заказ (.+)$/, t => `Minimal buyurtma: ${t}`],
    [/^Минимальная сумма заказа для доставки: (.+)$/, t => `Yetkazib berish uchun minimal buyurtma summasi: ${t}`],
    [/^Минимальная сумма заказа (.+)$/, t => `Minimal buyurtma summasi ${t}`],
    [/^Бесплатная доставка от (.+)$/, t => `${t} dan boshlab yetkazib berish bepul`],
    [/^Обменять на (\d+) WendyCoin$/, n => `${n} WendyCoin ga almashtirish`],
    [/^Добавить в корзину за (.+)$/, t => `${t} ga savatga qo'shish`],
    [/^Сумма: (.+)$/, t => `Summa: ${t}`],
    [/^Заказ будет готов (как можно скорее|к (.+))\.$/, (a, b) => (b ? `Buyurtma ${b} ga tayyor bo'ladi.` : 'Buyurtma imkon qadar tez tayyor bo\'ladi.')],
    [/^Ваше имя в (.+)$/, b => `${b} dagi ismingiz`],
    [/^Так будем обращаться к вам в (.+)$/, b => `${b} da sizga shunday murojaat qilamiz`],
    [/^(.+) применён$/, t => `${t} qo'llandi`],
    [/^· (Доставка|В пиццерии) · (.+)$/, (a, b) => `· ${a === 'Доставка' ? 'Yetkazib berish' : 'Restoranda'} · ${b}`],
    [/^([★☆]+) ваша оценка$/, t => `${t} sizning bahoyingiz`],
    [/^Сейчас нет в наличии: (.+)$/, t => `Hozir mavjud emas: ${t}`],
    [/^В этом филиале нет в наличии: (.+)$/, t => `Bu filialda mavjud emas: ${t}`],
    [/^«(.+)» нельзя обменять на WendyCoin$/, t => `«${t}» ni WendyCoin ga almashtirib bo'lmaydi`],
    [/^Оплата заказа №(\d+)$/, n => `№${n} buyurtma to'lovi`],
    [/^ваша оценка$/, () => 'sizning bahoyingiz'],
    [/^Закрыто · откроется в (.+)$/, t => `Yopiq · ${t} da ochiladi`],
  ];
  const WORDS = [[/подъезд/g, 'kirish'], [/этаж/g, 'qavat'], [/кв\./g, 'xonadon'], [/(\d)\s*мл(?![А-Яа-яЁё])/g, '$1 ml'], [/(\d)\s*г(?![А-Яа-яЁё])/g, '$1 g'], [/(\d)\s*шт\./g, '$1 dona'], [/Ташкент/g, 'Toshkent']];
  const CYR = /[А-Яа-яЁё]/;
  function tr(text) {
    if (!CYR.test(text)) return text;
    const t = text.trim(); if (!t) return text;
    if (D[t] !== undefined) return text.replace(t, D[t]);
    for (const [re, fn] of P) { const m = t.match(re); if (m) return text.replace(t, fn(...m.slice(1))); }
    let out = text; for (const [re, to] of WORDS) out = out.replace(re, to);
    return out;
  }
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  function fixAttrs(el) { for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v && CYR.test(v)) { const n = tr(v); if (n !== v) el.setAttribute(a, n); } } }
  function walk(node) {
    if (node.nodeType === 3) { const n = tr(node.nodeValue); if (n !== node.nodeValue) node.nodeValue = n; return; }
    if (node.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA)$/.test(node.tagName)) { if (node.nodeType === 1) fixAttrs(node); return; }
    fixAttrs(node);
    for (const c of node.childNodes) walk(c);
  }
  new MutationObserver(recs => {
    for (const r of recs) {
      if (r.type === 'childList') r.addedNodes.forEach(walk);
      else if (r.type === 'characterData') { const n = tr(r.target.nodeValue); if (n !== r.target.nodeValue) r.target.nodeValue = n; }
      else if (r.type === 'attributes') fixAttrs(r.target);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.title = tr(document.title).replace('доставка', 'yetkazib berish');
  walk(document.body || document.documentElement);
})();
