import { expect, test, Page } from '@playwright/test';

/**
 * OBRS-631 — the 2.0 privacy notice, on the rendered page.
 *
 * `scripts/check-i18n-parity.mjs` already asserts what the notice SAYS (the
 * required PDPA elements) and that its version was published. What it cannot see
 * is whether any of it reaches a reader: the text arrives through `[innerHTML]`,
 * and a `<ul>` inside a `<p>` — which is what 2.0 would have been without the
 * template change — is closed early by the parser, so the markup silently
 * collapses. A string gate reading the JSON would stay green through all of it.
 *
 * So this asserts the RENDERED document, and captures the picture the card needs
 * as evidence in the same pass.
 */

const SECTION_COUNT = 10;

async function openPolicy(page: Page): Promise<void> {
  await page.goto('/privacy-policy');
  await expect(page.locator('.policy-body')).toBeVisible();
}

test.describe('OBRS-631 — the published notice reaches the reader', () => {
  test('renders as ten headed sections, not one wall of text', async ({ page }) => {
    await openPolicy(page);

    // The count is the point: the parser collapsing the markup shows up here as
    // 0, and a section quietly dropped from the notice shows up as 9.
    await expect(page.locator('.policy-body h2')).toHaveCount(SECTION_COUNT);
    expect(await page.locator('.policy-body ul').count()).toBeGreaterThan(0);

    // `h2` must be a real child of the styled container. If the browser had
    // closed a paragraph early, the headings would end up as siblings of it and
    // every rule in the component's SCSS would miss them.
    expect(
      await page.locator('.policy-body > h2').count(),
      'headings are not children of .policy-body — the markup was re-parented'
    ).toBe(SECTION_COUNT);
  });

  test('states the version it is asking consent against', async ({ page }) => {
    await openPolicy(page);

    const stamp = page.getByTestId('privacy-policy-version');
    await expect(stamp).toBeVisible();
    // 2.0 renders from privacy-policy.version.ts, which the i18n ledger pins to
    // the fingerprint of this exact text.
    await expect(stamp).toContainText('2.0');
  });

  test('carries a reachable channel for exercising rights', async ({ page }) => {
    await openPolicy(page);

    // A declared right with no reachable channel is section 23(6) unmet. This is
    // the rendered-page half of the gate's string check.
    const body = (await page.locator('.policy-body').innerText()).replace(/\s+/g, ' ');
    expect(body).toContain('contact@nj-phuyaipu.com');
    expect(body).toContain('09 0562 2019');
  });

  test('offers the withdrawal control the notice promises (OBRS-874)', async ({
    page,
  }) => {
    await openPolicy(page);

    // The notice says the button is at the end of this page. If OBRS-874 were
    // ever reverted, this notice would be making a promise the app cannot keep —
    // the OBRS-627 defect, which this card's own description warns against.
    await expect(page.getByTestId('analytics-consent-control')).toBeVisible();
  });

  test('AFTER evidence: the notice as a reader sees it', async ({ page }) => {
    await openPolicy(page);
    await page.screenshot({
      path: 'e2e-evidence/obrs-631-privacy-notice-2-0.png',
      fullPage: true,
    });
  });
});
