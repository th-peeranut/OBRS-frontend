import { extractApiErrorCode } from '../../../../shared/lib/api-error-code';
import {
  AdminLookupDto,
  AdminRouteDto,
  AdminScheduleDto,
  AdminScheduleSetDto,
  AdminStatusDto,
  AdminUserDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
  CreateSchedulePayload,
  CreateScheduleSetPayload,
  getAdminLookupLabel,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';
import { combineBangkokDateTime } from '../../../../shared/lib/api-date-time';
import { formatDisplayDate, formatDisplayDateTime } from '../../../../shared/lib/display-date-time';

// Pure mappers/formatters/normalizers extracted from SchedulesPageComponent
// (OBRS-214, mirroring OBRS-208's routes.mappers.ts). No Angular/service
// dependencies — every locale-dependent or translation-dependent value the
// original private methods pulled off `this` is now an explicit parameter,
// so these stay unit-testable in isolation.

export interface ScheduleRow {
  kind: 'set' | 'schedule';
  id: number;
  scheduleSetId: number | null;
  tripId: string;
  dateRange: string;
  startDate: string;
  endDate: string;
  departureTimes: string;
  routeSlug: string;
  route: string;
  vehicleTypeSlug: string;
  vehicleId: number | null;
  driverId: number | null;
  vehicle: string;
  driver: string;
  frequency: string;
  status: string;
  statusCode: string;
  updatedAt: string;
  // OBRS-283: only ever populated for kind==='schedule' (trip) rows — a
  // Schedule SET (kind==='set') has no such field on its DTO and always
  // stays undefined here, so its delete button keeps the unconditional
  // hard-delete path (see shared/lib/schedule-delete-mode.ts).
  deletable?: boolean;
  confirmedBookingCount?: number;
}

export interface Option {
  code: string;
  label: string;
}

export function statusClass(status: string): string {
  const normalizedStatus = status.trim().toUpperCase();

  if (normalizedStatus === 'DEPARTED') {
    return 'is-success';
  }

  if (normalizedStatus === 'SCHEDULED') {
    return 'is-warning';
  }

  return 'is-danger';
}

export function parseStatus(
  value: string | AdminStatusDto | null | undefined,
  locale: string
): { code: string; name: string } {
  return parseAdminStatus(value, locale);
}

// Splits a raw departureTimesText textarea value ("08:00, 09:00\n10:00")
// into a sorted, de-duplicated list of "HH:mm" strings. Returns `valid: false`
// (with an empty `times` list) when any entry fails the HH:mm check, so the
// caller can flip its own invalid-state flag instead of this function
// mutating component state directly.
export function parseDepartureTimes(value: unknown): { times: string[]; valid: boolean } {
  const rawValues = String(value ?? '')
    .split(/[\n,]+/)
    .map((time) => time.trim())
    .filter((time) => time.length > 0);

  const uniqueTimes = [...new Set(rawValues)];
  const allValid = uniqueTimes.every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  if (!allValid) {
    return { times: [], valid: false };
  }

  return { times: uniqueTimes.sort(), valid: true };
}

export function toDepartureTimesText(times: string[] | null | undefined): string {
  return (times ?? []).map((time) => String(time).slice(0, 5)).join(', ');
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

export function toDateControlValue(dateValue: string | null | undefined): Date | null {
  const normalizedDate = String(dateValue ?? '').trim();
  const [year, month, day] = normalizedDate.split('-').map((part) => Number(part));

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

export function toTimeInputValue(value: Date | null): string {
  if (!value || !Number.isFinite(value.getTime())) {
    return '';
  }

  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}

export function toTimeControlValue(timeValue: string | null | undefined): Date | null {
  const normalizedTime = String(timeValue ?? '').trim().slice(0, 5);
  const [hours, minutes] = normalizedTime.split(':').map((part) => Number(part));

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function toDateValue(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return toDateControlValue(normalizedValue);
  }

  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(normalizedValue)) {
    return toTimeControlValue(normalizedValue);
  }

  const parsedDate = new Date(normalizedValue);
  return Number.isFinite(parsedDate.getTime()) ? parsedDate : null;
}

export function toOptionalNumber(value: unknown): number | undefined {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : undefined;
}

export function toScheduleRow(
  scheduleSet: AdminScheduleSetDto,
  locale: string,
  dateLang: string | null | undefined
): ScheduleRow {
  const routeName =
    getAdminLookupLabel(scheduleSet.route, locale) ??
    getAdminTranslationLabel(scheduleSet.route?.translations, locale) ??
    scheduleSet.route?.slug ??
    '-';
  const vehicleTypeName =
    getAdminLookupLabel(scheduleSet.vehicleType, locale) ??
    getAdminTranslationLabel(scheduleSet.vehicleType?.translations, locale) ??
    scheduleSet.vehicleType?.slug ??
    '-';
  const status = parseStatus(scheduleSet.status, locale);
  const startDate = scheduleSet.startDate ?? '';
  const endDate = scheduleSet.endDate ?? '';

  return {
    id: scheduleSet.id,
    kind: 'set',
    scheduleSetId: null,
    tripId: `#SET-${scheduleSet.id}`,
    dateRange: `${formatDisplayDate(startDate, dateLang)} to ${formatDisplayDate(endDate, dateLang)}`,
    startDate,
    endDate,
    departureTimes: toDepartureTimesText(scheduleSet.departureTimes),
    routeSlug: scheduleSet.route?.slug ?? '',
    route: routeName,
    vehicleTypeSlug: scheduleSet.vehicleType?.slug ?? '',
    vehicleId: null,
    driverId: null,
    vehicle: vehicleTypeName,
    driver: '-',
    frequency: scheduleSet.frequency ?? '-',
    status: status.name,
    statusCode: status.code,
    updatedAt: formatDisplayDateTime(scheduleSet.updatedAt ?? scheduleSet.createdAt, dateLang),
  };
}

export function toGeneratedScheduleRow(
  schedule: AdminScheduleDto,
  locale: string,
  dateLang: string | null | undefined
): ScheduleRow {
  const routeName =
    getAdminLookupLabel(schedule.route, locale) ??
    getAdminTranslationLabel(schedule.route?.translations, locale) ??
    schedule.route?.slug ??
    '-';
  const vehicleTypeName =
    getAdminLookupLabel(schedule.vehicleType, locale) ??
    getAdminTranslationLabel(schedule.vehicleType?.translations, locale) ??
    schedule.vehicleType?.slug ??
    '-';
  const vehicleName =
    schedule.vehicle?.vehicleNumber ?? schedule.vehicle?.numberPlate ?? vehicleTypeName;
  const status = parseStatus(schedule.status, locale);
  const departureDateTime = splitDateTime(schedule.departureDateTime);

  return {
    id: schedule.id,
    kind: 'schedule',
    scheduleSetId: schedule.scheduleSetId ?? null,
    tripId: `#SCH-${schedule.id}`,
    dateRange: formatDisplayDate(departureDateTime.date, dateLang),
    startDate: departureDateTime.date,
    endDate: departureDateTime.date,
    departureTimes: departureDateTime.time,
    routeSlug: schedule.route?.slug ?? '',
    route: routeName,
    vehicleTypeSlug: schedule.vehicleType?.slug ?? '',
    vehicleId: schedule.vehicle?.id ?? null,
    driverId: schedule.driver?.id ?? null,
    vehicle: vehicleName,
    driver: schedule.driver?.fullName ?? '-',
    frequency: '-',
    status: status.name,
    statusCode: status.code,
    updatedAt: formatDisplayDateTime(schedule.updatedAt ?? schedule.createdAt, dateLang),
    deletable: schedule.deletable,
    confirmedBookingCount: schedule.confirmedBookingCount,
  };
}

// Fallback DTO shape used to populate the edit modal instantly from the row
// data already in memory, before the server detail fetch resolves. Does NOT
// touch any component state — unlike the original private method, whose call
// into parseDepartureTimes() could flip `departureTimesInvalid` as a side
// effect. The caller (openEditModal) resets that flag right after building
// the fallback anyway, so silently discarding the `valid` bit here is safe
// and preserves the original observable behavior.
export function toScheduleSetFallback(schedule: ScheduleRow): AdminScheduleSetDto {
  return {
    id: schedule.id,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    departureTimes: parseDepartureTimes(schedule.departureTimes).times,
    frequency: schedule.frequency,
    status: schedule.statusCode,
    route: {
      id: 0,
      slug: schedule.routeSlug,
    },
    vehicleType: {
      id: 0,
      slug: schedule.vehicleTypeSlug,
    },
  };
}

export function toScheduleDetailFallback(schedule: ScheduleRow): AdminScheduleDto {
  return {
    id: schedule.id,
    departureDateTime: `${schedule.startDate}T${schedule.departureTimes || '00:00'}:00`,
    status: schedule.statusCode,
    route: {
      id: 0,
      slug: schedule.routeSlug,
    },
    vehicleType: {
      id: 0,
      slug: schedule.vehicleTypeSlug,
    },
    vehicle: schedule.vehicleId
      ? {
          id: schedule.vehicleId,
          vehicleNumber: schedule.vehicle,
        }
      : undefined,
    driver: schedule.driverId
      ? {
          id: schedule.driverId,
          fullName: schedule.driver,
        }
      : undefined,
  };
}

export function toRouteOptions(routes: AdminRouteDto[], locale: string): Option[] {
  return routes
    .map((route) => ({
      code: route.slug,
      label:
        getAdminLookupLabel(route, locale) ??
        getAdminTranslationLabel(route.translations, locale) ??
        route.slug,
    }))
    .filter((option) => option.code.length > 0);
}

export function toVehicleTypeOptions(
  vehicleTypes: AdminVehicleTypeDto[],
  locale: string
): Option[] {
  return vehicleTypes
    .map((vehicleType) => ({
      code: vehicleType.slug,
      label:
        getAdminLookupLabel(vehicleType, locale) ??
        getAdminTranslationLabel(vehicleType.translations, locale) ??
        vehicleType.slug,
    }))
    .filter((option) => option.code.length > 0);
}

export function toVehicleOptions(vehicles: AdminVehicleDto[], locale: string): Option[] {
  return vehicles.map((vehicle) => {
    const vehicleTypeName =
      getAdminLookupLabel(vehicle.vehicleType, locale) ??
      getAdminTranslationLabel(vehicle.vehicleType?.translations, locale) ??
      vehicle.vehicleType?.slug ??
      '';
    const identifier =
      [vehicle.vehicleNumber, vehicle.numberPlate].filter(Boolean).join(' / ') || `#${vehicle.id}`;
    const label = vehicleTypeName ? `${identifier} - ${vehicleTypeName}` : identifier;

    return {
      code: String(vehicle.id),
      label,
    };
  });
}

export function isDriverUser(user: AdminUserDto): boolean {
  return (user.roles ?? []).some((role) => {
    const roleSlug = typeof role === 'string' ? role : role.slug;
    return String(roleSlug ?? '').trim().toLowerCase() === 'driver';
  });
}

export function toUserDisplayName(user: AdminUserDto): string {
  const profileName = [user.title, user.firstName, user.middleName, user.lastName]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ');

  return (
    user.fullName?.trim() ||
    profileName ||
    user.username?.trim() ||
    user.email?.trim() ||
    `#${user.id}`
  );
}

export function toDriverOptions(users: AdminUserDto[]): Option[] {
  return users
    .filter((user) => isDriverUser(user))
    .map((user) => ({
      code: String(user.id),
      label: toUserDisplayName(user),
    }));
}

export function toScheduleStatusOptions(lookups: AdminLookupDto[], locale: string): Option[] {
  return lookups
    .filter((lookup) => lookup.category === 'schedule_status')
    .map((lookup) => {
      const code = String(lookup.slug ?? '').trim().toLowerCase();
      return {
        code,
        label:
          getAdminTranslationLabel(lookup.translations, locale) ??
          getAdminTranslationLabel(lookup.translations, 'en') ??
          code.replace(/_/g, ' ').toUpperCase(),
      };
    })
    .filter((option) => option.code.length > 0);
}

// Builds the schedule-set create/update payload from the raw form value.
// departureTimesValid mirrors what parseDepartureTimes() used to mutate onto
// the component directly (`departureTimesInvalid = true`); the caller now
// sets that flag itself when `!departureTimesValid`.
export function toSchedulePayload(
  rawFormValue: Record<string, unknown>
): { payload: CreateScheduleSetPayload; departureTimesValid: boolean } {
  const parsedDepartureTimes = parseDepartureTimes(rawFormValue['departureTimesText']);

  return {
    payload: {
      startDate: String(rawFormValue['startDate'] ?? '').trim(),
      endDate: String(rawFormValue['endDate'] ?? '').trim(),
      departureTimes: parsedDepartureTimes.times,
      frequency: String(rawFormValue['frequency'] ?? 'Daily').trim() || undefined,
      status: String(rawFormValue['status'] ?? '').trim().toLowerCase(),
      route: String(rawFormValue['route'] ?? '').trim(),
      vehicleType: String(rawFormValue['vehicleType'] ?? '').trim(),
    },
    departureTimesValid: parsedDepartureTimes.valid,
  };
}

// OBRS-209 AC10: extracts `error.error.errorCode` from a failed schedule
// create/update call, following the same pattern as
// boarding-action-error.ts's extractBoardingActionErrorCode() — branch on
// the stable code, never the localized `message` (design-system §9).
export function extractScheduleErrorCode(error: unknown): string | null {
  return extractApiErrorCode(error, null);
}

export function toScheduleItemPayload(rawFormValue: Record<string, unknown>): CreateSchedulePayload {
  const vehicleId = toOptionalNumber(rawFormValue['vehicleId']);
  const driverId = toOptionalNumber(rawFormValue['driverId']);
  const departureDate = toDateInputValue(toDateValue(rawFormValue['departureDate']));
  const departureTime = toTimeInputValue(toDateValue(rawFormValue['departureTime']));

  return {
    departureDateTime: combineBangkokDateTime(departureDate, departureTime),
    route: String(rawFormValue['route'] ?? '').trim(),
    vehicleType: String(rawFormValue['vehicleType'] ?? '').trim(),
    ...(vehicleId !== undefined ? { vehicleId } : {}),
    ...(driverId !== undefined ? { driverId } : {}),
  };
}
