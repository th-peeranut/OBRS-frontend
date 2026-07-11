import {
  AdminLookupDto,
  AdminVehicleMaintenanceDto,
  CreateVehicleMaintenancePayload,
  getAdminTranslationLabel,
} from '../../../../../services/admin/admin-api.service';
import { formatDisplayDate } from '../../../../../shared/lib/display-date-time';

// Pure mappers/formatters for AppVehicleMaintenancePanelComponent (OBRS-209),
// following the pattern established by schedules.mappers.ts (OBRS-214): no
// Angular/service dependencies, every locale-dependent value is an explicit
// parameter, so these stay unit-testable in isolation. Deliberately
// self-contained (does not import schedules.mappers.ts) — this is a
// page-local mapper file for the vehicles/vehicle-maintenance feature, not a
// shared cross-page utility.

export interface MaintenanceRow {
  id: number;
  vehicleId: number;
  reason: string;
  /** Raw "YYYY-MM-DD" (or '') — used to seed the edit-modal p-calendar controls. */
  startDate: string;
  endDate: string;
  nextDueDate: string;
  /** Localized display strings for the table. */
  startDateDisplay: string;
  endDateDisplay: string;
  nextDueDateDisplay: string;
  /** The `maintenance_status` Lookup slug (e.g. "scheduled") — the raw value
   * the backend round-trips, unlike a numeric id. */
  statusCode: string;
  status: string;
  notes: string;
}

export interface MaintenanceStatusOption {
  code: string;
  label: string;
}

/** design-system §3.1: options carry the Lookup's **slug** as `code` (the
 * backend's `maintenanceStatus` field is a slug string, not a numeric id —
 * same shape as the existing `vehicle_status` dropdown in vehicles-page). */
export function toMaintenanceStatusOptions(
  lookups: AdminLookupDto[],
  locale: string
): MaintenanceStatusOption[] {
  return lookups
    .filter((lookup) => lookup.category === 'maintenance_status')
    .map((lookup) => ({
      code: lookup.slug,
      label:
        getAdminTranslationLabel(lookup.translations, locale) ??
        getAdminTranslationLabel(lookup.translations, 'en') ??
        lookup.slug,
    }));
}

/** `statusOptions` is the same pre-filtered `maintenance_status` Lookup list
 * passed to `toMaintenanceStatusOptions` — the response DTO's
 * `maintenanceStatus` is a flat slug string, so the localized label is
 * resolved by matching that slug against the Lookup rows' `translations`,
 * mirroring how `vehicles-page.component.ts` derives its `vehicle_status`
 * dropdown labels. Falls back to the raw slug if no match is found (e.g. a
 * stale/deleted lookup) rather than showing a blank dash. */
export function toMaintenanceRow(
  dto: AdminVehicleMaintenanceDto,
  statusOptions: AdminLookupDto[],
  locale: string,
  dateLang: string | null | undefined
): MaintenanceRow {
  const startDate = dto.startDate ?? '';
  const endDate = dto.endDate ?? '';
  const nextDueDate = dto.nextDueDate ?? '';
  const statusCode = String(dto.maintenanceStatus ?? '').trim();
  const statusLookup = statusOptions.find(
    (lookup) => lookup.slug.trim().toLowerCase() === statusCode.toLowerCase()
  );

  return {
    id: dto.id,
    vehicleId: dto.vehicleId,
    reason: dto.reason ?? '',
    startDate,
    endDate,
    nextDueDate,
    startDateDisplay: formatDisplayDate(startDate, dateLang),
    endDateDisplay: endDate ? formatDisplayDate(endDate, dateLang) : '',
    nextDueDateDisplay: nextDueDate ? formatDisplayDate(nextDueDate, dateLang) : '',
    statusCode,
    status:
      getAdminTranslationLabel(statusLookup?.translations, locale) ??
      getAdminTranslationLabel(statusLookup?.translations, 'en') ??
      statusCode ??
      '-',
    notes: dto.notes ?? '',
  };
}

/** "YYYY-MM-DD" string <-> local calendar Date, mirroring
 * schedules.mappers.ts's toDateInputValue()/toDateControlValue() (kept as a
 * local copy — see the file header note on why this isn't a shared import). */
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

/** endDate >= startDate when both are present — mirrors
 * schedules-page.component.ts's hasDateRangeError(), blocking submit before
 * the request goes out. */
export function hasMaintenanceDateRangeError(rawFormValue: Record<string, unknown>): boolean {
  const startDate = toDateInputValue(rawFormValue['startDate'] as Date | null);
  const endDate = toDateInputValue(rawFormValue['endDate'] as Date | null);
  return !!startDate && !!endDate && startDate > endDate;
}

export function toMaintenancePayload(
  rawFormValue: Record<string, unknown>
): CreateVehicleMaintenancePayload {
  const endDate = toDateInputValue(rawFormValue['endDate'] as Date | null);
  const nextDueDate = toDateInputValue(rawFormValue['nextDueDate'] as Date | null);

  return {
    reason: String(rawFormValue['reason'] ?? '').trim(),
    startDate: toDateInputValue(rawFormValue['startDate'] as Date | null),
    endDate: endDate || null,
    nextDueDate: nextDueDate || null,
    maintenanceStatus: String(rawFormValue['maintenanceStatus'] ?? '').trim(),
    notes: String(rawFormValue['notes'] ?? '').trim() || null,
  };
}
