# Admin E2E tests hit the real SIT backend

The B2C E2E test mocks every API call with `page.route()`. Admin E2E tests deliberately do not — they hit `sit-obrs-backend.koyeb.app` directly.

Admin critical paths are write-heavy (create Vehicle, create ScheduleSet, generate Schedules). Mocking those calls would let tests pass even when the request payload is malformed or the backend rejects the shape. The cost is that tests leave data behind on SIT; this is managed by prefixing all test-created records with `TEST-{runId}` so runs don't interfere with each other and old records are easy to sweep.

## Considered Options

- **Mock the API (like B2C tests)** — fast, stable, no SIT dependency. Rejected because admin tests validate writes, not just rendering, and a mock cannot catch frontend/backend contract drift.
- **Dedicated DB-reset endpoint** — cleanest isolation. Rejected because it requires backend work and adds a SIT-only endpoint with elevated blast radius.
