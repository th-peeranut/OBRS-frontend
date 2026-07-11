import { AdminLookupDto, AdminVehicleMaintenanceDto } from '../../../../../services/admin/admin-api.service';
import {
  hasMaintenanceDateRangeError,
  toDateControlValue,
  toDateInputValue,
  toMaintenancePayload,
  toMaintenanceRow,
  toMaintenanceStatusOptions,
} from './vehicle-maintenance.mappers';

describe('vehicle-maintenance.mappers', () => {
  describe('toMaintenanceStatusOptions', () => {
    it('filters lookups to the maintenance_status category and uses the id as code', () => {
      const lookups: AdminLookupDto[] = [
        { id: 1, category: 'vehicle_status', slug: 'active', translations: [] },
        {
          id: 5,
          category: 'maintenance_status',
          slug: 'scheduled',
          translations: [{ locale: 'en', label: 'Scheduled' }],
        },
        {
          id: 6,
          category: 'maintenance_status',
          slug: 'completed',
          translations: [{ locale: 'en', label: 'Completed' }],
        },
      ];

      const options = toMaintenanceStatusOptions(lookups, 'en');

      expect(options).toEqual([
        { code: '5', label: 'Scheduled' },
        { code: '6', label: 'Completed' },
      ]);
    });

    it('falls back to the slug when no translation is available', () => {
      const lookups: AdminLookupDto[] = [
        { id: 7, category: 'maintenance_status', slug: 'in_progress', translations: [] },
      ];

      expect(toMaintenanceStatusOptions(lookups, 'th')).toEqual([
        { code: '7', label: 'in_progress' },
      ]);
    });
  });

  describe('toMaintenanceRow', () => {
    it('maps the DTO to a display row, localizing the status label', () => {
      const dto: AdminVehicleMaintenanceDto = {
        id: 10,
        vehicleId: 3,
        reason: 'Brake inspection',
        startDate: '2026-07-01',
        endDate: '2026-07-03',
        nextDueDate: '2026-10-01',
        maintenanceStatus: {
          id: 5,
          category: 'maintenance_status',
          slug: 'scheduled',
          translations: [{ locale: 'en', label: 'Scheduled' }],
        },
        notes: 'Check pads',
      };

      const row = toMaintenanceRow(dto, 'en', 'en');

      expect(row.id).toBe(10);
      expect(row.vehicleId).toBe(3);
      expect(row.reason).toBe('Brake inspection');
      expect(row.startDate).toBe('2026-07-01');
      expect(row.statusId).toBe(5);
      expect(row.status).toBe('Scheduled');
      expect(row.notes).toBe('Check pads');
      expect(row.endDateDisplay).not.toBe('');
    });

    it('handles null endDate/nextDueDate/notes without throwing', () => {
      const dto: AdminVehicleMaintenanceDto = {
        id: 11,
        vehicleId: 3,
        reason: 'Oil change',
        startDate: '2026-07-01',
        endDate: null,
        nextDueDate: null,
        maintenanceStatus: { id: 5, category: 'maintenance_status', slug: 'scheduled', translations: [] },
        notes: null,
      };

      const row = toMaintenanceRow(dto, 'en', 'en');

      expect(row.endDate).toBe('');
      expect(row.endDateDisplay).toBe('');
      expect(row.nextDueDateDisplay).toBe('');
      expect(row.notes).toBe('');
      // No translation available — falls back to the raw slug.
      expect(row.status).toBe('scheduled');
    });
  });

  describe('date control <-> input value round-trip', () => {
    it('converts a Date to YYYY-MM-DD and back', () => {
      const date = new Date(2026, 6, 15); // July 15, 2026 (0-based month)
      expect(toDateInputValue(date)).toBe('2026-07-15');
      expect(toDateControlValue('2026-07-15')).toEqual(date);
    });

    it('returns empty/null for invalid input', () => {
      expect(toDateInputValue(null)).toBe('');
      expect(toDateControlValue('')).toBeNull();
      expect(toDateControlValue(undefined)).toBeNull();
    });
  });

  describe('hasMaintenanceDateRangeError', () => {
    it('is false when endDate is on or after startDate', () => {
      expect(
        hasMaintenanceDateRangeError({
          startDate: new Date(2026, 6, 1),
          endDate: new Date(2026, 6, 1),
        })
      ).toBeFalse();

      expect(
        hasMaintenanceDateRangeError({
          startDate: new Date(2026, 6, 1),
          endDate: new Date(2026, 6, 5),
        })
      ).toBeFalse();
    });

    it('is true when endDate is before startDate', () => {
      expect(
        hasMaintenanceDateRangeError({
          startDate: new Date(2026, 6, 10),
          endDate: new Date(2026, 6, 1),
        })
      ).toBeTrue();
    });

    it('is false when endDate is absent (optional field)', () => {
      expect(
        hasMaintenanceDateRangeError({
          startDate: new Date(2026, 6, 10),
          endDate: null,
        })
      ).toBeFalse();
    });
  });

  describe('toMaintenancePayload', () => {
    it('builds the create/update payload, trimming reason/notes and nulling absent dates', () => {
      const payload = toMaintenancePayload({
        reason: '  Brake inspection  ',
        startDate: new Date(2026, 6, 1),
        endDate: null,
        nextDueDate: null,
        maintenanceStatusId: '5',
        notes: '  ',
      });

      expect(payload).toEqual({
        reason: 'Brake inspection',
        startDate: '2026-07-01',
        endDate: null,
        nextDueDate: null,
        maintenanceStatusId: 5,
        notes: null,
      });
    });

    it('includes endDate/nextDueDate/notes when present', () => {
      const payload = toMaintenancePayload({
        reason: 'Tire rotation',
        startDate: new Date(2026, 6, 1),
        endDate: new Date(2026, 6, 3),
        nextDueDate: new Date(2026, 9, 1),
        maintenanceStatusId: '6',
        notes: 'All good',
      });

      expect(payload.endDate).toBe('2026-07-03');
      expect(payload.nextDueDate).toBe('2026-10-01');
      expect(payload.notes).toBe('All good');
      expect(payload.maintenanceStatusId).toBe(6);
    });
  });
});
