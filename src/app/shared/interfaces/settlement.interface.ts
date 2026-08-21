/**
 * OBRS-196 — per-round revenue settlement + owner cash-handover sign-off.
 *
 * Shapes reconciled directly against the landed backend (commit 037cdb1,
 * `docs/api/settlements.md` in `OBRS-backend`) — `SettlementSummaryRespDto`,
 * `SettlementLiveRespDto`, `SettlementSettledRespDto`,
 * `SettlementPendingItemRespDto`, `SettlementPendingListRespDto`,
 * `SettlementDiscrepancyRespDto`.
 *
 * Money fields are DECIMAL STRINGS (e.g. "18425.00"), matching the convention
 * already established by `ReportsMoneyDto` (OBRS-40) — never do arithmetic on
 * them client-side, only format for display (`Number(value)` →
 * `Intl.NumberFormat`).
 *
 * `method`/`channel` are the backend's stable slugs (`EPaymentMethod` — 8
 * values: cash/card/bank_transfer/qr_promptpay/truemoney/shopeepay/
 * rabbit_linepay/other; `EBookingChannel` — 4 values: online/walk_in/agent/
 * kiosk). The UI maps each 1:1 to an `ADMIN.SETTLEMENTS.METHOD.*` /
 * `ADMIN.SETTLEMENTS.CHANNEL.*` i18n key — never render the raw slug.
 */

export type SettlementScheduleStatus = 'PENDING' | 'SETTLED';

/** `GET /settlements/pending` — `SettlementPendingItemRespDto`. */
export interface SettlementPendingItemDto {
  scheduleId: number;
  originStopId: number;
  originStopSlug: string;
  departureDateTime: string;
  routeSlug: string;
  liveTotalAmount: string;
  ticketCount: number;
}

/** Reuses the `from`/`to`/`timezone` shape already used by reports (OBRS-40). */
export interface SettlementPendingRangeDto {
  from: string;
  to: string;
  timezone: string;
}

/** `GET /settlements/pending` response — `SettlementPendingListRespDto`. */
export interface SettlementPendingPageDto {
  range: SettlementPendingRangeDto;
  items: SettlementPendingItemDto[];
}

/** Recomputed-live breakdown row (full shape, incl. per-bucket ticketCount). */
export interface SettlementMethodBreakdownDto {
  method: string;
  amount: string;
  ticketCount: number;
}

/** Recomputed-live breakdown row (full shape, incl. per-bucket ticketCount/remote). */
export interface SettlementChannelBreakdownDto {
  channel: string;
  amount: string;
  ticketCount: number;
  /** True for a non-on-site channel (online/agent) vs. on-site (walk_in/kiosk). */
  remote: boolean;
}

/**
 * OBRS-670 — one not-travelled bucket (a cancelled/no-show ticket that still
 * received money). Used for BOTH the `byMethod` and `byStatus` breakdowns of
 * `live.notTravelled`: identical shape, only `key`'s meaning differs (a payment
 * method slug vs. `cancelled`/`no_show`). `retainedAmount = collected - refunded`
 * and CAN be negative when a booking was over-refunded (never clamped — see
 * `docs/api/settlements.md`).
 */
export interface SettlementNotTravelledBucketDto {
  key: string;
  ticketCount: number;
  collectedAmount: string;
  refundedAmount: string;
  retainedAmount: string;
}

/**
 * `live.notTravelled` (OBRS-670) — always present on a live round, zeroed (with
 * empty breakdowns) when the round has no cancelled/no-show tickets. Its
 * `retainedAmount` is ALREADY folded into `live.totalAmount`; the UI must read
 * as "included", never "add this on top".
 */
export interface SettlementLiveNotTravelledDto {
  ticketCount: number;
  collectedAmount: string;
  refundedAmount: string;
  retainedAmount: string;
  byMethod: SettlementNotTravelledBucketDto[];
  byStatus: SettlementNotTravelledBucketDto[];
}

/** `SettlementLiveRespDto` — always present, zeroed (never omitted) at zero tickets. */
export interface SettlementLiveDto {
  totalAmount: string;
  ticketCount: number;
  passengerCount: number;
  byMethod: SettlementMethodBreakdownDto[];
  byChannel: SettlementChannelBreakdownDto[];
  onSiteTotal: string;
  agencyTotal: string;
  notTravelled: SettlementLiveNotTravelledDto;

  /**
   * OBRS-1145 — the cash the drawer should hold for this round, computed by
   * the server and reconciled against by `confirm`.
   *
   * ⛔ Never recompute this on the client. The confirm screen used to derive
   * its own expectation from the `cash` method bucket, which stopped matching
   * the server when OBRS-960 §4 folded consigned-parcel cash and drawer-funded
   * shares into it — the screen showed one number while the server reconciled
   * against another.
   */
  expectedCashAmount: string;

  /** OBRS-1145 — ค่าหัว already netted out of `expectedCashAmount`, positive magnitude. */
  perHeadDeducted: string;

  /**
   * OBRS-1242 — ticket cash already netted out of `expectedCashAmount` because
   * the counter that took it transfers to the owner at CLOSE OF DAY rather than
   * at this round (`sales_points.ticket_cash_remit_cadence = 'DAY'`, or a
   * `ROUND` counter selling a round that departs from somewhere else). Positive
   * magnitude.
   *
   * The owner stands at หนองชาก, so only that counter hands ticket cash over
   * round by round; บ้านบึง and หมอชิต transfer the day's takings to the
   * owner's bank account. Their sales were demanded at the round anyway, which
   * made every honest hand-over look short by exactly that amount.
   */
  deferredTicketCash: string;

  /**
   * OBRS-1245 — cash handed to the driver as an advance out of THIS round's
   * drawer, already netted out of `expectedCashAmount`. Positive magnitude.
   *
   * The driver's own day has demanded this money back since OBRS-960; nothing
   * took it off the person who physically handed it over, so the round asked
   * them for cash they no longer had and the gap was typed into the discrepancy
   * box as a reason. Advances funded from a counter that transfers at close of
   * day are 0.00 here — they are deducted on that funder's own day instead.
   */
  advancePaidOut: string;
}

/**
 * Frozen-snapshot breakdown row — deliberately THINNER than the live shape:
 * the persisted `Settlement.breakdownSnapshot` only stores amounts, never
 * per-bucket ticket counts (`SettlementSettledMethodRespDto`).
 */
export interface SettlementSettledMethodDto {
  method: string;
  amount: string;
}

/**
 * Frozen-snapshot breakdown row — no `ticketCount`, no `remote`
 * (`SettlementSettledChannelRespDto`).
 */
export interface SettlementSettledChannelDto {
  channel: string;
  amount: string;
}

/**
 * Frozen `settled.notTravelled` (OBRS-670) — the four totals only, NO
 * per-method/per-status breakdown (the snapshot stores amounts, not buckets).
 *
 * It is **`null` for any round settled before OBRS-670 shipped** — read that as
 * UNKNOWN, never as zero: those rounds were signed off against a total that had
 * already dropped their cancelled tickets entirely. The UI shows "no data" for
 * `null`, and shows `0.00` only when the field is genuinely present and zero.
 */
export interface SettlementSettledNotTravelledDto {
  ticketCount: number;
  collectedAmount: string;
  refundedAmount: string;
  retainedAmount: string;
}

/** `SettlementSettledRespDto` — `null` while the round is still PENDING. */
export interface SettlementSettledDto {
  totalAmount: string;
  byMethod: SettlementSettledMethodDto[];
  byChannel: SettlementSettledChannelDto[];
  settledBy: number;
  settledByName: string;
  settledAt: string;
  notTravelled: SettlementSettledNotTravelledDto | null;
  /**
   * OBRS-671 — the FROZEN cash reconciliation recorded at sign-off:
   * `countedAmount` = physical cash counted in the drawer;
   * `expectedCashAmount` = the round's expected cash (the `cash` method
   * bucket, OBRS-670-corrected); `discrepancyAmount` = signed `counted −
   * expectedCash` (NEGATIVE = short, un-clamped, same as `retainedAmount`);
   * `discrepancyReason` = present only for a non-zero discrepancy;
   * `handedOverBy`/`handedOverByName` = the person who handed the cash over
   * (distinct from `settledBy`/`settledByName`, the OWNER signing off).
   *
   * ALL SIX are **`null` for any round settled before OBRS-671 shipped** —
   * read that as UNKNOWN (show "no data"), never as `0.00`. This is a CASH
   * figure, distinct from `SettlementDiscrepancyDto` below (a whole-round
   * drift between the frozen total and the current live total).
   */
  countedAmount: string | null;
  expectedCashAmount: string | null;
  discrepancyAmount: string | null;
  discrepancyReason: string | null;
  handedOverBy: number | null;
  handedOverByName: string | null;
}

/**
 * OBRS-671 — request body for `POST /settlements/schedules/{id}/confirm`.
 * The body is now REQUIRED (a breaking change from the old optional
 * `acknowledgedTotalAmount` stale-screen guard, which is retired):
 * `countedCashAmount` (the physical cash counted, a decimal string) and
 * `handedOverBy` (the user id of whoever closed the shift) are both
 * mandatory; `discrepancyReason` is required by the server ONLY when the
 * counted cash does not reconcile against the round's expected cash, so it
 * is omitted otherwise.
 */
export interface SettlementConfirmPayload {
  countedCashAmount: string;
  handedOverBy: number;
  discrepancyReason?: string;
}

/**
 * OBRS-671 — one selectable "handed over by" candidate for the sign-off
 * modal's picker (a salesperson at the sales point). Derived from
 * `AdminUserDto` (id + resolved full name) by the smart page, so the dumb
 * modal never has to know the user-management DTO shape.
 */
export interface SettlementHandoverCandidate {
  id: number;
  name: string;
}

/**
 * `SettlementDiscrepancyRespDto` — compares the frozen `settledTotal` against
 * the CURRENT `liveTotal`; `null` unless `settled` is non-null.
 * `deltaAmount = liveTotal - settledTotal`.
 */
export interface SettlementDiscrepancyDto {
  hasDiscrepancy: boolean;
  settledTotal: string;
  liveTotal: string;
  deltaAmount: string;
}

/**
 * `GET /settlements/schedules/{id}` and `POST .../confirm` response —
 * `SettlementSummaryRespDto`. Note: no route label field — only the
 * canonical origin stop is carried here; the route display text comes from
 * the pending-list row (`SettlementPendingItemDto.routeSlug`) seeded into the
 * modal on open, not from this detail shape.
 */
export interface SettlementScheduleDetailDto {
  scheduleId: number;
  originStopId: number;
  originStopSlug: string;
  departureDateTime: string;
  status: SettlementScheduleStatus;
  currency: string;
  live: SettlementLiveDto;
  settled: SettlementSettledDto | null;
  discrepancy: SettlementDiscrepancyDto | null;
}
