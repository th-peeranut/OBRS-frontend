import { Component, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { take, takeUntil } from 'rxjs/operators';

// store
import { Store } from '@ngrx/store';
import {
  invokeGetScheduleBookingApi,
  invokeSetScheduleBookingApi,
} from '../../shared/stores/schedule-booking/schedule-booking.action';
import {
  invokeGetScheduleFilterApi,
  invokeSetScheduleFilterApi,
} from '../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeGetAllProvinceWithStationApi } from '../../shared/stores/station/station.action';
import { invokeSetBookingApi } from '../../shared/stores/booking/booking.action';
import { selectBookingNetAmount } from '../../shared/stores/booking/booking.selector';
import { Router } from '@angular/router';
import { AnalyticsService } from '../../services/analytics/analytics.service';
import { BookingService } from '../../services/booking/booking.service';
import { normalizeAnalyticsPaymentMethod } from '../../shared/lib/analytics-payment-method';
import { PaymentTotalState } from '../../shared/interfaces/payment.interface';

type PaymentTab = 'creditcard' | 'qrcode';

@Component({
    selector: 'app-payment',
    templateUrl: './payment.component.html',
    styleUrl: './payment.component.scss',
    standalone: false
})
export class PaymentComponent implements OnDestroy {
  activePaymentTab: PaymentTab = 'creditcard';
  /**
   * OBRS-1986: whether the server's own `netAmount` is on screen. Handed to both payment
   * panels, which keep their pay button dead until it reads `'ready'`.
   */
  totalState: PaymentTotalState = 'loading';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private store: Store,
    private router: Router,
    private analytics: AnalyticsService,
    private bookingService: BookingService
  ) {}

  ngOnInit(): void {
    // OBRS-867 funnel step 5.
    this.analytics.track('payment_started', {
      payment_method: this.reportedMethod(),
    });

    this.store.dispatch(invokeGetAllProvinceWithStationApi());
    this.store.dispatch(invokeGetScheduleBookingApi());
    this.store.dispatch(invokeGetScheduleFilterApi());
    this.restoreServerTotal();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * OBRS-1986 (AC-4). A refresh of this page empties the NgRx booking AND passenger
   * stores - neither is persisted, and the passenger one deliberately never will be
   * (names and phone numbers, OBRS-903) - while the trip selection survives in
   * `obrs.booking_context`. That asymmetry is what printed "0 baht" beside a live pay
   * button on PROD on 2026-09-19: the fare was there, the headcount was 0.
   *
   * Refetching is the only way to get the real figure back, so it happens here, once, at
   * page init - and only when the store cannot already answer, so the ordinary
   * /passenger-info -> /payment walk makes no extra request.
   */
  private restoreServerTotal(): void {
    this.store
      .select(selectBookingNetAmount)
      .pipe(take(1))
      .subscribe((netAmount) => {
        if (netAmount != null) {
          this.totalState = 'ready';
          return;
        }
        this.refetchBooking();
      });
  }

  private refetchBooking(): void {
    const bookingId = this.bookingService.getActiveBookingId();
    if (!bookingId) {
      this.totalState = 'unavailable';
      return;
    }

    this.bookingService
      .getBooking(bookingId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const booking = response?.data;
          const netAmount = Number(booking?.netAmount);
          if (booking?.netAmount == null || !Number.isFinite(netAmount)) {
            // A 200 that carries no amount is no better than a failure here - the one
            // thing this call exists to bring back is the figure the customer pays.
            this.totalState = 'unavailable';
            return;
          }

          // OBRS-1984: the hold deadline this refetch brought back. Persisted before the
          // panels read it, so the countdown after a refresh is the remaining hold and not
          // a fresh 15:00.
          //
          // Written only when the response actually carries one. `setActiveBookingExpiresAt`
          // is write-OR-CLEAR, and the signed-in lane reads a projection that has no
          // `expiresAt` field at all — clearing on that would delete the deadline the CREATE
          // call already stored, which survives the refresh perfectly well. An absent field
          // means "this response does not know", never "there is no deadline".
          if (booking.expiresAt) {
            this.bookingService.setActiveBookingExpiresAt(booking.expiresAt);
          }

          this.store.dispatch(
            invokeSetBookingApi({
              booking: {
                bookingId: booking.bookingId ?? bookingId,
                bookingNumber: booking.bookingNumber ?? null,
                totalAmount: booking.totalAmount,
                discountAmountSnapshot: booking.discountAmountSnapshot,
                netAmount,
                adultCount: booking.adultCount,
                childCount: booking.childCount,
              },
            })
          );
          this.totalState = 'ready';
        },
        error: () => {
          this.totalState = 'unavailable';
        },
      });
  }

  onBack(): void {
    this.router.navigate(['/passenger-info']);
  }

  onPaymentTabChange(tab: PaymentTab): void {
    this.activePaymentTab = tab;
    // AC-2's last open question: "which of the five methods do customers
    // actually pick?" Fired on the switch rather than only at completion, so a
    // customer who tries QR, gives up and abandons still shows up as having
    // wanted QR.
    this.analytics.track('payment_method_selected', {
      payment_method: this.reportedMethod(),
    });
  }

  /**
   * The active tab, translated into the vocabulary the API and the completion
   * event use (OBRS-902).
   *
   * `activePaymentTab` is a UI identifier — `creditcard`/`qrcode` are the names
   * of two `*ngIf` branches in the template. Sending them raw meant the funnel's
   * top steps were labelled in a vocabulary its bottom step did not share, so
   * `payment_started=creditcard` could never be joined to
   * `booking_completed=card` and a method-split funnel dropped every session.
   * Fixing only the false value in `PaymentResultComponent` would have left that
   * intact — a correct value nobody can count is worth as much as a wrong one.
   */
  private reportedMethod(): string {
    return normalizeAnalyticsPaymentMethod(this.activePaymentTab);
  }

  /**
   * OBRS-867 funnel step 6 — the bottom of the funnel, in-page branch.
   *
   * There are TWO ways a booking completes and this is only one of them. The
   * card flow settles without leaving the page and emits `paymentCompleted`
   * here; PromptPay navigates away to the bank and comes back to
   * `/payment/result`, where `PaymentResultComponent` fires the same event on
   * its own. Instrumenting only this one would have shown card conversions
   * and reported PromptPay — the method Thai customers actually use — as a
   * funnel that never converts.
   *
   * The two branches cannot double-count: a payment that left the page never
   * returns to this component instance.
   *
   * OBRS-902 corrected the split above: it is not card-here / PromptPay-there.
   * A card payment that needs 3DS also leaves the page, so this branch is
   * "settled without a redirect" and the other is "settled after one" —
   * a distinction about the *flow*, which is why neither may name the method
   * from its own position in the code.
   */
  onPaymentCompleted(): void {
    this.analytics.track('booking_completed', {
      payment_method: this.reportedMethod(),
    });
  }
}
