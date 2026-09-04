import { expect, test, type Browser, type Page } from '@playwright/test';
import { ADMIN_SWEEP, newSweepPage, seedStaffSession, visit, type SweepPage } from '../support/host-boxes';

/**
 * OBRS-913. The sidebar collapse/expand toggle (`.admin-sidebar-pin`).
 *
 * WHY THIS IS A BROWSER SPEC AND NOT A UNIT TEST OR A PARSER
 * The defect is a rendered-vs-declared gap: the button DECLARES `height: 28px`
 * in `admin-theme.scss` and RENDERS at 20px, because it is a `flex-shrink: 1`
 * item of `.admin-sidebar-panel` (a `flex-direction: column` box) and that
 * column overflows on any laptop-height viewport with a normal-length menu.
 * A stylesheet parser reads 28 and reports a pass; karma's 800px window never
 * reaches the `min-width: 1101px` block the rule lives in. Only the cascade in
 * a real browser at a real viewport knows the used value.
 *
 * THE OVERFLOW IS THE PRECONDITION, SO IT IS ASSERTED, NOT ASSUMED
 * The button is only squeezed while the panel overflows. A future viewport or a
 * shorter menu would make this spec green without it ever having measured the
 * defect it exists to catch, so every case asserts `scrollHeight > clientHeight`
 * first and fails loudly when the precondition is gone.
 */

/** WCAG 2.2 SC 2.5.8 Target Size (Minimum). */
const MIN_TARGET_PX = 24;

/** The viewport the card measured on: a normal laptop, where the panel overflows. */
const VIEWPORT = { width: 1536, height: 900 };

/**
 * AC-2: the toggle moves onto the logo row, so the vertical band between the
 * brand and the menu search must shrink by at least this much. Baseline
 * measured on origin/dev@5950c448 before the change: `brand.bottom` 68 →
 * `search.top` 128 = 60px.
 */
const MIN_BAND_SAVING_PX = 32;
const BAND_BEFORE_PX = 60;

const SIDEBAR_KEY = 'obrs-sidebar-collapsed';

interface Geometry {
  panelScrollHeight: number;
  panelClientHeight: number;
  pin: { width: number; height: number; top: number; bottom: number };
  brand: { top: number; bottom: number };
  search: { top: number } | null;
  ariaExpanded: string | null;
  title: string | null;
  ariaLabel: string | null;
}

async function measure(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return { width: r.width, height: r.height, top: r.top, bottom: r.bottom };
    };
    const panel = document.querySelector('.admin-sidebar-panel') as HTMLElement;
    const pin = document.querySelector('.admin-sidebar-pin') as HTMLElement;
    const brand = document.querySelector('.admin-brand') as HTMLElement;
    const search = document.querySelector('.admin-nav-search');
    return {
      panelScrollHeight: panel.scrollHeight,
      panelClientHeight: panel.clientHeight,
      pin: box(pin),
      brand: box(brand),
      search: search ? { top: (search as HTMLElement).getBoundingClientRect().top } : null,
      ariaExpanded: pin.getAttribute('aria-expanded'),
      title: pin.getAttribute('title'),
      ariaLabel: pin.getAttribute('aria-label'),
    };
  });
}

function sweepPage(key: string): SweepPage {
  const p = ADMIN_SWEEP.find((x) => x.key === key);
  if (!p) throw new Error(`OBRS-913: ADMIN_SWEEP has no entry '${key}' — the list moved under this spec.`);
  return p;
}

/**
 * A page in the state the card describes: seeded session, chosen collapse state,
 * pinned viewport.
 *
 * The session is seeded BEFORE the first navigation, exactly as `host-box-sweep`
 * does it. `seedStaffSession` works through `addInitScript`, which only applies to
 * navigations that come after it — passing it to `visit()` as its `seedFn` runs it
 * after `page.goto`, so AuthGuard bounces every page to `/login` and the spec
 * measures the login screen's geometry under this card's name.
 */
async function openSidebar(browser: Browser, key: string, collapsed: boolean): Promise<Page> {
  const page = await newSweepPage(browser, VIEWPORT.width, VIEWPORT.height);
  await seedStaffSession(page);
  await page.addInitScript(
    ([storageKey, value]) => localStorage.setItem(storageKey as string, value as string),
    [SIDEBAR_KEY, collapsed ? '1' : '0'] as const
  );
  await visit(page, sweepPage(key));
  return page;
}

const CASES: { key: string; label: string; collapsed: boolean }[] = [
  { key: 'admin-users', label: 'AdminLayout expanded', collapsed: false },
  { key: 'admin-users', label: 'AdminLayout collapsed', collapsed: true },
  // AC-4: StaffLayout must inherit the fix through SidebarLayoutBaseComponent and
  // the shared `.admin-sidebar-pin` class. The card requires this MEASURED, not
  // argued from "they share code".
  { key: 'staff-driver', label: 'StaffLayout expanded', collapsed: false },
  { key: 'staff-driver', label: 'StaffLayout collapsed', collapsed: true },
];

for (const c of CASES) {
  test(`OBRS-913 · ${c.label} · toggle is at least ${MIN_TARGET_PX}x${MIN_TARGET_PX} CSS px`, async ({ browser }) => {
    const page = await openSidebar(browser, c.key, c.collapsed);
    const g = await measure(page);

    // eslint-disable-next-line no-console
    console.log(`[OBRS-913] ${c.label} @${VIEWPORT.width}x${VIEWPORT.height} ` + JSON.stringify(g));

    expect(g.ariaExpanded, `${c.label}: aria-expanded reflects the collapse state`).toBe(String(!c.collapsed));

    // Precondition. Only the AdminLayout menu is long enough to overflow at this
    // viewport; the staff menu is shorter, so its cases prove the shared class
    // renders correctly rather than proving the squeeze.
    if (c.key === 'admin-users') {
      expect(
        g.panelScrollHeight,
        `${c.label}: the panel must OVERFLOW for this measurement to mean anything ` +
          `(scrollHeight ${g.panelScrollHeight} vs clientHeight ${g.panelClientHeight})`
      ).toBeGreaterThan(g.panelClientHeight);
    }

    // Card evidence. Off by default so the gate lane stays a gate; set the env
    // var to re-capture the before/after pair with the same framing the card carries:
    //   OBRS913_SHOT_DIR=<dir> npx playwright test --config=playwright.gate.config.ts \
    //     e2e/tests/obrs-913-sidebar-toggle-target-size.spec.ts
    const shotDir = process.env['OBRS913_SHOT_DIR'];
    if (shotDir) {
      await page.screenshot({ path: `${shotDir}/${c.label.replace(/\s+/g, '-')}.png` });
    }

    expect(g.pin.height, `${c.label}: used height`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(g.pin.width, `${c.label}: used width`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  });
}

test('OBRS-913 · expanded AdminLayout puts the toggle on the logo row', async ({ browser }) => {
  const page = await openSidebar(browser, 'admin-users', false);
  const g = await measure(page);

  expect(g.search, 'the menu search must be present to measure the band').not.toBeNull();
  const band = g.search!.top - g.brand.bottom;

  // eslint-disable-next-line no-console
  console.log(`[OBRS-913] band brand.bottom=${g.brand.bottom} search.top=${g.search!.top} band=${band}`);

  // On the logo row: the button's vertical extent lies inside the brand row.
  expect(g.pin.top, 'toggle top is inside the brand row').toBeGreaterThanOrEqual(g.brand.top - 1);
  expect(g.pin.bottom, 'toggle bottom is inside the brand row').toBeLessThanOrEqual(g.brand.bottom + 1);

  expect(
    band,
    `band between brand and menu search must shrink by >= ${MIN_BAND_SAVING_PX}px from the ${BAND_BEFORE_PX}px baseline`
  ).toBeLessThanOrEqual(BAND_BEFORE_PX - MIN_BAND_SAVING_PX);
});

test('OBRS-913 · Ctrl+B toggles the sidebar, but not while typing in the menu search', async ({ browser }) => {
  const page = await openSidebar(browser, 'admin-users', false);

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+b');
  await expect(page.locator('.admin-sidebar-pin')).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('Control+b');
  await expect(page.locator('.admin-sidebar-pin')).toHaveAttribute('aria-expanded', 'true');

  // AC-3: must not fire from inside a text field — the menu search of OBRS-900
  // is one Ctrl+B away from collapsing the menu it is filtering.
  const search = page.locator('.admin-nav-search-input');
  await search.click();
  await page.keyboard.press('Control+b');
  await expect(page.locator('.admin-sidebar-pin')).toHaveAttribute('aria-expanded', 'true');

  // AC-3: the shortcut is discoverable from the control itself.
  await expect(page.locator('.admin-sidebar-pin')).toHaveAttribute('title', /Ctrl\+B/i);
});
