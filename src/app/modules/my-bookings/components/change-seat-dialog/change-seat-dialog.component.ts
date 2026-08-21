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
import { combineLatest, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ChangeSeatAvailability, ChangeSeatTicket } from '../../../../shared/interfaces/change-seat.interface';
import { normalizeSeatAssignments, toSeatLabel } from '../../../../shared/lib/seat-number';
import { isTerminalChangeSeatError } from '../../../../shared/lib/change-seat-error';
import {
  closeChangeSeatDialog,
  confirmChangeSeat,
  loadChangeSeatAvailability,
  openChangeSeatDialog,
} from '../../store/my-bookings.action';
import {
  selectChangeSeatAvailability,
  selectChangeSeatAvailabilityError,
  selectChangeSeatAvailabilityErrorCode,
  selectChangeSeatAvailabilityLoading,
  selectChangeSeatConfirmError,
  selectChangeSeatSubmitting,
  selectChangeSeatTickets,
  selectChangeSeatTicketsError,
  selectChangeSeatTicketsLoading,
} from '../../store/my-bookings.selector';

type ChangeSeatStep = 'loading' | 'map' | 'error';

/**
 * Smart dialog hosting the whole change-seat flow (OBRS-110): a single seat
 * map step (with a ticket stepper for multi-passenger bookings) →
 * confirm. Mirrors `RescheduleDialogComponent`'s modal chrome (hand-rolled
 * backdrop + role="dialog" + top-right × + Escape) rather than introducing
 * `p-dialog` (design-system §6/§12) — see
 * `docs/adr/0009-change-seat-dialog.md`.
 */
@Component({
    selector: 'app-change-seat-dialog',
    templateUrl: './change-seat-dialog.component.html',
    styleUrl: './change-seat-dialog.component.scss',
    standalone: false
})
export class ChangeSeatDialogComponent implements OnInit, OnDestroy {
  @Input() bookingId!: number;
  @Output() readonly closed = new EventEmitter<void>();

  step: ChangeSeatStep = 'loading';

  availability: ChangeSeatAvailability | null = null;
  availabilityError: string | null = null;
  availabilityLoading = false;
  /** True when `availabilityError` came from an errorCode that can never
   * clear on a retry (`open-seating`/`max-count`/`window-closed`/...), so the
   * error step offers Close instead of a Retry that always returns the same
   * 400 (OBRS-1489). */
  availabilityTerminal = false;

  tickets: ChangeSeatTicket[] = [];
  activeTicketIndex = 0;

  /** ticketId → newly picked seat, in the seat-map's LETTER-prefixed label
   * form (`A5`/`B12`, matching what the van/bus components render and
   * emit — see `onSeatPicked`); seeded once from `tickets` (pristine-guarded
   * — a later background re-emit of the same tickets must never clobber an
   * in-progress pick, design-system §11). `ticket.seatNumber` itself is the
   * backend's BARE NUMERIC form, so the seed converts it to a label via
   * `toSeatLabel` (OBRS-171) — otherwise the ticket's current seat never
   * matches a rendered label and its highlight is lost. Converted back to
   * bare digits only at the confirm boundary (`onConfirm`), never stored
   * here — the backend never sees a letter-prefixed seat number. */
  seatAssignments: Record<number, string> = {};
  private seatAssignmentsSeeded = false;

  submitting = false;
  /** Inline confirm-time banner (e.g. SEAT_UNAVAILABLE/NO_SEATS) — survives a
   * background availability re-fetch; see the reducer's
   * `loadChangeSeatAvailability` case (OBRS-83 NO_SEATS lesson). */
  confirmError: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly store: Store) {}

  ngOnInit(): void {
    this.store.dispatch(openChangeSeatDialog({ bookingId: this.bookingId }));

    combineLatest([
      this.store.pipe(select(selectChangeSeatAvailability)),
      this.store.pipe(select(selectChangeSeatAvailabilityLoading)),
      this.store.pipe(select(selectChangeSeatAvailabilityError)),
      this.store.pipe(select(selectChangeSeatTickets)),
      this.store.pipe(select(selectChangeSeatTicketsLoading)),
      this.store.pipe(select(selectChangeSeatTicketsError)),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        ([availability, availabilityLoading, availabilityError, tickets, ticketsLoading, ticketsError]) => {
          this.availability = availability;
          this.availabilityLoading = availabilityLoading;
          this.availabilityError = availabilityError;
          this.tickets = tickets;

          if (!this.seatAssignmentsSeeded && tickets.length > 0 && availability) {
            const seeded: Record<number, string> = {};
            for (const ticket of tickets) {
              seeded[ticket.ticketId] = toSeatLabel(availability.vehicleType, ticket.seatNumber);
            }
            this.seatAssignments = seeded;
            this.seatAssignmentsSeeded = true;
          }

          if (this.step === 'map') {
            // Already on the map — a background re-fetch (e.g. after a
            // non-terminal confirm failure re-loads availability) must never
            // bounce back to the loading step; the banner + refreshed map
            // stay visible (OBRS-83 NO_SEATS lesson: no perpetual spinner,
            // no silently dropped banner).
            return;
          }

          if (availabilityError || ticketsError) {
            this.step = 'error';
            return;
          }

          if (!availabilityLoading && !ticketsLoading && availability && tickets.length > 0) {
            this.step = 'map';
          }
        }
      );

    this.store
      .pipe(select(selectChangeSeatAvailabilityErrorCode), takeUntil(this.destroy$))
      .subscribe((errorCode) => (this.availabilityTerminal = isTerminalChangeSeatError(errorCode)));

    this.store
      .pipe(select(selectChangeSeatSubmitting), takeUntil(this.destroy$))
      .subscribe((submitting) => (this.submitting = submitting));

    this.store
      .pipe(select(selectChangeSeatConfirmError), takeUntil(this.destroy$))
      .subscribe((error) => (this.confirmError = error));
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
    this.store.dispatch(closeChangeSeatDialog());
    this.closed.emit();
  }

  onRetry(): void {
    this.store.dispatch(loadChangeSeatAvailability({ bookingId: this.bookingId }));
  }

  onPrevTicket(): void {
    this.activeTicketIndex = Math.max(0, this.activeTicketIndex - 1);
  }

  onNextTicket(): void {
    this.activeTicketIndex = Math.min(this.tickets.length - 1, this.activeTicketIndex + 1);
  }

  onSeatPicked(seatNumber: string): void {
    const ticket = this.tickets[this.activeTicketIndex];
    if (!ticket) {
      return;
    }
    this.seatAssignments = { ...this.seatAssignments, [ticket.ticketId]: seatNumber };
  }

  onConfirm(): void {
    if (!this.availability || this.tickets.length === 0) {
      return;
    }
    // `seatAssignments` carries the seat-map's letter-prefixed labels
    // (`A5`/`B12`) — the backend's change-seat API takes bare numeric seat
    // numbers (`"1".."N"`), so normalize right at the payload boundary
    // (OBRS-171: the un-normalized label 400'd every confirm with
    // CHANGE_SEAT_ERROR_SEAT_NOT_IN_MAP/CHANGE_SEAT_ERROR_TICKET_MISMATCH).
    this.store.dispatch(
      confirmChangeSeat({
        bookingId: this.bookingId,
        seatAssignments: normalizeSeatAssignments(this.seatAssignments),
      })
    );
  }

  get vehicleType(): string {
    return this.availability?.vehicleType ?? '';
  }

  get availableSeatNumbers(): string[] {
    return (this.availability?.seats ?? []).map((seat) => seat.seatNumber);
  }

  get activeTicket(): ChangeSeatTicket | null {
    return this.tickets[this.activeTicketIndex] ?? null;
  }

  get activePickedSeat(): string {
    const ticket = this.activeTicket;
    if (!ticket) {
      return '';
    }
    return this.seatAssignments[ticket.ticketId] ?? toSeatLabel(this.vehicleType, ticket.seatNumber);
  }

  /** The active ticket's ORIGINAL seat — its `seatNumber` as seeded from the
   * booking, independent of any in-progress pick — feeding
   * `app-change-seat-map`'s `originalSeats` input so the traveler keeps a
   * persistent marker on their original seat even after picking a different
   * one (OBRS-170). Same letter-prefixed normalization as `activePickedSeat`
   * (OBRS-171: `ticket.seatNumber` itself is the backend's bare-numeric
   * form). */
  get originalSeats(): string[] {
    const ticket = this.activeTicket;
    return ticket ? [toSeatLabel(this.vehicleType, ticket.seatNumber)] : [];
  }

  /** Every other ticket's own draft pick, unioned with `occupiedSeatNumbers`
   * — none of these are selectable for the active ticket. `occupiedSeatNumbers`
   * comes straight off the backend's bare-numeric availability response, so it's
   * converted to the seat-map's letter-prefixed label form here too — the van/bus
   * components compare `takenSeats` against their rendered labels with plain
   * string equality (no normalization on their end), so a mixed-form array would
   * silently fail to disable already-occupied seats (OBRS-171). Always a fresh
   * array (never mutates `availability.occupiedSeatNumbers`, design-system
   * §10). */
  get activeTakenSeats(): string[] {
    const vehicleType = this.vehicleType;
    const occupied = (this.availability?.occupiedSeatNumbers ?? []).map((seat) =>
      toSeatLabel(vehicleType, seat)
    );
    const activeTicketId = this.activeTicket?.ticketId;
    const others = this.tickets
      .filter((ticket) => ticket.ticketId !== activeTicketId)
      .map((ticket) => this.seatAssignments[ticket.ticketId] ?? toSeatLabel(vehicleType, ticket.seatNumber));
    return [...occupied, ...others];
  }
}
