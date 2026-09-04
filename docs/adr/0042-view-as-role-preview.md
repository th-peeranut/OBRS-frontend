# "ดูในมุมมองของ…" — a frontend-only, read-only role preview (OBRS-1721)

## Context

An owner or admin cannot see what a real salesperson sees, and the reason is a
frontend defect rather than a permission gap.

`AuthService.ROLE_GRANTS` gives `owner → ['owner','admin','salesperson','driver','customer']`,
and ADR-0037 removed portal confinement, so an owner/admin can already walk into
`/staff/**` and `/admin/**`. Access was never the problem. The problem is that
`StaffLayoutComponent.buildNavItems()` asks `hasAnyRole(['salesperson'])` and
`hasAnyRole(['driver'])` **separately**, and an owner passes both — so an owner
is shown the **union** of the salesperson and driver menus, a menu no real staff
member has ever had. There was no way to check what either role actually gets.

Three facts constrain any answer:

1. **The backend scopes data by identity, not by role.** `getCurrentOwnerScope()`
   (139 call sites) and `/driver-cash/my-earnings` ("the holder is always the
   authenticated caller") resolve the *caller*, not a claimed role. Whatever the
   frontend pretends to be, the rows that come back are the viewer's own.
2. **The backend hierarchy runs one way** —
   `ROLE_ADMIN > ROLE_OWNER > ROLE_SALESPERSON > ROLE_DRIVER` — so the real role
   passes every lower role's `@PreAuthorize`. **No 403 will stop a stray write
   issued from a preview.**
3. **Frontend roles are not a boundary at all.** They live in user-editable
   `localStorage` (the OBRS-601 comment on `hasAnyRole` is about exactly that
   threat model). Anything built here is a *view*, never a gate.

## Decision

Add a read-only role preview, owned entirely by the frontend.

### Why a frontend view and not impersonation

Impersonation — asking the backend for a token that *is* the other user — is the
thing that would answer "what does Somchai see", but it means minting
credentials for an account whose owner did not consent, in a system that has no
impersonation audit trail and where the roles are trusted for money handling
(settlements, driver cash). The question actually being asked is narrower:
*"which screens and menu items does this role get?"* A frontend view answers
that in full, and cannot mint anything.

### The data stays the viewer's own, and the banner says so

Because of fact (1), the preview renders another role's **layout** over the
viewer's **own records**. That is not a limitation to be worked around — it is
what makes the feature safe. It is also the one thing a viewer could easily get
wrong, so a persistent banner names the previewed role and states
**"ข้อมูลยังเป็นของบัญชีคุณเอง"** on every page for as long as the preview runs.

### One choke point: `getRoles()`

The override lives in `AuthService.getRoles()` and nowhere else. `AuthGuard`,
`hasAnyRole`, `hasHeldRole`, `getHomeRoute`, both nav builders and the ~21
components that call `getRoles().includes(...)` directly all funnel through it,
so they narrow automatically. `getHeldRoles()` is split out beneath it for the
things that must ask about the **real** user: which roles may be previewed at
all, and therefore whether the menu is offered.

A page that needs special-casing for the preview is a page that bypasses this
choke point. That is a defect to report, not to patch around.

### Write-blocking at an interceptor, not on the buttons

Because of fact (2), nothing server-side refuses a write made from a preview.
Disabling buttons would be a gate with as many holes as there are controls
nobody remembered, and each new screen adds another. `preview-readonly.interceptor.ts`
rejects every `POST/PUT/PATCH/DELETE` to `/api/` while a preview is running —
one rule, no per-screen upkeep. `/api/auth/` is exempt so a token refresh or a
sign-out still works mid-preview.

Accepted consequence, agreed on the card: **the sell and other write flows
cannot be exercised while previewing.** That is the trade, not a bug — the
alternative is a real write, by the real user, from a screen telling them they
are somebody else.

`auth.interceptor.ts` was NOT modified (R0). The new interceptor is registered
last in `app.module.ts` so its rejection still passes back out through
`errorInterceptor` and reaches the user as the normal toast.

### Choices are strictly below the held role, and `customer` is not offered

`admin → owner, salesperson, driver`; `owner → salesperson, driver`. The list is
keyed on the **held** role (`getHeldRoles()`), not the granted one — otherwise a
salesperson would be offered the menu, and a preview could widen itself.

`customer` is deliberately absent. `auth.guard.ts`'s `customerArea: true` branch
performs **no role check at all**, so previewing as customer would change
nothing on screen while implying that it had — a control whose only effect is to
mislead.

### In memory only

Preview state never touches `localStorage`. The real roles live there
(`auth_roles`); a persisted preview would be indistinguishable from them on the
next read, and could strand someone in a narrowed view for days. A refresh or a
new tab is therefore the guaranteed way back.

### Exiting does not redirect

The real role outranks every role it can preview, so it can reach every route
the preview could. A redirect on exit would move someone away from a page they
are still entitled to be on. This is deliberate; the code says so where somebody
would otherwise "fix" it.

## Consequences

- The owner-sees-the-union defect becomes *inspectable*: an owner previewing as
  salesperson now gets the salesperson menu, without `ตารางงานของฉัน` or
  `ตรวจสภาพรถ`. Pinned in `nav-reachability.spec.ts`, with a positive control
  asserting the un-previewed owner still sees both — otherwise the spec could
  not tell "narrowed" from "never there".
- An admin previewing as owner loses `/admin/lookups` and `/admin/roles`, which
  is the whole difference between the two menus (ADR-0040). That works only
  because `hasHeldRole()` reads `getRoles()`; had it read storage directly, the
  admin→owner preview would have shown nothing new.
- **This is not a security boundary and must never be cited as one.** It narrows
  a view for someone who already had the wider one. The boundary is the backend.

## Related

- `0037-no-frontend-portal-confinement.md` — why owner/admin can already enter
  every shell, which is what makes this a *view* problem rather than an access one.
- `0040-held-role-gate-for-admin-only-pages.md` — `hasHeldRole` and the two
  admin-only pages that make the admin→owner preview observable at all.
- `0012-admin-cross-area-access.md` — `ROLE_GRANTS`, and its closing warning not
  to carry the FE's admin/owner symmetry across to API expectations.
