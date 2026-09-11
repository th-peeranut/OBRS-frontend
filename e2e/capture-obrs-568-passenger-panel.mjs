/**
 * OBRS-568 BEFORE/AFTER evidence for the passenger dropdown panel.
 *
 * The BEFORE frame is RECONSTRUCTED, not re-served: the three declarations this
 * card replaced are put back into the live CSSOM, the frame is shot, and then they
 * are removed again for the AFTER frame. Same page, same run, same data -- the only
 * difference between the two images is the code under test. This is the technique
 * obrs-1782-tiles-capture.spec.ts uses, and it carries the same guard: the BEFORE
 * frame must actually REPRODUCE the defect (a row overflowing its panel) or the
 * script exits non-zero rather than producing a misleading pair.
 *
 *   node e2e/capture-obrs-568-passenger-panel.mjs http://localhost:4373 <outdir>
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4373';
const OUT = process.argv[3] ?? 'docs/manual-tests/assets/OBRS-568';
mkdirSync(OUT, { recursive: true });

const ok = (data) => ({ code: 200, message: 'OK', data });

const STOPS = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  slug: 'stop-' + (i + 1),
  status: 'active',
  stopType: 'station',
  createdBy: 'system',
  createdDate: '2024-01-01',
  lastUpdatedBy: 'system',
  lastUpdatedDate: '2024-01-01',
  display: [
    { locale: 'en', label: 'Stop ' + (i + 1) + ' Riverside Interchange Terminal' },
    { locale: 'th', label: 'Stop ' + (i + 1) },
  ],
}));

/** Exactly what the <=576px block declared before this card. */
const BEFORE_DECLS = { width: '100%', minWidth: '0px', maxWidth: '100%' };

async function shoot(viewport, tag) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });

  await page.addInitScript(() => {
    try {
      localStorage.setItem('obrs_analytics_consent', JSON.stringify({ analytics: true }));
    } catch {
      /* ignore */
    }
  });
  await page.route('**/api/stops', (r) => r.fulfill({ json: ok(STOPS) }));
  await page.route('**/api/provinces/stops', (r) =>
    r.fulfill({
      json: ok([
        {
          id: 1,
          slug: 'riverside',
          translations: { en: { label: 'Riverside', description: null } },
          stops: STOPS.map((s) => ({ id: s.id, code: s.slug })),
        },
      ]),
    })
  );
  await page.route('**/api/**', (r) => r.fulfill({ json: ok([]) }));

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('app-dropdown-obrs-passenger .dropdown-btn').first().click();
  await page.locator('app-dropdown-obrs-passenger .dropdown-menu.show').first().waitFor();

  const measure = () =>
    page.evaluate(() => {
      const panel = document.querySelector('app-dropdown-obrs-passenger .dropdown-menu.show');
      const rows = Array.from(panel.querySelectorAll('.dropdown-option'));
      return {
        panelWidth: Math.round(panel.getBoundingClientRect().width),
        maxHeight: getComputedStyle(panel).maxHeight,
        worstOverflow: rows.reduce((w, r) => Math.max(w, r.scrollWidth - r.clientWidth), 0),
      };
    });

  // ---- BEFORE: put back exactly what THIS viewport used to get -----------
  // The width triple lived in a `@media (max-width: 576px)` block, so injecting
  // it at 1280 would reconstruct a state that never existed and make the desktop
  // pair a fabrication. Above 576px only the height bound is new.
  const widthWasNarrow = viewport.width <= 576;
  await page.evaluate(
    ({ decls, narrow }) => {
      const panel = document.querySelector('app-dropdown-obrs-passenger .dropdown-menu.show');
      if (narrow) {
        panel.style.width = decls.width;
        panel.style.minWidth = decls.minWidth;
        panel.style.maxWidth = decls.maxWidth;
      }
      panel.style.maxHeight = 'none';
      panel.style.overflowY = 'visible';
    },
    { decls: BEFORE_DECLS, narrow: widthWasNarrow }
  );
  const before = await measure();
  await page.screenshot({ path: OUT + '/OBRS-568-BEFORE-' + tag + '.png' });

  // ---- AFTER: back to what this branch actually ships --------------------
  await page.evaluate(() => {
    const panel = document.querySelector('app-dropdown-obrs-passenger .dropdown-menu.show');
    panel.style.width = '';
    panel.style.minWidth = '';
    panel.style.maxWidth = '';
    panel.style.maxHeight = '';
    panel.style.overflowY = '';
  });
  const after = await measure();
  await page.screenshot({ path: OUT + '/OBRS-568-AFTER-' + tag + '.png' });

  await browser.close();
  return { tag, viewport, before, after };
}

const results = [];
results.push(await shoot({ width: 390, height: 844 }, 'passenger-panel-390x844'));
results.push(await shoot({ width: 1280, height: 720 }, 'passenger-panel-1280x720'));

console.log(JSON.stringify(results, null, 2));

// The phone frame is the one that must have reproduced the defect. A BEFORE that
// shows nothing wrong is not evidence, it is a nicer-looking lie.
const phone = results[0];
if (phone.before.worstOverflow <= 0) {
  console.error('BEFORE frame did NOT reproduce the overflow -- refusing to call this evidence');
  process.exit(1);
}
if (phone.after.worstOverflow > 0) {
  console.error('AFTER frame still overflows by ' + phone.after.worstOverflow + 'px');
  process.exit(1);
}
