/**
 * OBRS-617 — Self-healing sweep of SIT test litter for the SIT-LIVE admin E2E lane.
 *
 * WHY THIS EXISTS
 * admin-critical-paths.spec.ts deliberately writes to the live SIT backend (ADR-0001)
 * so a malformed payload cannot silently pass. The cost, per that ADR, is data left
 * behind on SIT — and the ADR named the mitigation up front: "prefixing all test-created
 * records with TEST-{runId} so old records are easy to sweep". The sweep was never built,
 * so a `TEST-` route plus its ScheduleSets accumulated on SIT indefinitely, and a
 * production guard (RouteMapService.isTestRoute) grew to hide them from real users. This
 * helper is that missing sweep — it completes the ADR rather than contradicting it.
 *
 * ORDER MATTERS. A ScheduleSet holds a FK to its route. Delete the route first and the
 * ScheduleSet is orphaned, after which GET /api/private/schedule-set 500s on the broken
 * JOIN (the exact failure admin-critical-paths.spec.ts documents and works around). So
 * ScheduleSets are always deleted BEFORE routes.
 *
 * BEST-EFFORT. Every network call is guarded; a sweep must never throw into the suite it
 * protects. It is called from beforeAll (self-heal whatever a crashed prior run left) and
 * afterAll (leave zero behind after a clean run).
 *
 * CONCURRENCY. Sweeps every `TEST-` record regardless of age, which assumes the SIT-LIVE
 * lane is run one suite at a time — true today: lanes.json marks SIT-LIVE "Not a gate:
 * shared mutable environment", it is never run in CI, and the pre-existing design already
 * shares a single fixture route across runs. If this lane ever runs concurrently, switch
 * the filter to an age guard (delete only records older than N hours) instead.
 */

export const SIT_API = 'https://sit-obrs-backend.koyeb.app/api';

/**
 * The prefix that marks a record as test-created. Matches ADR-0001's `TEST-` convention
 * and the production guard `RouteMapService.isTestRoute` — both anchored at `^TEST-`.
 */
export const TEST_PREFIX = 'TEST-';

export function isTestSlug(slug: string | undefined | null): boolean {
  return String(slug ?? '').startsWith(TEST_PREFIX);
}

/** Shared SIT admin login for the SIT-LIVE specs (see e2e/fixtures/sit-test-credentials). */
export async function sitLogin(): Promise<string> {
  const res = await fetch(`${SIT_API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@system.local', password: 'P@ssw0rd' }),
  });
  const json = (await res.json()) as { data: { accessToken: string } };
  return json.data.accessToken;
}

interface ScheduleSetLite {
  id: number;
  route?: { slug?: string };
}

interface RouteLite {
  id: number;
  slug: string;
}

async function bestEffortDelete(url: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    // A sweep must never fail the suite it protects.
    return false;
  }
}

export interface SweepResult {
  scheduleSetsDeleted: number;
  routesDeleted: number;
}

/**
 * Delete every `TEST-` ScheduleSet, then every `TEST-` route, from SIT. Idempotent and
 * swallow-all, so it is safe to call both before and after the suite. Returns a count of
 * what it removed — used by the sweep proof test (OBRS-617 AC-4).
 */
export async function sweepSitTestLitter(token: string): Promise<SweepResult> {
  let scheduleSetsDeleted = 0;
  let routesDeleted = 0;

  // Slugs of routes whose TEST- ScheduleSet delete did NOT confirm-succeed. Deleting such
  // a route would orphan the surviving ScheduleSet and 500 GET /schedule-set — the exact
  // failure this ordering exists to prevent — so we hold the parent back this pass. The
  // next beforeAll sweep retries it, and the page.route 500-intercept covers the gap.
  const routesWithSurvivingChild = new Set<string>();

  // 1) ScheduleSets first (FK child). If the list endpoint is unavailable — e.g. an
  //    orphan from a pre-sweep era is currently 500ing it — skip rather than throw.
  try {
    const res = await fetch(`${SIT_API}/private/schedule-set`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: ScheduleSetLite[] };
      for (const ss of json.data ?? []) {
        const slug = ss.route?.slug;
        if (isTestSlug(slug)) {
          if (await bestEffortDelete(`${SIT_API}/private/schedule-set/${ss.id}`, token)) {
            scheduleSetsDeleted++;
          } else {
            routesWithSurvivingChild.add(String(slug));
          }
        }
      }
    }
  } catch {
    // best-effort
  }

  // 2) Routes second (FK parent). Delete a TEST- route only once ALL its TEST- ScheduleSets
  //    are confirmed gone, so a partial child-delete failure can never orphan one here.
  try {
    const res = await fetch(`${SIT_API}/routes`);
    if (res.ok) {
      const json = (await res.json()) as { data?: RouteLite[] };
      for (const r of json.data ?? []) {
        if (isTestSlug(r.slug) && !routesWithSurvivingChild.has(r.slug)) {
          if (await bestEffortDelete(`${SIT_API}/private/routes/${r.id}`, token)) {
            routesDeleted++;
          }
        }
      }
    }
  } catch {
    // best-effort
  }

  return { scheduleSetsDeleted, routesDeleted };
}
