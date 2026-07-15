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

export interface ParcelConsignedRespDto {
  parcelId: number;
  trackingNumber: string;
  bookingId: number;
  bookingNumber: string;
  amount: number;
  deliveryStatus: string;
  collectionCode: string;
  recipientName?: string;
  waybillUrl: string;
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
 * ASSUMED — not yet in `../OBRS-backend/docs/api/parcels-consigned-delivery.md`
 * at time of writing. Backs the driver/salesperson delivery-handoff list for
 * one schedule (`GET /api/private/schedules/{scheduleId}/parcels/consigned`).
 * See `docs/handoff.md` Contract Requests (OBRS-305) for the flagged gap.
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
}

/**
 * All 7 `parcel_delivery_status` slugs that are ever actually rendered as a
 * chip. Migration V15 seeds 8 lookup rows total (`created` is also seeded)
 * but `created` is never surfaced client-side — consigned intake sets the row
 * directly to `accepted` (`ParcelConsignedRespDto.deliveryStatus`), so no chip
 * ever needs to render the `created` slug.
 */
export type ParcelDeliveryStatus =
  | 'accepted'
  | 'in_transit'
  | 'arrived_notified'
  | 'collected'
  | 'left_at_stop'
  | 'unclaimed_returned'
  | 'rejected';
