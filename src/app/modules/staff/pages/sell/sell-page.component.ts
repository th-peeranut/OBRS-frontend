import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import {
  StaffApiService,
  WalkInRouteGroupDto,
  WalkInTripDto,
} from '../../../../services/staff/staff-api.service';
import { invokeSetBookingApi } from '../../../../shared/stores/booking/booking.action';
import { generateIdempotencyKey } from '../../../../shared/lib/idempotency-key';
import { WalkInCheckoutPayload } from '../../components/walk-in-checkout/walk-in-checkout.component';
import { WalkInTripSelection } from '../../components/walk-in-trip-browser/walk-in-trip-browser.component';
import dayjs from 'dayjs';

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
  protected selectedRouteLabel: string | null = null;
  protected selectedSeats: string[] = [];
  // passenger_type lookup slug chosen by staff via the center-panel tiles (male|female|monk|nun).
  protected selectedPassengerType = 'male';
  protected isSelling = false;
  protected bookingId: number | null = null;
  protected bookingNumber: string | null = null;
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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected onDateChanged(date: Date): void {
    this.selectedDate = date;
    this.selectedTrip = null;
    this.selectedRouteSlug = null;
    this.selectedRouteLabel = null;
    this.selectedSeats = [];
    this.idempotencyKey = null;
    this.loadTrips(date);
  }

  protected onTripSelected(selection: WalkInTripSelection): void {
    this.selectedTrip = selection.trip;
    this.selectedRouteSlug = selection.routeSlug;
    this.selectedRouteLabel =
      this.routeGroups.find((g) => g.routeSlug === selection.routeSlug)?.routeLabel ?? null;
    this.selectedSeats = [];
    this.idempotencyKey = null;
    // Seat availability comes from the walk-in trip DTO (availableSeatNumbers),
    // rendered directly by the seat-map component — no separate seat fetch needed.
  }

  protected onPassengerTypeChanged(passengerType: string): void {
    this.selectedPassengerType = passengerType;
  }

  protected onSeatToggled(seat: string): void {
    if (!seat) { return; }
    const idx = this.selectedSeats.indexOf(seat);
    if (idx >= 0) {
      this.selectedSeats = this.selectedSeats.filter((s) => s !== seat);
    } else {
      this.selectedSeats = [...this.selectedSeats, seat];
    }
  }

  protected onSell(payload: WalkInCheckoutPayload): void {
    if (!this.selectedTrip) return;

    // Generate idempotency key once per sell attempt
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
        // passenger_type chosen by staff in the checkout (male|female|monk|nun).
        // The backend resolves it by exact lookup slug; the previous hardcoded
        // 'ADULT' value matched no lookup and 404'd every sale.
        passengerType: this.selectedPassengerType,
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

    // Price comes from the chosen pickup→drop-off segment fare (resolved in the
    // checkout from /segments), not the trip's full-route price — otherwise the
    // backend's per-segment amount check (booking.error.amount.mismatch) rejects
    // any non-full-route selection.
    const totalAmount = payload.pricePerSeat * this.selectedSeats.length;

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
        fromStop: payload.fromStop,
        toStop: payload.toStop,
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
}
