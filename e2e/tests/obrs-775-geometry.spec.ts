import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { seedCustomerSession, seedStore } from '../support/customer-pages';
import {
  ADMIN_SWEEP,
  CUSTOMER_EXTRA_SWEEP,
  CUSTOMER_SWEEP,
  PUBLIC_SWEEP,
  SweepPage,
  newSweepPage,
  seedAnonymousSession,
  seedStaffSession,
  visit,
} from '../support/host-boxes';

/**
 * OBRS-775 -- proof that adding `:host { display }` moved nothing.
 *
 * WHAT THE CARD DEMANDS AND WHY IT IS RIGHT TO. "AC3: every host that is fixed
 * needs before/after coordinates at the viewports in that component's media
 * queries." `display: block` on a host is NOT a no-op: percentage widths resolve
 * against the containing block, and a `:host` display is exactly what moves the
 * containing block from the enclosing element to the host itself. Margin
 * collapsing moves with it. The card also forbids a bulk sed for that reason.
 *
 * HOW THIS ANSWERS IT WITHOUT PICKING SELECTORS. It measures the border box of
 * EVERY element on every page in the sweep, at all four media-query widths, in
 * both phases -- tens of thousands of boxes -- and fails on any that moved more
 * than half a pixel. A selector list can only confirm what its author already
 * suspected; this cannot miss a component whose neighbour it did not think to
 * check. Same reasoning as `capture-obrs752.js`, which measured every element
 * that renders text rather than the buttons the card happened to name.
 *
 * ELEMENT IDENTITY IS STRUCTURAL, not a selector. Each box is keyed by its child
 * index chain from `<html>` plus its tag. A stylesheet edit cannot change that
 * chain, so a key present in one phase and absent in the other is itself a
 * finding -- the DOM changed, which a `:host { display }` must never do.
 *
 * OBRS-776 REUSES THIS almost unchanged. It reads the page lists from
 * `host-boxes.ts`, so widening the sweep to 42 screens widened this to 168
 * screens and 24,426 boxes without an edit here -- which is why the lists live
 * there and not in two places. Two things were added: the zero-area exclusion,
 * whose argument the comparison below states, and a per-screen assertion that
 * the webfont really loaded, whose argument is beside it.
 *
 * ASCII-only source.
 */

/** The four widths that matter: desktop plus each media-query step. Same set as OBRS-753. */
const VIEWPORTS = [
  { w: 1280, h: 720 },
  { w: 1024, h: 800 },
  { w: 768, h: 800 },
  { w: 576, h: 800 },
];

const PHASE = (process.env['OBRS775_PHASE'] ?? 'after').toLowerCase();
const OUT_DIR = path.resolve(__dirname, '..', '..', 'e2e-evidence');
const outFile = (phase: string) => path.join(OUT_DIR, `obrs775-geometry-${phase}.json`);

/** Half a pixel: below sub-pixel rounding noise, above nothing that matters. */
const TOLERANCE = 0.5;

interface Box {
  tag: string;
  display: string;
  /** `none` unless a CSS animation is running on it -- see EXCLUSIONS below. */
  anim: string;
  /** OBRS-782. `position: sticky` -- viewport-relative when stuck, in-flow when not. */
  sticky: boolean;
  /** OBRS-782. The screen's scroll offset when it was measured, same on every box. */
  scrollY: number;
  /** Document coordinates, except inside a `position: fixed` subtree -- see `measureAll`. */
  x: number;
  y: number;
  w: number;
  h: number;
}

type PageBoxes = Record<string, Box>;
type Phase = Record<string, PageBoxes>;

const collected: Phase = {};

/**
 * Every element's border box, keyed by structural path.
 *
 * `display` is recorded alongside but deliberately NOT compared: it is the one
 * thing the fix is supposed to change. Comparing it would turn the intended edit
 * into a failure and teach whoever ran this to ignore the report.
 *
 * `<head>` is skipped entirely. Adding a stylesheet to a component makes Angular
 * inject one more `<style>` element, so a phase that adds 35 of them shows 116
 * `<head>` children that "appeared" -- every one of them a zero-sized node that
 * has never been part of a layout. Reporting those would bury the two findings
 * that mattered on the first run.
 */
async function measureAll(page: import('@playwright/test').Page): Promise<PageBoxes> {
  return page.evaluate(() => {
    // OBRS-782. Record DOCUMENT coordinates for in-flow content, and viewport
    // coordinates for anything inside a `position: fixed` subtree.
    //
    // `getBoundingClientRect` is viewport-relative, so a screen reached by
    // CLICKING is measured from wherever the scrolling left it -- and that is
    // not layout. The reschedule dialog's first AFTER run reported 411 moved
    // elements across three viewports with `html`'s own height IDENTICAL to
    // the hundredth of a pixel in both phases and only its `y` different: one
    // scroll delta, wearing 411 costumes. It is a fourth false-positive source
    // alongside animation, <head> growth and the webfont, and the only one a
    // tolerance could never separate from a real move -- it displaces
    // EVERYTHING by the same amount, which is exactly what a page that shifted
    // looks like.
    //
    // WHY NOT JUST SCROLL BACK TO THE TOP. Two attempts did, from `settle()`
    // before and after its two frames, and a third from inside this very
    // `page.evaluate`. All three still measured a scrolled page -- 402px, then
    // 192px, then 192px again -- because `p-menu` restores focus to its
    // trigger when it hides (`MyBookingsComponent.onActionMenuHide`) and
    // focusing an off-screen element scrolls it back. Fighting the page for
    // the scroll position is a race; not depending on it is not.
    //
    // WHY THE FIXED EXCEPTION. A `position: fixed` box (and everything inside
    // one) is positioned against the viewport, so its rect is ALREADY
    // scroll-invariant. Adding the scroll offset to it would trade this false
    // positive for a new one on every navbar, modal and FAB.
    //
    // `position: sticky` is the one case this cannot express -- a stuck sticky
    // box is viewport-relative and an unstuck one is not. It is recorded per
    // box and handled in the comparison, which drops a sticky element only on
    // a screen whose two phases were scrolled DIFFERENTLY, and prints what it
    // dropped.
    const sx = window.scrollX;
    const sy = window.scrollY;

    const out: Record<string, Record<string, string | number | boolean>> = {};
    const walk = (el: Element, key: string, inFixed: boolean) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const fixed = inFixed || cs.position === 'fixed';
      // OBRS-782. An element with NO layout box at all -- `display: none`, or
      // an empty `<script>` -- returns an all-zero rect, which is not a
      // position and must not have the scroll offset added to it. Without this
      // guard the normalisation gives every such node a phantom `y` equal to
      // the scroll, and the first run of it reported 27 of them on the one
      // screen whose phases were scrolled differently (192px vs 195px). They
      // were caught by the zero-area exclusion and changed no verdict, but a
      // harness that manufactures its own exclusions is one nobody can read.
      const noBox = r.x === 0 && r.y === 0 && r.width === 0 && r.height === 0;
      const ox = fixed || noBox ? 0 : sx;
      const oy = fixed || noBox ? 0 : sy;
      out[key] = {
        tag: el.tagName.toLowerCase(),
        display: cs.display,
        anim: cs.animationName,
        sticky: cs.position === 'sticky',
        scrollY: sy,
        x: Math.round((r.x + ox) * 100) / 100,
        y: Math.round((r.y + oy) * 100) / 100,
        w: Math.round(r.width * 100) / 100,
        h: Math.round(r.height * 100) / 100,
      };
      let i = 0;
      for (const child of Array.from(el.children)) {
        if (child.tagName === 'HEAD') {
          i++;
          continue;
        }
        walk(child, `${key}/${i++}:${child.tagName.toLowerCase()}`, fixed);
      }
    };
    walk(document.documentElement, 'html', false);
    return out;
    // `as unknown as` since OBRS-782 added a boolean field: the browser-side
    // literal is a Record of primitives and TypeScript will no longer accept a
    // direct assertion to `Box`, whose fields it cannot see are all present.
  }) as unknown as Promise<PageBoxes>;
}

async function sweepGroup(
  browser: import('@playwright/test').Browser,
  pages: SweepPage[],
  seedSession: (p: import('@playwright/test').Page) => Promise<void>,
  storeSeed?: (p: import('@playwright/test').Page) => Promise<void>
): Promise<void> {
  for (const vp of VIEWPORTS) {
    const page = await newSweepPage(browser, vp.w, vp.h);
    await seedSession(page);
    for (const p of pages) {
      await visit(page, p, storeSeed);
      // OBRS-776. `settle()` waits for `document.fonts.ready`, which resolves
      // whether the webfont ARRIVED or failed -- so the wait removes the race
      // but not the possibility that one phase measured Sarabun and the other
      // measured the fallback. Every text box is a different width in the two,
      // so a comparison across them is not a comparison of layout. This is the
      // CAPTURE lane and it is run by hand, so it can afford to insist on the
      // real typeface and say so; the gate keeps only the wait, and stays
      // hermetic.
      expect(
        await page.evaluate(() => document.fonts.check('16px Sarabun')),
        `${p.key}@${vp.w}: Sarabun did not load, so this phase would be measured in the fallback face`
      ).toBe(true);
      const boxes = await measureAll(page);
      // OBRS-782. Proof that the scroll normalisation in `measureAll` actually
      // arrived, asserted on the data recorded rather than on a second read a
      // round-trip later. `html`'s raw `y` is exactly `-scrollY` and `html` is
      // never in a fixed subtree, so a correctly normalised screen puts it at
      // 0 whatever the scroll was. A screen that lands here non-zero means the
      // arithmetic is wrong, and every rect on it would carry an offset that
      // is not layout -- so it fails by name instead of quietly.
      expect(
        boxes['html'].y,
        `${p.key}@${vp.w}: root box is not at 0 after normalisation, so every rect on this screen ` +
          'carries an offset that depends on where a click landed rather than on layout'
      ).toBe(0);
      collected[`${p.key}@${vp.w}`] = boxes;
    }
    await page.context().close();
  }
}

test.describe.configure({ mode: 'serial' });

test.describe(`OBRS-775 geometry (${PHASE})`, () => {
  test('customer pages', async ({ browser }) => {
    // OBRS-782: `CUSTOMER_EXTRA_SWEEP` too, or the reschedule dialog would be a
    // screen the GATE census reaches and this harness never measured -- which
    // is the exact asymmetry the page lists live in one module to prevent.
    await sweepGroup(browser, [...CUSTOMER_SWEEP, ...CUSTOMER_EXTRA_SWEEP], (p) => seedCustomerSession(p, false), seedStore);
  });

  test('public and auth-entry pages', async ({ browser }) => {
    await sweepGroup(browser, PUBLIC_SWEEP, seedAnonymousSession);
  });

  test('admin, staff and session-bound pages', async ({ browser }) => {
    await sweepGroup(browser, ADMIN_SWEEP, seedStaffSession);
  });

  test('nothing moved', async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(outFile(PHASE), JSON.stringify(collected, null, 1), 'utf8');

    const total = Object.values(collected).reduce((n, p) => n + Object.keys(p).length, 0);
    // eslint-disable-next-line no-console
    console.log(`OBRS775 phase=${PHASE} screens=${Object.keys(collected).length} boxes=${total}`);

    if (PHASE === 'before') {
      // A BEFORE phase has nothing to compare against. Say so out loud rather
      // than passing silently -- a green run that asserted nothing is the exact
      // shape of evidence this repo has been burned by.
      // eslint-disable-next-line no-console
      console.log(`OBRS775 baseline written to ${outFile('before')}; nothing asserted in this phase`);
      return;
    }

    const baselinePath = outFile('before');
    expect(
      fs.existsSync(baselinePath),
      `no baseline at ${baselinePath} -- run the BEFORE phase on a tree without the fix first`
    ).toBe(true);
    const before: Phase = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

    // The two phases must have measured the SAME screens. A screen present in
    // one and not the other means a page failed to render in a run whose other
    // cases still went green.
    expect(Object.keys(collected).sort(), 'screens measured differ between phases').toEqual(
      Object.keys(before).sort()
    );

    const moved: string[] = [];
    const structural: string[] = [];
    const animated: string[] = [];
    const zeroArea: string[] = [];
    const stuck: string[] = [];
    const scrolled: string[] = [];

    for (const screen of Object.keys(collected)) {
      const a = before[screen];
      const b = collected[screen];
      // OBRS-782. Did the two phases measure this screen at the same scroll
      // offset? Everything but a `position: sticky` box is recorded in
      // coordinates that do not care -- see `measureAll`. A sticky box does:
      // it is viewport-relative while stuck and in-flow while not, so the two
      // phases are only comparable if they were scrolled alike.
      const sameScroll = (a['html']?.scrollY ?? 0) === (b['html']?.scrollY ?? 0);
      if (!sameScroll) {
        // Not a failure -- it is the EVIDENCE that the normalisation earned
        // its place. A screen reached by clicking lands wherever the scrolling
        // left it, the two phases disagree, and every rect below still
        // compares equal. Printed so that fact is on the record instead of
        // being something a reader has to take on trust.
        scrolled.push(
          `${screen} phases scrolled ${a['html']?.scrollY} vs ${b['html']?.scrollY}; ` +
            'compared in document coordinates'
        );
      }
      for (const key of Object.keys(b)) {
        if (!a[key]) {
          structural.push(`${screen} ${key} appeared`);
          continue;
        }
        // THIRD EXCLUSION (OBRS-782), and the narrowest of the three: only
        // sticky boxes, and only on a screen the two phases scrolled
        // differently. On every other screen a sticky box is compared like any
        // other. Printed, like the rest.
        if (!sameScroll && (a[key].sticky || b[key].sticky)) {
          stuck.push(
            `${screen} ${key} sticky, phases scrolled ${a['html']?.scrollY} vs ${b['html']?.scrollY}`
          );
          continue;
        }
        // EXCLUSION, stated out loud rather than absorbed into the tolerance.
        // `/payment/result` renders `.spinner { animation: spin 0.9s linear
        // infinite }`, and `getBoundingClientRect` on a rotating box returns its
        // AXIS-ALIGNED bounds -- which breathe between 50.98 and 60.11 px as it
        // turns. The first run reported it as a 6.86px move in one direction at
        // 1280 and the OTHER direction at 576, which is the signature of a phase
        // difference and not of layout. Widening TOLERANCE to swallow it would
        // have blinded this harness to every real move under 7px; excluding the
        // handful of elements that are genuinely time-dependent costs nothing
        // and is listed below so the exclusion is never silent.
        if (a[key].anim !== 'none' || b[key].anim !== 'none') {
          animated.push(`${screen} ${key} anim=${b[key].anim}`);
          continue;
        }
        // SECOND EXCLUSION, added by OBRS-776 and on the same terms: named,
        // printed, and narrow enough to state as a rule rather than a list.
        //
        // A box with zero AREA in BOTH phases paints nothing -- no background,
        // no border (a border would give it height), no text -- and cannot take
        // a pointer event. It is not part of any layout, so a change to its rect
        // is not a layout change. `<head>` was already skipped on exactly this
        // reasoning; this is the same argument for the zero-area nodes that live
        // in `<body>`.
        //
        // OBRS-776 produced eleven of them and no other move. Seven are the
        // INACTIVE `p-tabpanel`s on `/`, which hold no panel div while hidden:
        // 0x0 as inline boxes, 246-1008px wide and still 0px tall once the
        // global rule blockifies them. Four are the `<router-outlet>` MARKER
        // before `app-config-change-history-page`, whose y shifted 16px when
        // that host stopped being inline. In both cases every element with
        // actual extent on those screens is identical to the last hundredth of a
        // pixel, which is what makes this an exclusion and not a finding.
        //
        // Note what it does NOT cover: a box that is zero-area in one phase and
        // real in the other still falls through to the comparison below, because
        // that is a box appearing or vanishing and it is exactly what this
        // harness is for.
        const areaBefore = a[key].w * a[key].h;
        const areaAfter = b[key].w * b[key].h;
        if (areaBefore === 0 && areaAfter === 0) {
          const d0 = Math.max(
            Math.abs(a[key].x - b[key].x),
            Math.abs(a[key].y - b[key].y),
            Math.abs(a[key].w - b[key].w),
            Math.abs(a[key].h - b[key].h)
          );
          if (d0 > TOLERANCE) {
            zeroArea.push(
              `${screen} ${key} zero-area, rect changed by ${d0.toFixed(2)}px ` +
                `before=${JSON.stringify([a[key].x, a[key].y, a[key].w, a[key].h])} ` +
                `after=${JSON.stringify([b[key].x, b[key].y, b[key].w, b[key].h])}`
            );
          }
          continue;
        }
        const d = Math.max(
          Math.abs(a[key].x - b[key].x),
          Math.abs(a[key].y - b[key].y),
          Math.abs(a[key].w - b[key].w),
          Math.abs(a[key].h - b[key].h)
        );
        if (d > TOLERANCE) {
          moved.push(
            `${screen} ${key} moved by ${d.toFixed(2)}px ` +
              `before=${JSON.stringify([a[key].x, a[key].y, a[key].w, a[key].h])} ` +
              `after=${JSON.stringify([b[key].x, b[key].y, b[key].w, b[key].h])}`
          );
        }
      }
      for (const key of Object.keys(a)) if (!b[key]) structural.push(`${screen} ${key} disappeared`);
    }

    fs.writeFileSync(
      path.join(OUT_DIR, 'obrs775-geometry-diff.txt'),
      [
        `moved=${moved.length}`,
        `structural=${structural.length}`,
        `excluded-as-animated=${animated.length}`,
        `excluded-as-zero-area=${zeroArea.length}`,
        `excluded-as-sticky-at-differing-scroll=${stuck.length}`,
        `screens-whose-phases-scrolled-differently=${scrolled.length}`,
        ...structural,
        ...moved,
        ...animated,
        ...zeroArea,
        ...stuck,
        ...scrolled,
      ].join('\n'),
      'utf8'
    );
    // eslint-disable-next-line no-console
    console.log(
      `OBRS775 compared=${total - animated.length} excluded-as-animated=${animated.length} ` +
        `excluded-as-zero-area=${zeroArea.length} moved=${moved.length} structural=${structural.length}`
    );

    expect(structural, 'the DOM changed shape -- a :host display must never do that').toEqual([]);
    expect(moved, `${moved.length} element(s) moved; see e2e-evidence/obrs775-geometry-diff.txt`).toEqual([]);
  });
});
