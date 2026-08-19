/**
 * OBRS-1437 AC-2 - what the re-consent card does to the geometry
 * `obrs-854-account-deeplink.spec.ts` measures.
 *
 * That spec's PROFILE fixture pinned `pdpaConsentVersion: '1.0'` under a comment saying it
 * was the current version "so the re-consent banner does not sit between the customer and
 * the button". `PRIVACY_POLICY_VERSION` has been '2.3' since 2026-08-09, so the card WAS
 * sitting there and the spec stayed green anyway. Green is not evidence that the card is
 * harmless: it is evidence that nothing in the spec looked.
 *
 * So look. This runs the spec's own flow twice against the same `gate` build - once with the
 * stale fixture value and once with the real one - and reports, per arm:
 *
 *   reconsentCards   - is the card on the page at all (data-testid="reconsent-notice")
 *   docScrollMax     - how far the document can scroll: the quantity the card changes
 *   buttonBox        - the 390px reachability assertion's own inputs (x, x+width, height)
 *   solvedOverlap    - the scroll offset the spec SOLVES for to put the button's centre in
 *                      the middle of the consent bar, and whether the document can reach it
 *   hitAtOverlap     - who receives the tap there (the spec asserts 'consent-banner')
 *   hitAtBottom      - who receives it at max scroll (the spec asserts 'close-account-open')
 *
 * The two hit-tests are the assertions this card has to keep honest: if removing the card
 * shortens the page enough that the solved offset is clamped away, the first one would be
 * passing for a reason nobody chose. This says which world we are in with numbers instead.
 *
 * Usage (needs `npx ng serve --configuration gate --port 4231` already up):
 *   node e2e/probe-obrs-1437-reconsent-geometry.mjs
 *   BASE_URL=http://localhost:4231 OUT_DIR=... node e2e/probe-obrs-1437-reconsent-geometry.mjs
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:4231';
// Under `e2e/out/`, which .gitignore already covers: the script is committed, its output is
// attached to the card instead.
const OUT = process.env.OUT_DIR || path.resolve('e2e/out/obrs-1437');

fs.mkdirSync(OUT, { recursive: true });

/**
 * Read the shipped version off the same file the app imports, rather than typing '2.3' here -
 * a second hardcoded copy is the defect this card is about.
 */
function shippedVersion() {
  const src = fs.readFileSync(
    path.resolve('src/app/modules/privacy-policy/privacy-policy.version.ts'),
    'utf8'
  );
  const m = /PRIVACY_POLICY_VERSION\s*=\s*'([^']+)'/.exec(src);
  if (!m) throw new Error('PRIVACY_POLICY_VERSION not found - the probe cannot report anything');
  return m[1];
}

const EMAIL = 'counter-deletion@example.test';
const PASSWORD = 'gate-probe';
const ok = (data) => ({ code: 200, message: 'OK', data });

const profileFor = (version) => ({
  id: 4242,
  title: 'MR',
  firstName: 'Somchai',
  middleName: null,
  lastName: 'Counter',
  email: EMAIL,
  phoneNumber: '0812345678',
  preferredLocale: 'th',
  pdpaConsentVersion: version,
});

const loginResponse = (profile) =>
  ok({
    accessToken: 'gate-probe-token',
    tokenType: 'Bearer',
    expiresIn: 3600,
    user: {
      id: profile.id,
      fullName: 'Somchai Counter',
      email: EMAIL,
      preferredLocale: 'th',
      status: 'active',
      roles: ['customer'],
    },
  });

/** OBRS-1436: the loading overlay outlives `Swal.close()`, and it takes hit-tests. */
async function waitForNoOverlay(page) {
  await page
    .waitForFunction(() => document.querySelectorAll('.swal2-container').length === 0, null, {
      timeout: 5_000,
    })
    .catch(() => undefined);
}

/** The spec's `hitAtCentre`, kept to the same shape so the two report the same thing. */
async function hitAtCentre(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="close-account-open"]');
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (!top) return '<nothing: the centre is outside the viewport>';
    const testid = top.getAttribute('data-testid');
    return `${top.tagName.toLowerCase()}.${top.className}${testid ? `[${testid}]` : ''}`;
  });
}

async function runArm(browser, { label, version, consent }) {
  const profile = profileFor(version);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const record = { label, pdpaConsentVersion: version, consent, error: null };

  await page.addInitScript(
    ({ consentDecision }) => {
      localStorage.setItem('app_language', 'th');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_username');
      localStorage.removeItem('auth_roles');
      if (consentDecision === 'unset') {
        localStorage.removeItem('obrs_analytics_consent_v1');
      } else {
        localStorage.setItem('obrs_analytics_consent_v1', consentDecision);
      }
    },
    { consentDecision: consent }
  );

  await page.route('https://accounts.google.com/**', (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('/api/auth/login')
      ? loginResponse(profile)
      : url.pathname.endsWith('/api/private/users/me')
        ? ok(profile)
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
    await waitForNoOverlay(page);

    record.reconsentCards = await page.locator('[data-testid="reconsent-notice"]').count();

    await page.screenshot({
      path: path.join(OUT, `OBRS-1437-${label}-account-390px.png`),
      fullPage: true,
    });

    record.geometry = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="close-account-open"]');
      el.scrollIntoView({ block: 'center' });
      const doc = document.documentElement;
      const r = el.getBoundingClientRect();
      const bar = document.querySelector('.consent-banner')?.getBoundingClientRect() ?? null;
      const max = Math.round(doc.scrollHeight - doc.clientHeight);
      const centre = window.scrollY + r.y + r.height / 2;
      const solved = bar === null ? null : Math.round(centre - (bar.y + bar.height / 2));
      return {
        docScrollHeight: doc.scrollHeight,
        docClientHeight: doc.clientHeight,
        docScrollMax: max,
        buttonBox: {
          x: Math.round(r.x),
          right: Math.round(r.x + r.width),
          height: Math.round(r.height),
        },
        barPresent: bar !== null,
        solvedOverlap: solved,
        // What the spec actually scrolls to after clamping - the number that decides
        // whether its "the bar covers the button" assertion is asking anything.
        clampedOverlap: solved === null ? null : Math.min(Math.max(solved, 0), max),
      };
    });

    if (record.geometry.barPresent) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), record.geometry.clampedOverlap);
      await page.waitForTimeout(100);
      record.hitAtOverlap = await hitAtCentre(page);
    }

    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), record.geometry.docScrollMax);
    await page.waitForTimeout(100);
    record.hitAtBottom = await hitAtCentre(page);
  } catch (e) {
    record.error = String(e).slice(0, 300);
  }

  await ctx.close();
  return record;
}

const CURRENT = shippedVersion();
const browser = await chromium.launch();
const ledger = { base: BASE, shippedPolicyVersion: CURRENT, arms: [] };

for (const arm of [
  // The spec's own two consent arms, each run on the stale fixture and on the real version.
  { label: 'BEFORE-stale-1.0-consent-unset', version: '1.0', consent: 'unset' },
  { label: 'AFTER-current-consent-unset', version: CURRENT, consent: 'unset' },
  { label: 'BEFORE-stale-1.0-consent-denied', version: '1.0', consent: 'denied' },
  { label: 'AFTER-current-consent-denied', version: CURRENT, consent: 'denied' },
]) {
  const r = await runArm(browser, arm);
  ledger.arms.push(r);
  console.log(
    `${r.label}: ${
      r.error
        ? 'ERROR ' + r.error
        : `cards=${r.reconsentCards} scrollMax=${r.geometry.docScrollMax} solved=${r.geometry.solvedOverlap} clamped=${r.geometry.clampedOverlap} hitAtOverlap=${r.hitAtOverlap ?? '(no bar)'} hitAtBottom=${r.hitAtBottom}`
    }`
  );
}
await browser.close();

const jsonPath = path.join(OUT, 'obrs-1437-reconsent-geometry.json');
fs.writeFileSync(jsonPath, JSON.stringify(ledger, null, 2));
console.log('\nwrote ' + jsonPath);

// POSITIVE CONTROL. If the stale arm does not show the card, this probe is measuring
// something other than what the card is about and every number above it is noise.
const stale = ledger.arms.find((a) => a.label === 'BEFORE-stale-1.0-consent-unset');
const current = ledger.arms.find((a) => a.label === 'AFTER-current-consent-unset');
if (!stale || stale.reconsentCards !== 1 || !current || current.reconsentCards !== 0) {
  console.error(
    `\nPROBE BROKEN: expected the stale arm to render exactly 1 re-consent card and the current arm 0; got ${stale?.reconsentCards} and ${current?.reconsentCards}.`
  );
  process.exit(2);
}
