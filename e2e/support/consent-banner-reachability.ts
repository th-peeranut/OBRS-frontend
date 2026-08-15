import { Page } from '@playwright/test';
import { INTERACTIVE_SELECTOR, scrollToInstantly, stabilizeScrolling } from './fab-occlusion';

/**
 * OBRS-1372 — while the PDPA bar is up, can the visitor still REACH every control
 * on the page?
 *
 * WHY THIS ASKS A DIFFERENT QUESTION FROM `fab-occlusion.ts`
 * That module asks "is there any scroll offset where this element loses its click",
 * which is the right question for the FAB: it is a small box in one corner, and an
 * element sitting under it at some offset is a defect because the user has no reason
 * to expect it. The consent bar is the opposite shape — full width, 246px tall at an
 * iPhone 14 viewport with the Thai copy (measured on prod 2026-08-15) — and it is
 * OPAQUE ON PURPOSE. Of course things are behind it. Asking that question here would
 * report every button on the page and could only be satisfied by making the bar
 * smaller or click-through, both of which the card forbids and for good reason.
 *
 * The property that actually matters, and the one that was false, is REACHABILITY:
 * for each control there must exist a scroll offset the user can reach where the
 * click lands on it. `position: fixed` took the bar out of the flow, so the document
 * ended exactly where it did before and the last 246px of every page could never be
 * scrolled clear — the bottom of the page was not "behind the bar", it was gone until
 * the question was answered.
 *
 * So: solve for the offset that puts each control's click point just ABOVE the bar,
 * clamped to what the document can actually scroll, go there, and ask
 * `document.elementFromPoint()`. A control that still hits the bar at its own best
 * offset is unreachable. After the fix that offset always exists, because the body
 * carries the bar's measured height as padding.
 *
 * WHAT IS DELIBERATELY NOT SWEPT: `position: fixed` / `sticky` controls. Scrolling
 * moves them nowhere, so reachability is not a property they have — the only one on a
 * customer page is the usability FAB, whose overlap with the bar is a decision
 * (analytics-consent-banner.component.scss's z-index note) pinned by
 * `e2e/tests/analytics-consent-banner.spec.ts`. Reporting it here would make this
 * sweep red for something another spec asserts must be true.
 */

const BANNER = '.consent-banner';
const MARKER = 'data-obrs1372-probe';

/** One control the visitor cannot reach at any scroll offset while the bar is up. */
export interface Unreachable {
  /** Sweep key or route this was found on — filled in by the caller. */
  page: string;
  /** `tagName#id.class` of the victim, enough to find it in the template. */
  victim: string;
  /** Its visible text, trimmed. */
  text: string;
  /** The best offset there is for it — where the measurement below was taken. */
  scrollY: number;
  /** Its click point, in viewport coordinates, at that offset. */
  point: { x: number; y: number };
  /** What `document.elementFromPoint` returned there instead. */
  hitInstead: string;
}

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
 * Every in-flow interactive element on the current page that the consent bar keeps
 * from being clicked at EVERY reachable scroll offset. Empty array = the page is
 * reachable.
 *
 * Throws if the bar is not on screen: a sweep that silently measures the answered
 * state would be green for the one reason that means nothing.
 *
 * Leaves the page scrolled wherever the last probe put it.
 */
export async function findUnreachable(page: Page, pageKey: string): Promise<Unreachable[]> {
  await page.locator(BANNER).waitFor({ state: 'visible', timeout: 15_000 });
  await stabilizeScrolling(page);

  // Phase 1 — tag every candidate and solve for its best offset, in one evaluate so
  // nothing can move between reading the bar's box and reading the victims'.
  const candidates = await page.evaluate(
    ({ selector, banner, marker, describeSrc }) => {
      const describeEl = new Function('el', `return (${describeSrc})(el)`) as (el: Element) => string;
      const bar = document.querySelector(banner);
      if (!bar) throw new Error('findUnreachable: no .consent-banner on the page');
      const b = bar.getBoundingClientRect();
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - document.documentElement.clientHeight
      );
      const startScroll = window.scrollY;

      const out: { idx: number; victim: string; text: string; scrollY: number }[] = [];
      let idx = 0;

      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (bar.contains(el) || el.contains(bar)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') {
          continue;
        }
        // See the header: scrolling moves these nowhere, so reachability is not
        // theirs to have.
        if (style.position === 'fixed' || style.position === 'sticky') continue;

        const cyAbs = r.y + r.height / 2 + startScroll;
        // Viewport y at offset s is `cyAbs - s`. The best the page can do for this
        // element is to put that one pixel above the bar's top edge — and then only
        // as far as the document can actually be scrolled, which is the half that
        // was missing.
        const ideal = Math.ceil(cyAbs - (b.top - 1));
        const target = Math.min(maxScroll, Math.max(0, ideal));

        el.setAttribute(marker, String(idx));
        out.push({
          idx,
          victim: describeEl(el),
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
          scrollY: target,
        });
        idx += 1;
      }
      return out;
    },
    { selector: INTERACTIVE_SELECTOR, banner: BANNER, marker: MARKER, describeSrc: describe.toString() }
  );

  // Phase 2 — go to each element's best offset and let the browser answer. One
  // re-solve, for the same reason OBRS-1207 needed one: scrolling can move the
  // page's own furniture, so an offset solved from the layout at rest can land the
  // element somewhere else.
  const confirmed: Unreachable[] = [];
  for (const c of candidates) {
    let target = c.scrollY;
    let hit: { x: number; y: number; hitInstead: string; retryAt: number | null } | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await scrollToInstantly(page, target);
      hit = await page.evaluate(
        ({ banner, marker, idx, describeSrc }) => {
          const describeEl = new Function('el', `return (${describeSrc})(el)`) as (
            el: Element
          ) => string;
          const bar = document.querySelector(banner);
          const el = document.querySelector(`[${marker}="${idx}"]`);
          if (!bar || !el) return null;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return null;
          const b = bar.getBoundingClientRect();
          const x = r.x + r.width / 2;
          const y = r.y + r.height / 2;

          const max = Math.max(
            0,
            document.documentElement.scrollHeight - document.documentElement.clientHeight
          );
          const ideal = Math.ceil(y + window.scrollY - (b.top - 1));
          const better = Math.min(max, Math.max(0, ideal));
          if (better !== window.scrollY) return { x, y, hitInstead: '', retryAt: better };

          if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return null;
          const top = document.elementFromPoint(x, y);
          if (!top) return null;
          if (top === el || el.contains(top)) return null;
          // Only the consent bar is this card's business. Anything else on top is a
          // different overlay and a different card.
          if (top !== bar && !bar.contains(top)) return null;
          return { x, y, hitInstead: describeEl(top), retryAt: null };
        },
        { banner: BANNER, marker: MARKER, idx: c.idx, describeSrc: describe.toString() }
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

/** One line per unreachable control, so a red run names what broke. */
export function formatUnreachable(list: Unreachable[]): string {
  return list
    .map(
      (u) =>
        `  ${u.page}: ${u.victim} "${u.text}" — its best offset is scrollY=${u.scrollY}, ` +
        `and even there the point (${u.point.x}, ${u.point.y}) hits ${u.hitInstead}`
    )
    .join('\n');
}
