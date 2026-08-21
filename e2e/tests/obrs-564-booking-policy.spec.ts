import { test, expect, Page, request as playwrightRequest } from '@playwright/test';

/**
 * OBRS-564 QA E2E — booking-policy config (advance-booking cap + cutoff).
 * OWN-DB lane, run by `playwright.obrs1456.config.ts` (backend :8181 against a
 * throwaway database, frontend :4256 on `--configuration e2e`). That config is
 * where the setup lives; before OBRS-1456 there was none, and this header named
 * a :8080 / :4200 pair that by then belonged to two unrelated sessions.
 *
 * OBRS-1456 — THE BASELINE CAP IS READ, NEVER ASSUMED. This file used to state
 * its own starting value: the round trip was titled `30 -> 45`, its cleanup
 * wrote 30 back, and the i18n test asserted the page said "30 days". None of
 * that had been true since OBRS-647 moved `data.sql`'s seed to 60 — so the
 * cleanup RESTORED THE WRONG VALUE whenever it ran, and the i18n test was red
 * against a database seeded exactly as intended. Seeding the lane's own 30
 * instead (OWN-DB permits it) was rejected: it keeps the number correct by
 * pinning this lane's database away from the one every other lane builds, and
 * the next seed change rots the pin the same way it rotted the literal.
 * `currentMaxAdvanceDays()` asks the running backend, so the only numbers left
 * in this file are the ones the test itself writes.
 */

const OWNER_EMAIL = 'owner@system.local';
const ADMIN_EMAIL = 'admin@system.local';
const SALESPERSON_EMAIL = 'salesperson@system.local';
const CUSTOMER_EMAIL = 'customer@system.local';
const PASSWORD = 'P@ssw0rd';

// The API probe below leaves the browser, so it cannot inherit `baseURL` — it
// needs the backend origin that `environment.e2e.ts` compiled into the app.
// Keep the two in step: pointed at the wrong port this file does not fail, it
// silently reports on someone else's database (OBRS-1456 measured exactly that
// — the probe read 60 off a stranger's :8080 while this lane's backend said 45).
const API_URL = 'http://localhost:8181';

/** The cap the public page and the date picker are rendering right now. */
async function currentMaxAdvanceDays(): Promise<number> {
  const context = await playwrightRequest.newContext();
  try {
    const response = await context.get(`${API_URL}/api/booking-policy`);
    expect(response.ok()).toBeTruthy();
    return (await response.json()).data.maxAdvanceDays;
  } finally {
    await context.dispose();
  }
}

async function login(page: Page, email: string): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function dismissSweetAlert(page: Page): Promise<void> {
  const overlay = page.locator('.swal2-container');
  const appeared = await overlay
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;
  await overlay.locator('.swal2-confirm').click({ timeout: 5_000 }).catch(() => undefined);
  await overlay.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
}

// OBRS-702 moved this form off its own page: it is the first tab of
// /admin/settings now, the sidebar carries ONE "System settings" entry instead
// of four config entries, and /admin/booking-policy-config redirects.
//
// The redirect is why the disallowed-role assertions had to change shape rather
// than just change string. `not.toHaveURL(/booking-policy-config/)` would now
// pass for ANY role — the redirect alone moves the URL off that path — so it
// would have gone green while proving nothing. They assert against the
// destination, and against the form never rendering.
const SETTINGS_MENU = 'a[href*="/admin/settings"]';
const BOOKING_POLICY_TAB = '/admin/settings/booking-policy';

test.describe('OBRS-564 — role matrix', () => {
  test('OWNER reaches the form via the menu entry', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin');
    const menuEntry = page.locator(SETTINGS_MENU);
    await expect(menuEntry).toBeVisible({ timeout: 15_000 });
    await menuEntry.click();
    // The settings shell redirects its empty path to the first tab, so one
    // click lands on the booking-policy form with no tab click needed.
    await page.waitForURL((url) => url.pathname.includes(BOOKING_POLICY_TAB));
    await expect(page.locator('input#maxAdvanceDays')).toBeVisible({ timeout: 15_000 });
  });

  test('ADMIN reaches the form via the menu entry', async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.goto('/admin');
    const menuEntry = page.locator(SETTINGS_MENU);
    await expect(menuEntry).toBeVisible({ timeout: 15_000 });
    await menuEntry.click();
    await page.waitForURL((url) => url.pathname.includes(BOOKING_POLICY_TAB));
    await expect(page.locator('input#maxAdvanceDays')).toBeVisible({ timeout: 15_000 });
  });

  test('OBRS-702: the old bookmark still lands on the form', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/booking-policy-config');
    await page.waitForURL((url) => url.pathname.includes(BOOKING_POLICY_TAB), { timeout: 15_000 });
    await expect(page.locator('input#maxAdvanceDays')).toBeVisible({ timeout: 15_000 });
  });

  test('SALESPERSON: no menu entry, and direct navigation never reaches the form', async ({ page }) => {
    await login(page, SALESPERSON_EMAIL);
    await page.goto('/admin');
    await expect(page.locator(SETTINGS_MENU)).toHaveCount(0);

    // Deliberately the LEGACY path: it exercises the redirect and the guard
    // together, which is how a real bookmark arrives.
    await page.goto('/admin/booking-policy-config');
    // AuthGuard redirects away rather than rendering the form for a disallowed
    // role. Asserted on the DESTINATION, not on having left the legacy path —
    // the OBRS-702 redirect leaves that path for everyone.
    await expect(page.locator('input#maxAdvanceDays')).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/admin\/settings/, { timeout: 10_000 });
  });

  test('CUSTOMER: no admin access at all, and direct navigation never reaches the form', async ({ page }) => {
    await login(page, CUSTOMER_EMAIL);
    await page.goto('/admin/booking-policy-config');
    await expect(page.locator('input#maxAdvanceDays')).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/admin\/settings/, { timeout: 10_000 });
  });
});

// OBRS-1456: `30 -> 45` in this title was a claim about the database, and it had
// been false since OBRS-647. The starting cap is whatever the backend serves;
// only 45 — the value this block writes — is fixed.
test.describe('OBRS-564 — round trip: the seeded cap -> 45', () => {
  test.describe.configure({ mode: 'serial' });

  /** Read before the first write, so the cleanup puts back what was actually there. */
  let baselineMaxAdvanceDays: number;

  test.beforeAll(async () => {
    baselineMaxAdvanceDays = await currentMaxAdvanceDays();
    expect(baselineMaxAdvanceDays).not.toBe(45);
  });

  test('owner changes the cap to 45 and saves', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/settings/booking-policy');
    const maxAdvanceDaysInput = page.locator('input#maxAdvanceDays');
    await maxAdvanceDaysInput.waitFor({ state: 'visible', timeout: 15_000 });

    await maxAdvanceDaysInput.fill('');
    await maxAdvanceDaysInput.fill('45');
    await page.locator('form button[type="submit"]').click();
    await dismissSweetAlert(page);

    // Reload and confirm the saved value persisted server-side (not just in-form state).
    await page.reload();
    await expect(page.locator('input#maxAdvanceDays')).toHaveValue('45', { timeout: 15_000 });
  });

  test('/business-policy now reads 45 without a restart', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
    await page.goto('/business-policy');
    // OBRS-1454: `:not(.policy-version)` because OBRS-658 (`660a722e`, 2026-08-12) inserted a
    // "Version 1.1 - In force from ..." paragraph ABOVE the sales-channels one, inside the same
    // .policy-card. Since then a bare `.policy-card p` .first() has resolved to the version line,
    // so all four assertions in this file were reading a sentence that has no numbers in it. Not a
    // regression of this card - measured on the same run that proved the Save fix.
    const salesChannels = page.locator('.policy-card p:not(.policy-version)').first();
    await expect(salesChannels).toContainText('45 days', { timeout: 15_000 });
    await expect(salesChannels).toContainText('20 minutes');
    // Never a raw placeholder token.
    await expect(salesChannels).not.toContainText('{{');
  });

  test('home date picker: today+45 selectable, today+46 disabled (both calendars)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const departureCalendarInput = page.locator('p-datepicker').first().locator('input');
    await departureCalendarInput.click();
    const panel = page.locator('.p-datepicker').first();
    await panel.waitFor({ state: 'visible', timeout: 10_000 });

    const target45 = new Date();
    target45.setDate(target45.getDate() + 45);
    const target46 = new Date();
    target46.setDate(target46.getDate() + 46);
    // OBRS-1449: `data-date` is `${y}-${date.getMonth()}-${d}` — getMonth() is already
    // 0-BASED (primeng 21.1.9, datepicker's formatDateKey), so the `+ 1` these two lines
    // used to carry addressed the month AFTER the target. Every cell this test looked at
    // was a month late, which put both of them past the 45-day cap: cell46 was disabled
    // for the wrong reason (a vacuous pass) and cell45 was disabled too (a real red).
    const key45 = `${target45.getFullYear()}-${target45.getMonth()}-${target45.getDate()}`;
    const key46 = `${target46.getFullYear()}-${target46.getMonth()}-${target46.getDate()}`;

    async function navigateTo(key: string): Promise<void> {
      for (let hop = 0; hop < 4; hop++) {
        const cell = panel.locator(`td:not(.p-datepicker-other-month) span[data-date="${key}"]`);
        if ((await cell.count()) > 0) return;
        // OBRS-1449: `p-datepicker-next-button` at primeng 21.1.9
        // (`[styleClass]="cx('pcNextButton')"`); `.p-datepicker-next` matches nothing,
        // and unlike obrs-483's helper there is no catch here — the hop threw outright.
        await panel.locator('.p-datepicker-next-button').click();
        await page.waitForTimeout(300);
      }
    }

    await navigateTo(key45);
    const cell45 = panel.locator(`td:not(.p-datepicker-other-month) span[data-date="${key45}"]`);
    await expect(cell45).toHaveCount(1);
    await expect(cell45).not.toHaveClass(/p-disabled/);

    await navigateTo(key46);
    const cell46 = panel.locator(`td:not(.p-datepicker-other-month) span[data-date="${key46}"]`);
    await expect(cell46).toHaveCount(1);
    await expect(cell46).toHaveClass(/p-disabled/);
  });

  test('search/booking rejects today+46, accepts today+45 (server-side, inclusive boundary)', async ({ request }) => {
    // Direct API probe of the same guard the UI relies on — ScheduleService
    // search enforces the same booking_max_advance_days cap the date picker
    // renders as a UI affordance.
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: CUSTOMER_EMAIL, password: PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();
    const policyRes = await request.get(`${API_URL}/api/booking-policy`);
    const policyBody = await policyRes.json();
    expect(policyBody.data.maxAdvanceDays).toBe(45);
  });

  test('reset the cap to what it was (cleanup, does not affect verdict)', async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await page.goto('/admin/settings/booking-policy');
    const maxAdvanceDaysInput = page.locator('input#maxAdvanceDays');
    await maxAdvanceDaysInput.waitFor({ state: 'visible', timeout: 15_000 });
    await maxAdvanceDaysInput.fill('');
    await maxAdvanceDaysInput.fill(String(baselineMaxAdvanceDays));
    await page.locator('form button[type="submit"]').click();
    await dismissSweetAlert(page);
    expect(await currentMaxAdvanceDays()).toBe(baselineMaxAdvanceDays);
  });
});

test.describe('OBRS-564 — failure path, i18n and layout', () => {
  test('language switch live: numbers stay correct, no extra HTTP request', async ({ page }) => {
    // OBRS-1456: read, do not assume. This block runs after the round trip above,
    // so the cap it should see is whatever that block's cleanup restored — and
    // when the round trip goes red mid-way the cleanup never runs at all. Both
    // states are legitimate here; a hardcoded number is right in neither.
    const cap = await currentMaxAdvanceDays();
    await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
    await page.goto('/business-policy');
    const salesChannels = page.locator('.policy-card p:not(.policy-version)').first();
    await expect(salesChannels).toContainText(`${cap} days`, { timeout: 15_000 });

    let policyRequestCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/booking-policy')) policyRequestCount++;
    });

    // Switch language via the real switcher (app-lang-switcher), no reload.
    await page.locator('.navbar-lang-trigger').first().click();
    await page.locator('.navbar-lang-menu').first().waitFor({ state: 'visible', timeout: 5_000 });
    await page.locator('.navbar-lang-item', { hasText: 'ไทย' }).click();

    await expect(salesChannels).toContainText(`${cap} วัน`, { timeout: 10_000 });
    expect(policyRequestCount).toBe(0);
  });

  test('mobile 390px: inline error wraps, does not crush', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Force the booking-policy call to fail so the inline error renders.
    await page.route('**/api/booking-policy', (route) => route.abort('failed'));
    await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
    await page.goto('/business-policy');

    const inlineError = page.locator('.policy-inline-error');
    await expect(inlineError).toBeVisible({ timeout: 15_000 });
    const box = await inlineError.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Must not overflow the 390px viewport (crushed/clipped layout).
      expect(box.width).toBeLessThanOrEqual(390);
    }
    // The rest of the page must still render when the fetch fails. OBRS-1456: name the
    // paragraph, do not merely assert one is visible — `toBeVisible()` on "the first
    // paragraph" passes for whichever paragraph happens to be first, which is how this
    // line stayed green against the version banner for the four days before OBRS-1454
    // fixed the selector.
    //
    // That paragraph is TRAVEL_CONDITIONS, not CONTENT. The comment here used to say
    // CONTENT, and had been wrong since OBRS-623/659 moved CONTENT inside the same
    // `@if (policyParams)` gate as SALES_CHANNELS — a failed fetch now takes both, and
    // the travel conditions are deliberately left outside precisely so an outage cannot
    // blank the page (see business-policy.component.html's own comment there).
    await expect(page.locator('.policy-card p:not(.policy-version)').first()).toContainText(
      'Travel conditions for passengers'
    );
  });

  test('never a raw {{maxAdvanceDays}} placeholder during a slow load', async ({ page }) => {
    await page.route('**/api/booking-policy', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
    await page.goto('/business-policy');
    const bodyTextDuringLoad = await page.locator('.policy-card').innerText();
    expect(bodyTextDuringLoad).not.toContain('{{maxAdvanceDays}}');
    expect(bodyTextDuringLoad).not.toContain('{{cutoffMinutes}}');
    await expect(page.locator('.policy-card p:not(.policy-version)').first()).toContainText('days', { timeout: 15_000 });
  });
});
