import { expect, test, Page } from '@playwright/test';
import { seedCustomerSession, seedStore } from '../support/customer-pages';
import {
  ADMIN_SWEEP,
  CUSTOMER_EXTRA_SWEEP,
  CUSTOMER_SWEEP,
  OWNER_SWEEP,
  PUBLIC_SWEEP,
  SweepPage,
  newSweepPage,
  seedAnonymousSession,
  seedOwnerSession,
  seedStaffSession,
  sweepBudgetMs,
  visit,
} from '../support/host-boxes';
import {
  EquivalentEntry,
  ExemptReason,
  MIN_TARGET_PX,
  SkipReason,
  TargetFinding,
  scanTargetSizes,
} from '../support/target-size';

/**
 * OBRS-925 -- the repo-wide target-size gate. WCAG 2.2 SC 2.5.8 Target Size
 * (Minimum): every interactive control must render at 24x24 CSS px or larger.
 *
 * WHY THIS CARD EXISTS AT ALL. OBRS-913 measured `.admin-sidebar-pin` at 20px
 * on a laptop viewport. Nothing in this repo could have told anyone: code
 * review read `height: 28px` and believed it, `ng test` runs in an 800px Karma
 * window that never enters the `min-width: 1101px` block the rule lives in, and
 * every `scripts/check-*.mjs` gate is a source parser, so all of them passed.
 * The button was found by a human standing in front of a running browser with
 * `getBoundingClientRect()`. This spec is that human, on every page the lane can
 * reach, on every run -- which is the only form of the check that survives the
 * next icon button somebody adds.
 *
 * THE THIRD IN A FAMILY, REUSING ITS TOOLS. `customer-contrast-gate.spec.ts`
 * (OBRS-584) and `host-box-sweep.spec.ts` (OBRS-775) already decided that
 * rendered-vs-declared questions belong in a browser and already own the page
 * list this walks -- 47 screens through `e2e/support/host-boxes.ts`. This adds
 * no route, no session helper and no fixture: it visits the same list and
 * measures something else.
 *
 * NOT OBRS-640. That audit measures 44x44 (Apple HIG) on six mobile customer
 * routes and is a CAPTURE script by the owner's own call, so it gates nothing.
 * This is the AA minimum, repo-wide, and it is a merge gate. The card refuses
 * the higher bar explicitly.
 *
 * WHAT MAKES A GREEN RUN HERE MEAN SOMETHING. Three things, in this order,
 * every run, because `mode: 'serial'`:
 *   1. `the checker fires, and only on a real undersized target` proves the
 *      detector and all four exception predicates against DOM built for the
 *      purpose. A gate nobody has watched go red is prose with a shebang.
 *   2. `the admin sidebar column still overflows` re-establishes the PRECONDITION
 *      of the defect class this card came from. The squeeze only happens while
 *      the column overflows; the day a viewport or a shorter menu removes the
 *      overflow, this sweep would go green having measured nothing interesting,
 *      and would say so in the same voice as a real pass.
 *   3. Only then do the four sweeps run, and every one of them PRINTS its
 *      numbers -- measured, skipped, exempted by reason, violating. A selector
 *      that quietly stops matching shows up as a population that shrank, not as
 *      a gate that passed.
 *
 * ASCII-only source.
 */

/**
 * Controls measured under 24x24 that are NOT yet fixed, one line each, with the
 * card that owns the fix.
 *
 * A DEBT REGISTER, NOT AN EXEMPTION LIST. The card puts fixing them out of
 * scope on purpose -- each fix is a layout change that has to be measured on
 * its own -- so this list is what the first run found, and `no stale ALLOW
 * entries` is what stops it becoming a list of things somebody once believed.
 *
 * The key is `leafOf(path)`: the element and its classes, not the wrappers
 * above it and not the page. Both halves are the contrast gate's measured
 * conclusions (OBRS-584) rather than taste -- a full ancestor path turned ~50
 * defects into 176 keys there and renamed every one of them when a wrapper div
 * was inserted. The SIZE is deliberately NOT in the key: a repaint can fix a
 * colour, which is why the contrast register keys the pair, but a control that
 * moves from 20px to 22px is the same debt and re-reviewing it teaches people
 * to edit this file to make a build pass. A control that reaches 24 leaves the
 * census entirely, and then the stale check fires.
 */
const ALLOW: Record<string, string> = {
  'button.btn-close':
    "OBRS-1882. Bootstrap's own modal close button, measured 16x16 on staff-schedules-modal and " +
    'staff-sell-schedule-modal. The number is the library default, so the fix is one rule in src/styles/ that ' +
    'lands on every modal in the app at once -- a change that has to be measured on modals this sweep does not ' +
    'open, which is why it is a card and not a line in this one.',
  'button.p-datepicker-dropdown':
    "OBRS-1882. PrimeNG's date-picker trigger, measured 40x20 on admin-expenses-batch. 20 is not a height " +
    'PrimeNG declares -- it is what the button is squeezed to beside the input it is attached to, so raising it ' +
    'means finding what does the squeezing first. The same shape of defect as OBRS-913, one component over.',
  'a.obrs-link':
    'OBRS-1882. The "edit phone number" exit on /otp (otp-validate.component.html:93, added by OBRS-714), ' +
    'measured 132.5x21: `.obrs-link` sets a font-size and no padding, so its box is the line box. The class is ' +
    'used in seven components and the other links wearing it PASS -- they sit mid-sentence and are genuinely ' +
    'excused by SC 2.5.8 Inline -- so the fix is the standalone one, not the class.',
};

/**
 * SC 2.5.8's "Equivalent" exception, declared per control: the same job is done
 * by a full-size control on the same page.
 *
 * The only exception here that cannot be derived -- no measurement knows two
 * controls do the same thing -- so it is declared and then CHECKED: the named
 * alternative must be present and itself >= 24x24 on that page, or the small
 * control is reported as a violation anyway (`equivalentBroken`). Entries that
 * stop being needed fail `every EQUIVALENT declaration is used and honoured`.
 */
const EQUIVALENT: Record<string, EquivalentEntry> = {};

const totals = {
  measured: 0,
  skipped: { disabled: 0, invisible: 0 } as Record<SkipReason, number>,
  exempt: { 'ua-size': 0, 'inline-text': 0, spacing: 0, equivalent: 0 } as Record<ExemptReason, number>,
};

/** First sighting of every violating control, keyed the way ALLOW is. */
const census = new Map<string, TargetFinding>();
/** Which pages each violation was seen on -- printed, deliberately not in the key. */
const sightings = new Map<string, string[]>();
/** Every control the sweep measured, violating or not. Read by the stale check. */
const seen = new Set<string>();
const equivalentUsed = new Set<string>();
const equivalentBroken: string[] = [];

async function sweep(page: Page, pages: SweepPage[], seedFn?: (p: Page) => Promise<void>): Promise<void> {
  for (const p of pages) {
    await visit(page, p, seedFn);
    const scan = await scanTargetSizes(page, p.key, EQUIVALENT);

    totals.measured += scan.measured;
    for (const k of Object.keys(totals.skipped) as SkipReason[]) totals.skipped[k] += scan.skipped[k];
    for (const k of Object.keys(totals.exempt) as ExemptReason[]) totals.exempt[k] += scan.exempt[k];
    for (const s of scan.seen) seen.add(s);
    for (const k of scan.equivalentUsed) equivalentUsed.add(k);
    for (const k of scan.equivalentBroken) equivalentBroken.push(`${p.key}: ${k}`);
    for (const v of scan.violations) {
      if (!census.has(v.key)) census.set(v.key, v);
      const pageKeys = sightings.get(v.key) ?? [];
      if (!pageKeys.includes(p.key)) pageKeys.push(p.key);
      sightings.set(v.key, pageKeys);
    }

    // eslint-disable-next-line no-console
    console.log(
      `OBRS925 ${p.key} measured=${scan.measured} skipped=${JSON.stringify(scan.skipped)} ` +
        `exempt=${JSON.stringify(scan.exempt)} violations=` +
        JSON.stringify(scan.violations.map((v) => `${v.key} ${v.width}x${v.height}`))
    );
  }
}

function sweepPage(key: string): SweepPage {
  const p = ADMIN_SWEEP.find((x) => x.key === key);
  if (!p) throw new Error(`OBRS-925: ADMIN_SWEEP has no entry '${key}' -- the list moved under this spec.`);
  return p;
}

// Serial: the four sweeps feed one census and the last three tests read it. A
// partial census would report entries as stale that a skipped page would have
// seen, so a failed sweep must skip what follows rather than mislead it. It is
// also what puts the self-test and the precondition check BEFORE any sweep.
test.describe.configure({ mode: 'serial' });

test.describe('OBRS-925 target size (WCAG 2.2 SC 2.5.8)', () => {
  /**
   * AC-4. Must-catch and must-NOT-catch, against DOM built for the purpose, so
   * the proof does not depend on any control in the app staying broken -- which
   * is the trap in "it caught the bug once".
   *
   * The body is emptied first. Two of the four exceptions are facts about an
   * element's NEIGHBOURS, so a probe dropped onto a live page would be judged
   * partly by whatever that page happened to render next to it, and the case
   * that proves the spacing rule fires needs empty space to stand in.
   */
  test('the checker fires, and only on a real undersized target', async ({ page }) => {
    await page.goto('/business-policy');

    await page.evaluate(() => {
      document.body.innerHTML = '';
      const base = 'position:absolute;box-sizing:border-box;margin:0;padding:0;border:0;';
      const add = (tag: string, cls: string, css: string, attrs: Record<string, string> = {}) => {
        const el = document.createElement(tag);
        el.className = cls;
        el.setAttribute('style', base + css);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        document.body.appendChild(el);
        return el;
      };

      // MUST CATCH: 20x20 with a target touching it, so the spacing exception
      // cannot excuse it. This is the OBRS-913 shape -- a squeezed icon button
      // in a crowded column.
      add('button', 'x-probe-small', 'left:0;top:0;width:20px;height:20px;');
      add('button', 'x-probe-neighbour', 'left:20px;top:0;width:40px;height:40px;');

      // MUST NOT: exactly at the minimum, equally crowded. 24 passes.
      add('button', 'x-probe-exact', 'left:0;top:200px;width:24px;height:24px;');
      add('button', 'x-probe-crowder', 'left:24px;top:200px;width:40px;height:40px;');

      // MUST NOT: undersized but alone -- the Spacing exception, which is the
      // one that decides whether the two cases above are told apart by the
      // neighbour or by the size.
      add('button', 'x-probe-spaced', 'left:600px;top:400px;width:20px;height:20px;');

      // MUST NOT: a bare checkbox is ~13px because the user agent says so.
      // MUST CATCH: the same control resized by an author is ours again. The
      // pair is the whole proof that `ua-size` is a measurement and not a list
      // of tags we agreed to ignore.
      add('input', 'x-probe-native', 'left:0;top:300px;', { type: 'checkbox' });
      add('input', 'x-probe-squashed', 'left:30px;top:300px;width:10px;height:10px;', { type: 'checkbox' });
      add('button', 'x-probe-crowder2', 'left:42px;top:300px;width:40px;height:40px;');

      // MUST NOT: a tiny link inside a sentence -- the Inline exception.
      const p = document.createElement('p');
      p.setAttribute('style', base + 'left:0;top:600px;width:400px;');
      p.innerHTML =
        'An ordinary sentence with <a class="x-probe-inline" href="#" style="font-size:9px">a tiny link</a> in it.';
      document.body.appendChild(p);
    });

    const scan = await scanTargetSizes(page, 'self-test');
    const keys = scan.violations.map((v) => v.key);
    // eslint-disable-next-line no-console
    console.log(`OBRS925 self-test ${JSON.stringify(scan, null, 1)}`);

    expect(keys, 'a 20x20 button beside another target is the defect this gate exists for').toContain(
      'button.x-probe-small'
    );
    expect(keys, `${MIN_TARGET_PX}px exactly is conformant`).not.toContain('button.x-probe-exact');
    expect(keys, 'an isolated undersized target is excused by SC 2.5.8 Spacing').not.toContain(
      'button.x-probe-spaced'
    );
    expect(keys, 'a UA-sized checkbox is excused by SC 2.5.8 User agent control').not.toContain(
      'input.x-probe-native'
    );
    expect(keys, 'an author-resized checkbox is NOT the user agent size any more').toContain(
      'input.x-probe-squashed'
    );
    expect(keys, 'a tiny link in a sentence is excused by SC 2.5.8 Inline').not.toContain('a.x-probe-inline');

    // The exceptions must have FIRED, not merely failed to be reached: a
    // predicate that never runs and a predicate that never matches look the
    // same from the violation list.
    expect(scan.exempt.spacing, 'the Spacing predicate never fired').toBeGreaterThanOrEqual(1);
    expect(scan.exempt['ua-size'], 'the User-agent-control predicate never fired').toBeGreaterThanOrEqual(1);
    expect(scan.exempt['inline-text'], 'the Inline predicate never fired').toBeGreaterThanOrEqual(1);
  });

  /**
   * AC-5. The positive control for the sweep itself.
   *
   * The defect class this card came from only exists while the sidebar column
   * overflows: `.admin-sidebar-pin` is a `flex-shrink: 1` item, and a column
   * with room to spare gives every item its declared height. At this lane's
   * 1280x720 the admin menu overflows, which is why the sweep below can see
   * that family of defect at all. If it ever stops overflowing, the sweep would
   * go green having measured a layout where nothing can be squeezed -- a green
   * that says nothing, in the same voice as one that says a lot. So the
   * precondition is asserted rather than assumed.
   */
  test('the admin sidebar column still overflows at the lane viewport', async ({ browser }) => {
    const page = await newSweepPage(browser);
    await seedStaffSession(page);
    await visit(page, sweepPage('admin-users'));

    const panel = await page.evaluate(() => {
      const el = document.querySelector('.admin-sidebar-panel');
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, height: box.height };
    });
    await page.context().close();

    expect(panel, '.admin-sidebar-panel does not exist on /admin/users any more -- this check is measuring nothing').not.toBeNull();
    // eslint-disable-next-line no-console
    console.log(`OBRS925 precondition admin-users panel=${JSON.stringify(panel)}`);
    expect(
      panel!.scrollHeight,
      'the admin sidebar column no longer overflows at 1280x720, so nothing in it can be squeezed below its ' +
        'declared size. The sweep below would pass without having exercised the defect class this gate exists ' +
        'for. Re-measure what viewport DOES overflow and move this check there, or retire the claim.'
    ).toBeGreaterThan(panel!.clientHeight);
  });

  test('customer pages', async ({ browser }) => {
    test.setTimeout(sweepBudgetMs(CUSTOMER_SWEEP, CUSTOMER_EXTRA_SWEEP));
    const page = await newSweepPage(browser);
    await seedCustomerSession(page, false);
    await sweep(page, CUSTOMER_SWEEP, seedStore);
    await sweep(page, CUSTOMER_EXTRA_SWEEP, seedStore);
    await page.context().close();
  });

  test('public and auth-entry pages', async ({ browser }) => {
    test.setTimeout(sweepBudgetMs(PUBLIC_SWEEP));
    const page = await newSweepPage(browser);
    await seedAnonymousSession(page);
    await sweep(page, PUBLIC_SWEEP);
    await page.context().close();
  });

  test('admin, staff and session-bound pages', async ({ browser }) => {
    test.setTimeout(sweepBudgetMs(ADMIN_SWEEP));
    const page = await newSweepPage(browser);
    await seedStaffSession(page);
    await sweep(page, ADMIN_SWEEP);
    await page.context().close();
  });

  test('owner-only settings tabs', async ({ browser }) => {
    test.setTimeout(sweepBudgetMs(OWNER_SWEEP));
    const page = await newSweepPage(browser);
    await seedOwnerSession(page);
    await sweep(page, OWNER_SWEEP);
    await page.context().close();
  });

  /** AC-7: the numbers, every run, whether or not anything failed. */
  test('no interactive control outside ALLOW renders under 24x24', async () => {
    // eslint-disable-next-line no-console
    console.log(
      `OBRS925 TOTALS measured=${totals.measured} skipped=${JSON.stringify(totals.skipped)} ` +
        `exempt=${JSON.stringify(totals.exempt)} distinct-violations=${census.size} ` +
        `allow-entries=${Object.keys(ALLOW).length} equivalent-entries=${Object.keys(EQUIVALENT).length}`
    );
    // eslint-disable-next-line no-console
    console.log(
      'OBRS925 CENSUS ' +
        JSON.stringify(
          [...census.values()].map((v) => ({
            key: v.key,
            size: `${v.width}x${v.height}`,
            label: v.label,
            allowed: v.key in ALLOW,
            pages: sightings.get(v.key),
          })),
          null,
          1
        )
    );

    const bad = [...census.values()].filter((v) => !(v.key in ALLOW));
    expect(
      bad.map((v) => `${v.key} ${v.width}x${v.height} "${v.label}" on ${(sightings.get(v.key) ?? []).join(',')}`),
      `interactive control(s) rendering under ${MIN_TARGET_PX}x${MIN_TARGET_PX} CSS px, not excused by any ` +
        'SC 2.5.8 exception and not named on ALLOW with a card'
    ).toEqual([]);
  });

  /**
   * AC-6. An allow-list nobody prunes becomes a list of things fixed long ago,
   * and then its length is read as the size of the problem.
   *
   * Two verdicts, not one (OBRS-1435). An entry whose control the sweep MEASURED
   * and found conformant is a fix: delete it. An entry whose control no page
   * rendered at all is a different event -- a rename, a removed screen, or a
   * page that failed to come up -- and it is reported in its own right rather
   * than being called a fix, because an element nobody measured is not evidence
   * that anybody paid.
   */
  test('no stale ALLOW entries', async () => {
    const fixed = Object.keys(ALLOW).filter((k) => !census.has(k) && seen.has(k));
    const neverSeen = Object.keys(ALLOW).filter((k) => !census.has(k) && !seen.has(k));

    expect(
      fixed,
      'ALLOW names control(s) the sweep measured and that now meet the minimum -- delete the entries'
    ).toEqual([]);
    expect(
      neverSeen,
      'ALLOW names control(s) NO page in the sweep rendered at all. That is not proof they were fixed: check ' +
        'whether the class was renamed, the screen retired, or the page failed to come up, then delete the ' +
        'entry or point it at where the control lives now'
    ).toEqual([]);
  });

  test('every EQUIVALENT declaration is used and honoured', async () => {
    expect(
      equivalentBroken,
      'EQUIVALENT claim(s) whose named full-size alternative is absent or itself under the minimum on the page ' +
        'where the small control renders. The exception does not apply there; the control is reported as a ' +
        'violation until the alternative is real'
    ).toEqual([]);

    const unused = Object.keys(EQUIVALENT).filter((k) => !equivalentUsed.has(k));
    expect(
      unused,
      'EQUIVALENT names control(s) that no longer need the exception (fixed, retired, or already excused by ' +
        'Spacing) -- delete the entries'
    ).toEqual([]);
  });
});
