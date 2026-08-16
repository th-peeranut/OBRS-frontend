import { test, expect, APIRequestContext, Page } from '@playwright/test';

/**
 * OBRS-1258 QA regression spec — sales-point picker for salespeople.
 *
 * Run by hand against the already-running LOCAL stack:
 *   npx playwright test --config=playwright.obrs1258qa.config.ts
 *
 * Declared OWN-DB in e2e/lanes.json — never runnable against SIT, which does not carry the
 * OBRS-1260 backend contract this card depends on. Backend: http://localhost:8080 (obrs1258qa
 * DB). Frontend: http://localhost:4200 (npm run start:local), already serving before this runs.
 * Evidence lands in e2e-evidence/obrs-1258/ (gitignored); the operator copies it to the card.
 *
 * Login is done via a real POST to /api/auth/login (not the SweetAlert2-gated UI flow),
 * then the token/roles are seeded into localStorage before navigation — same keys the app
 * itself writes (auth_token / auth_refresh_token / auth_username / auth_roles), so every
 * guard and interceptor behaves exactly as it would after a UI login.
 */

const API_URL = 'http://localhost:8080';
const OWNER = { email: 'owner@system.local', password: 'P@ssw0rd', id: 2 };
const SALESPERSON = { email: 'salesperson@system.local', password: 'P@ssw0rd', id: 3 };

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const resp = await request.post(`${API_URL}/api/auth/login`, {
    data: { email, password },
  });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  return body.data as {
    accessToken: string;
    refreshToken: string;
    user: { email: string; roles: string[] };
  };
}

async function seedSession(page: Page, session: { accessToken: string; refreshToken: string; user: { email: string; roles: string[] } }) {
  await page.addInitScript(
    ([token, refresh, username, roles]) => {
      localStorage.setItem('auth_token', token as string);
      localStorage.setItem('auth_refresh_token', refresh as string);
      localStorage.setItem('auth_username', username as string);
      localStorage.setItem('auth_roles', roles as string);
      // app.component.ts reads this on bootstrap via LanguageService.getStoredLanguage()
      // (default 'th' otherwise, per shared/services/language.service.ts) — every text
      // locator in this spec is written against the English strings, same as the manual
      // owner login used for the BEFORE/AFTER screenshots (owner's seeded preferredLocale
      // is 'en', which only a real UI login applies).
      localStorage.setItem('app_language', 'en');
    },
    [
      session.accessToken,
      session.refreshToken,
      session.user.email,
      JSON.stringify(session.user.roles.map((r) => r.toLowerCase())),
    ]
  );
}

async function apiPutSalesPoints(
  request: APIRequestContext,
  token: string,
  userId: number,
  body: { salesPointCodes: string[]; activeSalesPointCode: string | null }
) {
  return request.put(`${API_URL}/api/private/users/${userId}/sales-points`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
}

async function apiGetUser(request: APIRequestContext, token: string, userId: number) {
  const resp = await request.get(`${API_URL}/api/private/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  return body.data as { salesPointCodes: string[]; activeSalesPointCode: string | null };
}

// Row-text scoped, never positional (.nth(N)) — AC9 adds a 3rd user to this same list
// later in the file, which would silently shift index-based row lookups.
async function clickEditForRow(page: Page, rowText: string) {
  await page.locator('tr', { hasText: rowText }).getByRole('button', { name: 'Edit' }).click();
}

// The seeded schedules start 2027-02-12, so the sell page's default date (today) shows an
// empty trip list. Picking the date reloads the list asynchronously; clicking the group header
// immediately after the keypress raced it and swallowed the whole test budget, so wait for the
// header to actually be there first.
// Scope every locator to <app-walk-in-trip-browser>: a bare `input.form-control` .first()
// resolved to the CUSTOMER "First Name" box on the right-hand panel, so the date landed there,
// the trip list stayed on today (empty, "No trips scheduled for this date") and the failure
// read exactly like a broken feature.
async function selectSeedTrip(page: Page) {
  const browser = page.locator('app-walk-in-trip-browser');
  const dateInput = browser.locator('input').first();
  // `fill()` alone sets the value but the PrimeNG p-datePicker never commits it — the field
  // showed 12/02/2027 while the list stayed on "No trips scheduled for this date". Type it
  // key by key so the widget's own keyup handling runs, then blur to commit.
  await dateInput.click();
  await dateInput.press('ControlOrMeta+a');
  await dateInput.pressSequentially('12/02/2027', { delay: 30 });
  await dateInput.press('Enter');
  await dateInput.blur();
  // Wait for the route group to render, but do NOT click its header — it is a collapse toggle,
  // and clicking it hid the 08:00 trip the next line needs. The groups are expanded by default.
  await expect(browser.getByText('NONG CHAK-BAN BUENG-BANGKOK')).toBeVisible({ timeout: 30_000 });
  await browser.getByText('08:00').first().click();
}

// A bare `.admin-dropdown-*` locator is a strict-mode violation on this screen: the page's
// own filter bar (Role/Status) plus the modal's Locale and Status fields render four more
// of the same component. Scope to the sales-point section by the storefront icon that only
// it carries. The option menu is rendered INSIDE `.admin-dropdown` (no CDK overlay), so
// trigger, value and options are all reachable from this one root.
function salesPointSection(page: Page) {
  return page.locator('section.user-editor-section').filter({
    has: page.locator('span.material-symbols-outlined', { hasText: 'storefront' }),
  });
}

test.describe('OBRS-1258 sales-point picker', () => {
  test('AC1+AC4: edit modal shows sales-point fields for a salesperson and pre-selects existing values', async ({ page, request }) => {
    const owner = await apiLogin(request, OWNER.email, OWNER.password);
    // Known starting state from earlier manual verification: BAN_BUENG + NONG_CHAK, active BAN_BUENG.
    await apiPutSalesPoints(request, owner.accessToken, SALESPERSON.id, {
      salesPointCodes: ['BAN_BUENG', 'NONG_CHAK'],
      activeSalesPointCode: 'BAN_BUENG',
    });

    await seedSession(page, owner);
    await page.goto('/admin/users');
    await clickEditForRow(page, 'Sales Person');

    const allowedSection = page.locator('.user-editor-section', { hasText: 'Sales Points' });
    await expect(allowedSection).toBeVisible();
    await expect(page.locator('.user-role-chip', { hasText: 'บ้านบึง' })).toHaveClass(/is-selected/);
    await expect(page.locator('.user-role-chip', { hasText: 'หนองชาก' })).toHaveClass(/is-selected/);
    await expect(page.locator('.user-role-chip', { hasText: 'หมอชิต' })).not.toHaveClass(/is-selected/);
    await expect(salesPointSection(page).locator('.admin-dropdown-value')).toContainText('บ้านบึง');
  });

  test('AC2: unchecking the active allowed point clears Active immediately, before Save', async ({ page, request }) => {
    const owner = await apiLogin(request, OWNER.email, OWNER.password);
    await apiPutSalesPoints(request, owner.accessToken, SALESPERSON.id, {
      salesPointCodes: ['BAN_BUENG', 'NONG_CHAK'],
      activeSalesPointCode: 'BAN_BUENG',
    });

    await seedSession(page, owner);
    await page.goto('/admin/users');
    await clickEditForRow(page, 'Sales Person');
    await expect(salesPointSection(page).locator('.admin-dropdown-value')).toContainText('บ้านบึง');

    let putCount = 0;
    page.on('request', (req) => {
      if (req.method() === 'PUT' && req.url().includes('/sales-points')) putCount++;
    });

    await page.locator('.user-role-chip', { hasText: 'บ้านบึง' }).locator('input[type=checkbox]').uncheck();
    // Cleared in the UI immediately, before any Save click.
    await expect(salesPointSection(page).locator('.admin-dropdown-value')).not.toContainText('บ้านบึง');
    expect(putCount).toBe(0);

    // Server state must be untouched by the checkbox interaction alone.
    const server = await apiGetUser(request, owner.accessToken, SALESPERSON.id);
    expect(server.activeSalesPointCode).toBe('BAN_BUENG');
  });

  test('AC3: saving an empty allowed set truly clears server state, verified by reopening + API refetch', async ({ page, request }) => {
    const owner = await apiLogin(request, OWNER.email, OWNER.password);
    await apiPutSalesPoints(request, owner.accessToken, SALESPERSON.id, {
      salesPointCodes: ['BAN_BUENG'],
      activeSalesPointCode: 'BAN_BUENG',
    });

    await seedSession(page, owner);
    await page.goto('/admin/users');
    await clickEditForRow(page, 'Sales Person');
    await expect(salesPointSection(page).locator('.admin-dropdown-value')).toContainText('บ้านบึง');

    await page.locator('.user-role-chip', { hasText: 'บ้านบึง' }).locator('input[type=checkbox]').uncheck();
    await expect(salesPointSection(page).locator('.admin-dropdown-value')).toContainText(/ไม่กำหนด|Not set/);

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Updated successfully/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'OK' }).click();

    // Assert by re-fetching the API, not by eye.
    const server = await apiGetUser(request, owner.accessToken, SALESPERSON.id);
    expect(server.salesPointCodes).toEqual([]);
    expect(server.activeSalesPointCode).toBeNull();

    // Reopen the modal and confirm both are empty there too.
    await clickEditForRow(page, 'Sales Person');
    await expect(page.locator('.user-role-chip.is-selected', { hasText: /บ้านบึง|หนองชาก|หมอชิต/ })).toHaveCount(0);
    await expect(salesPointSection(page).locator('.admin-dropdown-value')).toContainText(/ไม่กำหนด|Not set/);

    // Restore known state for other tests in this file.
    await apiPutSalesPoints(request, owner.accessToken, SALESPERSON.id, {
      salesPointCodes: ['BAN_BUENG', 'NONG_CHAK'],
      activeSalesPointCode: 'BAN_BUENG',
    });
  });

  test('AC5: saving a non-salesperson issues zero PUT /sales-points requests, and no fields render', async ({ page, request }) => {
    const owner = await apiLogin(request, OWNER.email, OWNER.password);
    await seedSession(page, owner);
    await page.goto('/admin/users');

    await clickEditForRow(page, 'Driver Wheeler');
    await expect(page.locator('.user-editor-section', { hasText: 'Sales Points' })).toHaveCount(0);

    let putCount = 0;
    page.on('request', (req) => {
      if (req.method() === 'PUT' && req.url().includes('/sales-points')) putCount++;
    });

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Updated successfully/i)).toBeVisible({ timeout: 10_000 });
    expect(putCount).toBe(0);
    await page.getByRole('button', { name: 'OK' }).click();
  });

  test('AC9 regression: create-user flow completes successfully', async ({ page, request }) => {
    const owner = await apiLogin(request, OWNER.email, OWNER.password);
    await seedSession(page, owner);
    await page.goto('/admin/users');

    await page.getByRole('button', { name: /Add User/i }).click();
    const stamp = Date.now();
    await page.locator('input[formControlName=firstName]').fill('QaRegress');
    await page.locator('input[formControlName=lastName]').fill('Created');
    await page.locator('input[formControlName=email]').fill(`qa-regress-${stamp}@example.com`);
    // Unique per run: users.phone_number is unique, so a fixed number turns the SECOND run of
    // this spec into a false "create is broken" failure ("An account with this phone number
    // already exists.") — which is exactly the SEV1 symptom this test exists to detect.
    await page.locator('input[formControlName=phoneNumber]').fill(`08${String(stamp).slice(-8)}`);
    await page.locator('input[formControlName=password]').fill('P@ssw0rd1');
    await page.locator('input[formControlName=confirmPassword]').fill('P@ssw0rd1');
    await page.locator('.user-role-chip', { hasText: 'Customer' }).locator('input[type=checkbox]').check();

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/created successfully|Updated successfully/i)).toBeVisible({ timeout: 10_000 });
  });

  test('AC7 + evidence video: owner assigns two points and salesperson pickup follows the active one', async ({ browser, request }) => {
    // Two browser contexts, two full sell-page loads and two owner saves in one narrative clip —
    // the 60s default is not enough and running out of it looks exactly like a product failure.
    test.setTimeout(180_000);
    const owner = await apiLogin(request, OWNER.email, OWNER.password);
    // Cold, known starting state for this narrative clip.
    await apiPutSalesPoints(request, owner.accessToken, SALESPERSON.id, {
      salesPointCodes: [],
      activeSalesPointCode: null,
    });

    // browser.newContext() does NOT inherit the config's `use.viewport` - without this the clip is
    // captured at Playwright's 1280x720 default, not the 1440x900 the other evidence uses.
    const ownerContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      // browser.newContext() also does not inherit `use.video` - a manually created context
      // records nothing unless recordVideo is set here, which is why the first green run
      // produced no clip at all.
      recordVideo: { dir: `e2e-evidence/obrs-1258/video-owner`, size: { width: 1440, height: 900 } },
    });
    const ownerPage = await ownerContext.newPage();
    await seedSession(ownerPage, owner);
    await ownerPage.goto('/admin/users');
    await clickEditForRow(ownerPage, 'Sales Person');
    await ownerPage.locator('.user-role-chip', { hasText: 'บ้านบึง' }).locator('input[type=checkbox]').check();
    await ownerPage.locator('.user-role-chip', { hasText: 'หนองชาก' }).locator('input[type=checkbox]').check();
    await salesPointSection(ownerPage).locator('.admin-dropdown-trigger').click();
    await salesPointSection(ownerPage).locator('.admin-dropdown-option', { hasText: 'บ้านบึง' }).click();
    await expect(salesPointSection(ownerPage).locator('.admin-dropdown-value')).toContainText('บ้านบึง');
    await ownerPage.screenshot({ path: `e2e-evidence/obrs-1258/OBRS-1258-AFTER-0-form-two-sales-points-one-active.png` });
    await ownerPage.getByRole('button', { name: 'Save' }).click();
    await expect(ownerPage.getByText(/Updated successfully/i)).toBeVisible({ timeout: 10_000 });
    await ownerPage.getByRole('button', { name: 'OK' }).click();

    // Salesperson's sell page: pickup should follow active = BAN_BUENG.
    const spSession = await apiLogin(request, SALESPERSON.email, SALESPERSON.password);
    const spContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: { dir: `e2e-evidence/obrs-1258/video-salesperson`, size: { width: 1440, height: 900 } },
    });
    const spPage = await spContext.newPage();
    await seedSession(spPage, spSession);
    await spPage.goto('/staff/sell');
    await selectSeedTrip(spPage);
    await expect(
      spPage.locator('.stop-list .list-group-item-action.active').first()
    ).toContainText('Pt station ban bueng');
    await spPage.screenshot({
      path: `e2e-evidence/obrs-1258/OBRS-1258-AFTER-1-sell-page-pickup-follows-active-BAN_BUENG.png`,
    });

    // Switch active to NONG_CHAK via the owner's form, in the same clip.
    await ownerPage.bringToFront();
    await ownerPage.reload();
    await clickEditForRow(ownerPage, 'Sales Person');
    await salesPointSection(ownerPage).locator('.admin-dropdown-trigger').click();
    await salesPointSection(ownerPage).locator('.admin-dropdown-option', { hasText: 'หนองชาก' }).click();
    await ownerPage.getByRole('button', { name: 'Save' }).click();
    await expect(ownerPage.getByText(/Updated successfully/i)).toBeVisible({ timeout: 10_000 });
    await ownerPage.getByRole('button', { name: 'OK' }).click();

    // Pickup follows the switch, on the same sell page.
    await spPage.bringToFront();
    await spPage.reload();
    await selectSeedTrip(spPage);
    await expect(
      spPage.locator('.stop-list .list-group-item-action.active').first()
    ).toContainText('Nong chak');
    await spPage.screenshot({
      path: `e2e-evidence/obrs-1258/OBRS-1258-AFTER-2-sell-page-pickup-follows-switch-to-NONG_CHAK.png`,
    });

    await ownerContext.close();
    await spContext.close();
  });

  test('AC8: EOD sales report renders the sales-point column', async ({ page, request }) => {
    const owner = await apiLogin(request, OWNER.email, OWNER.password);
    await seedSession(page, owner);
    // Today's date — the walk-in sale made earlier this session is dated today.
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    await page.goto('/admin/eod-sales-report');
    await page.locator('input.form-control, input[type=text]').first().fill(`${dd}/${mm}/${yyyy}`);
    await page.keyboard.press('Enter');
    // The sales point renders as a sub-line under the salesperson's name
    // (`.eod-report-salesperson-cell`), not a separate table column — confirmed by reading
    // eod-sales-report-page.component.html. It was empty on `dev`; assert it now carries the
    // sales-point code for the salesperson row that made the earlier walk-in sale.
    const salespersonCell = page.locator('.eod-report-salesperson-cell', { hasText: 'Sales Person' });
    await expect(salespersonCell).toContainText(/BAN_BUENG|NONG_CHAK/);
    await page.screenshot({ path: `e2e-evidence/obrs-1258/OBRS-1258-AFTER-3-eod-report-sales-point-column.png` });
  });
});
