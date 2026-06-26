import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import dayjs from 'dayjs';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import {
  SegmentStopPairDto,
  SegmentStopRefDto,
  StaffApiService,
  WalkInRouteGroupDto,
  WalkInTripDto,
} from '../../../../services/staff/staff-api.service';
import { invokeSetBookingApi } from '../../../../shared/stores/booking/booking.action';
import { generateIdempotencyKey } from '../../../../shared/lib/idempotency-key';
import { WalkInCheckoutPayload } from '../../components/walk-in-checkout/walk-in-checkout.component';
import { WalkInTripSelection } from '../../components/walk-in-trip-browser/walk-in-trip-browser.component';
import { TripDetailsUpdatedEvent } from '../../components/walk-in-center-panel/walk-in-center-panel.component';

/** Stop option enriched with a computed departure time string. */
export interface StopOption extends SegmentStopRefDto {
  /** Computed time string, e.g. "07:00". May be '' when duration data is missing. */
  time: string;
}

@Component({
  selector: 'app-sell-page',
  templateUrl: './sell-page.component.html',
  styleUrl: './sell-page.component.scss',
})
export class SellPageComponent implements OnInit, OnDestroy {
  protected today: Date = new Date();
  protected selectedDate: Date = new Date();
  protected isLoadingTrips = false;
  protected routeGroups: WalkInRouteGroupDto[] = [];
  protected selectedTrip: WalkInTripDto | null = null;
  protected selectedRouteSlug: string | null = null;
  protected selectedSeats: string[] = [];
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
  private fareMap = new Map<string, number>();

  private idempotencyKey: string | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly router: Router,
    private readonly store: Store,
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.loadTrips(this.selectedDate);
    // Stop/route names are server-localized (resolved from the Accept-Language
    // header) and cached in component state on fetch. The `| translate` pipes
    // re-render on a language switch, but this cached server data does not — so
    // re-fetch it, preserving the current selection (slugs are locale-invariant).
    this.translate.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.reloadLocalizedData());
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
    this.seatPassengerTypes = {};
    this.idempotencyKey = null;
    this._resetSegments();
    this.loadTrips(date);
  }

  protected onTripSelected(selection: WalkInTripSelection): void {
    this.selectedTrip = selection.trip;
    this.selectedRouteSlug = selection.routeSlug;
    this.selectedSeats = [];
    this.seatPassengerTypes = {};
    this.idempotencyKey = null;
    this.loadSegments(selection.routeSlug, selection.trip);
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

  protected onSell(payload: WalkInCheckoutPayload): void {
    if (!this.selectedTrip) return;

    if (!this.idempotencyKey) {
      this.idempotencyKey = generateIdempotencyKey();
    }

    const trip = this.selectedTrip;
    this.isSelling = true;

    const passengers = this.selectedSeats.map((seat) => {
      const p: {
        passengerType: string;
        seatNumber: string;
        title: string;
        firstName: string;
        lastName: string;
        phoneNumber: string;
        identityCardNumber?: string;
      } = {
        // Use the per-seat type captured at click time; fall back to the current
        // global type if somehow the seat isn't in the map.
        passengerType: this.seatPassengerTypes[seat] ?? this.selectedPassengerType,
        seatNumber: seat,
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
    const totalAmount = fare * this.selectedSeats.length;

    const bookingPayload: {
      bookingType: 'one_way';
      totalAmount: number;
      bookingChannel: 'walk_in';
      departureSchedule: {
        scheduleId: number;
        fromStop: string;
        toStop: string;
        departureDateTime: string;
        arrivalDateTime: string;
        passengers: typeof passengers;
      };
      contact: {
        title: string;
        firstName: string;
        lastName: string;
        phoneNumber: string;
        preferredLocale: string;
        identityCardNumber?: string;
        email?: string;
      };
    } = {
      bookingType: 'one_way',
      totalAmount,
      bookingChannel: 'walk_in',
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
      bookingPayload.contact.identityCardNumber = payload.contact.identityCardNumber;
    }
    if (payload.contact.email) {
      bookingPayload.contact.email = payload.contact.email;
    }

    const key = this.idempotencyKey;

    this.staffApiService
      .createWalkInBooking(bookingPayload as Parameters<typeof this.staffApiService.createWalkInBooking>[0])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (bookingResp) => {
          const bId = bookingResp?.data?.bookingId ?? null;
          const bNum = bookingResp?.data?.bookingNumber ?? null;
          this.bookingId = bId;
          this.bookingNumber = bNum;

          if (!bId || !key) {
            this.isSelling = false;
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
                this.seatPassengerTypes = {};
                // Silently refresh trips list
                this.loadTrips(this.selectedDate);
                // Navigate to e-ticket
                this.store.dispatch(
                  invokeSetBookingApi({
                    booking: { bookingId: bId, bookingNumber: bNum ?? '' },
                  })
                );
                void this.router.navigate(['/e-ticket']);
              },
              error: (err: unknown) => {
                this.isSelling = false;
                const message =
                  extractApiErrorMessage(err) ||
                  this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
                void this.alertService.error(message);
              },
            });
        },
        error: (err: unknown) => {
          this.isSelling = false;
          const message =
            extractApiErrorMessage(err) ||
            this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
          void this.alertService.error(message);
        },
      });
  }

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

    this.staffApiService
      .getRouteSegments(routeSlug)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          if (this.selectedRouteSlug !== routeSlug) return;
          const allPairs = resp?.data?.stopPairs ?? [];
          const typed = vehicleType
            ? allPairs.filter((p) => p.vehicleType?.slug === vehicleType)
            : allPairs;
          const pairs = typed.length > 0 ? typed : allPairs;

          this.fareMap = new Map<string, number>();
          for (const p of pairs) {
            const fare = parseFloat(p.fare ?? '0');
            this.fareMap.set(
              `${p.fromStop.slug}|${p.toStop.slug}`,
              Number.isFinite(fare) ? fare : 0
            );
          }
          this._buildStopTimes(pairs, trip);
          this.orderedStops = this._buildOrderedStops(pairs);
          this._applyDefaultStops(preserve);
          this.isLoadingSegments = false;
        },
        error: () => {
          if (this.selectedRouteSlug !== routeSlug) return;
          this.isLoadingSegments = false;
        },
      });
  }

  // Map of stop slug → computed HH:mm time string (derived from departure + cumulative durations).
  private stopTimeMap = new Map<string, string>();

  private _buildStopTimes(
    pairs: SegmentStopPairDto[],
    trip: WalkInTripDto
  ): void {
    this.stopTimeMap = new Map<string, string>();
    const ordered = this._buildOrderedStops(pairs);
    if (ordered.length === 0) return;

    const departure = dayjs(trip.departureDateTime);
    let cumulativeMinutes = 0;
    // Once a leg's duration is missing, every downstream time becomes unreliable
    // (we'd under-count by the skipped leg), so blank the rest of the chain.
    let chainBroken = false;
    this.stopTimeMap.set(ordered[0].slug, departure.format('HH:mm'));

    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const curr = ordered[i];
      // Find a direct consecutive pair.
      const pair = pairs.find(
        (p) => p.fromStop.slug === prev.slug && p.toStop.slug === curr.slug
      );
      if (!chainBroken && pair && typeof pair.estimatedDurationMinutes === 'number' && pair.estimatedDurationMinutes > 0) {
        cumulativeMinutes += pair.estimatedDurationMinutes;
        this.stopTimeMap.set(curr.slug, departure.add(cumulativeMinutes, 'minute').format('HH:mm'));
      } else {
        // Can't determine this leg's duration → drop this stop's time and all
        // downstream ones rather than showing a too-early (under-counted) time.
        chainBroken = true;
        this.stopTimeMap.set(curr.slug, '');
      }
    }
  }

  /** Returns the computed HH:mm time for a stop slug, or '' if unknown. */
  private stopTime(slug: string): string {
    return this.stopTimeMap.get(slug) ?? '';
  }

  /** Order stops by in-degree (count of distinct upstream pickups). */
  private _buildOrderedStops(
    pairs: { fromStop: SegmentStopRefDto; toStop: SegmentStopRefDto }[]
  ): SegmentStopRefDto[] {
    const stops = new Map<string, SegmentStopRefDto>();
    const upstream = new Map<string, Set<string>>();
    for (const p of pairs) {
      stops.set(p.fromStop.slug, p.fromStop);
      stops.set(p.toStop.slug, p.toStop);
      const set = upstream.get(p.toStop.slug) ?? new Set<string>();
      set.add(p.fromStop.slug);
      upstream.set(p.toStop.slug, set);
    }
    return Array.from(stops.values()).sort(
      (a, b) => (upstream.get(a.slug)?.size ?? 0) - (upstream.get(b.slug)?.size ?? 0)
    );
  }

  /**
   * Default to the full route: origin (first) → destination (last). When
   * `preserve` is given (e.g. a language-switch reload) and its slugs are still
   * valid for the freshly-fetched stops, keep that selection instead — slugs are
   * locale-invariant, so only the displayed names should change.
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
    this.pickupSlug = this.orderedStops[0].slug;
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
    this.pickupSlug = '';
    this.dropoffSlug = '';
    this.stopTimeMap = new Map<string, string>();
  }
}
