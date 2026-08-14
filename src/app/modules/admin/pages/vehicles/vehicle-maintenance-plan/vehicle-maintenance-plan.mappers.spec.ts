import { AdminVehicleMaintenancePlanDto } from '../../../../../services/admin/admin-api.service';
import {
  MAINTENANCE_PART_CODES,
  MaintenancePartLabels,
  Option,
  hasIntervalError,
  toDateControlValue,
  toDateInputValue,
  toPartOptions,
  toPlanPayload,
  toPlanRow,
} from './vehicle-maintenance-plan.mappers';

const LABELS: MaintenancePartLabels = {
  engineOil: 'Engine oil',
  oilFilter: 'Oil filter',
  airFilter: 'Air filter',
  cabinAirFilter: 'Cabin air filter',
  fuelFilter: 'Fuel filter',
  sparkPlugs: 'Spark plugs',
  brakePads: 'Brake pads',
  brakeFluid: 'Brake fluid',
  tires: 'Tires',
  battery: 'Battery',
  coolant: 'Coolant',
  transmissionFluid: 'Transmission fluid',
  timingBelt: 'Timing belt',
};

const PART_OPTIONS: Option[] = toPartOptions(LABELS);

describe('vehicle-maintenance-plan.mappers', () => {
  describe('toPartOptions / MAINTENANCE_PART_CODES', () => {
    it('returns exactly the fixed part codes, in MAINTENANCE_PART_CODES order (mirrors EXPENSE_CATEGORY_CODES parity)', () => {
      expect(PART_OPTIONS.map((o) => o.code)).toEqual([...MAINTENANCE_PART_CODES]);
      expect(PART_OPTIONS.find((o) => o.code === 'BRAKE_PADS')?.label).toBe('Brake pads');
    });

    // OBRS-1333 owner decision (2026-08-14): 13 codes total — SPARK_PLUGS
    // stays (fuel type isn't tracked anywhere in the schema) and TIMING_BELT
    // was added, pinned LAST (after TRANSMISSION_FLUID) to match the backend
    // enum's append order.
    it('is exactly 13 codes, with TIMING_BELT last', () => {
      expect(MAINTENANCE_PART_CODES.length).toBe(13);
      expect(MAINTENANCE_PART_CODES[MAINTENANCE_PART_CODES.length - 1]).toBe('TIMING_BELT');
      expect(PART_OPTIONS[PART_OPTIONS.length - 1]).toEqual({ code: 'TIMING_BELT', label: 'Timing belt' });
    });

    // Mirrors expenses-page.mappers.spec.ts's "no code falls through unwired"
    // guard: the codes list and the options builder are two hand-maintained
    // lists in one file — this catches a code added to both but wired to no
    // label.
    it('gives every code a distinct, non-empty label — no code falls through unwired', () => {
      const labels = PART_OPTIONS.map((o) => o.label);

      expect(labels.filter((label) => !label).length).toBe(0);
      expect(new Set(labels).size).toBe(MAINTENANCE_PART_CODES.length);
    });
  });

  describe('toPlanRow', () => {
    function buildDto(overrides: Partial<AdminVehicleMaintenancePlanDto> = {}): AdminVehicleMaintenancePlanDto {
      return {
        id: 10,
        vehicleId: 3,
        part: 'BRAKE_PADS',
        intervalKm: 20000,
        intervalDays: 180,
        lastDoneKm: 15000,
        lastDoneDate: '2026-06-01',
        active: true,
        nextDueKm: 35000,
        nextDueDate: '2026-12-01',
        ...overrides,
      };
    }

    it('maps the DTO to a display row, resolving the localized label by matching part against partOptions', () => {
      const row = toPlanRow(buildDto(), PART_OPTIONS, 'en');

      expect(row.id).toBe(10);
      expect(row.vehicleId).toBe(3);
      expect(row.part).toBe('BRAKE_PADS');
      expect(row.partLabel).toBe('Brake pads');
      expect(row.intervalKm).toBe(20000);
      expect(row.intervalDays).toBe(180);
      expect(row.lastDoneKm).toBe(15000);
      expect(row.lastDoneDateDisplay).not.toBe('');
      expect(row.active).toBeTrue();
      expect(row.nextDueKm).toBe(35000);
      expect(row.nextDueDateDisplay).not.toBe('');
    });

    it('handles null intervalKm/intervalDays/lastDoneKm/lastDoneDate/nextDueKm/nextDueDate without throwing', () => {
      const row = toPlanRow(
        buildDto({
          intervalKm: null,
          intervalDays: null,
          lastDoneKm: null,
          lastDoneDate: null,
          nextDueKm: null,
          nextDueDate: null,
        }),
        PART_OPTIONS,
        'en'
      );

      expect(row.intervalKm).toBeNull();
      expect(row.intervalDays).toBeNull();
      expect(row.lastDoneKm).toBeNull();
      expect(row.lastDoneDate).toBe('');
      expect(row.lastDoneDateDisplay).toBe('');
      expect(row.nextDueKm).toBeNull();
      expect(row.nextDueDateDisplay).toBe('');
    });

    it('falls back to the raw code when no matching part option is found (stale/unmapped code)', () => {
      const row = toPlanRow(buildDto({ part: 'UNKNOWN_PART' }), PART_OPTIONS, 'en');

      expect(row.part).toBe('UNKNOWN_PART');
      expect(row.partLabel).toBe('UNKNOWN_PART');
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

  describe('hasIntervalError', () => {
    it('is true when both intervalKm and intervalDays are empty', () => {
      expect(hasIntervalError({ intervalKm: null, intervalDays: null })).toBeTrue();
      expect(hasIntervalError({ intervalKm: '', intervalDays: '' })).toBeTrue();
      expect(hasIntervalError({})).toBeTrue();
    });

    it('is false when at least one of intervalKm/intervalDays is present', () => {
      expect(hasIntervalError({ intervalKm: 20000, intervalDays: null })).toBeFalse();
      expect(hasIntervalError({ intervalKm: null, intervalDays: 180 })).toBeFalse();
      expect(hasIntervalError({ intervalKm: 20000, intervalDays: 180 })).toBeFalse();
    });
  });

  describe('toPlanPayload', () => {
    it('builds the create/update payload, nulling absent numeric/date fields', () => {
      const payload = toPlanPayload({
        part: 'BRAKE_PADS',
        intervalKm: 20000,
        intervalDays: null,
        lastDoneKm: null,
        lastDoneDate: null,
      });

      expect(payload).toEqual({
        part: 'BRAKE_PADS',
        intervalKm: 20000,
        intervalDays: null,
        lastDoneKm: null,
        lastDoneDate: null,
      });
    });

    it('includes lastDoneKm/lastDoneDate when present', () => {
      const payload = toPlanPayload({
        part: 'TIRES',
        intervalKm: null,
        intervalDays: 180,
        lastDoneKm: 15000,
        lastDoneDate: new Date(2026, 5, 1),
      });

      expect(payload.lastDoneKm).toBe(15000);
      expect(payload.lastDoneDate).toBe('2026-06-01');
      expect(payload.intervalDays).toBe(180);
      expect(payload.part).toBe('TIRES');
    });
  });
});
