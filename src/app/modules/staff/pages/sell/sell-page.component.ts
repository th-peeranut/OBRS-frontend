import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, firstValueFrom, forkJoin, of, take } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import dayjs from 'dayjs';
import { AuthService } from '../../../../auth/auth.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { combineBangkokDateTime } from '../../../../shared/lib/api-date-time';
import { normalizeSeatNumber } from '../../../../shared/lib/seat-number';
import {
  ScheduleDeleteModalMode,
  resolveScheduleDeleteModalMode,
} from '../../../../shared/lib/schedule-delete-mode';
import {
  PopularStopDto,
  RouteStopsDto,
  SegmentStopRefDto,
  StaffApiService,
  WalkInRouteGroupDto,
  WalkInTripDto,
  isOpenSeatingTrip,
} from '../../../../services/staff/staff-api.service';
import { BUSINESS_POLICY_VERSION } from '../../../business-policy/business-policy.version';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';
import {
  AdminApiService,
  AdminScheduleDto,
  CreateSchedulePayload,
  getAdminLookupLabel,
  getAdminTranslationLabel,
} from '../../../../services/admin/admin-api.service';
import { generateIdempotencyKey } from '../../../../shared/lib/idempotency-key';
import { WalkInCheckoutPayload } from '../../components/walk-in-checkout/walk-in-checkout.component';
import { WalkInTripSelection } from '../../components/walk-in-trip-browser/walk-in-trip-browser.component';
import { TripDetailsUpdatedEvent } from '../../components/walk-in-center-panel/walk-in-center-panel.component';
import { StaffSchedulesStore, StaffSchedulesData } from '../staff-schedules/staff-schedules.store';

/** Stop option enriched with a computed departure time string. */
export interface StopOption extends SegmentStopRefDto {
  /** Computed time string, e.g. "07:00". May be '' when duration data is missing. */
  time: string;
}

/**
 * OBRS-358: the walk-in booking-create request body, built ONCE per sale
 * attempt in `onSell()` and reused byte-identical across the first attempt
 * and the single allowed reactive-ack retry in `submitWalkInBooking()` —
 * only `jumpSeatAcknowledged` (spread on at send time) and the
 * Idempotency-Key (regenerated per attempt) differ between the two.
 */
interface WalkInBookingPayloadDraft {
  bookingType: 'one_way';
  totalAmount: number;
  bookingChannel: 'walk_in';
  jumpSeatAcknowledged?: boolean;
  // OBRS-658 (ADR-0125): the counter sale records the same published terms version the online
  // sale does. The version identifies which wording was IN FORCE, and under (ค) that is one
  // answer for everyone at a given moment — so a walk-in ticket sold this minute was sold under
  // exactly the terms /business-policy is stating this minute, whether or not the customer at
  // the counter read the page. Leaving it off here would make NULL mean two different things.
  bookingPolicyVersion?: string | null;
  departureSchedule: {
    scheduleId: number;
    fromStop: string;
    toStop: string;
    departureDateTime: string;
    arrivalDateTime: string;
    passengers: {
      passengerType: string;
      seatNumber: string;
      // OBRS-1231: nullable on both halves — see WalkInCheckoutPayload.contact.title.
      title: string | null;
      firstName: string;
      lastName: string;
      phoneNumber: string;
      identityCardNumber?: string;
    }[];
  };
  contact: {
    title: string | null;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    preferredLocale: string;
    identityCardNumber?: string;
    email?: string;
  };
}

@Component({
    selector: 'app-sell-page',
    templateUrl: './sell-page.component.html',
    styleUrl: './sell-page.component.scss',
    standalone: false
})
export class SellPageComponent implements OnInit, OnDestroy {
  protected today: Date = new Date();
  protected selectedDate: Date = new Date();
  protected isLoadingTrips = false;
  protected routeGroups: WalkInRouteGroupDto[] = [];
  protected selectedTrip: WalkInTripDto | null = null;
  /** Mirrors `WalkInCenterPanelComponent`'s active `p-tabView` tab (0 = Ticket
   * Sales, 1 = Trip Details, 2 = Boarding) — drives the checkout column's
   * visibility and the center column's width (product-owner request during
   * OBRS-130 review). Reset to 0 at every point below that resets
   * `selectedTrip` itself, since the center panel's `p-tabView` is
   * `*ngIf="selectedTrip"` and always (re)mounts on tab 0 with no persisted
   * PrimeNG state — this keeps the tracked index in sync without depending on
   * child-component remount timing. */
  protected activeTabIndex = 0;
  protected selectedRouteSlug: string | null = null;
  protected selectedSeats: string[] = [];
  // OBRS-324 (Epic OBRS-318 open seating, 318-d): OPEN-mode headcount —
  // mirrors selectedSeats for a schedule with no seat map. Only meaningful
  // when isOpenSeating is true.
  protected passengerCount = 1;
  /** passenger_type lookup slug chosen by staff via the center-panel tiles. */
  protected selectedPassengerType = 'male';
  /** Per-seat passenger type map — seat label → passenger_type slug. */
  protected seatPassengerTypes: Record<string, string> = {};
  protected isSelling = false;
  protected bookingId: number | null = null;
  protected bookingNumber: string | null = null;

  // --- Segment / stop state lifted from WalkInCheckoutComponent ---
  protected orderedStops: SegmentStopRefDto[] = [];
  protected pickupSlug = '';
  protected dropoffSlug = '';
  protected isLoadingSegments = false;
  protected popularPickupStops: StopOption[] = [];
  protected popularDropoffStops: StopOption[] = [];
  private fareMap = new Map<string, number>();
  // Authoritative per-stop ordering + time offset from the route-stops endpoint
  // (GET /api/private/route-stops/{slug}), keyed by stop slug. Replaces
  // reconstructing route shape/timing from the sellable segment-pair graph.
  private stopOrderMap = new Map<string, number>();
  private stopOffsetMap = new Map<string, number>();

  // OBRS-1258: the caller's default pickup stop for the currently-selected route, resolved
  // SERVER-side per request by GET /route-stops/{slug} (`RouteStopsDto.defaultPickupStopSlug`).
  // Replaces the old client-side salesPointStop mechanism (GET /users/me + on-route check done
  // here). Set from loadSegments' forkJoin `next` handler, read by `_applyDefaultStops`.
  private defaultPickupStopSlug: string | null = null;

  private idempotencyKey: string | null = null;
  private readonly destroy$ = new Subject<void>();

  // --- Schedule management state ---
  protected readonly scheduleItemForm: FormGroup;
  protected isScheduleFormOpen = false;
  protected isScheduleDeleteOpen = false;
  protected isScheduleEditMode = false;
  protected isScheduleSubmitting = false;
  protected isScheduleDeleting = false;
  protected isScheduleDetailLoading = false;
  protected editingScheduleId: number | null = null;
  protected deletingTrip: WalkInTripDto | null = null;

  // Option arrays for schedule form (populated from StaffSchedulesStore)
  protected scheduleRouteOptions: { code: string; label: string }[] = [];
  protected scheduleVehicleTypeOptions: { code: string; label: string }[] = [];
  protected scheduleVehicleOptions: { code: string; label: string }[] = [];
  protected scheduleDriverOptions: { code: string; label: string }[] = [];
  // OBRS-667: whole-trip cancel (mode !== 'delete' below) issues a one-click
  // 100% refund to every confirmed booking on the schedule, so the backend
  // now restricts POST .../cancel to hasRole('OWNER'). Computed once here
  // (not a template getter — see FRONTEND-GOTCHAS "template expression that
  // allocates per cycle") and mirrors the backend guard exactly via
  // hasAnyRole (a permission check), never getRoles().includes(...).
  protected readonly canCancelSchedule: boolean;

  constructor(
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly formBuilder: FormBuilder,
    private readonly adminApiService: AdminApiService,
    readonly scheduleStore: StaffSchedulesStore,
    private readonly router: Router,
    private readonly authService: AuthService
  ) {
    this.scheduleItemForm = this.formBuilder.group({
      departureDate: [null, [Validators.required]],
      departureTime: [null, [Validators.required]],
      route: ['', [Validators.required]],
      vehicleType: ['', [Validators.required]],
      vehicleId: [''],
      driverId: [''],
    });

    this.canCancelSchedule = this.authService.hasAnyRole(['owner']);
  }

  ngOnInit(): void {
    this.loadTrips(this.selectedDate);
    // Stop/route names are server-localized (resolved from the Accept-Language
    // header) and cached in component state on fetch. The `| translate` pipes
    // re-render on a language switch, but this cached server data does not — so
    // re-fetch it, preserving the current selection (slugs are locale-invariant).
    this.translate.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.reloadLocalizedData());

    // Populate schedule form option arrays from StaffSchedulesStore (lazy — no upfront fetch)
    // OBRS-506: honor a null emission (OBRS-467 shape) — clear() (e.g.
    // logout) DISCARDS the cached value; reset the option arrays this
    // callback populates instead of leaving a previous session's data
    // selectable in the create-sale form.
    this.scheduleStore.data$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data) {
          this.applyScheduleLocalization(data);
        } else {
          this.scheduleRouteOptions = [];
          this.scheduleVehicleTypeOptions = [];
          this.scheduleVehicleOptions = [];
          this.scheduleDriverOptions = [];
        }
      });

    // Re-map labels on language change (store data$ won't re-emit on its own)
    // store-null-ok: this is a one-shot RE-MAP of already-cached labels, not
    // a state-copy subscription; the `:209` subscription above already owns
    // clearing scheduleXOptions on a null emission (clear() fires its own
    // dataSubject.next(null), which the :209 subscribe also receives), so
    // there is nothing left to clear here. A `null` value at this take(1)
    // means "no cache to re-map" and is correctly a no-op (OBRS-506).
    this.translate.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.scheduleStore.data$
          .pipe(take(1))
          .subscribe((d) => { if (d) { this.applyScheduleLocalization(d); } });
      });
  }

  /** Re-fetch server-localized data (trips + segments) after a language switch. */
  private reloadLocalizedData(): void {
    this.loadTrips(this.selectedDate);
    if (this.selectedRouteSlug && this.selectedTrip) {
      this.loadSegments(this.selectedRouteSlug, this.selectedTrip, {
        pickup: this.pickupSlug,
        dropoff: this.dropoffSlug,
      });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected onDateChanged(date: Date): void {
    this.selectedDate = date;
    this.selectedTrip = null;
    this.selectedRouteSlug = null;
    this.selectedSeats = [];
    this.passengerCount = 1;
    this.seatPassengerTypes = {};
    this.idempotencyKey = null;
    this.activeTabIndex = 0;
    this._resetSegments();
    this.loadTrips(date);
  }

  protected onTripSelected(selection: WalkInTripSelection): void {
    this.selectedTrip = selection.trip;
    this.selectedRouteSlug = selection.routeSlug;
    this.selectedSeats = [];
    this.passengerCount = 1;
    this.seatPassengerTypes = {};
    this.idempotencyKey = null;
    this.activeTabIndex = 0;
    this.loadSegments(selection.routeSlug, selection.trip);
  }

  // OBRS-324 (Epic OBRS-318 open seating, 318-d): the endpoint returns
  // seatingMode since OBRS-360, so this reflects the real mode. Missing/unknown
  // (a cached row predating it) safely resolves to false/ASSIGNED.
  protected get isOpenSeating(): boolean {
    return isOpenSeatingTrip(this.selectedTrip);
  }

  /** Ticket count driving totals/canSell: OPEN uses passengerCount, ASSIGNED uses selectedSeats. */
  protected get ticketCount(): number {
    return this.isOpenSeating ? this.passengerCount : this.selectedSeats.length;
  }

  // OBRS-358: how many of THIS sale's tickets spill past the trip's
  // `normalCapacity` into the jump seat (walk-in-only, sold last). Purely a
  // staff-facing HINT — non-authoritative, the server re-validates under a
  // row lock at sale time regardless of what this computes. `normalCapacity`
  // absent (backend predating this card, or no jump seat on this
  // trip/vehicle) resolves to 0 overflow / no acknowledgment, same
  // graceful-fallback contract as `isOpenSeatingTrip`.
  protected get overflowUnits(): number {
    const trip = this.selectedTrip;
    if (!trip || trip.normalCapacity == null) return 0;
    const existing = trip.soldPaidCount + trip.reservedUnpaidCount;
    return Math.max(0, existing + this.ticketCount - trip.normalCapacity);
  }

  /** Whether this sale needs the jump-seat staff acknowledgment gate at onSell(). */
  protected get requiresJumpSeatAck(): boolean {
    return this.overflowUnits > 0;
  }

  protected onPassengerCountChanged(count: number): void {
    const max = Math.max(1, this.selectedTrip?.availableCount ?? count);
    this.passengerCount = Math.min(Math.max(1, count), max);
  }

  protected onPassengerTypeChanged(passengerType: string): void {
    // Only update the active type for FUTURE seat clicks — never re-colour
    // already-selected seats.
    this.selectedPassengerType = passengerType;
  }

  protected onSeatToggled(seat: string): void {
    if (!seat) { return; }
    const idx = this.selectedSeats.indexOf(seat);
    if (idx >= 0) {
      // Removing seat: delete its type from the map.
      this.selectedSeats = this.selectedSeats.filter((s) => s !== seat);
      const next = { ...this.seatPassengerTypes };
      delete next[seat];
      this.seatPassengerTypes = next;
    } else {
      // Adding seat: capture currently-active type.
      this.selectedSeats = [...this.selectedSeats, seat];
      this.seatPassengerTypes = { ...this.seatPassengerTypes, [seat]: this.selectedPassengerType };
    }
  }

  protected onPickupChanged(slug: string): void {
    this.pickupSlug = slug;
    this.onPickupChange();
  }

  protected onDropoffChanged(slug: string): void {
    this.dropoffSlug = slug;
  }

  /**
   * Handles an optimistic patch from WalkInCenterPanelComponent after a successful schedule update.
   * Merges the patch into selectedTrip and the matching row in routeGroups.
   */
  protected onTripDetailsUpdated(event: TripDetailsUpdatedEvent): void {
    if (this.selectedTrip && this.selectedTrip.scheduleId === event.scheduleId) {
      this.selectedTrip = { ...this.selectedTrip, ...event.patch };
    }
    this.routeGroups = this.routeGroups.map((group) => ({
      ...group,
      trips: group.trips.map((trip) =>
        trip.scheduleId === event.scheduleId ? { ...trip, ...event.patch } : trip
      ),
    }));
  }

  /**
   * Called by WalkInCenterPanelComponent after a successful save to reload the trips list.
   */
  protected onRefreshTripsRequested(): void {
    this.loadTrips(this.selectedDate);
  }

  /** Stops eligible as a pickup: every stop except the final destination. */
  protected get pickupOptions(): StopOption[] {
    const base = this.orderedStops.slice(0, Math.max(0, this.orderedStops.length - 1));
    return base.map((s) => ({ ...s, time: this.stopTime(s.slug) }));
  }

  /** Stops downstream of the chosen pickup that have a fare. */
  protected get dropoffOptions(): StopOption[] {
    const fromIdx = this.orderedStops.findIndex((s) => s.slug === this.pickupSlug);
    if (fromIdx < 0) return [];
    return this.orderedStops
      .slice(fromIdx + 1)
      .filter((s) => this.fareMap.has(`${this.pickupSlug}|${s.slug}`))
      .map((s) => ({ ...s, time: this.stopTime(s.slug) }));
  }

  /** Per-seat fare for the current pickup→drop-off pair, or null if invalid. */
  protected get segmentFare(): number | null {
    if (!this.pickupSlug || !this.dropoffSlug) return null;
    const fare = this.fareMap.get(`${this.pickupSlug}|${this.dropoffSlug}`);
    return fare === undefined ? null : fare;
  }

  protected get pricePerSeat(): number {
    return this.segmentFare ?? 0;
  }

  protected async onSell(payload: WalkInCheckoutPayload): Promise<void> {
    if (!this.selectedTrip) return;

    // OBRS-358 (PROACTIVE path): this sale spills into the jump seat
    // (walk-in-only, sold last) per the client-side overflowUnits hint —
    // gate on an explicit staff acknowledgment BEFORE building the payload.
    // Reuses AlertService.confirm() (the exact primitive already used by
    // offerPrintTicket() in this same file), not a bespoke modal. Declining
    // leaves selection/checkout untouched and makes no API call. Kept as-is
    // alongside the REACTIVE backstop below — a harmless pre-warning when
    // the hint happens to be right; see submitWalkInBooking()'s doc comment
    // for why the hint alone isn't reliable enough on OPEN trips.
    let jumpSeatAcknowledged = false;
    if (this.requiresJumpSeatAck) {
      const acknowledged = await this.confirmJumpSeatSale();
      if (!acknowledged) return;
      jumpSeatAcknowledged = true;
    }

    const trip = this.selectedTrip;
    this.isSelling = true;

    // OBRS-324 (Epic OBRS-318 open seating, 318-d): OPEN sells by headcount only
    // — the backend forces seatNumber=null for OPEN schedules regardless of what
    // is sent (BookingService.verifyOpenCapacity, OBRS-322), so an empty string
    // is sent as a harmless placeholder. ASSIGNED builds one passenger per
    // selected seat, byte-identical to before this card.
    const seatNumbers = this.isOpenSeating
      ? Array.from({ length: this.passengerCount }, () => '')
      : this.selectedSeats;

    const passengers = seatNumbers.map((seat) => {
      const p: {
        passengerType: string;
        seatNumber: string;
        // OBRS-1231: nullable, and it arrives already normalised to null by
        // WalkInCheckoutComponent.onSell — this page must not turn it back into ''.
        title: string | null;
        firstName: string;
        lastName: string;
        phoneNumber: string;
        identityCardNumber?: string;
      } = {
        // Use the per-seat type captured at click time; fall back to the current
        // global type if somehow the seat isn't in the map (and, for OPEN, always
        // — there is no seat to key a per-seat type off).
        // proto-key-ok: ADR-0028 -- `seat` is a label this page's own seat map rendered
        // from the server's seat list, same family as seatGenders/seatOwners.
        passengerType: this.seatPassengerTypes[seat] ?? this.selectedPassengerType,
        // The seat maps render/select letter-prefixed labels (van "A1".."A13", bus
        // "B1".."B21" — see `selectedSeats` / `busSeatLabels` in
        // WalkInCenterPanelComponent), but the booking endpoint's
        // `availableSeatNumbers`/`tickets.seat_number` are bare digits (OBRS-179:
        // the walk-in van path 400'd with BOOKING_ERROR_SEATS_NOT_FOUND because the
        // raw label was sent as-is). Normalize here, at the payload boundary, the
        // same way the customer booking flow already does
        // (`PassengerInfoComponent.normalizeSeatNumber`) — display state
        // (`selectedSeats`, seat-map highlighting) keeps the label form. A blank
        // OPEN placeholder normalizes to '' unchanged.
        seatNumber: normalizeSeatNumber(seat),
        title: payload.contact.title,
        firstName: payload.contact.firstName,
        lastName: payload.contact.lastName,
        phoneNumber: payload.contact.phoneNumber,
      };
      if (payload.contact.identityCardNumber) {
        p.identityCardNumber = payload.contact.identityCardNumber;
      }
      return p;
    });

    // Segment fare is owned by sell-page; use it directly.
    const fare = this.segmentFare ?? 0;
    const totalAmount = fare * this.ticketCount;

    const basePayload: WalkInBookingPayloadDraft = {
      bookingType: 'one_way',
      totalAmount,
      bookingChannel: 'walk_in',
      // OBRS-658 AC 3: the SAME constant /business-policy renders and the online checkout sends,
      // so one version bump moves every channel's record together.
      bookingPolicyVersion: BUSINESS_POLICY_VERSION,
      departureSchedule: {
        scheduleId: trip.scheduleId,
        fromStop: this.pickupSlug,
        toStop: this.dropoffSlug,
        departureDateTime: trip.departureDateTime,
        arrivalDateTime: trip.arrivalDateTime,
        passengers,
      },
      contact: {
        title: payload.contact.title,
        firstName: payload.contact.firstName,
        lastName: payload.contact.lastName,
        phoneNumber: payload.contact.phoneNumber,
        preferredLocale: 'th',
      },
    };

    if (payload.contact.identityCardNumber) {
      basePayload.contact.identityCardNumber = payload.contact.identityCardNumber;
    }
    if (payload.contact.email) {
      basePayload.contact.email = payload.contact.email;
    }

    // allowAckRetry=true: this is the first attempt for this sale, so a
    // reactive ACK_REQUIRED 400 (see submitWalkInBooking()) is allowed to
    // retry once.
    await this.submitWalkInBooking(basePayload, jumpSeatAcknowledged, true);
  }

  /**
   * OBRS-358: shared confirm dialog for BOTH the proactive (overflowUnits
   * hint) and reactive (server 400) jump-seat acknowledgment paths — one
   * copy, one code path, reused rather than forked per-trigger. Reuses
   * AlertService.confirm() (the exact primitive already used by
   * offerPrintTicket() in this same file), never a bespoke modal.
   */
  private confirmJumpSeatSale(): Promise<boolean> {
    return this.alertService.confirm({
      title: this.translate.instant('STAFF.SELL.JUMP_SEAT_CONFIRM_TITLE'),
      text: this.translate.instant('STAFF.SELL.JUMP_SEAT_CONFIRM_TEXT'),
      confirmButtonText: this.translate.instant('STAFF.SELL.JUMP_SEAT_CONFIRM_OK'),
      cancelButtonText: this.translate.instant('COMMON.CLOSE'),
      icon: 'warning',
    });
  }

  /**
   * Sends the walk-in booking-create request, pays it on success, and offers
   * the print-ticket prompt — the single implementation shared by the first
   * attempt and the one allowed retry below (no duplicated success/payment
   * handling).
   *
   * OBRS-358 REACTIVE backstop: the proactive `overflowUnits` hint (built
   * from the walk-in trip DTO's sold/reserved counts) under-reports on OPEN
   * trips — `findWalkInSchedulesByDate`'s `soldPaidCount` is always 0 there
   * (a pre-existing `string_agg(DISTINCT seat_number)` bug collapsing blank
   * OPEN seat numbers; not ours to fix here). So the hint can fail to fire
   * while the server still correctly rejects the sale with
   * `BOOKING_ERROR_JUMPSEAT_ACKNOWLEDGMENT_REQUIRED`. Treating that 400 as
   * authoritative — showing the SAME confirmJumpSeatSale() dialog reactively
   * and, on Confirm, resubmitting with `jumpSeatAcknowledged: true` — closes
   * the dead-end where staff could not otherwise complete a legitimate sale
   * of the 21st (jump) seat.
   *
   * `allowAckRetry` guards against a retry loop: the retry call passes
   * `false`, so a repeated ACK_REQUIRED (should not happen once ack=true is
   * sent, but defensively) falls through to the plain error toast instead of
   * retrying again.
   */
  private submitWalkInBooking(
    basePayload: WalkInBookingPayloadDraft,
    jumpSeatAcknowledged: boolean,
    allowAckRetry: boolean
  ): Promise<void> {
    // Fills in a key only when one isn't already held for this sale attempt
    // — handleCreateBookingError() explicitly regenerates it before calling
    // this method again for the reactive-ack retry (a FRESH key, since the
    // failed attempt created nothing server-side), so this fallback only
    // ever fires for a genuinely first call.
    if (!this.idempotencyKey) {
      this.idempotencyKey = generateIdempotencyKey();
    }
    const key = this.idempotencyKey;

    // OBRS-358: only sent when this attempt was gated on (or reactively
    // confirmed for) the jump-seat acknowledgment — omitted (not `false`)
    // otherwise, same conditional-field shape as identityCardNumber/email.
    const payloadToSend: WalkInBookingPayloadDraft = jumpSeatAcknowledged
      ? { ...basePayload, jumpSeatAcknowledged: true }
      : basePayload;

    return new Promise<void>((resolve) => {
      this.staffApiService
        .createWalkInBooking(payloadToSend as Parameters<typeof this.staffApiService.createWalkInBooking>[0])
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (bookingResp) => {
            const bId = bookingResp?.data?.bookingId ?? null;
            const bNum = bookingResp?.data?.bookingNumber ?? null;
            this.bookingId = bId;
            this.bookingNumber = bNum;

            if (!bId || !key) {
              this.isSelling = false;
              resolve();
              return;
            }

            this.staffApiService
              .payWalkIn(bId, key)
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: () => {
                  this.isSelling = false;
                  this.idempotencyKey = null;
                  this.selectedSeats = [];
                  this.passengerCount = 1;
                  this.seatPassengerTypes = {};
                  // Staff POS: do NOT navigate to /e-ticket — it's a customerArea
                  // route, so AuthGuard bounces staff to their home and leaves the
                  // just-sold seat showing as available on the now-stale seat map
                  // (OBRS-188). Confirm in place and reload so the seat map + the
                  // trip row's sold-count badge reflect the sale.
                  this.selectedTrip = null;
                  this.activeTabIndex = 0;
                  this.loadTrips(this.selectedDate);
                  void this.offerPrintTicket(bId, bNum);
                  resolve();
                },
                error: (err: unknown) => {
                  this.isSelling = false;
                  const message =
                    this.mapJumpSeatErrorMessage(err) ||
                    extractApiErrorMessage(err) ||
                    this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
                  void this.alertService.error(message);
                  resolve();
                },
              });
          },
          error: (err: unknown) => {
            void this.handleCreateBookingError(err, basePayload, jumpSeatAcknowledged, allowAckRetry).then(resolve);
          },
        });
    });
  }

  /**
   * Branches a failed booking-create call: the OBRS-358 reactive ack-retry
   * (see submitWalkInBooking()'s doc comment) when eligible, otherwise the
   * plain mapped-error toast unchanged from before this follow-up.
   */
  private async handleCreateBookingError(
    err: unknown,
    basePayload: WalkInBookingPayloadDraft,
    jumpSeatAcknowledged: boolean,
    allowAckRetry: boolean
  ): Promise<void> {
    const errorCode = this.extractErrorCode(err);

    if (
      allowAckRetry &&
      !jumpSeatAcknowledged &&
      errorCode === 'BOOKING_ERROR_JUMPSEAT_ACKNOWLEDGMENT_REQUIRED'
    ) {
      this.isSelling = false;
      const acknowledged = await this.confirmJumpSeatSale();
      if (!acknowledged) {
        // Quiet abort — no toast, no raw code (design-system §9); staff
        // simply declined the jump-seat sale. Selection/checkout stay as-is
        // so staff can adjust and try again.
        return;
      }
      // The failed attempt created nothing server-side (it 400'd before
      // persistence) — this retry is a NEW sale attempt, not a resend of
      // the failed one: always regenerate, never reuse the key already
      // held from the failed attempt above (submitWalkInBooking() only
      // fills in a key when one isn't already set, so an explicit
      // regenerate here is required — it would otherwise be reused as-is).
      this.idempotencyKey = generateIdempotencyKey();
      this.isSelling = true;
      // allowAckRetry=false: at most one reactive retry per sale attempt.
      await this.submitWalkInBooking(basePayload, true, false);
      return;
    }

    this.isSelling = false;
    const message =
      this.mapJumpSeatErrorMessage(err) ||
      extractApiErrorMessage(err) ||
      this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
    void this.alertService.error(message);
  }

  /** Extracts `error.error.errorCode` off a failed HTTP call (same shape
   * WalkInCenterPanelComponent.onSave() reads for
   * SCHEDULE_ERROR_CAPACITY_EXCEEDS_TYPE_MAX) — shared by
   * mapJumpSeatErrorMessage() and handleCreateBookingError()'s retry check. */
  private extractErrorCode(err: unknown): string {
    return (err as { error?: { errorCode?: string } } | null)?.error?.errorCode ?? '';
  }

  // OBRS-358: jump-seat sale errorCode -> i18n key, same switch-on-errorCode
  // pattern as WalkInCenterPanelComponent.onSave()'s
  // SCHEDULE_ERROR_CAPACITY_EXCEEDS_TYPE_MAX branch — never surface the raw
  // code (design-system §9). The backend's DomainException derives the
  // UPPER_SNAKE errorCode from its internal message key, e.g.
  // `booking.error.jumpseat.acknowledgment-required` ->
  // `BOOKING_ERROR_JUMPSEAT_ACKNOWLEDGMENT_REQUIRED` (same derivation
  // documented in `shared/interfaces/reschedule.interface.ts`).
  // `SEAT_ERROR_WALK_IN_ONLY` is the ONE shared code also reachable from the
  // customer change-seat/reschedule/change-stop flows (see
  // `shared/lib/change-seat-error.ts` / `change-stop-error.ts` /
  // `reschedule-error.ts`) — mapped here to the same `COMMON.ERROR.*` key so
  // the copy is never duplicated. Returns '' (falsy) for any other/absent
  // code so the caller falls through to `extractApiErrorMessage`.
  private mapJumpSeatErrorMessage(err: unknown): string {
    switch (this.extractErrorCode(err)) {
      case 'BOOKING_ERROR_JUMPSEAT_ACKNOWLEDGMENT_REQUIRED':
        return this.translate.instant('STAFF.SELL.ERR_JUMPSEAT_ACK_REQUIRED');
      case 'BOOKING_ERROR_JUMPSEAT_DISABLED':
        return this.translate.instant('STAFF.SELL.ERR_JUMPSEAT_DISABLED');
      case 'BOOKING_ERROR_JUMPSEAT_NORMAL_SEATS_AVAILABLE':
        return this.translate.instant('STAFF.SELL.ERR_JUMPSEAT_NORMAL_AVAILABLE');
      case 'SEAT_ERROR_WALK_IN_ONLY':
        return this.translate.instant('COMMON.ERROR.SEAT_WALK_IN_ONLY');
      default:
        return '';
    }
  }

  /**
   * OBRS-195/OBRS-188: replaces the old post-sale success toast with an
   * actionable "Print ticket" choice. AlertService.confirm (already the
   * generic yes/no primitive — not forked/extended) is reused so this still
   * routes through AlertService rather than a direct Swal.fire(). Confirming
   * navigates to the staff-owned receipt route (never `/e-ticket`, which is
   * `customerArea` and bounces staff — OBRS-188).
   */
  private async offerPrintTicket(
    bookingId: number | null,
    bookingNumber: string | null
  ): Promise<void> {
    const shouldPrint = await this.alertService.confirm({
      title: this.translate.instant('STAFF.SELL.SOLD_SUCCESS_TITLE'),
      text: this.translate.instant('STAFF.SELL.SOLD_SUCCESS', {
        bookingNumber: bookingNumber ?? '',
      }),
      confirmButtonText: this.translate.instant('STAFF.SELL.PRINT_TICKET'),
      cancelButtonText: this.translate.instant('COMMON.CLOSE'),
      icon: 'success',
    });

    if (shouldPrint && bookingId) {
      void this.router.navigate(['/staff/sell/receipt', bookingId]);
    }
  }

  // ─── Schedule management ───────────────────────────────────────────────────

  private get currentScheduleLocale(): string {
    const raw = String(this.translate.currentLang || this.translate.getDefaultLang() || 'th').toLowerCase();
    return raw.startsWith('en') ? 'en' : 'th';
  }

  private applyScheduleLocalization(data: StaffSchedulesData): void {
    const locale = this.currentScheduleLocale;
    this.scheduleRouteOptions = data.routes.map((r) => ({
      code: r.slug,
      label: getAdminLookupLabel(r, locale) ?? getAdminTranslationLabel(r.translations, locale) ?? r.slug,
    }));
    this.scheduleVehicleTypeOptions = data.vehicleTypes.map((vt) => ({
      code: vt.slug,
      label: getAdminLookupLabel(vt, locale) ?? getAdminTranslationLabel(vt.translations, locale) ?? vt.slug,
    }));
    this.scheduleVehicleOptions = data.vehicles.map((v) => ({
      code: String(v.id),
      label: v.vehicleNumber ?? v.numberPlate ?? `#${v.id}`,
    }));
    // Drivers already come pre-filtered from /private/users/drivers (OBRS-175).
    this.scheduleDriverOptions = data.drivers.map((d) => ({
      code: String(d.id),
      label: d.name?.trim() || `#${d.id}`,
    }));

    // Cold-open fix: if the create form is open and route is still blank+pristine
    // (store wasn't loaded yet when the modal opened), apply the first-option default
    // now — but never overwrite a user's manual pick. vehicleType is intentionally
    // NOT defaulted: per design-system §3.1 a form select starts on its placeholder
    // and the user picks explicitly (like Vehicle/Driver). Validators.required blocks
    // Confirm until they do.
    if (this.isScheduleFormOpen && !this.isScheduleEditMode) {
      const routeCtrl = this.scheduleItemForm.get('route');
      if (routeCtrl?.pristine && !routeCtrl.value && this.scheduleRouteOptions[0]?.code) {
        routeCtrl.setValue(this.scheduleRouteOptions[0].code);
      }
    }
  }

  protected isScheduleFieldInvalid(fieldName: string): boolean {
    const field = this.scheduleItemForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  /** Lazy-refresh store on first modal open. */
  private ensureScheduleStoreLoaded(): void {
    if (!this.scheduleStore.hasValue) {
      void this.scheduleStore.refresh();
    }
  }

  protected onAddScheduleClicked(): void {
    this.ensureScheduleStoreLoaded();
    this.isScheduleEditMode = false;
    this.editingScheduleId = null;
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    this.scheduleItemForm.reset({
      departureDate: this.selectedDate,
      departureTime: now,
      route: this.scheduleRouteOptions[0]?.code ?? '',
      vehicleType: '', // design-system §3.1: start on placeholder, user picks explicitly
      vehicleId: '',
      driverId: '',
    });
    this.isScheduleFormOpen = true;
  }

  protected onAddScheduleForRoute(event: { routeSlug: string; date: Date }): void {
    this.ensureScheduleStoreLoaded();
    this.isScheduleEditMode = false;
    this.editingScheduleId = null;
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    this.scheduleItemForm.reset({
      departureDate: event.date,
      departureTime: now,
      route: event.routeSlug,
      vehicleType: '', // design-system §3.1: start on placeholder, user picks explicitly
      vehicleId: '',
      driverId: '',
    });
    this.isScheduleFormOpen = true;
  }

  protected onEditScheduleClicked(event: { trip: WalkInTripDto; routeSlug: string }): void {
    this.ensureScheduleStoreLoaded();
    const { trip, routeSlug } = event;
    this.isScheduleEditMode = true;
    this.editingScheduleId = trip.scheduleId;

    // Build fallback synchronously from trip row data
    const fallbackDto: AdminScheduleDto = {
      id: trip.scheduleId,
      departureDateTime: trip.departureDateTime,
      status: '',
      route: { id: 0, slug: routeSlug },
      vehicleType: trip.vehicleType ? { id: 0, slug: trip.vehicleType } : undefined,
      vehicle: undefined,
      driver: undefined,
    };
    this.applyScheduleFormValues(fallbackDto);

    // Open modal immediately (optimistic)
    this.isScheduleFormOpen = true;
    this.isScheduleDetailLoading = true;

    // Fetch full detail and patch pristine-only controls
    this.adminApiService
      .getScheduleById(trip.scheduleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          const detail = resp?.data ?? null;
          if (detail && this.isScheduleFormOpen && this.editingScheduleId === trip.scheduleId) {
            this.applyScheduleFormValues(detail, true);
          }
          if (this.isScheduleFormOpen && this.editingScheduleId === trip.scheduleId) {
            this.isScheduleDetailLoading = false;
          }
        },
        error: () => {
          // Keep fallback values silently — do not close modal
          if (this.isScheduleFormOpen && this.editingScheduleId === trip.scheduleId) {
            this.isScheduleDetailLoading = false;
          }
        },
      });
  }

  protected closeScheduleForm(force = false): void {
    if (this.isScheduleSubmitting && !force) { return; }
    this.isScheduleFormOpen = false;
    this.isScheduleDetailLoading = false;
    this.editingScheduleId = null;
    this.scheduleItemForm.reset();
  }

  protected async submitSchedule(): Promise<void> {
    if (this.scheduleItemForm.invalid) {
      this.scheduleItemForm.markAllAsTouched();
      await this.alertService.warning(this.translate.instant('STAFF.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isScheduleSubmitting = true;
    try {
      const payload = this.toSchedulePayload();
      if (this.isScheduleEditMode && this.editingScheduleId != null) {
        await firstValueFrom(this.adminApiService.updateSchedule(this.editingScheduleId, payload));
        this.closeScheduleForm(true);
        this.loadTrips(this.selectedDate);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createSchedule(payload));
        this.closeScheduleForm(true);
        this.loadTrips(this.selectedDate);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }
    } catch (error) {
      this.closeScheduleForm(true);
      const message = extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isScheduleSubmitting = false;
    }
  }

  protected onDeleteScheduleClicked(event: { trip: WalkInTripDto; routeSlug: string }): void {
    this.deletingTrip = event.trip;
    this.isScheduleDeleteOpen = true;
  }

  protected closeScheduleDelete(force = false): void {
    if (this.isScheduleDeleting && !force) { return; }
    this.isScheduleDeleteOpen = false;
    this.deletingTrip = null;
  }

  // OBRS-283: which confirm-dialog variant to show — see
  // shared/lib/schedule-delete-mode.ts.
  protected get scheduleDeleteModalMode(): ScheduleDeleteModalMode {
    return resolveScheduleDeleteModalMode(
      this.deletingTrip?.deletable,
      this.deletingTrip?.confirmedBookingCount
    );
  }

  protected async confirmDeleteSchedule(): Promise<void> {
    if (!this.deletingTrip) { return; }
    const trip = this.deletingTrip;
    const scheduleId = trip.scheduleId;
    const mode = this.scheduleDeleteModalMode;
    // OBRS-667 defence in depth: the confirm button is hidden in cancel-mode
    // for a non-owner (see the template), but a DOM-forced click must not be
    // able to fire cancelSchedule() either. Silent no-op, and BEFORE the
    // optimistic routeGroups mutation below — the backend 403 guard is the
    // real security boundary, this is only the UX mirror.
    if (mode !== 'delete' && !this.canCancelSchedule) return;

    // OPTIMISTIC: remove from routeGroups immediately (new arrays — parent-owned).
    // A cancelled trip is no longer sellable either, so this is safe for both
    // the hard-delete and soft-cancel paths.
    this.routeGroups = this.routeGroups
      .map((group) => ({
        ...group,
        trips: group.trips.filter((t) => t.scheduleId !== scheduleId),
      }))
      .filter((group) => group.trips.length > 0);

    // If the deleted trip was the selected trip, reset the selection
    // so checkout can't POST against a deleted/cancelled schedule.
    if (this.selectedTrip?.scheduleId === scheduleId) {
      this.selectedTrip = null;
      this.selectedRouteSlug = null;
      this.selectedSeats = [];
      this.passengerCount = 1;
      this.seatPassengerTypes = {};
      this.idempotencyKey = null;
      this.activeTabIndex = 0;
      this._resetSegments();
    }

    // Close modal immediately
    this.isScheduleDeleting = true;
    this.closeScheduleDelete(true);

    try {
      if (mode !== 'delete') {
        // OBRS-283: deletable===false — soft-cancel instead of hard-delete.
        const response = await firstValueFrom(this.adminApiService.cancelSchedule(scheduleId));
        const affectedBookingCount = response?.data?.affectedBookingCount ?? 0;
        await this.alertService.success(
          this.translate.instant('ADMIN.MESSAGES.SCHEDULE_CANCELLED', {
            count: affectedBookingCount,
          })
        );
        this.loadTrips(this.selectedDate); // reconcile
        return;
      }

      await firstValueFrom(this.adminApiService.deleteSchedule(scheduleId));
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      this.loadTrips(this.selectedDate); // reconcile
    } catch (error) {
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant(
          mode !== 'delete' ? 'ADMIN.MESSAGES.CANCEL_FAILED' : 'ADMIN.MESSAGES.DELETE_FAILED'
        );
      await this.alertService.error(message);
      this.loadTrips(this.selectedDate); // restore
    } finally {
      this.isScheduleDeleting = false;
    }
  }

  // ─── Schedule form helpers (mirroring staff-schedules-page patterns) ───────

  private splitScheduleDateTime(value: string | null | undefined): { date: string; time: string } {
    const v = String(value ?? '').trim();
    if (!v) return { date: '', time: '' };
    const [date, rawTime = ''] = v.includes('T') ? v.split('T') : v.split(/\s+/);
    return { date, time: rawTime.slice(0, 5) };
  }

  private toScheduleDateControlValue(dateStr: string | null | undefined): Date | null {
    const s = String(dateStr ?? '').trim();
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  private toScheduleTimeControlValue(timeStr: string | null | undefined): Date | null {
    const s = String(timeStr ?? '').trim().slice(0, 5);
    const [h, min] = s.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
    const date = new Date();
    date.setHours(h, min, 0, 0);
    return date;
  }

  private toScheduleDateInputValue(value: Date | null): string {
    if (!value || !Number.isFinite(value.getTime())) return '';
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private toScheduleTimeInputValue(value: Date | null): string {
    if (!value || !Number.isFinite(value.getTime())) return '';
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }

  private toScheduleDateValue(value: unknown): Date | null {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    const s = String(value ?? '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return this.toScheduleDateControlValue(s);
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return this.toScheduleTimeControlValue(s);
    const p = new Date(s);
    return Number.isFinite(p.getTime()) ? p : null;
  }

  private toScheduleOptionalNumber(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  private toSchedulePayload(): CreateSchedulePayload {
    const raw = this.scheduleItemForm.getRawValue();
    const departureDate = this.toScheduleDateInputValue(this.toScheduleDateValue(raw.departureDate));
    const departureTime = this.toScheduleTimeInputValue(this.toScheduleDateValue(raw.departureTime));
    const vehicleId = this.toScheduleOptionalNumber(raw.vehicleId);
    const driverId = this.toScheduleOptionalNumber(raw.driverId);
    return {
      departureDateTime: combineBangkokDateTime(departureDate, departureTime),
      route: String(raw.route ?? '').trim(),
      vehicleType: String(raw.vehicleType ?? '').trim(),
      ...(vehicleId !== undefined ? { vehicleId } : {}),
      ...(driverId !== undefined ? { driverId } : {}),
    };
  }

  private applyScheduleFormValues(dto: AdminScheduleDto, onlyPristine = false): void {
    const dep = this.splitScheduleDateTime(dto.departureDateTime);
    const values = {
      departureDate: this.toScheduleDateControlValue(dep.date),
      departureTime: this.toScheduleTimeControlValue(dep.time),
      route: dto.route?.slug ?? '',
      vehicleType: dto.vehicleType?.slug ?? '',
      vehicleId: dto.vehicle?.id ? String(dto.vehicle.id) : '',
      driverId: dto.driver?.id ? String(dto.driver.id) : '',
    };
    if (!onlyPristine) {
      this.scheduleItemForm.reset(values);
      return;
    }
    for (const [name, value] of Object.entries(values)) {
      const ctrl = this.scheduleItemForm.get(name);
      if (ctrl?.pristine) { ctrl.setValue(value); }
    }
  }

  // ─── Trip loading / segment logic (unchanged) ─────────────────────────────

  private loadTrips(date: Date): void {
    const dateStr = dayjs(date).format('YYYY-MM-DD');
    this.isLoadingTrips = true;

    this.staffApiService
      .getWalkInSchedules(dateStr)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.routeGroups = resp?.data ?? [];
          this.isLoadingTrips = false;
        },
        error: () => {
          this.routeGroups = [];
          this.isLoadingTrips = false;
        },
      });
  }

  private loadSegments(
    routeSlug: string,
    trip: WalkInTripDto,
    preserve?: { pickup: string; dropoff: string }
  ): void {
    this._resetSegments();
    if (!routeSlug) return;

    this.isLoadingSegments = true;
    const vehicleType = trip.vehicleType ?? null;

    forkJoin({
      segments: this.staffApiService.getRouteSegments(routeSlug),
      // Route-stops give authoritative ordering + per-stop time offsets. Treat a
      // failure/absence as non-fatal — the stop list still renders from segments
      // (order falls back to insertion order, times blank) instead of breaking.
      routeStops: this.staffApiService.getRouteStops(routeSlug).pipe(
        catchError(() =>
          of<ResponseAPI<RouteStopsDto>>({
            code: 200,
            message: 'OK',
            data: { stops: [], defaultPickupStopSlug: null },
          })
        )
      ),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ segments, routeStops }) => {
          if (this.selectedRouteSlug !== routeSlug) return;
          // OBRS-1258: server-resolved per THIS route/caller — replaces the old client-side
          // salesPointStop$ join.
          this.defaultPickupStopSlug = routeStops?.data?.defaultPickupStopSlug ?? null;
          const allPairs = segments?.data?.stopPairs ?? [];
          const typed = vehicleType
            ? allPairs.filter((p) => p.vehicleType?.slug === vehicleType)
            : allPairs;
          const pairs = typed.length > 0 ? typed : allPairs;

          // Authoritative order + time offset per stop (route-stops uses `code` as the slug).
          this.stopOrderMap = new Map<string, number>();
          this.stopOffsetMap = new Map<string, number>();
          for (const rs of routeStops?.data?.stops ?? []) {
            const slug = rs.stop?.code;
            if (!slug) continue;
            if (typeof rs.stopOrder === 'number') {
              this.stopOrderMap.set(slug, rs.stopOrder);
            }
            if (typeof rs.offsetMinutesFromOrigin === 'number') {
              this.stopOffsetMap.set(slug, rs.offsetMinutesFromOrigin);
            }
          }

          this.fareMap = new Map<string, number>();
          for (const p of pairs) {
            const fare = parseFloat(p.fare ?? '0');
            this.fareMap.set(
              `${p.fromStop.slug}|${p.toStop.slug}`,
              Number.isFinite(fare) ? fare : 0
            );
          }
          this.orderedStops = this._buildOrderedStops(pairs);
          this._buildStopTimes(trip);
          this._applyDefaultStops(preserve);

          const rawPopularPickup: PopularStopDto[] = segments?.data?.popularPickupStops ?? [];
          const rawPopularDropoff: PopularStopDto[] = segments?.data?.popularDropoffStops ?? [];
          this.popularPickupStops = rawPopularPickup.map(s => ({ slug: s.slug, name: s.name, time: this.stopTime(s.slug) }));
          this.popularDropoffStops = rawPopularDropoff.map(s => ({ slug: s.slug, name: s.name, time: this.stopTime(s.slug) }));

          this.isLoadingSegments = false;
        },
        error: () => {
          if (this.selectedRouteSlug !== routeSlug) return;
          this.isLoadingSegments = false;
        },
      });
  }

  // Map of stop slug → computed HH:mm time string (departure + route offset).
  private stopTimeMap = new Map<string, string>();

  /**
   * Each stop's clock time = the schedule's departure + that stop's
   * offsetMinutesFromOrigin (from the route-stops endpoint). Every stop on the
   * route carries an offset, so pickup and drop-off stops alike get a correct
   * time — no chain reconstruction and no cascade blanking (the old segment-graph
   * approach could only time stops the origin had a direct fare segment to, which
   * left every parallel pickup point blank).
   */
  private _buildStopTimes(trip: WalkInTripDto): void {
    this.stopTimeMap = new Map<string, string>();
    const departure = dayjs(trip.departureDateTime);
    for (const [slug, offset] of this.stopOffsetMap) {
      this.stopTimeMap.set(slug, departure.add(offset, 'minute').format('HH:mm'));
    }
  }

  /** Returns the computed HH:mm time for a stop slug, or '' if unknown. */
  private stopTime(slug: string): string {
    return this.stopTimeMap.get(slug) ?? '';
  }

  /**
   * Sellable stops (those appearing in the segment pairs) ordered by the route's
   * canonical `stop_order`. Stops missing from route-stops sort last (stable) so
   * an incomplete route-stops set never scrambles the known sequence.
   */
  private _buildOrderedStops(
    pairs: { fromStop: SegmentStopRefDto; toStop: SegmentStopRefDto }[]
  ): SegmentStopRefDto[] {
    const stops = new Map<string, SegmentStopRefDto>();
    for (const p of pairs) {
      stops.set(p.fromStop.slug, p.fromStop);
      stops.set(p.toStop.slug, p.toStop);
    }
    return Array.from(stops.values()).sort(
      (a, b) =>
        (this.stopOrderMap.get(a.slug) ?? Number.MAX_SAFE_INTEGER) -
        (this.stopOrderMap.get(b.slug) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  /**
   * Default pickup/drop-off. When `preserve` is given (e.g. a language-switch
   * reload) and its slugs are still valid for the freshly-fetched stops, keep
   * that selection instead — a manual pick always wins across a re-default;
   * slugs are locale-invariant, so only the displayed names should change.
   *
   * Otherwise (cold open, or the preserved pickup is no longer valid): default
   * pickup to `defaultPickupStopSlug` (OBRS-1258 — server-resolved from the
   * caller's active sales point on this route) when it's set AND it's actually
   * on this route; else fall back to the route origin (first stop) exactly as
   * before this feature — silently, no toast. Drop-off then defaults to the
   * full route (destination) against whichever pickup was resolved, unchanged.
   */
  private _applyDefaultStops(preserve?: { pickup: string; dropoff: string }): void {
    if (this.orderedStops.length < 2) return;
    if (preserve && this.orderedStops.some((s) => s.slug === preserve.pickup)) {
      this.pickupSlug = preserve.pickup;
      // dropoffOptions depends on pickupSlug, so it's valid to read now.
      this.dropoffSlug = this.dropoffOptions.some((s) => s.slug === preserve.dropoff)
        ? preserve.dropoff
        : this.dropoffOptions[0]?.slug ?? '';
      return;
    }
    const defaultOnRoute =
      this.defaultPickupStopSlug != null &&
      this.orderedStops.some((s) => s.slug === this.defaultPickupStopSlug);
    this.pickupSlug = defaultOnRoute
      ? (this.defaultPickupStopSlug as string)
      : this.orderedStops[0].slug;
    const dest = this.orderedStops[this.orderedStops.length - 1].slug;
    this.dropoffSlug = this.fareMap.has(`${this.pickupSlug}|${dest}`)
      ? dest
      : this.dropoffOptions[0]?.slug ?? '';
  }

  /** Keep drop-off valid after a pickup change. */
  private onPickupChange(): void {
    if (!this.dropoffOptions.some((s) => s.slug === this.dropoffSlug)) {
      this.dropoffSlug = this.dropoffOptions[0]?.slug ?? '';
    }
  }

  private _resetSegments(): void {
    this.orderedStops = [];
    this.fareMap = new Map<string, number>();
    this.stopOrderMap = new Map<string, number>();
    this.stopOffsetMap = new Map<string, number>();
    this.pickupSlug = '';
    this.dropoffSlug = '';
    this.stopTimeMap = new Map<string, string>();
    this.popularPickupStops = [];
    this.popularDropoffStops = [];
  }
}
