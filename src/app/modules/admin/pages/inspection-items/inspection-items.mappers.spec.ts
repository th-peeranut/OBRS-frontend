import { AdminInspectionItemDto } from '../../../../services/admin/admin-api.service';
import {
  InspectionItemRow,
  moveRowDown,
  moveRowToBottom,
  moveRowToTop,
  moveRowUp,
  toInspectionItemRows,
  toReorderPayload,
  translationLabel,
} from './inspection-items.mappers';

function item(overrides: Partial<AdminInspectionItemDto> = {}): AdminInspectionItemDto {
  return {
    id: 1,
    code: 'engine_oil',
    displayOrder: 1,
    active: true,
    translations: [
      { locale: 'en', label: 'Engine oil' },
      { locale: 'th', label: 'น้ำมันเครื่อง' },
      { locale: 'zh', label: '机油' },
    ],
    ...overrides,
  };
}

function row(overrides: Partial<InspectionItemRow> = {}): InspectionItemRow {
  return {
    id: 1,
    code: 'a',
    displayOrder: 1,
    active: true,
    labelEn: 'A',
    labelTh: 'A-TH',
    labelZh: 'A-ZH',
    ...overrides,
  };
}

describe('translationLabel()', () => {
  it('finds the label matching the requested locale', () => {
    expect(translationLabel(item().translations, 'th')).toBe('น้ำมันเครื่อง');
  });

  it('returns an empty string when the locale is missing', () => {
    expect(translationLabel([{ locale: 'en', label: 'Engine oil' }], 'zh')).toBe('');
  });
});

describe('toInspectionItemRows()', () => {
  it('maps each item into a row with all three locale labels resolved', () => {
    const rows = toInspectionItemRows([item()]);
    expect(rows).toEqual([
      {
        id: 1,
        code: 'engine_oil',
        displayOrder: 1,
        active: true,
        labelEn: 'Engine oil',
        labelTh: 'น้ำมันเครื่อง',
        labelZh: '机油',
      },
    ]);
  });

  it('sorts by displayOrder (then id as a tiebreak), defensively — never trusts wire order', () => {
    const rows = toInspectionItemRows([
      item({ id: 3, displayOrder: 2 }),
      item({ id: 1, displayOrder: 1 }),
      item({ id: 2, displayOrder: 3 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual([1, 3, 2]);
  });
});

describe('reorder array math (moveRowUp/Down/ToTop/ToBottom)', () => {
  const rows = [row({ id: 1, displayOrder: 1 }), row({ id: 2, displayOrder: 2 }), row({ id: 3, displayOrder: 3 }), row({ id: 4, displayOrder: 4 })];

  it('moveRowUp swaps with the row immediately above and recomputes a dense 1..N', () => {
    const result = moveRowUp(rows, 2); // row id=3
    expect(result.map((r) => r.id)).toEqual([1, 3, 2, 4]);
    expect(result.map((r) => r.displayOrder)).toEqual([1, 2, 3, 4]);
  });

  it('moveRowUp at the top is a no-op (same array reference)', () => {
    expect(moveRowUp(rows, 0)).toBe(rows);
  });

  it('moveRowDown swaps with the row immediately below', () => {
    const result = moveRowDown(rows, 1); // row id=2
    expect(result.map((r) => r.id)).toEqual([1, 3, 2, 4]);
  });

  it('moveRowDown at the bottom is a no-op (same array reference)', () => {
    expect(moveRowDown(rows, rows.length - 1)).toBe(rows);
  });

  it('moveRowToTop jumps a bottom row to position 1 in one step', () => {
    const result = moveRowToTop(rows, 3); // row id=4
    expect(result.map((r) => r.id)).toEqual([4, 1, 2, 3]);
    expect(result.map((r) => r.displayOrder)).toEqual([1, 2, 3, 4]);
  });

  it('moveRowToBottom jumps a top row to the last position in one step', () => {
    const result = moveRowToBottom(rows, 0); // row id=1
    expect(result.map((r) => r.id)).toEqual([2, 3, 4, 1]);
    expect(result.map((r) => r.displayOrder)).toEqual([1, 2, 3, 4]);
  });

  it('the recomputed sequence spans the WHOLE array, including a retired row', () => {
    const withRetired = [
      row({ id: 1, displayOrder: 1, active: true }),
      row({ id: 2, displayOrder: 2, active: false }),
      row({ id: 3, displayOrder: 3, active: true }),
    ];
    const result = moveRowUp(withRetired, 2);
    // The retired row (id=2) keeps taking part in the dense sequence.
    expect(result.map((r) => ({ id: r.id, displayOrder: r.displayOrder }))).toEqual([
      { id: 1, displayOrder: 1 },
      { id: 3, displayOrder: 2 },
      { id: 2, displayOrder: 3 },
    ]);
  });
});

describe('toReorderPayload()', () => {
  it('builds { items: [{id, displayOrder}] } for the WHOLE rows array', () => {
    const rows = [row({ id: 5, displayOrder: 1 }), row({ id: 9, displayOrder: 2, active: false })];
    expect(toReorderPayload(rows)).toEqual({
      items: [
        { id: 5, displayOrder: 1 },
        { id: 9, displayOrder: 2 },
      ],
    });
  });
});
