import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subject, takeUntil } from 'rxjs';
import { BookingService } from '../../../../services/booking/booking.service';
import { ETicketCardData } from '../../../../shared/interfaces/e-ticket.interface';
import {
  ETicketLocale,
  mapBookingTicketsToCard,
} from '../../../../shared/lib/booking-ticket-view';

/**
 * Shows a booking's e-ticket in a modal (same card as the booking flow, minus
 * the stepper). Loads the ticket from the API on `bookingId` change.
 */
@Component({
  selector: 'app-my-booking-ticket-modal',
  templateUrl: './my-booking-ticket-modal.component.html',
  styleUrl: './my-booking-ticket-modal.component.scss',
})
export class MyBookingTicketModalComponent implements OnChanges, OnDestroy {
  @Input() bookingId: number | null = null;
  @Output() readonly closed = new EventEmitter<void>();

  card: ETicketCardData | null = null;
  loading = false;
  error = '';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly bookingService: BookingService,
    private readonly translate: TranslateService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['bookingId'] && this.bookingId && this.bookingId > 0) {
      this.loadTicket(this.bookingId);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  retry(): void {
    if (this.bookingId) {
      this.loadTicket(this.bookingId);
    }
  }

  private loadTicket(bookingId: number): void {
    this.loading = true;
    this.error = '';
    this.card = null;

    this.bookingService
      .getBookingTickets(bookingId, true)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.loading = false;
          if (
            (response?.code === 200 || response?.code === 201) &&
            response?.data
          ) {
            this.card = mapBookingTicketsToCard(response.data, this.currentLocale());
          } else {
            this.error = this.translate.instant('MY_BOOKINGS.TICKET_MODAL.LOAD_FAILED');
          }
        },
        error: () => {
          this.loading = false;
          this.error = this.translate.instant('MY_BOOKINGS.TICKET_MODAL.LOAD_FAILED');
        },
      });
  }

  private currentLocale(): ETicketLocale {
    const value = (this.translate.currentLang || '').toLowerCase();
    if (value.startsWith('th')) {
      return 'th';
    }
    if (value.startsWith('zh')) {
      return 'zh';
    }
    return 'en';
  }
}
