import {
  AdminExpenseDto,
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

/** The 10 fixed `ExpenseCategory` enum codes (SA-locked contract) — a static
 * list, not a Lookup-API fetch, mirroring `promotions-page`'s
 * `discountTypeOptions`. */
export const EXPENSE_CATEGORY_CODES = [
  'FUEL',
  'REPAIR',
  'VEHICLE_TAX',
  'ACT',
  'INSURANCE',
  'INSPECTION',
  'TIRE',
  'GPS',
  'CENTRAL',
  'OTHER',
] as const;

export type ExpenseCategoryCode = (typeof EXPENSE_CATEGORY_CODES)[number];

export interface Option {
  code: string;
  label: string;
}

/** Pre-resolved (`translate.instant()`-ed by the component) labels for the
 * 10 fixed category codes — kept out of this file so the mapper stays free
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
  vehicleId: number | null;
  /** Table column 2: the vehicle identifier, or the muted "central" label
   * when `vehicleId === null` — never blank. */
  vehicleLabel: string;
  category: string;
  categoryOtherLabel: string;
  categoryDisplay: string;
  amount: number;
  vatAmount: number | null;
  /** Raw "YYYY-MM-DD" — feeds the edit-modal's p-calendar seed and the
   * client-side date-range filter's string comparison. */
  expenseDate: string;
  expenseDateDisplay: string;
  receiptNo: string;
  paidBy: string;
  note: string;
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
  dateLang: string | null | undefined
): ExpenseRow {
  const vehicle = dto.vehicleId !== null ? vehicles.find((v) => v.id === dto.vehicleId) : undefined;
  const vehicleLabel =
    dto.vehicleId === null ? centralLabel : vehicle ? vehicleIdentifier(vehicle) : `#${dto.vehicleId}`;
  const categoryLabel = categoryOptions.find((option) => option.code === dto.category)?.label ?? dto.category;

  return {
    id: dto.id,
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
    note: dto.note ?? '',
  };
}

/** Raw reactive-form value shape (`ExpenseFormModalComponent.expenseForm`).
 * Deliberately has NO properties for the audit fields (createdBy/At,
 * updatedBy/At) — §9's "no accidental round-trip" is structural, not just a
 * mapper convention. */
export interface ExpenseFormValue {
  vehicleSelection: string;
  category: string;
  categoryOtherLabel: string;
  amount: number | string | null;
  vatAmount: number | string | null;
  expenseDate: Date | string | null;
  receiptNo: string | null;
  paidBy: string | null;
  note: string | null;
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
  return {
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
    note: toNullableTrimmedString(formValue.note),
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
