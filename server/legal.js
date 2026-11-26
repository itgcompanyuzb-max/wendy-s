/* The app's legal documents: public offer, privacy policy, WendyCoin rules (Russian and Uzbek).
 * Company details come from the admin settings ("Безопасность" > legal details). Written for this app;
 * have a lawyer check them before relying on them. Each document: { title, sections: [{ h, p: [paragraphs] }] }. */
module.exports = function legalDocs(c) {
  const miss = { ru: '[не указано]', uz: '[ko‘rsatilmagan]' };
  const f = (v, l) => (String(v || '').trim() || miss[l]);
  const seller = l => `${f(c.name, l)}, ${l === 'ru' ? 'ИНН' : 'STIR'}: ${f(c.inn, l)}, ${l === 'ru' ? 'адрес' : 'manzil'}: ${f(c.address, l)}`;
  const contacts = l => `${l === 'ru' ? 'Телефон' : 'Telefon'}: ${f(c.phone, l)}, e-mail: ${f(c.email, l)}`;
  const pct = c.coinPercent ? `${c.coinPercent}%` : '';

  return {
    offer: {
      ru: { title: 'Публичная оферта', updated: c.version, sections: [
        { h: '1. Кто продаёт', p: [`Продавец: ${seller('ru')}. ${contacts('ru')}. Банковские реквизиты: ${f(c.bank, 'ru')}.`,
          `Эта оферта — предложение Продавца заключить договор купли-продажи блюд и напитков через приложение и сайт ${c.brand} (далее — Сервис) на условиях ниже, в соответствии со статьями 367 и 370 Гражданского кодекса Республики Узбекистан.`] },
        { h: '2. Как заключается договор', p: ['Договор считается заключённым, когда Покупатель оформляет заказ в Сервисе (нажимает «Оформить заказ»). Регистрируясь в Сервисе, Покупатель подтверждает, что прочитал эту оферту, Политику конфиденциальности и Правила WendyCoin и согласен с ними.',
          'Покупатель подтверждает, что ему исполнилось 16 лет, а указанные им номер телефона и адрес верны.'] },
        { h: '3. Заказ и цены', p: ['Состав, цены и наличие блюд указаны в Сервисе на момент заказа. Цены — в сумах, включают налоги, если не сказано иное. Стоимость доставки показывается до оформления заказа.',
          'Фотографии блюд в Сервисе — иллюстрации; внешний вид может немного отличаться.', 'Продавец вправе отказать в заказе, если блюда нет в наличии, адрес вне зоны доставки или филиал закрыт. Покупателю сообщается об этом в Сервисе.'] },
        { h: '4. Оплата', p: ['Способы оплаты указаны при оформлении заказа: наличными курьеру или в ресторане, банковской картой и платёжными сервисами (если они подключены), а также WendyCoin по Правилам WendyCoin.',
          'При оплате картой данные карты обрабатывает платёжная система; Продавец хранит только тип карты и 4 последние цифры.'] },
        { h: '5. Доставка и самовывоз', p: ['Доставка выполняется в зоне доставки филиала, показанной в Сервисе. Время доставки — ориентировочное и зависит от загрузки ресторана, погоды и дорожной обстановки.',
          'Покупатель обязан быть доступен по телефону и принять заказ по указанному адресу. Если курьер не может связаться с Покупателем в течение 10 минут после прибытия, заказ считается доставленным, деньги за него не возвращаются.',
          'При самовывозе заказ выдаётся в выбранном филиале по номеру заказа.'] },
        { h: '6. Отмена и возврат', p: ['Покупатель может отменить заказ без оплаты, пока ресторан его не принял (статус «Принят»). После этого блюда начинают готовить, и отмена возможна только по согласованию с поддержкой.',
          'Если блюдо привезли не то, не полностью или ненадлежащего качества, сообщите в поддержку в течение 2 часов после получения, по возможности с фото. Продавец заменит блюдо или вернёт деньги за него в соответствии с Законом «О защите прав потребителей».',
          'Деньги за оплату картой возвращаются на ту же карту, срок зачисления зависит от банка. WendyCoin, потраченные на отменённый заказ, возвращаются на баланс.'] },
        { h: '7. Ответственность', p: ['Продавец отвечает за качество и безопасность блюд. Продавец не отвечает за задержки, вызванные обстоятельствами вне его контроля (форс-мажор), и за неверные данные, указанные Покупателем.',
          'Информация об аллергенах — в описании блюд или у поддержки. При аллергии уточните состав до заказа.'] },
        { h: '8. Персональные данные', p: ['Продавец обрабатывает персональные данные Покупателя по Политике конфиденциальности, в соответствии с Законом «О персональных данных».'] },
        { h: '9. Изменение оферты и споры', p: ['Продавец может изменить оферту, опубликовав новую версию в Сервисе. Для уже оформленных заказов действует версия на момент заказа.',
          'Споры решаются переговорами, а при недостижении согласия — в суде по месту нахождения Продавца, по законодательству Республики Узбекистан.'] },
        { h: '10. Контакты', p: [`${contacts('ru')}. Поддержка также доступна в чате приложения.`] },
      ] },
      uz: { title: 'Ommaviy oferta', updated: c.version, sections: [
        { h: '1. Sotuvchi', p: [`Sotuvchi: ${seller('uz')}. ${contacts('uz')}. Bank rekvizitlari: ${f(c.bank, 'uz')}.`,
          `Ushbu oferta — Sotuvchining ${c.brand} ilovasi va sayti (keyingi o‘rinlarda — Servis) orqali taom va ichimliklarni sotish shartnomasini quyidagi shartlarda tuzish taklifi, O‘zbekiston Respublikasi Fuqarolik kodeksining 367 va 370-moddalariga muvofiq.`] },
        { h: '2. Shartnoma qanday tuziladi', p: ['Xaridor Servisda buyurtma berganda («Buyurtma berish» tugmasini bosganda) shartnoma tuzilgan hisoblanadi. Servisda ro‘yxatdan o‘tib, Xaridor ushbu oferta, Maxfiylik siyosati va WendyCoin qoidalarini o‘qiganini va ularga roziligini tasdiqlaydi.',
          'Xaridor 16 yoshga to‘lganini, ko‘rsatgan telefon raqami va manzili to‘g‘ri ekanini tasdiqlaydi.'] },
        { h: '3. Buyurtma va narxlar', p: ['Taomlar tarkibi, narxi va mavjudligi buyurtma paytida Servisda ko‘rsatilgan. Narxlar so‘mda, boshqacha aytilmagan bo‘lsa, soliqlarni o‘z ichiga oladi. Yetkazib berish narxi buyurtma berishdan oldin ko‘rsatiladi.',
          'Servisdagi taom rasmlari namunaviy; tashqi ko‘rinishi biroz farq qilishi mumkin.', 'Taom tugagan, manzil yetkazib berish hududidan tashqarida yoki filial yopiq bo‘lsa, Sotuvchi buyurtmani rad etishi mumkin. Bu haqda Xaridorga Servisda xabar beriladi.'] },
        { h: '4. To‘lov', p: ['To‘lov usullari buyurtma berishda ko‘rsatiladi: kuryerga yoki restoranda naqd, bank kartasi va to‘lov xizmatlari (ulangan bo‘lsa), shuningdek WendyCoin qoidalariga muvofiq WendyCoin bilan.',
          'Karta bilan to‘lovda karta ma’lumotlarini to‘lov tizimi qayta ishlaydi; Sotuvchi faqat karta turini va oxirgi 4 raqamini saqlaydi.'] },
        { h: '5. Yetkazib berish va olib ketish', p: ['Yetkazib berish Servisda ko‘rsatilgan filialning yetkazib berish hududida amalga oshiriladi. Yetkazish vaqti taxminiy bo‘lib, restoran bandligi, ob-havo va yo‘l holatiga bog‘liq.',
          'Xaridor telefon orqali aloqada bo‘lishi va buyurtmani ko‘rsatilgan manzilda qabul qilishi shart. Kuryer yetib kelgach 10 daqiqa ichida Xaridor bilan bog‘lana olmasa, buyurtma yetkazilgan hisoblanadi va uning puli qaytarilmaydi.',
          'Olib ketishda buyurtma tanlangan filialda buyurtma raqami bo‘yicha beriladi.'] },
        { h: '6. Bekor qilish va qaytarish', p: ['Restoran buyurtmani qabul qilmaguncha («Qabul qilindi» holati) Xaridor uni bepul bekor qilishi mumkin. Shundan keyin taom tayyorlana boshlaydi va bekor qilish faqat yordam xizmati bilan kelishib amalga oshiriladi.',
          'Taom noto‘g‘ri, to‘liq bo‘lmagan yoki sifatsiz kelgan bo‘lsa, olingandan keyin 2 soat ichida, iloji bo‘lsa rasm bilan, yordam xizmatiga xabar bering. Sotuvchi «Iste’molchilarning huquqlarini himoya qilish to‘g‘risida»gi Qonunga muvofiq taomni almashtiradi yoki pulini qaytaradi.',
          'Karta orqali to‘langan pul o‘sha kartaga qaytariladi, tushish muddati bankka bog‘liq. Bekor qilingan buyurtmaga sarflangan WendyCoin balansga qaytariladi.'] },
        { h: '7. Javobgarlik', p: ['Sotuvchi taomlarning sifati va xavfsizligi uchun javob beradi. Sotuvchi o‘z nazoratidan tashqaridagi holatlar (fors-major) tufayli kechikishlar va Xaridor ko‘rsatgan noto‘g‘ri ma’lumotlar uchun javob bermaydi.',
          'Allergenlar haqidagi ma’lumot taom tavsifida yoki yordam xizmatida. Allergiyangiz bo‘lsa, buyurtmadan oldin tarkibini aniqlang.'] },
        { h: '8. Shaxsga doir ma’lumotlar', p: ['Sotuvchi Xaridorning shaxsga doir ma’lumotlarini Maxfiylik siyosatiga va «Shaxsga doir ma’lumotlar to‘g‘risida»gi Qonunga muvofiq qayta ishlaydi.'] },
        { h: '9. Ofertani o‘zgartirish va nizolar', p: ['Sotuvchi Servisda yangi tahrirni e’lon qilib, ofertani o‘zgartirishi mumkin. Berilgan buyurtmalarga buyurtma paytidagi tahrir amal qiladi.',
          'Nizolar muzokara yo‘li bilan, kelishilmasa — O‘zbekiston Respublikasi qonunchiligiga muvofiq Sotuvchi joylashgan yerdagi sudda hal qilinadi.'] },
        { h: '10. Aloqa', p: [`${contacts('uz')}. Yordam xizmati ilovadagi chatda ham ishlaydi.`] },
      ] },
    },

    privacy: {
      ru: { title: 'Политика конфиденциальности', updated: c.version, sections: [
        { h: '1. Кто обрабатывает данные', p: [`Оператор персональных данных: ${seller('ru')}. ${contacts('ru')}.`] },
        { h: '2. Какие данные мы собираем', p: ['Номер телефона, имя, дата рождения (если вы её указали), адреса доставки, история заказов и отзывы, баланс и история WendyCoin, сообщения в чате поддержки и с курьером, тип и 4 последние цифры банковской карты.',
          'Пока курьер везёт заказ, мы используем его геопозицию, чтобы показать её вам на карте. Вашу геопозицию мы получаем, только если вы сами разрешили её в телефоне, — чтобы найти адрес.',
          'Мы не собираем биометрические данные (лицо, отпечатки пальцев).'] },
        { h: '3. Зачем', p: ['Чтобы войти по коду, принять, приготовить и доставить заказ, связаться с вами по заказу, начислять WendyCoin, отвечать в поддержке, предотвращать мошенничество и, если вы не отключили это в настройках, — присылать акции.'] },
        { h: '4. Кому передаём', p: ['Филиалу и курьеру, которые выполняют ваш заказ (имя, телефон, адрес, состав заказа); сервисам отправки кода входа (Telegram, WhatsApp, SMS); платёжным системам при оплате картой; государственным органам — только в случаях, предусмотренных законом. Мы не продаём ваши данные.'] },
        { h: '5. Где и сколько храним', p: ['Данные хранятся на защищённом сервере столько, сколько у вас есть аккаунт, а история заказов — столько, сколько требует налоговое и бухгалтерское законодательство. Хранение и трансграничная передача — в соответствии с Законом «О персональных данных» (с изменениями 2026 года).'] },
        { h: '6. Ваши права', p: ['Вы можете узнать, какие данные о вас хранятся, исправить их в профиле, отозвать согласие на рассылки в настройках и удалить аккаунт в профиле («Удалить аккаунт»). Для других запросов напишите в поддержку.'] },
        { h: '7. Защита', p: ['Доступ к данным есть только у сотрудников, которым он нужен для работы; все важные действия записываются в журнал. Соединение с Сервисом шифруется (HTTPS).'] },
      ] },
      uz: { title: 'Maxfiylik siyosati', updated: c.version, sections: [
        { h: '1. Ma’lumotlarni kim qayta ishlaydi', p: [`Shaxsga doir ma’lumotlar operatori: ${seller('uz')}. ${contacts('uz')}.`] },
        { h: '2. Qanday ma’lumotlarni yig‘amiz', p: ['Telefon raqami, ism, tug‘ilgan kun (agar ko‘rsatgan bo‘lsangiz), yetkazib berish manzillari, buyurtmalar tarixi va sharhlar, WendyCoin balansi va tarixi, yordam xizmati va kuryer bilan chatdagi xabarlar, bank kartasining turi va oxirgi 4 raqami.',
          'Kuryer buyurtmani olib kelayotganda uning joylashuvidan xaritada ko‘rsatish uchun foydalanamiz. Sizning joylashuvingizni faqat telefonda o‘zingiz ruxsat bersangiz, manzilni topish uchun olamiz.',
          'Biz biometrik ma’lumotlarni (yuz, barmoq izi) yig‘maymiz.'] },
        { h: '3. Nima uchun', p: ['Kod bilan kirish, buyurtmani qabul qilish, tayyorlash va yetkazish, buyurtma bo‘yicha siz bilan bog‘lanish, WendyCoin hisoblash, yordam xizmatida javob berish, firibgarlikning oldini olish va, sozlamalarda o‘chirmagan bo‘lsangiz, aksiyalar yuborish uchun.'] },
        { h: '4. Kimga beramiz', p: ['Buyurtmangizni bajaradigan filial va kuryerga (ism, telefon, manzil, buyurtma tarkibi); kirish kodini yuboradigan xizmatlarga (Telegram, WhatsApp, SMS); karta bilan to‘lovda to‘lov tizimlariga; davlat organlariga — faqat qonunda nazarda tutilgan hollarda. Ma’lumotlaringizni sotmaymiz.'] },
        { h: '5. Qayerda va qancha saqlaymiz', p: ['Ma’lumotlar himoyalangan serverda akkauntingiz mavjud bo‘lgan muddatda, buyurtmalar tarixi esa soliq va buxgalteriya qonunchiligi talab qilgan muddatda saqlanadi. Saqlash va transchegaraviy uzatish «Shaxsga doir ma’lumotlar to‘g‘risida»gi Qonunga (2026 yilgi o‘zgarishlar bilan) muvofiq amalga oshiriladi.'] },
        { h: '6. Sizning huquqlaringiz', p: ['Siz haqingizda qanday ma’lumot saqlanayotganini bilishingiz, ularni profilda tuzatishingiz, sozlamalarda xabarnomalardan voz kechishingiz va profilda akkauntni o‘chirishingiz («Akkauntni o‘chirish») mumkin. Boshqa so‘rovlar uchun yordam xizmatiga yozing.'] },
        { h: '7. Himoya', p: ['Ma’lumotlarga faqat ish uchun kerak bo‘lgan xodimlar kira oladi; barcha muhim amallar jurnalga yoziladi. Servis bilan aloqa shifrlangan (HTTPS).'] },
      ] },
    },

    coins: {
      ru: { title: 'Правила программы WendyCoin', updated: c.version, sections: [
        { h: '1. Что такое WendyCoin', p: [`WendyCoin — бонусные баллы программы лояльности ${c.brand}. Это не деньги и не электронные деньги: их нельзя обменять на наличные, перевести другому человеку или продать. 1 WendyCoin = ${c.coinValue} сум скидки.`] },
        { h: '2. Как начисляются', p: [`${pct ? `За каждый оплаченный заказ начисляется ${pct} от суммы, оплаченной деньгами` : 'За оплаченные заказы начисляется процент от суммы, оплаченной деньгами'} (включая доставку, без части, оплаченной WendyCoin). Баллы приходят после того, как заказ доставлен или выдан; за отменённый заказ баллы не начисляются.`,
          'Баллы также могут дариться в акциях и в день рождения (если вы указали дату рождения в профиле).'] },
        { h: '3. Как потратить', p: ['WendyCoin можно потратить в приложении — на блюда, у которых есть цена в WendyCoin, — и в ресторане: покажите на кассе QR-код из профиля («Оплатить WendyCoin в ресторане»). QR-код одноразовый и действует несколько минут.',
          'Баллы, потраченные на заказ, который потом отменили, возвращаются на баланс.'] },
        { h: `4. Срок действия — ${c.coinDays} дней`, p: [`Каждый начисленный WendyCoin действует ${c.coinDays} дней с даты начисления. Неиспользованные баллы сгорают автоматически. Первыми всегда тратятся самые старые баллы.`,
          'За 3 дня до сгорания приложение присылает напоминание. Возвращённые за отменённый заказ баллы действуют ещё 30 дней с даты возврата.'] },
        { h: '5. Ограничения', p: ['Продавец может не начислить или списать баллы, полученные с нарушением правил (например, фиктивные заказы, несколько аккаунтов одного человека). При удалении аккаунта баланс WendyCoin сгорает без компенсации.'] },
        { h: '6. Изменение и прекращение программы', p: ['Продавец может изменить эти правила или закрыть программу, сообщив об этом в приложении не позднее чем за 14 дней. Баллы, начисленные до изменения, действуют до конца своего срока.'] },
        { h: '7. Вопросы', p: [`${contacts('ru')}. История начислений и списаний — в профиле, раздел WendyCoin.`] },
      ] },
      uz: { title: 'WendyCoin dasturi qoidalari', updated: c.version, sections: [
        { h: '1. WendyCoin nima', p: [`WendyCoin — ${c.brand} sodiqlik dasturining bonus ballari. Bu pul yoki elektron pul emas: ularni naqd pulga almashtirib, boshqa odamga o‘tkazib yoki sotib bo‘lmaydi. 1 WendyCoin = ${c.coinValue} so‘m chegirma.`] },
        { h: '2. Qanday beriladi', p: [`${pct ? `Har bir to‘langan buyurtma uchun pul bilan to‘langan summaning ${pct} i beriladi` : 'To‘langan buyurtmalar uchun pul bilan to‘langan summaning bir foizi beriladi'} (yetkazib berish bilan birga, WendyCoin bilan to‘langan qismisiz). Ballar buyurtma yetkazilgan yoki berilgandan keyin tushadi; bekor qilingan buyurtma uchun ball berilmaydi.`,
          'Ballar aksiyalarda va tug‘ilgan kuningizda ham sovg‘a qilinishi mumkin (profilda tug‘ilgan kuningizni ko‘rsatgan bo‘lsangiz).'] },
        { h: '3. Qanday sarflash mumkin', p: ['WendyCoin’ni ilovada — WendyCoin narxi bor taomlarga — va restoranda sarflash mumkin: kassada profildagi QR-kodni ko‘rsating («Restoranda WendyCoin bilan to‘lash»). QR-kod bir martalik va bir necha daqiqa amal qiladi.',
          'Keyin bekor qilingan buyurtmaga sarflangan ballar balansga qaytariladi.'] },
        { h: `4. Amal qilish muddati — ${c.coinDays} kun`, p: [`Har bir berilgan WendyCoin berilgan kundan boshlab ${c.coinDays} kun amal qiladi. Ishlatilmagan ballar avtomatik ravishda yonib ketadi. Har doim birinchi navbatda eng eski ballar sarflanadi.`,
          'Yonib ketishidan 3 kun oldin ilova eslatma yuboradi. Bekor qilingan buyurtma uchun qaytarilgan ballar qaytarilgan kundan boshlab yana 30 kun amal qiladi.'] },
        { h: '5. Cheklovlar', p: ['Qoidalarni buzib olingan ballarni (masalan, soxta buyurtmalar, bir odamning bir nechta akkaunti) Sotuvchi bermasligi yoki hisobdan chiqarishi mumkin. Akkaunt o‘chirilganda WendyCoin balansi kompensatsiyasiz yonib ketadi.'] },
        { h: '6. Dasturni o‘zgartirish va to‘xtatish', p: ['Sotuvchi bu qoidalarni o‘zgartirishi yoki dasturni yopishi mumkin, bu haqda ilovada kamida 14 kun oldin xabar beradi. O‘zgarishdan oldin berilgan ballar o‘z muddati tugaguncha amal qiladi.'] },
        { h: '7. Savollar', p: [`${contacts('uz')}. Ball berilishi va sarflanishi tarixi — profildagi WendyCoin bo‘limida.`] },
      ] },
    },
  };
};
