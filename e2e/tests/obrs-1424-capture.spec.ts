import { Page, expect, test } from '@playwright/test';
import { seedAnalyticsConsent } from '../support/analytics-consent';
import { seedCustomerSession } from '../support/customer-pages';
import { MEASURE, Sweep } from '../support/customer-contrast';

/**
 * OBRS-1424 evidence capture - see playwright.obrs1424capture.config.ts for how to run it.
 *
 * WHY THIS EXISTS WHEN THE GATE ALREADY SWEEPS THIS PAGE
 *
 * `/track-parcel` joined `CUSTOMER_PAGES` under OBRS-970, so the contrast gate measures it
 * on every run and would catch a regression of the h1 without any help from this file. Two
 * things it will still never measure, both stated out loud in that entry's own comment:
 *
 *   1. The page AT REST is all it loads. Everything past a lookup response - the status
 *      chip, the timeline rows, the not-found line - needs an answer that entry does not
 *      drive, so those surfaces are unswept. This card's AC-3 asks for them specifically,
 *      because the card background is exactly what changes underneath them.
 *   2. Pictures. The gate prints ratios; a human reviewing a theme change needs the screen.
 *
 * The same MEASURE the gate uses is used here, narrowed to the card, so a number printed by
 * this file and a number printed by the gate mean the same thing.
 *
 * Screenshots land in e2e-evidence/ (gitignored) - the only prefix the e2e lane gate allows -
 * are uploaded to the card from there, then deleted.
 */

const PHASE = (process.env['OBRS1424_PHASE'] ?? 'AFTER').toUpperCase();
const ASSETS = `e2e-evidence/obrs-1424`;

const ok = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ code: 200, message: 'OK', data }),
});

/**
 * Every `parcel_delivery_status` slug in PARCEL_STATUS_CHIP_MAP, with the chip class each
 * one resolves to. Enumerated rather than sampled: AC-3 asks whether the chips still read
 * on the new surface, and the component re-scopes SEVEN `--admin-*` token pairs onto its
 * host while `:host-context(body.is-dark)` overrides only two of them. Which of the other
 * five actually appears on this page is decided by this map, not by taste.
 */
const STATUSES: Array<{ slug: string; chip: string }> = [
  { slug: 'created', chip: 'is-neutral' },
  { slug: 'accepted', chip: 'is-accepted' },
  { slug: 'in_transit', chip: 'is-warning' },
  { slug: 'arrived_notified', chip: 'is-info' },
  { slug: 'collected', chip: 'is-success' },
  { slug: 'left_at_stop', chip: 'is-delayed' },
  { slug: 'unclaimed_returned', chip: 'is-neutral' },
  { slug: 'rejected', chip: 'is-danger' },
];

const trackPayload = (slug: string) => ({
  trackingNumber: 'NJP1424TEST',
  deliveryStatus: slug,
  pickupStop: { name: 'Nong Chak' },
  dropoffStop: { name: 'Mo Chit' },
  arrivedNotifiedAt: '2026-08-18T09:30:00',
  collectedAt: slug === 'collected' ? '2026-08-18T14:05:00' : undefined,
  leftAtStopAt: slug === 'left_at_stop' ? '2026-08-18T15:40:00' : undefined,
  recipientNameMasked: 'S*****t P.',
});

/**
 * Registered AFTER seedCustomerSession on purpose. That helper installs a catch-all
 * `**\/api/**` handler that answers every unmatched path with `data: null`, and Playwright
 * matches handlers most-recently-added first - so this one wins for the tracking call and
 * the catch-all still covers everything else on the page.
 */
async function stubTrack(page: Page, slug: string): Promise<void> {
  await page.route('**/api/parcels/track/**', (route) => route.fulfill(ok(trackPayload(slug))));
}

/** Findings only - MEASURE returns everything it could score, pass or fail. */
const failing = (s: Sweep) => [
  ...s.text.filter((f) => f.ratio < f.floor).map((f) => `TEXT  ${f.ratio.toFixed(2)}:1 (needs ${f.floor}) ${f.fg}-on-${f.bg} ${f.path} -- "${f.text}"`),
  ...s.placeholders.filter((f) => f.ratio < f.floor).map((f) => `PLCH  ${f.ratio.toFixed(2)}:1 (needs ${f.floor}) ${f.fg}-on-${f.bg} ${f.path}`),
  ...s.controls.filter((c) => c.boundary < 3).map((c) => `BOUND ${c.boundary.toFixed(2)}:1 (needs 3) fill ${c.fill} border ${c.border} on ${c.page} ${c.path}`),
];

/** Every text run in the card, pass or fail - AC-2 asks for the values, not just the misses. */
const allText = (s: Sweep) =>
  s.text
    .slice()
    .sort((a, b) => a.ratio - b.ratio)
    .map((f) => `      ${f.ratio.toFixed(2)}:1 (floor ${f.floor}) ${f.fg} on ${f.bg}  ${f.path} -- "${f.text.slice(0, 40)}"`);

test.describe(`OBRS-1424 ${PHASE} — /track-parcel card in dark mode`, () => {
  test('capture the two states in both themes, and measure every text run in the card', async ({
    browser,
  }) => {
    const report: string[] = [];
    let shot = 0;

    for (const dark of [true, false]) {
      const theme = dark ? 'dark' : 'light';
      const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
      const sheet = await context.newPage();
      try {
        await seedCustomerSession(sheet, dark);
        // The consent bar is `position: fixed; bottom: 0` and would sit across the bottom of
        // every shot. Its own reachability is OBRS-1372's question, not this card's.
        await seedAnalyticsConsent(sheet);
        await stubTrack(sheet, 'arrived_notified');

        await sheet.goto('/track-parcel', { waitUntil: 'domcontentloaded' });
        await expect(sheet.locator('.parcel-tracking-form')).toBeVisible();
        // The precondition, asserted rather than assumed: a renamed theme key would shoot
        // the light theme twice and both pictures would look correct.
        expect(await sheet.evaluate(() => document.body.classList.contains('is-dark'))).toBe(dark);

        await sheet.screenshot({
          path: `${ASSETS}/OBRS-1424-${PHASE}-${shot++}-${theme}-at-rest.png`,
          fullPage: true,
        });

        const rest = (await sheet.evaluate(MEASURE, '.parcel-tracking-card')) as Sweep;
        report.push(`[${theme}] AT REST — ${rest.text.length} text run(s) in the card:`);
        report.push(...allText(rest));
        report.push(...failing(rest).map((l) => `  !! ${l}`));

        // ---- found state, one page load per status (AC-3) ------------------------------
        for (const { slug, chip } of STATUSES) {
          const page2 = await context.newPage();
          await seedCustomerSession(page2, dark);
          await seedAnalyticsConsent(page2);
          await stubTrack(page2, slug);
          await page2.goto(`/track-parcel/NJP1424TEST`, { waitUntil: 'domcontentloaded' });
          await expect(page2.locator('.parcel-tracking-result')).toBeVisible();
          await expect(page2.locator(`.admin-status.${chip}`)).toBeVisible();

          const found = (await page2.evaluate(MEASURE, '.parcel-tracking-card')) as Sweep;
          const chipRun = found.text.find((f) => f.path.includes(chip));
          report.push(
            `[${theme}] FOUND ${slug.padEnd(19)} ${chip.padEnd(12)} chip ` +
              (chipRun
                ? `${chipRun.ratio.toFixed(2)}:1 (floor ${chipRun.floor}) ${chipRun.fg} on ${chipRun.bg}`
                : 'NOT MEASURED — the sweep found no text run under that class')
          );
          const bad = failing(found);
          if (bad.length) report.push(...bad.map((l) => `  !! [${theme}/${slug}] ${l}`));

          if (slug === 'arrived_notified') {
            // AC-2 wants the VALUES, not just the misses, and a green run prints no
            // misses at all -- so one status dumps the whole card. This is the status
            // that renders every row shape the timeline has.
            report.push(`[${theme}] FOUND arrived_notified — ${found.text.length} text run(s) in the card:`);
            report.push(...allText(found));
            await page2.screenshot({
              path: `${ASSETS}/OBRS-1424-${PHASE}-${shot++}-${theme}-found-state.png`,
              fullPage: true,
            });
          }
          await page2.close();
        }

        // ---- not-found state ------------------------------------------------------
        // Its own text run, and the one this card's change puts most at risk: the line
        // declares `$text-lightblack`, which is chosen against white and lands on the
        // dark card the moment that card stops being white.
        const miss = await context.newPage();
        await seedCustomerSession(miss, dark);
        await seedAnalyticsConsent(miss);
        await miss.route('**/api/parcels/track/**', (route) =>
          route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":404,"message":"not found"}' })
        );
        await miss.goto('/track-parcel/NOSUCHPARCEL', { waitUntil: 'domcontentloaded' });
        await expect(miss.locator('.parcel-tracking-not-found')).toBeVisible();
        const notFound = (await miss.evaluate(MEASURE, '.parcel-tracking-card')) as Sweep;
        report.push(`[${theme}] NOT FOUND — ${notFound.text.length} text run(s) in the card:`);
        report.push(...allText(notFound));
        report.push(...failing(notFound).map((l) => `  !! [${theme}/not-found] ${l}`));
        await miss.screenshot({
          path: `${ASSETS}/OBRS-1424-${PHASE}-${shot++}-${theme}-not-found.png`,
          fullPage: true,
        });
        await miss.close();
      } finally {
        await context.close();
      }
    }

    console.log(`\n===== OBRS-1424 ${PHASE} =====`);
    for (const line of report) console.log(line);
    console.log(`===== end ${PHASE} =====\n`);

    // Deliberately NOT asserted here. This lane's job is to produce the numbers and the
    // pictures; the verdict on them belongs to the GATE lane, which owns the allowlist and
    // fails the build. Asserting a floor here would put a second, weaker judge on the same
    // question - and the one that runs in CI is the other one.
    expect(report.length).toBeGreaterThan(0);
  });
});
