/**
 * OBRS-641 -- what keyboard the customer-side text inputs actually ask for.
 *
 * The bug: fields that take a phone number were plain `type="text"` with no
 * `inputmode` and no `autocomplete`, so a phone opened the full QWERTY keyboard
 * for a 10-digit number and the browser had no token to offer the customer's own
 * details against. The two most-mistyped fields in the funnel are the phone and
 * the name, and they are the two that make a customer give up mid-booking.
 *
 * A screenshot cannot show a mobile OS keyboard, so this probe does not pretend
 * to: it reads `inputmode`/`autocomplete` off the LIVE DOM at a phone viewport,
 * paints what it read onto the page as an overlay, and shoots that. The PNG and
 * the JSON therefore say the same measured thing, and the PNG is checkable
 * without re-running anything.
 *
 * CAPTURE lane: it reports, it does not gate. The gate for these attributes is
 * the unit spec in booker-info-form / passenger-info-form.
 *
 *   npx playwright test --config=playwright.obrs641.config.ts
 *
 * ASCII-only source.
 */

import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';

// Literal, not a `${OUT_DIR}` template: check-e2e-lanes.mjs matches the written
// path against /^e2e-evidence\//, and a variable it cannot resolve reads as an escape.
const OUT_DIR = 'e2e-evidence/obrs-641';

/** The customer pages that own a field this card touched. */
const PAGES = ['passenger-info', 'register', 'login-mobile', 'find-booking', 'track-parcel'];

// BEFORE is produced by checking the seven templates back out from origin/dev and
// re-running; an unlabelled pair proves nothing, so the label is stamped into both
// the filename and the overlay.
const LABEL = (process.env['OBRS641_LABEL'] ?? 'AFTER').toUpperCase();

interface Row {
  page: string;
  id: string;
  type: string;
  inputmode: string;
  autocomplete: string;
}

const CENSUS = (): Omit<Row, 'page'>[] =>
  Array.from(document.querySelectorAll('input'))
    .filter((el) => !['radio', 'checkbox', 'hidden', 'file'].includes(el.getAttribute('type') ?? ''))
    .map((el) => ({
      id: el.id || el.getAttribute('name') || el.getAttribute('formControlName') || '(unnamed)',
      type: el.getAttribute('type') ?? '(none)',
      inputmode: el.getAttribute('inputmode') ?? '-',
      autocomplete: el.getAttribute('autocomplete') ?? '-',
    }));

/**
 * Paint the measured values onto the page so the PNG carries its own proof.
 * Prepended to <body> rather than fixed-positioned: at 390px a fixed panel sits
 * on top of the very fields it is describing, and a full-page shot renders it
 * wherever the viewport happened to be.
 */
const OVERLAY = ([rows, title, label]: [Omit<Row, 'page'>[], string, string]): void => {
  const box = document.createElement('div');
  box.setAttribute('style', [
    'position:relative', 'z-index:2147483647',
    'background:#101418', 'color:#e8eef5', 'font:9px/1.5 monospace',
    'padding:8px 10px', 'border-bottom:2px solid #4da3ff', 'white-space:pre-wrap',
  ].join(';'));
  const lines = rows.map((r) => `${r.id}\n    inputmode=${r.inputmode}  autocomplete=${r.autocomplete}`);
  box.textContent = `OBRS-641 ${label} -- ${title}\n` + lines.join('\n');
  document.body.insertBefore(box, document.body.firstChild);
  window.scrollTo(0, 0);
};

test('OBRS-641 -- keyboard + autofill hints on the customer text inputs (390x844)', async ({ page }) => {
  mkdirSync(OUT_DIR, { recursive: true });
  const all: Row[] = [];

  for (const key of PAGES) {
    const entry = CUSTOMER_PAGES.find((p) => p.key === key);
    if (!entry) throw new Error(`CUSTOMER_PAGES has no entry '${key}' -- the fixture list moved under this probe`);

    await seedCustomerSession(page, false);
    await page.goto(entry.url);
    if (entry.seed) await seedStore(page, entry.storeOverride ? entry.storeOverride() : {});
    await page.waitForTimeout(1_200);

    // The passenger-info fixture seeds useBookerInfo:true, which hides the
    // passenger's OWN contact fields -- the very fields AC-3 is about. Untick it
    // so the row this card changed is on screen and in the census.
    if (key === 'passenger-info') {
      const useBooker = page.locator('#useBookerInfo-0');
      if ((await useBooker.count()) > 0 && (await useBooker.isChecked())) {
        await useBooker.uncheck();
        await page.waitForTimeout(400);
      }
    }

    const rows = await page.evaluate(CENSUS);
    all.push(...rows.map((r) => ({ page: key, ...r })));

    await page.evaluate(OVERLAY, [rows, key, LABEL] as [Omit<Row, 'page'>[], string, string]);
    await page.screenshot({ path: `e2e-evidence/obrs-641/OBRS-641-${LABEL}-${key}.png`, fullPage: true });
    console.log(`\n== ${key} (${entry.url}) ==`);
    for (const r of rows) {
      console.log(`   ${r.id.padEnd(28)} type=${r.type.padEnd(6)} inputmode=${r.inputmode.padEnd(8)} autocomplete=${r.autocomplete}`);
    }
  }

  writeFileSync(`e2e-evidence/obrs-641/obrs-641-input-hints-${LABEL}.json`, JSON.stringify(all, null, 2));
  console.log(`\n${all.length} text inputs measured across ${PAGES.length} pages -> ${OUT_DIR}`);
});
