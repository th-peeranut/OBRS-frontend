import { Page } from '@playwright/test';
import { leafOf } from './customer-contrast';

/**
 * OBRS-925 -- the repo-wide target-size checker. WCAG 2.2 SC 2.5.8 Target Size
 * (Minimum), level AA: 24x24 CSS px.
 *
 * WHY THIS IS MEASURED IN A BROWSER AND NOT PARSED OUT OF A STYLESHEET.
 * OBRS-913's defect was `.admin-sidebar-pin` DECLARING `height: 28px` and
 * RENDERING at 20: it is a `flex-shrink: 1` item of a column that overflows on
 * a laptop-height viewport. A declaration is an INPUT to layout, not a
 * description of the result -- so a source parser reads 28 and passes it, which
 * is what the repo's `scripts/check-*.mjs` gates all did while the button was
 * 20px on prod. Every number this module produces comes from
 * `getBoundingClientRect()` on a page the lane actually rendered.
 *
 * WHY THE EXCEPTIONS ARE FOUR SEPARATE PREDICATES AND NOT ONE SKIP LIST.
 * SC 2.5.8 has real exceptions, and a checker that ignores them reports
 * conformant markup as debt until somebody switches it off. But "skip anything
 * awkward" is the same gate with a nicer name, so each exception below is its
 * own predicate, decided per element and COUNTED, and the counts are printed on
 * every run (AC-7). An exception whose count drifts is visible; a skip list's
 * silence is not.
 *
 * ASCII-only source.
 */

/** SC 2.5.8 Target Size (Minimum), level AA. The card refuses 44x44 explicitly. */
export const MIN_TARGET_PX = 24;

/** AC-2's population. */
export const TARGET_SELECTOR =
  'button, a[href], [role="button"], input, select, summary, [tabindex]:not([tabindex="-1"])';

export type ExemptReason = 'ua-size' | 'inline-text' | 'spacing' | 'equivalent';
export type SkipReason = 'disabled' | 'invisible';

export interface TargetFinding {
  /** What ALLOW is keyed on: the element, not the wrappers above it. See `leafOf`. */
  key: string;
  path: string;
  page: string;
  width: number;
  height: number;
  label: string;
}

/**
 * A declared "the same job is done by a full-size control on this page" claim
 * (SC 2.5.8 exception: Equivalent). Unlike the other three exceptions this one
 * cannot be derived -- only a human knows two controls do the same job -- so it
 * is declared, and then CHECKED: the alternative must be present and itself
 * >= 24x24 on the page where the exemption is claimed, or the small control is
 * reported as a violation anyway.
 */
export interface EquivalentEntry {
  /** Selector for the full-size control on the SAME page that does the same job. */
  alternative: string;
  why: string;
}

export interface TargetScan {
  page: string;
  /** Visible, enabled targets actually measured on this page. */
  measured: number;
  skipped: Record<SkipReason, number>;
  exempt: Record<ExemptReason, number>;
  violations: TargetFinding[];
  /**
   * The key of every target measured here -- not just the small ones. This is
   * what lets the stale-ALLOW check tell "we measured it and it passes now"
   * from "no page in the sweep rendered that element at all" (OBRS-1435: only
   * the first of those two says to delete the entry).
   */
  seen: string[];
  /** EQUIVALENT keys this page actually needed. */
  equivalentUsed: string[];
  /** EQUIVALENT keys whose named alternative is missing or itself undersized here. */
  equivalentBroken: string[];
}

interface RawUndersized {
  path: string;
  width: number;
  height: number;
  label: string;
  spaced: boolean;
}

interface RawScan {
  measured: number;
  skipped: Record<SkipReason, number>;
  exempt: { 'ua-size': number; 'inline-text': number };
  undersized: RawUndersized[];
  seen: string[];
  alternatives: Record<string, boolean>;
}

/**
 * Measures every visible interactive control on the page as it stands.
 *
 * Order of exceptions is first-match-wins and deliberate: `ua-size` and
 * `inline-text` are facts about the element, `spacing` is a fact about its
 * neighbours, and `equivalent` -- the only DECLARED one -- is asked last, so a
 * control the spacing rule already excuses never needs a declaration, and any
 * declaration that becomes unnecessary is reported stale rather than sitting
 * there being believed.
 */
export async function scanTargetSizes(
  page: Page,
  pageKey: string,
  equivalent: Record<string, EquivalentEntry> = {}
): Promise<TargetScan> {
  const altSelectors: Record<string, string> = {};
  for (const [k, v] of Object.entries(equivalent)) altSelectors[k] = v.alternative;

  const raw: RawScan = await page.evaluate(
    ({ selector, min, alts }) => {
      /**
       * The same identity the contrast gate keys on, and for the same reasons
       * (OBRS-584): Angular's `_ngcontent-*` / `ng-*` state classes change on
       * every build and every form interaction, so leaving them in would rot
       * every ALLOW key within a day.
       */
      const pathOf = (el: Element): string => {
        const parts: string[] = [];
        for (let n: Element | null = el; n && n !== document.body && parts.length < 5; n = n.parentElement) {
          let s = n.tagName.toLowerCase();
          const cls = (n.getAttribute('class') || '')
            .split(/\s+/)
            .filter((c) => c && !/^ng-|^_ng|^cdk-|^p-element$/.test(c))
            .slice(0, 3);
          if (cls.length) s += '.' + cls.join('.');
          parts.unshift(s);
        }
        return parts.join(' > ');
      };

      const visible = (el: Element): boolean => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };

      // Not an exception -- a population question. SC 2.5.8 is about targets,
      // and a control that cannot be operated is not one. Counted, so a page
      // that goes quiet because everything on it went disabled is visible.
      const inert = (el: Element): boolean =>
        el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';

      const labelOf = (el: Element): string =>
        (
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          (el.textContent || '').trim() ||
          el.getAttribute('name') ||
          ''
        )
          .replace(/\s+/g, ' ')
          .slice(0, 40);

      const round = (n: number): number => Math.round(n * 10) / 10;

      const skipped = { disabled: 0, invisible: 0 };
      const live: { el: Element; r: DOMRect }[] = [];
      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (inert(el)) {
          skipped.disabled++;
          continue;
        }
        if (!visible(el)) {
          skipped.invisible++;
          continue;
        }
        live.push({ el, r: el.getBoundingClientRect() });
      }

      /**
       * SC 2.5.8 exception: User agent control -- "the size of the target is
       * determined by the user agent and is not modified by the author".
       *
       * Decided by MEASUREMENT rather than by a list of tags we assume nobody
       * styles: a bare control of the same kind is inserted beside this one
       * carrying none of its classes, and both are measured in the same layout.
       * Same box => this element is the size the UA gives that control here.
       * An author rule that resized THIS one (a class, an id, an inline style)
       * leaves the probe at the UA size and the two disagree, so the element
       * stays in the population. The known limit, stated rather than hidden: a
       * rule written against the bare tag/type hits the probe too, and that
       * author-set size then reads as the UA's.
       */
      const UA_WIDGET = ['checkbox', 'radio', 'range', 'color', 'file'];
      const uaSized = (el: Element): boolean => {
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (tag !== 'select' && !(tag === 'input' && UA_WIDGET.indexOf(type) >= 0)) return false;
        if (!el.parentElement) return false;
        const probe = document.createElement(tag);
        if (tag === 'input') probe.setAttribute('type', type);
        el.parentElement.insertBefore(probe, el);
        const p = probe.getBoundingClientRect();
        const now = el.getBoundingClientRect();
        probe.remove();
        return Math.abs(p.width - now.width) < 0.5 && Math.abs(p.height - now.height) < 0.5;
      };

      /**
       * SC 2.5.8 exception: Inline -- "the target is in a sentence, or its size
       * is otherwise constrained by the line-height of non-target text".
       *
       * Both halves are required: `display: inline` (an inline-BLOCK control in
       * a paragraph is not constrained by the line box -- it sets its own
       * height and an author chose it), and real non-target text in the same
       * flow. That text is counted with every other TARGET's text removed, so a
       * row of small icon links cannot excuse itself by quoting its neighbours'
       * labels.
       */
      const inlineInText = (el: Element): boolean => {
        if (getComputedStyle(el).display !== 'inline') return false;
        const parent = el.parentElement;
        if (!parent) return false;
        let n = 0;
        const walk = (node: Node): void => {
          for (const c of Array.from(node.childNodes)) {
            if (c.nodeType === 3) n += (c.textContent || '').trim().length;
            else if (c.nodeType === 1 && !(c as Element).matches(selector)) walk(c);
          }
        };
        walk(parent);
        return n > 0;
      };

      /**
       * SC 2.5.8 exception: Spacing -- "undersized targets are positioned so
       * that if a 24 CSS pixel diameter circle is centered on the bounding box
       * of each, the circles do not intersect another target or the circle of
       * another undersized target".
       *
       * Implemented literally: circle-vs-box against every full-size target,
       * circle-vs-circle against every undersized one. A nested pair is skipped
       * -- an icon button inside a clickable row overlaps its own container by
       * construction, and reporting that as crowding would bury the real ones.
       */
      const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);
      const centreOf = (r: DOMRect): { x: number; y: number } => ({
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      });
      const circleHitsRect = (c: { x: number; y: number }, rad: number, r: DOMRect): boolean =>
        dist(c.x, c.y, Math.max(r.left, Math.min(c.x, r.right)), Math.max(r.top, Math.min(c.y, r.bottom))) < rad;
      const spacedApart = (el: Element, r: DOMRect): boolean => {
        const c = centreOf(r);
        for (const other of live) {
          if (other.el === el) continue;
          if (el.contains(other.el) || other.el.contains(el)) continue;
          const big = other.r.width >= min && other.r.height >= min;
          if (big) {
            if (circleHitsRect(c, min / 2, other.r)) return false;
          } else {
            const oc = centreOf(other.r);
            if (dist(c.x, c.y, oc.x, oc.y) < min) return false;
          }
        }
        return true;
      };

      const exempt = { 'ua-size': 0, 'inline-text': 0 };
      const undersized: RawUndersized[] = [];
      for (const t of live) {
        if (t.r.width >= min && t.r.height >= min) continue;
        if (uaSized(t.el)) {
          exempt['ua-size']++;
          continue;
        }
        if (inlineInText(t.el)) {
          exempt['inline-text']++;
          continue;
        }
        undersized.push({
          path: pathOf(t.el),
          width: round(t.r.width),
          height: round(t.r.height),
          label: labelOf(t.el),
          spaced: spacedApart(t.el, t.r),
        });
      }

      const alternatives: Record<string, boolean> = {};
      for (const k of Object.keys(alts)) {
        const a = document.querySelector(alts[k]);
        if (!a || !visible(a)) {
          alternatives[k] = false;
          continue;
        }
        const ar = a.getBoundingClientRect();
        alternatives[k] = ar.width >= min && ar.height >= min;
      }

      return {
        measured: live.length,
        skipped,
        exempt,
        undersized,
        seen: live.map((t) => pathOf(t.el)),
        alternatives,
      };
    },
    { selector: TARGET_SELECTOR, min: MIN_TARGET_PX, alts: altSelectors }
  );

  const exempt: Record<ExemptReason, number> = {
    'ua-size': raw.exempt['ua-size'],
    'inline-text': raw.exempt['inline-text'],
    spacing: 0,
    equivalent: 0,
  };
  const violations: TargetFinding[] = [];
  const equivalentUsed: string[] = [];
  const equivalentBroken: string[] = [];

  for (const u of raw.undersized) {
    const key = leafOf(u.path);
    if (u.spaced) {
      exempt.spacing++;
      continue;
    }
    const declared = equivalent[key];
    if (declared) {
      if (raw.alternatives[key]) {
        exempt.equivalent++;
        equivalentUsed.push(key);
        continue;
      }
      equivalentBroken.push(key);
    }
    violations.push({ key, path: u.path, page: pageKey, width: u.width, height: u.height, label: u.label });
  }

  return {
    page: pageKey,
    measured: raw.measured,
    skipped: raw.skipped,
    exempt,
    violations,
    seen: raw.seen.map(leafOf),
    equivalentUsed,
    equivalentBroken,
  };
}
