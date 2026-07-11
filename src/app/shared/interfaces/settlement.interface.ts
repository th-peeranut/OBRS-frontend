/**
 * OBRS-196 — per-round revenue settlement + owner cash-handover sign-off.
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

export interface SettlementPendingItemDto {
  scheduleId: number;
  routeLabel: string;
  departureDateTime: string;
  status: SettlementScheduleStatus;
  totalAmount: string;
  currency: string;
  ticketCount: number;
}

export interface SettlementPendingPageDto {
  items: SettlementPendingItemDto[];
  totalElements: number;
}

export interface SettlementMethodBreakdownDto {
  method: string;
  amount: string;
  ticketCount: number;
}

export interface SettlementChannelBreakdownDto {
  channel: string;
  amount: string;
  ticketCount: number;
  /** True for a non-on-site channel (online/agent) vs. on-site (walk_in/kiosk). */
  remote: boolean;
}

export interface SettlementLiveDto {
  totalAmount: string;
  onSiteTotal: string;
  agencyTotal: string;
  passengerCount: number;
  ticketCount: number;
  byMethod: SettlementMethodBreakdownDto[];
  byChannel: SettlementChannelBreakdownDto[];
}

export interface SettlementSettledDto {
  settledByName: string;
  settledAt: string;
  acknowledgedTotalAmount: string;
}

export interface SettlementDiscrepancyDto {
  hasDiscrepancy: boolean;
  differenceAmount: string;
}

export interface SettlementScheduleDetailDto {
  scheduleId: number;
  routeLabel: string;
  departureDateTime: string;
  status: SettlementScheduleStatus;
  currency: 'THB';
  live: SettlementLiveDto;
  settled: SettlementSettledDto | null;
  discrepancy: SettlementDiscrepancyDto | null;
}
