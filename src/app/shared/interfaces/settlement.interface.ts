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

/** `SettlementLiveRespDto` — always present, zeroed (never omitted) at zero tickets. */
export interface SettlementLiveDto {
  totalAmount: string;
  ticketCount: number;
  passengerCount: number;
  byMethod: SettlementMethodBreakdownDto[];
  byChannel: SettlementChannelBreakdownDto[];
  onSiteTotal: string;
  agencyTotal: string;
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

/** `SettlementSettledRespDto` — `null` while the round is still PENDING. */
export interface SettlementSettledDto {
  totalAmount: string;
  byMethod: SettlementSettledMethodDto[];
  byChannel: SettlementSettledChannelDto[];
  settledBy: number;
  settledByName: string;
  settledAt: string;
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
