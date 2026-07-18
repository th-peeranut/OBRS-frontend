import { HttpErrorResponse } from '@angular/common/http';
import {
  ScheduleRow,
  extractScheduleErrorCode,
  isDriverUser,
  parseDepartureTimes,
  parseStatus,
  splitDateTime,
  statusClass,
  toDateControlValue,
  toDateInputValue,
  toDateValue,
  toDepartureTimesText,
  toDriverOptions,
  toGeneratedScheduleRow,
  toOptionalNumber,
  toRouteOptions,
  toScheduleDetailFallback,
  toScheduleItemPayload,
  toSchedulePayload,
  toScheduleRow,
  toScheduleSetFallback,
  toScheduleStatusOptions,
  toTimeControlValue,
  toTimeInputValue,
  toUserDisplayName,
  toVehicleOptions,
  toVehicleTypeOptions,
} from './schedules.mappers';
import {
  AdminLookupDto,
  AdminScheduleDto,
  AdminScheduleSetDto,
  AdminUserDto,
} from '../../../../services/admin/admin-api.service';

describe('schedules.mappers', () => {
  describe('statusClass', () => {
    it('maps DEPARTED to is-success', () => {
      expect(statusClass('departed')).toBe('is-success');
      expect(statusClass('DEPARTED')).toBe('is-success');
    });

    it('maps SCHEDULED to is-warning', () => {
      expect(statusClass('scheduled')).toBe('is-warning');
    });

    it('falls back to is-danger for anything else', () => {
      expect(statusClass('cancelled')).toBe('is-danger');
      expect(statusClass('unknown')).toBe('is-danger');
    });
  });

  describe('parseStatus', () => {
    it('parses a plain string status', () => {
      expect(parseStatus('scheduled', 'en')).toEqual({ code: 'scheduled', name: 'SCHEDULED' });
    });

    it('falls back to "unknown" for a missing value', () => {
      expect(parseStatus(undefined, 'en').code).toBe('unknown');
    });
  });

  describe('parseDepartureTimes', () => {
    it('sorts and de-duplicates valid HH:mm entries', () => {
      const result = parseDepartureTimes('09:00, 08:00,\n08:00, 10:30');
      expect(result).toEqual({ times: ['08:00', '09:00', '10:30'], valid: true });
    });

    it('returns valid:true and [] for empty input (vacuously valid, still zero times)', () => {
      expect(parseDepartureTimes('')).toEqual({ times: [], valid: true });
      expect(parseDepartureTimes(undefined)).toEqual({ times: [], valid: true });
    });

    it('returns valid:false and [] when any entry is malformed (e.g. single-digit hour)', () => {
      const result = parseDepartureTimes('8:00, 09:00');
      expect(result).toEqual({ times: [], valid: false });
    });

    it('rejects an out-of-range hour/minute', () => {
      expect(parseDepartureTimes('24:00').valid).toBeFalse();
      expect(parseDepartureTimes('12:60').valid).toBeFalse();
    });
  });

  describe('toDepartureTimesText', () => {
    it('joins times, truncated to HH:mm', () => {
      expect(toDepartureTimesText(['08:00:00', '09:30'])).toBe('08:00, 09:30');
    });

    it('returns "" for null/undefined/empty', () => {
      expect(toDepartureTimesText(null)).toBe('');
      expect(toDepartureTimesText(undefined)).toBe('');
      expect(toDepartureTimesText([])).toBe('');
    });
  });

  describe('splitDateTime', () => {
    it('splits a "T"-separated ISO-ish value', () => {
      expect(splitDateTime('2026-07-10T08:30:00')).toEqual({ date: '2026-07-10', time: '08:30' });
    });

    it('splits a space-separated value', () => {
      expect(splitDateTime('2026-07-10 08:30:00')).toEqual({ date: '2026-07-10', time: '08:30' });
    });

    it('returns empty date/time for a blank value', () => {
      expect(splitDateTime('')).toEqual({ date: '', time: '' });
      expect(splitDateTime(null)).toEqual({ date: '', time: '' });
      expect(splitDateTime(undefined)).toEqual({ date: '', time: '' });
    });
  });

  describe('toDateInputValue / toDateControlValue round-trip', () => {
    it('formats a Date to yyyy-MM-dd and parses it back to the same calendar date', () => {
      const date = new Date(2026, 6, 10); // July 10, 2026 (local)
      const formatted = toDateInputValue(date);
      expect(formatted).toBe('2026-07-10');

      const parsed = toDateControlValue(formatted);
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(6);
      expect(parsed?.getDate()).toBe(10);
    });

    it('toDateInputValue returns "" for null/invalid Date', () => {
      expect(toDateInputValue(null)).toBe('');
      expect(toDateInputValue(new Date(NaN))).toBe('');
    });

    it('toDateControlValue returns null for an incomplete/invalid string', () => {
      expect(toDateControlValue('')).toBeNull();
      expect(toDateControlValue('2026-00-10')).toBeNull();
      expect(toDateControlValue(undefined)).toBeNull();
    });
  });

  describe('toTimeInputValue / toTimeControlValue round-trip', () => {
    it('formats a Date to HH:mm and parses it back to the same time-of-day', () => {
      const date = new Date(2026, 6, 10, 8, 5);
      const formatted = toTimeInputValue(date);
      expect(formatted).toBe('08:05');

      const parsed = toTimeControlValue(formatted);
      expect(parsed?.getHours()).toBe(8);
      expect(parsed?.getMinutes()).toBe(5);
    });

    it('toTimeInputValue returns "" for null/invalid Date', () => {
      expect(toTimeInputValue(null)).toBe('');
      expect(toTimeInputValue(new Date(NaN))).toBe('');
    });

    it('toTimeControlValue returns null for an out-of-range or malformed value', () => {
      expect(toTimeControlValue('24:00')).toBeNull();
      expect(toTimeControlValue('12:60')).toBeNull();
      expect(toTimeControlValue('')).toBeNull();
    });
  });

  describe('toDateValue', () => {
    it('passes an already-valid Date through untouched', () => {
      const date = new Date(2026, 6, 10);
      expect(toDateValue(date)).toBe(date);
    });

    it('parses a yyyy-MM-dd string as a date', () => {
      const parsed = toDateValue('2026-07-10');
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(6);
      expect(parsed?.getDate()).toBe(10);
    });

    it('parses an HH:mm string as a time-of-day', () => {
      const parsed = toDateValue('08:05');
      expect(parsed?.getHours()).toBe(8);
      expect(parsed?.getMinutes()).toBe(5);
    });

    it('returns null for an empty/blank value', () => {
      expect(toDateValue('')).toBeNull();
      expect(toDateValue(undefined)).toBeNull();
    });
  });

  describe('toOptionalNumber', () => {
    it('returns the numeric value when positive and finite', () => {
      expect(toOptionalNumber('5')).toBe(5);
      expect(toOptionalNumber(12)).toBe(12);
    });

    it('returns undefined for zero, negative, non-finite, or empty', () => {
      expect(toOptionalNumber('0')).toBeUndefined();
      expect(toOptionalNumber(-1)).toBeUndefined();
      expect(toOptionalNumber('')).toBeUndefined();
      expect(toOptionalNumber(undefined)).toBeUndefined();
      expect(toOptionalNumber(Number.NaN)).toBeUndefined();
    });
  });

  describe('toScheduleRow', () => {
    const baseSet: AdminScheduleSetDto = {
      id: 1,
      startDate: '2026-06-20',
      endDate: '2026-06-25',
      departureTimes: ['09:00', '08:00'],
      frequency: 'Daily',
      status: 'scheduled',
      route: { id: 1, slug: 'bkk-cm', translations: [{ locale: 'en', label: 'BKK to CM' }, { locale: 'th', label: 'กทม ไป เชียงใหม่' }] },
      vehicleType: { id: 1, slug: 'van', translations: [{ locale: 'en', label: 'Van' }] },
      updatedAt: '2026-06-01T03:00:00Z',
    };

    it('maps a schedule set into a "set" ScheduleRow, localized per locale', () => {
      const rowEn = toScheduleRow(baseSet, 'en', 'en');
      expect(rowEn.kind).toBe('set');
      expect(rowEn.id).toBe(1);
      expect(rowEn.scheduleSetId).toBeNull();
      expect(rowEn.tripId).toBe('#SET-1');
      expect(rowEn.route).toBe('BKK to CM');
      expect(rowEn.vehicle).toBe('Van');
      expect(rowEn.departureTimes).toBe('09:00, 08:00');
      expect(rowEn.statusCode).toBe('scheduled');

      const rowTh = toScheduleRow(baseSet, 'th', 'th');
      expect(rowTh.route).toBe('กทม ไป เชียงใหม่');
    });

    it('falls back to slug and "-" for missing translations/route/vehicleType', () => {
      const sparse: AdminScheduleSetDto = {
        id: 2,
        departureTimes: [],
        status: 'scheduled',
      };
      const row = toScheduleRow(sparse, 'en', 'en');
      expect(row.route).toBe('-');
      expect(row.vehicle).toBe('-');
      expect(row.routeSlug).toBe('');
      expect(row.startDate).toBe('');
      expect(row.endDate).toBe('');
    });
  });

  describe('toGeneratedScheduleRow', () => {
    const baseSchedule: AdminScheduleDto = {
      id: 5,
      scheduleSetId: 1,
      departureDateTime: '2026-06-20T08:30:00',
      status: 'departed',
      route: { id: 1, slug: 'bkk-cm', translations: [{ locale: 'en', label: 'BKK to CM' }] },
      vehicleType: { id: 1, slug: 'van', translations: [{ locale: 'en', label: 'Van' }] },
      vehicle: { id: 9, vehicleNumber: 'V-09' },
      driver: { id: 3, fullName: 'Somchai' },
    };

    it('maps a generated schedule into a "schedule" ScheduleRow', () => {
      const row = toGeneratedScheduleRow(baseSchedule, 'en', 'en');
      expect(row.kind).toBe('schedule');
      expect(row.scheduleSetId).toBe(1);
      expect(row.tripId).toBe('#SCH-5');
      expect(row.startDate).toBe('2026-06-20');
      expect(row.departureTimes).toBe('08:30');
      expect(row.vehicle).toBe('V-09');
      expect(row.driver).toBe('Somchai');
      expect(row.statusCode).toBe('departed');
    });

    it('falls back to the vehicleType name when the vehicle has no number/plate, and "-" for a missing driver', () => {
      const noVehicleNumber: AdminScheduleDto = {
        id: 6,
        departureDateTime: '2026-06-20T08:30:00',
        status: 'scheduled',
        vehicleType: { id: 1, slug: 'van', translations: [{ locale: 'en', label: 'Van' }] },
        vehicle: { id: 9 },
      };
      const row = toGeneratedScheduleRow(noVehicleNumber, 'en', 'en');
      expect(row.vehicle).toBe('Van');
      expect(row.driver).toBe('-');
      expect(row.vehicleId).toBe(9);
      expect(row.driverId).toBeNull();
    });
  });

  describe('toScheduleSetFallback / toScheduleDetailFallback', () => {
    const setRow: ScheduleRow = {
      kind: 'set',
      id: 1,
      scheduleSetId: null,
      tripId: '#SET-1',
      dateRange: '-',
      startDate: '2026-06-20',
      endDate: '2026-06-25',
      departureTimes: '08:00, 09:00',
      routeSlug: 'bkk-cm',
      route: 'BKK to CM',
      vehicleTypeSlug: 'van',
      vehicleId: null,
      driverId: null,
      vehicle: 'Van',
      driver: '-',
      frequency: 'Daily',
      status: 'Scheduled',
      statusCode: 'scheduled',
      updatedAt: '-',
    };

    it('toScheduleSetFallback maps a ScheduleRow back into an AdminScheduleSetDto, parsing departureTimes', () => {
      const dto = toScheduleSetFallback(setRow);
      expect(dto.departureTimes).toEqual(['08:00', '09:00']);
      expect(dto.route?.slug).toBe('bkk-cm');
      expect(dto.vehicleType?.slug).toBe('van');
      expect(dto.status).toBe('scheduled');
    });

    it('toScheduleSetFallback silently discards an invalid departureTimes string (returns []), does not throw', () => {
      const malformed = { ...setRow, departureTimes: '8:00' };
      const dto = toScheduleSetFallback(malformed);
      expect(dto.departureTimes).toEqual([]);
    });

    it('toScheduleDetailFallback maps a "schedule" ScheduleRow into an AdminScheduleDto', () => {
      const tripRow: ScheduleRow = {
        ...setRow,
        kind: 'schedule',
        id: 5,
        vehicleId: 9,
        driverId: 3,
        vehicle: 'V-09',
        driver: 'Somchai',
        departureTimes: '08:30',
      };
      const dto = toScheduleDetailFallback(tripRow);
      expect(dto.departureDateTime).toBe('2026-06-20T08:30:00');
      expect(dto.vehicle).toEqual({ id: 9, vehicleNumber: 'V-09' });
      expect(dto.driver).toEqual({ id: 3, fullName: 'Somchai' });
    });

    it('toScheduleDetailFallback defaults the time portion to 00:00 and omits vehicle/driver when absent', () => {
      const tripRow: ScheduleRow = { ...setRow, kind: 'schedule', id: 6, departureTimes: '' };
      const dto = toScheduleDetailFallback(tripRow);
      expect(dto.departureDateTime).toBe('2026-06-20T00:00:00');
      expect(dto.vehicle).toBeUndefined();
      expect(dto.driver).toBeUndefined();
    });
  });

  describe('toRouteOptions / toVehicleTypeOptions / toVehicleOptions', () => {
    it('toRouteOptions maps routes to code/label, dropping entries with an empty slug', () => {
      const options = toRouteOptions(
        [
          { id: 1, slug: 'bkk-cm', translations: [{ locale: 'en', label: 'BKK to CM' }] },
          { id: 2, slug: '' },
        ],
        'en'
      );
      expect(options).toEqual([{ code: 'bkk-cm', label: 'BKK to CM' }]);
    });

    it('toVehicleTypeOptions maps vehicle types to code/label', () => {
      const options = toVehicleTypeOptions(
        [{ id: 1, slug: 'van', translations: [{ locale: 'en', label: 'Van' }] }],
        'en'
      );
      expect(options).toEqual([{ code: 'van', label: 'Van' }]);
    });

    it('toVehicleOptions labels with "identifier - vehicleType" and falls back to "#id" when no plate/number', () => {
      const options = toVehicleOptions(
        [
          {
            id: 1,
            vehicleNumber: 'V-01',
            numberPlate: '1กก-1234',
            vehicleType: { id: 1, slug: 'van', translations: [{ locale: 'en', label: 'Van' }] },
          },
          { id: 2 },
        ],
        'en'
      );
      expect(options[0]).toEqual({ code: '1', label: 'V-01 / 1กก-1234 - Van' });
      expect(options[1]).toEqual({ code: '2', label: '#2' });
    });
  });

  describe('isDriverUser / toUserDisplayName / toDriverOptions', () => {
    const driver: AdminUserDto = {
      id: 1,
      firstName: 'Somchai',
      lastName: 'Jaidee',
      roles: ['driver'],
    };
    const admin: AdminUserDto = { id: 2, fullName: 'Admin User', roles: ['admin'] };
    const driverWithRoleObject: AdminUserDto = {
      id: 3,
      fullName: 'Wichai',
      roles: [{ id: 1, slug: 'DRIVER' }],
    };

    it('isDriverUser matches a plain-string role case-insensitively', () => {
      expect(isDriverUser(driver)).toBeTrue();
      expect(isDriverUser(admin)).toBeFalse();
    });

    it('isDriverUser matches an AdminRoleDto-shaped role', () => {
      expect(isDriverUser(driverWithRoleObject)).toBeTrue();
    });

    it('toUserDisplayName prefers fullName, then assembled profile name, then username/email/#id', () => {
      expect(toUserDisplayName(admin)).toBe('Admin User');
      expect(toUserDisplayName(driver)).toBe('Somchai Jaidee');
      expect(toUserDisplayName({ id: 9, roles: [] })).toBe('#9');
      expect(toUserDisplayName({ id: 9, username: 'somchai9', roles: [] })).toBe('somchai9');
    });

    it('toDriverOptions filters to driver-role users only', () => {
      const options = toDriverOptions([driver, admin, driverWithRoleObject]);
      expect(options).toEqual([
        { code: '1', label: 'Somchai Jaidee' },
        { code: '3', label: 'Wichai' },
      ]);
    });
  });

  describe('toScheduleStatusOptions', () => {
    it('filters to schedule_status lookups and localizes the label', () => {
      const lookups: AdminLookupDto[] = [
        { id: 1, category: 'schedule_status', slug: 'scheduled', translations: [{ locale: 'th', label: 'กำหนดการ' }] },
        { id: 2, category: 'route_status', slug: 'active', translations: [] },
      ];
      const options = toScheduleStatusOptions(lookups, 'th');
      expect(options).toEqual([{ code: 'scheduled', label: 'กำหนดการ' }]);
    });

    it('falls back to an uppercased, underscore-stripped code when no translation matches', () => {
      const lookups: AdminLookupDto[] = [
        { id: 1, category: 'schedule_status', slug: 'in_transit', translations: [] },
      ];
      const options = toScheduleStatusOptions(lookups, 'en');
      expect(options).toEqual([{ code: 'in_transit', label: 'IN TRANSIT' }]);
    });
  });

  describe('toSchedulePayload', () => {
    it('trims/lower-cases and parses departureTimesText into a sorted list', () => {
      const { payload, departureTimesValid } = toSchedulePayload({
        startDate: ' 2026-06-20 ',
        endDate: ' 2026-06-25 ',
        departureTimesText: '09:00, 08:00',
        frequency: 'Daily',
        status: ' Scheduled ',
        route: ' bkk-cm ',
        vehicleType: ' van ',
      });

      expect(departureTimesValid).toBeTrue();
      expect(payload).toEqual({
        startDate: '2026-06-20',
        endDate: '2026-06-25',
        departureTimes: ['08:00', '09:00'],
        frequency: 'Daily',
        status: 'scheduled',
        route: 'bkk-cm',
        vehicleType: 'van',
      });
    });

    it('reports departureTimesValid:false for a malformed time, and an empty departureTimes list', () => {
      const { payload, departureTimesValid } = toSchedulePayload({
        startDate: '2026-06-20',
        endDate: '2026-06-25',
        departureTimesText: '8:00',
        status: 'scheduled',
        route: 'bkk-cm',
        vehicleType: 'van',
      });

      expect(departureTimesValid).toBeFalse();
      expect(payload.departureTimes).toEqual([]);
    });

    it('defaults frequency to undefined when blank', () => {
      const { payload } = toSchedulePayload({
        startDate: '2026-06-20',
        endDate: '2026-06-25',
        departureTimesText: '08:00',
        frequency: '',
        status: 'scheduled',
        route: 'bkk-cm',
        vehicleType: 'van',
      });
      expect(payload.frequency).toBeUndefined();
    });
  });

  describe('toScheduleItemPayload', () => {
    it('combines date/time into departureDateTime and includes vehicleId/driverId only when positive', () => {
      const { payload, cargoCapacityKgError } = toScheduleItemPayload({
        departureDate: '2026-06-20',
        departureTime: '08:30',
        route: 'bkk-cm',
        vehicleType: 'van',
        vehicleId: '9',
        driverId: '0',
      });

      expect(payload.route).toBe('bkk-cm');
      expect(payload.vehicleType).toBe('van');
      expect(payload.vehicleId).toBe(9);
      expect(payload.driverId).toBeUndefined();
      expect(payload.departureDateTime).toContain('2026-06-20');
      expect(payload.cargoCapacityKg).toBeNull();
      expect(cargoCapacityKgError).toBeNull();
    });

    // OBRS-508: POST and PUT /api/private/schedules share one backend
    // ScheduleReqDto shape, so this same builder feeds both the create and
    // update path (see schedules-page.component.ts's shared scheduleItemForm).
    it('parses a valid cargoCapacityKg override into the payload', () => {
      const { payload, cargoCapacityKgError } = toScheduleItemPayload({
        departureDate: '2026-06-20',
        departureTime: '08:30',
        route: 'bkk-cm',
        vehicleType: 'van',
        cargoCapacityKg: '150.5',
      });

      expect(payload.cargoCapacityKg).toBe(150.5);
      expect(cargoCapacityKgError).toBeNull();
    });

    it('treats an empty cargoCapacityKg as null (inherit from vehicle type)', () => {
      const { payload, cargoCapacityKgError } = toScheduleItemPayload({
        departureDate: '2026-06-20',
        departureTime: '08:30',
        route: 'bkk-cm',
        vehicleType: 'van',
        cargoCapacityKg: '',
      });

      expect(payload.cargoCapacityKg).toBeNull();
      expect(cargoCapacityKgError).toBeNull();
    });

    it('surfaces a validation error for a malformed cargoCapacityKg without throwing', () => {
      const { payload, cargoCapacityKgError } = toScheduleItemPayload({
        departureDate: '2026-06-20',
        departureTime: '08:30',
        route: 'bkk-cm',
        vehicleType: 'van',
        cargoCapacityKg: 'abc',
      });

      expect(payload.cargoCapacityKg).toBeNull();
      expect(cargoCapacityKgError).toBe('INVALID_NUMBER');
    });
  });

  // OBRS-209 AC10
  describe('extractScheduleErrorCode', () => {
    it('extracts error.error.errorCode from an HttpErrorResponse', () => {
      const error = new HttpErrorResponse({ status: 400, error: { errorCode: 'VEHICLE_UNDER_MAINTENANCE' } });
      expect(extractScheduleErrorCode(error)).toBe('VEHICLE_UNDER_MAINTENANCE');
    });

    it('returns null when the error body has no errorCode', () => {
      const error = new HttpErrorResponse({ status: 500, error: { message: 'boom' } });
      expect(extractScheduleErrorCode(error)).toBeNull();
    });

    it('returns null for a non-HttpErrorResponse error', () => {
      expect(extractScheduleErrorCode(new Error('network down'))).toBeNull();
    });
  });
});
