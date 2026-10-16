# Wendy's — Expo Go ilovasi

Bu ilova mavjud saytni (mijoz ilovasi) telefon ichida WebView orqali ochadi.

1. Telefonga **Expo Go** o'rnating (App Store / Google Play).
2. Kompyuterda serverni ishga tushiring (repo ildizida): `npm install && npm start`
3. Shu papkada (`mobile/`):
   ```
   npm install
   npx expo start
   ```
4. Terminaldagi QR kodni telefon kamerasi (iOS) yoki Expo Go (Android) bilan skanerlang.
5. Ilovada server manzilini kiriting: `http://<kompyuter-IP>:3000` (bitta Wi-Fi'da bo'ling)
   yoki deploy qilingan `https://...onrender.com`.

Manzilni o'zgartirish: pastki o'ng burchakdagi ⚙ belgisini uzoq bosing.
Eslatma: `localhost` telefonda ishlamaydi — kompyuter IP manzili kerak (`ipconfig` / `ifconfig`).
