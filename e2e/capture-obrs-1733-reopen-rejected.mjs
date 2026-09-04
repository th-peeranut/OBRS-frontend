/**
 * OBRS-1733 — what the admin detail modal offers on a `rejected` usability report, read
 * off a live browser, on one `ng serve`, run twice with nothing changed but the one line
 * under test:
 *
 *   npx ng serve --port 4733
 *   node e2e/capture-obrs-1733-reopen-rejected.mjs --label before   # ALLOWED_TARGETS.rejected = []
 *   node e2e/capture-obrs-1733-reopen-rejected.mjs --label after    # ALLOWED_TARGETS.rejected = ['in_review']
 *
 * WHY EVERY /api CALL IS STUBBED
 * The thing under test is a client-side option list (ALLOWED_TARGETS -> detailStatusValuesFor),
 * which no backend can make more or less true. `AuthGuard` checks `isAuthenticated()`
 * (`!!getToken()`) and `hasAnyRole()` off localStorage, so both are seeded here and every
 * `/api/**` is answered locally. That also means this capture needs no credential of any
 * kind and touches no shared environment — the same reason capture-obrs-1703 stubs.
 *
 * WHY A `resolved` REPORT IS IN THE FRAME TOO
 * It is the CONTROL. OBRS-1474 already opened `resolved -> in_review`, so that arm must read
 * IDENTICALLY in before and after. If it moves, the change was not surgical.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.OBRS_BASE_URL ?? 'http://localhost:4733';
const OUT = path.resolve(
  '..', 'obrs-agent-office', '.claude', 'agent-office', 'scripts', 'captures', 'obrs-1733'
);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 || !process.argv[i + 1] ? fallback : process.argv[i + 1];
};
const LABEL = arg('--label', null);
if (LABEL !== 'before' && LABEL !== 'after') {
  throw new Error('--label <before|after> is required - an unlabelled pair proves nothing');
}

const ok = (data) => ({ code: 200, message: 'OK', data });

const baseReport = (id, status) => ({
  id,
  category: 'bug',
  status,
  userId: null,
  userName: null,
  reporterEmail: null,
  description:
    'OBRS-1733 fixture. Mirrors prod report #1: anonymous, no reporter email, three images.',
  descriptionPreview: 'OBRS-1733 fixture. Mirrors prod report #1...',
  routeUrl: '/',
  userAgent: 'Mozilla/5.0 (fixture)',
  imageCount: 0,
  images: [],
  createdAt: '2026-08-13T10:16:32.947139+07:00',
  updatedAt: '2026-09-04T22:14:07.559384+07:00',
  triageNote: null,
  triagedBy: 1,
  triagedByName: 'Admin Admin',
  triagedAt: '2026-09-04T22:14:07.544408+07:00',
  jiraIssueKey: 'OBRS-1409',
  reporterNotifiedAt: null,
  duplicateOfId: null,
  duplicateCount: 0,
  followUps: [],
});

const REPORTS = [baseReport(13, 'rejected'), baseReport(12, 'resolved')];

const PAGE = {
  content: REPORTS.map((r) => ({
    id: r.id,
    category: r.category,
    status: r.status,
    userId: r.userId,
    userName: r.userName,
    descriptionPreview: r.descriptionPreview,
    imageCount: r.imageCount,
    createdAt: r.createdAt,
    duplicateOfId: r.duplicateOfId,
    duplicateCount: r.duplicateCount,
  })),
  totalElements: REPORTS.length,
  totalPages: 1,
  size: 20,
  number: 0,
  numberOfElements: REPORTS.length,
};

async function stub(page) {
  await page.addInitScript(() => {
    localStorage.setItem('app_language', 'th');
    localStorage.setItem('auth_token', 'obrs-1733-capture-token');
    localStorage.setItem('auth_username', 'admin@system.local');
    localStorage.setItem('auth_roles', JSON.stringify(['admin']));
  });
  await page.route('**/api/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    const send = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(data)) });
    // `/count` first: it would otherwise be eaten by the `/\d+$` detail rule below.
    if (/\/usability-reports\/count$/.test(p)) return send(0);
    if (/\/usability-reports\/(\d+)$/.test(p)) {
      const id = Number(p.match(/(\d+)$/)[1]);
      return send(REPORTS.find((r) => r.id === id) ?? REPORTS[0]);
    }
    if (/\/usability-reports$/.test(p)) return send(PAGE);
    return send([]);
  });
  await page.route('**/accounts.google.com/**', (route) => route.abort());
  await page.route('**/maps.googleapis.com/**', (route) => route.abort());
}

/**
 * What the modal actually offers. `detailStatusOptions.length` gates TWO mutually exclusive
 * blocks in the template (component.html:459 vs :517), so "no dropdown" is a rendered state
 * with its own copy, not an absence — read both.
 */
const readOffer = (page) =>
  page.evaluate(() => {
    const box = document.querySelector('.ur-detail-modal .ur-status-update');
    const dd = box?.querySelector('app-admin-dropdown') ?? null;
    return {
      statusBlockRendered: !!box,
      hasDropdown: !!dd,
      noActionNote: box?.querySelector('.ur-dismissed-note')?.textContent?.trim() ?? null,
      dropdownText: dd?.textContent?.trim() ?? null,
      // The open list, when there is one.
      options: Array.from(document.querySelectorAll('.admin-dropdown-panel li, .admin-dropdown-option, [role="option"]'))
        .map((el) => el.textContent.trim())
        .filter(Boolean),
      // Where the option list actually LANDS. The first two runs of this script wrote a
      // byte-identical before/after pair while `options` differed, so the frame was wrong,
      // not the code: measure the box instead of guessing at it.
      optionRects: Array.from(document.querySelectorAll('.admin-dropdown-panel li, .admin-dropdown-option, [role="option"]'))
        .map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }),
      dropdownRect: dd ? (() => { const r = dd.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() : null,
      viewport: { w: window.innerWidth, h: window.innerHeight, scrollY: window.scrollY },
    };
  });

async function openReport(page, index) {
  await page.locator('.ur-actions-cell button.admin-btn-small').nth(index).click();
  await page.locator('.ur-detail-modal').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(400);
}

/** The status block alone: the control plus its Save button, tight enough to read. */
async function shootStatusBlock(page, file) {
  const box = await page.locator('.ur-detail-modal .ur-status-update').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: r.width + 32, height: r.height + 32 };
  });
  await page.screenshot({ path: file, clip: box });
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const results = { label: LABEL, base: BASE, arms: {} };

for (const [name, index] of [['rejected', 0], ['resolved', 1]]) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1400 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  // `ng serve` builds lazy routes on first request; the default 30s navigation timeout
  // expires on a cold /admin chunk long before anything is wrong with the page.
  page.setDefaultNavigationTimeout(180000);
  await stub(page);
  await page.goto(`${BASE}/admin/usability-reports`);
  await page.locator('.ur-actions-cell button.admin-btn-small').first().waitFor({ state: 'visible', timeout: 60000 });
  await openReport(page, index);

  const closed = await readOffer(page);
  if (closed.hasDropdown) {
    await page.locator('.ur-detail-modal app-admin-dropdown').scrollIntoViewIfNeeded();
    await page.locator('.ur-detail-modal app-admin-dropdown').click();
    await page.waitForTimeout(1500);
  }
  const opened = await readOffer(page);

  // THE FRAME THAT ACTUALLY SHOWS THE CHANGE.
  // The open option panel is laid out BELOW the modal's own box and clipped by its
  // overflow (true of the `resolved` control too, so it predates this card) - three runs
  // of this script wrote a byte-identical pair because of it. What is both visible and
  // decisive is the value left sitting in the closed control after picking the reopen:
  // in `before` that option does not exist to pick, so the control still reads its own
  // terminal status.
  const REOPEN = 'กำลังตรวจสอบ'; // 'in_review' in Thai
  const reopenOption = page
    .locator('.admin-dropdown-panel li, .admin-dropdown-option, [role="option"]')
    .filter({ hasText: REOPEN });
  const reopenOffered = (await reopenOption.count()) > 0;
  if (reopenOffered) {
    await reopenOption.first().click();
    await page.waitForTimeout(600);
  }
  const picked = await page.locator('.ur-detail-modal .ur-status-update').innerText();
  await shootStatusBlock(page, path.join(OUT, `${LABEL}-${name}.png`));
  results.arms[name] = { closed, opened, reopenOffered, picked };
  await ctx.close();
}

await browser.close();
await writeFile(path.join(OUT, `result-${LABEL}.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

// A modal that rendered no status block at all reads exactly like one that is fine, so refuse it.
for (const [name, arm] of Object.entries(results.arms)) {
  if (!arm.closed.statusBlockRendered) {
    console.error(`FAIL: the ${name} arm rendered no .ur-status-update - the run proves nothing`);
    process.exit(2);
  }
}
// The control must not move.
if (!results.arms.resolved.closed.hasDropdown) {
  console.error('FAIL: the resolved CONTROL lost its dropdown - the change was not surgical');
  process.exit(1);
}
console.log(`OK (${LABEL}): rejected hasDropdown=${results.arms.rejected.closed.hasDropdown}, resolved hasDropdown=${results.arms.resolved.closed.hasDropdown}`);
