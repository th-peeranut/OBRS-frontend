/**
 * OBRS-775 -- finding component hosts that are `display: inline` while holding
 * block-level children, in the only place the answer exists: a running browser.
 *
 * THE DEFECT, RESTATED FROM OBRS-753. An Angular component whose SCSS never
 * writes `:host { display: ... }` renders as `display: inline`, because that is
 * the initial value and Angular adds nothing. If its template's root children
 * are block-level, CSS requires the browser to split the inline box and wrap
 * those children in ANONYMOUS block boxes. The host's own border box then stops
 * describing anything you can reason about -- on OBRS-753 it spanned the height
 * of BOTH children, so Playwright's hit test at a button inside it resolved to
 * the host and called it an interceptor.
 *
 * WHY NOT A STYLESHEET LINT. The defect is a MISSING declaration, so there is no
 * token in any diff for a reviewer or a parser to catch, and no parser can tell
 * an inline host that is FINE (all children inline; or the host is a flex/grid
 * item and its parent blockifies it) from one that is malformed. Only the
 * cascade knows, and the cascade only exists in a browser. Same argument as
 * OBRS-584's contrast gate.
 *
 * OUT-OF-FLOW CHILDREN ARE NOT A DEFECT, and this module says so in code.
 * Absolutely positioned, fixed and floated boxes are taken out of the normal
 * flow before the inline box is ever split, so an inline host whose only
 * block-level child is `position: absolute` is well-formed. That is not a
 * technicality: `app-report-usability-fab` is on the card's list of 25 and its
 * only child is `.report-fab { position: fixed }`, so it never needed fixing.
 * Counting it would have put a fictional entry on the allow-list, and an
 * allow-list with fictional entries on it is how a gate stops being believed.
 *
 * The page lists live here too, so the GATE spec and the before/after geometry
 * CAPTURE measure exactly the same screens. Two copies of "which pages does this
 * card cover" is how the evidence ends up describing a different sweep from the
 * one that is enforced.
 *
 * ASCII-only source.
 */

import { expect, Browser, Page } from '@playwright/test';
import { CUSTOMER_PAGES } from './customer-pages';

/** Displays that make a box BLOCK-LEVEL, i.e. illegal inside an inline box. */
export const BLOCK_LEVEL = /^(block|flex|grid|table|list-item|flow-root)$/;

export interface MalformedHost {
  /** Which page it was seen on -- the first one, since hosts repeat across the shell. */
  page: string;
  /** The custom-element tag, e.g. `app-navbar` or `p-card`. */
  tag: string;
  /** The in-flow block-level children that make the box malformed. */
  blockChildren: string[];
}

/**
 * Every custom-element host on the current page that is `display: inline` and
 * holds at least one IN-FLOW block-level child.
 *
 * Scoped to tags containing a hyphen, which is exactly the set of custom
 * elements: our own `app-*` plus PrimeNG's `p-*`. A plain `<span>` wrapping a
 * `<div>` is the same CSS mistake, but it is written down in a template where a
 * reviewer can see it; the host case is the one that is invisible by
 * construction, and it is the one this card is about.
 */
export async function scanMalformedHosts(page: Page, pageKey: string): Promise<MalformedHost[]> {
  const found = await page.evaluate(() => {
    const blockLevel = /^(block|flex|grid|table|list-item|flow-root)$/;
    const label = (el: Element) => {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
      return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
    };

    const out: { tag: string; blockChildren: string[] }[] = [];
    const seen = new Set<string>();

    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (!el.tagName.includes('-')) continue;
      const cs = getComputedStyle(el);
      if (cs.display !== 'inline') continue;

      const kids: string[] = [];
      for (const child of Array.from(el.children)) {
        const ccs = getComputedStyle(child);
        if (!blockLevel.test(ccs.display)) continue;
        // Out of flow before the inline box is ever split -- see the header.
        if (ccs.position === 'absolute' || ccs.position === 'fixed') continue;
        if (ccs.float !== 'none') continue;
        kids.push(label(child));
      }
      if (!kids.length) continue;

      // One entry per component, not per instance: `app-passenger-info-form`
      // renders once per passenger and would otherwise report N identical rows.
      const tag = el.tagName.toLowerCase();
      if (seen.has(tag)) continue;
      seen.add(tag);
      out.push({ tag, blockChildren: kids });
    }
    return out;
  });

  return found.map((f) => ({ page: pageKey, ...f }));
}

/**
 * Waits until the page is quiescent enough to measure.
 *
 * The app's HTTP interceptor opens a SweetAlert "Loading..." for EVERY `/api/`
 * call and closes it in `finalize`. Its container is `position: fixed` and keeps
 * `pointer-events: auto` right through the closing transition, so a scan taken a
 * few frames early measures a page that still has a modal on it. OBRS-753 lost a
 * run to exactly that, and its own header records the fix; this is the same wait,
 * hoisted so every page in the sweep gets it.
 */
export async function settle(page: Page): Promise<void> {
  await expect(page.locator('.swal2-container')).toHaveCount(0, { timeout: 15_000 });
  // Two frames: the swal container is removed on transitionend, and the layout
  // that follows its removal is what we are about to measure.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  );
}

// --- the pages under sweep ---------------------------------------------------

export interface SweepPage {
  key: string;
  url: string;
  /** The pathname the app must land on. A redirect to /login is a failed sweep. */
  landsOn: RegExp;
  /** Proof the page rendered ITSELF and not just the shell. */
  requires: string;
  /** Needs the NgRx booking store seeded before it renders anything measurable. */
  seed?: boolean;
}

/**
 * The routed component each customer page must actually mount, keyed by
 * `CUSTOMER_PAGES[].key`.
 *
 * Not derived from `CustomerPage.mustRender`: three of the eight declare none
 * (they exist for the contrast gate, which needs a CONTROL to measure, and those
 * pages have none worth naming), and the generic fallback this replaced --
 * `app-root > *` -- resolved to the `<router-outlet>` element itself, which
 * Angular leaves in the DOM and renders `display: none`. It timed out on
 * `/review-schedule-booking` on the first run. Naming the routed component is
 * both honest and stricter: a page that redirected renders a different host and
 * fails here rather than being swept under someone else's key.
 *
 * A key added to `CUSTOMER_PAGES` and not here fails loudly in the gate spec,
 * which is the point -- the sweep should grow when that list grows.
 */
export const CUSTOMER_HOST: Record<string, string> = {
  home: 'app-home',
  login: 'app-login',
  'my-bookings': 'app-my-bookings',
  'schedule-booking': 'app-schedule-booking',
  'review-schedule-booking': 'app-review-schedule-booking',
  'passenger-info': 'app-passenger-info',
  payment: 'app-payment',
  'e-ticket': 'app-e-ticket',
};

/** `CUSTOMER_PAGES` restated in this module's shape. */
export const CUSTOMER_SWEEP: SweepPage[] = CUSTOMER_PAGES.map((c) => ({
  key: c.key,
  url: c.url,
  landsOn: new RegExp(c.landsOn.replace(/\//g, '\\/') + '$'),
  requires: CUSTOMER_HOST[c.key],
  seed: c.seed,
}));

/**
 * Public and auth-entry routes. Taken from `route-smoke.spec.ts`, which already
 * proves each one renders under an empty mocked backend -- the sentinel selectors
 * below are its assertions, reused so the two specs cannot drift into disagreeing
 * about what "this page rendered" means.
 */
export const PUBLIC_SWEEP: SweepPage[] = [
  { key: 'business-policy', url: '/business-policy', landsOn: /\/business-policy$/, requires: '.policy-card h1' },
  { key: 'how-to-book', url: '/how-to-book', landsOn: /\/how-to-book$/, requires: '.how-to-book-card h1' },
  { key: 'privacy-policy', url: '/privacy-policy', landsOn: /\/privacy-policy$/, requires: '.policy-card h1' },
  { key: 'refund-policy', url: '/refund-policy', landsOn: /\/refund-policy$/, requires: '.policy-card h1' },
  { key: 'forget-password', url: '/forget-password', landsOn: /\/forget-password$/, requires: '#email' },
  {
    key: 'reset-password',
    url: '/reset-password?token=host-box-sweep-token',
    landsOn: /\/reset-password/,
    requires: '#newPassword',
  },
  { key: 'login-mobile', url: '/login-mobile', landsOn: /\/login-mobile$/, requires: '#phoneNo' },
  { key: 'register', url: '/register', landsOn: /\/register$/, requires: '#firstName' },
  { key: 'otp', url: '/otp/login/0812345678', landsOn: /\/otp\//, requires: 'app-otp' },
];

/**
 * The staff and admin shells, plus the one customer page that needs a session
 * AND a booking id. The card called this group unsurveyed and said so in as many
 * words -- the static census pointed at it as the thickest one, and the 25 hosts
 * it quoted were customer pages only. Everything here is reachable with no
 * backend, which is why these particular routes and not the whole admin menu: a
 * page that needs data this lane cannot fake would measure its own error state
 * and report the hosts of a screen no user sees.
 *
 * `/payment/result` sits here rather than with the public pages because
 * `PaymentResultComponent.ngOnInit` bounces to `/payment` when
 * `getActiveBookingId()` is empty, and this is the group that seeds one. On the
 * first run it was in PUBLIC_SWEEP and the landing assertion caught the redirect
 * -- which is the assertion doing its job: without it the sweep would have
 * measured `/payment` twice and filed the second one under `payment-result`.
 */
export const ADMIN_SWEEP: SweepPage[] = [
  { key: 'admin-lookups', url: '/admin/lookups', landsOn: /\/admin\/lookups$/, requires: '.admin-table' },
  { key: 'admin-roles', url: '/admin/roles', landsOn: /\/admin\/roles$/, requires: '.admin-table' },
  { key: 'admin-routes', url: '/admin/routes', landsOn: /\/admin\/routes$/, requires: '.admin-table' },
  { key: 'admin-users', url: '/admin/users', landsOn: /\/admin\/users$/, requires: '.admin-table' },
  {
    key: 'admin-usability-reports',
    url: '/admin/usability-reports',
    landsOn: /\/admin\/usability-reports$/,
    requires: 'app-usability-reports-page',
  },
  { key: 'staff-sell', url: '/staff/sell', landsOn: /\/staff\/sell$/, requires: 'app-sell-page' },
  { key: 'staff-driver', url: '/staff/driver', landsOn: /\/staff\/driver$/, requires: '.admin-title-block h2' },
  { key: 'staff-boarding', url: '/staff/boarding', landsOn: /\/staff\/boarding$/, requires: 'app-boarding-entry-page' },
  {
    key: 'staff-boarding-list',
    url: '/staff/boarding/42',
    landsOn: /\/staff\/boarding\/42$/,
    requires: 'app-boarding-list-page table',
  },
  { key: 'payment-result', url: '/payment/result', landsOn: /\/payment\/result$/, requires: '.payment-result h1' },
];

// --- reaching them -----------------------------------------------------------

const ok = <T>(data: T) => ({ code: 200, message: 'OK', data });
const emptyPage = () => ({ content: [], totalElements: 0, totalPages: 0, size: 100, number: 0 });

/**
 * A deliberately dumb backend for the public and admin groups: arrays where a
 * list is expected, an empty page where a page is expected, `null` otherwise.
 *
 * It does NOT try to be `route-smoke`'s mock plus extras. This card measures
 * BOXES, and an empty table has exactly the same host tree as a full one; richer
 * fixtures would buy nothing and would be a second copy of a shape that has to
 * stay in step with the server. The one thing that does matter -- that the page
 * rendered at all -- is asserted per page by `requires`, not inferred from the
 * fixture.
 */
export async function mockEmptyBackend(page: Page): Promise<void> {
  await page.route('**/api/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let body: unknown = ok(null);
    if (/\/external\/otp\/request/.test(pathname)) body = ok({ token: 'OTP-HOST-BOX-SWEEP' });
    else if (/(bookings|usability-reports|notifications)$/.test(pathname)) body = ok(emptyPage());
    else if (/\/private\/notifications\/unread-count$/.test(pathname)) body = ok({ unreadCount: 0 });
    else if (/\/private\/users\/me$/.test(pathname)) body = ok({ salesPointStop: null });
    else if (/\/payments$/.test(pathname)) body = ok({ paymentSummary: { status: 'pending' }, transactions: [] });
    else if (/(lookups|roles|users|routes|stops|stations|vehicles|vehicle-types|schedule-set|schedules)$/.test(pathname))
      body = ok([]);
    else if (/\/boarding-list$/.test(pathname)) body = ok([]);
    else if (/\/route-stops\//.test(pathname)) body = ok({ stops: [] });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
}

/** No session at all -- the logged-out shell is a different navbar, and worth measuring. */
export async function seedAnonymousSession(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('app_language', 'en'));
  await mockEmptyBackend(page);
}

export async function seedStaffSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'en');
    localStorage.setItem('auth_token', 'obrs-775-host-box-sweep-token');
    localStorage.setItem('auth_username', 'admin@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['admin']));
    localStorage.setItem('active_booking_id', '123');
  });
  await mockEmptyBackend(page);
}

/**
 * Navigates to a page and blocks until it is the page it claims to be and has
 * stopped moving. Shared so the gate and the geometry capture cannot disagree
 * about when a page is ready -- a capture taken one frame earlier than the gate
 * would report differences that are timing, not layout.
 */
export async function visit(page: Page, p: SweepPage, seedFn?: (pg: Page) => Promise<void>): Promise<void> {
  await page.goto(p.url);
  if (p.seed && seedFn) await seedFn(page);
  // The page must be ITSELF before anything is measured. Without this a redirect
  // to /login measures the login page's boxes, files them under this page's key,
  // and reports a clean result for a screen it never visited.
  await expect(page).toHaveURL(p.landsOn);
  await page.locator(p.requires).first().waitFor({ timeout: 15_000 });
  await settle(page);
}

/**
 * A fresh context per group. `browser.newPage()` would share storage with the
 * others, and the customer group seeds `auth_roles: ['user']` while the admin
 * group seeds `['admin']` -- one leaking into the other is how a sweep measures
 * a screen the role it claims to hold could never open.
 */
export async function newSweepPage(browser: Browser, width = 1280, height = 720): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height } });
  return ctx.newPage();
}
