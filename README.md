# Wendy's delivery — customer app + backend + admin

Run (Node 22.13+; this machine has Node 24):

    npm install
    npm start

- Customer app: http://localhost:3000
- Admin panel:  http://localhost:3000/admin/  (password = ADMIN_PASSWORD in .env)

Config is in `.env` (Telegram Gateway token, admin password).
Data: SQLite file `data/app.db`; uploaded images in `uploads/`.

## Not finished yet
- Telegram Gateway account has no balance (API answers BALANCE_NOT_ENOUGH) - top it up in Telegram Gateway.
- SMS fallback: `sendViaSms()` in server/index.js is a stub (plug in Eskiz/Playmobile).
- Real card/Click/Payme payments: orders are saved with pay_status "pending"; no money is taken.
  Card form stores only brand + last 4 digits (never the full number).
- Map tiles are plain OpenStreetMap (fine for development; use a paid provider in production).
- Seed branches/products are sample data - replace them in the admin panel.

## Admin panel (Liquid Glass)
- URL: /admin/ - sign in with a phone number: only ADMIN_PHONE (.env) is allowed at first; the 4-digit code comes via Telegram Gateway.
- Emergency code if Telegram cannot deliver (run on the server machine): `npm run admin-code`.
- Roles: super (everything), manager (own branch: orders board, stock, staff), staff (own branch: orders).
- Security: scrypt password hashes, optional TOTP 2FA, lockout after 5 bad passwords, 30 min idle / 12 h max session,
  bearer-token auth (no cookies -> no CSRF), strict CSP on /admin, parameterized SQL, image magic-byte checks,
  confirmation required for deletes/settings, audit log of all important actions.

## Order lifecycle
customer orders -> nearest OPEN branch inside its delivery radius that has every item in stock (ties within 300 m: the less busy branch)
-> POS "accept" (customer notified) -> POS "ready" (customer + the branch's couriers notified)
-> courier accepts (customer sees the courier live on a map) -> courier "delivered" -> customer is asked to rate the service.
- POS API (per-branch key from admin "POS"): GET /api/pos/orders, POST /api/pos/orders/{n}/accept|ready|complete. Built-in terminal: /pos/
- Courier app: /courier/ (role "Курьер", assigned to a branch in admin "Команда"; sign in with phone + Telegram code)
- Admin orders board is read-only (progress view). Notifications reach customers inside the open app (polling), not as push messages.
- Maps: set YANDEX_MAPS_KEY in .env to use Yandex tiles; otherwise OpenStreetMap.

## First start on a new machine / server
1. `npm install`
2. copy `.env.example` to `.env` and fill in TELEGRAM_GATEWAY_TOKEN and ADMIN_PHONE
3. `npm start` - the database is created automatically and filled from `server/menu.seed.json` (the real menu, branches, banners).
   After changing the menu in the admin panel you can refresh that seed with `node server/export-seed.js`.
Customers, orders, chats and POS keys are NOT in the repository (they live in `data/app.db`). Back that file up.
