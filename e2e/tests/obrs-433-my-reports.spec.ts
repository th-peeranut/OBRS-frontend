import { test, expect, Page } from '@playwright/test';

/**
 * OBRS-433 QA E2E — "My Reports" journey. Runs against the local full-stack
 * QA lane started by hand for this card (obrs433qa DB, backend on :8080,
 * `ng serve --configuration sit` on :4200 with apiUrl temp-overridden to
 * localhost). Not part of the committed regression suite.
 */

const CUSTOMER_EMAIL = 'customer@system.local';
const CUSTOMER_PASSWORD = 'P@ssw0rd';

/** A SweetAlert2 success/error toast can linger over the page and intercept
 * clicks underneath it (PIPELINE lesson: cold ng serve + global SweetAlert2
 * overlay fakes "broken/slow"). Wait for it to clear before the next click. */
async function waitForNoOverlay(page: Page): Promise<void> {
  const overlay = page.locator('.swal2-container');
  // The alert can appear asynchronously right after the action that triggers
  // it -- give it a moment to show up before deciding there's nothing to
  // dismiss, or a "not present yet" read races "not present anymore" as a
  // false negative (both look identical: zero matches).
  const appeared = await overlay
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;
  // This SweetAlert2 confirmation ("Your report has been updated.") requires
  // an explicit OK click -- it does not auto-dismiss.
  const okButton = overlay.locator('.swal2-confirm, button:has-text("OK")');
  await okButton.click({ timeout: 5_000 }).catch(() => undefined);
  await overlay.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
}

async function loginAsCustomer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
  });
  await page.goto('/login');
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('input[type="email"]').fill(CUSTOMER_EMAIL);
  await page.locator('input[type="password"]').fill(CUSTOMER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
}

test('OBRS-433 My Reports: list -> detail -> edit-while-new -> follow-up', async ({ page }) => {
  await loginAsCustomer(page);

  // 1. Journey: navigate to /my-reports, see own reports newest-first.
  await page.goto('/my-reports');
  await page.locator('.report-card:not(.report-card--skeleton)').first().waitFor({ timeout: 30_000 });
  const cards = page.locator('.report-card');
  await expect(cards).toHaveCount(4); // exactly the 4 seeded for customer@system.local
  await page.screenshot({ path: 'e2e-evidence/OBRS-433/01-list-before.png', fullPage: true });

  // Open the report seeded WITH a follow-up + status=new (LazyInit repro target).
  const targetCard = cards.filter({ hasText: 'report WITH an existing follow-up' });
  await targetCard.first().click();
  await page.locator('.mr-detail-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: 'e2e-evidence/OBRS-433/02-detail-new-with-followup.png' });

  // Follow-up timeline shows the pre-seeded note, and Edit is offered (status=new).
  await expect(page.locator('.mr-detail-modal')).toContainText('QA-SEED');
  await expect(page.locator('button', { hasText: 'Edit' })).toBeVisible();

  // 2. Edit-while-new: open edit, change description, save -> persists.
  await page.locator('button', { hasText: 'Edit' }).click();
  await page.locator('.mr-edit-form').waitFor({ state: 'visible', timeout: 10_000 });
  const newDescription = 'OBRS-433 QA E2E: edited via browser while status=new';
  await page.locator('#mr-edit-description').fill(newDescription);
  await page.screenshot({ path: 'e2e-evidence/OBRS-433/03-edit-form.png' });
  await page.locator('.mr-edit-form button[type="submit"]').click();
  await page.locator('.mr-detail-modal').locator('text=' + newDescription).waitFor({ timeout: 15_000 });
  await waitForNoOverlay(page);
  await page.screenshot({ path: 'e2e-evidence/OBRS-433/04-after-edit-saved.png' });

  // 3. Follow-up any status: add a follow-up note here (status=new).
  await waitForNoOverlay(page);
  await page.locator('#mr-follow-up-note').fill('OBRS-433 QA E2E: follow-up added via browser');
  await page.screenshot({ path: 'e2e-evidence/OBRS-433/05-follow-up-composer.png' });
  await page.locator('.mr-follow-up-composer button[type="submit"]').click();
  await page.locator('.mr-detail-modal').locator('text=follow-up added via browser').waitFor({ timeout: 15_000 });
  await waitForNoOverlay(page);
  await page.screenshot({ path: 'e2e-evidence/OBRS-433/06-after-follow-up.png' });

  await page.locator('.mr-detail-modal__close').click();

  // Open a NON-new report (resolved) -> Edit affordance must NOT be offered.
  const resolvedCard = page.locator('.report-card').filter({ hasText: 'Resolved' });
  await resolvedCard.first().click();
  await page.locator('.mr-detail-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await expect(page.locator('.mr-detail-modal button', { hasText: 'Edit' })).toHaveCount(0);
  await page.screenshot({ path: 'e2e-evidence/OBRS-433/07-resolved-no-edit-affordance.png' });

  // Follow-up composer still present/usable on a terminal-status report.
  await expect(page.locator('#mr-follow-up-note')).toBeVisible();
});
