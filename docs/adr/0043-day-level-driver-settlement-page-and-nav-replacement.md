# ADR 0043 — Day-level driver settlement: one screen, one submit, and the nav item it replaced

**Date:** 2026-09-09
**Status:** Accepted
**Branch:** `ao/obrs-1756-driver-settlement`
**Card:** OBRS-1756
**Backend counterpart:** the `day-context` + `days/settle` endpoints and the
day-level idempotency decision are the backend ADR on the same branch in
`OBRS-backend/docs/adr/` — read the two together; this one is only the frontend half.

## Context

Before this card, everything a salesperson recorded against a driver's cash box was
recorded **per round**: `/staff/boarding/:scheduleId` → `app-driver-cash-panel` →
one advance, one per-head entry, one field expense, one repair bill at a time, each its
own POST. A van that ran four legs meant opening four rounds and pressing submit once per
cost — and the wage, which is priced per leg, had to be keyed once per leg by hand.

The owner's description of the job is not "record a cost", it is *"เคลียร์บิลคนขับ"* —
settle a driver's whole day. That is one date, one van, one driver, and one press.

## Decision 1 — a new page, and the "งานประจำรอบ" nav item is REPLACED, not added beside

`/staff/settlement` (`DriverSettlementPageComponent`, `requiredRoles: ['salesperson']`)
takes the sidebar slot that `boarding` held. The alternative — leaving both items — was
rejected by the owner: two doors onto overlapping jobs is exactly the shape OBRS-574
removed from the parcel screens, and the counter would have had to decide which one
today's job was.

**The `/staff/boarding` and `/staff/boarding/:scheduleId` ROUTES stay.** They are not the
same thing as the nav item:

- `boarding/:scheduleId` is the passenger list, still opened from *ตารางเดินรถ*
  (`staff-schedules-page.component.ts:328`) and *ตารางของฉัน*
  (`driver-schedules-page.component.ts:78`). Both paths are AC-5 and both are proven with
  screenshots.
- `boarding` is the date picker that used to be the menu door. It keeps working for a
  bookmarked URL, and deleting it would take the detail route with it.

`nav-reachability.spec.ts` is what makes that distinction explicit rather than implied.
`boarding/:scheduleId` moved in `STAFF_LINKED_FROM` from `boarding` to `schedules` — its
linker has to be a page that is itself reachable, and `boarding` no longer is. `boarding`
itself went into a NEW list, `STAFF_UNLISTED`, and deliberately **not** into
`STAFF_LINKED_FROM`: that table asserts *"some reachable page links here"*, and nothing
does. Writing it there would have made the sweep green on a false statement.

## Decision 2 — fixed expense ROWS, not a category dropdown

The per-round form (`driver-cash-expense-form`) asks *"which cost is this?"* because it
records one cost at a time. This screen asks *"how much of each?"*, so the categories are
rows: `DRIVER_WAGE` (row 1, read-only) · `FUEL` · `TOLL` · `PERMIT_FEE` ·
`PARKING_FEE`. A dropdown here would make the salesperson re-open one control four times
to answer four questions that are all on the screen already.

Two rows behave unlike the rest, and both are the server's rules made visible:

- **`DRIVER_WAGE` has no amount box.** The server prices it from the owner's rate per leg
  and writes one entry per schedule (OBRS-1356) — a number typed here is a number it
  discards. When no rate is configured, the row renders the *not-configured state on
  load* and the submit button refuses. It is **not ฿0**: settling would 409
  `DRIVER_WAGE_RATE_NOT_CONFIGURED`, and a screen that only found that out at submit
  would be telling the user after the fact.
- **`PARKING_FEE` appears only when `parkingFeeEligible` is true** — the van ran the
  earliest departure of a route that day (owner: *"ค่าจอดรถขึ้นเฉพาะรถที่ออกเที่ยวแรก"*).
  ⛔ The predicate is the server's, from `routeId` + `departureDateTime`. Nothing in the
  UI matches a route slug, and the "เที่ยวแรก" chip on the rounds table exists so the
  reader can see *why* the row is offered.

`OTHER` and `REPAIR` are absent on purpose: `REPAIR` has the bill box (OBRS-1630), and
`OTHER` needs a free-text label these fixed rows have nowhere to put.

## Decision 3 — reuse, and what "new" was actually justified

Nothing on this page re-implements something that exists:

| On screen | Component |
|---|---|
| Running-totals pill bar | `app-driver-cash-day-summary` (unchanged) |
| Each repair bill | `app-expense-bill-card variant="field"` — the same card `driver-cash-repair-form` embeds, with the same `buildFieldRepairBillGroup` |
| Garage / part pickers | `app-expense-payee-picker` / `app-expense-part-picker` inside that card |
| Plate + driver lists | `StaffSchedulesStore` (root-scoped, stale-while-revalidate; already the sell page's source too) |
| Garage / part registries | `ExpensePayeesStore` / `MaintenancePartsStore` |
| Wire → i18n key | `extractApiErrorCode` + `mapApiErrorCode`, and the existing `STAFF.DRIVER_CASH.ERROR.*` texts |

One mapping WAS duplicated and is now shared:
`toFieldRepairBillItems()` moved out of `DriverCashRepairFormComponent#onSubmit` to sit
beside `buildFieldRepairBillGroup` in `expense-bill-card.component.ts` — the same reason
that builder lives there, which is that the code building the group and the code reading
it back must not drift. Behaviour on the existing path is byte-identical.

The **multi-row expense table is the one genuinely new form**, and the owner acknowledged
it as such. `driver-cash-expense-form` submits one row at a time and stays untouched,
because `/staff/boarding/:scheduleId` still needs exactly that.

The repair box is 0..N bills starting at **0** — most days have no repair, and a blank
bill on screen is one the salesperson has to notice and delete. Each bill's own removal
control is rendered by this page rather than by the card, because the card's title bar
(which carries the ✕) is an `envelope`-variant thing and turning it on would bring the
date / van / category / "จ่ายโดย" header back with it.

## Decision 4 — one key per ATTEMPT OF THE SAME CONTENT

`POST /driver-cash/days/settle` carries an `Idempotency-Key`. The page mints it when
submit is first pressed, **reuses it verbatim when the same payload is submitted again**,
and drops it after a success or whenever the payload changes.

That middle clause is the whole point. A network failure leaves the client unable to tell
"never arrived" from "arrived and the answer was lost"; retrying with a fresh key would
settle the day twice, and refusing to retry would strand it. Reusing the key makes the
retry a replay: the server returns its stored response and writes nothing.

"The same payload" is decided by `JSON.stringify` over a request whose optional values are
explicit `null`, never `undefined`. That is load-bearing rather than stylistic —
`JSON.stringify` **drops** `undefined` keys, so a payload built with `undefined` for "no
note" serializes identically to one built without the field at all, and two materially
different days could share one key.

⛔ `src/app/shared/lib/idempotency-key.ts` is R0 and untouched; the page imports
`generateIdempotencyKey()` from it.

## Decision 5 — the two registry create buttons are now on

`[canCreatePayee]` / `[canCreatePart]` are `true` here **and** on the per-round
`driver-cash-repair-form`, which had them hard-`false` with the comment *"a button that
403s is worse than no button"* — `createPayee`/`createPart` were `hasRole('OWNER')`. That
reason expired in this card: both POSTs were opened to `hasAnyRole('OWNER','SALESPERSON')`
on the same branch, so the button no longer 403s for the person holding an unregistered
garage's slip. The comment was rewritten rather than the flag silently flipped, because
the next reader needs to know the constraint was lifted, not that it was ignored. Rename
and deactivate stay OWNER-only, and both services are idempotent on the normalized name,
so a double press resolves to the existing row.

## Consequences

- A salesperson settling a four-leg day presses submit **once** instead of five-plus
  times, and the wage is priced by the server rather than multiplied by hand.
- The whole day is one transaction: one bad repair bill rolls back the wage and the fuel
  too. That is deliberate — a half-written box is the state nobody can identify later.
- `/staff/boarding` is now URL-only. If it turns out the counter still wants a date-picker
  door onto the passenger list, the fix is a nav entry, not a new page.
- ⚠️ `e2e/route-coverage.mjs` (not a CI job) will report `/staff/settlement` as having no
  E2E spec until QA adds one.
