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
  /**
   * OBRS-960: a property of the RESULT, not the input — whether the pickup
   * stop this parcel was intaken at is mapped to a sales point. `false`
   * means the owner's revenue share for this parcel posts as the DRIVER's
   * cash instead (no sales point to attribute it to), so the result panel
   * must warn at intake, not in an end-of-day summary. Optional so a
   * pre-OBRS-960 backend response (field absent) renders no warning rather
   * than a false positive — see the parcel-intake-result-panel spec.
   */
  salesPointMapped?: boolean;
}

export interface ParcelQuoteReqParams {
  // OBRS-341: widened from the consigned-only literal — the SAME `GET
  // /parcels/quote` endpoint is reused for the carry-on-on-seat live price
  // preview (`farePerUnit` is identical regardless of parcelType; see
  // `ParcelCarryOnReqDto` below and the OBRS-341 brief). The endpoint itself
  // ignores `parcelType` server-side, but the caller still names one.
  parcelType: 'consigned' | 'carry_on_seat';
  scheduleId: number;
  pickupStopId: number;
  dropoffStopId: number;
  weightKg: number;
}

/**
 * `POST /api/private/parcels/walk-in` body, carry-on-on-seat branch
 * (`parcelType: 'carry_on_seat'`) — OBRS-341. Same endpoint as
 * `ParcelConsignedReqDto` above (`parcelType` discriminates server-side); see
 * `../OBRS-backend/docs/api/parcels.md` §POST /parcels/walk-in.
 *
 * Three differences from the consigned branch:
 * 1. `dimensions` is REQUIRED here (the service null-checks it to classify
 *    free-aisle vs on-seat) — optional for consigned.
 * 2. There is NO `recipient` field at all — it must be ABSENT on the wire,
 *    not merely empty (a carry-on item has no delivery leg).
 * 3. `seatCount`/`seatNumbers` only mean anything for the on-seat outcome.
 *    `seatCount` MUST BE ABSENT once the item classifies free-aisle
 *    (`PARCEL_SEAT_COUNT_NOT_ALLOWED` otherwise) and REQUIRED (>=1) once it
 *    classifies on-seat (`PARCEL_SEAT_COUNT_REQUIRED` otherwise) — modeled
 *    optional so a caller omits the key entirely rather than sending `null`.
 *    `seatNumbers` is always optional; omitted, the server auto-assigns.
 */
export interface ParcelCarryOnReqDto {
  parcelType: 'carry_on_seat';
  scheduleId: number;
  pickupStopId: number;
  dropoffStopId: number;
  weightKg: number;
  dimensions: ParcelDimensionsReqDto;
  seatCount?: number;
  seatNumbers?: string[];
  description: string;
  prohibitedAcknowledged: boolean;
  sender: ParcelPersonReqDto;
  paymentMethod: 'cash';
}

/**
 * `POST /api/private/parcels/walk-in` response, carry-on-on-seat branch —
 * a DIFFERENT shape from `ParcelConsignedRespDto`: no `collectionCode`, no
 * `waybillUrl`, no `deliveryStatus`, no `recipientName` (none of those exist
 * for this branch — there is no delivery lifecycle). `freeAisle` is the
 * discriminant the UI branches display on; `seatCount`/`seatNumbers` are
 * `null` when `freeAisle` is `true`. `parcelType` here (unlike the consigned
 * response, which omits the field) doubles as the result-panel's type guard
 * discriminant (`isCarryOnResult()`, `parcel-intake-result-panel.component.ts`).
 */
export interface ParcelCarryOnRespDto {
  parcelId: number;
  trackingNumber: string;
  bookingId: number;
  bookingNumber: string;
  parcelType: 'carry_on_seat';
  freeAisle: boolean;
  seatCount: number | null;
  seatNumbers: string[] | null;
  amount: number;
  bookingNetAmount: number;
  /** OBRS-960 — same meaning/optionality as `ParcelConsignedRespDto.salesPointMapped`. */
  salesPointMapped?: boolean;
}

/**
 * OBRS-960 — `GET /api/private/parcels/share-config`, read by the staff
 * parcel-consign page to show the "share not configured" warning BEFORE
 * intake. Deliberately a flatter shape than the owner-settings
 * `ParcelShareOwnerConfigDto` (`admin-api.service.ts`) — this endpoint
 * exposes only what the warning needs (one `configured` flag), not the
 * per-field `driverPctConfigured`/`salespersonPctConfigured` split the
 * owner's edit form needs.
 */
export interface ParcelShareConfigDto {
  driverPct: number;
  salespersonPct: number;
  configured: boolean;
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
 * `POST /api/private/parcels/{id}/leave-at-stop` 200 body — OBRS-1345, the
 * other terminal exit from `arrived_notified`.
 *
 * `leftAtStopAt` is the DATABASE's stamp, echoed back deliberately: it starts
 * the customer's 1-day claim window (OBRS-629 Q8) and the device that just
 * took the photo has the least trustworthy clock in the system, so the driver
 * must be shown the time the server recorded, never a locally computed one.
 */
export interface ParcelLeaveAtStopRespDto {
  deliveryStatus: string;
  leftAtStopAt: string;
  leftAtStopBy: number;
  photoUrl: string;
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
  /**
   * OBRS-1353: the drop-off proof, public on purpose — a cash walk-in sender has
   * no account, so the tracking number on their waybill is the only key that
   * reaches them. Both absent until the parcel is actually left at a stop.
   */
  leftAtStopPhotoUrl?: string;
  leftAtStopAt?: string;
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
  /**
   * OBRS-548: nullable, and it always was — `parcel.recipient_name` carries no
   * NOT NULL (`schema.sql`, `V14__add_parcel_carryon_seatcharge.sql`). Declaring
   * it a plain `string` is what let the verify screen interpolate it into a
   * confirm dialog unguarded and print a literal `{{recipient}}` on a real row.
   * Every read of this field must handle absent.
   */
  recipientName: string | null;
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
  /**
   * OBRS-416: DECLARED length/width/height (mirrors `weightKg` above, already
   * declared at online intake) — purely additive to this same response row,
   * confirmed against the backend's `ParcelDeliveryListItemRespDto` (flat
   * fields, NOT a nested `dimensions` object — the parcel-verify UX spec's
   * draft guessed a nested shape before the backend landed; this matches the
   * real wire shape instead). The verify screen's whole job is comparing
   * declared vs measured, so these need to be on the LIST row, not only
   * inside the `POST /verify` response after the fact. `null`/absent when the
   * sender never entered dimensions at online intake, or on a backend that
   * predates OBRS-416.
   */
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  /**
   * OBRS-416: the PAID amount for this row's booking (read from the paid
   * `payments` row server-side, never `booking.netAmount` — same rule as
   * `ParcelCancellationService`/`ParcelVerificationService`). Needed to state
   * the refund amount in the reject-confirmation step BEFORE the verify call
   * is made, so it cannot come from that call's response. `null`/absent for a
   * row whose booking has no paid payment (the unpaid-but-still-listed case
   * OBRS-396 already established) or on a pre-OBRS-416 backend.
   */
  amount?: number | null;
  /**
   * OBRS-1345: the drop-off proof. Non-null only once the driver has left this
   * parcel at its stop — the terminal outcome the owner's OBRS-629 Q5 policy
   * describes (nobody waiting, so the parcel is left and photographed).
   * `leftAtStopAt` is the SERVER's stamp, not the phone's, because it starts
   * the customer's 1-day claim window (OBRS-629 Q8). Optional/absent on a
   * backend older than this card.
   */
  leftAtStopAt?: string | null;
  leftAtStopPhotoUrl?: string | null;
}

/**
 * `POST /api/private/parcels/{id}/verify` body — OBRS-416 (Epic OBRS-302,
 * Card 3b), the driver/salesperson physical check of a `created` (online,
 * unverified) consigned parcel intake against the actual package. Field
 * names/shape confirmed against the backend's `ParcelVerifyReqDto`
 * (`OBRS-backend` branch `ao/obrs-416-parcel-verify`, not yet merged to
 * `dev`). The backend itself treats `actual*` as optional (a rejected parcel
 * may never be measured at all) — this app's UX deliberately requires all
 * four for BOTH outcomes (stricter than the backend minimum): the whole
 * point of this screen is physically weighing/measuring, so the form never
 * lets a submission skip it either way.
 */
export interface ParcelVerifyReqDto {
  outcome: 'accept' | 'reject';
  actualWeightKg: number;
  actualLengthCm: number;
  actualWidthCm: number;
  actualHeightCm: number;
  /** Required + non-blank server-side only when `outcome === 'reject'`
   * (`PARCEL_VERIFY_REJECT_REASON_REQUIRED` 400 otherwise); the FE form
   * itself already enforces this before submit. */
  rejectReason?: string;
}

/**
 * `POST .../verify` response — field names confirmed against the backend's
 * `ParcelVerifyRespDto` record (`refundAmount`, not `refundedAmount` — the
 * UX spec's draft flagged that name as a best guess pending confirmation;
 * this is the real wire name). `refundAmount`/`refundStatus` are `null` on
 * an accept (no money moves); populated on a reject. `refundStatus` is one
 * of the `EPaymentStatus` slugs the refund actually landed in —
 * `'refunded'`/`'partially_refunded'` (gateway refund succeeded) or
 * `'manual_refund_required'` (e.g. a cash payment with no transaction id —
 * the money has NOT been returned automatically and a human must hand it
 * back). The UI must never collapse this distinction into one "refunded
 * successfully" message.
 */
export interface ParcelVerifyRespDto {
  parcelId: number;
  deliveryStatus: string;
  refundAmount: number | null;
  refundStatus: string | null;
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
   * ADR-0082, Accepted by OBRS-455: this rule stays WIDE because nothing
   * texts the sender, and both sites now reference one constant. The
   * recipient's phone on the same request is narrower for the opposite
   * reason — the arrival SMS goes there). FE prefills from the account's
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
 *
 * Field-for-field match to the backend's `ParcelMineRespDto` record
 * (verified against the backend worktree 2026-07-16, post their own
 * scrutinize fix) — do not add a field this record doesn't have
 * (`arrivedNotifiedAt`/`collectedAt` do NOT exist on this response; they
 * were a copy-paste from `ParcelTrackRespDto` and have been removed here) or
 * omit one it does (`bookingNumber`/`collectionCode` were missing and are
 * now added). `collectionCode` is always `null` on this path today (minted
 * only at `accepted`, Card 3b/OBRS-416) but the field exists on the wire.
 */
export interface ParcelMeDto {
  parcelId: number;
  trackingNumber: string;
  bookingId: number;
  bookingNumber: string;
  amount: number;
  deliveryStatus: string;
  /** The booking's `EBookingStatus` slug (`pending`/`confirmed`/...) —
   * distinct from `deliveryStatus`, same split as `ParcelDeliveryListItemDto`.
   * Load-bearing, not decorative: `deliveryStatus` is `created` for BOTH a
   * paid and an unpaid online parcel (a pending parcel holds cargo quota
   * exactly like a seat, SPEC-OBRS-415 §0.1), so this is the ONLY field
   * that tells "unpaid, finish paying" apart from "paid, bring it to the
   * origin stop". */
  bookingStatus: string;
  collectionCode: string | null;
  recipientName: string;
  pickupStop: ParcelStopRefDto | string;
  dropoffStop: ParcelStopRefDto | string;
  departureDateTime: string;
  weightKg: number;
  /** Only meaningful while `bookingStatus === 'pending'` — the reservation
   * hold's expiry, after which `BookingExpirationScheduler` sweeps it. */
  expiresAt?: string | null;
  /**
   * OBRS-1345 (AC-3): the photo the driver took when leaving this parcel at
   * its drop-off stop, and the server-stamped moment they did.
   *
   * This page is the ONLY channel a member sender has for that photo today. A
   * walk-in (non-member) sender never sees this screen at all — their channel
   * is LINE OA and it is still blocked on OBRS-1174, which is why the terms
   * have to say plainly that no LINE means no photo (OBRS-629 Q5).
   */
  leftAtStopAt?: string | null;
  leftAtStopPhotoUrl?: string | null;
}
