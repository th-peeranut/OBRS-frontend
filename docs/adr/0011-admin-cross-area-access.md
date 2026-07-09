# Area-based access model: admin gets cross-area access (OBRS-176)

## Context

Commit `670862f` ("implement area-based access model and update routing
guard", 2026-07-08, no Jira card) introduced `AuthService`'s frontend-only
area-based access model — `ROLE_GRANTS` and `PORTAL_ONLY_ROLES` — consumed by
`AuthGuard`. It shipped with no ADR, so the model's shape and its rationale
for `admin` were undocumented other than an in-code NOTE.

That model confined `admin` to the `/admin` portal only: `ROLE_GRANTS.admin`
was `['admin']` (not a superset of staff/customer), and `admin` was listed in
`PORTAL_ONLY_ROLES`, so `AuthGuard` bounced a logged-in admin off `/home` and
`hasAnyRole(['salesperson', 'driver'])` (the `isStaffUser` gate behind the
admin-layout profile menu's "Staff Area" link) was `false` for admin. The
in-code NOTE called this "a deliberate UX confinement," on the premise that
narrowing FE navigation never grants access the backend would deny.

That premise was correct but the resulting confinement did not match the
backend's actual authorization model. `WebSecurityConfig.roleHierarchy()` in
OBRS-backend is:

```
ROLE_ADMIN > ROLE_OWNER > ROLE_SALESPERSON > ROLE_DRIVER > ROLE_USER
```

`admin` is the **top** of that hierarchy — Spring Security's role hierarchy
means admin already satisfies every `@PreAuthorize`/endpoint check that
owner, salesperson, driver, or a plain user satisfies. The backend has never
rejected an admin token on any staff or customer endpoint. So the FE's
`admin: ['admin']` grant wasn't closing a security gap; it was purely a
navigation restriction that didn't mirror the system it was gating access
to, and diverged from how `owner` was modeled (`owner` was already the FE's
all-access superset, i.e. `admin`'s backend-junior role had broader FE reach
than admin itself).

## Decision

`ROLE_GRANTS.admin` becomes a cross-portal superset, mirroring the backend
`admin > owner` relationship:

```ts
admin: ['admin', 'owner', 'salesperson', 'driver', 'customer'],
```

`PORTAL_ONLY_ROLES` drops `'admin'`, leaving `['salesperson', 'driver']` —
those two roles remain genuinely confined to the staff portal and are still
bounced off `/home` by `AuthGuard`.

Net effect: admin now behaves like a near-owner across portals.
- `hasAnyRole(['salesperson', 'driver'])` → `true` for admin, so the
  admin-layout profile menu's "Staff Area" link renders and admin can use it
  (`/staff` route guard now passes for admin too, via the same
  cross-portal grant).
- `canAccessCustomerArea()` → `true` for admin, so `AuthGuard` no longer
  bounces a logged-in admin off `/home`.
- `getHomeRoute()` is **unchanged**: admin still lands on `/admin` after
  login. That method answers "what is this role's primary portal," not "what
  can this role reach" — admin's primary portal is still `/admin`, same as
  how owner's primary portal (`/`) doesn't change even though owner can also
  reach `/admin` and `/staff`.

This is a pure frontend/navigation change. No backend change is required or
made — admin was already authorized everywhere; the FE was the only layer
narrower than the system it fronts.

## Consequences

- Admin and owner are now both effectively all-access in the area model,
  differing only in default landing route (`/admin` vs `/`) — consistent
  with the backend hierarchy where admin outranks owner.
- `salesperson`/`driver` remain the only roles genuinely confined to a
  non-public portal.
- The customer-facing `NavbarComponent` (`isAdmin`/`isSalesperson`/
  `isDriver`, driven by `hasAnyRole`) will now also flag an admin identity as
  `isSalesperson`/`isDriver` when browsing `/home` — the same behavior owner
  already exhibited before this change (owner already granted itself
  salesperson/driver). No code change was needed there; it falls out of the
  `ROLE_GRANTS` widening.
- If a future need arises to distinguish "admin acting in the admin portal"
  from "admin browsing as a customer" (e.g. hiding booking-purchase UI from
  staff identities), that is a new, separate decision — not addressed here.

## Considered alternatives

- **Leave admin confined, only fix the comments** — rejected per the task
  driving this ADR (OBRS-176): the confinement itself, not just its
  documentation, was the defect. A near-owner role having narrower FE
  navigation than the role directly below it in the backend hierarchy is a
  surprising, unrequested product decision that shipped without a card.
- **Also change `getHomeRoute()` to send admin to `/`** — rejected: admin's
  primary job surface is still the admin portal; only cross-area *reach*
  changes, not the default landing page.
