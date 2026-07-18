import {
  VehicleInspectionDetailItemDto,
  VehicleInspectionListItemDto,
} from '../../../../../services/admin/admin-api.service';
import {
  filterInspectionRowsByWindow,
  toInspectionDetailRows,
  toInspectionHistoryRow,
} from './vehicle-inspection.mappers';

function makeRow(overrides: Partial<VehicleInspectionListItemDto> = {}): VehicleInspectionListItemDto {
  return {
    id: 1,
    inspectedAt: '2026-07-14T09:00:00+07:00',
    inspectedByName: 'Somchai',
    odometerKm: 1000,
    defectCount: 0,
    pendingMaintenance: false,
    ...overrides,
  };
}

describe('vehicle-inspection.mappers', () => {
  describe('toInspectionHistoryRow', () => {
    it('maps defectCount > 0 to is-danger and 0 to is-success', () => {
      expect(toInspectionHistoryRow(makeRow({ defectCount: 0 }), 'en').defectChipToken).toBe(
        'is-success'
      );
      expect(toInspectionHistoryRow(makeRow({ defectCount: 3 }), 'en').defectChipToken).toBe(
        'is-danger'
      );
    });

    it('falls back to "-" for a missing inspector name', () => {
      const row = toInspectionHistoryRow(makeRow({ inspectedByName: undefined as unknown as string }), 'en');
      expect(row.inspectedByName).toBe('-');
    });

    it('carries pendingMaintenance through as a boolean', () => {
      expect(toInspectionHistoryRow(makeRow({ pendingMaintenance: true }), 'en').pendingMaintenance).toBeTrue();
    });
  });

  describe('filterInspectionRowsByWindow', () => {
    const NOW = new Date('2026-07-16T12:00:00+07:00');

    it('showAll returns every row untouched', () => {
      const rows = [makeRow({ id: 1, inspectedAt: '2020-01-01T00:00:00+07:00' })];
      expect(filterInspectionRowsByWindow(rows, true, NOW)).toEqual(rows);
    });

    it('default window (weeksBack=1) keeps current + previous week, drops older', () => {
      const currentWeek = makeRow({ id: 1, inspectedAt: '2026-07-14T09:00:00+07:00' });
      const previousWeek = makeRow({ id: 2, inspectedAt: '2026-07-08T09:00:00+07:00' });
      const twoWeeksAgo = makeRow({ id: 3, inspectedAt: '2026-06-30T09:00:00+07:00' });

      const result = filterInspectionRowsByWindow(
        [currentWeek, previousWeek, twoWeeksAgo],
        false,
        NOW
      );

      expect(result.map((r) => r.id)).toEqual([1, 2]);
    });

    it('never mutates the input array (returns a new one even for showAll)', () => {
      const rows = [makeRow()];
      const result = filterInspectionRowsByWindow(rows, true, NOW);
      expect(result).not.toBe(rows);
    });
  });

  describe('toInspectionDetailRows', () => {
    it('maps needs_repair to is-danger and ok to is-success, preserving order', () => {
      const items: VehicleInspectionDetailItemDto[] = [
        { itemId: 1, itemLabelSnapshot: 'Tires', verdict: 'ok', note: '' },
        { itemId: 2, itemLabelSnapshot: 'Brakes', verdict: 'needs_repair', note: 'worn pads' },
      ];

      expect(toInspectionDetailRows(items)).toEqual([
        { itemId: 1, itemLabelSnapshot: 'Tires', verdict: 'ok', verdictChipToken: 'is-success', note: '' },
        {
          itemId: 2,
          itemLabelSnapshot: 'Brakes',
          verdict: 'needs_repair',
          verdictChipToken: 'is-danger',
          note: 'worn pads',
        },
      ]);
    });

    it('falls back to an empty string for a missing note', () => {
      const items: VehicleInspectionDetailItemDto[] = [
        { itemId: 1, itemLabelSnapshot: 'Tires', verdict: 'ok', note: null as unknown as string },
      ];
      expect(toInspectionDetailRows(items)[0].note).toBe('');
    });
  });
});
