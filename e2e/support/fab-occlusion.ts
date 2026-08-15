import { Page } from '@playwright/test';

/**
 * OBRS-1207 — does the `position: fixed` report FAB steal the click from
 * anything underneath it, at ANY reachable scroll position?
 *
 * WHY THIS EXISTS RATHER THAN A boundingBox() COMPARISON. The guard this
 * replaces (`report-usability-issue.spec.ts`, two cases) compared the FAB's
 * viewport box against `.select-btn`'s viewport box and never touched the
 * scroll position. The FAB is fixed and the button is not, so their boxes only
 * overlap when the page happens to be scrolled to the right place — the
 * assertion's result was a function of where the page came to rest, not of the
 * code. Measured: the SAME tree (`098022f8`) passed on PR #167, went red on the
 * `dev` merge `8c43dcec`, and passed 6/6 locally. It had also been green for
 * months while the defect was present. A gate whose verdict is a coin toss is
 * not a gate.
 *
 * WHY IT IS NOT A SCROLL SAMPLE EITHER. Stepping the page in 40px increments and
 * probing is still sampling: an element shorter than the step can slip between
 * two samples, and the step size becomes a hidden tuning knob nobody re-checks.
 * `findOcclusions` instead SOLVES for the scroll offsets that put an element's
 * click point inside the FAB band — the answer is a closed interval per element,
 * so no offset can be missed — and then goes to that offset and asks the browser
 * with `document.elementFromPoint()`, which is the only oracle that accounts for
 * z-index, stacking contexts, `pointer-events` and transforms at once.
 */

/** Everything a user can click, and therefore everything the FAB can steal. */
export const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** One interactive element whose click point the FAB actually takes. */
export interface Occlusion {
  /** Sweep key or route this was found on — filled in by the caller. */
  page: string;
  /** `tagName.class#id` of the victim, enough to find it in the template. */
  victim: string;
  /** Its visible text, trimmed — what the user thought they were clicking. */
  text: string;
  /** The scroll offset that produces the collision. */
  scrollY: number;
  /** The click point, in viewport coordinates, at that offset. */
  point: { x: number; y: number };
  /** What `document.elementFromPoint` returned there instead of the victim. */
  hitInstead: string;
}

const MARKER = 'data-obrs1207-probe';

function describe(el: Element): string {
  const cls = (el.getAttribute('class') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((c) => `.${c}`)
    .join('');
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}`;
}

/**
 * Puts the page at `y` and does not return until it is actually there.
 *
 * `window.scrollTo(0, y)` is NOT enough and the difference is not cosmetic.
 * Bootstrap's reboot sets `:root { scroll-behavior: smooth }` under
 * `prefers-reduced-motion: no-preference`, which this repo ships, so a plain
 * scrollTo starts an ANIMATION. Measured on /schedule-booking: `scrollTo(0,173)`
 * read back 37 one frame later, and `documentElement.scrollTop = 300` read back
 * 40 — a probe that trusted either number would measure a viewport nobody is
 * looking at and report a clean page. `behavior: 'instant'` overrides the
 * stylesheet at the call site, and the poll below turns "I asked" into "it is
 * there" rather than betting on a frame count.
 *
 * The same stylesheet rule is why the guard this card replaces was a coin toss:
 * `home.component.ts:65` calls `scrollIntoView({ behavior: 'smooth' })`, and the
 * search click navigates away mid-animation, so /schedule-booking inherits
 * whatever offset the animation had reached. Measured across three runs of the
 * same tree: 17, 18, 19.
 */
export async function scrollToInstantly(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => {
    window.scrollTo({ top, left: 0, behavior: 'instant' as ScrollBehavior });
  }, y);
  await page
    .waitForFunction(
      (top) => Math.abs(window.scrollY - top) <= 1,
      y,
      { timeout: 5_000, polling: 'raf' }
    )
    .catch(() => {
      /* Clamped by a shorter document than we solved against — the confirm
         step below re-reads the real geometry, so a missed target can only
         make this probe report LESS, never a false positive. */
    });
  // One more frame for anything that reacts to scrolling (sticky headers,
  // shrink-on-scroll bars) to settle before the point is sampled.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  );
}

/**
 * Kills the smooth-scroll animation for the rest of the page's life and waits
 * for any animation already in flight to stop.
 *
 * Without this the probe is flaky in its OWN right, which was measured, not
 * feared: two consecutive runs of the home-page case on the same tree gave
 * `.btn-search` occluded at scrollY=39 and then a clean page, because
 * `home.component.ts:65` smooth-scrolls to the booking form on load and phase 1
 * read the geometry at whatever point that animation had reached. Shipping a
 * gate with the same defect it was written to remove would be the joke telling
 * itself.
 *
 * Overriding `scroll-behavior` does not weaken what is under test: the verdict
 * is "is there ANY reachable offset where a click is stolen", and the set of
 * reachable offsets is a property of the document's height, not of how the
 * browser animates its way between them.
 */
export async function stabilizeScrolling(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*, *::before, *::after, :root { scroll-behavior: auto !important; }`,
  });
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __obrs1207Last?: number; __obrs1207Still?: number };
      const y = window.scrollY;
      if (w.__obrs1207Last === y) {
        w.__obrs1207Still = (w.__obrs1207Still ?? 0) + 1;
      } else {
        w.__obrs1207Still = 0;
      }
      w.__obrs1207Last = y;
      return (w.__obrs1207Still ?? 0) >= 5;
    },
    undefined,
    { timeout: 10_000, polling: 'raf' }
  );
}

/**
 * Every interactive element on the current page whose centre point the FAB
 * takes at some reachable scroll offset. Empty array = the page is clean.
 *
 * Leaves the page scrolled wherever the last probe put it; callers that measure
 * anything afterwards should reset it themselves.
 */
export async function findOcclusions(page: Page, pageKey: string): Promise<Occlusion[]> {
  await stabilizeScrolling(page);

  // Phase 1 — tag every candidate and solve for the offsets that collide.
  // Done in one evaluate so the DOM cannot move between reading the FAB's box
  // and reading the victims'.
  const candidates = await page.evaluate(
    ({ selector, marker, describeSrc }) => {
      const describeEl = new Function('el', `return (${describeSrc})(el)`) as (el: Element) => string;
      const fab = document.querySelector('.report-fab');
      if (!fab) return [];
      const f = fab.getBoundingClientRect();
      // A fixed element's viewport box IS its box at every scroll offset, which
      // is exactly why the old bounding-box comparison could not see this.
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - document.documentElement.clientHeight
      );
      const startScroll = window.scrollY;

      const out: {
        idx: number;
        victim: string;
        text: string;
        scrollY: number;
        cx: number;
        cyAbs: number;
      }[] = [];

      let idx = 0;
      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (el === fab || fab.contains(el) || el.contains(fab)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') {
          continue;
        }
        // A second fixed/sticky element never scrolls into the FAB, so solving
        // for an offset would produce a number that means nothing. Those are
        // either colliding right now (offset = current) or never.
        const fixed = style.position === 'fixed' || style.position === 'sticky';

        const cx = r.x + r.width / 2;
        if (cx < f.left || cx > f.right) continue;

        const cyAbs = r.y + r.height / 2 + startScroll;
        // Viewport y at offset s is `cyAbs - s`; we need f.top <= cyAbs - s <= f.bottom.
        const lo = Math.ceil(cyAbs - f.bottom);
        const hi = Math.floor(cyAbs - f.top);
        const from = Math.max(0, lo);
        const to = Math.min(maxScroll, hi);
        const target = fixed ? startScroll : Math.round((from + to) / 2);
        if (!fixed && from > to) continue;
        if (fixed) {
          const cy = r.y + r.height / 2;
          if (cy < f.top || cy > f.bottom) continue;
        }

        el.setAttribute(marker, String(idx));
        out.push({
          idx,
          victim: describeEl(el),
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
          scrollY: target,
          cx,
          cyAbs,
        });
        idx += 1;
      }
      return out;
    },
    { selector: INTERACTIVE_SELECTOR, marker: MARKER, describeSrc: describe.toString() }
  );

  // Phase 2 — go to each solved offset and let the browser answer.
  //
  // Per candidate rather than grouped by offset, with one re-solve: scrolling
  // can move the page's own furniture (a sticky header that shrinks, a bar that
  // hides), so the offset solved from the layout at rest can land the element a
  // few pixels outside the band. Re-solving from the geometry AT that offset
  // closes that gap. Only x-overlapping elements reach here, so this is a
  // handful of scrolls per page, not one per interactive element.
  const confirmed: Occlusion[] = [];
  for (const c of candidates) {
    let target = c.scrollY;
    let hit: { x: number; y: number; hitInstead: string; retryAt: number | null } | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await scrollToInstantly(page, target);
      hit = await page.evaluate(
        ({ marker, idx, describeSrc }) => {
          const describeEl = new Function('el', `return (${describeSrc})(el)`) as (
            el: Element
          ) => string;
          const fab = document.querySelector('.report-fab');
          const el = document.querySelector(`[${marker}="${idx}"]`);
          if (!fab || !el) return null;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return null;
          const f = fab.getBoundingClientRect();
          const x = r.x + r.width / 2;
          const y = r.y + r.height / 2;

          // Not in the band any more — hand back the offset that WOULD put it
          // there given where things sit now, so the caller can try once more.
          if (x < f.left || x > f.right || y < f.top || y > f.bottom) {
            const max = Math.max(
              0,
              document.documentElement.scrollHeight - document.documentElement.clientHeight
            );
            const abs = y + window.scrollY;
            const lo = Math.max(0, Math.ceil(abs - f.bottom));
            const hi = Math.min(max, Math.floor(abs - f.top));
            const retryAt = lo > hi ? null : Math.round((lo + hi) / 2);
            return { x, y, hitInstead: '', retryAt: retryAt === window.scrollY ? null : retryAt };
          }

          if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return null;
          const top = document.elementFromPoint(x, y);
          if (!top) return null;
          // The victim itself, or one of its own children, means the click lands.
          if (top === el || el.contains(top)) return null;
          // Only the FAB is this card's business. Anything else on top is a
          // different overlay and a different card — reporting it here would
          // make this gate red for reasons it cannot explain.
          if (top !== fab && !fab.contains(top)) return null;
          return { x, y, hitInstead: describeEl(top), retryAt: null };
        },
        { marker: MARKER, idx: c.idx, describeSrc: describe.toString() }
      );

      if (!hit) break;
      if (hit.hitInstead) break;
      if (hit.retryAt === null) {
        hit = null;
        break;
      }
      target = hit.retryAt;
      hit = null;
    }

    if (hit && hit.hitInstead) {
      confirmed.push({
        page: pageKey,
        victim: c.victim,
        text: c.text,
        scrollY: target,
        point: { x: Math.round(hit.x), y: Math.round(hit.y) },
        hitInstead: hit.hitInstead,
      });
    }
  }

  await page.evaluate((marker) => {
    document.querySelectorAll(`[${marker}]`).forEach((el) => el.removeAttribute(marker));
  }, MARKER);

  return confirmed;
}

/** One line per occlusion, for a failure message that names what broke. */
export function formatOcclusions(list: Occlusion[]): string {
  return list
    .map(
      (o) =>
        `  ${o.page}: ${o.victim} "${o.text}" — at scrollY=${o.scrollY} the point ` +
        `(${o.point.x}, ${o.point.y}) hits ${o.hitInstead} instead`
    )
    .join('\n');
}
