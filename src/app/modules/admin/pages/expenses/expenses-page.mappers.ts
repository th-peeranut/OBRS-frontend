import {
  AdminExpenseDto,
  AdminExpenseItemDto,
  AdminOwnerDto,
  AdminVehicleDto,
  CreateExpensePayload,
} from '../../../../services/admin/admin-api.service';
import { formatDisplayDate } from '../../../../shared/lib/display-date-time';

// Pure mappers/formatters for ExpensesPageComponent (OBRS-685), following the
// pattern established by schedules.mappers.ts / vehicle-maintenance.mappers.ts:
// no Angular/service dependencies, every locale-dependent value is an
// explicit parameter, so these stay unit-testable in isolation.

/**
 * UX-OBRS-685 §4.1.1 (Scrutinize findings 1+2, revised spec): `app-admin-dropdown`
 * coerces every option value AND its own "nothing selected" state through
 * `String(x ?? '')`, so a `null`-valued option is indistinguishable from an
 * untouched placeholder inside the component. A `null`-valued option would
 * therefore emit `''` on the wire, not `null` — a live 400 against the
 * backend's nullable `Long vehicleId`, and a resting-state/central aliasing
 * bug on a cost-tracking screen. This sentinel is a distinct, deliberately
 * non-empty, non-numeric token that can never collide with a real
 * `String(vehicle.id)` option value — it is a REAL selectable option, not a
 * pre-seeded default (§3.1 stays intact: the control still starts blank,
 * showing the field-name placeholder). Only `toExpensePayload()` below
 * translates it to a real `null`, at the submit boundary — never inside the
 * control's own value. New pattern, logged in design-system.md §12: reuse
 * this exact shape (sentinel constant + required validator + edge-mapping in
 * the payload function) for the next optional-relationship dropdown that
 * needs an explicit "none" distinguishable from "not yet answered".
 */
export const VEHICLE_CENTRAL_SENTINEL = 'CENTRAL_NONE';

/**
 * OBRS-1374: the same sentinel shape as `VEHICLE_CENTRAL_SENTINEL` above, for the same reason,
 * on the bill-line `part` dropdown. "Not a part" is a REAL answer here (labour, service,
 * sundry - AC3), and without an explicit option for it an owner who picked a part by mistake
 * could never take it back: `app-admin-dropdown` has no clear affordance, only a placeholder
 * that is unreachable once a value is set. Translated to a real `null` only in
 * `toExpensePayload()`, at the submit boundary.
 */
export const EXPENSE_ITEM_PART_NONE_SENTINEL = 'PART_NONE';

/** The 16 fixed `ExpenseCategory` enum codes (SA-locked contract) — a static
 * list, not a Lookup-API fetch, mirroring `promotions-page`'s
 * `discountTypeOptions`.
 *
 * OBRS-961 added TOLL / PERMIT_FEE / DRIVER_WAGE / INSTALMENT, OBRS-1363
 * added PARKING_FEE and OBRS-1388 added PARCEL_COMPENSATION (the parcel
 * damage-claim payout, §5 `DriverCashService#recordParcelClaimPayout`). They
 * are appended BEFORE CENTRAL and OTHER on purpose: nothing the owner has
 * already learned the position of moves, and OTHER stays visually last as
 * the catch-all. This order must stay identical to the backend
 * `EExpenseCategory` declaration order — the values themselves are pinned
 * against the DB CHECK by `ExpenseCategoryCheckConstraintParityTest`. */
export const EXPENSE_CATEGORY_CODES = [
  'FUEL',
  'REPAIR',
  'VEHICLE_TAX',
  'ACT',
  'INSURANCE',
  'INSPECTION',
  'TIRE',
  'GPS',
  'TOLL',
  'PERMIT_FEE',
  'DRIVER_WAGE',
  'INSTALMENT',
  'PARKING_FEE',
  'PARCEL_COMPENSATION',
  'CENTRAL',
  'OTHER',
] as const;

export type ExpenseCategoryCode = (typeof EXPENSE_CATEGORY_CODES)[number];

export interface Option {
  code: string;
  label: string;
}

/** Pre-resolved (`translate.instant()`-ed by the component) labels for the
 * 16 fixed category codes — kept out of this file so the mapper stays free
 * of any Angular/TranslateService dependency, mirroring
 * `promotions-page.mappers.ts`'s `PromotionOptionLabels`. */
export interface ExpenseCategoryLabels {
  fuel: string;
  repair: string;
  vehicleTax: string;
  act: string;
  insurance: string;
  inspection: string;
  tire: string;
  gps: string;
  toll: string;
  permitFee: string;
  driverWage: string;
  instalment: string;
  parkingFee: string;
  parcelCompensation: string;
  central: string;
  other: string;
}

export function toExpenseCategoryOptions(labels: ExpenseCategoryLabels): Option[] {
  return [
    { code: 'FUEL', label: labels.fuel },
    { code: 'REPAIR', label: labels.repair },
    { code: 'VEHICLE_TAX', label: labels.vehicleTax },
    { code: 'ACT', label: labels.act },
    { code: 'INSURANCE', label: labels.insurance },
    { code: 'INSPECTION', label: labels.inspection },
    { code: 'TIRE', label: labels.tire },
    { code: 'GPS', label: labels.gps },
    { code: 'TOLL', label: labels.toll },
    { code: 'PERMIT_FEE', label: labels.permitFee },
    { code: 'DRIVER_WAGE', label: labels.driverWage },
    { code: 'INSTALMENT', label: labels.instalment },
    { code: 'PARKING_FEE', label: labels.parkingFee },
    { code: 'PARCEL_COMPENSATION', label: labels.parcelCompensation },
    { code: 'CENTRAL', label: labels.central },
    { code: 'OTHER', label: labels.other },
  ];
}

/** UX-OBRS-685 §4.1.1: the central option is always FIRST and carries the
 * sentinel — no option ever carries `code: ''`, so the dropdown's own
 * placeholder-header (driven by the control's value being unset) can never
 * alias to an explicit choice. The vehicle identifier formula mirrors
 * `schedules.mappers.ts`'s `toVehicleOptions` (`[vehicleNumber, numberPlate]`
 * joined, falling back to `#id`) — mirrored, not imported, per this
 * codebase's per-page-mappers convention. */
export function toExpenseVehicleOptions(vehicles: AdminVehicleDto[], centralLabel: string): Option[] {
  return [
    { code: VEHICLE_CENTRAL_SENTINEL, label: centralLabel },
    ...vehicles.map((vehicle) => ({
      code: String(vehicle.id),
      label: vehicleIdentifier(vehicle),
    })),
  ];
}

/**
 * OBRS-808: the operator options for the admin-only picker.
 *
 * No sentinel option and no "all/none" entry, deliberately — unlike
 * `toExpenseVehicleOptions` above, where "central" is a real answer. Every
 * expense belongs to exactly one operator (`expenses.owner_id` is NOT NULL
 * since V55), so there is no such thing as an unowned expense for an option to
 * represent. An empty roster therefore renders an empty dropdown, which is a
 * broken state to surface, not a "none" to select.
 *
 * The order the backend sent is preserved, not re-sorted here: it orders by
 * `displayName` in SQL, and a second sort in the client would silently become
 * the real one the day the two disagree.
 */
export function toOwnerOptions(owners: AdminOwnerDto[]): Option[] {
  return owners.map((owner) => ({
    code: String(owner.id),
    label: ownerIdentifier(owner),
  }));
}

/** The label for one operator. `displayName` is what a human recognises;
 * `legalName` is only appended when it differs, so two similarly-named
 * operators stay distinguishable without every row carrying a redundant
 * "หจก. X (X)". */
export function ownerIdentifier(owner: AdminOwnerDto): string {
  const displayName = String(owner.displayName ?? '').trim();
  const legalName = String(owner.legalName ?? '').trim();
  if (!displayName) {
    return legalName || `#${owner.id}`;
  }
  return legalName && legalName !== displayName ? `${displayName} (${legalName})` : displayName;
}

/** The human-readable vehicle identifier (`[vehicleNumber, numberPlate]`
 * joined, falling back to `#id`). Exported so the page's vehicle FILTER
 * option list (§6.2) reuses this exact formula instead of re-inlining it —
 * keeping the form-dropdown and filter-dropdown labels from drifting. */
export function vehicleIdentifier(vehicle: AdminVehicleDto): string {
  return [vehicle.vehicleNumber, vehicle.numberPlate].filter(Boolean).join(' / ') || `#${vehicle.id}`;
}

/** Table column 3 (§3.1): when `category === 'OTHER'`, append the free-text
 * label the admin typed — `"อื่นๆ (categoryOtherLabel)"` shape, generalized
 * to whatever locale's "Other" label is passed in. */
export function toExpenseCategoryDisplay(
  category: string,
  categoryOtherLabel: string | null | undefined,
  categoryLabel: string
): string {
  const trimmedOther = String(categoryOtherLabel ?? '').trim();
  if (category === 'OTHER' && trimmedOther) {
    return `${categoryLabel} (${trimmedOther})`;
  }
  return categoryLabel;
}

export interface ExpenseRow {
  id: number;
  /** OBRS-808. `null` only when the response predates V55 or the row's operator
   * is not in the roster this caller holds — never a real "no operator". */
  ownerId: number | null;
  /** The operator's label for the admin-only table column and the edit modal's
   * read-only line. Empty string when it cannot be resolved (an `owner` caller
   * never fetches the roster at all — they get 403 — and does not render the
   * column), so a template can test it directly. */
  ownerLabel: string;
  vehicleId: number | null;
  /** Table column 2: the vehicle identifier, or the muted "central" label
   * when `vehicleId === null` — never blank. */
  vehicleLabel: string;
  category: string;
  categoryOtherLabel: string;
  categoryDisplay: string;
  amount: number;
  vatAmount: number | null;
  /** Raw "YYYY-MM-DD" — feeds the edit-modal's p-datePicker seed and the
   * client-side date-range filter's string comparison. */
  expenseDate: string;
  expenseDateDisplay: string;
  receiptNo: string;
  paidBy: string;
  /** OBRS-1577: the registry payee this bill was paid TO. `null` for every bill written before
   * V119, and for a bill whose payee the owner deliberately left blank — the two are the same
   * answer here and neither is guessed at. Not to be confused with `paidBy` above, which is who the
   * money came FROM. */
  payeeId: number | null;
  /** OBRS-1577: the payee's name as resolved server-side, carried on the ROW because the pickers
   * list ACTIVE payees only — a bill paid to a garage that has since been retired would otherwise
   * render blank in both the table and the edit modal. `''` when there is no payee. */
  payeeName: string;
  note: string;
  /** OBRS-960: `'FIELD'` (backend auto-created from a driver's cash-panel
   * expense entry) vs `'MANUAL'` (admin/owner-entered) — passed through
   * from `AdminExpenseDto.source`, defaulting an absent field (a
   * pre-OBRS-960 cached response) to `'MANUAL'` so it reads as the
   * pre-existing, unremarkable row shape. */
  source: 'FIELD' | 'MANUAL';
  /** OBRS-1374: the bill's lines, in `lineNo` order. `[]` for the bills nobody broke down.
   * Carried on the ROW because the edit modal opens synchronously from it (there is no
   * second detail fetch), so a row without lines would silently drop them on the next save. */
  items: ExpenseItemRow[];
}

/** OBRS-1374: one line of a bill as the table/modal reads it. `part` is `''` when the line is
 * not a part at all - the template tests it directly rather than rendering a blank label. */
export interface ExpenseItemRow {
  lineNo: number;
  part: string;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
}

export function toExpenseItemRow(dto: AdminExpenseItemDto): ExpenseItemRow {
  return {
    lineNo: dto.lineNo,
    part: dto.part ?? '',
    description: dto.description ?? '',
    quantity: dto.quantity ?? null,
    unitPrice: dto.unitPrice ?? null,
    amount: dto.amount,
  };
}

/**
 * `vehicles` is the already-fetched vehicle list (from the reused
 * `VehiclesStore`) — used to resolve `vehicleLabel` for a non-null
 * `vehicleId`. A `vehicleId` with no matching row (a vehicle deleted after
 * the expense was logged) falls back to `#id` rather than a blank cell.
 */
export function toExpenseRow(
  dto: AdminExpenseDto,
  vehicles: AdminVehicleDto[],
  categoryOptions: Option[],
  centralLabel: string,
  dateLang: string | null | undefined,
  owners: AdminOwnerDto[] = []
): ExpenseRow {
  const vehicle = dto.vehicleId !== null ? vehicles.find((v) => v.id === dto.vehicleId) : undefined;
  const vehicleLabel =
    dto.vehicleId === null ? centralLabel : vehicle ? vehicleIdentifier(vehicle) : `#${dto.vehicleId}`;
  const categoryLabel = categoryOptions.find((option) => option.code === dto.category)?.label ?? dto.category;

  // OBRS-808: an unresolvable owner falls back to `#id` rather than a blank
  // cell — the same choice `vehicleLabel` makes above, and for the same reason:
  // a blank cell reads as "central/none", which for an operator column would be
  // a lie (every expense has exactly one). An `owner` caller passes no roster at
  // all and gets '' — they never render the column.
  const ownerId = dto.ownerId ?? null;
  const owner = ownerId !== null ? owners.find((o) => o.id === ownerId) : undefined;
  const ownerLabel = owner ? ownerIdentifier(owner) : ownerId !== null && owners.length > 0 ? `#${ownerId}` : '';

  return {
    id: dto.id,
    ownerId,
    ownerLabel,
    vehicleId: dto.vehicleId,
    vehicleLabel,
    category: dto.category,
    categoryOtherLabel: dto.categoryOtherLabel ?? '',
    categoryDisplay: toExpenseCategoryDisplay(dto.category, dto.categoryOtherLabel, categoryLabel),
    amount: dto.amount,
    vatAmount: dto.vatAmount ?? null,
    expenseDate: dto.expenseDate ?? '',
    expenseDateDisplay: formatDisplayDate(dto.expenseDate, dateLang),
    receiptNo: dto.receiptNo ?? '',
    paidBy: dto.paidBy ?? '',
    payeeId: dto.payeeId ?? null,
    payeeName: dto.payeeName ?? '',
    note: dto.note ?? '',
    source: dto.source ?? 'MANUAL',
    items: (dto.items ?? []).map(toExpenseItemRow),
  };
}

/** Raw reactive-form value shape (`ExpenseFormModalComponent.expenseForm`).
 * Deliberately has NO properties for the audit fields (createdBy/At,
 * updatedBy/At) — §9's "no accidental round-trip" is structural, not just a
 * mapper convention. */
export interface ExpenseFormValue {
  /** OBRS-808: the admin-only operator choice, as a string because
   * `app-admin-dropdown` coerces every value through `String(x ?? '')` (see
   * VEHICLE_CENTRAL_SENTINEL above). `''` means either "this caller is not an
   * admin, so the control was never shown" or "an admin has not chosen yet" —
   * the two are indistinguishable HERE on purpose, because the payload treats
   * them identically (`ownerId: null`) and the difference that matters is
   * enforced by the required-validator, which only exists when the field is
   * shown. */
  ownerSelection: string;
  vehicleSelection: string;
  category: string;
  categoryOtherLabel: string;
  amount: number | string | null;
  vatAmount: number | string | null;
  expenseDate: Date | string | null;
  receiptNo: string | null;
  paidBy: string | null;
  /** OBRS-1577: the picker's value. A real number or `null` — unlike `ownerSelection` above this
   * control is NOT string-coerced, because `ExpensePayeePickerComponent` writes the id it was given
   * straight through rather than routing it via `String(x ?? '')` the way `app-admin-dropdown`
   * does. There is therefore no empty-string case to unpick at the payload boundary. */
  payeeId: number | null;
  note: string | null;
  /** OBRS-1374: the repeater's rows. Absent when the caller has no lines at all. */
  items?: ExpenseItemFormValue[];
}

/** OBRS-1374: one repeater row, raw. Every numeric control can hold `''` because an emptied
 * number input reports one - that is what `toNullableNumber` below is for. */
export interface ExpenseItemFormValue {
  part: string;
  description: string | null;
  quantity: number | string | null;
  unitPrice: number | string | null;
  amount: number | string | null;
}

/**
 * OBRS-1374 AC5: what the lines add up to, in whole satang, rounded once at the end.
 *
 * Money in a JS `number` is the reason this is a function and not an inline `reduce`: the
 * owner types 0.1 and 0.2 and gets 0.30000000000000004, which would show a difference of
 * 4e-17 against a total that is visibly identical. Rounding to satang before comparing is what
 * makes "these agree" mean what the owner sees on screen.
 */
export function expenseItemsTotal(items: ExpenseItemFormValue[] | undefined): number {
  const satang = (items ?? []).reduce(
    (sum, item) => sum + Math.round((toNullableNumber(item.amount) ?? 0) * 100),
    0
  );
  return satang / 100;
}

/** OBRS-1374 AC5: the same comparison the backend makes, made here first so the owner is told
 * BEFORE they press save rather than by a 400 afterwards. No lines is never a mismatch (AC4). */
export function expenseItemsMatchAmount(
  items: ExpenseItemFormValue[] | undefined,
  amount: number | string | null
): boolean {
  if (!items || items.length === 0) {
    return true;
  }
  return Math.round(expenseItemsTotal(items) * 100) === Math.round((toNullableNumber(amount) ?? 0) * 100);
}

/** "YYYY-MM-DD" string <-> local calendar Date — mirrors
 * `vehicle-maintenance.mappers.ts`'s `toDateInputValue`/`toDateControlValue`
 * (kept as a local copy, same per-page-mappers convention). */
export function toIsoDateString(value: Date | string | null | undefined): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (!Number.isFinite(value.getTime())) {
    return '';
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toDateControlValue(dateValue: string | null | undefined): Date | null {
  const normalizedDate = String(dateValue ?? '').trim();
  const [year, month, day] = normalizedDate.split('-').map((part) => Number(part));

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toNullableTrimmedString(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * UX-OBRS-685 §4.1.1 — the ONLY place the vehicle sentinel is translated to a
 * real `null`, at the submit boundary. `categoryOtherLabel` is re-derived
 * from `formValue.category` here too, NOT trusted from whatever the
 * (possibly stale, possibly hidden-but-not-yet-cleared) control currently
 * holds — belt-and-suspenders alongside the form's own `valueChanges` clear,
 * so the wire payload can never carry a stray label when `category !==
 * 'OTHER'`, even if a future edit to the reveal logic regresses.
 */
export function toExpensePayload(formValue: ExpenseFormValue): CreateExpensePayload {
  const ownerSelection = String(formValue.ownerSelection ?? '').trim();
  return {
    // OBRS-808. `Number('')` is 0, not null — and 0 is a perfectly serializable
    // id that the backend would reject as EXPENSE_OWNER_INVALID with a message
    // naming operator #0, which explains nothing to anyone. The explicit empty
    // check is what keeps "not chosen" a null on the wire.
    ownerId: ownerSelection === '' ? null : Number(ownerSelection),
    vehicleId:
      formValue.vehicleSelection === VEHICLE_CENTRAL_SENTINEL
        ? null
        : Number(formValue.vehicleSelection),
    category: formValue.category,
    categoryOtherLabel:
      formValue.category === 'OTHER' ? toNullableTrimmedString(formValue.categoryOtherLabel) : null,
    amount: toNullableNumber(formValue.amount) ?? 0,
    vatAmount: toNullableNumber(formValue.vatAmount),
    expenseDate: toIsoDateString(formValue.expenseDate),
    receiptNo: toNullableTrimmedString(formValue.receiptNo),
    paidBy: toNullableTrimmedString(formValue.paidBy),
    payeeId: formValue.payeeId ?? null,
    note: toNullableTrimmedString(formValue.note),
    // OBRS-1374: the ONE place the part sentinel becomes a real `null`, mirroring the vehicle
    // sentinel above. An empty repeater sends `[]`, which the backend reads as "no breakdown".
    items: (formValue.items ?? []).map((item) => ({
      part:
        !item.part || item.part === EXPENSE_ITEM_PART_NONE_SENTINEL ? null : item.part,
      description: String(item.description ?? '').trim(),
      quantity: toNullableNumber(item.quantity),
      unitPrice: toNullableNumber(item.unitPrice),
      amount: toNullableNumber(item.amount) ?? 0,
    })),
  };
}

export interface ExpenseFilterOptions {
  /** '' = all categories. */
  category: string;
  /** UX-OBRS-685 §6.2: the vehicle filter's "central only" option is a
   * client-side predicate layered on top of the (unfiltered) server fetch —
   * NOT a separate query param. */
  centralOnly: boolean;
  from: Date | null;
  to: Date | null;
}

/**
 * UX-OBRS-685 §6.2 — the ONE pure function all three client-side filter
 * predicates (category, date-range, vehicle-filter's "central only") run
 * through, mirroring `vehicles-page.mappers.ts`'s `filterVehiclesByStatus`.
 * Kept together so the three can't drift into separate ad-hoc `.filter()`
 * calls in the component. `expenseDate` ("YYYY-MM-DD") compares lexically
 * against the `from`/`to` Dates normalized to the same format — safe because
 * ISO `YYYY-MM-DD` string ordering matches calendar-date ordering.
 */
export function filterExpensesByCategoryAndRange(
  rows: ExpenseRow[],
  filters: ExpenseFilterOptions
): ExpenseRow[] {
  const fromIso = filters.from ? toIsoDateString(filters.from) : '';
  const toIso = filters.to ? toIsoDateString(filters.to) : '';

  return rows.filter((row) => {
    if (filters.centralOnly && row.vehicleId !== null) {
      return false;
    }
    if (filters.category && row.category !== filters.category) {
      return false;
    }
    if (fromIso && row.expenseDate < fromIso) {
      return false;
    }
    if (toIso && row.expenseDate > toIso) {
      return false;
    }
    return true;
  });
}
