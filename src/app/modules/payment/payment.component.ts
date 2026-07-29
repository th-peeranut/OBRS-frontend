import { Component } from '@angular/core';

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
import { Router } from '@angular/router';
import { AnalyticsService } from '../../services/analytics/analytics.service';

type PaymentTab = 'creditcard' | 'qrcode';

@Component({
  selector: 'app-payment',
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.scss',
})
export class PaymentComponent {
  activePaymentTab: PaymentTab = 'creditcard';

  constructor(
    private store: Store,
    private router: Router,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    // OBRS-867 funnel step 5.
    this.analytics.track('payment_started', {
      payment_method: this.activePaymentTab,
    });

    this.store.dispatch(invokeGetAllProvinceWithStationApi());
    this.store.dispatch(invokeGetScheduleBookingApi());
    this.store.dispatch(invokeGetScheduleFilterApi());
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
    this.analytics.track('payment_method_selected', { payment_method: tab });
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
   */
  onPaymentCompleted(): void {
    this.analytics.track('booking_completed', {
      payment_method: this.activePaymentTab,
    });
  }
}
