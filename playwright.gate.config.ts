import { defineConfig, devices } from '@playwright/test';

/**
 * OBRS-602 — the DETERMINISTIC lane. This is the only E2E config that is a merge gate.
 *
 *   npm run e2e:gate
 *
 * Every spec listed in `testMatch` below intercepts its own network traffic, so this
 * lane needs no backend, no seeded data, and no external service. It is the answer to
 * the question OBRS-602 was opened to answer: *which E2E tests can be trusted to mean
 * something when they go red?*
 *
 * WHY A SEPARATE CONFIG RATHER THAN FIXING THE DEFAULT ONE
 * `playwright.config.ts` sets `testDir: './e2e'` with no `testIgnore`, so it sweeps
 * every spec in the directory into one run against live SIT. That is how a suite
 * nobody ever defined grew to 223 cases: each card added a spec plus a bespoke config
 * to run it under, and the default config silently adopted the spec while supplying
 * none of what the bespoke config provided (its own database, its viewport, its port,
 * its hand-started backend). Several of those specs cannot pass under the default
 * config by construction — `my-bookings-reschedule` has a whole header explaining why
 * it had to leave SIT, and the default config runs it against SIT anyway. The 36
 * failures on that run were not flakes; most were specs executing outside the
 * environment they were written for. See docs/e2e-lanes.md for the full partition.
 *
 * THE THREE RULES THAT KEEP THIS LANE HONEST
 *
 * 1. NO `globalSetup` THAT DEPENDS ON ANYTHING OFF THIS BOX. The default config's
 *    global setup logs into live SIT to mint
 *    `e2e/fixtures/admin-auth.json` (gitignored, never committed). That makes SIT a
 *    hard dependency of *every* test in that run — including the ones that mock 100%
 *    of their own traffic. A gate that a cold-starting Koyeb instance can turn red is
 *    not a gate. No spec in this lane uses `storageState` at all: every spec that needs
 *    a session seeds a fake `auth_token` into localStorage from its own `addInitScript`,
 *    so there is no auth artefact for this config to depend on. (Scrutinize OBRS-602:
 *    this paragraph previously named a committed `e2e/fixtures/gate-auth.json`, which
 *    does not exist and never did. OBRS-618 kept it that way deliberately — a committed
 *    storageState file keys its localStorage to an absolute `origins` entry, so it would
 *    silently apply to nothing the day `E2E_GATE_PORT` changed. `addInitScript` has no
 *    such coupling; the shared helper is `e2e/support/gate-admin-session.ts`.)
 *
 *    OBRS-1531 ADDED ONE, and it is inside that rule rather than an exception to it.
 *    `e2e/support/lane-tree-guard.ts` opens no socket and mints no artefact: it prints
 *    the tree, sha and port this run is about to measure, and throws if the server
 *    already answering that port belongs to a different worktree — which, with
 *    `reuseExistingServer` on locally, is a run that would otherwise report a
 *    neighbour's code as this card's evidence and say nothing (OBRS-773). Nothing off
 *    this machine can turn it red, so the property rule 1 protects is untouched.
 *
 * 2. The frontend is served with the `gate` configuration, which is the DEFAULT (local)
 *    environment — `apiUrl` still points at `http://localhost:8080`, where nothing is
 *    listening — plus two file replacements. `src/styles/webfonts.scss` becomes
 *    `webfonts.gate.scss`, so the app's two web fonts are served out of
 *    `e2e/fixtures/fonts/` rather than fetched from Google's CDN. And
 *    `src/environments/environment.ts` becomes `environment.gate.ts`, which fills in
 *    the two analytics measurement ids with fakes: since OBRS-1179 the consent
 *    banner and the withdrawal control stand down when no id is configured, and
 *    `environment.ts` configures none, so without this the specs that exist to
 *    assert the banner is up would be asserting against a build that correctly
 *    never shows it. The ids are fake; `--host-resolver-rules` still makes the
 *    tag hosts unresolvable, so nothing is ever sent.
 *
 *    The dead `apiUrl` is the enforcement mechanism for everything that travels through
 *    it: a call this lane failed to intercept gets ECONNREFUSED instead of quietly
 *    succeeding against SIT.
 *
 *    OBRS-1370 CORRECTION. This paragraph used to conclude that a spec passing here was
 *    therefore *provably* hermetic. It was claiming more than the mechanism could deliver.
 *    An absolute third-party URL inside a stylesheet or a fixture never goes near `apiUrl`,
 *    so `styles.scss` fetched two Google Fonts stylesheets and their woff2 on EVERY page
 *    load in this lane — and a transient gstatic 404 turned the `dev` merge red on a tree
 *    that had just passed on the PR (OBRS-1369). What is enforced now rather than asserted:
 *    the fonts are local (above); `--host-resolver-rules` in `use.launchOptions` leaves
 *    Chromium unable to resolve any hostname but localhost; and
 *    `obrs-1370-lane-offline.spec.ts` goes red naming any host that is not this dev server.
 *    Adding a spec to `testMatch` is still a real check — it is no longer the only one.
 *
 * 3. Explicit `viewport`. `devices['Desktop Chrome']` happens to be 1280×720 today,
 *    but two specs in this repo were authored against a viewport their comment names
 *    and no config sets. Pinning it here means a Playwright upgrade cannot silently
 *    move what these tests measure.
 *
 * `workers: 3`, not the default `cpus/2`. The reported hang at 214/223 was never
 * reproduced, but this box has a measured failure mode where parallel headless Chrome
 * instances die under CPU contention from other sessions, and a dead worker presents
 * as a run that never finishes. Three workers keeps the lane fast without betting the
 * gate on an idle machine.
 *
 * `reporter: 'list'`, not `'html'`. The html reporter defaults to `open: 'on-failure'`,
 * which serves the report and blocks until interrupted. It is TTY-gated so it cannot
 * hang an agent run, but a human running the gate deserves an exit code, not a server.
 */

// OBRS-1531: `E2E_GATE_PORT` moves THIS lane and nothing else. Two other configs used
// to read it — `playwright.obrs1207capture.config.ts` (same default, 4230) and
// `playwright.obrs769.config.ts` — so setting it to escape a collision quietly moved
// two lanes you were not thinking about. `scripts/check-e2e-lanes.mjs` now fails a
// build that shares a port env var or a default port between two configs.
const PORT = process.env['E2E_GATE_PORT'] ?? '4230';

export default defineConfig({
  testDir: './e2e/tests',

  // Rule 1's one inhabitant: names the tree this run measures and refuses a port that
  // belongs to another worktree. Local-only; it stands down on CI. See the helper.
  globalSetup: './e2e/support/lane-tree-guard.ts',

  // Explicit allow-list, never a glob. Membership is the claim "this spec needs
  // nothing but a browser", and that claim should be made one file at a time by
  // someone who checked. A glob would re-create the sweep this config exists to undo.
  testMatch: [
    // OBRS-1038. The station bar's ROW layout has no other automated home: the
    // three component specs that measure it run in an 800px Karma window, and the
    // 992px stack switch is a viewport query, so they only ever take the stacked
    // branch there. This lane pins 1280x720 (rule 3 above), which is the point.
    '**/obrs-857-find-booking.spec.ts',
    '**/obrs-1038-station-seam.spec.ts',
    // OBRS-1189. The rest of the same bar: the date fields and the search button
    // became segments of it, and every claim about that is a cascade-at-a-width
    // fact for the reason the entry above gives. It also measures the one thing
    // a geometry assertion can miss -- whether the value FITS the segment it was
    // given (`scrollWidth - clientWidth`), which is how OBRS-1562's narrower
    // field shipped reading `อา., 23/08/20`. Same fixture shape as 1038: every
    // /api/** call is answered in-spec.
    '**/obrs-1189-search-bar.spec.ts',
    // OBRS-639. Same argument one page further in: the booking stepper's four boxes
    // are laid out by a media query and a flex line, so where they land is a property
    // of the cascade at a viewport width and nothing else. This spec sets its own
    // 360 and 390 rather than using the pinned 1280 -- the card is about a phone.
    '**/obrs-639-stepper-geometry.spec.ts',
    // OBRS-1222. The HTTP interceptor raises SweetAlert2 into document.body,
    // outside every Karma fixture, so "no modal reaches the page" is a claim
    // only a real app can settle -- and that seam is where OBRS-642 shipped.
    '**/obrs-1222-station-load-error.spec.ts',
    '**/route-smoke.spec.ts',
    '**/confirm-guidance-flow.spec.ts',
    '**/report-usability-issue.spec.ts',
    '**/route-map.spec.ts',
    '**/b2c-critical-path.spec.ts',
    // OBRS-618. These three mocked all of their own traffic from the day they were
    // written; the only thing keeping them out was `storageState: admin-auth.json`,
    // minted by logging into live SIT. They seed a synthetic session in-browser now
    // (e2e/support/gate-admin-session.ts) and were admitted only after passing here —
    // against a backend that does not exist, which is what makes membership mean
    // something rather than being a bookkeeping edit.
    '**/focus-retention.spec.ts',
    '**/stop-filter-route-pair.spec.ts',
    '**/trip-details-edit.spec.ts',
    '**/staff-sell-walkin.spec.ts',
    // OBRS-584. Measures WCAG contrast on eight customer pages in both themes by
    // reading getComputedStyle in the browser -- the only place the CASCADE
    // exists, which is why no stylesheet parser could see the 2.79:1 that
    // OBRS-575 shipped past a green CI. Hermetic on the same terms as the rest
    // of the lane: it stubs every /api/** call and aborts Maps.
    '**/customer-contrast-gate.spec.ts',
    // OBRS-753. The malformed-box defect that made `b2c-critical-path` the one red on
    // the first CI run of this lane. It is a MISSING `:host { display }`, so there is
    // nothing in any diff for a reviewer to catch and no stylesheet parser can tell an
    // inline host that is fine from one that is malformed -- only the cascade knows,
    // and the cascade only exists in a browser. Reuses the fixtures above, so it costs
    // this lane page loads and no new machinery.
    '**/review-total-host-box.spec.ts',
    // OBRS-767. Asks a different question of the same browser: not "is this
    // colour legible" but "did this declaration apply at all". It removes each
    // dark-theme.scss declaration from the live CSSOM and fails if the page
    // does not change -- the only way to see a rule that parses, matches, and
    // loses to Angular's view encapsulation. Hermetic on the same terms: it
    // reuses the contrast gate's fixtures, so every /api/** call is stubbed.
    '**/dark-override-effective.spec.ts',
    // OBRS-775. `review-total-host-box` above, but swept across every page this lane can
    // reach hermetically instead of one module, with an ALLOW list carrying a reason per
    // host not yet fixed. Costs this lane page loads only -- it reuses those fixtures.
    '**/host-box-sweep.spec.ts',
    // OBRS-854. The only spec in this lane that starts with NO session at all, because the
    // scenario is a customer scanning a counter QR on their own phone: the bounce through
    // AuthGuard and the trip back to /account are the thing under test, not scenery around it.
    // It performs its own login against a stubbed POST /api/auth/login and aborts the GIS script
    // that /login pulls from accounts.google.com, so it still needs nothing but a browser.
    '**/obrs-854-account-deeplink.spec.ts',
    // OBRS-882. Admitted as the counterpart to the fix that took the PDPA consent banner
    // out of every other spec's way: with `seedAnalyticsConsent` seeded lane-wide, this is
    // the only spec left that loads a page with the banner UP. Without it the fix would be
    // a mute rather than a repair. Hermetic on the same terms as the rest — two stubbed
    // home-page calls and nothing else.
    '**/analytics-consent-banner.spec.ts',
    // OBRS-907. Seeds a synthetic admin session and hangs the notifications
    // call so the notification-bell's spinner stays up; asserts
    // page.emulateMedia({ reducedMotion: 'reduce' }) actually freezes the
    // real compiled CSS cascade. Hermetic on the same terms as the rest.
    '**/obrs-907-loading-state-reduced-motion.spec.ts',
    // OBRS-939. Asks the one question a screenshot cannot: is the renderer still
    // ANSWERING. A `routerLinkActiveOptions` binding pointed at a method call gave
    // RouterLinkActive a new object every cycle, so its ngOnChanges scheduled a
    // microtask every cycle and zone.js never ran out of microtasks — change
    // detection looped forever and the admin shell stopped responding to
    // anything, on every /admin page, whether its API calls succeeded or failed.
    // The last paint stays on screen, so it photographs as a healthy page.
    // Hermetic on the same terms as the rest: synthetic session, no backend.
    '**/obrs-939-admin-shell-responsive.spec.ts',
    // OBRS-813. The cancel modal now offers the reschedule door; the card forbids
    // that offer costing a single extra click on the way to cancelling. Measured
    // with a control arm in the same run (eligible booking vs ineligible, whose
    // modal is the pre-card layout) rather than a constant nobody measured before.
    '**/obrs-813-cancel-offers-reschedule.spec.ts',
    // OBRS-942. The non-manual (card/gateway) refund lane's control-arm
    // counterpart to the spec above — before this card that lane fell through
    // to a plain SweetAlert and never carried the OBRS-813 offer, and had zero
    // E2E coverage of its own (every existing cancel spec used
    // MANUAL_REFUND_REQUIRED). Hermetic on the same terms: it stubs every
    // /api/** call and reuses the same fixture shapes.
    '**/obrs-942-non-manual-cancel.spec.ts',
    // OBRS-627. The published refund terms, asserted against the REAL th.json in
    // the assembled app: the unit suite can only prove the component
    // interpolates what it is handed, not that the shipped page calls the
    // endpoint or that a raw `{{...}}` never reaches a customer — the two things
    // that went wrong on the equivalent claim one page over (OBRS-564). Hermetic
    // on the same terms as the rest: every /api/** call is fulfilled in-spec.
    '**/obrs-627-refund-policy.spec.ts',
    // OBRS-1207. Replaces the two FAB-overlap cases in report-usability-issue.spec.ts,
    // which compared a `position: fixed` box against a scrolling one and never pinned
    // the scroll — so their verdict was a function of where the page came to rest. The
    // same tree passed on PR #167, went red on the `dev` merge `8c43dcec`, and passed
    // 6/6 locally. This one SOLVES for the scroll offsets that collide instead of
    // sampling them, and asks `document.elementFromPoint()` rather than comparing
    // rectangles. Hermetic on the same terms as the rest — it reuses those fixtures.
    '**/obrs-1207-fab-occlusion.spec.ts',
    // OBRS-1224. The claim is a DISTANCE in px between the box you type into and
    // the field you clicked, with the panel flipped upward by Popper — so it needs
    // a real layout engine, a real 60vh and a real viewport height. Karma has none
    // of those: its window is 800px and fixed, and the three component specs that
    // measure this bar never take the flipped branch there. Hermetic on this lane's
    // terms: it reuses `mockPublicPageApis` and then sharpens the stop list to 24,
    // because the shared fixture's 2 stops never overflow 60vh, never flip, and
    // would therefore measure the one geometry that was never broken.
    '**/obrs-1224-origin-combobox.spec.ts',
    // OBRS-1372. The other half of the spec above: that one pins the bar's overlap
    // with the FAB as deliberate, this one sweeps the customer shell at a phone
    // viewport and fails if a control in the page's own flow cannot be scrolled clear
    // of the bar at all. The bar is `position: fixed` and nothing reserved room for
    // it, so the bottom 37% of every page was unreachable while the question was
    // unanswered — on prod, for eleven months. Hermetic: it reuses the contrast
    // gate's fixtures.
    '**/obrs-1372-consent-banner-reachability.spec.ts',
    // OBRS-1370. The lane's own hermeticity, asserted instead of declared: it sweeps the
    // customer pages and fails naming any host that is not this dev server. Rule 2 above
    // claimed that property for six months while `styles.scss` fetched Google Fonts on
    // every page load, because nothing was looking.
    '**/obrs-1370-lane-offline.spec.ts',
    // OBRS-1301. The only question in this repo that needs a REAL enforcing CSP header and a
    // real <img> decode at the same time: `img-src` names no gateway origin, so a QR URL on
    // one is dropped by the browser and the frame goes quietly empty. Neither of the two CSP
    // gates can see it -- both compare the allowlist against the prose inventory, and neither
    // moves when a backend starts forwarding a different URL. Hermetic on this lane's terms:
    // it reuses the contrast gate's fixtures and stubs its own payment calls on top.
    '**/obrs-1301-qr-img-src.spec.ts',
    // OBRS-970. Not a browser test at all -- it reads app-routing.module.ts off disk and
    // compares it with the two lists in customer-pages.ts. It belongs in THIS lane because
    // this lane is the merge gate: the drift it catches is a page shipping outside every
    // sweep above, and a check for that which does not run at merge is a comment.
    '**/obrs-970-route-population.spec.ts',
    // OBRS-1704. The rendered WIDTH of the shell's checkboxes. `admin-theme.scss` gives
    // every input under `.admin-shell` `width: auto !important`, which collapses an
    // `appearance: none` control to 2px, and Karma's DOM never loads that stylesheet --
    // so the defect passed every unit spec on those forms. OBRS-1693 fixed it with one
    // `!important` declaration and shipped the check as a root capture script, which by
    // this repo's convention has no lane and is called by nothing; deleting the
    // declaration left CI green. Hermetic on the same terms as the rest: synthetic
    // session, every call answered in-spec.
    '**/obrs-1693-admin-shell-control-width.spec.ts',
    // OBRS-913. The sidebar toggle's rendered SIZE, same argument one control over:
    // `.admin-sidebar-pin` declares 28px and rendered 20px, because it is a
    // `flex-shrink: 1` item of a column that overflows on a laptop-height viewport.
    // A parser reads the declaration and passes it; Karma's 800px window never
    // enters the `min-width: 1101px` block the rule lives in. This spec sets its own
    // 1536x900 (the card's viewport) and asserts the overflow precondition before
    // measuring, so it cannot go green without having reproduced the condition.
    '**/obrs-913-sidebar-toggle-target-size.spec.ts',
  ],

  timeout: 60_000,
  // OBRS-618 dropped this from 3 to 2. That card added three admin specs which each boot
  // the staff shell repeatedly, and at 3 workers `b2c-critical-path` — untouched by that
  // card, and green at 18.9s on the lane as it stood before it
  // — began timing out at 60s waiting for a navigation, twice in a row. Run alone under
  // this same config it takes 7.8s. That was read as contention on this box — several Claude
  // sessions, an `ng serve` and N headless Chromes competing for the same cores.
  //
  // OBRS-750 CORRECTION: for `b2c-critical-path` specifically that diagnosis was wrong. The
  // spec clicked `.btn-confirm` with `force: true`, which does not aim the event at the
  // element and so delivered it to whichever element was topmost — the button's own parent.
  // It timed out on a clean GitHub runner with nothing else running. `workers: 2` is kept
  // because CPU contention on this box is separately real, but do not reach for it to
  // explain a `waitForURL` that never fires: check first whether the click landed at all.
  // A gate that reds because the machine was busy teaches people to re-run it until it
  // is green, and a gate nobody believes is not a gate. Wall-clock cost is ~30s.
  workers: 2,
  retries: 0,

  // Unconditionally, not `!!process.env.CI`. This lane IS the merge gate and it runs on
  // a developer's box, so the machine where a stray `test.only` would do its damage is
  // exactly the machine CI-gating exempts. Without this, one forgotten `.only` shrinks
  // the gate from the whole lane to 1 case and still exits 0 — a green run asserting almost
  // nothing, which is the failure mode this whole card exists to end. (Scrutinize OBRS-602.)
  //
  // OBRS-750: no case count is quoted anywhere in this file any more. Both of the ones that
  // were here had rotted, and one was read back as current and reported as fact in the
  // session that closed OBRS-735 — the card about exactly that failure. `npm run e2e:gate`
  // prints the real number on every run and docs/e2e-lanes.md carries it for humans.
  // Do not reintroduce one here.
  forbidOnly: true,
  reporter: [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',

    // OBRS-1370. Chromium resolves nothing but localhost here, so a request this lane
    // failed to intercept CANNOT reach the internet: it fails at DNS in milliseconds
    // instead of borrowing a stranger's uptime and lending this gate their outages. This
    // is the lane-level half of rule 2 — it covers every spec in `testMatch`, including
    // the next one somebody adds. `obrs-1370-lane-offline.spec.ts` is the half that says
    // out loud what tried to leave.
    launchOptions: {
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // The `gate` configuration: the default (local) environment plus locally served web
    // fonts -- see rule 2 above. `--no-live-reload` because a rebuild mid-run would
    // reload the page out from under an assertion.
    command: `npx ng serve --configuration gate --port ${PORT} --no-live-reload`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: !process.env['CI'],
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
