import { VehicleInspectionItemDto } from '../../../../services/staff/staff-api.service';
import {
  buildInspectionPayload,
  countCompletedRows,
  findFirstIncompleteRowIndex,
  findFirstMissingNoteRowIndex,
  InspectionRowValue,
  mergeRowValues,
  toActiveItemRows,
  toVehicleOptions,
} from './inspection-page.mappers';

function makeItem(overrides: Partial<VehicleInspectionItemDto> = {}): VehicleInspectionItemDto {
  return { id: 1, code: 'tires', label: 'Tires', displayOrder: 1, active: true, ...overrides };
}

describe('inspection-page.mappers', () => {
  describe('toVehicleOptions', () => {
    it('maps to {code, label} with no pre-seeded selection concern (§3.1)', () => {
      expect(toVehicleOptions([{ id: 5, label: 'Van 05' }])).toEqual([
        { code: '5', label: 'Van 05' },
      ]);
    });
  });

  describe('toActiveItemRows', () => {
    it('filters out inactive items and sorts by displayOrder', () => {
      const items = [
        makeItem({ id: 3, displayOrder: 3, label: 'Brakes' }),
        makeItem({ id: 1, displayOrder: 1, label: 'Tires' }),
        makeItem({ id: 2, displayOrder: 2, label: 'Lights', active: false }),
      ];

      expect(toActiveItemRows(items)).toEqual([
        { itemId: 1, label: 'Tires', displayOrder: 1 },
        { itemId: 3, label: 'Brakes', displayOrder: 3 },
      ]);
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
