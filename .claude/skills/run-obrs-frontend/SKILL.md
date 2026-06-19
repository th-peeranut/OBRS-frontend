---
name: run-obrs-frontend
description: Launch and drive the OBRS Angular frontend locally to see a change working or screenshot a page. Use when asked to run/start/serve the OBRS frontend, screenshot an admin page, or confirm a UI change works in the real app (not just tests).
---

# Run the OBRS Frontend

Angular 18 SPA. `npm start` serves it on `http://localhost:4200`. By default it
talks to the **SIT backend** (`https://sit-obrs-backend.koyeb.app`), because the
backend integrates Omise Payments + Mail and Omise requires an HTTPS webhook URL —
the localhost backend can't satisfy that. Use the SIT default unless you
specifically need to test against a local backend.

## 1. Launch the dev server

```bash
cd OBRS-frontend
npm start            # ng serve --configuration sit  → SIT backend (default, preferred)
# npm run start:local  # ng serve                    → http://localhost:8000 backend
# npm run start:sit    # explicit SIT (same as start)
```

First compile takes ~15–40s. Wait until the port answers before driving it:

```bash
# PowerShell
for ($i=0; $i -lt 60; $i++) { try { if ((Invoke-WebRequest -UseBasicParsing http://localhost:4200 -TimeoutSec 3).StatusCode -eq 200) { 'READY'; break } } catch {}; Start-Sleep 3 }
```

The serve `sit` configuration swaps `environment.ts` → `environment.sit.ts`
(`apiUrl` = Koyeb SIT, `useDevApiEndpoints: false`). Don't hack `apiUrl` into
`environment.ts` to point at SIT — that leaves `useDevApiEndpoints: true` and the
dev PromptPay id, which is an inconsistent hybrid. Use the `sit` configuration.

## 2. Get past the admin AuthGuard

`/admin/**` is guarded by `AuthGuard` requiring the `admin` role
(`app-routing.module.ts`). The guard only checks that `auth_token` exists and
`auth_roles` contains `admin` — it does **not** verify token expiry. Seed
localStorage to walk straight in. The repo ships a ready fixture:
`e2e/fixtures/admin-auth.json` (origin `http://localhost:4200`, with
`auth_token`, `auth_username`, `auth_roles=["admin"]`, `app_language=en`).

With Playwright, load it as `storageState` — no login flow needed.

## 3. Drive it + screenshot (Playwright is a devDependency)

Pattern that works for screenshotting an admin page. Stub the page's API calls
when the SIT backend is unavailable or you want deterministic data — otherwise
skip the `route()` calls and let it hit SIT for real.

```js
// e2e/_shot.mjs  (throwaway — delete after)
import { chromium } from 'playwright';
const ok = (data) => ({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }) });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: 'e2e/fixtures/admin-auth.json',
  viewport: { width: 1440, height: 900 },
});

// Optional stubs (dashboard example). Real ResponseAPI shape is { code, message, data }.
await ctx.route('**/api/private/admin/bookings**', r => r.fulfill(ok({ content: [/* ...AdminBookingDto */], totalElements: 0, totalPages: 1, number: 0, size: 100 })));
await ctx.route('**/api/private/vehicles', r => r.fulfill(ok([/* ...AdminVehicleDto */])));

const page = await ctx.newPage();
await page.goto('http://localhost:4200/admin/dashboard', { waitUntil: 'networkidle' });
await page.waitForSelector('.admin-big-number', { timeout: 15000 });
await page.screenshot({ path: 'e2e/_shot.png', fullPage: true });
await browser.close();
```

```bash
node e2e/_shot.mjs
# then Read e2e/_shot.png — a blank frame means it didn't actually render
rm -f e2e/_shot.mjs e2e/_shot.png   # clean up throwaway artifacts
```

## Key endpoints (base = `${apiUrl}/api`)

- Bookings list: `GET /private/admin/bookings?page=0&size=100` → `data.content`
- Booking payments: `GET /private/bookings/{id}/payments`
- Vehicles: `GET /private/vehicles` → `data` (array)
- Vehicle types: `GET /private/vehicle-types`
- Routes: `GET /routes`  ·  Schedules: `GET /private/schedules`

`ResponseAPI` envelope is `{ code, message, data }`; status DTOs are read via
`parseAdminStatus` (a plain status string like `"CONFIRMED"` works in stubs).

## Notes

- i18n lives in `public/i18n/{en,th,zh}.json`; admin keys under the `ADMIN` root.
- Don't commit throwaway driver scripts or PNGs under `e2e/`.
- `npm run start:https` serves over SSL (also SIT-pointed) if you need an HTTPS origin locally.
