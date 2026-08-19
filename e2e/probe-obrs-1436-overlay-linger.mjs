/**
 * OBRS-1436 — repro probe for the overlay that takes the hit-test in
 * `obrs-854-account-deeplink.spec.ts`.
 *
 * The GATE lane went red on a tree that passed on re-run, with
 * `document.elementFromPoint` at the centre of `close-account-open` returning
 * `div.swal2-container ... swal2-backdrop-hide` instead of the consent bar. The trace of
 * the red run (Actions run 32202546299, attempt 1) already names the popup inside that
 * container: `swal-global-loading swal2-loading`, title "กำลังโหลด…" — i.e. the global
 * loading overlay `errorInterceptor` raises for every `/api/` request, caught mid-close.
 *
 * What the trace CANNOT say is how long that container stays hit-testable after it stops
 * being visible, and that number is the whole question: sweetalert2 removes the container
 * from `didClose`, which it runs on the popup's `animationend`, and the hide animation's
 * end state is `forwards` — so the overlay is invisible for the entire tail of that
 * window while still receiving every tap. This probe measures the window.
 *
 * It replays the spec's own flow (arrive logged out, log in against a stubbed
 * `POST /api/auth/login`, land on `/account`) against a locally-served `gate` build with
 * a requestAnimationFrame sampler installed before the app boots, and reports per overlay:
 *
 *   visibleMs        — while the popup's computed opacity is above 0
 *   invisibleMs      — present in the DOM, opacity 0: the window this card is about
 *   hitsWhileInvisible — frames where elementFromPoint at the viewport centre still
 *                        landed inside the container. Not "could it in principle" — did it.
 *
 * POSITIVE CONTROL: the run must observe at least one overlay appear AND reach 0
 * containers. A probe that sees no overlay at all would report `invisibleMs: 0` and read
 * as "nothing to fix" (the OBRS-930 false negative), so that case exits non-zero.
 *
 * Usage (needs `npx ng serve --configuration gate --port 4230` already up):
 *   node e2e/probe-obrs-1436-overlay-linger.mjs
 *   BASE_URL=http://localhost:4231 RUNS=5 OUT_DIR=... node e2e/probe-obrs-1436-overlay-linger.mjs
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:4230';
const OUT = process.env.OUT_DIR || path.resolve('obrs-1436-evidence');
const RUNS = Number(process.env.RUNS || 5);

fs.mkdirSync(OUT, { recursive: true });

const EMAIL = 'counter-deletion@example.test';
const PASSWORD = 'Str0ng-Passw0rd!';
const ok = (data) => ({ code: 200, message: 'OK', data });

// The spec's own fixtures, kept in the same shape so the flow this measures is the flow
// that went red. `pdpaConsentVersion` is deliberately the spec's value.
const PROFILE = {
  id: 4242,
  title: 'MR',
  firstName: 'Somchai',
  middleName: null,
  lastName: 'Counter',
  email: EMAIL,
  phoneNumber: '0812345678',
  preferredLocale: 'th',
  pdpaConsentVersion: '1.0',
};

const LOGIN_RESPONSE = ok({
  accessToken: 'gate-probe-token',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: {
    id: PROFILE.id,
    fullName: 'Somchai Counter',
    email: EMAIL,
    preferredLocale: 'th',
    status: 'active',
    roles: ['customer'],
  },
});

/**
 * Installed before the app boots. One sample per animation frame: what the DOM holds and
 * who would receive a tap. Reading `getComputedStyle` rather than the class list is the
 * point — `swal2-hide` is still on the popup after its animation has finished painting.
 */
const SAMPLER = () => {
  const samples = [];
  window.__obrs1436 = samples;
  const centreHit = () => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return !!el && !!el.closest('.swal2-container');
  };
  const tick = () => {
    const container = document.querySelector('.swal2-container');
    const popup = container ? container.querySelector('.swal2-popup') : null;
    samples.push({
      t: Math.round(performance.now()),
      n: document.querySelectorAll('.swal2-container').length,
      popup: popup ? popup.className : null,
      opacity: popup ? Number(getComputedStyle(popup).opacity) : null,
      hit: container ? centreHit() : false,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** Split the frame samples into one record per overlay that came and went. */
function overlays(samples) {
  const out = [];
  let current = null;
  for (const s of samples) {
    if (s.n > 0 && !current) {
      current = { firstSeenAt: s.t, popup: s.popup, frames: [] };
    }
    if (current) {
      current.frames.push(s);
      if (s.n === 0) {
        const seen = current.frames.filter((f) => f.n > 0);
        const visible = seen.filter((f) => (f.opacity ?? 0) > 0);
        const lastVisible = visible.length ? visible[visible.length - 1] : null;
        const invisibleTail = lastVisible
          ? current.frames.filter((f) => f.n > 0 && f.t > lastVisible.t)
          : seen;
        out.push({
          popup: seen.find((f) => f.popup)?.popup ?? current.popup,
          firstSeenAt: current.firstSeenAt,
          removedAt: s.t,
          framesPresent: seen.length,
          visibleMs: lastVisible ? lastVisible.t - current.firstSeenAt : 0,
          // The window this card is about: still in the DOM, nothing on screen.
          invisibleMs: invisibleTail.length ? s.t - (lastVisible ? lastVisible.t : current.firstSeenAt) : 0,
          hitsWhileInvisible: invisibleTail.filter((f) => f.hit).length,
        });
        current = null;
      }
    }
  }
  // An overlay still up when sampling stopped is not a completed window; report it as such
  // rather than dropping it, because "never removed" is the worst case this can find.
  if (current) {
    const seen = current.frames.filter((f) => f.n > 0);
    out.push({
      popup: seen.find((f) => f.popup)?.popup ?? current.popup,
      firstSeenAt: current.firstSeenAt,
      removedAt: null,
      framesPresent: seen.length,
      stillPresentWhenSamplingStopped: true,
    });
  }
  return out;
}

async function runOnce(browser, index) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const record = { run: index, error: null };

  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_username');
    localStorage.removeItem('auth_roles');
    // The spec's first-visit arm: no consent answer, so the bar is up.
    localStorage.removeItem('obrs_analytics_consent_v1');
  });
  await page.addInitScript(SAMPLER);

  await page.route('https://accounts.google.com/**', (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('/api/auth/login')
      ? LOGIN_RESPONSE
      : url.pathname.endsWith('/api/private/users/me')
        ? ok(PROFILE)
        : ok(null);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  try {
    await page.goto(BASE + '/account', { waitUntil: 'load' });
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await page.click('button.login-btn[type="submit"]');
    await page.waitForURL(/\/account$/);
    await page.waitForSelector('[data-testid="close-account-open"]', { state: 'attached' });

    // What the spec reads, read at the same moment the spec reads it: the first thing it
    // does after the button is attached is measure geometry and hit-test.
    record.atSpecMoment = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="close-account-open"]');
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        containers: document.querySelectorAll('.swal2-container').length,
        topAtButtonCentre: top ? `${top.tagName.toLowerCase()}.${top.className}` : null,
      };
    });

    // Keep sampling past the point the spec would have finished, so a window that closes
    // late is measured rather than truncated into looking infinite.
    await page.waitForTimeout(1500);
    record.samples = await page.evaluate(() => window.__obrs1436.length);
    record.overlays = overlays(await page.evaluate(() => window.__obrs1436));
  } catch (e) {
    record.error = String(e).slice(0, 300);
  }

  await ctx.close();
  return record;
}

const browser = await chromium.launch();
const ledger = { base: BASE, runs: [] };
for (let i = 1; i <= RUNS; i += 1) {
  const r = await runOnce(browser, i);
  ledger.runs.push(r);
  const summary = (r.overlays ?? [])
    .map((o) => `${o.invisibleMs ?? '?'}ms invisible (${o.hitsWhileInvisible ?? '?'} hits)`)
    .join(' | ');
  console.log(`run ${i}: ${r.error ? 'ERROR ' + r.error : summary || 'no overlay observed'}`);
}
await browser.close();

const all = ledger.runs.flatMap((r) => r.overlays ?? []);
const completed = all.filter((o) => o.removedAt !== null);
ledger.verdict = {
  overlaysObserved: all.length,
  loadingOverlays: all.filter((o) => (o.popup ?? '').includes('swal-global-loading')).length,
  maxInvisibleMs: completed.length ? Math.max(...completed.map((o) => o.invisibleMs)) : null,
  overlaysHitTestedWhileInvisible: completed.filter((o) => o.hitsWhileInvisible > 0).length,
  runsWhereSpecMomentSawAContainer: ledger.runs.filter((r) => r.atSpecMoment?.containers > 0).length,
};

const jsonPath = path.join(OUT, 'obrs-1436-overlay-linger.json');
fs.writeFileSync(jsonPath, JSON.stringify(ledger, null, 2));
console.log('\n' + JSON.stringify(ledger.verdict, null, 2));
console.log('wrote ' + jsonPath);

// POSITIVE CONTROL — see the header. No overlay seen means the sampler never ran or the
// flow never logged in, and every zero below it would be a lie.
if (ledger.verdict.overlaysObserved === 0) {
  console.error('\nPROBE BROKEN: no overlay was ever observed. Nothing below this is evidence.');
  process.exit(2);
}
