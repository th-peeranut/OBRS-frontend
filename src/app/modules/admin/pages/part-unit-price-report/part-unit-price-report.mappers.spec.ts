import {
  countBars,
  groupComparableLinesByUnit,
  hasComparableUnitGroup,
} from './part-unit-price-report.mappers';
import { PartUnitPriceLineDto } from '../../../../shared/interfaces/part-unit-price-report.interface';

/**
 * OBRS-1613 AC4. Everything asserted here is a way the chart could lie, and the fixtures are the
 * owner's own bills (2026-08-25): จาระบี at ฿400 and ฿480 from two garages a year apart, and
 * โช้คอัพหน้า with one real price, one ฿0 and one with no per-unit price at all.
 */
describe('part-unit-price-report.mappers', () => {
  function line(overrides: Partial<PartUnitPriceLineDto> = {}): PartUnitPriceLineDto {
    return {
      expenseId: 1,
      expenseDate: '2026-07-28',
      payeeName: 'อู่ช่างปุ้น',
      unit: 'กระป๋อง',
      unitPrice: '400.00',
      status: 'COMPARABLE',
      ...overrides,
    };
  }

  it('scales every bar against the dearest one in its own unit group', () => {
    const groups = groupComparableLinesByUnit([
      line({ expenseId: 2, expenseDate: '2025-01-16', unitPrice: '480.00' }),
      line({ expenseId: 1, unitPrice: '400.00' }),
    ]);

    expect(groups.length).toBe(1);
    expect(groups[0].unit).toBe('กระป๋อง');
    expect(groups[0].bars.map((bar) => bar.widthPercent)).toEqual([100, (400 / 480) * 100]);
  });

  it('keeps the order the bills arrived in, which the backend already made oldest-first', () => {
    // The chart reads left to right as time. Re-sorting here would be the screen overruling an
    // order the API had already claimed - and the two calls would then disagree.
    const groups = groupComparableLinesByUnit([
      line({ expenseId: 2, expenseDate: '2025-01-16', unitPrice: '480.00' }),
      line({ expenseId: 1, expenseDate: '2026-07-28', unitPrice: '400.00' }),
    ]);

    expect(groups[0].bars.map((bar) => bar.expenseDate)).toEqual(['2025-01-16', '2026-07-28']);
  });

  it('never draws a bar for a ฿0 line or for a line the bill wrote no unit price on', () => {
    // AC4. A ฿0 bar reads as a garage that charged nothing (it was the owner's own part), and a
    // line with no price has nothing to draw that the bill actually says.
    const groups = groupComparableLinesByUnit([
      line({ expenseId: 1, unit: 'ต้น', unitPrice: '2950.00' }),
      line({ expenseId: 2, unit: 'ต้น', unitPrice: '0.00', status: 'EXCLUDED_ZERO_PRICE' }),
      line({ expenseId: 2, unit: 'ต้น', unitPrice: null, status: 'EXCLUDED_NO_UNIT_PRICE' }),
    ]);

    expect(countBars(groups)).toBe(1);
    expect(groups[0].bars[0].unitPrice).toBe('2950.00');
  });

  it('splits two units into two groups and never scales one against the other', () => {
    // ฿400 per กระป๋อง beside ฿480 per ลิตร on one axis would read as a 20% price rise between two
    // measurements that are not the same measurement.
    const groups = groupComparableLinesByUnit([
      line({ expenseId: 1, unit: 'กระป๋อง', unitPrice: '400.00' }),
      line({ expenseId: 2, unit: 'ลิตร', unitPrice: '480.00' }),
    ]);

    expect(groups.map((group) => group.unit)).toEqual(['กระป๋อง', 'ลิตร']);
    expect(groups.map((group) => group.bars[0].widthPercent)).toEqual([100, 100]);
    expect(hasComparableUnitGroup(groups)).toBeFalse();
  });

  it('treats a missing unit and a blank one as the one answer the bill actually gave', () => {
    const groups = groupComparableLinesByUnit([
      line({ expenseId: 1, unit: null, unitPrice: '250.00' }),
      line({ expenseId: 2, unit: '   ', unitPrice: '300.00' }),
    ]);

    expect(groups.length).toBe(1);
    expect(groups[0].unit).toBeNull();
    expect(hasComparableUnitGroup(groups)).toBeTrue();
  });

  it('two prices in two units is NOT a comparison, even though there are two prices', () => {
    // The distinction the screen turns on: "only one bill so far" and "several bills that cannot
    // be lined up" are different situations and the owner is told which one he is in.
    const twoUnits = groupComparableLinesByUnit([
      line({ expenseId: 1, unit: 'กระป๋อง' }),
      line({ expenseId: 2, unit: 'ลิตร' }),
    ]);
    const oneBill = groupComparableLinesByUnit([line({ expenseId: 1 })]);

    expect(countBars(twoUnits)).toBe(2);
    expect(hasComparableUnitGroup(twoUnits)).toBeFalse();
    expect(countBars(oneBill)).toBe(1);
    expect(hasComparableUnitGroup(oneBill)).toBeFalse();
  });

  it('gives back nothing at all when the selected part has no comparable line', () => {
    const groups = groupComparableLinesByUnit([
      line({ unitPrice: null, status: 'EXCLUDED_NO_UNIT_PRICE' }),
    ]);

    expect(groups).toEqual([]);
    expect(hasComparableUnitGroup(groups)).toBeFalse();
  });
});
