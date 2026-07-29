// Standalone before/after capture for OBRS-847 (not part of the Playwright suite).
//
// WHAT IS BEING PHOTOGRAPHED, AND WHY IT NEEDS A REAL LOGIN.
//
// The card is one question: does the role filter on /admin/users still offer an
// OWNER two options that can never match a row? The answer depends on two live
// inputs -- the role list `GET /api/private/roles` returns (every role in the
// table, ungated) and the RAW role the logged-in user holds. A stubbed capture
// would be photographing my own fixture, so this logs in for real against SIT
// as owner@system.local and again as admin@system.local, in separate browser
// CONTEXTS (a new page shares the JWT; a new context does not).
//
// BEFORE and AFTER serve in parallel on two ports from two worktrees, so the
// only difference between the images is the commit -- SIT CORS reflects any
// localhost origin, which is what makes that possible.
//
// Nothing here is composed: the dropdown is opened by clicking its real
// trigger, never by writing a class. The option list in each shot is the list
// the page actually rendered.
//
// Usage:
//   # in the feature worktree:  npx ng serve --configuration sit --port 4310
//   # in an origin/dev worktree: npx ng serve --configuration sit --port 4410
//   node e2e/scripts/capture-obrs847.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const AFTER_BASE = process.env.CAPTURE_AFTER || 'http://localhost:4310';
const BEFORE_BASE = process.env.CAPTURE_BEFORE || 'http://localhost:4410';
const PASSWORD = process.env.SIT_PASSWORD || 'P@ssw0rd';
const OUT_DIR =
  process.env.CAPTURE_OUT ||
  path.resolve(__dirname, '..', '..', 'docs', 'manual-tests', 'assets', 'OBRS-847');
fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORT = { width: 1500, height: 900 };

async function login(context, base, email) {
  const page = await context.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('.login-btn');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 });
  return page;
}

// Reads the option labels straight out of the open menu, and resolves them back
// to SLUGS using the live /roles payload the page itself was handed. Matching on
// hardcoded Thai would be a second source of truth that decays: SIT currently
// answers "เจ้าของ" where the i18n bundle says "เจ้าของกิจการ", and the filter
// options are built from the payload, not from the bundle.
async function openRoleFilter(page) {
  const rolesResponse = page.waitForResponse(
    (r) => /\/api\/private\/roles(\?|$)/.test(r.url()) && r.status() === 200,
    { timeout: 60000 }
  );
  await page.goto(`${page.url().split('/admin')[0]}/admin/users`, { waitUntil: 'networkidle' });
  const rolesPayload = (await (await rolesResponse).json()).data;
  // Real rows first: the options are derived from the same payload, so a shot
  // taken before the store resolves would photograph an empty dropdown.
  await page.waitForSelector('app-user-list-table tbody tr', { timeout: 60000 });

  const filters = page.locator('app-admin-dropdown');
  const roleFilter = filters.nth(0);
  await roleFilter.locator('.admin-dropdown-trigger').click();
  await page.waitForSelector('.admin-dropdown-menu', { timeout: 10000 });

  const labels = (
    await roleFilter
      .locator('.admin-dropdown-menu .admin-dropdown-option span:first-child')
      .allTextContents()
  )
    .map((l) => l.trim())
    .filter(Boolean);

  // label -> slug, straight from the payload. The first option is the
  // placeholder ("ทุกบทบาท"), which maps to nothing and is dropped.
  const bySlug = new Map();
  for (const role of rolesPayload) {
    const tr = role.translations || {};
    const label = role.name ?? tr.th?.label ?? tr.en?.label ?? role.slug;
    bySlug.set(String(label).trim(), role.slug);
  }
  const slugs = labels.map((l) => bySlug.get(l)).filter(Boolean);
  if (slugs.length === 0) {
    throw new Error(`no rendered option matched the /roles payload; rendered: [${labels}]`);
  }

  return { roleFilter, labels, slugs };
}

// The first version of this shot used `.admin-page-filters`.screenshot() and
// every assertion still passed -- because the menu is positioned OUTSIDE that
// container, so the saved image showed a filter bar with the option list sliced
// off one row below the trigger. A capture cannot see its own output: shoot a
// clip built from the UNION of the bar and the open menu, and refuse to save
// unless the menu really is inside it.
async function shoot(page, roleFilter, file, expectedOptions) {
  // Contamination check (a global HTTP-error swal over a correct page reads as
  // a broken feature on the card).
  const swals = await page.locator('.swal2-popup').count();
  if (swals > 0) throw new Error(`refusing to save ${file}: ${swals} swal overlay(s) on screen`);

  const bar = await page.locator('.admin-page-filters').boundingBox();
  const menu = await roleFilter.locator('.admin-dropdown-menu').boundingBox();
  if (!bar || !menu) throw new Error(`refusing to save ${file}: filter bar or menu has no box`);

  const PAD = 12;
  const clip = {
    x: Math.max(0, Math.min(bar.x, menu.x) - PAD),
    y: Math.max(0, Math.min(bar.y, menu.y) - PAD),
    width: Math.max(bar.x + bar.width, menu.x + menu.width) - Math.min(bar.x, menu.x) + PAD * 2,
    height: Math.max(bar.y + bar.height, menu.y + menu.height) - Math.min(bar.y, menu.y) + PAD * 2,
  };
  // Playwright does not scroll-and-stitch: anything below the fold comes back
  // unpainted white. Grow the window rather than scrolling to it.
  const needed = Math.ceil(clip.y + clip.height) + 40;
  if (needed > page.viewportSize().height) {
    await page.setViewportSize({ width: VIEWPORT.width, height: needed });
  }
  if (clip.y + clip.height <= menu.y + menu.height) {
    throw new Error(`refusing to save ${file}: clip does not reach the bottom of the menu`);
  }

  const rendered = await roleFilter.locator('.admin-dropdown-menu .admin-dropdown-option').count();
  if (rendered !== expectedOptions) {
    throw new Error(
      `refusing to save ${file}: menu shows ${rendered} options, expected ${expectedOptions}`
    );
  }

  const target = path.join(OUT_DIR, file);
  await page.screenshot({ path: target, clip });
  console.log(`  saved ${file} (clip ${Math.round(clip.width)}x${Math.round(clip.height)}, ${rendered} options)`);
}

async function capture(browser, base, email, file, label) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await login(context, base, email);
  const { roleFilter, labels, slugs } = await openRoleFilter(page);
  console.log(`${label}: rendered [${labels.join(', ')}] -> slugs [${slugs.join(', ')}]`);
  await shoot(page, roleFilter, file, labels.length);
  await context.close();
  return slugs;
}

(async () => {
  const browser = await chromium.launch();
  try {
    const beforeOwner = await capture(
      browser, BEFORE_BASE, 'owner@system.local',
      'OBRS-847-BEFORE-owner-role-filter.png', 'BEFORE owner'
    );
    const afterOwner = await capture(
      browser, AFTER_BASE, 'owner@system.local',
      'OBRS-847-AFTER-owner-role-filter.png', 'AFTER  owner'
    );
    const afterAdmin = await capture(
      browser, AFTER_BASE, 'admin@system.local',
      'OBRS-847-AFTER-admin-role-filter.png', 'AFTER  admin'
    );

    // The verdict, printed as data rather than left to the eye. Both directions:
    // an over-eager filter that also dropped the staff roles would make the
    // dropdown useless, which is the failure the "still offers" lines catch.
    console.log('\n--- verdict ---');
    console.log(`BEFORE owner : ${beforeOwner.join(', ')}`);
    console.log(`AFTER  owner : ${afterOwner.join(', ')}`);
    console.log(`AFTER  admin : ${afterAdmin.join(', ')}`);
    const line = (name, ok) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    line('BEFORE owner DID offer customer + admin (the defect)',
      beforeOwner.includes('customer') && beforeOwner.includes('admin'));
    line('AFTER  owner offers neither customer nor admin',
      !afterOwner.includes('customer') && !afterOwner.includes('admin'));
    line('AFTER  owner still offers owner + salesperson + driver',
      ['owner', 'salesperson', 'driver'].every((s) => afterOwner.includes(s)));
    line('AFTER  admin still offers all five',
      ['owner', 'salesperson', 'driver', 'customer', 'admin'].every((s) => afterAdmin.includes(s)));
  } finally {
    await browser.close();
  }
})();
