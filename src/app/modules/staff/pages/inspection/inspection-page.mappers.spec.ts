import { VehicleInspectionItemDto } from '../../../../services/staff/staff-api.service';
import {
  buildInspectionPayload,
  countCompletedRows,
  countGroupCompleted,
  findFirstIncompleteRowIndex,
  findAssignedVehicleCode,
  findFirstMissingNoteRowIndex,
  groupRowsByCategory,
  InspectionItemRow,
  InspectionRowValue,
  mergeRowValues,
  toActiveItemRows,
  toVehicleOptions,
} from './inspection-page.mappers';

function makeItem(overrides: Partial<VehicleInspectionItemDto> = {}): VehicleInspectionItemDto {
  return {
    id: 1,
    code: 'tires',
    label: 'Tires',
    displayOrder: 1,
    active: true,
    category: 'TIRES',
    categoryOrder: 2,
    ...overrides,
  };
}

function makeRow(overrides: Partial<InspectionItemRow> = {}): InspectionItemRow {
  return { itemId: 1, label: 'Row', displayOrder: 1, category: 'TIRES', categoryOrder: 2, ...overrides };
}

describe('inspection-page.mappers', () => {
  describe('toVehicleOptions', () => {
    it('maps to {code, label} with no pre-seeded selection concern (§3.1)', () => {
      expect(toVehicleOptions([{ id: 5, label: 'Van 05', assignedToMe: false }])).toEqual([
        { code: '5', label: 'Van 05' },
      ]);
    });
  });

  // OBRS-1332: the DEFAULT selection. Note what is NOT asserted anywhere here — that the
  // list is filtered. It is not: the whole fleet stays selectable (ADR-0091), and this
  // function only says which row the form should start on.
  describe('findAssignedVehicleCode', () => {
    it('returns the code of the van this driver is the regular driver of', () => {
      expect(
        findAssignedVehicleCode([
          { id: 5, label: 'Van 05', assignedToMe: false },
          { id: 9, label: 'Van 09', assignedToMe: true },
        ])
      ).toBe('9');
    });

    it('returns null when the driver has no regular van, leaving the picker empty (§3.1)', () => {
      expect(
        findAssignedVehicleCode([{ id: 5, label: 'Van 05', assignedToMe: false }])
      ).toBeNull();
      expect(findAssignedVehicleCode([])).toBeNull();
    });

    it('picks the first when a driver is the regular driver of several vans', () => {
      expect(
        findAssignedVehicleCode([
          { id: 5, label: 'Van 05', assignedToMe: true },
          { id: 9, label: 'Van 09', assignedToMe: true },
        ])
      ).toBe('5');
    });
  });

  describe('toActiveItemRows', () => {
    it('filters out inactive items and sorts by displayOrder within a category', () => {
      const items = [
        makeItem({ id: 3, displayOrder: 3, label: 'Brakes' }),
        makeItem({ id: 1, displayOrder: 1, label: 'Tires' }),
        makeItem({ id: 2, displayOrder: 2, label: 'Lights', active: false }),
      ];

      expect(toActiveItemRows(items)).toEqual([
        { itemId: 1, label: 'Tires', displayOrder: 1, category: 'TIRES', categoryOrder: 2 },
        { itemId: 3, label: 'Brakes', displayOrder: 3, category: 'TIRES', categoryOrder: 2 },
      ]);
    });

    // OBRS-530 / RISK-2: the ONE assertion standing between the backend's
    // grouped order and a silently ungrouped UI. A higher displayOrder in an
    // EARLIER-declared category must still sort first — proves the sort key
    // is genuinely `(categoryOrder, displayOrder)`, not `displayOrder` alone.
    it('sorts by categoryOrder FIRST, displayOrder only as the tiebreak within a group', () => {
      const items = [
        makeItem({ id: 1, code: 'brake_fluid', displayOrder: 20, category: 'ENGINE_FLUIDS', categoryOrder: 1 }),
        makeItem({ id: 2, code: 'tire_pressure_tread', displayOrder: 1, category: 'TIRES', categoryOrder: 2 }),
      ];

      // id=1 has a HIGHER displayOrder (20 > 1) but a LOWER categoryOrder — it
      // must still come first. A displayOrder-only sort would reverse this.
      expect(toActiveItemRows(items).map((r) => r.itemId)).toEqual([1, 2]);
    });

    it('falls back to itemId as the final tiebreak when categoryOrder AND displayOrder tie', () => {
      const items = [
        makeItem({ id: 9, displayOrder: 1, category: 'TIRES', categoryOrder: 2 }),
        makeItem({ id: 3, displayOrder: 1, category: 'TIRES', categoryOrder: 2 }),
      ];

      expect(toActiveItemRows(items).map((r) => r.itemId)).toEqual([3, 9]);
    });
  });

  describe('groupRowsByCategory (OBRS-530)', () => {
    it('partitions an already-sorted flat array into contiguous per-category runs', () => {
      const rows = [
        makeRow({ itemId: 1, category: 'ENGINE_FLUIDS', categoryOrder: 1 }),
        makeRow({ itemId: 2, category: 'ENGINE_FLUIDS', categoryOrder: 1 }),
        makeRow({ itemId: 3, category: 'TIRES', categoryOrder: 2 }),
      ];

      const groups = groupRowsByCategory(rows);

      expect(groups.map((g) => g.category)).toEqual(['ENGINE_FLUIDS', 'TIRES']);
      expect(groups[0].labelKey).toBe('ADMIN.INSPECTION_ITEMS.CATEGORY.ENGINE_FLUIDS');
      expect(groups[0].rows.map((r) => r.row.itemId)).toEqual([1, 2]);
      expect(groups[1].rows.map((r) => r.row.itemId)).toEqual([3]);
    });

    // FE-T1 — the highest-risk assertion on this card. A `filter()`-per-category
    // implementation (`rows.filter(r => r.category === c).map((row, i) =>
    // ({row, flatIndex: i}))`) produces the SAME groups but resets `flatIndex`
    // to 0 at the start of every group instead of continuing the running
    // count — e.g. [0, 1, 0] instead of [0, 1, 2] for the fixture below. Since
    // `itemsFormArray` is built by iterating this SAME flat array once in
    // order (`applyRowsToFormArray`), a reset `flatIndex` silently points a
    // later group's verdict/note taps at the WRONG FormGroup, with no error
    // anywhere. This test fails immediately against a filter-based impl.
    it('FE-T1: flattening in render order yields flatIndex exactly 0..N-1 ascending, matching itemRows order', () => {
      const rows = [
        makeRow({ itemId: 11, category: 'ENGINE_FLUIDS', categoryOrder: 1, displayOrder: 1 }),
        makeRow({ itemId: 12, category: 'ENGINE_FLUIDS', categoryOrder: 1, displayOrder: 2 }),
        makeRow({ itemId: 21, category: 'TIRES', categoryOrder: 2, displayOrder: 3 }),
        makeRow({ itemId: 22, category: 'TIRES', categoryOrder: 2, displayOrder: 4 }),
        makeRow({ itemId: 31, category: 'LIGHTING', categoryOrder: 3, displayOrder: 5 }),
      ];

      const groups = groupRowsByCategory(rows);
      const flattened = groups.flatMap((g) => g.rows);

      expect(flattened.map((r) => r.flatIndex)).toEqual([0, 1, 2, 3, 4]);
      expect(flattened.map((r) => r.row.itemId)).toEqual(rows.map((r) => r.itemId));
    });

    it('a single-category input produces exactly one group covering every row', () => {
      const rows = [makeRow({ itemId: 1 }), makeRow({ itemId: 2 })];
      const groups = groupRowsByCategory(rows);

      expect(groups.length).toBe(1);
      expect(groups[0].rows.map((r) => r.row.itemId)).toEqual([1, 2]);
    });

    it('an empty input produces no groups', () => {
      expect(groupRowsByCategory([])).toEqual([]);
    });
  });

  describe('countGroupCompleted (OBRS-530)', () => {
    it('FE-T4: a partially-filled group returns a done count that is neither 0 nor the total', () => {
      const group = {
        category: 'TIRES',
        labelKey: 'ADMIN.INSPECTION_ITEMS.CATEGORY.TIRES',
        rows: [
          { row: makeRow({ itemId: 1 }), flatIndex: 0 },
          { row: makeRow({ itemId: 2 }), flatIndex: 1 },
          { row: makeRow({ itemId: 3 }), flatIndex: 2 },
        ],
      };
      const rowValues: InspectionRowValue[] = [
        { itemId: 1, verdict: 'ok', note: '' },
        { itemId: 2, verdict: null, note: '' },
        { itemId: 3, verdict: 'needs_repair', note: 'worn' },
      ];

      const result = countGroupCompleted(group, rowValues);

      expect(result.total).toBe(3);
      expect(result.done).toBe(2);
      expect(result.done).not.toBe(0);
      expect(result.done).not.toBe(result.total);
    });

    it('counts 0 done when every row in the group is still unverdicted', () => {
      const group = {
        category: 'TIRES',
        labelKey: 'ADMIN.INSPECTION_ITEMS.CATEGORY.TIRES',
        rows: [{ row: makeRow({ itemId: 1 }), flatIndex: 0 }],
      };
      const rowValues: InspectionRowValue[] = [{ itemId: 1, verdict: null, note: '' }];

      expect(countGroupCompleted(group, rowValues)).toEqual({ done: 0, total: 1 });
    });
  });

  describe('mergeRowValues', () => {
    it('seeds every active item with a null verdict / empty note when there are no previous values', () => {
      const items = [makeItem({ id: 1 }), makeItem({ id: 2, displayOrder: 2 })];

      expect(mergeRowValues(items, new Map())).toEqual([
        { itemId: 1, verdict: null, note: '' },
        { itemId: 2, verdict: null, note: '' },
      ]);
    });

    it('carries forward an already-entered verdict/note for an itemId still active', () => {
      const items = [makeItem({ id: 1 }), makeItem({ id: 2, displayOrder: 2 })];
      const previous = new Map<number, InspectionRowValue>([
        [1, { itemId: 1, verdict: 'needs_repair', note: 'worn tread' }],
      ]);

      expect(mergeRowValues(items, previous)).toEqual([
        { itemId: 1, verdict: 'needs_repair', note: 'worn tread' },
        { itemId: 2, verdict: null, note: '' },
      ]);
    });

    it('drops a previously-entered value for an itemId that is no longer active (INSPECTION_ITEM_INACTIVE recovery)', () => {
      const items = [makeItem({ id: 1, active: false }), makeItem({ id: 2, displayOrder: 2 })];
      const previous = new Map<number, InspectionRowValue>([
        [1, { itemId: 1, verdict: 'ok', note: '' }],
        [2, { itemId: 2, verdict: 'needs_repair', note: 'brake pads' }],
      ]);

      expect(mergeRowValues(items, previous)).toEqual([
        { itemId: 2, verdict: 'needs_repair', note: 'brake pads' },
      ]);
    });
  });

  describe('countCompletedRows / findFirstIncompleteRowIndex', () => {
    it('counts rows with a chosen verdict and finds the first incomplete one', () => {
      const rows: InspectionRowValue[] = [
        { itemId: 1, verdict: 'ok', note: '' },
        { itemId: 2, verdict: null, note: '' },
        { itemId: 3, verdict: 'ok', note: '' },
      ];

      expect(countCompletedRows(rows)).toBe(2);
      expect(findFirstIncompleteRowIndex(rows)).toBe(1);
    });

    it('returns -1 when every row is complete', () => {
      const rows: InspectionRowValue[] = [{ itemId: 1, verdict: 'ok', note: '' }];
      expect(findFirstIncompleteRowIndex(rows)).toBe(-1);
    });
  });

  describe('findFirstMissingNoteRowIndex', () => {
    it('finds the first needs_repair row with a blank note', () => {
      const rows: InspectionRowValue[] = [
        { itemId: 1, verdict: 'ok', note: '' },
        { itemId: 2, verdict: 'needs_repair', note: '   ' },
        { itemId: 3, verdict: 'needs_repair', note: 'cracked mirror' },
      ];

      expect(findFirstMissingNoteRowIndex(rows)).toBe(1);
    });

    it('returns -1 when every needs_repair row has a note', () => {
      const rows: InspectionRowValue[] = [
        { itemId: 1, verdict: 'needs_repair', note: 'cracked mirror' },
      ];
      expect(findFirstMissingNoteRowIndex(rows)).toBe(-1);
    });
  });

  describe('buildInspectionPayload', () => {
    it('builds the locked payload shape — note is always a string, never null', () => {
      const rows: InspectionRowValue[] = [
        { itemId: 1, verdict: 'ok', note: '' },
        { itemId: 2, verdict: 'needs_repair', note: '  worn brake pad  ' },
      ];

      expect(buildInspectionPayload(123456, '', rows)).toEqual({
        odometerKm: 123456,
        items: [
          { itemId: 1, verdict: 'ok', note: '' },
          { itemId: 2, verdict: 'needs_repair', note: 'worn brake pad' },
        ],
      });
    });

    it('includes trimmed top-level notes only when non-blank', () => {
      const rows: InspectionRowValue[] = [{ itemId: 1, verdict: 'ok', note: '' }];

      expect(buildInspectionPayload(100, '  all clear  ', rows).notes).toBe('all clear');
      expect(buildInspectionPayload(100, '   ', rows).notes).toBeUndefined();
    });

    it('never emits null for an untouched note field', () => {
      const rows: InspectionRowValue[] = [{ itemId: 1, verdict: 'ok', note: null as unknown as string }];
      expect(buildInspectionPayload(100, '', rows).items[0].note).toBe('');
    });

    it('throws if a row still has no verdict (caller must pre-validate)', () => {
      const rows: InspectionRowValue[] = [{ itemId: 1, verdict: null, note: '' }];
      expect(() => buildInspectionPayload(100, '', rows)).toThrow();
    });
  });
});
