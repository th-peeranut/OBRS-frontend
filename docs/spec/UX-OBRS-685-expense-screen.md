# UX-OBRS-685 — Admin → ค่าใช้จ่าย (Expenses) CRUD screen

**Card:** OBRS-685 (Epic OBRS-684 — replaces the owner's Google Sheet expense log; receipt upload
and the profit report are later children, out of scope here)
**Reads against:** the SA-locked API contract quoted verbatim in the coordinator brief for this
card — `POST/GET/GET-by-id/PUT/DELETE /api/private/expenses`, `ExpenseReqDto`/`ExpenseRespDto`
field list, role gate `['admin','owner']`. This document does not restate the DTO shapes beyond
what's needed to spec the screen; it designs the layout, forms, validation, filters, states, and
i18n.

**Design-system conformance is enforced by `docs/design-system.md`** — every control below maps to
an existing §2–§10 token/component/role. One new pattern is introduced (§8.1) and justified there
per §12.

**Revision note (this file was revised once, against Scrutinize findings on the first draft):**
The first draft's vehicle dropdown used a `value: null` sentinel option for "ส่วนกลาง / ไม่ผูกคัน".
Scrutinize found two compounding defects verified directly against `admin-dropdown.component.ts`:
(1) the shared dropdown coerces every option value through `String(value ?? '')`, so a `null`-valued
option actually emits `''`, meaning the payload would carry `vehicleId: ''` — not `null` — into a
`Long|null` backend field (a live 400, not a caught-in-test bug, since a hand-rolled mock control
would happily hold a real `null` and pass); (2) that same `''` is indistinguishable from the
dropdown's own untouched/placeholder state, so the form's resting state (nothing picked) would
render as if "ส่วนกลาง" had been chosen — a real mis-attribution risk on a cost-tracking screen.
**Fix (§4.1, this revision):** the vehicle control is placeholder-first per §3.1 (resting state
shows "รถ", nothing pre-selected), the central option carries a distinct **non-empty** sentinel
(`'CENTRAL_NONE'`), the choice is made **required** (an untouched placeholder blocks submit — this
is what makes "forgot to pick" and "deliberately chose central" two different, both-blocking-or-
resolvable states instead of one silent default), and the payload mapper converts the sentinel to a
real `null` only at the submit boundary, never inside the control's own value. A `categoryOtherLabel`
full-DTO payload assertion (§4.1's category field) closes the same class of gap for that field.

---

## 0. Verification log (what was read, not assumed)

| Claim | Verified at |
|---|---|
| `app-admin-dropdown` coerces every option value and the control's own value through `String(x ?? '')` — `getOptionValue`, `writeValue`, the `value` setter | `src/app/modules/admin/components/admin-dropdown/admin-dropdown.component.ts:31-33,52-54,98-104` (read in full) |
| A `null`-valued option and the control's untouched/no-selection state both resolve to the literal string `''` inside the component — `isSelected()` compares `String(getOptionValue(option)) === String(this.selectedValue ?? '')` | same file, `:90-96` |
| Sibling "select a vehicle" dropdown precedent exists and has a settled label formula: `[vehicleNumber, numberPlate].filter(Boolean).join(' / ') || '#id'`, `code: String(vehicle.id)` | `src/app/modules/admin/pages/schedules/schedules.mappers.ts:380-395` (`toVehicleOptions`), confirmed live via `schedules-page.component.ts:711` |
| Full-page CRUD split (list-table / form-modal / delete-modal as separate dumb components) is the established shape for a page this size, not a single-file page | `src/app/modules/admin/pages/vehicles/vehicles-page.component.ts` + `vehicle-form-modal/` + `vehicle-delete-modal/` (OBRS-261 split), read in full |
| Closest per-record-CRUD-with-a-vehicle-link precedent (form fields, table markup, modal chrome) | `src/app/modules/admin/pages/vehicles/vehicle-maintenance/vehicle-maintenance-panel.component.html/.ts` + `vehicle-maintenance.store.ts`, read in full |
| Parameterized, root-scoped `AdminCollectionStore` precedent (a store whose fetch depends on a mutable filter field, not just a static endpoint) | `src/app/modules/admin/pages/refund-void-report/refund-void-report.store.ts` (`setRange()`), read in full |
| Filter dropdown precedent: `''` is the established "All / no filter" sentinel, rendered via the same `app-admin-dropdown` with the filter's own descriptive placeholder (e.g. "Status: All") — a different contract from a **form** field's placeholder | `src/app/modules/admin/pages/vehicles/vehicles-page.component.html:79-86` (`FILTER_STATUS`), `vehicles-page.component.ts:164-167` (`onStatusFilterChange`) |
| Date-range filter precedent (two `p-calendar`, `app-date-field` styling, `admin-page-filters` section class) | `src/app/modules/admin/pages/refund-void-report/refund-void-report-page.component.html:11-42` |
| No FE convention anywhere in this codebase renders `createdBy`/`updatedBy` audit fields as table columns on an admin CRUD list; closest analog (`config-change-history`) is a dedicated audit-log page, not a general CRUD pattern | grep of `createdByName`/`updatedByName`/`createdBy` across `src/app` — 0 hits outside booking/station DTOs unrelated to this feature |
| `AdminCollectionStore` public surface (`data$`/`refreshing$`/`error$`/`hasValue`/`clear()`/`mutate()`/`refresh()`) and the "component-scoped vs root-scoped" split rule | `vehicle-maintenance.store.ts` (component-scoped, per-vehicle-focus) vs `vehicles.store.ts`/`refund-void-report.store.ts` (root-scoped, page-level) — both read in full |
| Icon `receipt_long` is unused by any existing admin nav item (`point_of_sale`, `currency_exchange`, `account_balance_wallet` etc. already taken) | full grep of `icon: '` in `admin-layout.component.ts` |
| `ADMIN.COMMON.{ACTIONS,EDIT,CANCEL,SAVE,SAVING,DELETE,DELETING,DELETE_CONFIRM_TITLE,DELETE_CONFIRM_MESSAGE}`, `ADMIN.VALIDATION.{REQUIRED,POSITIVE_NUMBER,FORM_INVALID}`, `ADMIN.MESSAGES.{CREATED,UPDATED,DELETED,SAVE_FAILED,DELETE_FAILED}` already exist and are reused, not re-added | `public/i18n/en.json:464-542` (read in full) |

---

## 1. New routes / pages

- `/admin/expenses` → `ExpensesPageComponent`
  (`src/app/modules/admin/pages/expenses/expenses-page.component.ts`)

Route data in `admin.module.ts` (inserted after `cash-online-reconciliation-report`):

```ts
{
  path: 'expenses',
  component: ExpensesPageComponent,
  canActivate: [AuthGuard],
  data: {
    titleKey: 'ADMIN.PAGES.EXPENSES',
    subtitleKey: 'ADMIN.EXPENSES.SUBTITLE',
    requiredRoles: ['admin', 'owner'],
  },
},
```

**Role gate — verified correct by Scrutinize, unchanged in this revision.** `requiredRoles:
['admin','owner']` mirrors `eod-sales-report` exactly (audience = the whole always-shown admin+owner
nav, not a further-restricted single-role page like `settlements`), so the nav item lives in the
always-shown `items` array of `buildNavItems()`, **no** conditional `if (hasAnyRole(...))` push
needed — that conditional-push shape is reserved for owner-only items (`settlements`,
`cargo-capacity`, `inspection-items`), which this is not. Salesperson gets no nav entry (outside the
base admin+owner array) and a route-guard bounce on direct navigation, matching every sibling
`['admin','owner']` page.

Nav item in `admin-layout.component.ts` `buildNavItems()`, section `'operations'` (same group as
`settlements`/`bookings` — operational record-keeping, not a report):

```ts
{ path: 'expenses', labelKey: 'ADMIN.PAGES.EXPENSES', icon: 'receipt_long', descriptionKey: 'ADMIN.EXPENSES.SUBTITLE', section: 'operations' },
```

Title surface: `<section class="admin-page-intro">` first, no `<h2>/<h3>` — shell topbar owns the
title via route `titleKey` (§7 of the design system), matching every sibling admin page.

---

## 2. Component hierarchy

Mirrors the OBRS-261 split (`VehiclesPageComponent`) because this is a full top-level CRUD page, not
a child panel like vehicle-maintenance:

```
ExpensesPageComponent (smart, expenses-page.component.ts)
  — owns: ExpensesStore subscription, vehicleOptions/categoryOptions localization,
    vehicle filter (server re-fetch) + category/date-range filter (client-side, §6),
    modal open/close orchestration, delete confirm
  ├── ExpenseListTableComponent (dumb, expense-list-table/expense-list-table.component.ts)
  │     inputs: rows: ExpenseRow[], isLoading, isEmpty, errorMessage, canWrite
  │     outputs: edit: EventEmitter<ExpenseRow>, delete: EventEmitter<ExpenseRow>
  ├── ExpenseFormModalComponent (expense-form-modal/expense-form-modal.component.ts)
  │     inputs: isOpen, mode: 'create'|'edit', selectedExpense: ExpenseRow|null,
  │              vehicleOptions: Option[], categoryOptions: Option[], reloadStructure: () => Promise<void>
  │     outputs: closed: EventEmitter<void>
  └── ExpenseDeleteModalComponent (expense-delete-modal/expense-delete-modal.component.ts)
        inputs: isOpen, expense: ExpenseRow|null, isDeleting
        outputs: confirm: EventEmitter<void>, cancel: EventEmitter<void>
```

`ExpenseRow`/`Option`/pure mapper functions live in `expenses-page.mappers.ts`
(`toExpenseRow`, `toExpensePayload`, `toExpenseVehicleOptions`, `toExpenseCategoryOptions`,
`filterExpensesByCategoryAndRange`) — no Angular DI, unit-testable in isolation, mirroring
`vehicles-page.mappers.ts`/`schedules.mappers.ts`.

---

## 3. The list surface

### 3.1 Columns

Single `admin-card` > `admin-table-wrap` > `admin-table`:

| # | Column | Content | i18n key |
|---|---|---|---|
| 1 | Date | `expenseDate`, `dd/mm/yyyy` | `ADMIN.EXPENSES.EXPENSE_DATE` |
| 2 | Vehicle | vehicle identifier (`[vehicleNumber, numberPlate].join(' / ')`) **or**, when `vehicleId === null`, the muted text `ADMIN.EXPENSES.VEHICLE_CENTRAL_OPTION` ("ส่วนกลาง / ไม่ผูกคัน") rendered `.admin-muted` — never blank, never confused with the Category column | `ADMIN.EXPENSES.VEHICLE` |
| 3 | Category | localized category label; when `category === 'OTHER'`, appended as `"อื่นๆ (categoryOtherLabel)"` via `toExpenseCategoryDisplay()` | `ADMIN.EXPENSES.CATEGORY` |
| 4 | Amount | right-aligned, `font-variant-numeric: tabular-nums` — reuses the §12 "Right-aligned money columns" pattern (`EodSalesReportPageComponent`), scoped class `.expense-money` | `ADMIN.EXPENSES.AMOUNT` |
| 5 | VAT | same `.expense-money` treatment; `-` when `null` | `ADMIN.EXPENSES.VAT_AMOUNT` |
| 6 | Receipt No. | plain text, `-` when empty | `ADMIN.EXPENSES.RECEIPT_NO` |
| 7 | Paid By | plain text, `-` when empty | `ADMIN.EXPENSES.PAID_BY` |
| 8 | Note | plain text, truncated with `title` tooltip for the full value, `-` when empty | `ADMIN.EXPENSES.NOTE` |
| 9 | Actions | Edit (`.admin-icon-btn`, `edit_square`) + Delete (`.admin-icon-btn`, danger-role per §4 — reuse `.admin-btn-danger`'s already-established color composition, same as every other row-level delete in this app) — `*ngIf="canWrite"` | `ADMIN.COMMON.ACTIONS` |

`canWrite = authService.hasAnyRole(['admin','owner'])` — for this page every reader is already a
writer (the route itself is admin+owner-only, unlike `vehicle-maintenance` where a wider read
audience exists), so `canWrite` is effectively always `true` post-route-guard. Kept as an explicit
computed field anyway, matching the single-source-of-truth convention every sibling page uses,
rather than hardcoding `true` in the template.

### 3.2 Audit fields — not rendered as columns

`ExpenseRespDto`'s `@JsonUnwrapped` audit fields (`createdByName`/`createdAt`/`updatedByName`/
`updatedAt`) are kept on `AdminExpenseDto` (wire shape) but **not** surfaced as table columns — no
sibling admin CRUD page in this codebase renders audit fields as columns (§0); the closest analog,
`config-change-history`, is a dedicated audit-log page, a different pattern entirely. They are
**read-only** everywhere they might appear later (a future detail view, if one is ever added) and
the form **never** sends them in a create/edit payload (§9, filter-invariants note).

---

## 4. Forms

### 4.1 ExpenseForm (create / edit — same modal, mode-switched)

| Field | PrimeNG/canonical component | Type | Validation | i18n key |
|---|---|---|---|---|
| **vehicleSelection** (form-control name; maps to `vehicleId` only at the payload edge — see below) | `app-admin-dropdown` — placeholder = field name "รถ" (§3.1), **not pre-selected** | string: `''` (untouched) \| `'CENTRAL_NONE'` \| numeric-id-as-string | **`Validators.required`** — an untouched placeholder is invalid and blocks Save. This is deliberately stricter than the backend DTO (`vehicleId` is nullable there): the FE forces an explicit choice between "a real vehicle" and "ส่วนกลาง / ไม่ผูกคัน" so "forgot to pick" can never silently resolve to a saved `null`, which is the exact mis-attribution risk Scrutinize flagged. | `ADMIN.EXPENSES.VEHICLE` |
| category | `app-admin-dropdown` — placeholder = field name "ประเภทค่าใช้จ่าย", **not pre-selected**; options = 10 fixed enum codes (not a Lookup-API fetch — static list, built once via `toExpenseCategoryOptions(translate)`, re-derived on `langChange`, mirroring `promotions-page`'s `discountTypeOptions`) | string enum | required | `ADMIN.EXPENSES.CATEGORY` |
| categoryOtherLabel | `input[type=text]` `.admin-field`, **rendered only when `category === 'OTHER'`** | string, maxLength 100 | required + `maxLength(100)` while visible. On `category.valueChanges`: the instant the value leaves `'OTHER'`, `categoryOtherLabel` is `patchValue('')` **and** `clearValidators()` + `updateValueAndValidity()` in the same tick — both the visible control and its validator state are reset together, never left stale in memory for a component that then re-shows OTHER. | `ADMIN.EXPENSES.CATEGORY_OTHER_LABEL` |
| amount | `input[type=number]` `.admin-field` `min="0.01" step="0.01"` | BigDecimal (string→number) | required, `> 0` (custom `positiveAmountValidator`, message reuses `ADMIN.VALIDATION.POSITIVE_NUMBER`), ≤2 decimals (`tooManyDecimalsValidator(2)`, mirrors `CARGO_CAPACITY_TOO_MANY_DECIMALS` shape) | `ADMIN.EXPENSES.AMOUNT` |
| vatAmount | `input[type=number]` `.admin-field` `min="0" step="0.01"` | BigDecimal, nullable | optional, `≥ 0`, ≤2 decimals | `ADMIN.EXPENSES.VAT_AMOUNT` |
| expenseDate | `p-calendar` (`dateFormat="dd/mm/yy"`, `[showIcon]="true"`, `[showButtonBar]="true"`) | LocalDate → `yyyy-MM-dd` on submit | required | `ADMIN.EXPENSES.EXPENSE_DATE` |
| receiptNo | `input[type=text]` `.admin-field` `maxlength="100"` | string, nullable | `maxLength(100)` | `ADMIN.EXPENSES.RECEIPT_NO` |
| paidBy | `input[type=text]` `.admin-field` `maxlength="255"` | string, nullable | `maxLength(255)` | `ADMIN.EXPENSES.PAID_BY` |
| note | `textarea.admin-field` (moderate-12px radius, §5's textarea exception) `maxlength="500"` | string, nullable | `maxLength(500)` | `ADMIN.EXPENSES.NOTE` |

Field order top-to-bottom in `admin-form-grid` (2-column, mirroring the vehicle-maintenance modal):
**vehicleSelection → category → categoryOtherLabel (conditional) → amount → vatAmount →
expenseDate → receiptNo → paidBy → note (full-width)**

A hint line under the `vehicleSelection` field (`.admin-hint`, not an error) reads
`ADMIN.EXPENSES.VEHICLE_HINT`: *"เลือก 'ส่วนกลาง / ไม่ผูกคัน' หากไม่ได้จ่ายเพื่อรถคันใดคันหนึ่ง —
คนละเรื่องกับหมวดหมู่ 'ส่วนกลาง' ด้านล่าง"* — carried over unchanged from the first draft; the
central-vs-CENTRAL-category confusion this addresses is orthogonal to the sentinel-value bug fixed
in this revision.

#### 4.1.1 The vehicle sentinel fix — corrected design (Scrutinize findings 1+2)

**Constant:** `export const VEHICLE_CENTRAL_SENTINEL = 'CENTRAL_NONE';` in `expenses-page.mappers.ts`
— an arbitrary, deliberately non-empty, non-numeric token that can never collide with a real
`String(vehicle.id)` option value.

**Options list** (`toExpenseVehicleOptions(vehicles, translate)`):

```ts
export function toExpenseVehicleOptions(vehicles: AdminVehicleDto[], centralLabel: string): Option[] {
  return [
    { code: VEHICLE_CENTRAL_SENTINEL, label: centralLabel },
    // identical identifier/fallback formula to schedules.mappers.ts:388 (toVehicleOptions) —
    // mirrored, not imported, per this codebase's per-page-mappers convention (§0)
    ...vehicles.map((vehicle) => ({
      code: String(vehicle.id),
      label: [vehicle.vehicleNumber, vehicle.numberPlate].filter(Boolean).join(' / ') || `#${vehicle.id}`,
    })),
  ];
}
```

No option carries `code: ''` — the placeholder-header row `app-admin-dropdown` renders on top is the
component's **own** built-in "nothing selected" affordance (driven by the control's value being
`''`/unset, per §3.1), entirely separate from this `options` array. This is what keeps the resting
state and the explicit-central choice from ever aliasing to the same string, closing finding 2.

**Form control init** — `initCreateForm()`: `vehicleSelection: ['', [Validators.required]]` (blank,
placeholder shows, §3.1 compliant, invalid until touched-and-chosen). **`initEditForm(row)`**:
`vehicleSelection: row.vehicleId === null ? VEHICLE_CENTRAL_SENTINEL : String(row.vehicleId)` — an
already-saved central expense prefills to the **explicit** sentinel option (a real prior choice, not
an unmade one), never back to blank.

**Payload mapper** — the ONLY place the sentinel is translated to a real `null`, at the submit
boundary, never inside the control's own value:

```ts
export function toExpensePayload(formValue: ExpenseFormValue): CreateExpensePayload {
  return {
    vehicleId:
      formValue.vehicleSelection === VEHICLE_CENTRAL_SENTINEL
        ? null
        : Number(formValue.vehicleSelection),
    category: formValue.category,
    categoryOtherLabel: formValue.category === 'OTHER' ? formValue.categoryOtherLabel.trim() : null,
    amount: formValue.amount,
    vatAmount: formValue.vatAmount,
    expenseDate: toIsoDateString(formValue.expenseDate),
    receiptNo: formValue.receiptNo?.trim() || null,
    paidBy: formValue.paidBy?.trim() || null,
    note: formValue.note?.trim() || null,
  };
}
```

Note `categoryOtherLabel` is derived from `formValue.category` at the mapper boundary too, **not**
trusted from whatever the (possibly stale, possibly hidden-but-not-yet-cleared) control currently
holds — belt-and-suspenders alongside the `valueChanges` clear in the field table above, so even if
a future edit to the reveal logic regresses, the wire payload still can't carry a stray label when
`category !== 'OTHER'`.

**Locking spec (full-DTO assertion, not `objectContaining` — required by both Scrutinize findings
1 and 3):**

```ts
it('submits vehicleId: null literally (never "") when Central/Not-linked is chosen', () => {
  component['expenseForm'].patchValue({
    vehicleSelection: VEHICLE_CENTRAL_SENTINEL,
    category: 'FUEL',
    categoryOtherLabel: '',
    amount: 500,
    vatAmount: null,
    expenseDate: new Date('2026-07-24'),
    receiptNo: '',
    paidBy: '',
    note: '',
  });

  component['submitExpense']();

  const payload = adminApiServiceSpy.createExpense.calls.mostRecent().args[0];
  expect(payload).toEqual({
    vehicleId: null,
    category: 'FUEL',
    categoryOtherLabel: null,
    amount: 500,
    vatAmount: null,
    expenseDate: '2026-07-24',
    receiptNo: null,
    paidBy: null,
    note: null,
  }); // toEqual, not objectContaining — a stray "" or an omitted key both fail this
});

it('blocks submit while vehicleSelection is untouched (placeholder)', () => {
  component['expenseForm'].patchValue({ vehicleSelection: '', category: 'FUEL', amount: 500, expenseDate: new Date() });
  component['submitExpense']();
  expect(adminApiServiceSpy.createExpense).not.toHaveBeenCalled();
});

it('submits categoryOtherLabel: null when category is not OTHER, even if the control was populated before switching away', () => {
  component['expenseForm'].patchValue({ category: 'OTHER', categoryOtherLabel: 'ล้างรถ' });
  component['expenseForm'].patchValue({ category: 'FUEL' }); // switch away — control auto-cleared
  component['expenseForm'].patchValue({ vehicleSelection: VEHICLE_CENTRAL_SENTINEL, amount: 100, expenseDate: new Date('2026-07-24') });

  component['submitExpense']();

  const payload = adminApiServiceSpy.createExpense.calls.mostRecent().args[0];
  expect(payload.categoryOtherLabel).toBeNull(); // not 'ล้างรถ', not undefined-key-omitted silently
});
```

### 4.2 Create vs Edit

Mirrors `VehicleFormModalComponent` exactly: `ngOnChanges` reacts only to `isOpen` transitions;
create starts every field blank (§3.1); edit opens synchronously from the row already in hand — the
list endpoint returns the full record, so there is no secondary detail fetch to gate on (same
reasoning as `vehicle-maintenance-panel.openEditModal`). Submit: `POST /expenses` (create) /
`PUT /expenses/{id}` (edit) → close modal → `AlertService.success()` (reuse `ADMIN.MESSAGES.CREATED`/
`UPDATED`) → `reloadStructure()` (→ `ExpensesStore.refresh()`), same ordering as every sibling form
modal (never optimistic-splice on create/edit — the server assigns `id`/audit fields).

---

## 5. Delete

`ExpenseDeleteModalComponent` mirrors `VehicleDeleteModalComponent` byte-for-byte in shape: confirm
title/message reuse `ADMIN.COMMON.DELETE_CONFIRM_TITLE`/`DELETE_CONFIRM_MESSAGE` (no new keys),
`DELETE /expenses/{id}`, optimistic row removal via `store.mutate()` before the background
`refresh()` lands (matching `VehiclesPageComponent.confirmDelete()`), success/`ADMIN.MESSAGES.DELETED`
/error/`ADMIN.MESSAGES.DELETE_FAILED` (reused keys).

---

## 6. Filters

### 6.1 Layout

`<section class="admin-page-filters mt-3">` (reused class, `refund-void-report` precedent):
- Vehicle filter — `app-admin-dropdown`, placeholder `ADMIN.EXPENSES.FILTER_VEHICLE` ("รถ: ทั้งหมด")
- Category filter — `app-admin-dropdown`, placeholder `ADMIN.EXPENSES.FILTER_CATEGORY` ("ประเภท: ทั้งหมด")
- Date range — two `p-calendar` (`app-date-field` styling), `FILTER_DATE_FROM`/`FILTER_DATE_TO`
- `ADMIN.EXPENSES.ADD` primary button, right-aligned (`ms-auto`)

### 6.2 Filter architecture — three different mechanisms on one bar (state clearly, don't let a dev assume they're all the same)

The locked backend contract exposes exactly one query param: `GET /expenses?vehicleId=`. Category and
date-range have **no** server-side filter support. This produces three distinct behaviors on what
looks like one uniform filter bar:

| Filter | Mechanism | Detail |
|---|---|---|
| **Vehicle = a specific vehicle** | **Server-side** | `ExpensesStore.setVehicleFilter(vehicleId: number)` → re-fetches `GET /expenses?vehicleId=X` |
| **Vehicle = "ทั้งหมด" (placeholder, `''`)** | Server-side, unfiltered | `ExpensesStore.setVehicleFilter(null)` → re-fetches `GET /expenses` (no param) — loads **every** row |
| **Vehicle = "เฉพาะส่วนกลาง / ไม่ผูกคัน"** (`ADMIN.EXPENSES.FILTER_VEHICLE_CENTRAL_ONLY`, value = the same `VEHICLE_CENTRAL_SENTINEL` constant §4.1.1) | **Hybrid** | The contract has no query param for "only null-vehicleId rows," so this option ALSO triggers `setVehicleFilter(null)` (fetch everything, same as "All") and additionally sets a client-side predicate `vehicleId === null` applied in `applyFilters()`. **Not** a fourth server call. |
| **Category** | Client-side | Filters the already-fetched, already-localized `rows` array in memory — mirrors `VehiclesPageComponent.selectedStatusFilter`/`filterVehiclesByStatus()` exactly (§0) |
| **Date range (from/to)** | Client-side | Same in-memory filter pass, `expenseDate` compared against the two `Date` values |

`filterExpensesByCategoryAndRange(rows, { category, centralOnly, from, to })` in
`expenses-page.mappers.ts` is the one pure function all three client-side predicates run through —
kept together so the three can't drift into three separate ad-hoc `.filter()` calls in the component.

### 6.3 Filter invariants (explicit, non-negotiable — Scrutinize asked these be pinned down)

1. **"ทั้งหมด" must load ALL rows, unpaged.** This MVP has no server-side paging on `GET /expenses`
   (SA contract confirms no `page`/`size` param), so the client-side category/date filters always see
   the complete set for the current vehicle scope. **Known limit, not a bug**: if a later child of
   Epic OBRS-684 ever adds server-side paging/capping to this endpoint, the client-side date/category
   filters would silently only see the capped page — that follow-up MUST either move those filters
   server-side at the same time, or explicitly re-fetch beyond the cap before filtering. Flag this
   in that future card's spec; do not let it ship as a silent regression.
2. **Category and date-range filter state is NOT reflected in the URL** (no query params, no route
   state) — unlike the vehicle filter, which changes what's actually fetched. A page reload/deep-link
   silently drops any active category/date filter back to unfiltered. **Accepted for MVP** — this is
   a low-traffic internal back-office screen, not a shareable report; if that changes, promote these
   to query-param-driven state in a follow-up, don't silently carry the gap forward indefinitely.
3. **Audit fields are never sent by the form.** `createdByName`/`createdAt`/`updatedByName`/
   `updatedAt` are server-set on every write; `toExpensePayload()` (§4.1.1) does not read them from
   anywhere, and the create/edit form has no controls bound to them. They exist only as read-only
   fields on the response DTO (§3.2) — the form's `ExpenseFormValue` type has no properties for them
   at all, so there is no accidental round-trip to guard against structurally, not just by convention.

---

## 7. User flows

1. Admin/Owner clicks "ค่าใช้จ่าย" in the nav → `/admin/expenses` → table loads, sorted
   `expenseDate` DESC (`GET /expenses`, no filter)
2. Salesperson hits `/admin/expenses` directly by URL → `AuthGuard` bounces on `requiredRoles`
   before the page ever renders — same as every sibling `['admin','owner']` route (unchanged,
   verified correct, not touched this revision)
3. Admin clicks "เพิ่มค่าใช้จ่าย" → modal opens optimistically, every field blank incl. vehicle
   placeholder → fills fields, picks a vehicle OR explicitly picks "ส่วนกลาง / ไม่ผูกคัน" → picks
   category "อื่นๆ" → `categoryOtherLabel` field appears, required → Save → client validation
   (including the now-required vehicle choice) → `POST` → `vehicleId` on the wire is a real `null`
   or a real number, never `""` → success alert → list refreshes
4. Admin clicks Edit on a row whose `vehicleId` is `null` → modal opens with the vehicle dropdown
   already resolved to the explicit "ส่วนกลาง / ไม่ผูกคัน" option (not blank) → edits another field →
   Save → `PUT`
5. Admin clicks Delete → confirm (reused keys) → `DELETE` → optimistic row removal → success alert
6. Admin picks a specific vehicle in the filter bar → server re-fetch scoped to that vehicle (SWR:
   stale rows stay visible with a refresh-hint until the new set lands)
7. Admin picks "เฉพาะส่วนกลาง / ไม่ผูกคัน" in the vehicle filter → server re-fetches the **unfiltered**
   set (identical call to "ทั้งหมด"), then the client-side `vehicleId === null` predicate narrows what's
   shown — no separate loading state from step 6, this is invisible to the admin
8. Admin sets category + date-range filters → table narrows instantly, no network call, no URL change
   (§6.3.2) — a reload silently clears these two, the vehicle filter's server-driven set does not
   reset because there is currently no persisted filter state to lose (fresh mount re-fetches
   unfiltered regardless)

---

## 8. States

- **Loading (first entry, no cache):** `ExpenseListTableComponent` shows 5 `admin-skeleton-row`s,
  mirroring `vehicle-maintenance-panel`
- **Empty (200 + [], no filters active):** full-section empty state (§12 pattern log, OBRS-209) —
  icon `receipt_long`, `ADMIN.EXPENSES.EMPTY_TITLE`/`EMPTY_BODY`, `var(--admin-muted)`/
  `var(--admin-text)` styling only, no new hex
- **Empty (filters narrowed to zero rows):** a distinct, lighter inline message
  (`ADMIN.EXPENSES.NO_MATCH`, "ไม่พบรายการที่ตรงกับตัวกรอง") — **not** the same copy as the true
  empty state, so an admin filtering a populated list to nothing isn't told "ยังไม่มีรายการ" (a false
  claim) — table body only, doesn't replace the filter bar or Add button
- **Error, no cache:** `ADMIN.MESSAGES.LOAD_EXPENSES_FAILED`, replaces the table, no toast
- **Error, cached value present:** SWR — `app-admin-refresh-hint` shows `ADMIN.COMMON.REFRESH_FAILED`
  (reused)
- **Save/Delete error:** `AlertService.error()`, branches on `error.error.errorCode` via
  `extractApiErrorMessage()`, falls back to `ADMIN.MESSAGES.SAVE_FAILED`/`DELETE_FAILED` (reused)
- **Vehicle-required validation error (new, this revision):** inline `admin-error` under the vehicle
  dropdown, `ADMIN.VALIDATION.REQUIRED` (reused key — this is a plain required-field error, no new
  message needed) when Save is attempted with the placeholder still showing

---

## 9. i18n keys to add

Reused, not re-added (confirmed live, §0): `ADMIN.COMMON.{ACTIONS,EDIT,CANCEL,SAVE,SAVING,DELETE,
DELETING,DELETE_CONFIRM_TITLE,DELETE_CONFIRM_MESSAGE,REFRESH_FAILED}`, `ADMIN.VALIDATION.{REQUIRED,
POSITIVE_NUMBER,FORM_INVALID}`, `ADMIN.MESSAGES.{CREATED,UPDATED,DELETED,SAVE_FAILED,DELETE_FAILED}`.

**New**, all under `ADMIN.EXPENSES.*` plus one `ADMIN.PAGES.*` / one `ADMIN.MESSAGES.*` key — all
three locale files in the same commit (design-system §9):

| Key | TH | EN | ZH |
|---|---|---|---|
| ADMIN.PAGES.EXPENSES | ค่าใช้จ่าย | Expenses | 费用 |
| ADMIN.EXPENSES.SUBTITLE | บันทึกค่าใช้จ่ายของรถและส่วนกลาง | Log vehicle and central expenses | 记录车辆及中央费用 |
| ADMIN.EXPENSES.TABLE_TITLE | รายการค่าใช้จ่าย | Expense List | 费用列表 |
| ADMIN.EXPENSES.ADD | เพิ่มค่าใช้จ่าย | Add Expense | 添加费用 |
| ADMIN.EXPENSES.ADD_TITLE | บันทึกค่าใช้จ่ายใหม่ | Record New Expense | 记录新费用 |
| ADMIN.EXPENSES.EDIT_TITLE | แก้ไขค่าใช้จ่าย | Edit Expense | 编辑费用 |
| ADMIN.EXPENSES.MODAL_HINT | กรอกรายละเอียดค่าใช้จ่าย | Fill in the expense details | 填写费用详情 |
| ADMIN.EXPENSES.VEHICLE | รถ | Vehicle | 车辆 |
| ADMIN.EXPENSES.VEHICLE_CENTRAL_OPTION | ส่วนกลาง / ไม่ผูกคัน | Central / Not linked to a vehicle | 中央/不绑定车辆 |
| ADMIN.EXPENSES.VEHICLE_HINT | เลือก "ส่วนกลาง / ไม่ผูกคัน" หากไม่ได้จ่ายเพื่อรถคันใดคันหนึ่ง — คนละเรื่องกับหมวดหมู่ "ส่วนกลาง" ด้านล่าง | Choose "Central / Not linked" if this isn't tied to one vehicle — separate from the "Central" category below | 若非针对单一车辆的支出请选择"中央/不绑定"——与下方"中央"类别无关 |
| ADMIN.EXPENSES.CATEGORY | ประเภทค่าใช้จ่าย | Category | 类别 |
| ADMIN.EXPENSES.CATEGORY_OTHER_LABEL | ระบุประเภท (อื่นๆ) | Specify category (Other) | 请注明类别(其他) |
| ADMIN.EXPENSES.CATEGORY_OTHER_REQUIRED | กรุณาระบุประเภทเมื่อเลือก "อื่นๆ" | Please specify the category when "Other" is selected | 选择"其他"时请注明类别 |
| ADMIN.EXPENSES.CATEGORIES.FUEL | น้ำมัน | Fuel | 燃油 |
| ADMIN.EXPENSES.CATEGORIES.REPAIR | ซ่อม | Repair | 维修 |
| ADMIN.EXPENSES.CATEGORIES.VEHICLE_TAX | ภาษีรถ | Vehicle Tax | 车辆税 |
| ADMIN.EXPENSES.CATEGORIES.ACT | พ.ร.บ. | Compulsory Insurance (พ.ร.บ.) | 强制保险 |
| ADMIN.EXPENSES.CATEGORIES.INSURANCE | ประกัน | Insurance | 保险 |
| ADMIN.EXPENSES.CATEGORIES.INSPECTION | ตรวจสภาพ | Inspection | 车检 |
| ADMIN.EXPENSES.CATEGORIES.TIRE | ยาง | Tire | 轮胎 |
| ADMIN.EXPENSES.CATEGORIES.GPS | GPS | GPS | GPS |
| ADMIN.EXPENSES.CATEGORIES.CENTRAL | ส่วนกลาง | Central | 中央 |
| ADMIN.EXPENSES.CATEGORIES.OTHER | อื่นๆ | Other | 其他 |
| ADMIN.EXPENSES.AMOUNT | จำนวนเงิน (บาท) | Amount (THB) | 金额(泰铢) |
| ADMIN.EXPENSES.VAT_AMOUNT | ภาษีมูลค่าเพิ่ม (บาท) | VAT Amount (THB) | 增值税金额(泰铢) |
| ADMIN.EXPENSES.EXPENSE_DATE | วันที่จ่าย | Expense Date | 支出日期 |
| ADMIN.EXPENSES.RECEIPT_NO | เลขที่ใบเสร็จ/ใบกำกับภาษี | Receipt / Tax Invoice No. | 收据/税务发票号 |
| ADMIN.EXPENSES.PAID_BY | ผู้จ่าย/บัญชีที่จ่าย | Paid By | 付款人/账户 |
| ADMIN.EXPENSES.NOTE | หมายเหตุ | Note | 备注 |
| ADMIN.EXPENSES.NOTE_PLACEHOLDER | รายละเอียดเพิ่มเติม (ถ้ามี) | Additional details (optional) | 补充说明(可选) |
| ADMIN.EXPENSES.FILTER_VEHICLE | รถ: ทั้งหมด | Vehicle: All | 车辆:全部 |
| ADMIN.EXPENSES.FILTER_VEHICLE_CENTRAL_ONLY | เฉพาะส่วนกลาง / ไม่ผูกคัน | Central / Not linked only | 仅中央/不绑定 |
| ADMIN.EXPENSES.FILTER_CATEGORY | ประเภท: ทั้งหมด | Category: All | 类别:全部 |
| ADMIN.EXPENSES.FILTER_DATE_FROM | จากวันที่ | From Date | 起始日期 |
| ADMIN.EXPENSES.FILTER_DATE_TO | ถึงวันที่ | To Date | 截止日期 |
| ADMIN.EXPENSES.EMPTY_TITLE | ยังไม่มีรายการค่าใช้จ่าย | No expenses recorded yet | 暂无费用记录 |
| ADMIN.EXPENSES.EMPTY_BODY | เริ่มบันทึกค่าใช้จ่ายของรถหรือส่วนกลางได้ที่ปุ่ม "เพิ่มค่าใช้จ่าย" | Start logging vehicle or central expenses with the "Add Expense" button | 点击"添加费用"开始记录车辆或中央支出 |
| ADMIN.EXPENSES.NO_MATCH | ไม่พบรายการที่ตรงกับตัวกรอง | No expenses match the current filters | 没有符合当前筛选条件的费用 |
| ADMIN.MESSAGES.LOAD_EXPENSES_FAILED | ไม่สามารถโหลดข้อมูลค่าใช้จ่ายได้ | Unable to load expenses. | 无法加载费用数据 |

---

## 10. Design-system conformance

- **Reused patterns:** `app-admin-dropdown` (§3.1) for vehicle/category selects, in both the form
  AND the filter bar (two different, explicitly documented sentinel/placeholder contracts — §4.1.1
  vs §6.2, not conflated); button roles §4 (Save = 1 primary/modal, Cancel = secondary, row Delete =
  `.admin-btn-danger`/`.admin-icon-btn` danger composition); pill input shape §5 for every single-line
  control, moderate-radius textarea for Note; `p-calendar` for `expenseDate` and the filter date
  range (§3); optimistic modal open + `AlertService` only, never `Swal.fire()` (§6); title/subtitle
  from route data only, no body `<h2>` (§7); Full-section empty state (§12 log, OBRS-209);
  right-aligned money columns (§12 log, OBRS-231); component split (list-table/form-modal/
  delete-modal) mirroring OBRS-261; parameterized root-scoped store mirroring
  `RefundVoidReportStore`; client-side status-style filter mirroring
  `VehiclesPageComponent.selectedStatusFilter`
- **New pattern:**
  1. **Explicit, non-empty, required sentinel value on an optional-at-the-DTO-level form select**
     (`vehicleSelection`'s `'CENTRAL_NONE'`, §4.1.1) — needed because `app-admin-dropdown` collapses
     every option value AND its own "nothing selected" state through `String(x ?? '')` (verified,
     §0), so a `null`-valued option is indistinguishable from an untouched placeholder inside the
     component. The fix keeps §3.1's placeholder-first contract intact (the control still starts
     genuinely empty, still shows the field-name placeholder, still pre-seeds nothing) while adding
     a real, non-colliding value for the "explicitly no vehicle" case, and moves the DTO's actual
     `null` to the payload-mapper boundary only. Reuse this exact shape — non-empty sentinel constant
     + required validator + edge-mapping in the payload function, never inside the control's own
     value — for the next optional-relationship dropdown anywhere in the admin module that needs an
     explicit "none" choice distinguishable from "not yet answered." Recommend adding this row to
     `docs/design-system.md` §12's pattern log once implemented.
- **Confirm:** selects use `app-admin-dropdown` with a field-name placeholder and no pre-seeded
  default (§4.1's `vehicleSelection`/`category` both start blank; the sentinel option is a real
  selectable value, not a default) · exactly one primary button per screen (Add) and per modal
  (Save) · no raw hex — reuses `.admin-field`/`.admin-btn*`/`--admin-*` tokens throughout · single
  title surface (route-driven) · i18n keys land in en/th/zh in the same commit (§9) · error handling
  branches on `errorCode`, never localized `message` (§8).

---

## 11. Open follow-ups (flagged, not blocking this card)

1. If a later Epic-684 child adds server-side paging to `GET /expenses`, it MUST also either move
   category/date-range filtering server-side or explicitly fetch past the page cap before applying
   them client-side (§6.3.1) — otherwise the client-side filters silently under-report.
2. If category/date-range filter state is ever asked to survive a reload/be shareable, promote them
   to query-param-driven state (§6.3.2) — not in scope for this MVP card.
