/**
 * OBRS-1224 visual evidence -- where the box you type a station into actually is.
 *
 * Run TWICE with nothing changed but `--label` and `OBRS_BASE_URL`: once against
 * live prod (BEFORE -- the unfixed code) and once against a dev server serving
 * this branch with `--configuration sit` (AFTER). Prod and SIT carry
 * byte-identical route data (measured for OBRS-1213 on 2026-08-10), so the pair
 * is a controlled comparison rather than two unrelated screenshots.
 *
 *   OBRS_BASE_URL=https://nj-phuyaipu.com node e2e/capture-obrs-1224-origin-combobox.mjs --label before
 *   OBRS_BASE_URL=http://localhost:4231   node e2e/capture-obrs-1224-origin-combobox.mjs --label after
 *
 * It PRINTS the geometry it measured -- the px distance from the typing box to
 * the field, the panel's Popper placement, the panel height -- next to every
 * screenshot it writes. A PNG on its own asks a reviewer to trust my eyes; the
 * card's whole claim is a number, so the number is in the output.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4231';
const OUT = process.env.OBRS_OUT_DIR ?? path.resolve('e2e/out/obrs-1224');
const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error('--label <BEFORE|AFTER> is required -- an unlabelled pair proves nothing');
  }
  return process.argv[i + 1];
})();

/** A Thai substring that matches several real stops on both prod and SIT, so the
 *  filtered list in the "typing" shot is a list and not a single row. */
const QUERY = 'บ้านบึง';

const VIEWPORTS = [
  { slug: 'desktop-1440x900', width: 1440, height: 900 },
  { slug: 'desktop-1907x1000', width: 1907, height: 1000 },
  { slug: 'mobile-390x844', width: 390, height: 844 },
];

/**
 * The measurement, taken in the page so it reads the same boxes the customer
 * sees. Deliberately finds the typing box by asking which element ACCEPTS TEXT
 * rather than by class name -- the class changed with the fix, and a measurement
 * that only runs on one of the two builds cannot compare them.
 */
const MEASURE = () => {
  const group = document.querySelector('.station-group app-dropdown-group-obrs');
  if (!group) return { error: 'no station group' };
  const field = group.querySelector('.dropdown-btn');
  const menu = group.querySelector('.dropdown-menu.show');
  if (!field || !menu) return { error: 'field or open panel missing' };

  const boxes = Array.from(group.querySelectorAll('input:not([type="hidden"]), textarea'));
  const box = boxes[0];
  const fieldRect = field.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  if (!box) {
    return {
      error: 'no typeable box in the station group',
      placement: menu.getAttribute('data-popper-placement') ?? '',
      panelHeight: Math.round(menuRect.height),
    };
  }
  const boxRect = box.getBoundingClientRect();

  return {
    typingBox: box.tagName.toLowerCase() + '.' + (box.getAttribute('class') || '').split(/\s+/)[0],
    isTheFieldItself: box === field,
    typeableBoxes: boxes.length,
    // Signed: negative means the box sits BELOW the field (mobile), positive
    // means above it -- the direction the card's prod numbers were quoted in.
    boxAboveFieldPx: Math.round(fieldRect.top - boxRect.bottom),
    gapPx: Math.round(Math.max(0, fieldRect.top - boxRect.bottom, boxRect.top - fieldRect.bottom)),
    fieldHeightPx: Math.round(fieldRect.height),
    placement: menu.getAttribute('data-popper-placement') ?? '',
    panelHeightPx: Math.round(menuRect.height),
  };
};

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = [];

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    // Settle the PDPA banner before it can sit over the booking card.
    await page.addInitScript(() => {
      localStorage.setItem('obrs_analytics_consent_v1', 'denied');
      localStorage.setItem('app_language', 'th');
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    const field = page.locator('.station-group app-dropdown-group-obrs .dropdown-btn').first();
    await field.waitFor({ state: 'visible', timeout: 30_000 });
    await field.scrollIntoViewIfNeeded();
    await field.click();
    await page.waitForSelector('.station-group app-dropdown-group-obrs .dropdown-menu.show', {
      timeout: 10_000,
    });
    await page.waitForTimeout(400);

    const geometry = await page.evaluate(MEASURE);
    await page.screenshot({ path: path.join(OUT, `OBRS-1224-${LABEL}-${viewport.slug}.png`) });

    // The second shot is the card's actual subject: WHERE THE CUSTOMER IS
    // LOOKING while they filter. It types into whichever box this build offers
    // -- the panel row before the fix, the field after it -- so the pair shows
    // the same task done twice rather than two different pages.
    const typedInto = page.locator('.station-group app-dropdown-group-obrs input').first();
    await typedInto.fill(QUERY);
    await page.waitForTimeout(400);
    const filtered = await page
      .locator('.station-group app-dropdown-group-obrs .dropdown-menu.show .dropdown-option')
      .allInnerTexts();
    await page.screenshot({
      path: path.join(OUT, `OBRS-1224-${LABEL}-${viewport.slug}-typing.png`),
    });

    report.push({
      viewport: viewport.slug,
      ...geometry,
      query: QUERY,
      matches: filtered.map((t) => t.trim()).filter(Boolean),
    });
    console.log(
      `${LABEL} ${viewport.slug}`,
      JSON.stringify(geometry),
      `query "${QUERY}" -> ${filtered.length} option(s)`
    );

    await context.close();
  }

  await browser.close();
  await writeFile(
    path.join(OUT, `OBRS-1224-${LABEL}-geometry.json`),
    JSON.stringify({ label: LABEL, base: BASE, report }, null, 2)
  );
  console.log(`\nwrote ${report.length} screenshots + geometry.json to ${OUT}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
