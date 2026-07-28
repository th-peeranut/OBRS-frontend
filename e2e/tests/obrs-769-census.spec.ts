/**
 * OBRS-769 PROBE -- not a gate. Census of the two muted text tokens on the
 * surfaces they actually render on.
 *
 * The contrast gate only prints what FAILS, and the question this card has to
 * answer is the opposite one: if `$text-lightgrey` moves, which sites that pass
 * TODAY would start failing? `customer-contrast-allow.ts` already names one --
 * "#989ba4 on $dk-bg-soft is 4.9:1" -- and a token move darkens exactly that.
 *
 * So this reuses the gate's own MEASURE (every scoreable run, failing or not)
 * and reports every sighting of #989ba4 / #717581 with its MEASURED background,
 * both themes, all eight pages.
 *
 * ASCII-only source.
 */

import { expect, test } from '@playwright/test';
import { MEASURE } from '../support/customer-contrast';
import { CUSTOMER_PAGES, seedCustomerSession, seedStore } from '../support/customer-pages';

/** The two tokens this card owns, as they render. Add nothing else here. */
const TOKENS: Record<string, string> = {
  '#989ba4': '$text-lightgrey',
  '#717581': '$text-lightblack',
};

interface Sighting {
  theme: string;
  page: string;
  path: string;
  fg: string;
  bg: string;
  ratio: number;
  count: number;
  text: string;
}

test.describe('OBRS-769 muted-token census', () => {
  test('every #989ba4 / #717581 text run, with the background it sits on', async ({ browser }) => {
    test.setTimeout(600_000);

    const seen: Sighting[] = [];
    let totalRuns = 0;

    for (const target of CUSTOMER_PAGES) {
      for (const dark of [false, true]) {
        const theme = dark ? 'dark' : 'light';
        const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
        const sheet = await context.newPage();
        try {
          await seedCustomerSession(sheet, dark);
          await sheet.goto(target.url, { waitUntil: 'domcontentloaded' });
          await sheet.waitForTimeout(2500);
          if (target.seed) {
            await seedStore(sheet);
            await sheet.waitForTimeout(1200);
          }
          const sweep = await sheet.evaluate(MEASURE);
          expect(sweep.bodyIsDark, `${target.key}/${theme}: theme did not apply`).toBe(dark);
          totalRuns += sweep.measuredText;

          for (const f of sweep.text) {
            if (!TOKENS[f.fg.toLowerCase()]) continue;
            seen.push({
              theme,
              page: target.key,
              path: f.path,
              fg: f.fg.toLowerCase(),
              bg: f.bg.toLowerCase(),
              ratio: f.ratio,
              count: f.count,
              text: (f.text || '').slice(0, 40),
            });
          }
        } finally {
          await context.close();
        }
      }
    }

    // A census that finds nothing is a broken selector, not a clean palette:
    // the allow register alone names six live sightings of these two hexes.
    expect(totalRuns, 'no text was scored at all -- the sweep never ran').toBeGreaterThan(500);
    expect(seen.length, 'ZERO sightings of #989ba4/#717581 -- probe is measuring nothing').toBeGreaterThan(0);

    // One line per distinct (theme, path, fg, bg), worst ratio wins.
    const rows = new Map<string, Sighting & { pages: Set<string>; instances: number }>();
    for (const s of seen) {
      const k = `${s.theme}|${s.path}|${s.fg}-on-${s.bg}`;
      const prev = rows.get(k);
      if (prev) {
        prev.pages.add(s.page);
        prev.instances += s.count;
      } else {
        rows.set(k, { ...s, pages: new Set([s.page]), instances: s.count });
      }
    }

    const sorted = [...rows.values()].sort((a, b) => a.ratio - b.ratio);
    console.log(`\n=== OBRS-769 census: ${sorted.length} distinct sites, ${seen.length} sightings ===`);
    console.log('ratio   token             fg-on-bg              n   theme  pages / path');
    for (const r of sorted) {
      const verdict = r.ratio >= 4.5 ? 'PASS' : 'FAIL';
      console.log(
        `${r.ratio.toFixed(2).padStart(5)}:1 ${verdict} ${TOKENS[r.fg].padEnd(17)} ${(r.fg + '-on-' + r.bg).padEnd(20)} ` +
          `x${String(r.instances).padStart(3)} ${r.theme.padEnd(6)} ${[...r.pages].join(',')}\n         ${r.path}`
      );
    }

    const backgrounds = new Map<string, Set<string>>();
    for (const r of sorted) {
      const key = TOKENS[r.fg];
      if (!backgrounds.has(key)) backgrounds.set(key, new Set());
      backgrounds.get(key)!.add(r.bg);
    }
    console.log('\n=== backgrounds each token must carry (measured, not guessed) ===');
    for (const [tok, bgs] of backgrounds) console.log(`${tok}: ${[...bgs].sort().join(' ')}`);
    console.log(`\ntotal text runs scored: ${totalRuns}`);
  });
});
