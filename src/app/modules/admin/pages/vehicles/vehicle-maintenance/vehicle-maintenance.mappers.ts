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
  statusId: number;
  status: string;
  notes: string;
}

export interface MaintenanceStatusOption {
  code: string;
  label: string;
}

/** design-system §3.1: options carry the Lookup's numeric id as `code` (the
 * backend's `maintenanceStatusId` field), not its slug. */
export function toMaintenanceStatusOptions(
  lookups: AdminLookupDto[],
  locale: string
): MaintenanceStatusOption[] {
  return lookups
    .filter((lookup) => lookup.category === 'maintenance_status')
    .map((lookup) => ({
      code: String(lookup.id),
      label:
        getAdminTranslationLabel(lookup.translations, locale) ??
        getAdminTranslationLabel(lookup.translations, 'en') ??
        lookup.slug,
    }));
}

export function toMaintenanceRow(
  dto: AdminVehicleMaintenanceDto,
  locale: string,
  dateLang: string | null | undefined
): MaintenanceRow {
  const startDate = dto.startDate ?? '';
  const endDate = dto.endDate ?? '';
  const nextDueDate = dto.nextDueDate ?? '';

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
    statusId: dto.maintenanceStatus?.id ?? 0,
    status:
      getAdminTranslationLabel(dto.maintenanceStatus?.translations, locale) ??
      getAdminTranslationLabel(dto.maintenanceStatus?.translations, 'en') ??
      dto.maintenanceStatus?.slug ??
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
  const maintenanceStatusId = Number(rawFormValue['maintenanceStatusId']);

  return {
    reason: String(rawFormValue['reason'] ?? '').trim(),
    startDate: toDateInputValue(rawFormValue['startDate'] as Date | null),
    endDate: endDate || null,
    nextDueDate: nextDueDate || null,
    maintenanceStatusId: Number.isFinite(maintenanceStatusId) ? maintenanceStatusId : 0,
    notes: String(rawFormValue['notes'] ?? '').trim() || null,
  };
}
