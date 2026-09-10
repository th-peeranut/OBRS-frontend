/**
 * `GET /api/private/admin/reports/pl-per-vehicle?from&to` response shape (OBRS-841).
 *
 * Money fields are DECIMAL STRINGS (e.g. "3200.00"), the same convention as
 * `RefundVoidAmountDto` (OBRS-98) — never do arithmetic on them client-side, only
 * format for display. Every total this screen shows is already computed server-side.
 */

/**
 * One expense category's total inside a row. `amount` is VAT-INCLUSIVE and `vatAmount`
 * is the component ALREADY INSIDE it (ADR-0115 §1: fares are VAT-exempt so input VAT is
 * unrecoverable and a real cost) — **adding the two together double-counts**, and nothing
 * on this screen does.
 *
 * A category with no rows in the period produces no line at all, which is what lets
 * `entryCount === 0` mean "entered as zero" rather than "never entered".
 */
export interface VehiclePlExpenseLineDto {
  category: string;
  amount: string;
  vatAmount: string;
  entryCount: number;
}

/** Why a ฿0 is a ฿0 — carried per row rather than derived here (ADR-0115 §3). */
export type VehiclePlCoverage = 'IN_SERVICE' | 'SERVICE_WINDOW_UNKNOWN' | 'OUTSIDE_SERVICE_WINDOW';

/**
 * The three row shapes, distinguished by `kind` and never by position:
 * a real `VEHICLE`, `UNASSIGNED_REVENUE` (money no vehicle could be found for) and
 * `CENTRAL_EXPENSE` (ส่วนกลาง cost that belongs to no single vehicle).
 *
 * **The last two are not the same bucket** — one is an attribution gap on the money side,
 * the other a real accounting category on the cost side — so the screen renders them as
 * two separate lines and never nets them against each other.
 */
export type VehiclePlRowKind = 'VEHICLE' | 'UNASSIGNED_REVENUE' | 'CENTRAL_EXPENSE';

export interface VehiclePlRowDto {
  kind: VehiclePlRowKind;
  vehicleId: number | null;
  numberPlate: string | null;
  header: string | null;
  status: string | null;
  inServiceFrom: string | null;
  inServiceTo: string | null;
  coverage: VehiclePlCoverage | null;
  revenue: string;
  /** The part of `revenue` that came from imported pre-go-live figures (OBRS-1508) — a
   * COMPONENT of `revenue`, never something to add to it. */
  historicalRevenue: string;
  historicalRevenueConflictCount: number;
  ranInPeriod: boolean;
  expensesByCategory: VehiclePlExpenseLineDto[];
  expenseTotal: string;
  vatTotal: string;
  expenseEntryCount: number;
  margin: string;
}

/**
 * The company figure. `revenue`/`expenses` already include the two vehicle-less lines, so
 * `margin` is the operator's actual contribution — NOT the sum of the vehicle rows, which
 * would be higher by exactly the central cost every time.
 *
 * `pendingExpenses` (OBRS-1356) is the one figure here that is deliberately NOT inside
 * `expenses` or `margin`: costs a salesperson recorded and the owner has not ruled on yet.
 */
export interface VehiclePlTotalsDto {
  revenue: string;
  expenses: string;
  vat: string;
  margin: string;
  currency: string;
  pendingExpenses: string;
}

export interface VehiclePlReportDto {
  from: string;
  to: string;
  /** Always `true` today, and on the wire on purpose — the screen states the convention
   * rather than leaving it in a Jira comment. It is not a toggle. */
  vatIncludedInAmounts: boolean;
  rows: VehiclePlRowDto[];
  totals: VehiclePlTotalsDto;
}
