# Admin E2E tests hit the real SIT backend

The B2C E2E test mocks every API call with `page.route()`. Admin E2E tests deliberately do not — they hit `sit-obrs-backend.koyeb.app` directly.

Admin critical paths are write-heavy (create Vehicle, create ScheduleSet, generate Schedules). Mocking those calls would let tests pass even when the request payload is malformed or the backend rejects the shape. The cost is that tests leave data behind on SIT; this is managed by prefixing all test-created records with `TEST-{runId}` so runs don't interfere with each other and old records are easy to sweep.

## Considered Options

- **Mock the API (like B2C tests)** — fast, stable, no SIT dependency. Rejected because admin tests validate writes, not just rendering, and a mock cannot catch frontend/backend contract drift.
- **Dedicated DB-reset endpoint** — cleanest isolation. Rejected because it requires backend work and adds a SIT-only endpoint with elevated blast radius.

## Follow-up — the sweep this ADR promised now exists (OBRS-617)

The "old records are easy to sweep" clause above had no implementation for over a month: `admin-critical-paths.spec.ts` kept a permanent `TEST-e2e-schedules-route` on SIT and accumulated ScheduleSets, and a production guard (`RouteMapService.isTestRoute`) had grown to hide them from real users.

`e2e/support/sit-sweep.ts` (`sweepSitTestLitter`) is that missing sweep. It deletes every `TEST-` ScheduleSet, then every `TEST-` route (child-before-parent, so a route delete never orphans a ScheduleSet and 500s the list endpoint). `admin-critical-paths.spec.ts` calls it in `beforeAll` (self-heal whatever a crashed prior run left) and `afterAll` (leave zero behind after a clean run); `obrs-617-sit-sweep.spec.ts` proves it end-to-end. The production guard stays as defense-in-depth for the during-run window but was narrowed to the exact `^TEST-` prefix.

The fixture slug, the sweep filter, and that guard are all case-sensitive on the exact `TEST-` prefix. **Do not lowercase-normalize route slugs backend-side** — the backend currently stores slugs verbatim, and a normalization would make the uppercase fixtures slip past the `^TEST-` guard and leak onto the public `/home` direction selector.
