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
import { combineLatest, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import dayjs from 'dayjs';
import {
  MyBookingDto,
  RESCHEDULE_WINDOW_HOURS,
  toAmountNumber,
} from '../../../../shared/interfaces/my-booking.interface';
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
  selectRescheduleEstimateLoading,
  selectRescheduleOptions,
  selectRescheduleOptionsError,
  selectRescheduleOptionsLoading,
  selectRescheduleSubmitting,
  selectRescheduleTickets,
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
  confirmError: string | null = null;
  submitting = false;
  /** Formatted net amount, shown in the payment step's note. */
  paymentAmountLabel = '';

  private booking: MyBookingDto | null = null;
  private stopsLookup: Record<string, number> = {};
  private tickets: RescheduleSeatAssignment[] = [];
  private currentEstimateNetAmount: number | null = null;
  private pendingOptionSelection: RescheduleOption | null = null;
  private selectedDateIso: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly store: Store) {
    this.rescheduleEstimate$ = this.store.pipe(select(selectRescheduleEstimate));
  }

  ngOnInit(): void {
    this.store.dispatch(openRescheduleDialog({ bookingId: this.bookingId }));

    combineLatest([
      this.store.pipe(select(selectRescheduleBooking)),
      this.store.pipe(select(selectStopsLookup)),
      this.store.pipe(select(selectRescheduleTickets)),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([booking, stopsLookup, tickets]) => {
        this.booking = booking;
        this.stopsLookup = stopsLookup;
        this.tickets = tickets;
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
      .pipe(select(selectRescheduleSubmitting), takeUntil(this.destroy$))
      .subscribe((submitting) => (this.submitting = submitting));

    this.store
      .pipe(select(selectRescheduleConfirmError), takeUntil(this.destroy$))
      .subscribe((error) => (this.confirmError = error));

    this.store
      .pipe(select(selectRescheduleConfirmErrorCode), takeUntil(this.destroy$))
      .subscribe((errorCode) => {
        if (errorCode === 'RESCHEDULE_ERROR_NO_SEATS') {
          this.step = 'options';
          if (this.selectedDateIso) {
            this.store.dispatch(
              loadRescheduleOptions({ bookingId: this.bookingId, date: this.selectedDateIso })
            );
          }
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
    if (!fromStopId || !toStopId || this.tickets.length === 0) {
      return;
    }

    const seatAssignments: Record<number, string> = {};
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
    if (!fromStopId || !toStopId || this.tickets.length === 0) {
      // Stops lookup / tickets still resolving in the background — retried
      // automatically the next time this method runs (design-system §6:
      // optimistic open, no blank overlay while background data loads).
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
        seats: this.tickets.map((t) => t.seatNumber),
      })
    );
  }

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
