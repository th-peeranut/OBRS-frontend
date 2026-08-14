import {
  AdminVehicleMaintenancePlanDto,
  CreateVehicleMaintenancePlanPayload,
} from '../../../../../services/admin/admin-api.service';
import { formatDisplayDate } from '../../../../../shared/lib/display-date-time';

// Pure mappers/formatters for AppVehicleMaintenancePlanPanelComponent
// (OBRS-1333), following the pattern established by
// vehicle-maintenance.mappers.ts / expenses-page.mappers.ts: no Angular/
// service dependencies, every locale-dependent value is an explicit
// parameter, so these stay unit-testable in isolation.

export interface Option {
  code: string;
  label: string;
}

/**
 * OBRS-1333: the SA locked `part` as a closed, code-level set — the backend's
 * `EMaintenancePart` enum, persisted as its `name()` plus a matching DB
 * `CHECK` constraint and a parity test on that side (see that enum's
 * javadoc). This mirrors `expenses-page.mappers.ts`'s `EXPENSE_CATEGORY_CODES`
 * (a static list, NOT a `lookups` category fetch) — deliberately NOT
 * `vehicle-maintenance.mappers.ts`'s Lookup-slug pattern, which
 * `maintenance_status` uses because that one IS an operator-editable
 * catalogue. Order and values must stay byte-identical to the backend enum's
 * declaration order (confirmed 2026-08-14 against
 * `com.example.demo.enums.EMaintenancePart`).
 *
 * OBRS-1333 owner decision (2026-08-14): `SPARK_PLUGS` stays — the fleet may
 * mix petrol/diesel and fuel type is not tracked anywhere in the schema
 * (`V8__seed_real_minibus_fleet.sql` notes model/year are still absent per
 * OBRS-316) — and `TIMING_BELT` was added, appended LAST (after
 * `TRANSMISSION_FLUID`) because the backend enum appends it last too, and
 * there is no cross-repo gate that catches an order mismatch (this file's
 * own gate only pins internal FE consistency).
 */
export const MAINTENANCE_PART_CODES = [
  'ENGINE_OIL',
  'OIL_FILTER',
  'AIR_FILTER',
  'CABIN_AIR_FILTER',
  'FUEL_FILTER',
  'SPARK_PLUGS',
  'BRAKE_PADS',
  'BRAKE_FLUID',
  'TIRES',
  'BATTERY',
  'COOLANT',
  'TRANSMISSION_FLUID',
  'TIMING_BELT',
] as const;

export type MaintenancePartCode = (typeof MAINTENANCE_PART_CODES)[number];

/** Pre-resolved (`translate.instant()`-ed by `VehiclesPageComponent`) labels
 * for the fixed part codes — kept out of this file so it stays free of any
 * Angular/TranslateService dependency, mirroring `expenses-page.mappers.ts`'s
 * `ExpenseCategoryLabels`. */
export interface MaintenancePartLabels {
  engineOil: string;
  oilFilter: string;
  airFilter: string;
  cabinAirFilter: string;
  fuelFilter: string;
  sparkPlugs: string;
  brakePads: string;
  brakeFluid: string;
  tires: string;
  battery: string;
  coolant: string;
  transmissionFluid: string;
  timingBelt: string;
}

export function toPartOptions(labels: MaintenancePartLabels): Option[] {
  return [
    { code: 'ENGINE_OIL', label: labels.engineOil },
    { code: 'OIL_FILTER', label: labels.oilFilter },
    { code: 'AIR_FILTER', label: labels.airFilter },
    { code: 'CABIN_AIR_FILTER', label: labels.cabinAirFilter },
    { code: 'FUEL_FILTER', label: labels.fuelFilter },
    { code: 'SPARK_PLUGS', label: labels.sparkPlugs },
    { code: 'BRAKE_PADS', label: labels.brakePads },
    { code: 'BRAKE_FLUID', label: labels.brakeFluid },
    { code: 'TIRES', label: labels.tires },
    { code: 'BATTERY', label: labels.battery },
    { code: 'COOLANT', label: labels.coolant },
    { code: 'TRANSMISSION_FLUID', label: labels.transmissionFluid },
    { code: 'TIMING_BELT', label: labels.timingBelt },
  ];
}

export interface PlanRow {
  id: number;
  vehicleId: number;
  /** The raw `EMaintenancePart` code — seeds the edit-modal dropdown. */
  part: string;
  /** Localized display label, resolved by matching `part` against the
   * `partOptions` passed in — mirrors how `toMaintenanceRow` resolves
   * `status` by matching `statusCode` against `statusOptions`. */
  partLabel: string;
  intervalKm: number | null;
  intervalDays: number | null;
  lastDoneKm: number | null;
  /** Raw "YYYY-MM-DD" (or '') — seeds the edit-modal p-datePicker control. */
  lastDoneDate: string;
  lastDoneDateDisplay: string;
  active: boolean;
  /** Backend-derived, read-only — never recomputed on the FE. */
  nextDueKm: number | null;
  nextDueDate: string;
  nextDueDateDisplay: string;
}

export function toPlanRow(
  dto: AdminVehicleMaintenancePlanDto,
  partOptions: Option[],
  dateLang: string | null | undefined
): PlanRow {
  const lastDoneDate = dto.lastDoneDate ?? '';
  const nextDueDate = dto.nextDueDate ?? '';
  const part = String(dto.part ?? '').trim();

  return {
    id: dto.id,
    vehicleId: dto.vehicleId,
    part,
    partLabel: partOptions.find((option) => option.code === part)?.label ?? part,
    intervalKm: dto.intervalKm ?? null,
    intervalDays: dto.intervalDays ?? null,
    lastDoneKm: dto.lastDoneKm ?? null,
    lastDoneDate,
    lastDoneDateDisplay: lastDoneDate ? formatDisplayDate(lastDoneDate, dateLang) : '',
    active: dto.active,
    nextDueKm: dto.nextDueKm ?? null,
    nextDueDate,
    nextDueDateDisplay: nextDueDate ? formatDisplayDate(nextDueDate, dateLang) : '',
  };
}

/** "YYYY-MM-DD" string <-> local calendar Date, mirroring
 * `vehicle-maintenance.mappers.ts`'s `toDateInputValue()`/`toDateControlValue()`
 * (kept as a local copy — same per-page-mappers convention). */
export function toDateInputValue(value: Date | null): string {
  if (!value || !Number.isFinite(value.getTime())) {
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

function hasValue(rawValue: unknown): boolean {
  return rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== '';
}

/** intervalKm and intervalDays empty at the same time — a `FormGroup`-level
 * (not per-control) rule mirroring `hasMaintenanceDateRangeError()`'s pure-fn
 * shape: called from the template via `hasIntervalError()`, and from
 * `submitPlan()` before the request goes out. */
export function hasIntervalError(rawFormValue: Record<string, unknown>): boolean {
  return !hasValue(rawFormValue['intervalKm']) && !hasValue(rawFormValue['intervalDays']);
}

function toNullableNumber(rawValue: unknown): number | null {
  if (!hasValue(rawValue)) {
    return null;
  }
  const numeric = Number(rawValue);
  return Number.isFinite(numeric) ? numeric : null;
}

export function toPlanPayload(
  rawFormValue: Record<string, unknown>
): CreateVehicleMaintenancePlanPayload {
  return {
    part: String(rawFormValue['part'] ?? '').trim(),
    intervalKm: toNullableNumber(rawFormValue['intervalKm']),
    intervalDays: toNullableNumber(rawFormValue['intervalDays']),
    lastDoneKm: toNullableNumber(rawFormValue['lastDoneKm']),
    lastDoneDate: toDateInputValue(rawFormValue['lastDoneDate'] as Date | null) || null,
  };
}
