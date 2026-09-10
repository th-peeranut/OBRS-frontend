/**
 * OBRS-1613 AC3/AC4/AC5 — `GET /admin/reports/part-unit-price`: what one registry entry cost, per
 * garage, over time.
 *
 * The other half of the owner's 2026-08-23 question. `payee-spend-report.interface.ts` answers
 * "ปีนี้จ่ายอู่ไหนไปเท่าไร" and cannot answer this one: a garage's yearly total moves because the
 * work moved, not because a price did.
 *
 * The endpoint takes NO date range at all, unlike every other report on this nav. Owner ruling
 * 2026-08-25: the only two parts on record with anything to compare straddle 2025/2026 in both
 * cases, so any default window opens the screen on an empty chart for the exact data it exists for.
 */

/**
 * Why a bill line is, or is not, on the chart.
 *
 * The two exclusions are separate values and the screen must keep them separate (AC4). Both were
 * measured on the owner's real bills:
 *
 * - `EXCLUDED_ZERO_PRICE` — the bill wrote ฿0 per unit, because the owner supplied the part
 *   himself. Charting it reads as the garage charging nothing; averaging against it reads as
 *   "ขึ้นราคา ∞%".
 * - `EXCLUDED_NO_UNIT_PRICE` — the bill wrote no per-unit price at all. Deriving one from the
 *   total would put a number the garage never wrote into the chart used to judge that garage.
 */
export type PartUnitPriceStatus =
  | 'COMPARABLE'
  | 'EXCLUDED_ZERO_PRICE'
  | 'EXCLUDED_NO_UNIT_PRICE';

/**
 * One selectable registry entry — only ones some bill actually named.
 *
 * `partCode` decides translation, exactly as it does on the registry screen: a row that carries a
 * code is one of the 13 seeded entries and is translated; a name the owner typed has `code === null`
 * and is Thai verbatim on every locale (owner ruling 2026-08-25). `maintenancePartLabel` is the one
 * function that applies that rule.
 *
 * `comparableLineCount` is what lets the picker warn BEFORE the click that a part has nothing to
 * compare yet.
 */
export interface PartUnitPriceOptionDto {
  partId: number;
  partName: string;
  partCode: string | null;
  lineCount: number;
  comparableLineCount: number;
}

/** One bill line of the selected part — excluded ones included, never filtered out. */
export interface PartUnitPriceLineDto {
  expenseId: number;
  /** ISO date, e.g. `"2026-07-28"`. */
  expenseDate: string;
  /** `null` for bills entered before `expenses.payee_id` existed (V121 backfilled nothing). */
  payeeName: string | null;
  /** The bill's own word — แผ่น / ลิตร / กระป๋อง. Part of the comparison key, not a label. */
  unit: string | null;
  /** Scale-2 decimal string, or `null` when the bill wrote no per-unit price at all. */
  unitPrice: string | null;
  status: PartUnitPriceStatus;
}

/**
 * AC5 — how much of the spend the report can speak for. The three excluded buckets and
 * `comparableAmount` add up to `totalAmount` exactly; nothing on the screen is a remainder.
 *
 * ⚠️ `unnamedAmount` covers every line with no registry entry on it, which includes the
 * "หลายอย่าง ราคาเดียว" lines the owner ruled (ทาง ค, 2026-08-25) should be linked to nothing.
 * Nothing in the data separates those two, so the screen says so rather than splitting them.
 */
export interface PartPriceCoverageDto {
  totalAmount: string;
  totalLineCount: number;
  comparableAmount: string;
  comparableLineCount: number;
  unnamedAmount: string;
  unnamedLineCount: number;
  excludedPriceAmount: string;
  excludedPriceLineCount: number;
}

export interface PartUnitPriceReportDto {
  /** `null` on first paint — the picker is the screen and renders before anything is chosen. */
  partId: number | null;
  partOptions: PartUnitPriceOptionDto[];
  lines: PartUnitPriceLineDto[];
  coverage: PartPriceCoverageDto;
}
