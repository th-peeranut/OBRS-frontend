/**
 * OBRS-305 Card 2 MVP — Parcel Consigned Intake + Delivery Handoff + Public
 * Tracking. Shared across `StaffApiService` (staff-facing endpoints) and
 * `ParcelTrackingService` (the public tracking endpoint), so this lives in
 * `shared/interfaces/` per `CLAUDE.md` §8 ("Interface shared across modules").
 *
 * DTO field names/shapes match
 * `../OBRS-backend/docs/api/parcels-consigned-delivery.md` exactly for every
 * DOCUMENTED endpoint. One assumed, not-yet-documented endpoint
 * (`ParcelDeliveryListItemDto` / `StaffApiService.getConsignedParcelsForSchedule`)
 * is flagged inline — see `docs/handoff.md` Contract Requests (OBRS-305).
 */

export interface ParcelPersonReqDto {
  name: string;
  phone: string;
}

export interface ParcelDimensionsReqDto {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/**
 * `POST /api/private/parcels/walk-in` body, consigned branch
 * (`parcelType: 'consigned'`). Reuses the existing Card-1 walk-in
 * endpoint/DTO — `recipient` is the field this card adds (additive/nullable on
 * the wire per the backend doc; required in-service only for consigned).
 * `seatCount` MUST be `null` (backend 400s otherwise) — modeled as a literal
 * so a caller can't accidentally omit it.
 */
export interface ParcelConsignedReqDto {
  parcelType: 'consigned';
  scheduleId: number;
  pickupStopId: number;
  dropoffStopId: number;
  weightKg: number;
  description: string;
  prohibitedAcknowledged: boolean;
  sender: ParcelPersonReqDto;
  recipient: ParcelPersonReqDto;
  paymentMethod: 'cash';
  seatCount: null;
  dimensions?: ParcelDimensionsReqDto;
}

/**
 * Reused UNCHANGED by the OBRS-415 online path (ADR-0080 Decision 3) — same
 * record, two fields deliberately `null` there: `collectionCode` (minted at
 * `accepted`, Card 3b/OBRS-416) and `waybillUrl` (no waybill exists before
 * `accepted`). Walk-in consigned intake still returns both populated.
 */
export interface ParcelConsignedRespDto {
  parcelId: number;
  trackingNumber: string;
  bookingId: number;
  bookingNumber: string;
  amount: number;
  deliveryStatus: string;
  collectionCode: string | null;
  recipientName?: string;
  waybillUrl: string | null;
}

export interface ParcelQuoteReqParams {
  parcelType: 'consigned';
  scheduleId: number;
  pickupStopId: number;
  dropoffStopId: number;
  weightKg: number;
}

export interface ParcelQuoteRespDto {
  amount: number;
  farePerUnit: number;
  unitCount: number;
  weightTierMultiplier: number;
}

export interface CargoAvailabilityRespDto {
  cargoCapacityKg: number;
  bookedKg: number;
  remainingKg: number;
}

export interface ParcelLoadRespDto {
  deliveryStatus: string;
}

export interface ParcelArrivedRespDto {
  deliveryStatus: string;
  arrivedNotifiedAt: string;
}

export interface ParcelCollectReqDto {
  collectionCode?: string;
  collectionToken?: string;
}

export interface ParcelCollectRespDto {
  deliveryStatus: string;
  collectedAt: string;
  collectedBy: number;
}

/**
 * The API doc names `pickupStop`/`dropoffStop` on the tracking + waybill
 * responses without spelling out their shape beyond the field name. Modeled
 * resilient to either shape already used elsewhere in this codebase for a
 * stop reference (`SegmentStopRefDto{slug,name}` from the segments endpoint,
 * `RouteStopTimeDto.stop{code}` from route-stops, or a plain lookup
 * `{code,name}`) — see `parcelStopLabel()` (`shared/lib/parcel-stop-label.ts`)
 * for the display resolution. Flagged in `docs/handoff.md`.
 */
export interface ParcelStopRefDto {
  code?: string;
  slug?: string;
  name?: string;
  label?: string;
}

export interface WaybillRespDto {
  trackingNumber: string;
  sender: ParcelPersonReqDto;
  recipient: ParcelPersonReqDto;
  pickupStop: ParcelStopRefDto | string;
  dropoffStop: ParcelStopRefDto | string;
  weightKg: number;
  amount: number;
  /** Display string, Asia/Bangkok, pre-formatted server-side (`DateTimeUtil.formatDepartureBkk`). */
  departureAt: string;
  /** Encoded client-side as a QR on the waybill page ONLY — never on the public tracking response. */
  collectionToken: string;
}

export interface ParcelTrackRespDto {
  trackingNumber: string;
  deliveryStatus: string;
  pickupStop: ParcelStopRefDto | string;
  dropoffStop: ParcelStopRefDto | string;
  arrivedNotifiedAt?: string;
  collectedAt?: string;
  recipientNameMasked: string;
}

/**
 * Backs the driver/salesperson delivery-handoff list for one schedule
 * (`GET /api/private/schedules/{scheduleId}/parcels/consigned`). No longer
 * ASSUMED — OBRS-359 documented this response in
 * `../OBRS-backend/docs/api/parcels-consigned-delivery.md`, closing the
 * contract gap `docs/handoff.md` flagged under OBRS-305.
 */
export interface ParcelDeliveryListItemDto {
  parcelId: number;
  trackingNumber: string;
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  pickupStop: ParcelStopRefDto | string;
  dropoffStop: ParcelStopRefDto | string;
  weightKg: number;
  deliveryStatus: string;
  /**
   * OBRS-359/396: the booking's `EBookingStatus` slug — `deliveryStatus`
   * tracks where the box is, this tracks whether anyone paid for it. Anything
   * other than `confirmed` means the backend 409s every delivery transition
   * on this parcel (`PARCEL_BOOKING_NOT_CONFIRMED`).
   *
   * Optional on purpose: a backend older than OBRS-359 omits the field, and
   * the row must stay usable then — see `parcelPaymentFlag` for why absent is
   * "no opinion" rather than "blocked".
   */
  bookingStatus?: string | null;
}

/**
 * All 8 `parcel_delivery_status` slugs that are ever actually rendered as a
 * chip. `created` (OBRS-415) is the online-intake starting state — a
 * consigned parcel booked and paid for online via `POST /parcels/online`
 * stays `created` until staff physically verify it at the counter (Card
 * 3b/OBRS-416 mints `accepted`). It IS surfaced client-side: the parcel
 * booking success screen, `/my-parcels`, and (via `/track-parcel`) the
 * public tracking page all render it. Walk-in consigned intake still sets
 * the row directly to `accepted` (verified at the counter), so `created`
 * only ever appears on an online-originated parcel.
 */
export type ParcelDeliveryStatus =
  | 'created'
  | 'accepted'
  | 'in_transit'
  | 'arrived_notified'
  | 'collected'
  | 'left_at_stop'
  | 'unclaimed_returned'
  | 'rejected';

/**
 * `POST /api/private/parcels/online` body — OBRS-415, the customer online
 * consigned-parcel booking endpoint. A DELIBERATELY NEW dto (ADR-0080
 * Decision 1), not a reuse of `ParcelConsignedReqDto`/`ParcelWalkInReqDto`:
 * there is no `sender` block (name is derived server-side from the
 * authenticated account — the client cannot supply it, see `senderPhone`
 * below), no `paymentMethod` (payment is the separate `POST
 * /private/payments` call), no `parcelType` (this endpoint is consigned-only
 * by construction) and no `seatCount`/`seatNumbers` (consigned never touches
 * seats). The nested `ParcelDimensionsReqDto`/`ParcelPersonReqDto` (for
 * `recipient`) ARE reused verbatim.
 */
export interface ParcelOnlineReqDto {
  scheduleId: number;
  pickupStopId: number;
  dropoffStopId: number;
  weightKg: number;
  dimensions?: ParcelDimensionsReqDto;
  description: string;
  prohibitedAcknowledged: boolean;
  /**
   * Required, `\d{10,15}` (byte-identical to `ParcelSenderReqDto.phone` —
   * ADR-0082 Option A, no new regex). FE prefills from the account's
   * `User.phoneNumber` when present; the field stays editable and is NOT
   * blocked when absent (a Google-login customer has no phone on file).
   * Unlike the sender NAME (derived server-side, not on this DTO at all),
   * the phone is a genuine request field — the person physically dropping
   * the parcel off may not be the account holder.
   */
  senderPhone: string;
  recipient: ParcelPersonReqDto;
}

/** Query params for `GET /api/private/parcels/quote` on the online path.
 * `parcelType: 'consigned'` is added by the service call site — this
 * endpoint is consigned-only from the customer flow, so it's not a caller
 * concern. */
export interface ParcelOnlineQuoteParams {
  scheduleId: number;
  pickupStopId: number;
  dropoffStopId: number;
  weightKg: number;
}

/**
 * One row of `GET /api/private/parcels/me` (OBRS-415 §12.7) — the
 * customer's own paginated parcel list, the durable recovery path for a
 * tracking number lost after closing the success-screen tab (no SMS/email
 * notification exists yet, OBRS-346). Scoped server-side to the
 * authenticated customer's `actor_id` — never accepts a `userId` param
 * (would be IDOR).
 */
export interface ParcelMeDto {
  parcelId: number;
  bookingId: number;
  trackingNumber: string;
  deliveryStatus: string;
  /** The booking's `EBookingStatus` slug (`pending`/`confirmed`/...) —
   * distinct from `deliveryStatus`, same split as `ParcelDeliveryListItemDto`. */
  bookingStatus: string;
  pickupStop: ParcelStopRefDto | string;
  dropoffStop: ParcelStopRefDto | string;
  departureDateTime: string;
  weightKg: number;
  recipientName: string;
  amount: number;
  /** Only meaningful while `bookingStatus === 'pending'` — the reservation
   * hold's expiry, after which `BookingExpirationScheduler` sweeps it. */
  expiresAt?: string | null;
  arrivedNotifiedAt?: string | null;
  collectedAt?: string | null;
}
