import { expect, test, Page } from '@playwright/test';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';
import {
  ADMIN_SWEEP,
  CUSTOMER_HOST,
  CUSTOMER_SWEEP,
  MalformedHost,
  PUBLIC_SWEEP,
  SweepPage,
  newSweepPage,
  scanMalformedHosts,
  seedAnonymousSession,
  seedStaffSession,
  visit,
} from '../support/host-boxes';

/**
 * OBRS-775 -- the codebase-wide sweep for `display: inline` component hosts
 * wrapping block-level children. OBRS-753 fixed one such host and its card said
 * plainly that the rest of the codebase had not been counted. This is the count,
 * and the gate that keeps it from growing.
 *
 * WHAT THIS ASSERTS. Every custom-element host on every page this lane can reach
 * hermetically -- eight customer pages, nine public/auth-entry routes, ten
 * admin/staff/session-bound routes -- is either well-formed or named on ALLOW
 * with a reason. A host that is neither fails the run. A component added
 * tomorrow that forgets its `:host { display }` therefore reds the gate on the
 * first run, whether or not anyone remembers this card exists -- which is the
 * whole point, because the defect is a MISSING declaration and there is nothing
 * in a diff to review.
 *
 * WHY THE ALLOW-LIST IS NOT A CLIMBDOWN. Sweeping every entry off it in one
 * commit is exactly what the card forbids. `:host { display: block }` is not a
 * no-op: a child's `width: %` and `min-width: %` resolve against the containing
 * block, and a `:host` display is precisely what moves the containing block --
 * from the enclosing element to the host itself. Margin collapsing moves with
 * it. OBRS-753 proved its one fix invisible by measuring coordinates at four
 * viewports before and after; that price is per component, and it is the price.
 * `e2e/tests/obrs-775-geometry.spec.ts` is the harness that pays it, and
 * `docs/manual-tests/OBRS-775-host-box-geometry.md` records what it measured.
 *
 * THE STALE-ENTRY CHECK MATTERS AS MUCH AS THE MALFORMED-HOST CHECK. An
 * allow-list nobody prunes silently becomes a list of components fixed long ago
 * plus a few that never existed, and then the next person reads its length as
 * the size of the problem. `no stale ALLOW entries` fails on any entry the sweep
 * did not actually see, so the number below is a measurement and not a memory.
 *
 * ASCII-only source.
 */

/**
 * Hosts known to be malformed and not yet fixed, each with the reason it is
 * still here. Measured, not guessed: every entry was produced by a real run of
 * this sweep on 2026-07-27, and the stale-entry case fails the day one stops
 * being seen.
 *
 * The first run of this sweep found 39. Thirty-five were ours and are fixed on
 * this branch. The four below are PrimeNG's, and they are a different job rather
 * than a harder one: the host element belongs to a library component, so no
 * `:host` rule of ours can reach it -- the fix is a global rule in `styles/`,
 * which lands on EVERY instance in the app at once, including the ones on pages
 * this sweep does not visit. The geometry harness only covers 27 pages, so
 * shipping that here would mean asserting something over a population I did not
 * measure. Widening the sweep first is OBRS-776.
 */
const ALLOW: Record<string, string> = {
  'p-tabview': 'PrimeNG. Host is the library element, so only a global rule reaches it -- OBRS-776.',
  'p-tabpanel': 'PrimeNG, and always inside p-tabview; fixing it alone would prove nothing -- OBRS-776.',
  'p-card': 'PrimeNG. Also renders in admin forms outside this sweep, so a global rule is unmeasured here -- OBRS-776.',
  'p-calendar': 'PrimeNG. Its block child is a span PrimeNG generates, not markup of ours -- OBRS-776.',
};

/** Every malformed host the whole sweep saw, keyed by tag. Read by the last two tests. */
const census = new Map<string, MalformedHost>();

async function sweep(page: Page, pages: SweepPage[], seedFn?: (p: Page) => Promise<void>): Promise<void> {
  for (const p of pages) {
    await visit(page, p, seedFn);
    const hosts = await scanMalformedHosts(page, p.key);
    for (const h of hosts) if (!census.has(h.tag)) census.set(h.tag, h);
    // eslint-disable-next-line no-console
    console.log(`OBRS775 ${p.key} malformed=${hosts.length} ` + JSON.stringify(hosts.map((h) => h.tag)));
  }
}

// Serial: the three sweeps feed one census, and the last two tests read it. A
// partial census would report entries as stale that a skipped page would have
// seen, so a failed sweep must skip what follows rather than mislead it.
test.describe.configure({ mode: 'serial' });

test.describe('OBRS-775 malformed host boxes', () => {
  test('the detector fires, and only on real malformation', async ({ page }) => {
    // A gate is a claim that it goes red on the thing it names. This case proves
    // that against DOM built for the purpose, so the proof does not depend on any
    // component staying broken -- which is the trap in "it caught the bug once".
    await page.goto('/business-policy');

    await page.evaluate(() => {
      const mk = (tag: string, hostCss: string, childCss: string) => {
        const host = document.createElement(tag);
        host.setAttribute('style', hostCss);
        const child = document.createElement('div');
        child.setAttribute('style', childCss);
        child.textContent = 'x';
        host.appendChild(child);
        document.body.appendChild(host);
      };
      // MUST CATCH: inline host, in-flow block child. The OBRS-753 shape exactly.
      mk('x-probe-malformed', 'display:inline', 'display:block');
      // MUST NOT: the fix applied.
      mk('x-probe-fixed', 'display:block', 'display:block');
      // MUST NOT: an inline host is perfectly legal when its children are inline.
      mk('x-probe-inline-child', 'display:inline', 'display:inline');
      // MUST NOT: out of flow, so the inline box is never split. Counting these
      // would have padded the allow-list with components that are not broken --
      // `app-report-usability-fab` is exactly that case and is on the card's list.
      mk('x-probe-absolute', 'display:inline', 'display:block;position:absolute');
      mk('x-probe-float', 'display:inline', 'display:block;float:left');
    });

    const tags = (await scanMalformedHosts(page, 'probe')).map((h) => h.tag);
    expect(tags).toContain('x-probe-malformed');
    expect(tags).not.toContain('x-probe-fixed');
    expect(tags).not.toContain('x-probe-inline-child');
    expect(tags).not.toContain('x-probe-absolute');
    expect(tags).not.toContain('x-probe-float');
  });

  test('customer pages', async ({ browser }) => {
    const missing = CUSTOMER_PAGES.filter((c) => !CUSTOMER_HOST[c.key]).map((c) => c.key);
    expect(missing, 'CUSTOMER_PAGES key(s) with no routed host named in CUSTOMER_HOST').toEqual([]);

    const page = await newSweepPage(browser);
    await seedCustomerSession(page, false);
    await sweep(page, CUSTOMER_SWEEP, seedStore);
    await page.context().close();
  });

  test('public and auth-entry pages', async ({ browser }) => {
    const page = await newSweepPage(browser);
    await seedAnonymousSession(page);
    await sweep(page, PUBLIC_SWEEP);
    await page.context().close();
  });

  test('admin, staff and session-bound pages', async ({ browser }) => {
    const page = await newSweepPage(browser);
    await seedStaffSession(page);
    await sweep(page, ADMIN_SWEEP);
    await page.context().close();
  });

  test('no host outside the allow-list is malformed', async () => {
    const bad = [...census.values()].filter((h) => !(h.tag in ALLOW));
    // eslint-disable-next-line no-console
    console.log('OBRS775 census ' + JSON.stringify([...census.values()], null, 1));
    expect(
      bad,
      'inline host(s) wrapping in-flow block children, and not on ALLOW:\n' + JSON.stringify(bad, null, 1)
    ).toEqual([]);
  });

  test('no stale ALLOW entries', async () => {
    const stale = Object.keys(ALLOW).filter((tag) => !census.has(tag));
    expect(stale, 'ALLOW names host(s) the sweep never saw malformed -- fixed, renamed, or never real').toEqual([]);
  });
});
