/**
 * OBRS-772 -- what the three boundary policies LOOK LIKE on the real screens.
 *
 * The card already carries a colour-comparison sheet (comment #1,
 * `OBRS-772-boundary-options-2026-09-05.png`), and that comment says on its own
 * face that the sheet is swatches and not the app. The decision the card is
 * stuck on -- "does a faint border on a button that already has a readable
 * label count as information required to identify the control" -- is a
 * judgement about how the app looks once every such border is repainted, and a
 * swatch cannot answer it.
 *
 * So this photographs the real pages, in the same lane, through the same
 * fixtures the two contrast gates use, three times each:
 *
 *   current  no change
 *   A        every control boundary repainted to the candidate token
 *   B        only fields and icon-only buttons repainted; a button with a
 *            readable label keeps the border it has today
 *
 * The repaint is applied to the LIVE page rather than to the SCSS, and that is
 * the one thing to hold against these pictures: they are a MOCK-UP of the
 * outcome, not a build of it. It is faithful about which elements change --
 * the population is derived the same way `customer-contrast.ts` derives
 * invariant B's, from the computed border of each control, not from a
 * hand-typed class list that could quietly omit one. It is not faithful about
 * how the change would be implemented: shipping A or B means a new control
 * boundary token pointed at hand-picked call sites (comment #1 section 2
 * measured why changing `$primary-lightgrey` in place cannot work).
 *
 * NOT A GATE. Nothing here asserts. It writes PNGs and passes.
 *
 * ASCII-only source.
 */
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';
import { STAFF_PAGES, seedStaffSweepSession } from '../support/staff-pages';

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-772');

/** Comment #1 section 5, measured: 4.69:1 on #ffffff, 4.03:1 on the dark card. */
const CANDIDATE = { light: '#6c757d', dark: 'rgba(255,255,255,0.42)' };

type Variant = 'current' | 'A' | 'B';

/**
 * Repaint, in the live page, the boundaries the named policy would repaint.
 * Returns how many elements it touched, so a variant that silently matched
 * nothing is visible in the log instead of looking like "no change needed".
 */
function repaint([variant, colour]: [Variant, string]): number {
  if (variant === 'current') return 0;
  const CONTROLS =
    'button, [role="button"], input:not([type="hidden"]), select, textarea, a.btn, ' +
    'a[class*="-btn"], .ptype-tile, .route-group-header, .tab, .filter-pill';

  const rgba = (v: string): number[] => {
    const m = v.match(/[\d.]+/g);
    if (!m) return [0, 0, 0, 0];
    return [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]];
  };
  const lum = (c: number[]): number => {
    const f = (x: number) => {
      const s = x / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a: number[], b: number[]): number => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  /** The colour actually painted behind `el`, walking past transparent ancestors. */
  const painted = (el: Element | null): number[] => {
    let node = el;
    while (node) {
      const c = rgba(getComputedStyle(node).backgroundColor);
      if (c[3] > 0) return [c[0], c[1], c[2]];
      node = node.parentElement;
    }
    return [255, 255, 255];
  };

  let n = 0;
  for (const el of Array.from(document.querySelectorAll(CONTROLS)) as HTMLElement[]) {
    const cs = getComputedStyle(el);
    const w = parseFloat(cs.borderTopWidth) || 0;
    if (w <= 0 || cs.borderTopStyle === 'none' || cs.borderTopStyle === 'hidden') continue;

    // Only the boundaries the gate would report. Repainting one that already
    // clears 3:1 -- the brand-blue outline on the cookie banner's Decline, say --
    // would show the owner damage no policy actually does, and make A look
    // worse than A is. Same page-compositing walk as invariant B.
    const page = painted(el.parentElement);
    const bc = rgba(cs.borderTopColor);
    if (bc[3] <= 0) continue;
    const composited = [
      bc[0] * bc[3] + page[0] * (1 - bc[3]),
      bc[1] * bc[3] + page[1] * (1 - bc[3]),
      bc[2] * bc[3] + page[2] * (1 - bc[3]),
    ];
    if (ratio(composited, page) >= 3) continue;

    if (variant === 'B') {
      const isField = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      const iconOnly = !isField && (el.textContent || '').trim() === '';
      if (!isField && !iconOnly) continue;
    }
    el.style.setProperty('border-color', colour, 'important');
    n++;
  }
  return n;
}

interface Shot {
  key: string;
  shell: 'customer' | 'staff';
  /** Scrolled to the middle of the frame before the shutter, when given. */
  focus?: string;
  caption: string;
}

const SHOTS: Shot[] = [
  {
    key: 'home',
    shell: 'customer',
    focus: '.btn-search',
    caption: 'Customer / -- search form, .btn-search (the OBRS-746 fill), tabs, navbar buttons',
  },
  {
    key: 'my-bookings',
    shell: 'customer',
    focus: '.filter-pill',
    caption: 'Customer /my-bookings -- .filter-pill, .actions-menu-btn, .back-btn',
  },
  {
    key: 'staff-sell',
    shell: 'staff',
    focus: '.ptype-tile',
    caption: 'Staff /staff/sell -- form-control-sm, p-datepicker, .btn-outline-primary, .ptype-tile',
  },
  {
    key: 'staff-boarding',
    shell: 'staff',
    focus: '.admin-btn',
    caption: 'Staff /staff/boarding -- .admin-btn, the Text/Camera toggle (.is-active = 1.18:1, the worst measured)',
  },
];

/** One page, one theme, one variant -- returns the viewport PNG. */
async function capture(browser: import('@playwright/test').Browser, shot: Shot, dark: boolean, variant: Variant) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const sheet = await context.newPage();
  try {
    if (shot.shell === 'customer') {
      const target = CUSTOMER_PAGES.find((p) => p.key === shot.key);
      if (!target) throw new Error(`no CUSTOMER_PAGES entry "${shot.key}"`);
      await seedCustomerSession(sheet, dark);
      await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
      await sheet.waitForTimeout(2500);
      if (target.seed) {
        await seedStore(sheet, target.storeOverride?.());
        await sheet.waitForTimeout(1200);
      }
    } else {
      const target = STAFF_PAGES.find((p) => p.key === shot.key);
      if (!target) throw new Error(`no STAFF_PAGES entry "${shot.key}"`);
      await seedStaffSweepSession(sheet, dark, target.fixture ?? []);
      await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
      await sheet.waitForTimeout(2500);
      if (target.act) await target.act(sheet);
      await sheet.waitForTimeout(800);
    }

    if (shot.focus) {
      const el = sheet.locator(shot.focus).first();
      if ((await el.count()) > 0) {
        await el.scrollIntoViewIfNeeded().catch(() => undefined);
        await sheet.waitForTimeout(300);
      }
    }

    const touched = await sheet.evaluate(repaint, [variant, dark ? CANDIDATE.dark : CANDIDATE.light] as [
      Variant,
      string,
    ]);
    await sheet.waitForTimeout(200);
    console.log(`[obrs-772] ${shot.key}/${dark ? 'dark' : 'light'}/${variant}: repainted ${touched} boundaries`);

    return await sheet.screenshot();
  } finally {
    await context.close();
  }
}

test.describe('OBRS-772 boundary policy mock-up', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test('photograph current / A / B on four real screens in both themes', async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });

    for (const shot of SHOTS) {
      for (const dark of [false, true]) {
        const theme = dark ? 'dark' : 'light';
        const frames: Record<Variant, string> = { current: '', A: '', B: '' };
        for (const variant of ['current', 'A', 'B'] as Variant[]) {
          const png = await capture(browser, shot, dark, variant);
          frames[variant] = png.toString('base64');
          fs.writeFileSync(path.join(OUT, `OBRS-772-${shot.key}-${theme}-${variant}.png`), png);
        }

        // One stacked sheet per page+theme, so the three states are compared in
        // one image instead of by flicking between three files.
        const board = await browser.newPage({ viewport: { width: 1480, height: 400 } });
        const rows = (['current', 'A', 'B'] as Variant[])
          .map(
            (v) =>
              `<figure><figcaption>${
                v === 'current'
                  ? 'TODAY -- framework default borders'
                  : v === 'A'
                    ? 'OPTION A -- every control boundary repainted'
                    : 'OPTION B -- only fields + icon-only buttons repainted'
              }</figcaption><img src="data:image/png;base64,${frames[v]}"></figure>`
          )
          .join('');
        await board.setContent(
          `<style>body{margin:0;background:#111;font:13px system-ui;color:#eee}` +
            `h1{margin:14px 20px 4px;font-size:15px}` +
            `p.note{margin:0 20px 12px;color:#aaa;font-size:12px}` +
            `figure{margin:0 20px 18px}figcaption{padding:6px 0;font-weight:600}` +
            `img{display:block;width:1440px;border:1px solid #444}</style>` +
            `<h1>OBRS-772 &mdash; ${shot.caption} &mdash; ${theme} theme</h1>` +
            `<p class="note">Mock-up: the candidate boundary colour (${
              dark ? CANDIDATE.dark : CANDIDATE.light
            }) applied to the live page, not a build of the SCSS change.</p>` +
            rows
        );
        await board.waitForTimeout(400);
        await board.screenshot({
          path: path.join(OUT, `OBRS-772-COMPARE-${shot.key}-${theme}.png`),
          fullPage: true,
        });
        await board.close();
      }
    }

    console.log(`[obrs-772] wrote sheets to ${OUT}`);
  });
});
