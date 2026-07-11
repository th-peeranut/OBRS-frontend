import {
  AdminLookupDto,
  AdminRouteDto,
  AdminScheduleDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
  CreateSchedulePayload,
  DriverDto,
  getAdminLookupLabel,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { combineBangkokDateTime } from '../../../../shared/lib/api-date-time';

// Pure mappers/formatters/normalizers extracted from StaffSchedulesPageComponent
// (OBRS-249, mirroring OBRS-214's admin schedules.mappers.ts). No Angular/service
// dependencies — every locale-dependent value the original private methods
// pulled off `this` is now an explicit parameter, so these stay unit-testable
// in isolation.
//
// Note: `departure`/`updatedAt` on ScheduleRow stay RAW ISO strings (unlike the
// admin schedules page, which formats them at map time) — the template calls
// `displayDateTime()` (still on the component) to format them lazily, and the
// edit modal round-trips the raw value back through toFallbackDto()/
// splitDateTime(). Do not add formatting inside toRow().

export interface ScheduleRow {
  id: number;
  tripId: string;
  departure: string;
  route: string;
  routeSlug: string;
  vehicle: string;
  vehicleId: number | null;
  vehicleTypeSlug: string;
  driver: string;
  driverId: number | null;
  status: string;
  statusCode: string;
  updatedAt: string;
}

export interface Option {
  code: string;
  label: string;
}

export interface ScheduleFormValues {
  departureDate: Date | null;
  departureTime: Date | null;
  route: string;
  vehicleType: string;
  vehicleId: string;
  driverId: string;
}

export function splitDateTime(value: string | null | undefined): { date: string; time: string } {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    return { date: '', time: '' };
  }

  const [date, rawTime = ''] = normalizedValue.includes('T')
    ? normalizedValue.split('T')
    : normalizedValue.split(/\s+/);

  return {
    date,
    time: rawTime.slice(0, 5),
  };
}

export function toDateInputValue(value: Date | null): string {
  if (!value || !Number.isFinite(value.getTime())) {
    return '';
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function toDateControlValue(dateStr: string | null | undefined): Date | null {
  const s = String(dateStr ?? '').trim();
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function toTimeInputValue(value: Date | null): string {
  if (!value || !Number.isFinite(value.getTime())) {
    return '';
  }
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

export function toTimeControlValue(timeStr: string | null | undefined): Date | null {
  const s = String(timeStr ?? '').trim().slice(0, 5);
  const [h, min] = s.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  const date = new Date();
  date.setHours(h, min, 0, 0);
  return date;
}

export function toDateValue(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return toDateControlValue(s);
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return toTimeControlValue(s);
  const p = new Date(s);
  return Number.isFinite(p.getTime()) ? p : null;
}

export function toOptionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function toRow(s: AdminScheduleDto, locale: string): ScheduleRow {
  const status = parseAdminStatus(s.status, locale);
  return {
    id: s.id,
    tripId: `#SCH-${s.id}`,
    departure: s.departureDateTime ?? '-',
    route: getAdminLookupLabel(s.route, locale) ?? getAdminTranslationLabel(s.route?.translations, locale) ?? s.route?.slug ?? '-',
    routeSlug: s.route?.slug ?? '',
    vehicle: s.vehicle?.vehicleNumber ?? s.vehicle?.numberPlate ?? '-',
    vehicleId: s.vehicle?.id ?? null,
    vehicleTypeSlug: s.vehicleType?.slug ?? '',
    driver: s.driver?.fullName ?? '-',
    driverId: s.driver?.id ?? null,
    status: status.name,
    statusCode: status.code,
    updatedAt: s.updatedAt ?? s.createdAt ?? '-',
  };
}

export function toFallbackDto(row: ScheduleRow): AdminScheduleDto {
  return {
    id: row.id,
    departureDateTime: row.departure,
    status: row.statusCode,
    route: { id: 0, slug: row.routeSlug },
    vehicleType: { id: 0, slug: row.vehicleTypeSlug },
    vehicle: row.vehicleId ? { id: row.vehicleId, vehicleNumber: row.vehicle } : undefined,
    driver: row.driverId ? { id: row.driverId, fullName: row.driver } : undefined,
  };
}

// Builds the form-control values from a schedule DTO. Used both to
// `form.reset(values)` on the fallback/full detail load and to patch only the
// still-pristine controls once the async detail fetch resolves — the
// patch loop itself stays on the component since it mutates the FormGroup.
export function toScheduleFormValues(dto: AdminScheduleDto): ScheduleFormValues {
  const dep = splitDateTime(dto.departureDateTime);
  return {
    departureDate: toDateControlValue(dep.date),
    departureTime: toTimeControlValue(dep.time),
    route: dto.route?.slug ?? '',
    vehicleType: dto.vehicleType?.slug ?? '',
    vehicleId: dto.vehicle?.id ? String(dto.vehicle.id) : '',
    driverId: dto.driver?.id ? String(dto.driver.id) : '',
  };
}

export function toPayload(rawFormValue: Record<string, unknown>): CreateSchedulePayload {
  const departureDate = toDateInputValue(toDateValue(rawFormValue['departureDate']));
  const departureTime = toTimeInputValue(toDateValue(rawFormValue['departureTime']));
  const vehicleId = toOptionalNumber(rawFormValue['vehicleId']);
  const driverId = toOptionalNumber(rawFormValue['driverId']);
  return {
    departureDateTime: combineBangkokDateTime(departureDate, departureTime),
    route: String(rawFormValue['route'] ?? '').trim(),
    vehicleType: String(rawFormValue['vehicleType'] ?? '').trim(),
    ...(vehicleId !== undefined ? { vehicleId } : {}),
    ...(driverId !== undefined ? { driverId } : {}),
  };
}

export function toRouteOptions(routes: AdminRouteDto[], locale: string): Option[] {
  return routes.map((r) => ({
    code: r.slug,
    label: getAdminLookupLabel(r, locale) ?? getAdminTranslationLabel(r.translations, locale) ?? r.slug,
  }));
}

export function toVehicleTypeOptions(vehicleTypes: AdminVehicleTypeDto[], locale: string): Option[] {
  return vehicleTypes.map((vt) => ({
    code: vt.slug,
    label: getAdminLookupLabel(vt, locale) ?? getAdminTranslationLabel(vt.translations, locale) ?? vt.slug,
  }));
}

export function toVehicleOptions(vehicles: AdminVehicleDto[]): Option[] {
  return vehicles.map((v) => ({
    code: String(v.id),
    label: v.vehicleNumber ?? v.numberPlate ?? `#${v.id}`,
  }));
}

// Drivers already come pre-filtered from /private/users/drivers (OBRS-175);
// no role filtering needed here.
export function toDriverOptions(drivers: DriverDto[]): Option[] {
  return drivers.map((d) => ({
    code: String(d.id),
    label: d.name?.trim() || `#${d.id}`,
  }));
}

export function toScheduleStatusOptions(lookups: AdminLookupDto[], locale: string): Option[] {
  return lookups
    .filter((l) => l.category === 'schedule_status')
    .map((l) => ({
      code: String(l.slug ?? '').trim().toLowerCase(),
      label: getAdminTranslationLabel(l.translations, locale) ?? l.slug,
    }));
}
