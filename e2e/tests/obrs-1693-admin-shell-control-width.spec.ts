/**
 * OBRS-1704 — the merge gate for OBRS-1693's fix.
 *
 * WHAT REGRESSED AND WHY NOTHING CAUGHT IT
 * `admin-theme.scss` hands `width: auto` to every `input` under `.admin-shell` — with an
 * `!important` on it until OBRS-1703 dropped that, which changes nothing here: Bootstrap's
 * `.form-check-input { width: 1em }` scores (0,1,0) and still loses to the shell's (0,1,1),
 * so the collapse this spec guards is exactly as reachable as it was.
 * A control drawn with `appearance: none` has no intrinsic width, so `auto` collapses it —
 * measured 2x14 px on /staff/parcels/consign and /staff/sell. Every Karma spec on these
 * forms asserts the control's VALUE (`checked`, the form value), and Karma's DOM never
 * loads `admin-theme.scss` at all, so a checkbox whose tick state a clerk physically
 * cannot read passes every unit spec in the repo. Only a real browser with the real
 * stylesheet can see it, and only if something reads `getBoundingClientRect()`.
 *
 * OBRS-1693 bought the width back with `.admin-shell .form-check-input { width: 1em
 * !important }` and shipped its check as `e2e/capture-obrs-1693-admin-shell-controls.mjs`
 * — a root capture script, which by this repo's convention (e2e/lanes.json, the OBRS-1333
 * entry) has no lane and is called by nothing. So deleting that one declaration left CI
 * green across the board. This spec is that guard moved into the lane that runs at merge.
 *
 * WHY THIS ONE CAN BE A GATE WHEN OBRS-1333 COULD NOT
 * lanes.json states the bar in its own words: 1333 is not gateable because "intercepting
 * the API would replace exactly the values under test". Here the value under test is a
 * width the CSS cascade produces, not a number the server derived — a mock destroys
 * nothing, so the lane's hermeticity costs this assertion nothing.
 *
 * WHAT IT REFUSES TO CALL A PASS
 * A checkbox that is ABSENT reads the same as a checkbox that is fine if you only look
 * for "nothing too small". So each surface waits for its own control first and the case
 * fails if the surface yields zero controls.
 */

import { test, expect, Page } from '@playwright/test';
import {
  expectNoEscapedGateCalls,
  seedGateAdminSession,
  stubWalkInSellShell,
} from '../support/gate-admin-session';

/**
 * Bootstrap draws `.form-check-input` at `width: 1em` and the shell pins
 * `font-size: 14px !important`, so the correct render is 14px. The bug rendered 2.
 * 10 sits far from both, so this threshold cannot be met by a near miss either way.
 */
const MIN_PX = 10;

const ok = (data: unknown) => ({ code: 200, message: 'OK', data });

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());

/** One van trip today, on both pages' schedule browser. Nothing here is asserted. */
const WALK_IN_SCHEDULES_RESP = ok([
  {
    routeSlug: 'chonburi_bangkok',
    routeLabel: 'Chonburi - Bangkok',
    trips: [
      {
        scheduleId: 9101,
        vehicleType: 'van',
        licensePlate: 'AB-1234',
        driverName: 'Somchai',
        departureDateTime: `${TODAY}T08:00:00`,
        arrivalDateTime: `${TODAY}T11:00:00`,
        pricePerSeat: '500',
        capacity: 13,
        availableCount: 12,
        reservedUnpaidCount: 0,
        soldPaidCount: 1,
        availableSeatNumbers: ['1', '2', '3', '4', '5', '7', '8', '9', '10', '11', '12', '13'],
        deletable: false,
        confirmedBookingCount: 1,
        seatingMode: 'ASSIGNED',
        normalCapacity: 13,
      },
    ],
  },
]);

const SEGMENTS_RESP = ok({
  route: { slug: 'chonburi_bangkok', name: 'Chonburi - Bangkok' },
  stopPairs: [
    {
      segmentId: 1,
      fromStop: { slug: 'nong_chak', name: 'Nong Chak' },
      toStop: { slug: 'mo_chit', name: 'Mo Chit' },
      vehicleType: { slug: 'van', name: 'Van' },
      fare: '500',
      estimatedDurationMinutes: 180,
    },
  ],
  popularPickupStops: [],
  popularDropoffStops: [],
});

const ROUTE_STOPS_RESP = ok({
  stops: [
    { stopOrder: 1, offsetMinutesFromOrigin: 0, stop: { id: 101, code: 'nong_chak' } },
    { stopOrder: 2, offsetMinutesFromOrigin: 180, stop: { id: 102, code: 'mo_chit' } },
  ],
  defaultPickupStopSlug: 'nong_chak',
});

/** `GET /api/parcel-policy` is PUBLIC, so the lane's `**\/api/private/**` backstop never
 *  sees it — an unstubbed call here reaches a localhost port nothing listens on. */
const PARCEL_POLICY_RESP = ok({
  maxWeightKg: 100,
  carryOnFreeSizeMaxInch: 28,
  carryOnFreeAisleMaxPerTrip: 10,
  prohibitedCategories: ['flammable', 'explosive', 'weapon', 'narcotic', 'corpse'],
});

const SHARE_CONFIG_RESP = ok({ driverPct: 30, salespersonPct: 10, configured: true });

async function stubParcelAndScheduleApis(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.endsWith('/private/schedules/walk-in'),
    (route) => route.fulfill({ json: WALK_IN_SCHEDULES_RESP })
  );
  await page.route(
    (url) => url.pathname.includes('/private/segments/'),
    (route) => route.fulfill({ json: SEGMENTS_RESP })
  );
  await page.route(
    (url) => url.pathname.includes('/private/route-stops/'),
    (route) => route.fulfill({ json: ROUTE_STOPS_RESP })
  );
  await page.route(
    (url) => url.pathname.endsWith('/api/parcel-policy'),
    (route) => route.fulfill({ json: PARCEL_POLICY_RESP })
  );
  await page.route(
    (url) => url.pathname.endsWith('/private/parcels/share-config'),
    (route) => route.fulfill({ json: SHARE_CONFIG_RESP })
  );
}

/** Every `.form-check-input` on screen, with the width the browser actually gave it. */
const readControls = (page: Page) =>
  page.locator('.admin-shell .form-check-input').evaluateAll((nodes) =>
    nodes.map((el) => ({
      id: el.id || null,
      widthPx: Math.round(el.getBoundingClientRect().width),
    }))
  );

async function expectNoCollapsedControls(page: Page, surface: string): Promise<void> {
  const controls = await readControls(page);
  expect(
    controls.length,
    `${surface}: no .form-check-input rendered — the case proves nothing`
  ).toBeGreaterThan(0);
  expect(
    controls.filter((c) => c.widthPx < MIN_PX),
    `${surface}: control(s) render under ${MIN_PX}px wide — measured ${JSON.stringify(controls)}`
  ).toEqual([]);
}

test.describe('OBRS-1693: no .admin-shell control collapses to a hairline', () => {
  test.beforeEach(async ({ page }) => {
    // `salesperson`, not the helper's default `admin`: both routes under test declare
    // `requiredRoles: ['salesperson']`, and AuthGuard reads the roles off localStorage.
    await seedGateAdminSession(page, {
      username: 'salesperson@system.local',
      roles: ['salesperson'],
      language: 'th',
    });
    await stubWalkInSellShell(page);
    await stubParcelAndScheduleApis(page);
  });

  test.afterEach(async ({ page }) => {
    expectNoEscapedGateCalls(page);
  });

  test('/staff/parcels/consign — the prohibited-items acknowledgement', async ({ page }) => {
    await page.goto('/staff/parcels/consign', { waitUntil: 'domcontentloaded' });
    await page.locator('app-parcel-consign-form').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('#prohibitedAcknowledged').waitFor({ state: 'visible', timeout: 20_000 });

    await expectNoCollapsedControls(page, '/staff/parcels/consign');
  });

  test('/staff/sell — the monk/nun passenger-type consent', async ({ page }) => {
    await page.goto('/staff/sell', { waitUntil: 'domcontentloaded' });
    await page.locator('app-walk-in-trip-browser').waitFor({ state: 'visible', timeout: 20_000 });

    await page.locator('.trip-row').first().click();
    // The consent box exists only once a monk/nun is the selected type (OBRS-1666).
    // `.ptype-tile` order is male, female, monk, nun.
    await page.locator('.ptype-tile').first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('.ptype-tile').nth(2).click();
    await page
      .locator('#walkin-passenger-type-consent')
      .waitFor({ state: 'visible', timeout: 20_000 });

    await expectNoCollapsedControls(page, '/staff/sell');
  });
});
