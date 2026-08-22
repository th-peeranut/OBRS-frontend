/**
 * OBRS-1521 -- what `.p-disabled` actually paints in LIGHT mode.
 *
 * The customer contrast gate (OBRS-584) COUNTS this population and refuses to
 * score it: `MEASURE` skips any element under `[disabled]/[aria-disabled]` and
 * any element under `opacity < 1`, and prints both as skip totals. That is a
 * defensible reading of WCAG 1.4.3 (disabled controls are exempt) -- but the
 * rows in the `...` menu on /my-bookings are not controls the user tabs past:
 * they are the only text saying WHY an action is unavailable, and PrimeNG's
 * global `@layer primeng { .p-disabled { opacity: .6 } }` composites them to
 * grey on a white panel. Nothing in this repo has ever measured that number,
 * on any page (OBRS-1521 AC-2).
 *
 * So this file measures exactly the population the gate skips, and only that.
 * It is a CAPTURE-lane probe, not a gate: it reports, it does not enforce. The
 * arithmetic mirrors `customer-contrast.ts` deliberately -- same luminance
 * formula, same painted-background walk, same large-text floor -- with one
 * addition the gate has no use for: the opacity chain is COMPOSITED rather
 * than used as a reason to skip.
 *
 *   npx playwright test --config=playwright.obrs1521.config.ts
 *
 * ASCII-only source.
 */

import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CUSTOMER_PAGES, customerSweepBudgetMs, seedCustomerSession, seedStore } from '../support/customer-pages';

// Literal, not a `${OUT_DIR}` template: check-e2e-lanes.mjs matches the written
// path against /^e2e-evidence\//, and a variable it cannot resolve reads as an escape.
const OUT_DIR = 'e2e-evidence/obrs-1521';

interface Row {
  page: string;
  /** Did PrimeNG's global `.p-disabled` produce this row, or a bare attribute? */
  pDisabled: boolean;
  path: string;
  text: string;
  opacity: number;
  declaredFg: string;
  paintedBg: string;
  effectiveFg: string;
  effectiveBg: string;
  ratio: number;
  floor: number;
}

/**
 * Runs in the page. Every text-owning element inside a `.p-disabled` subtree,
 * composited the way the compositor does it: the opacity group is flattened
 * onto whatever paints BEHIND the group, then foreground and background are
 * compared inside that flattened result.
 */
const CENSUS = (): Omit<Row, 'page'>[] => {
  const rgba = (c: string): number[] => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return [0, 0, 0, 0];
    const p = m[1].split(',').map((v) => parseFloat(v.trim()));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const lum = (c: number[]): number => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a: number[], b: number[]): number => {
    const x = lum(a);
    const y = lum(b);
    return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
  };
  const hex = (c: number[]): string =>
    '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const mix = (top: number[], under: number[], a: number): number[] => [
    top[0] * a + under[0] * (1 - a),
    top[1] * a + under[1] * (1 - a),
    top[2] * a + under[2] * (1 - a),
  ];

  /** The colour painted behind `el`, ignoring opacity (same walk as the gate). */
  const paintedBg = (el: Element | null): number[] => {
    const layers: number[][] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    if (!layers.length) return [255, 255, 255];
    let bg = layers[layers.length - 1].slice(0, 3);
    for (let i = layers.length - 2; i >= 0; i--) {
      bg = mix(layers[i], bg, layers[i][3]);
    }
    return bg;
  };

  /** Product of every opacity in the chain, and the first element ABOVE it. */
  const opacityGroup = (el: Element): { alpha: number; outside: Element | null } => {
    let alpha = 1;
    let outside: Element | null = el.parentElement;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const o = Number(getComputedStyle(n).opacity);
      if (Number.isFinite(o) && o < 1) {
        alpha *= o;
        outside = n.parentElement;
      }
    }
    return { alpha, outside };
  };

  const visible = (el: Element): boolean => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse' || cs.display === 'none') return false;
    const box = el.getBoundingClientRect();
    return box.width >= 2 && box.height >= 2;
  };

  const ownsText = (el: Element): boolean =>
    Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0);

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

  const rows: Omit<Row, 'page'>[] = [];
  // Wider than `.p-disabled` on purpose. AC-2 asks about PrimeNG's global rule,
  // but a control that is disabled WITHOUT that class is the same defect to the
  // eye and would leave the census reporting a clean page it never looked at.
  // `pDisabled` on each row says which mechanism produced it.
  const scope =
    '.p-disabled, .p-disabled *, [disabled], [disabled] *, [aria-disabled="true"], [aria-disabled="true"] *';
  for (const el of Array.from(document.body.querySelectorAll(scope))) {
    if (!ownsText(el) || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const fg = rgba(cs.color);
    if (fg[3] < 1) continue;

    const { alpha, outside } = opacityGroup(el);
    const behind = alpha < 1 ? paintedBg(outside) : paintedBg(el);
    const own = paintedBg(el);
    const effFg = alpha < 1 ? mix(fg.slice(0, 3), behind, alpha) : fg.slice(0, 3);
    const effBg = alpha < 1 ? mix(own, behind, alpha) : own;

    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    rows.push({
      pDisabled: !!el.closest('.p-disabled'),
      path: pathOf(el),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      opacity: Math.round(alpha * 1000) / 1000,
      declaredFg: hex(fg),
      paintedBg: hex(own),
      effectiveFg: hex(effFg),
      effectiveBg: hex(effBg),
      ratio: ratio(effFg, effBg),
      floor: size >= 24 || (size >= 18.66 && weight >= 700) ? 3.0 : 4.5,
    });
  }
  return rows;
};

test('census: every disabled text run in light mode (plus one dark control pass), composited', async ({ browser }, testInfo) => {
  test.setTimeout(customerSweepBudgetMs(1));
  mkdirSync(OUT_DIR, { recursive: true });

  const rows: Row[] = [];
  const visited: { page: string; rows: number; note?: string }[] = [];
  let menuRowsSeen = 0;

  // CUSTOMER_PAGES is the contrast gate's population, and /account sits in its
  // EXCLUDED list -- so the two `p-button [disabled]` sites and the two
  // `p-toggleSwitch [disabled]` sites under /account have never been swept by
  // anything. The Save button is disabled AT REST (`!isDirty`), so that state
  // needs no interaction: loading the page is the whole fixture.
  const swept: {
    key: string;
    url: string;
    seed?: boolean;
    dark?: boolean;
    storeOverride?: () => Record<string, unknown>;
  }[] = [
    ...CUSTOMER_PAGES.map((entry) => ({
      key: entry.key,
      url: entry.url,
      seed: entry.seed,
      storeOverride: entry.storeOverride,
    })),
    { key: 'account-notification-preferences', url: '/account/notification-preferences' },
    // The one dark entry. AC-3 forbids the fix regressing the dark row that
    // OBRS-959 measured at 5.83:1, and the fix removes the opacity in BOTH
    // themes -- so dark has to be measured here, not argued about.
    { key: 'my-bookings-dark', url: '/my-bookings', dark: true },
  ];

  // OBRS1521_SHOTS_ONLY=1 keeps only the two menu passes. The card's before/after
  // pair has to be shot twice (once with the fix reverted), and re-sweeping 20
  // pages for a screenshot costs ~3 minutes of the fixture set the census already
  // measured. The census itself always runs the full population.
  const targets = process.env['OBRS1521_SHOTS_ONLY'] ? swept.filter((t) => t.url === '/my-bookings') : swept;

  for (const target of targets) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1400 },
      // The popup is ~130x60 CSS px; at scale 1 the cropped evidence is too small
      // to compare one grey against another by eye.
      deviceScaleFactor: target.url === '/my-bookings' ? 3 : 1,
    });
    const sheet = await context.newPage();
    try {
      await seedCustomerSession(sheet, !!target.dark);
      await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
      await sheet.waitForTimeout(2500);
      if (target.seed) {
        await seedStore(sheet, target.storeOverride?.());
        await sheet.waitForTimeout(1200);
      }

      let note: string | undefined;
      // AC-1. The row this card was filed on only exists while the popup is open,
      // and the popup is `appendTo="body"`, so nothing on the page carries it.
      if (target.url === '/my-bookings') {
        const errors: string[] = [];
        sheet.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        sheet.on('console', (m) => {
          if (m.type() === 'error') errors.push(`console: ${m.text()}`);
        });
        const buttons = sheet.locator('button.actions-menu-btn');
        const total = await buttons.count();
        for (let i = 0; i < total; i++) {
          await buttons.nth(i).click();
          try {
            await sheet.locator('.my-bookings-action-menu').first().waitFor({ timeout: 8000 });
          } catch {
            const dom = await sheet.evaluate(() => ({
              pMenus: document.querySelectorAll('.p-menu').length,
              overlays: document.querySelectorAll('body > .p-menu, body > div[class*="p-"]').length,
              bodyTail: Array.from(document.body.children)
                .slice(-4)
                .map((n) => n.tagName.toLowerCase() + '.' + (n.getAttribute('class') || '')),
            }));
            throw new Error(
              `card ${i}: the popup never became visible. DOM: ${JSON.stringify(dom)}. page errors: ${JSON.stringify(errors)}`
            );
          }
          await sheet.waitForTimeout(400);
          const disabled = await sheet.locator('.my-bookings-action-menu .p-menu-item.p-disabled').count();
          menuRowsSeen += disabled;
          if (disabled > 0) {
            await sheet.screenshot({ path: `e2e-evidence/obrs-1521/${target.key}-menu-open-card-${i}.png` });
            // The full page puts the popup at ~130x60 of a 1440x1400 shot, which
            // is too small to compare a grey against a grey. Crop to the panel.
            const box = await sheet.locator('.my-bookings-action-menu').first().boundingBox();
            if (box) {
              await sheet.screenshot({
                path: `e2e-evidence/obrs-1521/${target.key}-menu-closeup.png`,
                clip: {
                  x: Math.max(0, box.x - 24),
                  y: Math.max(0, box.y - 24),
                  width: box.width + 48,
                  height: box.height + 48,
                },
              });
            }
            break;
          }
          // Wait for the overlay to actually LEAVE. `p-menu` is a single shared
          // popup toggled per trigger: clicking the next card's button while
          // PrimeNG still holds the previous overlay makes `toggle()` hide it
          // again, so the next card looks like a button that opens nothing.
          // Escape does NOT close this popup (measured: the overlay was still
          // attached 8s later) -- `p-menu` closes on an outside CLICK. Click the
          // top-left of the page, well clear of every card.
          await sheet.mouse.click(5, 5);
          await sheet.locator('.my-bookings-action-menu').waitFor({ state: 'hidden', timeout: 8000 });
        }
        note = `${total} booking card(s), ${menuRowsSeen} disabled menu row(s)`;
      }

      const found = (await sheet.evaluate(CENSUS)).map((r) => ({ page: target.key, ...r }));
      rows.push(...found);
      visited.push({ page: target.key, rows: found.length, note });
    } finally {
      await context.close();
    }
  }

  const below = rows.filter((r) => r.ratio < r.floor);
  const report = {
    at: new Date().toISOString(),
    theme: 'light, plus a dark my-bookings pass',
    pagesSwept: visited.length,
    visited,
    totalDisabledTextRuns: rows.length,
    belowAA: below.length,
    rows,
  };
  writeFileSync(`e2e-evidence/obrs-1521/census-light.json`, JSON.stringify(report, null, 2));
  await testInfo.attach('census-light', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });

  console.log(
    `swept ${visited.length} pages: ${rows.length} disabled text runs, ${below.length} below AA\n` +
      below
        .map(
          (r) =>
            `  ${r.ratio.toFixed(2)}:1 (needs ${r.floor}) ${r.effectiveFg} on ${r.effectiveBg} -- "${r.text}" [${r.page}] ${r.path}`
        )
        .join('\n')
  );

  // A census that measured nothing is not a clean result. The card exists
  // because a disabled row is reachable in this exact fixture set.
  expect(
    menuRowsSeen,
    'no disabled row in the /my-bookings action menu -- the fixture no longer produces the state this card is about'
  ).toBeGreaterThan(0);
  expect(rows.length, 'zero .p-disabled text runs across the whole sweep').toBeGreaterThan(0);
});
