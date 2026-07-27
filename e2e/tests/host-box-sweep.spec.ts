import { expect, test, Page } from '@playwright/test';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';
import {
  ADMIN_SWEEP,
  CUSTOMER_EXTRA_SWEEP,
  CUSTOMER_HOST,
  CUSTOMER_SWEEP,
  MalformedHost,
  PUBLIC_SWEEP,
  SweepPage,
  featureFlags,
  newSweepPage,
  primengHostUsers,
  scanMalformedHosts,
  scanPrimengCoverage,
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
 * hermetically -- nine customer pages, nine public/auth-entry routes,
 * twenty-nine admin/staff/session-bound screens, 47 in all (OBRS-776 added
 * twelve routes and three modals; OBRS-782 added five screens reached by
 * clicking, with data) -- is either well-formed or named on ALLOW
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
 * OBRS-776 ADDED THE COVERAGE HALF. A clean census cannot tell a page that is
 * well-formed from a page nobody opened, and the four PrimeNG entries this file
 * used to carry were fixed by a rule in `src/styles/` that reaches every
 * instance in the app. So `primeng host users are all swept` derives the
 * components that render those tags from the source tree and fails on any whose
 * PrimeNG tag the sweep never saw RENDER. Rendering is the bar, not mounting:
 * `app-expense-form-modal` sits in the DOM on every visit to `/admin/expenses`
 * while its whole template is behind `*ngIf="isOpen"`, so treating a present
 * host as coverage would report a `p-calendar` as measured when none had
 * rendered. That is the assertion that makes an empty ALLOW mean something.
 *
 * OBRS-782 EMPTIED THE EXCUSE LIST, and doing so was the point. OBRS-776 left
 * seven components covered by a VARIANT argument rather than by measurement --
 * each behind data this lane answered with `null` on principle, since an empty
 * table has the same host tree as a full one. That principle is true of every
 * other page here and false for exactly those seven: a `p-tabView` behind
 * `*ngIf="selectedTrip"` does not render a different box when the list is
 * empty, it renders no box at all. `SweepPage.fixture` is the narrow exception
 * -- the smallest rows that make a host exist, answered ahead of the empty
 * backend and cleared on the next navigation.
 *
 * What it bought is the argument for having done it: the five screens it opened
 * turned up THREE malformed hosts no run in this repo had ever measured --
 * `app-reschedule-date-picker-step`, `app-trip-details-edit-form`, and
 * `app-passenger-seat-bus`, which was not even on the card's list. All three
 * are fixed and measured here. A variant argument would have shipped a global
 * rule over every one of them.
 *
 * ASCII-only source.
 */

/**
 * Hosts known to be malformed and not yet fixed, each with the reason it is
 * still here.
 *
 * EMPTY, and that is a measurement rather than a target. OBRS-775's first run
 * found 39: 35 ours, fixed there; two more its own fixes created one level up;
 * and four PrimeNG's it could not reach from a component stylesheet. OBRS-776
 * widened the sweep by 12 pages -- which turned up two more of ours,
 * `app-settlements-list` and `app-config-change-history-page`, on pages nobody
 * had swept -- and then fixed the four with `src/styles/primeng-host-boxes.scss`.
 * OBRS-782 opened five screens behind data and clicks and found THREE more of
 * ours, all fixed there: `app-reschedule-date-picker-step`,
 * `app-trip-details-edit-form` and `app-passenger-seat-bus`. Three cards, three
 * widenings, and every one of them found something -- which is the strongest
 * available argument that "we did not measure it" is never the same claim as
 * "it is fine".
 *
 * `no stale ALLOW entries` means an entry added here has to be seen by a real
 * run, so this cannot quietly become a list of things somebody once believed.
 */
const ALLOW: Record<string, string> = {};

/**
 * OBRS-776. Components that render one of `PRIMENG_TARGETS` and that no screen
 * in the sweep can get to render it, with the reason.
 *
 * ONE ENTRY since OBRS-782, and it is the only one ever excused by a FACT
 * rather than by an argument. OBRS-776 left eight; seven were reached with
 * fixtures and clicks and their entries deleted, which the second assertion in
 * `primeng host users are all swept` makes compulsory rather than polite.
 *
 * Kept deliberately short: every entry is a hole in the evidence for a rule that
 * lands app-wide, so the bar for adding one is that the component genuinely
 * cannot be reached without data this lane has no way to produce. Two candidates
 * were REMOVED from this list rather than excused -- `app-expense-form-modal`
 * and `app-promotion-form-modal` open from their page's own Add button with no
 * seeded data at all, so `admin-expenses-modal` and `admin-promotions-modal`
 * measure them instead.
 *
 * Checked in BOTH directions by `primeng host users are all swept`: a component
 * here whose PrimeNG tag the sweep DID render fails as loudly as one that is
 * missing, so this cannot quietly become a list of things that used to be hard.
 */
const NOT_SWEPT: Record<string, string> = {
  'app-parcel-trip-form':
    'Only route is /parcel-booking, behind featureEnabledGuard(onlineParcelBooking), which is false in ' +
    'environment.base.ts -- the page bounces to / in every build. `the parcel-booking exclusion has not ' +
    'expired` re-reads that flag, so this entry cannot outlive its reason.',
};

/** Every malformed host the whole sweep saw, keyed by tag. Read by the last two tests. */
const census = new Map<string, MalformedHost>();

/**
 * Our components the sweep saw actually RENDERING a PrimeNG target, against the
 * first page it happened on. OBRS-776 reads this to prove the sweep reaches the
 * instances a global rule would land on: a clean malformed-host census cannot
 * tell a page that is fine from a page nobody opened, and a component's host
 * being present cannot tell a rendered `p-calendar` from an `*ngIf` that is
 * false.
 */
const rendered = new Map<string, string>();

async function sweep(page: Page, pages: SweepPage[], seedFn?: (p: Page) => Promise<void>): Promise<void> {
  for (const p of pages) {
    await visit(page, p, seedFn);
    const hosts = await scanMalformedHosts(page, p.key);
    for (const h of hosts) if (!census.has(h.tag)) census.set(h.tag, h);
    const coverage = await scanPrimengCoverage(page);
    for (const owner of Object.keys(coverage)) if (!rendered.has(owner)) rendered.set(owner, p.key);
    // eslint-disable-next-line no-console
    console.log(
      `OBRS775 ${p.key} malformed=${hosts.length} ` +
        JSON.stringify(hosts.map((h) => h.tag)) +
        ` primeng=${JSON.stringify(coverage)}`
    );
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
    // OBRS-782: same session, same fixtures, one extra screen that needs a
    // click. Kept out of CUSTOMER_PAGES because that list is also the contrast
    // and dark-override gates' page list -- see CUSTOMER_EXTRA_SWEEP.
    await sweep(page, CUSTOMER_EXTRA_SWEEP, seedStore);
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

  /**
   * OBRS-776's whole reason to exist, as a gate rather than a paragraph.
   *
   * The four PrimeNG hosts can only be fixed by a rule in `src/styles/`, and a
   * global rule reaches every instance in the app at once -- so the question
   * "did we measure it" is not about pages that looked interesting, it is about
   * the components that render those tags, all of them. This derives that
   * population from the source tree and fails if the sweep did not mount one.
   *
   * It fails on a component the sweep DOES reach and NOT_SWEPT still names, too.
   * An exclusion list that only ever grows is how a measured claim decays into a
   * remembered one.
   */
  test('primeng host users are all swept', async () => {
    const users = primengHostUsers();
    // eslint-disable-next-line no-console
    console.log(`OBRS776 primeng host users=${users.length} ` + JSON.stringify(users, null, 1));

    const unswept = users.filter((u) => !rendered.has(u.selector) && !(u.selector in NOT_SWEPT));
    expect(
      unswept.map((u) => `${u.selector} (${u.uses.join(',')}) ${u.file}`),
      'component(s) whose PrimeNG host NO screen in the sweep renders. A global rule would change them ' +
        'unmeasured -- add a screen that reaches them, or name them in NOT_SWEPT with why'
    ).toEqual([]);

    const reachedAfterAll = Object.keys(NOT_SWEPT).filter((sel) => rendered.has(sel));
    expect(
      reachedAfterAll,
      'NOT_SWEPT names component(s) the sweep now renders -- delete the entry, the excuse expired'
    ).toEqual([]);

    const gone = Object.keys(NOT_SWEPT).filter((sel) => !users.some((u) => u.selector === sel));
    expect(gone, 'NOT_SWEPT names component(s) that no longer render any PrimeNG host at all').toEqual([]);
  });

  /**
   * What makes the NOT_SWEPT entries survivable instead of a hole.
   *
   * OBRS-782 left this test with almost nothing to do and deliberately did not
   * delete it: one component still cannot be reached, and the day someone adds
   * another this is the check that decides whether the exclusion is
   * survivable. The argument below is unchanged.
   *
   * A component renders a PrimeNG host behind data or a selection this lane
   * cannot produce. The global rule still reaches them, so "we did not measure
   * it" would be the exact mistake OBRS-775 refused to make -- unless the thing
   * that decides how the host lays out is the same in them as in one that WAS
   * measured. It is: the host is malformed exactly when PrimeNG's inner
   * container is block-level, and the only thing a call site can do about that
   * is hand it a `styleClass` that some rule sets `display` through. So the
   * claim is narrow and checkable -- every variant an unswept component writes
   * also occurs in a component whose PrimeNG tag the sweep rendered and the
   * geometry harness measured.
   *
   * The day someone gives a dialog's calendar a styleClass that carries a
   * `display` no swept screen uses, this reds and says so, which is the only
   * version of this claim worth having.
   */
  test('no unswept component renders an unmeasured variant', async () => {
    const users = primengHostUsers();
    const measured = new Set(users.filter((u) => rendered.has(u.selector)).flatMap((u) => u.variants));

    const unmeasured = users
      .filter((u) => !rendered.has(u.selector))
      .flatMap((u) => u.variants.filter((v) => !measured.has(v)).map((v) => `${u.selector}: ${v}`));

    expect(
      unmeasured,
      'unswept component(s) render a PrimeNG host in a shape no swept page does, so the geometry ' +
        'harness never measured it. Reach the component, or measure the variant somewhere it can be reached'
    ).toEqual([]);
  });

  /**
   * The one NOT_SWEPT entry that is excused by a fact rather than by variant,
   * re-derived rather than remembered.
   *
   * `app-parcel-trip-form` is excused because its only route is behind a feature
   * flag that is off, which is a fact about the tree and not an opinion -- so it
   * is read back here. A flag flip is exactly the change that would make the
   * exclusion false, and it is also exactly the change nobody would think to
   * re-check this file for.
   */
  test('the parcel-booking exclusion has not expired', async () => {
    expect(
      featureFlags()['onlineParcelBooking'],
      'onlineParcelBooking is ON, so /parcel-booking now renders app-parcel-trip-form and its p-calendar. ' +
        'Add the page to ADMIN_SWEEP and drop the NOT_SWEPT entry'
    ).toBe(false);
  });
});
