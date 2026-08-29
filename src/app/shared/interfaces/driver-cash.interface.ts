/**
 * OBRS-960 — Driver Cash Ledger + Parcel Revenue Share. Shared across the
 * staff driver-cash panel (`StaffApiService`) and the owner-facing
 * settlements/system-settings surfaces (`AdminApiService`), per CLAUDE.md §8
 * ("interface shared across modules" -> `shared/interfaces/`).
 *
 * ⚠️ CORRECTED against the real backend (OBRS-backend `ao/obrs-960-driver-cash`
 * `afb440d4`, `DriverCashController.java` + its DTOs) — the FIRST version of
 * this file guessed a URL segment order and a nested `summary` sub-object
 * that don't exist. Every URL below is now pinned to the real controller;
 * the DTOs below — INCLUDING `DriverCashEntryRespDto`, confirmed
 * field-for-field on a second reconciliation pass after the first pass's
 * `{label, amount, fromUnmappedSalesPoint}` guess turned out to have no
 * `label` field at all (would have rendered `undefined` in every entry
 * row) — are the real, complete shapes. Nothing in this file remains
 * unverified against source.
 */

/** One route stop's per-head rate, as carried on the schedule's driver-cash
 * day response — drives the "rate not configured" pre-emptive warning on
 * the per-head form BEFORE submit. There is no separate per-action response
 * type — all four driver-cash POSTs return the full, refreshed
 * `DriverCashDayRespDto`, so the "rate actually applied" is read back from
 * THAT response's `perHeadRates[]` entry for the submitted `stopId`.
 * Confirmed field-for-field against the backend's `PerHeadRateStatusDto`. */
export interface DriverCashPerHeadRateLineDto {
  stopId: number;
  stopName: string;
  /**
   * OBRS-1073 — the counter this stop belongs to, or `null` when it belongs
   * to none. Read this BEFORE reacting to `configured: false`: only 10 of the
   * 101 seeded stops sit at a counter, so `configured === false` on its own
   * would raise "rate not set" on almost every stop of every route. A null
   * `salesPointId` means "no counter here, 0 is the right answer"; a non-null
   * one with `configured: false` is the real warning.
   */
  salesPointId: number | null;
  salesPointName: string | null;
  ratePerHead: string;
  configured: boolean;
}

/**
 * The four values of the backend's `ck_driver_cash_entries_type` CHECK
 * constraint. `PARCEL_SHARE` was deliberately removed from that constraint
 * and will never appear on the wire — do not add a branch for it.
 */
export type DriverCashEntryType = 'ADVANCE' | 'PER_HEAD' | 'EXPENSE_PAID' | 'RETURN';

/**
 * One itemized cash entry on a driver-cash day. Confirmed field-for-field
 * against the real backend `DriverCashEntryRespDto` class — the FIRST
 * version of this interface invented a `label: string` field that does not
 * exist on the wire (every entry row would have rendered the string
 * `"undefined"`, uncaught by TypeScript because the response was typed by
 * this file's own — wrong — interface, not the server's). There is no
 * display label on the wire at all: the frontend derives one from `type`
 * (+ `expenseCategory` for `EXPENSE_PAID`) via i18n — see
 * `DriverCashDayReturnModalComponent.entryTypeLabel()`.
 */
export interface DriverCashEntryRespDto {
  id: number;
  type: DriverCashEntryType;
  amount: string;
  scheduleId: number | null;
  stopId: number | null;
  headCount: number | null;
  expenseCategory: string | null;
  expenseId: number | null;
  note: string | null;
  fromUnmappedSalesPoint: boolean;
  createdAt: string;
}

export type DriverCashDayStatus = 'OPEN' | 'RETURNED';

/**
 * `GET /api/private/driver-cash/schedules/{scheduleId}/day`,
 * `GET /api/private/driver-cash/days/{dayId}`, AND the response of all four
 * driver-cash POSTs (`advance`, `per-head`, `expense-paid`, `return`) — ONE
 * flat DTO, confirmed field-for-field against the backend's
 * `DriverCashDayRespDto`. There is NO nested `summary` object (the first
 * version of this file invented one) and NO separate per-action response
 * type (the first version invented `DriverCashPerHeadRespDto` with an extra
 * `perHeadRateApplied`/`perHeadRateConfigured` pair that does not exist).
 */
export interface DriverCashDayRespDto {
  dayId: number;
  /**
   * OBRS-1073 — the CASH HOLDER, who may be a salesperson. The `driver*`
   * names are a knowingly accepted misnomer (the rename is OBRS-1080); read
   * `holderRole` before labelling this person a driver in the UI.
   */
  driverId: number;
  driverName: string;
  holderRole: DriverCashHolderRole;
  /** `LocalDate` on the wire — `yyyy-MM-dd`. */
  businessDate: string;
  vehicleId: number;
  status: DriverCashDayStatus;
  entries: DriverCashEntryRespDto[];
  advanceTotal: string;
  /**
   * The per-head fee this holder EARNED that day, as a positive magnitude.
   *
   * ⛔ OBRS-1145 — it is NOT inside `expectedReturnAmount` and must not be
   * rendered with a minus sign. The owner nets ค่าหัว at the counter: the
   * round's settlement expects `ticket cash − ค่าหัว` and the seller keeps the
   * fee, so deducting it here as well would credit the same fee twice. Show it
   * as a record of earnings, never as a term of what is still owed.
   */
  perHeadTotal: string;
  expensePaidTotal: string;
  parcelRemitTotal: string;
  /**
   * OBRS-992 — shares this driver owes back on parcels that were cancelled
   * and refunded. Already INSIDE `expectedReturnAmount`, so it must never be
   * added to it again: it is shown (OBRS-1053) only so the amount being
   * collected today can explain why it is higher than the day's own takings.
   */
  parcelClawbackTotal: string;
  expectedReturnAmount: string;
  returnedAmount: string | null;
  returnedAt: string | null;
  returnedByUserId: number | null;
  returnedByName: string | null;
  discrepancy: string | null;
  discrepancyReason: string | null;
  perHeadRates: DriverCashPerHeadRateLineDto[];
  hasUnmappedSalesPointRemit: boolean;
  /**
   * OBRS-1579 — how many times the owner has re-opened this box after it was
   * already signed off. ⛔ A box with `reopenCount > 0` must NEVER render as
   * an ordinary one, including once it is `RETURNED` again: the whole point of
   * the audit row is that a second sign-off is visible as a second sign-off.
   */
  reopenCount: number;
  /** OBRS-1579 — oldest first. Empty whenever `reopenCount` is 0. */
  reopens: DriverCashDayReopenRespDto[];
}

/**
 * OBRS-1579 — one re-open of a box that had already been returned, carrying
 * the snapshot the re-open wiped off the day row. `prevReturnedAmount` is what
 * the owner had signed for BEFORE this re-open, so a re-returned box can still
 * be read as "signed 120, then re-opened, then signed 1,320".
 */
export interface DriverCashDayReopenRespDto {
  reopenedAt: string;
  reopenedByUserId: number | null;
  reopenedByName: string | null;
  reason: string;
  prevReturnedAmount: string | null;
  prevExpectedReturnAmount: string | null;
  prevDiscrepancyReason: string | null;
}

export interface DriverCashAdvanceReqDto {
  amount: string;
}

/**
 * The request still names the STOP — that is what the person at the counter
 * can see. OBRS-1073 resolves its sales point server-side, so this shape did
 * not change even though the rate is no longer keyed by stop.
 */
export interface DriverCashPerHeadReqDto {
  stopId: number;
  headCount: number;
}

/**
 * OBRS-1630 — one repair bill, keyed at the counter into the driver's cash box.
 *
 * No `category`, no `expenseDate`, no `vehicleId` and no `amount`: the first three are facts about
 * the box the entry lands in and the server reads them off the schedule, and the amount is the
 * lines' total, which the server adds up. That is the whole reason a repair bill needed its own
 * endpoint rather than a seventh value in the category dropdown — a row there carries one number,
 * and a repair bill has lines and parts (owner ruling 2026-08-24).
 */
export interface DriverCashRepairBillReqDto {
  payeeId: number;
  note?: string;
  items: DriverCashRepairBillItemReqDto[];
}

/** OBRS-1630 — one line of the bill. Mirrors `ExpenseItemReqDto` on the wire; `part` is absent for
 * the labour and sundry lines that are not a part at all. */
export interface DriverCashRepairBillItemReqDto {
  part?: string | null;
  description: string;
  quantity?: number | null;
  unitPrice?: number | null;
  amount: number;
}

export interface DriverCashExpenseReqDto {
  category: string;
  /**
   * OBRS-1356 — optional ONLY for `DRIVER_WAGE`, which the backend prices
   * from the owner's rate per leg (1 leg = 1 schedule). Sending a number
   * there would be sending one the server discards.
   */
  amount?: string;
  note?: string;
  /**
   * OBRS-1363 — required when `category` is `OTHER` and refused otherwise, the
   * same `isOther == hasLabel` rule the admin `ExpenseReqDto` has always had.
   * It is not a second `note`: the OBRS-841 P&L groups on category, so an
   * unlabelled OTHER row is a bar nobody can read.
   */
  categoryOtherLabel?: string;
}

export interface DriverCashDayReturnReqDto {
  returnedAmount: string;
  discrepancyReason?: string;
}

/**
 * `POST /api/private/driver-cash/days/{dayId}/reopen` — OWNER-only
 * (`@PreAuthorize("hasRole('OWNER')")`). The reason is mandatory server-side
 * (`@NotBlank`, max 500) and is the only thing that explains, months later,
 * why a signed-off box was opened again.
 */
export interface DriverCashDayReopenReqDto {
  reason: string;
}

/**
 * `GET /api/private/driver-cash/days?from=&to=&status=` — OBRS-960's ONE
 * genuine contract gap (the SA never specified a list endpoint; the first
 * version of this file guessed a path/shape and both were wrong). Confirmed
 * against the backend's `DriverCashDaySummaryRespDto`: a LIST ROW, distinct
 * from the full `DriverCashDayRespDto` above — no `entries`, no
 * `perHeadRates`, and money is only the three totals a list needs. The
 * response is a **flat array**, not a `{range, items}` page wrapper (the
 * first version of this file invented that wrapper too).
 */
export interface DriverCashDaySummaryRespDto {
  dayId: number;
  driverId: number;
  driverName: string;
  holderRole: DriverCashHolderRole;
  businessDate: string;
  vehicleId: number;
  vehiclePlate: string;
  status: DriverCashDayStatus;
  expectedReturnAmount: string;
  returnedAmount: string | null;
  discrepancy: string | null;
  hasUnmappedSalesPointRemit: boolean;
  /**
   * OBRS-1073 — a SALESPERSON row still OPEN on a business date that has
   * already passed. The owner's rule is that a salesperson never holds cash
   * overnight, so this is a broken rule, not a slow day. Never true for a
   * DRIVER row: his sign-off is the NEXT morning by design.
   */
  overdueOpen: boolean;
}

// ── Owner settings: driver-cash per-head rates (`/admin/settings`, surface 5) ──
// Endpoint paths unaffected by the backend reconciliation.

/**
 * OBRS-1073 — a rate belongs to a SALES POINT (the counter), not to a bus
 * stop. บ้านบึง alone covers 7 stops, so the old per-stop key meant 10
 * hand-keyed rows that all had to agree; this is 3.
 */
export interface DriverCashRateRowDto {
  id: number;
  salesPointId: number;
  salesPointCode: string;
  salesPointName: string;
  effectiveFrom: string;
  ratePerHead: string;
}

export interface DriverCashRateReqDto {
  salesPointId: number;
  effectiveFrom: string;
  ratePerHead: string;
}

/**
 * OBRS-1356 — the driver's wage for ONE leg (1 leg = 1 schedule, the owner's
 * own definition). No sales point: unlike the per-head fee above, a wage does
 * not belong to a counter, so one row answers for the whole operator.
 */
export interface DriverWageRateRowDto {
  id: number;
  effectiveFrom: string;
  ratePerLeg: string;
}

export interface DriverWageRateReqDto {
  effectiveFrom: string;
  ratePerLeg: string;
}

/** OBRS-1073 — `GET /api/private/owner/driver-cash/sales-points`, the picker source. */
export interface SalesPointOptionDto {
  id: number;
  code: string;
  name: string;
}

/** OBRS-1073 — whose cash box a `driver_cash_days` row is. */
export type DriverCashHolderRole = 'DRIVER' | 'SALESPERSON';

// ── OBRS-1147: per-head EARNINGS (the person's pay, not the owner's revenue) ──

/**
 * How the earnings rows are bucketed. There is deliberately no `WEEK` — the
 * owner asked for "ต่อวัน/เดือน/ปี" and nothing else, and the backend rejects any
 * other value with a 400 rather than falling back to DAY.
 */
export type PerHeadEarningsGranularity = 'DAY' | 'MONTH' | 'YEAR';

/** One day / month / year of ค่าหัว. Money is a string decimal, as everywhere. */
export interface PerHeadEarningBucketDto {
  /** `2026-08-08` | `2026-08` | `2026` — stable row identity, already sortable. */
  bucketKey: string;
  /** First business date in the bucket. Format from THIS, never by parsing `bucketKey`. */
  bucketStart: string;
  headCount: number;
  amount: string;
  /**
   * `amount / headCount`, or `null` when no heads were counted.
   *
   * ⚠️ It is the RATE only when every line in the bucket used one rate (the
   * ordinary case — a salesperson works one counter). Across two counters, or
   * across a rate change mid-month, it is a weighted AVERAGE, which is why the
   * UI labels it "เฉลี่ย" rather than "เรต". The per-line rates stay on the day
   * detail (`GET /driver-cash/days/{dayId}`).
   */
  effectiveRate: string | null;
}

/** OBRS-1147 AC-2 — one person's total across the whole range (owner view only). */
export interface PerHeadEarningHolderDto {
  holderId: number;
  /** `null` when the user has no profile name; the UI falls back to the id. */
  holderName: string | null;
  /**
   * AC-4 — read off `driver_cash_days.holder_role`, not the person's current
   * roles. One person who sold on one day and drove on another is TWO rows here,
   * because the role is stamped per day and collapsing them would print one and
   * be wrong about the other.
   */
  holderRole: DriverCashHolderRole;
  headCount: number;
  amount: string;
  effectiveRate: string | null;
}

/**
 * `GET /api/private/driver-cash/my-earnings?from=&to=&granularity=` (the caller's
 * own) and `GET /api/private/driver-cash/earnings?...&holderId=` (owner, every
 * person).
 *
 * ⛔ There is no "paid / unpaid" split and that is a DECISION, not a gap: since
 * OBRS-1145 the fee is netted at the round — the seller keeps it out of the cash
 * they hand over — so a recorded `PER_HEAD` line is money already in their hand
 * and a receivable column would always read zero. Do not add one.
 *
 * ⛔ Never compare these numbers with `/admin/reports/eod-salesperson`: that is
 * the OWNER's revenue attributed to whoever sold it. Same person on the screen,
 * opposite direction of money.
 */
export interface PerHeadEarningsRespDto {
  granularity: PerHeadEarningsGranularity;
  from: string;
  to: string;
  totalHeadCount: number;
  totalAmount: string;
  /** Most recent bucket first. */
  buckets: PerHeadEarningBucketDto[];
  /** `null` on `/my-earnings` — a one-row breakdown of yourself is noise. */
  holders: PerHeadEarningHolderDto[] | null;
}

export const DRIVER_CASH_RATE_DUPLICATE_ERROR_CODE = 'PER_HEAD_RATE_DUPLICATE';

/** OBRS-1356 — the wage table's own duplicate, on (owner, effectiveFrom). */
export const DRIVER_WAGE_RATE_DUPLICATE_ERROR_CODE = 'WAGE_RATE_DUPLICATE';
