# The frontend confines no role to a portal (OBRS-1001)

## Context

`AuthService.PORTAL_ONLY_ROLES` listed `['salesperson', 'driver']`, and
`AuthService.canAccessCustomerArea()` returned `false` for an identity holding
only those roles. `AuthGuard`'s `customerArea` branch turned that `false` into
`this.router.parseUrl(this.authService.getHomeRoute())` — a hard bounce back to
`/staff`.

That rule and the staff shell's own UI contradicted each other, and had done so
since both shipped:

- `staff-layout.component.html` renders the brand logo as
  `<a routerLink="/" aria-label="STAFF.LAYOUT.HOME_LINK">` — the label is
  literally "หน้าแรก" / "Home". `staff-layout.component.spec.ts` **requires** that
  link to exist ("the staff shell must always provide a UI path to the home
  page").
- `auth.service.spec.ts` **required** that salesperson and driver could not be
  on `/`.

Both suites were green. Neither could see the other, so the only visible symptom
was a user pressing the logo and watching nothing happen. Salesperson and driver
are the *only* two roles that ever see the staff shell, so the link was dead
100% of the time it was rendered.

Measured on live SIT (`https://sit-obrs-frontend.netlify.app`, Playwright,
2026-08-03) — five seed accounts, two arms each (type `/` into the address bar,
and click the brand link):

| account | roles | typed `/` | clicked brand |
| --- | --- | --- | --- |
| `salesperson@system.local` | `["salesperson"]` | `/staff/sell` | `/staff/sell` |
| `driver@system.local` | `["driver"]` | `/staff/driver` | `/staff/driver` |
| `admin@system.local` | `["admin"]` | `/` | `/` |
| `owner@system.local` | `["owner"]` | `/` | `/` |
| `customer@system.local` | `["customer"]` | `/` | `/` |

The bounce target matched `getHomeRoute()` per role exactly, which is what ruled
out a Netlify SPA-fallback or wildcard-route explanation: the `**` wildcard
redirects to `/`, i.e. it would have *succeeded*.

This is the third time the same question has been answered. Commit `670862f`
introduced the confinement with no card and no ADR. OBRS-176 / ADR-0012 reversed
it for `admin`, on the argument that the backend's
`ROLE_ADMIN > ROLE_OWNER > ROLE_SALESPERSON > ROLE_DRIVER > ROLE_USER` hierarchy
already authorizes admin everywhere, so the frontend list was navigation
cosmetics rather than a security boundary. That argument was never specific to
admin. The same hierarchy line gives `salesperson` and `driver` `ROLE_USER`
authority today: **both roles can already call every customer endpoint**, and the
frontend list was the only thing declining to draw the pages.

## Decision

The frontend confines **no** role to a portal. Concretely:

1. `PORTAL_ONLY_ROLES` is **deleted** from `auth.service.ts`.
2. `canAccessCustomerArea()` is **deleted** from `auth.service.ts`.
3. `AuthGuard`'s `customerArea` branch no longer consults roles at all. It keeps
   exactly one narrowing rule, `requireAuth`, which narrows by **authentication**
   (a guest is sent to `/login` with a stored return URL) and never by role.

Deleted, not emptied. `PORTAL_ONLY_ROLES = []` would leave a predicate that reads
like an enforced rule, a spec that "passes" against a population of zero, and a
guard branch no input can reach. The seam is recoverable from git history and
from this file, and re-introducing it would be an access-model change requiring
its own ADR anyway.

`getHomeRoute()` is deliberately **kept unchanged**: signing in as staff still
lands you in `/staff`, and a role-gated portal still bounces you to your own home
when you lack the role. What changed is only that the public area stops pushing
staff back out.

## Consequences

- The staff brand link works. `/`, `/how-to-book`, the policy pages, parcel
  tracking and the booking flow are reachable by every signed-in role.
- Salesperson and driver can now reach the 7 `requireAuth` customer-account
  routes as well (`my-bookings`, `account`, `payment`, `passenger-info`,
  `my-reports`, `parcel-booking`, `my-parcels`) and could book a ticket under
  their own staff account. This grants **no new capability** — the backend
  authorized those calls before this change and still does; it only makes the
  pages navigable. Accepted deliberately by the product owner on 2026-08-03 in
  preference to a narrower rule, because a second confinement tier is another
  rule to remember and it dead-ends mid-booking-flow (`schedule-booking` is
  guest-open by OBRS-856 while `passenger-info` is not).
- If a genuine customer-area restriction is ever needed, it belongs on the
  **backend**, where it is enforceable, not in a frontend list a browser user can
  edit — `getRoles()` reads `localStorage`.
- The behavioural pin moved. `auth.service.spec.ts` can no longer test a method
  that does not exist; `auth.guard.spec.ts` now drives the guard with the **real**
  `AuthService` and real `localStorage` roles, which is what the stubbed suite
  could never do — and is precisely why the old suite passed throughout the bug.

## Related

- `docs/adr/0012-admin-cross-area-access.md` (OBRS-176) — the same reversal, one
  level up the hierarchy.
- OBRS-1001 — this card, with the measured repro table above.
- `.github/workflows/adr-access-model-gate.yml` — the gate that required this file.
