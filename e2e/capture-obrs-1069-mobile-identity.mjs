/**
 * OBRS-1069 visual + measured evidence — "who am I logged in as" in the ≤992px navbar.
 *
 * The bug: the only user indicator on the public navbar is the avatar initials,
 * which live inside `.button-container.navbar-desktop-only` — a block that
 * `@media (max-width: 992px)` hides with `display: none !important`. The mobile
 * slide-down panel carries every link but no name, email, initials or avatar.
 *
 * Run against a dev server pointed at the SIT backend (`ng serve --configuration sit`),
 * because the identity being shown is a REAL logged-in account, not a fixture:
 *
 *   npx ng serve --configuration sit --port 4315      # separate terminal
 *   OBRS_BASE_URL=http://localhost:4315 SIT_PASSWORD='…' \
 *     node e2e/capture-obrs-1069-mobile-identity.mjs --label before
 *
 * Beyond the PNGs the script PRINTS what it measured — the panel's full text,
 * whether the login email literally appears in it, and the measured
 * foreground/background RGB + contrast ratio in BOTH themes. A screenshot only
 * proves something to whoever squints at it; the printed numbers are checkable
 * (CORE.md: measure, don't eyeball).
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4200';
const EMAIL = process.env.SIT_CUSTOMER_EMAIL ?? 'customer@system.local';
const PASSWORD = process.env.SIT_PASSWORD;
const OUT = path.resolve('e2e/out/obrs-1069');

// Tablet portrait — the width the owner reported from, and ≤992px so the
// desktop block is hidden. 1536x864 is the desktop control (the user's real
// desktop, see verify-visuals-by-measurement).
const MOBILE = { width: 768, height: 1024 };
const DESKTOP = { width: 1536, height: 864 };

const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error('--label <before|after> is required — an unlabelled pair proves nothing');
  }
  return process.argv[i + 1];
})();

if (!PASSWORD) {
  throw new Error('SIT_PASSWORD is not set; refusing to guess (the account locks after 5 tries)');
}
if (PASSWORD.length !== 8) {
  throw new Error(
    `SIT_PASSWORD is ${PASSWORD.length} characters; the SIT login password is 8. ` +
      'This is almost certainly the DB password, which would burn a login attempt for nothing.'
  );
}

async function shoot(page, name) {
  const file = path.join(OUT, `${LABEL}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  shot: ${file}`);
}

/** Open the ≤992px slide-down panel and return its locator. */
async function openMobilePanel(page) {
  const hamburger = page.locator('.navbar-hamburger');
  await hamburger.waitFor({ timeout: 30_000 });
  if ((await page.locator('#navbar-mobile-panel').count()) === 0) {
    await hamburger.click();
  }
  const panel = page.locator('#navbar-mobile-panel');
  await panel.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(250);
  return panel;
}

/**
 * Effective colour of an element: its own `color`, and the first ancestor
 * background that is not transparent. Reading `background-color` off the text
 * node alone returns rgba(0,0,0,0) and would make every contrast ratio a lie.
 */
const MEASURE_COLOURS = (el) => {
  const parse = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
  const fg = getComputedStyle(el).color;
  let node = el;
  let bg = 'rgba(0, 0, 0, 0)';
  while (node) {
    const c = getComputedStyle(node).backgroundColor;
    const p = parse(c);
    if (p.length >= 3 && (p.length < 4 || p[3] > 0)) {
      bg = c;
      break;
    }
    node = node.parentElement;
  }
  const lum = (c) => {
    const [r, g, b] = parse(c)
      .slice(0, 3)
      .map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = lum(fg);
  const l2 = lum(bg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return {
    fg,
    bg,
    contrast: Math.round(ratio * 100) / 100,
    fontSize: getComputedStyle(el).fontSize,
    fontWeight: getComputedStyle(el).fontWeight,
  };
};

/** What the panel actually says, and whether the email is literally in it. */
async function describePanel(page, when, expectEmail) {
  const panel = page.locator('#navbar-mobile-panel');
  const text = (await panel.innerText()).replace(/\s+/g, ' ').trim();
  const hasEmail = text.includes(EMAIL);
  const identity = panel.locator('.navbar-mobile-identity');
  const identityCount = await identity.count();

  console.log(`\n[${when}]`);
  console.log(`  panel text     : ${text}`);
  console.log(`  identity block : ${identityCount} element(s) matching .navbar-mobile-identity`);
  console.log(
    `  email "${EMAIL}" in panel text: ${hasEmail ? 'YES' : 'NO'}` +
      (expectEmail === undefined ? '' : hasEmail === expectEmail ? '  ✔ as expected' : '  ✘ UNEXPECTED')
  );

  if (identityCount > 0) {
    const emailEl = identity.locator('.navbar-mobile-identity-email');
    if ((await emailEl.count()) > 0) {
      const colours = await emailEl.first().evaluate(MEASURE_COLOURS);
      console.log(
        `  email element  : text="${(await emailEl.first().innerText()).trim()}" ` +
          `fg=${colours.fg} bg=${colours.bg} contrast=${colours.contrast}:1 ` +
          `size=${colours.fontSize} weight=${colours.fontWeight} ` +
          `→ ${colours.contrast >= 4.5 ? 'PASS AA (>=4.5)' : 'FAIL AA'}`
      );
    }
    const labelEl = identity.locator('.navbar-mobile-identity-label');
    if ((await labelEl.count()) > 0) {
      const colours = await labelEl.first().evaluate(MEASURE_COLOURS);
      console.log(
        `  label element  : text="${(await labelEl.first().innerText()).trim()}" ` +
          `fg=${colours.fg} bg=${colours.bg} contrast=${colours.contrast}:1 ` +
          `→ ${colours.contrast >= 4.5 ? 'PASS AA (>=4.5)' : 'contrast below 4.5 (label is secondary text)'}`
      );
    }

    // AC1: the identity block must sit ABOVE the menu links, not below them.
    const order = await panel.evaluate((p) => {
      const id = p.querySelector('.navbar-mobile-identity');
      const firstLink = p.querySelector('.navbar-mobile-link');
      if (!id || !firstLink) return null;
      return {
        identityTop: Math.round(id.getBoundingClientRect().top),
        firstLinkTop: Math.round(firstLink.getBoundingClientRect().top),
      };
    });
    if (order) {
      console.log(
        `  vertical order : identity top=${order.identityTop}px, first menu link top=${order.firstLinkTop}px ` +
          `→ ${order.identityTop < order.firstLinkTop ? 'ABOVE the menu ✔' : 'BELOW the menu ✘'}`
      );
    }
  }
  return { text, hasEmail, identityCount };
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 60_000 });
  console.log(`logged in as ${EMAIL} → landed on ${new URL(page.url()).pathname}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: MOBILE });
const page = await context.newPage();

await mkdir(OUT, { recursive: true });
console.log(`base=${BASE} label=${LABEL} viewport=${MOBILE.width}x${MOBILE.height}`);

// ── 1. Logged OUT control (AC2: no identity block, sign-in/register intact) ──
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await openMobilePanel(page);
const out = await describePanel(page, 'logged out — ≤992px panel', false);
const signIn = await page.locator('#navbar-mobile-panel a[href="/login"]').count();
const signUp = await page.locator('#navbar-mobile-panel a[href="/register"]').count();
console.log(`  auth links     : login=${signIn} register=${signUp} → ${signIn === 1 && signUp === 1 ? 'both present ✔' : 'MISSING ✘'}`);
await shoot(page, '01-logged-out-panel');

// ── 2. Logged IN, light theme (AC1) ─────────────────────────────────────────
await login(page);
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await openMobilePanel(page);
const light = await describePanel(page, 'logged in — ≤992px panel, LIGHT', true);
await shoot(page, '02-logged-in-panel-light');

// ── 3. Logged IN, dark theme (AC6) ──────────────────────────────────────────
const toggle = page.locator('#navbar-mobile-panel app-theme-toggle button').first();
await toggle.click();
await page.waitForTimeout(400);
const themeAttr = await page.evaluate(() => ({
  html: document.documentElement.className,
  body: document.body.className,
  data: document.documentElement.getAttribute('data-theme'),
}));
console.log(`\n  theme after toggle: html="${themeAttr.html}" body="${themeAttr.body}" data-theme=${themeAttr.data}`);
const dark = await describePanel(page, 'logged in — ≤992px panel, DARK', true);
await shoot(page, '03-logged-in-panel-dark');

// Back to light so the next run starts clean.
await toggle.click();
await page.waitForTimeout(300);

// ── 3a. A long address must wrap, not widen the page ────────────────────────
// The seed logins are short; a real customer address is not. The claim
// `overflow-wrap: anywhere` makes is about the page, so measure the page.
const overflow = await page.evaluate(() => {
  const el = document.querySelector('.navbar-mobile-identity-email');
  if (!el) return null;
  const original = el.textContent;
  el.textContent = 'a.very.long.customer.address.for.testing@subdomain.example.co.th';
  const r = {
    docScroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    panelScroll: document.querySelector('#navbar-mobile-panel').scrollWidth,
    panelClient: document.querySelector('#navbar-mobile-panel').clientWidth,
  };
  el.textContent = original;
  return r;
});
if (overflow) {
  console.log(`\n[long address — 64 chars]`);
  console.log(
    `  document ${overflow.docScroll}px in ${overflow.viewport}px viewport, ` +
      `panel ${overflow.panelScroll}px in ${overflow.panelClient}px → ` +
      (overflow.docScroll <= overflow.viewport ? 'wraps, no horizontal scroll ✔' : 'PAGE OVERFLOWS ✘')
  );
}

// ── 3b. LIVE language switch, no reload (AC5) ───────────────────────────────
// A cold load with the language pre-set and an in-app switch are different code
// paths; a fix verified only on the first can silently miss the second
// (gis-button-locale-script-src-only). The label is a `| translate` pipe, so it
// must re-render in place — and the email must NOT be translated away with it.
const langLabelBefore = await page.locator('.navbar-mobile-identity-label').innerText().catch(() => '(absent)');
await page.locator('#navbar-mobile-panel .navbar-lang-trigger').click();
await page.waitForTimeout(200);
await page.locator('#navbar-mobile-panel .navbar-lang-item', { hasText: 'English' }).first().click();
await page.waitForTimeout(500);
const langLabelAfter = await page.locator('.navbar-mobile-identity-label').innerText().catch(() => '(absent)');
const emailAfterSwitch = await page.locator('.navbar-mobile-identity-email').innerText().catch(() => '(absent)');
console.log(`\n[live language switch — no reload]`);
console.log(`  label th → en  : "${langLabelBefore.trim()}" → "${langLabelAfter.trim()}" ` +
  `→ ${langLabelBefore.trim() !== langLabelAfter.trim() ? 'RE-TRANSLATED ✔' : 'UNCHANGED ✘'}`);
console.log(`  email          : "${emailAfterSwitch.trim()}" ` +
  `→ ${emailAfterSwitch.trim() === EMAIL ? 'still the real address ✔' : 'CHANGED ✘'}`);
await shoot(page, '03b-lang-switch-en');

// ── 4. Desktop control (AC3: avatar untouched, still inside desktop-only) ───
await page.setViewportSize(DESKTOP);
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('.navbar-container').waitFor({ timeout: 30_000 });
await page.waitForTimeout(400);
const desktop = await page.evaluate(() => {
  const avatar = document.querySelector('.navbar-avatar');
  const wrapper = avatar?.closest('.navbar-desktop-only');
  const identityOnDesktop = document.querySelector('.navbar-mobile-identity');
  return {
    avatarPresent: !!avatar,
    avatarText: avatar?.textContent?.trim() ?? null,
    insideDesktopOnly: !!wrapper,
    avatarVisible: avatar ? getComputedStyle(avatar).display !== 'none' && avatar.getBoundingClientRect().width > 0 : false,
    identityVisibleOnDesktop: identityOnDesktop
      ? getComputedStyle(identityOnDesktop).display !== 'none' && identityOnDesktop.getBoundingClientRect().height > 0
      : false,
  };
});
console.log(`\n[desktop control — ${DESKTOP.width}px]`);
console.log(
  `  avatar         : present=${desktop.avatarPresent} text="${desktop.avatarText}" ` +
    `insideDesktopOnly=${desktop.insideDesktopOnly} visible=${desktop.avatarVisible}`
);
console.log(`  mobile identity leaking onto desktop: ${desktop.identityVisibleOnDesktop ? 'YES ✘' : 'no ✔'}`);
await shoot(page, '04-desktop-control');

// ── 5. Phone width (the card's "worse on mobile" half) ──────────────────────
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await openMobilePanel(page);
const phone = await describePanel(page, 'logged in — 390px phone', true);
const phoneOverflow = await page.evaluate(() => ({
  docScroll: document.documentElement.scrollWidth,
  viewport: window.innerWidth,
}));
console.log(
  `  page width     : document ${phoneOverflow.docScroll}px in ${phoneOverflow.viewport}px → ` +
    (phoneOverflow.docScroll <= phoneOverflow.viewport ? 'no horizontal scroll ✔' : 'OVERFLOWS ✘')
);
await shoot(page, '05-phone-390');

console.log('\n── summary ──');
console.log(`logged-out identity block : ${out.identityCount} (must be 0)`);
console.log(`logged-in email in panel  : light=${light.hasEmail} dark=${dark.hasEmail} (must be true after the fix)`);
console.log(`desktop avatar untouched  : ${desktop.avatarPresent && desktop.insideDesktopOnly && desktop.avatarVisible}`);

await browser.close();
