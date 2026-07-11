import {
  ScheduleRow,
  splitDateTime,
  toDateControlValue,
  toDateInputValue,
  toDateValue,
  toDriverOptions,
  toFallbackDto,
  toOptionalNumber,
  toPayload,
  toRouteOptions,
  toRow,
  toScheduleFormValues,
  toScheduleStatusOptions,
  toTimeControlValue,
  toTimeInputValue,
  toVehicleOptions,
  toVehicleTypeOptions,
} from './staff-schedules-page.mappers';
import { AdminLookupDto, AdminScheduleDto } from '../../../../services/admin/admin-api.service';

describe('staff-schedules-page.mappers', () => {
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
      expect(toTimeControlValue(undefined)).toBeNull();
    });

    it('toTimeControlValue truncates a longer value (e.g. with seconds) to HH:mm', () => {
      const parsed = toTimeControlValue('08:05:30');
      expect(parsed?.getHours()).toBe(8);
      expect(parsed?.getMinutes()).toBe(5);
    });
  });

  describe('toDateValue', () => {
    it('passes through a valid Date unchanged', () => {
      const date = new Date(2026, 6, 10);
      expect(toDateValue(date)).toBe(date);
    });

    it('returns null for an invalid Date instance', () => {
      expect(toDateValue(new Date(NaN))).toBeNull();
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

    it('falls back to Date parsing for anything else, and null for empty/garbage', () => {
      expect(toDateValue('')).toBeNull();
      expect(toDateValue(null)).toBeNull();
      expect(toDateValue(undefined)).toBeNull();
      expect(toDateValue('not-a-date')).toBeNull();
    });
  });

  describe('toOptionalNumber', () => {
    it('returns the number for a positive numeric-like value', () => {
      expect(toOptionalNumber('5')).toBe(5);
      expect(toOptionalNumber(5)).toBe(5);
    });

    it('returns undefined for zero, negative, empty, or non-numeric values', () => {
      expect(toOptionalNumber('0')).toBeUndefined();
      expect(toOptionalNumber('-1')).toBeUndefined();
      expect(toOptionalNumber('')).toBeUndefined();
      expect(toOptionalNumber(undefined)).toBeUndefined();
      expect(toOptionalNumber('abc')).toBeUndefined();
    });
  });

  describe('toRow', () => {
    it('keeps departure/updatedAt as RAW ISO strings (no date formatting at map time)', () => {
      const schedule: AdminScheduleDto = {
        id: 1,
        departureDateTime: '2026-07-10T08:30:00',
        updatedAt: '2026-07-11T09:00:00',
        status: 'scheduled',
        route: { id: 2, slug: 'bkk-cnx' },
        vehicleType: { id: 3, slug: 'van' },
        vehicle: { id: 4, vehicleNumber: 'V-01' },
        driver: { id: 5, fullName: 'Somchai' },
      };

      const row = toRow(schedule, 'en');

      expect(row.departure).toBe('2026-07-10T08:30:00');
      expect(row.updatedAt).toBe('2026-07-11T09:00:00');
      expect(row.tripId).toBe('#SCH-1');
      expect(row.routeSlug).toBe('bkk-cnx');
      expect(row.vehicleTypeSlug).toBe('van');
      expect(row.vehicle).toBe('V-01');
      expect(row.vehicleId).toBe(4);
      expect(row.driver).toBe('Somchai');
      expect(row.driverId).toBe(5);
      expect(row.statusCode).toBe('scheduled');
    });

    it('falls back to createdAt when updatedAt is missing, and "-" when both are missing', () => {
      const base: AdminScheduleDto = {
        id: 1,
        departureDateTime: undefined,
        status: 'scheduled',
        route: undefined,
        vehicleType: undefined,
      };

      expect(toRow({ ...base, createdAt: '2026-07-01T00:00:00' }, 'en').updatedAt).toBe(
        '2026-07-01T00:00:00'
      );
      expect(toRow(base, 'en').updatedAt).toBe('-');
      expect(toRow(base, 'en').departure).toBe('-');
    });

    it('falls back to "-" for route/vehicle/driver when missing', () => {
      const schedule: AdminScheduleDto = {
        id: 9,
        departureDateTime: undefined,
        status: 'scheduled',
        route: undefined,
        vehicleType: undefined,
        vehicle: undefined,
        driver: undefined,
      };

      const row = toRow(schedule, 'en');
      expect(row.route).toBe('-');
      expect(row.vehicle).toBe('-');
      expect(row.driver).toBe('-');
      expect(row.vehicleId).toBeNull();
      expect(row.driverId).toBeNull();
    });
  });

  describe('toFallbackDto', () => {
    it('rebuilds a schedule DTO from a row, field-by-field', () => {
      const row: ScheduleRow = {
        id: 1,
        tripId: '#SCH-1',
        departure: '2026-07-10T08:30:00',
        route: 'Bangkok - Chiang Mai',
        routeSlug: 'bkk-cnx',
        vehicle: 'V-01',
        vehicleId: 4,
        vehicleTypeSlug: 'van',
        driver: 'Somchai',
        driverId: 5,
        status: 'Scheduled',
        statusCode: 'scheduled',
        updatedAt: '2026-07-11T09:00:00',
      };

      const dto = toFallbackDto(row);
      expect(dto).toEqual({
        id: 1,
        departureDateTime: '2026-07-10T08:30:00',
        status: 'scheduled',
        route: { id: 0, slug: 'bkk-cnx' },
        vehicleType: { id: 0, slug: 'van' },
        vehicle: { id: 4, vehicleNumber: 'V-01' },
        driver: { id: 5, fullName: 'Somchai' },
      });
    });

    it('omits vehicle/driver when the row has no vehicleId/driverId', () => {
      const row: ScheduleRow = {
        id: 1,
        tripId: '#SCH-1',
        departure: '-',
        route: '-',
        routeSlug: '',
        vehicle: '-',
        vehicleId: null,
        vehicleTypeSlug: '',
        driver: '-',
        driverId: null,
        status: 'Scheduled',
        statusCode: 'scheduled',
        updatedAt: '-',
      };

      const dto = toFallbackDto(row);
      expect(dto.vehicle).toBeUndefined();
      expect(dto.driver).toBeUndefined();
    });
  });

  describe('toScheduleFormValues', () => {
    it('splits departureDateTime into date/time controls and maps slugs/ids to strings', () => {
      const dto: AdminScheduleDto = {
        id: 1,
        departureDateTime: '2026-07-10T08:30:00',
        status: 'scheduled',
        route: { id: 2, slug: 'bkk-cnx' },
        vehicleType: { id: 3, slug: 'van' },
        vehicle: { id: 4, vehicleNumber: 'V-01' },
        driver: { id: 5, fullName: 'Somchai' },
      };

      const values = toScheduleFormValues(dto);
      expect(values.departureDate?.getFullYear()).toBe(2026);
      expect(values.departureDate?.getMonth()).toBe(6);
      expect(values.departureDate?.getDate()).toBe(10);
      expect(values.departureTime?.getHours()).toBe(8);
      expect(values.departureTime?.getMinutes()).toBe(30);
      expect(values.route).toBe('bkk-cnx');
      expect(values.vehicleType).toBe('van');
      expect(values.vehicleId).toBe('4');
      expect(values.driverId).toBe('5');
    });

    it('defaults to null dates and empty strings when the DTO is sparse', () => {
      const dto: AdminScheduleDto = {
        id: 1,
        departureDateTime: undefined,
        status: 'scheduled',
        route: undefined,
        vehicleType: undefined,
        vehicle: undefined,
        driver: undefined,
      };

      const values = toScheduleFormValues(dto);
      expect(values.departureDate).toBeNull();
      expect(values.departureTime).toBeNull();
      expect(values.route).toBe('');
      expect(values.vehicleType).toBe('');
      expect(values.vehicleId).toBe('');
      expect(values.driverId).toBe('');
    });
  });

  describe('toPayload', () => {
    it('builds a create/update payload from raw form values, trimming strings and combining date+time', () => {
      const payload = toPayload({
        departureDate: '2026-07-10',
        departureTime: '08:30',
        route: '  bkk-cnx  ',
        vehicleType: '  van  ',
        vehicleId: '4',
        driverId: '5',
      });

      expect(payload.route).toBe('bkk-cnx');
      expect(payload.vehicleType).toBe('van');
      expect(payload.vehicleId).toBe(4);
      expect(payload.driverId).toBe(5);
      expect(payload.departureDateTime).toContain('2026-07-10');
      expect(payload.departureDateTime).toContain('08:30');
    });

    it('accepts Date instances for departureDate/departureTime (getRawValue() round-trip)', () => {
      const payload = toPayload({
        departureDate: new Date(2026, 6, 10),
        departureTime: new Date(2026, 6, 10, 8, 30),
        route: 'bkk-cnx',
        vehicleType: 'van',
        vehicleId: '',
        driverId: '',
      });

      expect(payload.departureDateTime).toContain('2026-07-10');
      expect(payload.departureDateTime).toContain('08:30');
      expect(payload.vehicleId).toBeUndefined();
      expect(payload.driverId).toBeUndefined();
    });

    it('omits vehicleId/driverId when not positive numbers', () => {
      const payload = toPayload({
        departureDate: '2026-07-10',
        departureTime: '08:30',
        route: 'bkk-cnx',
        vehicleType: 'van',
        vehicleId: '0',
        driverId: undefined,
      });

      expect(payload.vehicleId).toBeUndefined();
      expect(payload.driverId).toBeUndefined();
    });
  });

  describe('toRouteOptions / toVehicleTypeOptions', () => {
    it('maps routes and vehicle types to {code, label} using the slug as the fallback label', () => {
      const routes = toRouteOptions([{ id: 1, slug: 'bkk-cnx' }], 'en');
      expect(routes).toEqual([{ code: 'bkk-cnx', label: 'bkk-cnx' }]);

      const vehicleTypes = toVehicleTypeOptions([{ id: 1, slug: 'van' }], 'en');
      expect(vehicleTypes).toEqual([{ code: 'van', label: 'van' }]);
    });
  });

  describe('toVehicleOptions', () => {
    it('labels by vehicleNumber, falling back to numberPlate, then #id', () => {
      const options = toVehicleOptions([
        { id: 1, vehicleNumber: 'V-01' },
        { id: 2, numberPlate: 'AB-1234' },
        { id: 3 },
      ]);

      expect(options).toEqual([
        { code: '1', label: 'V-01' },
        { code: '2', label: 'AB-1234' },
        { code: '3', label: '#3' },
      ]);
    });
  });

  describe('toDriverOptions', () => {
    it('labels by trimmed name, falling back to #id when blank', () => {
      const options = toDriverOptions([
        { id: 1, name: '  Somchai  ' },
        { id: 2, name: '   ' },
        { id: 3, name: '' },
      ]);

      expect(options).toEqual([
        { code: '1', label: 'Somchai' },
        { code: '2', label: '#2' },
        { code: '3', label: '#3' },
      ]);
    });
  });

  describe('toScheduleStatusOptions', () => {
    it('filters lookups to schedule_status and lowercases the code', () => {
      const lookups: AdminLookupDto[] = [
        { id: 1, category: 'schedule_status', slug: 'SCHEDULED', translations: [{ locale: 'en', label: 'Scheduled' }] },
        { id: 2, category: 'other', slug: 'foo', translations: [] },
      ];

      const options = toScheduleStatusOptions(lookups, 'en');
      expect(options).toEqual([{ code: 'scheduled', label: 'Scheduled' }]);
    });
  });
});
