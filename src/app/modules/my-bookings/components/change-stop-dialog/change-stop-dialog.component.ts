import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { Store, select } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { combineLatest, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MyBookingDto, toAmountNumber } from '../../../../shared/interfaces/my-booking.interface';
import {
  ChangeStopEstimate,
  ChangeStopSeatAssignment,
} from '../../../../shared/interfaces/change-stop.interface';
import { RouteStop } from '../../../../shared/interfaces/route-map.interface';
import {
  changeStopAbandoned,
  changeStopSettled,
  closeChangeStopDialog,
  confirmChangeStop,
  loadChangeStopEstimate,
  openChangeStopDialog,
} from '../../store/my-bookings.action';
import {
  selectChangeStopBooking,
  selectChangeStopConfirmError,
  selectChangeStopDropoffStops,
  selectChangeStopEstimate,
  selectChangeStopEstimateError,
  selectChangeStopEstimateLoading,
  selectChangeStopPendingPayment,
  selectChangeStopPickupStops,
  selectChangeStopRouteMeta,
  selectChangeStopRouteStopsError,
  selectChangeStopRouteStopsLoading,
  selectChangeStopSubmitting,
  selectChangeStopTickets,
  selectStopsLookup,
} from '../../store/my-bookings.selector';

type ChangeStopStep = 'pickup' | 'dropoff' | 'estimate' | 'payment' | 'error';
type PaymentTab = 'creditcard' | 'qrcode';

/**
 * Smart dialog hosting the whole change-stop flow (OBRS-110 wave 2): pickup
 * → drop-off → estimate → (payment, only if a top-up is owed). Mirrors
 * `RescheduleDialogComponent`'s modal chrome (hand-rolled backdrop +
 * role="dialog" + top-right × + Escape) and its payment-step handoff
 * (`setActiveBookingId` before the embedded payment step,
 * `[successRedirect]="null"` + `(paymentCompleted)`) rather than
 * reintroducing a third pattern (design-system §6/§12) — see
 * `docs/adr/0010-change-stop-dialog.md`.
 */
@Component({
  selector: 'app-change-stop-dialog',
  templateUrl: './change-stop-dialog.component.html',
  styleUrl: './change-stop-dialog.component.scss',
})
export class ChangeStopDialogComponent implements OnInit, OnDestroy {
  @Input() bookingId!: number;
  @Output() readonly closed = new EventEmitter<void>();

  step: ChangeStopStep = 'pickup';
  paymentTab: PaymentTab = 'creditcard';

  pickupStops: RouteStop[] = [];
  dropoffStops: RouteStop[] = [];
  pickupProvince = '';
  dropoffProvince = '';
  routeStopsLoading = false;
  routeStopsError: string | null = null;

  selectedPickupSlug: string | null = null;
  selectedDropoffSlug: string | null = null;
  /** Client-side INVALID_SEGMENT/SAME_SEGMENT banner on the dropoff step —
   * checked before any network call (design-system §6). */
  segmentError: string | null = null;

  readonly changeStopEstimate$: Observable<ChangeStopEstimate | null>;
  estimateLoading = false;
  /**
   * Error from loading the estimate itself (a failed `loadChangeStopEstimate`),
   * distinct from `confirmError` (a failed confirm/execute). Without surfacing
   * this the estimate step dead-ends silently — spinner clears, `estimate`
   * stays null, no message, Confirm disabled — the same latent bug OBRS-345
   * fixed for the reschedule dialog (this dialog reuses the same
   * `reschedule-estimate-summary`). OBRS-351.
   */
  estimateError: string | null = null;
  /** Inline confirm-time banner on the estimate step; survives a background
   * re-fetch (see the reducer's `loadChangeStopEstimate` case). */
  confirmError: string | null = null;
  submitting = false;
  /** Formatted net amount, shown in the payment step's note. */
  paymentAmountLabel = '';

  private booking: MyBookingDto | null = null;
  private stopsLookup: Record<string, number> = {};
  private tickets: ChangeStopSeatAssignment[] = [];
  private currentEstimate: ChangeStopEstimate | null = null;
  private pendingEstimateDispatch = false;
  private pristineSeeded = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: Store,
    private readonly translate: TranslateService
  ) {
    this.changeStopEstimate$ = this.store.pipe(select(selectChangeStopEstimate));
  }

  ngOnInit(): void {
    this.store.dispatch(openChangeStopDialog({ bookingId: this.bookingId }));

    combineLatest([
      this.store.pipe(select(selectChangeStopBooking)),
      this.store.pipe(select(selectStopsLookup)),
      this.store.pipe(select(selectChangeStopTickets)),
      this.store.pipe(select(selectChangeStopRouteStopsLoading)),
      this.store.pipe(select(selectChangeStopRouteStopsError)),
      this.store.pipe(select(selectChangeStopPickupStops)),
      this.store.pipe(select(selectChangeStopDropoffStops)),
      this.store.pipe(select(selectChangeStopRouteMeta)),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        ([
          booking,
          stopsLookup,
          tickets,
          routeStopsLoading,
          routeStopsError,
          pickupStops,
          dropoffStops,
          routeMeta,
        ]) => {
          this.booking = booking;
          this.stopsLookup = stopsLookup;
          this.tickets = tickets;
          this.routeStopsLoading = routeStopsLoading;
          this.routeStopsError = routeStopsError;
          this.pickupStops = pickupStops;
          this.dropoffStops = dropoffStops;
          this.pickupProvince = routeMeta?.originProvinceLabel ?? '';
          this.dropoffProvince = routeMeta?.destinationProvinceLabel ?? '';

          if (!this.pristineSeeded && booking) {
            this.selectedPickupSlug = this.currentFromStopCode();
            this.pristineSeeded = true;
          }

          if (routeStopsError) {
            this.step = 'error';
          } else if (this.step === 'error' && !routeStopsLoading) {
            // Retry succeeded — resume where the traveler left off.
            this.step = 'pickup';
          }

          this.tryDispatchEstimate();
        }
      );

    this.store
      .pipe(select(selectChangeStopEstimateLoading), takeUntil(this.destroy$))
      .subscribe((loading) => (this.estimateLoading = loading));

    this.store
      .pipe(select(selectChangeStopEstimateError), takeUntil(this.destroy$))
      .subscribe((error) => (this.estimateError = error));

    this.changeStopEstimate$.pipe(takeUntil(this.destroy$)).subscribe((estimate) => {
      this.currentEstimate = estimate;
      this.paymentAmountLabel = estimate
        ? new Intl.NumberFormat('th-TH', {
            style: 'currency',
            currency: 'THB',
            maximumFractionDigits: 2,
          }).format(Math.abs(toAmountNumber(estimate.netAmount)))
        : '';
    });

    this.store
      .pipe(select(selectChangeStopSubmitting), takeUntil(this.destroy$))
      .subscribe((submitting) => (this.submitting = submitting));

    this.store
      .pipe(select(selectChangeStopConfirmError), takeUntil(this.destroy$))
      .subscribe((error) => (this.confirmError = error));

    this.store
      .pipe(select(selectChangeStopPendingPayment), takeUntil(this.destroy$))
      .subscribe((pending) => {
        if (pending) {
          this.step = 'payment';
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  close(): void {
    if (this.step === 'payment') {
      this.store.dispatch(changeStopAbandoned());
    } else {
      this.store.dispatch(closeChangeStopDialog());
    }
    this.closed.emit();
  }

  onRetry(): void {
    this.store.dispatch(openChangeStopDialog({ bookingId: this.bookingId }));
  }

  onPickupSelected(stop: RouteStop): void {
    this.selectedPickupSlug = stop.slug;
  }

  onPickupConfirmed(): void {
    if (!this.selectedPickupSlug) {
      return;
    }
    // Picking a (new) pickup invalidates any drop-off chosen against the
    // previous pickup.
    this.selectedDropoffSlug = null;
    this.segmentError = null;
    this.step = 'dropoff';
  }

  onBackToPickup(): void {
    this.step = 'pickup';
  }

  onDropoffSelected(stop: RouteStop): void {
    this.selectedDropoffSlug = stop.slug;
    this.segmentError = null;
  }

  onDropoffConfirmed(): void {
    if (!this.selectedPickupSlug || !this.selectedDropoffSlug) {
      return;
    }

    const pickupStop = this.pickupStops.find((s) => s.slug === this.selectedPickupSlug);
    const dropoffStop = this.dropoffStops.find((s) => s.slug === this.selectedDropoffSlug);
    if (!pickupStop || !dropoffStop) {
      return;
    }

    // Client-side segment guard BEFORE any network call.
    if (!(pickupStop.order < dropoffStop.order)) {
      this.segmentError = this.translate.instant('MY_BOOKINGS.CHANGE_STOP.ERROR.INVALID_SEGMENT');
      return;
    }

    if (
      this.selectedPickupSlug === this.currentFromStopCode() &&
      this.selectedDropoffSlug === this.currentToStopCode()
    ) {
      this.segmentError = this.translate.instant('MY_BOOKINGS.CHANGE_STOP.ERROR.SAME_SEGMENT');
      return;
    }

    this.segmentError = null;
    this.step = 'estimate';
    this.pendingEstimateDispatch = true;
    this.tryDispatchEstimate();
  }

  onEstimateBack(): void {
    this.step = 'dropoff';
  }

  onEstimateConfirm(): void {
    if (!this.selectedPickupSlug || !this.selectedDropoffSlug || !this.currentEstimate) {
      return;
    }

    const newFromStopId = this.resolveStopId(this.selectedPickupSlug);
    const newToStopId = this.resolveStopId(this.selectedDropoffSlug);
    if (!newFromStopId || !newToStopId || this.tickets.length === 0) {
      return;
    }

    // Current seats unchanged — change-stop never reassigns seats.
    const seatAssignments: Record<number, string> = {};
    for (const ticket of this.tickets) {
      seatAssignments[ticket.ticketId] = ticket.seatNumber;
    }

    this.store.dispatch(
      confirmChangeStop({
        bookingId: this.bookingId,
        newFromStopId,
        newToStopId,
        seatAssignments,
        clientNetAmount: toAmountNumber(this.currentEstimate.netAmount),
      })
    );
  }

  onPaymentTabChange(tab: PaymentTab): void {
    this.paymentTab = tab;
  }

  onPaymentBack(): void {
    this.close();
  }

  onPaymentCompleted(): void {
    this.store.dispatch(changeStopSettled());
  }

  private tryDispatchEstimate(): void {
    if (!this.pendingEstimateDispatch || !this.selectedPickupSlug || !this.selectedDropoffSlug) {
      return;
    }

    const newFromStopId = this.resolveStopId(this.selectedPickupSlug);
    const newToStopId = this.resolveStopId(this.selectedDropoffSlug);
    if (!newFromStopId || !newToStopId || this.tickets.length === 0) {
      // Stops lookup / tickets still resolving in the background — retried
      // automatically the next time this method runs (design-system §6:
      // optimistic open, no blank overlay while background data loads).
      return;
    }

    this.pendingEstimateDispatch = false;
    this.store.dispatch(
      loadChangeStopEstimate({
        bookingId: this.bookingId,
        newFromStopId,
        newToStopId,
        seats: this.tickets.map((t) => t.seatNumber),
      })
    );
  }

  private resolveStopId(slug: string): number | null {
    return this.stopsLookup[slug] ?? null;
  }

  private currentFromStopCode(): string {
    return this.booking?.bookingSchedules?.[0]?.fromStop?.code ?? '';
  }

  private currentToStopCode(): string {
    return this.booking?.bookingSchedules?.[0]?.toStop?.code ?? '';
  }
}
