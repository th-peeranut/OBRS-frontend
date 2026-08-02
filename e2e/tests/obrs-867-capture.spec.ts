import { expect, test, Page } from '@playwright/test';

/**
 * OBRS-867 AFTER evidence — the consent bar as a customer meets it.
 *
 * Runs in the same lane as the AC-1 gate (playwright.obrs867.config.ts), so the
 * screenshots are taken from the very build whose network behaviour that suite
 * just asserted, rather than from a differently-configured one.
 *
 * It also MEASURES the contrast pair rather than trusting the palette comment
 * in the component's SCSS: a themed foreground is only correct over the themed
 * background that actually painted, and reading a hex out of variables.scss
 * proves neither (OBRS-740/746/767).
 */
const ASSETS = 'e2e-evidence/OBRS-867';

/** sRGB relative luminance, per WCAG 2.x. */
function luminance([r, g, b]: number[]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: number[], bg: number[]): number {
  const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function parseRgb(value: string): number[] {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) {
    throw new Error(`not a colour: ${value}`);
  }
  return match[1]
    .split(',')
    .slice(0, 3)
    .map((part) => Number(part.trim()));
}

/** Computed colour/background-color of one element, walking up for a real background. */
async function colourPair(page: Page, selector: string): Promise<{ fg: number[]; bg: number[] }> {
  const raw = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) {
      throw new Error(`missing: ${sel}`);
    }
    const fg = getComputedStyle(el).color;

    // The element's own background may be transparent; the pixel a human sees
    // comes from the nearest ancestor that actually paints one.
    let node: Element | null = el;
    let bg = 'rgba(0, 0, 0, 0)';
    while (node) {
      const candidate = getComputedStyle(node).backgroundColor;
      if (candidate && !candidate.startsWith('rgba(0, 0, 0, 0)') && candidate !== 'transparent') {
        bg = candidate;
        break;
      }
      node = node.parentElement;
    }
    return { fg, bg };
  }, selector);

  return { fg: parseRgb(raw.fg), bg: parseRgb(raw.bg) };
}

/**
 * Saves one shot — but refuses to if the frame is contaminated.
 *
 * The first run of this spec produced a visibly GREY banner in the English shot
 * while the Thai one was white, and every assertion still passed: the app's
 * global HTTP-error interceptor had thrown a SweetAlert whose backdrop
 * (`rgba(0,0,0,.4)`) sits over the whole page, so the element screenshot
 * captured the banner through a dimming layer. Reading `getComputedStyle` can
 * never see that — the computed background is `#ffffff` either way — so the
 * check has to be "is there an overlay", not "is the colour right".
 *
 * A capture script cannot inspect its own output, so the guard belongs here,
 * before the file exists (OBRS-622/702 both cost an upload to this exact
 * class of bug).
 */
async function capture(page: Page, file: string): Promise<void> {
  const banner = page.locator('.consent-banner');
  await expect(banner).toBeVisible();

  await expect(
    page.locator('.swal2-container, .swal2-popup'),
    'a SweetAlert backdrop is dimming the frame — fix the page state, do not save'
  ).toHaveCount(0);
  await expect(
    page.locator('.route-error'),
    'an error toast is on screen — the shot would read as a broken feature'
  ).toHaveCount(0);

  await banner.screenshot({ path: `${ASSETS}/${file}` });
}

test.describe('OBRS-867 consent bar — AFTER evidence', () => {
  test('light theme, Thai', async ({ page }) => {
    await page.goto('/');
    await capture(page, 'consent-banner-light-th.png');
  });

  test('dark theme, Thai', async ({ page, context }) => {
    await context.addInitScript(() =>
      window.localStorage.setItem('app_admin_theme', 'dark')
    );
    await page.goto('/');
    await expect(page.locator('body.is-dark')).toHaveCount(1);
    await capture(page, 'consent-banner-dark-th.png');
  });

  test('English', async ({ page, context }) => {
    await context.addInitScript(() => window.localStorage.setItem('app_language', 'en'));
    await page.goto('/');
    await capture(page, 'consent-banner-light-en.png');
  });

  test('both buttons clear WCAG AA in light mode, measured not assumed', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.consent-banner')).toBeVisible();

    const accept = await colourPair(page, '.consent-banner__btn--accept');
    const decline = await colourPair(
      page,
      '.consent-banner__btn:not(.consent-banner__btn--accept)'
    );
    const body = await colourPair(page, '.consent-banner__body');

    expect(contrast(accept.fg, accept.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(decline.fg, decline.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(body.fg, body.bg)).toBeGreaterThanOrEqual(4.5);
  });

  test('and in dark mode', async ({ page, context }) => {
    await context.addInitScript(() =>
      window.localStorage.setItem('app_admin_theme', 'dark')
    );
    await page.goto('/');
    await expect(page.locator('.consent-banner')).toBeVisible();

    const accept = await colourPair(page, '.consent-banner__btn--accept');
    const decline = await colourPair(
      page,
      '.consent-banner__btn:not(.consent-banner__btn--accept)'
    );
    const body = await colourPair(page, '.consent-banner__body');

    expect(contrast(accept.fg, accept.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(decline.fg, decline.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(body.fg, body.bg)).toBeGreaterThanOrEqual(4.5);
  });

  test('the two buttons are the same size — the ask is symmetric', async ({ page }) => {
    await page.goto('/');
    const boxes = await page.locator('.consent-banner__btn').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      })
    );

    expect(boxes.length).toBe(2);
    expect(boxes[0]).toEqual(boxes[1]);
  });
});
