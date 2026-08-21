# A second, narrower route gate: `requiredHeldRoles` for pages the backend 403s an owner (OBRS-1498)

## Context

`ROLE_GRANTS` (ADR-0012, and `0037-no-frontend-portal-confinement.md`) makes `owner` and `admin` grant each other,
so `AuthService.hasAnyRole(['admin'])` is `true` for an owner. That is the
frontend's **area** model and it is correct: it answers *"may this identity be
in this portal"*.

The backend answers a different question, and its hierarchy runs one way only
(`WebSecurityConfig.java`):

```
ROLE_ADMIN > ROLE_OWNER > ROLE_SALESPERSON > ROLE_DRIVER > ROLE_USER
```

`admin` inherits `owner`; `owner` never inherits `admin`. So an endpoint
written `@PreAuthorize("hasRole('ADMIN')")` **403s an owner**, and ADR-0012's
own closing note already warned not to carry the FE's admin/owner symmetry
across to API expectations (OBRS-370).

Two admin pages are built entirely on such endpoints:

| page | controller | every write requires |
| --- | --- | --- |
| `/admin/lookups` | `LookupController` | `hasRole('ADMIN')` |
| `/admin/roles` | `RoleController` | `hasRole('ADMIN')` |

Because neither carried a guard of its own, an owner opened both, saw all the
data, and got a 403 from **every** add/edit/delete button. Not a dead button —
a dead **page**. The owner decided (OBRS-1498 AC-1, option ก) that an owner
should not see these pages at all.

`requiredRoles: ['admin']` cannot express that. ROLE_GRANTS grants an owner
`'admin'`, so an owner satisfies it — the literal records intent and does not
gate (the note on `settlements` in `admin.module.ts` says so explicitly).

## Decision

Add a **second** route-data key alongside `requiredRoles`, not a replacement
for it:

- `AuthService.hasHeldRole(roles)` — is one of these roles in `getRoles()`,
  with **no** `ROLE_GRANTS` expansion. Empty/absent is permissive, matching
  `hasAnyRole`.
- `AuthGuard` gains a second branch reading `route.data['requiredHeldRoles']`.
  It runs after the area check, and denies exactly the same way: the
  `LOGIN.NO_ADMIN_PERMISSION` alert, then a bounce to `getHomeRoute()`.
- `/admin/lookups` and `/admin/roles` declare
  `canActivate: [AuthGuard]` + `requiredHeldRoles: ['admin']`. They are the
  only two routes in the app that carry the key, pinned by a spec.
- `AdminLayoutComponent` gates the two nav entries on the same question, so
  there is no link into the bounce (and no link that silently outlives the
  guard).

`ROLE_GRANTS` is **not** touched. Removing `'admin'` from `ROLE_GRANTS.owner`
would have been the smaller diff and the wrong change: it moves every admin
page at once, plus OBRS-869, plus everything ADR-0012 pinned — a decision
nobody made.

## Consequences

- **The area model stays the rule.** `requiredHeldRoles` is absent from every
  other route. Read it as the exception for a page whose backend door 403s the
  identity the area check admits — not as a general second access system.
- **ADR-0012's invariant is untouched.** That ADR forbids re-confining
  `admin`; this confines `owner`, and `admin` keeps its full reach on both
  pages. The two are consistent for the same reason: `lookups` and `roles` are
  platform master data, and ADR-0012 already says `admin` is the unscoped
  platform role while `owner` is per-tenant.
- **Hiding the page is not hiding the data.** `GET /api/private/lookups` still
  answers an owner; `RoleController`'s GET still reaches `OWNER`. This is a
  screen-level decision. Gating the data means moving `@PreAuthorize` on the
  backend, which OBRS-1498 explicitly leaves out of scope.
- **It removes a read an owner has today.** Deliberate, and decided knowing
  that (recorded on OBRS-1498).
- `nav-reachability.spec.ts` reads the new key too. Its "never show a link the
  guard would bounce" sweep resolved admission through `hasAnyRole` alone, so
  without that it would have gone blind on exactly the two pages this ADR
  gates.

## Considered alternatives

- **`requiredRoles: ['admin']` on the two routes** — rejected: does not keep an
  owner out (ROLE_GRANTS), so it would ship as a fix that changes nothing. A
  spec pins the difference so this cannot be "simplified" back.
- **Remove `'admin'` from `ROLE_GRANTS.owner`** — rejected, see above.
- **Keep the pages, hide every write button (read-only + a badge)** — was
  option (ข) on OBRS-1498; the owner chose (ก).
- **Widen the backend to `hasRole('OWNER')`** — was option (ค); rejected there
  because lookups is platform-level master data with no owning tenant, so one
  owner would be editing values another owner depends on (the concern
  OBRS-backend's ADR-0109/ADR-0114 exist for).
