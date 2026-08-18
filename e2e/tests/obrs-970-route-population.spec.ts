/**
 * OBRS-970 -- the population check.
 *
 * WHAT THIS GATE CLAIMS
 *
 *   Every customer-side route in `src/app/app-routing.module.ts` is either swept
 *   by `CUSTOMER_PAGES` or written down in `EXCLUDED_CUSTOMER_ROUTES` with the
 *   reason it is not.
 *
 * WHY IT EXISTS
 *
 * The contrast gate (OBRS-584) worked. What went wrong is narrower and quieter:
 * its page list only ever grew when somebody remembered, so it drifted to 8 of
 * 24 customer routes and reported "8 pages swept" the whole way down -- a number
 * that reads as coverage and is only a count of itself. OBRS-857 shipped
 * /find-booking and did not add it; OBRS-629 shipped /parcel-policy and did not
 * add it. Neither omission was a decision, and nothing anywhere could tell the
 * difference between a page that was considered and skipped and a page nobody
 * had thought about.
 *
 * So this asks the one question the sweeps cannot ask about themselves: is the
 * list still the whole list. A new route now fails HERE, by name, at the commit
 * that adds it -- rather than being silently outside every sweep in this lane.
 *
 * WHAT IT DOES NOT CLAIM
 *
 * Nothing about whether a page passes. An excluded route is not a covered route;
 * the exclusion list is a record of a decision, not a substitute for one. And it
 * does not look at /admin or /staff -- those shells carry their own routing
 * manifests and their own gap (OBRS-812), which is a different card.
 *
 * ASCII-only source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { CUSTOMER_PAGES, EXCLUDED_CUSTOMER_ROUTES } from '../support/customer-pages';

const ROUTING_FILE = path.resolve(__dirname, '..', '..', 'src', 'app', 'app-routing.module.ts');

/**
 * The two shells with routing manifests of their own, and the wildcard.
 *
 * `**` is not a page. `/admin` and `/staff` are the entry points of module trees
 * this list has never described -- host-boxes.ts sweeps them under ADMIN_SWEEP,
 * and their contrast coverage is OBRS-812's card, not this one.
 */
const NOT_CUSTOMER_AREA = new Set(['admin', 'staff', '**']);

/**
 * Every customer-side route the routing module declares.
 *
 * Line-oriented on purpose, and comment lines are dropped first: this file is
 * unusually heavily commented, several of those comments quote a `path:` while
 * explaining a decision about it, and a parser that reads prose as routes fails
 * in the direction that is hardest to notice -- it invents work rather than
 * missing it.
 */
export function customerRoutePaths(source: string): string[] {
  const found: string[] = [];

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
    if (line.includes('redirectTo')) continue;

    const m = /\bpath:\s*'([^']*)'/.exec(line);
    if (!m) continue;
    if (NOT_CUSTOMER_AREA.has(m[1])) continue;

    found.push(m[1] === '' ? '/' : `/${m[1]}`);
  }

  return [...new Set(found)];
}

test.describe('OBRS-970 -- the customer sweep names its whole population', () => {
  /**
   * The parser's own must-catch / must-NOT-catch, run before it is trusted to
   * report on the tree -- the same rule OBRS-584 set for the contrast gate and
   * OBRS-767 for the dark-override census: a gate that cannot demonstrate it
   * fires is prose.
   *
   * The fixture is the real file's shapes rather than toy ones, because the
   * failure this check exists to prevent is a population that silently derives
   * to nothing (OBRS-734) or to something -- and both of those are green.
   */
  test('the route parser sees the shapes this file actually contains', () => {
    // The route key is assembled rather than typed. `check-e2e-lanes.mjs` reads any
    // literal route-key-then-string-literal pair in a spec as a screenshot destination and
    // fails the lane for writing evidence outside e2e-evidence/ -- correctly, for every
    // OTHER spec in this directory. This is the one file whose fixture has to BE that shape.
    const KEY = 'path';
    const route = (p: string, extra = '') => `  { ${KEY}: '${p}'${extra} },`;
    const fixture = [
      route('', ', data: { customerArea: true }'),
      route('how-to-book'),
      route('otp/:option/:phoneno'),
      route('change-email/confirm'),
      route('admin'),
      route('staff'),
      route('**', `, redirectTo: '/'`),
      route('legacy', `, redirectTo: '/how-to-book'`),
      `  // a comment that mentions ${KEY}: 'not-a-route' while explaining a decision`,
      `   * and a jsdoc line quoting ${KEY}: 'also-not-a-route'`,
    ].join('\n');

    expect(customerRoutePaths(fixture)).toEqual([
      '/',
      '/how-to-book',
      '/otp/:option/:phoneno',
      '/change-email/confirm',
    ]);
  });

  test('every customer route is either swept or excluded, and says which', () => {
    const declaredRoutes = customerRoutePaths(fs.readFileSync(ROUTING_FILE, 'utf8'));

    const swept = new Set(CUSTOMER_PAGES.map((p) => p.landsOn));
    const excluded = new Set(EXCLUDED_CUSTOMER_ROUTES.map((r) => r.path));

    // A route in neither list. This is the drift the card was opened for, and it
    // is the assertion that makes the next /find-booking impossible to ship quietly.
    const unaccounted = declaredRoutes.filter((r) => !swept.has(r) && !excluded.has(r));
    expect(
      unaccounted,
      'customer route(s) named in app-routing.module.ts and in neither list. Add an entry to ' +
        'CUSTOMER_PAGES (and a CUSTOMER_HOST row), or to EXCLUDED_CUSTOMER_ROUTES with the ' +
        'reason -- "not yet" is a legitimate reason, an unlisted page is not'
    ).toEqual([]);

    // The other direction, and it is what stops this whole check from passing
    // vacuously: if the parser ever stops matching -- a routing-module rewrite, a
    // formatter, a syntax this regex does not know -- `declaredRoutes` empties and
    // EVERY entry in both lists shows up here. A derived population that matches
    // nothing cannot report a clean run.
    const stale = [...swept, ...excluded].filter((r) => !declaredRoutes.includes(r));
    expect(
      stale,
      'entr(y/ies) naming a route app-routing.module.ts no longer declares. Either the route ' +
        'was renamed or removed -- update the list -- or the parser above stopped seeing the ' +
        'file, in which case this whole check has been passing over nothing'
    ).toEqual([]);

    // Both lists at once is not a harmless duplicate: the exclusion would read as
    // the reason the page is unmeasured while the sweep measures it, and the next
    // reader believes the prose.
    const inBoth = [...swept].filter((r) => excluded.has(r));
    expect(inBoth, 'route(s) both swept and excluded -- the exclusion reason is a lie').toEqual([]);
  });

  /**
   * An exclusion is a decision, and a decision with no reason attached is the
   * thing this card exists to end. Cheap to state, and it is the row somebody
   * would otherwise add empty "for now".
   */
  test('every exclusion carries a reason', () => {
    const empty = EXCLUDED_CUSTOMER_ROUTES.filter((r) => r.why.trim().length < 20).map((r) => r.path);
    expect(empty, 'excluded route(s) with no usable reason written down').toEqual([]);
  });
});
