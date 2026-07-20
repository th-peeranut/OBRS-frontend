import {
  VehicleInspectionDetailItemDto,
  VehicleInspectionListItemDto,
} from '../../../../../services/admin/admin-api.service';
import {
  filterInspectionRowsByWindow,
  groupDetailRowsByCategory,
  toInspectionDetailRows,
  toInspectionHistoryRow,
} from './vehicle-inspection.mappers';

function makeDetailItem(
  overrides: Partial<VehicleInspectionDetailItemDto> = {}
): VehicleInspectionDetailItemDto {
  return {
    itemId: 1,
    itemLabelSnapshot: 'Tires',
    verdict: 'ok',
    note: '',
    categorySnapshot: 'TIRES',
    categoryOrder: 2,
    ...overrides,
  };
}

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
        makeDetailItem({ itemId: 1, itemLabelSnapshot: 'Tires', verdict: 'ok', note: '' }),
        makeDetailItem({
          itemId: 2,
          itemLabelSnapshot: 'Brakes',
          verdict: 'needs_repair',
          note: 'worn pads',
          categorySnapshot: 'DRIVING',
          categoryOrder: 4,
        }),
      ];

      expect(toInspectionDetailRows(items)).toEqual([
        {
          itemId: 1,
          itemLabelSnapshot: 'Tires',
          verdict: 'ok',
          verdictChipToken: 'is-success',
          note: '',
          categorySnapshot: 'TIRES',
        },
        {
          itemId: 2,
          itemLabelSnapshot: 'Brakes',
          verdict: 'needs_repair',
          verdictChipToken: 'is-danger',
          note: 'worn pads',
          categorySnapshot: 'DRIVING',
        },
      ]);
    });

    it('falls back to an empty string for a missing note', () => {
      const items: VehicleInspectionDetailItemDto[] = [
        makeDetailItem({ note: null as unknown as string }),
      ];
      expect(toInspectionDetailRows(items)[0].note).toBe('');
    });

    // OBRS-553: carries categorySnapshot through untouched — this is the
    // frozen-at-submit value; toInspectionDetailRows must never substitute a
    // different/live category for it.
    it('carries categorySnapshot through unchanged', () => {
      const items: VehicleInspectionDetailItemDto[] = [
        makeDetailItem({ categorySnapshot: 'WALKAROUND' }),
      ];
      expect(toInspectionDetailRows(items)[0].categorySnapshot).toBe('WALKAROUND');
    });
  });

  describe('groupDetailRowsByCategory (OBRS-553)', () => {
    it('partitions an already-sorted flat array into contiguous per-categorySnapshot runs', () => {
      const items: VehicleInspectionDetailItemDto[] = [
        makeDetailItem({ itemId: 1, categorySnapshot: 'ENGINE_FLUIDS', categoryOrder: 1 }),
        makeDetailItem({ itemId: 2, categorySnapshot: 'ENGINE_FLUIDS', categoryOrder: 1 }),
        makeDetailItem({ itemId: 3, categorySnapshot: 'TIRES', categoryOrder: 2 }),
      ];
      const rows = toInspectionDetailRows(items);

      const groups = groupDetailRowsByCategory(rows);

      expect(groups.map((g) => g.category)).toEqual(['ENGINE_FLUIDS', 'TIRES']);
      expect(groups[0].labelKey).toBe('ADMIN.INSPECTION_ITEMS.CATEGORY.ENGINE_FLUIDS');
      expect(groups[0].rows.map((r) => r.row.itemId)).toEqual([1, 2]);
      expect(groups[1].rows.map((r) => r.row.itemId)).toEqual([3]);
    });

    // The highest-value regression test for this card (mirrors FE-T1 in
    // inspection-page.mappers.spec.ts, OBRS-530). A `filter()`-per-category
    // rewrite (`rows.filter(r => r.categorySnapshot === c).map((row, i) =>
    // ({row, flatIndex: i}))`) produces the SAME groups/labels — this
    // assertion is the one that distinguishes it, by pinning the flattened
    // `flatIndex` sequence as the running count `0..N-1`, never reset per
    // group. A filter-based rewrite would flatten to `[0, 1, 0, 1, 0]`
    // instead of `[0, 1, 2, 3, 4]` for this 3-category, 5-row fixture.
    it('FE-T1: carries a running flatIndex across group boundaries, never reset per group', () => {
      const items: VehicleInspectionDetailItemDto[] = [
        makeDetailItem({ itemId: 15, categorySnapshot: 'CABIN', categoryOrder: 5 }),
        makeDetailItem({ itemId: 17, categorySnapshot: 'CABIN', categoryOrder: 5 }),
        makeDetailItem({ itemId: 16, categorySnapshot: 'SAFETY_DOCS', categoryOrder: 6 }),
        makeDetailItem({ itemId: 18, categorySnapshot: 'SAFETY_DOCS', categoryOrder: 6 }),
        makeDetailItem({ itemId: 22, categorySnapshot: 'WALKAROUND', categoryOrder: 7 }),
      ];
      const rows = toInspectionDetailRows(items);

      const groups = groupDetailRowsByCategory(rows);
      const flattened = groups.flatMap((g) => g.rows);

      expect(flattened.map((r) => r.flatIndex)).toEqual([0, 1, 2, 3, 4]);
      expect(flattened.map((r) => r.row.itemId)).toEqual(rows.map((r) => r.itemId));
    });

    it('a single-category input produces exactly one group covering every row', () => {
      const items: VehicleInspectionDetailItemDto[] = [
        makeDetailItem({ itemId: 1 }),
        makeDetailItem({ itemId: 2 }),
      ];
      const groups = groupDetailRowsByCategory(toInspectionDetailRows(items));

      expect(groups.length).toBe(1);
      expect(groups[0].rows.map((r) => r.row.itemId)).toEqual([1, 2]);
    });

    it('an empty input produces no groups', () => {
      expect(groupDetailRowsByCategory([])).toEqual([]);
    });
  });
});
