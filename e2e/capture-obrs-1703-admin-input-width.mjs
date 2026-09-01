/**
 * OBRS-1703 — the rendered WIDTH of every `input`/`select` under `.admin-shell` on the
 * two admin surfaces whose stylesheets ask for a width, read off a live browser, on one
 * `ng serve`, run twice with nothing changed but the one style file under test:
 *
 *   npx ng serve --port 4703
 *   node e2e/capture-obrs-1703-admin-input-width.mjs --label before   # sources at origin/dev
 *   node e2e/capture-obrs-1703-admin-input-width.mjs --label after    # sources with the fix
 *
 * WHY A WIDTH AND NOT A VALUE
 * `.admin-shell label, .admin-shell input, .admin-shell select { width: auto !important }`
 * beats every component `width` that is not itself `!important`, whatever its specificity.
 * Karma never loads `admin-theme.scss`, so a chip checkbox that is asked to be 18px and
 * renders at the native ~13px passes every spec in the repo. Only a real browser with the
 * real stylesheet can see the difference, and only if something reads the box.
 *
 * WHY BOTH SURFACES
 * `user-form-modal` is the defect the card was opened for. `expense-form-modal` is the
 * BLAST RADIUS: `.expense-item-cell .admin-field { width: 100% }` is the other declaration
 * the sweep found that the shell rule outranks, and its own comment says what goes wrong
 * when it does not apply ("the inputs ... overflow the grid cell"). Dropping the
 * `!important` lets it apply, so it has to be measured, not assumed.
 *
 * WHY EVERY /api CALL IS STUBBED
 * The thing under test is a CSS cascade, which no backend can make more or less true.
 * `AuthGuard` checks `isAuthenticated()` (`!!getToken()`) and `hasAnyRole()` off
 * localStorage, so both are seeded here and every `/api/**` is answered locally.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4703';
const OUT = path.resolve(
  '..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1703'
);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 || !process.argv[i + 1] ? fallback : process.argv[i + 1];
};
const LABEL = arg('--label', null);
if (LABEL !== 'before' && LABEL !== 'after') {
  throw new Error('--label <before|after> is required - an unlabelled pair proves nothing');
}

/** `.user-role-chip input { width: 18px; height: 18px }` is the value the component asks for. */
const CHIP_PX = 18;

const ok = (data) => ({ code: 200, message: 'OK', data });

const ROLES = [
  { id: 1, slug: 'admin', name: 'Administrator' },
  { id: 2, slug: 'salesperson', name: 'Salesperson' },
  { id: 3, slug: 'driver', name: 'Driver' },
];

const USER = {
  id: 501,
  title: 'mr',
  firstName: 'Somchai',
  lastName: 'Prasert',
  fullName: 'Somchai Prasert',
  email: 'somchai@system.local',
  username: 'somchai@system.local',
  phoneNumber: '0812345678',
  preferredLocale: 'th',
  status: 'ACTIVE',
  roles: ['salesperson'],
  locked: false,
  salesPointCodes: ['MO_CHIT'],
  activeSalesPointCode: 'MO_CHIT',
  sellableOwnerSlugs: ['nj-phuyaipu'],
};

const OWNERS = [
  { id: 1, slug: 'nj-phuyaipu', displayName: 'NJ Phuyaipu', legalName: 'NJ Phuyaipu Co., Ltd.' },
  { id: 2, slug: 'siam-transit', displayName: 'Siam Transit', legalName: 'Siam Transit Co., Ltd.' },
];

const SALES_POINTS = [
  { id: 1, code: 'MO_CHIT', name: 'Mo Chit' },
  { id: 2, code: 'NONG_CHAK', name: 'Nong Chak' },
];

async function stub(page) {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'obrs-1703-capture-token');
    localStorage.setItem('auth_username', 'admin@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['admin']));
  });
  await page.route('**/api/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    const send = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(data)) });
    if (/\/private\/roles$/.test(p)) return send(ROLES);
    if (/\/private\/users\/\d+$/.test(p)) return send(USER);
    if (/\/private\/users$/.test(p)) return send([USER]);
    if (/\/private\/owners$/.test(p)) return send(OWNERS);
    if (/\/driver-cash\/sales-points$/.test(p)) return send(SALES_POINTS);
    return send([]);
  });
  await page.route('**/accounts.google.com/**', (route) => route.abort());
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
}

/**
 * Every control the shell rule can reach on this screen, keyed by something stable enough
 * to line the two arms up side by side. The point of reading ALL of them, not just the
 * chips, is that removing an `!important` from a rule that matches every input under the
 * shell can only be called safe if the controls it was NOT aimed at are shown unchanged.
 */
const readAll = (page) =>
  page.$$eval('.admin-shell input, .admin-shell select', (nodes) =>
    nodes.map((el, i) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        i,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type'),
        cls: el.getAttribute('class'),
        name: el.getAttribute('formcontrolname'),
        widthPx: Math.round(r.width * 100) / 100,
        heightPx: Math.round(r.height * 100) / 100,
        computedWidth: cs.width,
      };
    })
  );

/** The three chip groups, in DOM order: roles / sellable owners / sales points. */
const readChipGroups = (page) =>
  page.$$eval('.admin-shell .user-role-list', (lists) =>
    lists.map((list) => ({
      chips: Array.from(list.querySelectorAll('.user-role-chip input')).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          label: el.parentElement?.textContent?.trim() ?? null,
          widthPx: Math.round(r.width * 100) / 100,
          heightPx: Math.round(r.height * 100) / 100,
          computedWidth: getComputedStyle(el).width,
        };
      }),
    }))
  );

/**
 * Clip tightly around the group. The defect is a handful of pixels on a checkbox, so a
 * frame wide enough to hold the whole modal renders the two arms indistinguishable;
 * `deviceScaleFactor: 3` on the context supplies the rest of the resolution.
 */
async function shoot(page, selector, file, nth = 0) {
  const box = await page.locator(selector).nth(nth).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, r.x - 8),
      y: Math.max(0, r.y - 8),
      width: Math.min(560, r.width + 16),
      height: Math.min(260, r.height + 16),
    };
  });
  await page.screenshot({ path: file, clip: box });
}

const browser = await chromium.launch();
const results = { label: LABEL, base: BASE, chipPx: CHIP_PX, surfaces: {} };
await mkdir(OUT, { recursive: true });

async function surface(name, open, anchor, extra) {
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: 3,
  });
  const page = await ctx.newPage();
  // `ng serve` builds lazy routes on first request; the default 30s navigation timeout
  // expires on a cold /admin chunk long before anything is wrong with the page.
  page.setDefaultNavigationTimeout(180000);
  await stub(page);
  await open(page);
  await page.locator(anchor).first().waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(400);
  results.surfaces[name] = { anchor, controls: await readAll(page), ...(await extra(page)) };
  await ctx.close();
}

// 1. /admin/users -> edit the stubbed salesperson. All three chip groups need the same
//    modal: roles renders always, sellable owners needs a platform ADMIN caller, and
//    sales points needs mode='edit' AND 'salesperson' among the ticked roles.
await surface(
  'admin-users-modal',
  async (page) => {
    await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('app-user-list-table', { state: 'visible', timeout: 90000 });
    await page.locator('[aria-label="Edit"], [aria-label="แก้ไข"]').first().click();
    await page.waitForSelector('.user-role-chip', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(600);
  },
  '.user-role-chip input',
  async (page) => {
    const groups = await readChipGroups(page);
    for (const [i, key] of ['roles', 'sellable-owners', 'sales-points'].entries()) {
      if (!groups[i]) continue;
      await page.locator('.user-role-list').nth(i).scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await shoot(page, '.user-role-list', path.join(OUT, `chips-${key}-${LABEL}.png`), i);
    }
    return { chipGroups: groups };
  }
);

// 2. /admin/expenses -> new expense, add one item row. This is the blast-radius surface:
//    `.expense-item-cell .admin-field { width: 100% }` currently loses to the shell.
await surface(
  'admin-expenses-modal',
  async (page) => {
    await page.goto(`${BASE}/admin/expenses`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('app-expenses-page', { state: 'visible', timeout: 90000 });
    await page.locator('.admin-btn-primary').first().click();
    await page.waitForSelector('[data-testid="expense-item-add"]', { state: 'visible', timeout: 30000 });
    await page.locator('[data-testid="expense-item-add"]').click();
    await page.waitForSelector('[data-testid="expense-item-row-0"]', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(400);
  },
  '[data-testid="expense-item-row-0"] .admin-field',
  async (page) => {
    await page.locator('[data-testid="expense-item-row-0"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shoot(page, '[data-testid="expense-item-row-0"]', path.join(OUT, `expense-item-row-${LABEL}.png`));
    return {
      itemFields: await page.$$eval('[data-testid="expense-item-row-0"] .admin-field', (nodes) =>
        nodes.map((el) => ({
          name: el.getAttribute('formcontrolname'),
          widthPx: Math.round(el.getBoundingClientRect().width * 100) / 100,
          cellWidthPx: Math.round(el.parentElement.getBoundingClientRect().width * 100) / 100,
        }))
      ),
    };
  }
);

// 3. /admin/schedules - the third declaration the sweep found under the shell,
//    `.admin-search input { width: 100% }` (admin-theme.scss). It is not on either
//    surface above, and a rule that starts applying somewhere nobody looked is exactly
//    the kind of change this capture exists to catch.
await surface(
  'admin-schedules-search',
  async (page) => {
    await page.goto(`${BASE}/admin/schedules`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.admin-search', { state: 'visible', timeout: 90000 });
    await page.waitForTimeout(400);
  },
  '.admin-search input',
  async (page) => {
    await shoot(page, '.admin-search', path.join(OUT, `admin-search-${LABEL}.png`));
    return {
      search: await page.$$eval('.admin-search', (nodes) =>
        nodes.map((el) => {
          const i = el.querySelector('input');
          return {
            labelWidthPx: Math.round(el.getBoundingClientRect().width * 100) / 100,
            inputWidthPx: Math.round(i.getBoundingClientRect().width * 100) / 100,
            inputComputedWidth: getComputedStyle(i).width,
          };
        })
      ),
    };
  }
);

await browser.close();

const chips = (results.surfaces['admin-users-modal'].chipGroups ?? []).flatMap((g) => g.chips);
const emptyGroups = (results.surfaces['admin-users-modal'].chipGroups ?? []).filter(
  (g) => g.chips.length === 0
).length;
const wrong = chips.filter((c) => c.widthPx !== CHIP_PX || c.heightPx !== CHIP_PX);
results.verdict = {
  chipGroups: (results.surfaces['admin-users-modal'].chipGroups ?? []).length,
  chips: chips.length,
  chipsNotAtAskedSize: wrong.length,
  itemFieldsNarrowerThanCell: (results.surfaces['admin-expenses-modal'].itemFields ?? []).filter(
    (f) => f.widthPx < f.cellWidthPx - 1
  ).length,
};

await writeFile(path.join(OUT, `result-${LABEL}.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.verdict, null, 2));

// A group that rendered nothing reads exactly like a group that is fine, so refuse it.
if (results.verdict.chipGroups !== 3 || emptyGroups > 0) {
  console.error(
    `FAIL: expected 3 non-empty chip groups, got ${results.verdict.chipGroups} with ${emptyGroups} empty - the run proves nothing`
  );
  process.exit(2);
}
if (LABEL === 'after' && wrong.length > 0) {
  console.error(`FAIL: ${wrong.length} chip checkbox(es) are not ${CHIP_PX}x${CHIP_PX}px`);
  process.exit(1);
}
console.log(`OK: ${chips.length} chip(s) measured across 3 groups, ${wrong.length} off the asked size`);
