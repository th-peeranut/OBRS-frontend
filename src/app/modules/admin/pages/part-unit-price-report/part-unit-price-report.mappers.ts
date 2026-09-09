import { PartUnitPriceLineDto } from '../../../../shared/interfaces/part-unit-price-report.interface';

/**
 * OBRS-1613 AC3/AC4 — turning the selected part's bill lines into the bars the chart draws.
 *
 * A pure function rather than a getter on the component, for the reason
 * `expenses-page.mappers.ts` gives: the decisions here are the report's meaning, and they are
 * testable without a component harness.
 */

/** One bar: one bill, one price, scaled against the dearest bar IN ITS OWN UNIT GROUP. */
export interface PartPriceBar {
  expenseId: number;
  expenseDate: string;
  payeeName: string | null;
  /** Scale-2 decimal string, straight off the bill. Never derived. */
  unitPrice: string;
  /** 0–100. */
  widthPercent: number;
}

/**
 * All the prices the bills wrote in ONE unit. ฿400 per กระป๋อง and ฿480 per ลิตร are not a price
 * rise, so they are never scaled against each other and never share an axis.
 */
export interface PartPriceUnitGroup {
  /** `null` when the bill wrote no unit — its own group, comparable only against other blanks. */
  unit: string | null;
  bars: PartPriceBar[];
}

/**
 * The comparable lines, grouped by unit and scaled within each group.
 *
 * <p>Excluded lines never reach a bar: a ฿0 line drawn at zero width reads as a garage that
 * charged nothing, and a line with no price has nothing to draw at all. They stay in the table
 * below the chart, where their status says which of the two they are (AC4).
 *
 * <p>Order is the order the lines arrived in, which the backend has already made oldest-first: the
 * chart reads left to right as time and re-sorting here would be the screen overruling that.
 */
export function groupComparableLinesByUnit(
  lines: PartUnitPriceLineDto[]
): PartPriceUnitGroup[] {
  const groups = new Map<string, PartPriceUnitGroup>();

  for (const line of lines) {
    // `unitPrice` is non-null for every COMPARABLE line the backend produces; the test is here
    // because the type says `string | null` and a bar cannot be built from null either way.
    if (line.status !== 'COMPARABLE' || line.unitPrice === null) {
      continue;
    }
    // A blank unit and a missing one are the same answer from the bill. A Map key has to be a
    // string, so they share one key here and come back out as `null`.
    const unit = line.unit !== null && line.unit.trim() !== '' ? line.unit : null;
    const key = unit ?? '';
    let group = groups.get(key);
    if (!group) {
      group = { unit, bars: [] };
      groups.set(key, group);
    }
    group.bars.push({
      expenseId: line.expenseId,
      expenseDate: line.expenseDate,
      payeeName: line.payeeName,
      unitPrice: line.unitPrice,
      widthPercent: 0,
    });
  }

  for (const group of groups.values()) {
    const dearest = Math.max(...group.bars.map((bar) => Number(bar.unitPrice)));
    for (const bar of group.bars) {
      // Scaled against the dearest rather than against a fixed maximum: the question is "how much
      // more did this one cost than that one", and a common axis across units would answer a
      // question nobody asked with a number that is not true of either unit.
      bar.widthPercent = dearest > 0 ? (Number(bar.unitPrice) / dearest) * 100 : 0;
    }
  }

  return [...groups.values()];
}

/**
 * Whether there is a COMPARISON, which is not the same as whether there are prices.
 *
 * Two prices in two different units are two prices and no comparison — the case the unit column
 * exists to catch. The screen says which of the two situations it is in rather than drawing one
 * bar and letting it read as a trend.
 */
export function hasComparableUnitGroup(groups: PartPriceUnitGroup[]): boolean {
  return groups.some((group) => group.bars.length >= 2);
}

/** How many prices there are at all, across every unit. */
export function countBars(groups: PartPriceUnitGroup[]): number {
  return groups.reduce((total, group) => total + group.bars.length, 0);
}
