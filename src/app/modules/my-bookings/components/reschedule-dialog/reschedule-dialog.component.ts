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
import dayjs from 'dayjs';
import {
  MyBookingDto,
  RESCHEDULE_WINDOW_HOURS,
  SupportedLocale,
  getStopLabel,
  toAmountNumber,
} from '../../../../shared/interfaces/my-booking.interface';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';
import {
  RESCHEDULE_MAX_DAYS_AHEAD,
  RescheduleEstimate,
  RescheduleOption,
  RescheduleSeatAssignment,
} from '../../../../shared/interfaces/reschedule.interface';
import {
  closeRescheduleDialog,
  confirmReschedule,
  loadRescheduleEstimate,
  loadRescheduleOptions,
  openRescheduleDialog,
  rescheduleAbandoned,
  rescheduleSettled,
} from '../../store/my-bookings.action';
import {
  selectReschedulePendingPayment,
  selectRescheduleBooking,
  selectRescheduleConfirmError,
  selectRescheduleConfirmErrorCode,
  selectRescheduleEstimate,
  selectRescheduleEstimateError,
  selectRescheduleEstimateLoading,
  selectRescheduleOptions,
  selectRescheduleOptionsError,
  selectRescheduleOptionsLoading,
  selectRescheduleSubmitting,
  selectRescheduleTickets,
  selectRescheduleTicketsLoading,
  selectStopsLookup,
} from '../../store/my-bookings.selector';

type RescheduleStep = 'date' | 'options' | 'estimate' | 'payment';
type PaymentTab = 'creditcard' | 'qrcode';

/**
 * Smart dialog hosting the whole reschedule flow: date → options → estimate
 * → (payment, only if a top-up is owed). Reuses the hand-rolled modal chrome
 * (backdrop + role="dialog" + top-right × + Escape) from
 * `my-booking-ticket-modal`, not PrimeNG's p-dialog (unused anywhere in the
 * customer shell). See docs/adr for the flow-level decisions.
 */
@Component({
  selector: 'app-reschedule-dialog',
  templateUrl: './reschedule-dialog.component.html',
  styleUrl: './reschedule-dialog.component.scss',
})
export class RescheduleDialogComponent implements OnInit, OnDestroy {
  @Input() bookingId!: number;
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly rescheduled = new EventEmitter<void>();

  step: RescheduleStep = 'date';
  selectedDate: Date | null = null;
  selectedOption: RescheduleOption | null = null;
  paymentTab: PaymentTab = 'creditcard';

  minDate: Date | null = null;
  maxDate: Date | null = null;

  rescheduleOptions: RescheduleOption[] = [];
  rescheduleOptionsLoading = false;
  rescheduleOptionsError: string | null = null;

  readonly rescheduleEstimate$: Observable<RescheduleEstimate | null>;
  estimateLoading = false;
  /**
   * Error from loading the estimate itself (a failed `loadRescheduleEstimate`),
   * distinct from `confirmError` (a failed confirm/execute). Without surfacing
   * this the estimate step dead-ends silently — spinner clears, `estimate`
   * stays null, no message, Confirm disabled — reproducing OBRS-186 via any
   * estimate-load failure the backend own-schedule filter doesn't cover
   * (trip fills between options→estimate, validation, transient 5xx). OBRS-345.
   */
  estimateError: string | null = null;
  confirmError: string | null = null;
  submitting = false;
  /** Formatted net amount, shown in the payment step's note. */
  paymentAmountLabel = '';

  private booking: MyBookingDto | null = null;
  private stopsLookup: Record<string, number> = {};
  private tickets: RescheduleSeatAssignment[] = [];
  /** Distinguishes "tickets still resolving in the background" from
   * "loaded, genuinely empty" (OBRS-483) — `tickets.length === 0` alone is
   * ambiguous between the two (a real OPEN-seating ticket has `seatNumber:
   * null`, so it still populates `tickets`; only the LOAD itself tells you
   * whether the array is final). Sourced from the store's own
   * `rescheduleTicketsLoading`, reset to `true` on `openRescheduleDialog`. */
  private ticketsLoading = true;
  private currentEstimateNetAmount: number | null = null;
  private pendingOptionSelection: RescheduleOption | null = null;
  private selectedDateIso: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: Store,
    private readonly translate: TranslateService
  ) {
    this.rescheduleEstimate$ = this.store.pipe(select(selectRescheduleEstimate));
  }

  /**
   * The booking's CURRENT trip (route + departure), shown at the top of every
   * step so the traveller always sees what they are moving *from* while they
   * pick the new trip (OBRS-189). Null until the booking resolves.
   */
  get originalTrip(): { fromLabel: string; toLabel: string; departure: string } | null {
    const leg = this.booking?.bookingSchedules?.[0];
    if (!leg) {
      return null;
    }
    const locale = this.normalizeLocale(this.translate.currentLang);
    return {
      fromLabel: getStopLabel(leg.fromStop, locale),
      toLabel: getStopLabel(leg.toStop, locale),
      departure: formatDisplayDateTime(leg.departureDateTime, locale),
    };
  }

  /**
   * The NEW trip once a candidate is picked (OBRS-189): same stops (reschedule
   * keeps the route — only date/time change) with the selected option's
   * departure. Null until an option is selected, so it only shows from the
   * estimate step onward, paired with `originalTrip` as a "from → to" view.
   */
  get newTrip(): { fromLabel: string; toLabel: string; departure: string } | null {
    const leg = this.booking?.bookingSchedules?.[0];
    if (!leg || !this.selectedOption) {
      return null;
    }
    const locale = this.normalizeLocale(this.translate.currentLang);
    return {
      fromLabel: getStopLabel(leg.fromStop, locale),
      toLabel: getStopLabel(leg.toStop, locale),
      departure: formatDisplayDateTime(this.selectedOption.departureDateTime, locale),
    };
  }

  private normalizeLocale(locale: string | null | undefined): SupportedLocale {
    return locale === 'en' || locale === 'zh' ? locale : 'th';
  }

  ngOnInit(): void {
    this.store.dispatch(openRescheduleDialog({ bookingId: this.bookingId }));

    combineLatest([
      this.store.pipe(select(selectRescheduleBooking)),
      this.store.pipe(select(selectStopsLookup)),
      this.store.pipe(select(selectRescheduleTickets)),
      this.store.pipe(select(selectRescheduleTicketsLoading)),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([booking, stopsLookup, tickets, ticketsLoading]) => {
        this.booking = booking;
        this.stopsLookup = stopsLookup;
        this.tickets = tickets;
        this.ticketsLoading = ticketsLoading;
        if (booking) {
          this.computeDateBounds(booking);
        }
        this.tryDispatchEstimate();
      });

    this.store
      .pipe(select(selectRescheduleOptions), takeUntil(this.destroy$))
      .subscribe((options) => (this.rescheduleOptions = options));
    this.store
      .pipe(select(selectRescheduleOptionsLoading), takeUntil(this.destroy$))
      .subscribe((loading) => (this.rescheduleOptionsLoading = loading));
    this.store
      .pipe(select(selectRescheduleOptionsError), takeUntil(this.destroy$))
      .subscribe((error) => (this.rescheduleOptionsError = error));

    this.rescheduleEstimate$.pipe(takeUntil(this.destroy$)).subscribe((estimate) => {
      this.currentEstimateNetAmount = estimate ? toAmountNumber(estimate.netAmount) : null;
      this.paymentAmountLabel = estimate
        ? new Intl.NumberFormat('th-TH', {
            style: 'currency',
            currency: 'THB',
            maximumFractionDigits: 2,
          }).format(Math.abs(toAmountNumber(estimate.netAmount)))
        : '';
    });
    this.store
      .pipe(select(selectRescheduleEstimateLoading), takeUntil(this.destroy$))
      .subscribe((loading) => (this.estimateLoading = loading));

    this.store
      .pipe(select(selectRescheduleEstimateError), takeUntil(this.destroy$))
      .subscribe((error) => (this.estimateError = error));

    this.store
      .pipe(select(selectRescheduleSubmitting), takeUntil(this.destroy$))
      .subscribe((submitting) => (this.submitting = submitting));

    this.store
      .pipe(select(selectRescheduleConfirmError), takeUntil(this.destroy$))
      .subscribe((error) => (this.confirmError = error));

    this.store
      .pipe(select(selectRescheduleConfirmErrorCode), takeUntil(this.destroy$))
      .subscribe((errorCode) => {
        if (errorCode === 'RESCHEDULE_ERROR_NO_SEATS') {
          // Bounce back to the (still-valid, already-loaded) options list.
          // Deliberately do NOT re-dispatch loadRescheduleOptions here: that
          // reducer case resets rescheduleOptionsLoading=true and
          // rescheduleOptionsError=null, which would both wipe the NO_SEATS
          // message before it renders and re-arm the loading spinner for a
          // reload nothing actually needs (the candidate that failed is the
          // only stale entry; the rest of the list is still accurate, and
          // the booking itself is unchanged server-side). The confirm error
          // is surfaced via rescheduleConfirmError/-ErrorCode instead, a
          // channel this reducer case never touches, so it survives.
          this.step = 'options';
          this.selectedOption = null;
        }
      });

    this.store
      .pipe(select(selectReschedulePendingPayment), takeUntil(this.destroy$))
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
      this.store.dispatch(rescheduleAbandoned());
    } else {
      this.store.dispatch(closeRescheduleDialog());
    }
    this.closed.emit();
  }

  onDateSelected(isoDate: string): void {
    this.selectedDateIso = isoDate;
    this.selectedOption = null;
    this.step = 'options';
    this.store.dispatch(loadRescheduleOptions({ bookingId: this.bookingId, date: isoDate }));
  }

  onOptionSelect(option: RescheduleOption): void {
    this.selectedOption = option;
    this.pendingOptionSelection = option;
    this.step = 'estimate';
    // Picking a (new) candidate supersedes any prior confirm failure (e.g.
    // NO_SEATS) — clear the local copy so its banner doesn't linger once the
    // traveler has acted on it. The store's own copy is cleared for real on
    // the next confirmReschedule dispatch (see the reducer).
    this.confirmError = null;
    this.tryDispatchEstimate();
  }

  onEstimateBack(): void {
    this.step = 'options';
  }

  onConfirm(): void {
    if (!this.booking || !this.selectedOption || this.currentEstimateNetAmount === null) {
      return;
    }

    const fromStopId = this.resolveStopId(this.fromStopCode());
    const toStopId = this.resolveStopId(this.toStopCode());
    if (!fromStopId || !toStopId || this.ticketsLoading || this.tickets.length === 0) {
      return;
    }

    const seatAssignments: Record<number, string | null> = {};
    for (const ticket of this.tickets) {
      seatAssignments[ticket.ticketId] = ticket.seatNumber;
    }

    this.store.dispatch(
      confirmReschedule({
        bookingId: this.bookingId,
        newScheduleId: this.selectedOption.scheduleId,
        newFromStopId: fromStopId,
        newToStopId: toStopId,
        seatAssignments,
        clientNetAmount: this.currentEstimateNetAmount,
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
    this.store.dispatch(rescheduleSettled());
    this.rescheduled.emit();
  }

  private tryDispatchEstimate(): void {
    if (!this.pendingOptionSelection || !this.booking) {
      return;
    }

    const fromStopId = this.resolveStopId(this.fromStopCode());
    const toStopId = this.resolveStopId(this.toStopCode());
    if (!fromStopId || !toStopId || this.ticketsLoading) {
      // Stops lookup / tickets still resolving in the background — retried
      // automatically the next time this method runs (design-system §6:
      // optimistic open, no blank overlay while background data loads).
      // OBRS-483: gated on `ticketsLoading` (the store's own load flag), NOT
      // `tickets.length === 0` — a real OPEN-seating ticket has `seatNumber:
      // null` but still populates the array, so length alone can't tell
      // "still loading" apart from "loaded, genuinely empty".
      return;
    }
    if (this.tickets.length === 0) {
      // Loaded and genuinely empty — no confirmed ticket to reschedule (a
      // reschedule-eligible, confirmed booking always has at least one;
      // this is a data-integrity edge case, not the OPEN-seating case
      // above). Nothing to dispatch.
      return;
    }

    const option = this.pendingOptionSelection;
    this.pendingOptionSelection = null;

    this.store.dispatch(
      loadRescheduleEstimate({
        bookingId: this.bookingId,
        newScheduleId: option.scheduleId,
        newFromStopId: fromStopId,
        newToStopId: toStopId,
        // `null` under OPEN seating — the GET query param can't carry a
        // null value; see the matching comment in
        // `RescheduleEffect.confirmReschedule$` for why an empty-string
        // placeholder (count preserved) is safe here.
        seats: this.tickets.map((t) => t.seatNumber ?? ''),
      })
    );
  }

  // proto-key-ok: ADR-0028 names this site by name -- `code` is a server-enumerated
  // stop code, so reaching Object.prototype needs a stop literally coded "constructor".
  private resolveStopId(code: string): number | null {
    return this.stopsLookup[code] ?? null;
  }

  private fromStopCode(): string {
    return this.booking?.bookingSchedules?.[0]?.fromStop?.code ?? '';
  }

  private toStopCode(): string {
    return this.booking?.bookingSchedules?.[0]?.toStop?.code ?? '';
  }

  private computeDateBounds(booking: MyBookingDto): void {
    const departure = booking.bookingSchedules?.[0]?.departureDateTime;
    const original = dayjs(departure);
    const now = dayjs();

    const earliestByWindow = now.add(RESCHEDULE_WINDOW_HOURS, 'hour');
    this.minDate = earliestByWindow.startOf('day').toDate();

    const latestByOriginal = (original.isValid() ? original : now).add(
      RESCHEDULE_MAX_DAYS_AHEAD,
      'day'
    );
    this.maxDate = latestByOriginal.endOf('day').toDate();
  }
}
