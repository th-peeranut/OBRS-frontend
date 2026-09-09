/**
 * OBRS-1774 -- what invariant D actually looks at.
 *
 * The risk this card carries is not a red gate, it is a GREEN one. D shipped
 * with zero findings, and "zero findings" is also what a gate whose selectors
 * match nothing reports. The run prints a census of every comparison it made
 * (CONTRAST_CENSUS=1); this turns that census into something a reviewer can
 * check without reading a log -- each group of controls where one member is
 * marked selected, photographed on the real screen in both themes, with the
 * measured pair and the verdict burnt into the frame.
 *
 * The numbers in the caption are not re-derived here. They come from the same
 * MEASURE the two gates run, evaluated on the page being photographed, so an
 * image and a gate verdict cannot drift apart.
 *
 * NOT A GATE. Nothing here asserts; it writes PNGs and passes. The enforcing
 * checks are customer-contrast-gate.spec.ts and staff-contrast-gate.spec.ts.
 *
 * ASCII-only source.
 */
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { AA_BOUNDARY, MEASURE, StateFinding, Sweep, stateFails } from '../support/customer-contrast';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';
import { STAFF_PAGES, seedStaffSweepSession } from '../support/staff-pages';

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-1774');

interface Group {
  /** Page key, resolved against CUSTOMER_PAGES or STAFF_PAGES. */
  page: string;
  shell: 'customer' | 'staff';
  /** The container holding the whole group of options. */
  container: string;
  /** Matches the census row -- a class on the chain invariant D reported. */
  marker: string;
  caption: string;
}

/**
 * Every group the first census run named, and nothing invented. A group that
 * does not render is skipped with a printed reason rather than photographed
 * wrongly.
 */
const GROUPS: Group[] = [
  {
    page: 'staff-boarding',
    shell: 'staff',
    container: '.boarding-scan-mode-toggle',
    marker: 'is-active',
    caption: 'Staff /staff/boarding -- Text / Camera scan mode',
  },
  {
    page: 'staff-inspection',
    shell: 'staff',
    container: '.inspection-verdict-toggle',
    marker: 'inspection-verdict-btn',
    caption: 'Staff /staff/inspection -- OK / Needs repair verdict',
  },
  {
    page: 'staff-sell',
    shell: 'staff',
    container: '.ptype-row',
    marker: 'ptype-tile',
    caption: 'Staff /staff/sell -- passenger type tiles',
  },
  {
    page: 'staff-sell',
    shell: 'staff',
    container: '.admin-nav',
    marker: 'admin-nav-link',
    caption: 'Staff sidebar -- the active nav item',
  },
  {
    page: 'home',
    shell: 'customer',
    container: '.trip-type-toggle',
    marker: 'trip-type-toggle__btn',
    caption: 'Customer / -- one way / round trip',
  },
  {
    page: 'home',
    shell: 'customer',
    container: '.recent-routes-list',
    marker: 'recent-route-btn',
    caption: 'Customer / -- recent route chips',
  },
  {
    page: 'schedule-booking-day-strip',
    shell: 'customer',
    container: '.day-strip',
    marker: 'day-strip__chip',
    caption: 'Customer /schedule-booking -- the day strip',
  },
  {
    page: 'payment',
    shell: 'customer',
    container: '.tab-group',
    marker: 'tab.is-active',
    caption: 'Customer /payment -- payment method tabs',
  },
];

const verdict = (s: StateFinding): string =>
  stateFails(s)
    ? 'DEFECT (1.4.11 state): nothing that separates the two reaches 3:1'
    : s.fillVsSibling >= AA_BOUNDARY
      ? 'accepted: the fill alone clears 3:1'
      : 'accepted: the state also moves ' + s.carriers.filter((c) => c !== 'fill').join(' + ');

test.describe('OBRS-1774 state contrast capture', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test('photograph every group invariant D compares, in both themes', async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    let written = 0;

    for (const group of GROUPS) {
      for (const dark of [false, true]) {
        const theme = dark ? 'dark' : 'light';
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const sheet = await context.newPage();
        try {
          if (group.shell === 'customer') {
            const target = CUSTOMER_PAGES.find((p) => p.key === group.page);
            if (!target) throw new Error(`no CUSTOMER_PAGES entry "${group.page}"`);
            await seedCustomerSession(sheet, dark);
            await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
            await sheet.waitForTimeout(2500);
            if (target.seed) {
              await seedStore(sheet, target.storeOverride?.());
              await sheet.waitForTimeout(1200);
            }
          } else {
            const target = STAFF_PAGES.find((p) => p.key === group.page);
            if (!target) throw new Error(`no STAFF_PAGES entry "${group.page}"`);
            await seedStaffSweepSession(sheet, dark, target.fixture ?? []);
            await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
            await sheet.waitForTimeout(2500);
            if (target.act) await target.act(sheet);
            await sheet.waitForTimeout(800);
          }

          const box = sheet.locator(group.container).first();
          if ((await box.count()) === 0) {
            console.log(`[obrs-1774] SKIP ${group.page}/${theme}: "${group.container}" did not render`);
            continue;
          }
          await box.scrollIntoViewIfNeeded().catch(() => undefined);
          await sheet.waitForTimeout(300);

          const sweep = (await sheet.evaluate(MEASURE)) as Sweep;
          const row = sweep.states.find((s) => s.path.includes(group.marker));
          const line = row
            ? `${row.fillVsSibling.toFixed(2)}:1  ${row.selectedFill} vs ${row.siblingFill}  ` +
              `[${row.carriers.join(' + ')}]  --  ${verdict(row)}`
            : 'invariant D scored no state in this group on this run';
          console.log(`[obrs-1774] ${group.page}/${theme} ${group.container}: ${line}`);

          // The caption is injected into the page rather than composited
          // afterwards, so a picture and its number cannot be paired up wrongly
          // by hand later.
          await sheet.evaluate(
            ([selector, text, captionTheme]) => {
              const el = document.querySelector(selector);
              if (!el || !el.parentElement) return;
              const tag = document.createElement('div');
              tag.setAttribute('data-obrs-1774', '1');
              tag.textContent = text;
              tag.style.cssText =
                'font:12px/1.5 monospace;padding:6px 8px;white-space:pre-wrap;' +
                (captionTheme === 'dark'
                  ? 'background:#0f1117;color:#e8eaf0'
                  : 'background:#f2f4f6;color:#212529');
              el.parentElement.insertBefore(tag, el);
            },
            [group.container, `${group.caption}
${line}`, theme] as [string, string, string]
          );
          await sheet.waitForTimeout(200);

          const rect = await sheet.locator(group.container).first().boundingBox();
          if (!rect) {
            console.log(`[obrs-1774] SKIP ${group.page}/${theme}: no bounding box`);
            continue;
          }
          const pad = 28;
          const top = Math.max(0, rect.y - pad - 44);
          await sheet.screenshot({
            path: path.join(
              OUT,
              `OBRS-1774-STATE-${group.page}-${group.container.replace(/[^a-z0-9]/gi, '')}-${theme}.png`
            ),
            clip: {
              x: Math.max(0, rect.x - pad),
              y: top,
              width: Math.min(1440 - Math.max(0, rect.x - pad), rect.width + pad * 2),
              height: Math.min(900 - top, rect.height + pad * 2 + 44),
            },
          });
          written++;
        } finally {
          await context.close();
        }
      }
    }

    console.log(`[obrs-1774] wrote ${written} frame(s) to ${OUT}`);
  });
});
