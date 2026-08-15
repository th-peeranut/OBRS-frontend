/**
 * OBRS-1370. The lane's own hermeticity, measured instead of declared.
 *
 * `playwright.gate.config.ts` used to argue this lane was "provably hermetic" because a
 * request nobody intercepted would hit `localhost:8080` and get ECONNREFUSED. That is only
 * true of traffic routed through `apiUrl`. An absolute third-party URL inside a stylesheet
 * or a fixture never goes near `apiUrl`, so `src/styles.scss` fetched two Google Fonts
 * stylesheets and their woff2 files on EVERY page load in this lane, unnoticed, until a
 * gstatic 404 turned the `dev` merge red on a tree that had just passed on the PR
 * (OBRS-1369). Nothing in the lane was ever going to catch that, because nothing looked.
 *
 * This spec looks. It sweeps the same customer pages the contrast gate sweeps and fails on
 * any request to a host outside this machine. The allow list below is the whole exemption
 * surface, and every entry carries the reason it never reaches the network.
 *
 * WHY A REQUEST-LEVEL ASSERTION AND NOT A COMMENT. The previous mechanism was a paragraph
 * claiming a property the code did not have. A paragraph cannot go red. This can, and a new
 * external origin -- a CDN, an analytics beacon, a font -- turns it red on the commit that
 * adds it rather than on whichever unlucky card is mid-merge when the CDN hiccups.
 *
 * ASCII-only source.
 */

import { expect, test } from '@playwright/test';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';

/**
 * Hosts allowed to be REQUESTED. Not "allowed to be reached": every one of these is aborted
 * by a route handler in `seedCustomerSession` before it leaves the machine, and Playwright
 * reports an intercepted request the same way it reports one that flew. No event separates
 * the two, so the exemption is stated here with its reason rather than inferred.
 *
 * Adding a host here is meant to cost a sentence. That is the point: the two Google Fonts
 * origins this card removed had been in the lane for months precisely because nothing ever
 * asked anyone to justify them.
 */
const ALLOWED_FOREIGN_HOSTS = new Map<string, string>([
  [
    'maps.googleapis.com',
    'aborted in seedCustomerSession -- the Home page waits on the Maps bootstrap otherwise',
  ],
  [
    'accounts.google.com',
    'aborted in seedCustomerSession -- /login pulls the Google Identity Services client and ' +
      'nothing in this lane signs in with Google',
  ],
  ['ssl.gstatic.com', 'aborted in seedCustomerSession -- second hop of the GIS client above'],
]);

/** localhost:4230 is the dev server; localhost:8080 is the dead `apiUrl` (rule 2). */
function isThisMachine(host: string): boolean {
  const hostname = host.split(':')[0];
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

test.describe('OBRS-1370 - the gate lane stays inside this machine', () => {
  test('no page in the customer sweep requests a host outside this machine', async ({
    browser,
  }) => {
    /** host -> one example URL, so a failure names WHAT leaked and not just where from. */
    const leaks = new Map<string, string>();

    for (const target of CUSTOMER_PAGES) {
      const context = await browser.newContext();
      const sheet = await context.newPage();
      sheet.on('request', (req) => {
        const url = req.url();
        // data:/blob:/about: never touch the network and have no host to compare.
        if (!url.startsWith('http://') && !url.startsWith('https://')) return;
        const host = new URL(url).host;
        if (isThisMachine(host) || ALLOWED_FOREIGN_HOSTS.has(host)) return;
        if (!leaks.has(host)) leaks.set(host, `${target.key}: ${url}`);
      });
      try {
        await seedCustomerSession(sheet, false);
        await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
        if (target.seed) await seedStore(sheet, target.storeOverride?.());
        await sheet.waitForTimeout(2500);
      } finally {
        await context.close();
      }
    }

    const report = [...leaks.entries()].sort().map(([host, example]) => `  ${host}\n      ${example}`);
    expect(
      report,
      `${report.length} host(s) outside this machine were requested by this lane. A gate that ` +
        `reaches the public internet is a gate a stranger's CDN can turn red:\n${report.join('\n')}`
    ).toEqual([]);
  });
});
