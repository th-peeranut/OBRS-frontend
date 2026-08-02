import { expect, test, Page } from '@playwright/test';

/**
 * OBRS-874 AC-5 — what the two tags actually store on the visitor's device.
 *
 * The output of this spec is a LIST, printed to the run log, that OBRS-631 AC-5
 * copies into the privacy notice's cookie section. It is written as a test
 * rather than as a throwaway script for one reason: the list rots. A vendor
 * that adds a cookie makes the published notice quietly false, and the only
 * defence is a measurement anyone can re-run in one command.
 *
 * METHOD — a difference, not a snapshot
 * Everything is read BEFORE consent and again AFTER, and only the difference is
 * reported. The app writes its own keys (theme, language, the consent answer
 * itself); a snapshot taken after accepting would blame the vendors for those
 * too, and a notice that lists our own `obrs_*` keys as third-party cookies is
 * wrong in the direction that looks thorough.
 *
 * Runs against the DEPLOYED SIT site — see playwright.obrs874census.config.ts
 * for why a local build cannot answer this question.
 */

interface Census {
  cookies: string[];
  localStorage: string[];
  sessionStorage: string[];
}

async function readCensus(page: Page): Promise<Census> {
  return page.evaluate(() => ({
    cookies: document.cookie
      .split(';')
      .map((pair) => pair.split('=')[0].trim())
      .filter(Boolean)
      .sort(),
    localStorage: Object.keys(window.localStorage).sort(),
    sessionStorage: Object.keys(window.sessionStorage).sort(),
  }));
}

function added(before: string[], after: string[]): string[] {
  const seen = new Set(before);
  return after.filter((name) => !seen.has(name));
}

/** The tags are async; silence has to be given a chance to be broken. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(6000);
}

test('OBRS-874 AC-5: census what GA4 and Clarity store, before vs after consent', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.consent-banner')).toBeVisible();
  await settle(page);

  const before = await readCensus(page);

  // MUST-CATCH in the "before" direction: if anything vendor-shaped is already
  // here, the consent gate itself is broken and the census is the lesser news.
  const vendorBefore = [...before.cookies, ...before.localStorage].filter((name) =>
    /^(_ga|_gid|_gat|_clck|_clsk|CLID|MUID|ANONCHK|SRM_)/i.test(name)
  );
  expect(
    vendorBefore,
    'a measurement cookie exists BEFORE consent — the gate is broken'
  ).toEqual([]);

  await page.locator('.consent-banner__btn--accept').click();
  await expect(page.locator('.consent-banner')).toHaveCount(0);
  await settle(page);
  // A second page gives Clarity a navigation to record and GA4 a second hit.
  await page.goto('/how-to-book');
  await settle(page);

  const after = await readCensus(page);

  const report = {
    cookiesAdded: added(before.cookies, after.cookies),
    localStorageAdded: added(before.localStorage, after.localStorage),
    sessionStorageAdded: added(before.sessionStorage, after.sessionStorage),
  };

  // The deliverable. Printed, not asserted against a hardcoded list: a list
  // pinned in an expectation would have to be edited to stay green, which turns
  // the vendor's change into a chore instead of a signal.
  console.log(
    '\nOBRS-874 AC-5 — measured on %s\n%s\n',
    new Date().toISOString(),
    JSON.stringify(report, null, 2)
  );

  // MUST-CATCH in the "after" direction: without this, a lane pointed at a
  // build with blank IDs would report an empty diff and read as "the tags store
  // nothing", which is the false statement OBRS-631 AC-18 exists to prevent.
  expect(
    [...report.cookiesAdded, ...report.localStorageAdded].some((name) =>
      /^(_ga|_gid|_gat|_clck|_clsk|CLID|MUID|ANONCHK|SRM_)/i.test(name)
    ),
    'accepting stored NO vendor cookie — either the IDs are blank on this deployment or the tags were blocked; the census would be a false empty'
  ).toBe(true);
});
