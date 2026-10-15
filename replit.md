# Running on Replit

- Preserve the imported structure: Express server, static HTML/CSS/JavaScript frontend, and Node's built-in SQLite. No frontend build is required.
- Runtime: Node.js 24 (the app requires at least 22.13 for `node:sqlite`).
- Install dependencies with `npm ci`.
- Use **Run** to start the `Start application` workflow. It runs `NODE_ENV=development PORT=5000 npm start`, listening on `0.0.0.0:5000`.
- Customer app: `/`. Owner: `/admin/`. Branch team: `/manager/`. Couriers: `/courier/`. POS: `/pos/`. Analytics: `/analytics/`. Health check: `/healthz`.
- Development on Replit permits embedded Preview; production retains the original anti-framing headers. Do not use `NODE_ENV=development` for production.

## Configuration still required

Set `TELEGRAM_GATEWAY_TOKEN` and `ADMIN_PHONE` securely in Replit Secrets to enable phone sign-in and select the owner. The phone must use the `+998` international format. Do not rely on the imported code's default owner phone. Telegram Gateway must have sufficient balance. No mock verification codes or auth bypasses were added.

`YANDEX_MAPS_KEY` is optional; maps otherwise use OpenStreetMap. SMS delivery and real payment processing are unfinished in the imported app.

## Data

SQLite is created and seeded automatically in `data/app.db`; runtime data is ignored by Git. Uploaded images use `uploads/`, including the menu photos shipped with the repository. `STORAGE_DIR` can change the base directory for database and uploads. Keep this SQLite storage model unless the user requests a change; back up the database and user uploads before any publishing/storage changes.
