import { test, expect } from '@playwright/test';
import { SIT_API, sitLogin, sweepSitTestLitter, isTestSlug } from '../support/sit-sweep';

/**
 * OBRS-617 AC-4 — proves the SIT test-litter sweep actually removes what the admin
 * SIT-LIVE lane creates: seed a TEST- route plus a ScheduleSet on it, run the sweep, and
 * assert both are gone from the live backend. Purely API-driven (no browser) — it
 * exercises the same endpoints admin-critical-paths.spec.ts writes to.
 *
 * SIT-LIVE lane (see e2e/lanes.json): it mutates the deployed SIT backend by design, so
 * it is not a merge gate. Self-cleaning by construction — the sweep it verifies is also
 * its teardown.
 */

const PROOF_ROUTE_SLUG = 'TEST-obrs617-sweep-proof';

async function listRouteSlugs(): Promise<string[]> {
  const res = await fetch(`${SIT_API}/routes`);
  const json = (await res.json()) as { data?: Array<{ slug: string }> };
  return (json.data ?? []).map((r) => r.slug);
}

async function listTestScheduleSetIds(token: string): Promise<number[]> {
  const res = await fetch(`${SIT_API}/private/schedule-set`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { data?: Array<{ id: number; route?: { slug?: string } }> };
  return (json.data ?? []).filter((ss) => isTestSlug(ss.route?.slug)).map((ss) => ss.id);
}

test.describe('OBRS-617 — SIT test-litter sweep', () => {
  let token: string;

  test.beforeAll(async () => {
    token = await sitLogin();
    // Start from a clean slate so the counts we assert are unambiguous.
    await sweepSitTestLitter(token);
  });

  test.afterAll(async () => {
    // Never leave the proof fixtures behind, even on a mid-test failure.
    if (token) {
      await sweepSitTestLitter(token);
    }
  });

  test('seeds a TEST- route + ScheduleSet, then the sweep removes both', async () => {
    const authJson = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    // 1) Seed a TEST- route.
    const routeRes = await fetch(`${SIT_API}/private/routes`, {
      method: 'POST',
      headers: authJson,
      body: JSON.stringify({
        slug: PROOF_ROUTE_SLUG,
        status: 'active',
        translations: [
          { locale: 'en', label: PROOF_ROUTE_SLUG, description: null },
          { locale: 'th', label: PROOF_ROUTE_SLUG, description: null },
          { locale: 'zh', label: PROOF_ROUTE_SLUG, description: null },
        ],
      }),
    });
    expect(routeRes.ok, 'seed route create should succeed').toBeTruthy();

    // 2) Seed a ScheduleSet on that route (FK child). Far-future dates, no bookings.
    const ssRes = await fetch(`${SIT_API}/private/schedule-set`, {
      method: 'POST',
      headers: authJson,
      body: JSON.stringify({
        startDate: '2033-01-10',
        endDate: '2033-01-11',
        departureTimes: ['08:00:00'],
        frequency: 'Daily',
        status: 'scheduled',
        route: PROOF_ROUTE_SLUG,
        vehicleType: 'van',
      }),
    });
    expect(ssRes.ok, 'seed ScheduleSet create should succeed').toBeTruthy();

    // 3) Confirm the litter is actually present before sweeping.
    expect(await listRouteSlugs()).toContain(PROOF_ROUTE_SLUG);
    expect((await listTestScheduleSetIds(token)).length).toBeGreaterThan(0);

    // 4) Run the sweep.
    const result = await sweepSitTestLitter(token);
    expect(result.routesDeleted).toBeGreaterThan(0);
    expect(result.scheduleSetsDeleted).toBeGreaterThan(0);

    // 5) Both are gone from the live backend.
    expect(await listRouteSlugs()).not.toContain(PROOF_ROUTE_SLUG);
    expect(await listTestScheduleSetIds(token)).toEqual([]);
  });
});
