/**
 * OBRS-568 probe -- why the passenger panel's rows overflow their own box at 390px,
 * and whether THIS card's two added declarations caused it.
 *
 * The control arm reverts `max-height` / `overflow-y` in the live CSSOM and
 * re-measures, the same technique obrs-1782-tiles-capture.spec.ts uses to
 * reconstruct a BEFORE: if the overflow is identical with the declarations
 * reverted, the card did not cause it.
 *
 * Run against a server already serving this worktree:
 *   node e2e/probe-obrs-568-passenger-row.mjs http://localhost:4373
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:4373';

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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

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

const report = await page.evaluate(() => {
  const panel = document.querySelector('app-dropdown-obrs-passenger .dropdown-menu.show');
  const dropdown = panel.closest('.dropdown');

  const readRows = () =>
    Array.from(panel.querySelectorAll('.dropdown-option')).map((row) => ({
      text: (row.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48),
      scrollWidth: row.scrollWidth,
      clientWidth: row.clientWidth,
      overflow: row.scrollWidth - row.clientWidth,
      whiteSpace: getComputedStyle(row).whiteSpace,
    }));

  const snapshot = (label) => {
    const ps = getComputedStyle(panel);
    const pr = panel.getBoundingClientRect();
    return {
      label,
      panelWidth: Math.round(pr.width),
      panelRight: Math.round(pr.right),
      viewportWidth: window.innerWidth,
      declaredWidth: ps.width,
      minWidth: ps.minWidth,
      maxWidth: ps.maxWidth,
      maxHeight: ps.maxHeight,
      overflowX: ps.overflowX,
      overflowY: ps.overflowY,
      rows: readRows(),
    };
  };

  const asShipped = snapshot('as-shipped (this branch)');

  // CONTROL: revert exactly the two declarations OBRS-568 added, in the live CSSOM.
  panel.style.maxHeight = 'none';
  panel.style.overflowY = 'visible';
  void panel.offsetHeight;
  const control = snapshot('control (OBRS-568 declarations reverted)');

  panel.style.maxHeight = '';
  panel.style.overflowY = '';

  return {
    dropdownWidth: Math.round(dropdown.getBoundingClientRect().width),
    dropdownDisplay: getComputedStyle(dropdown.parentElement).display,
    asShipped,
    control,
  };
});

console.log(JSON.stringify(report, null, 2));
await browser.close();
