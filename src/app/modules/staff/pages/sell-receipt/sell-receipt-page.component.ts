import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject, catchError, forkJoin, of, takeUntil } from 'rxjs';
import { AuthService } from '../../../../auth/auth.service';
import { BookingService } from '../../../../services/booking/booking.service';
import { PaymentService } from '../../../../services/payment/payment.service';
import { BoardingQrService } from '../../../../shared/services/boarding-qr.service';
import {
  BookingTicketJourney,
  BookingTicketsData,
} from '../../../../shared/interfaces/booking-ticket.interface';
import { PaymentByBookingIdResponse, PaymentTransaction } from '../../../../shared/interfaces/payment.interface';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';

/** One printable ticket row: seat + passenger + this ticket's own boarding QR
 * (OBRS-96 boarding-token, reused verbatim — see `fetchBoardingTokens` below). */
interface ReceiptTicketRow {
  ticketId: number | null;
  ticketNumber: string;
  passengerTitle: string | null;
  passengerName: string;
  seat: string;
  // OBRS-324 (Epic OBRS-318 open seating, 318-d): true when this ticket has no
  // seat_number (an OPEN-seating walk-in sale) — mirrors the OBRS-325
  // `leg.isOpenSeating` derivation on the e-ticket card, one ticket at a time.
  seatOpen: boolean;
  qrDataUrl: string;
  qrUnavailable: boolean;
}

@Component({
    selector: 'app-sell-receipt-page',
    templateUrl: './sell-receipt-page.component.html',
    styleUrl: './sell-receipt-page.component.scss',
    // Component-scoped so its dedupe/cache state doesn't leak across page
    // visits — see the class comment on BoardingQrService.
    providers: [BoardingQrService],
    standalone: false
})
export class SellReceiptPageComponent implements OnInit, OnDestroy {
  protected isLoading = true;
  protected loadError = false;

  protected bookingNumber = '-';
  protected routeLabel = '-';
  protected departureDisplay = '-';
  protected arrivalDisplay = '-';
  protected paymentMethodLabel = '-';
  protected amountPaid = '0.00';
  protected paidAtDisplay = '-';
  protected tickets: ReceiptTicketRow[] = [];
  protected readonly soldByUsername: string;

  private bookingId: number | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly bookingService: BookingService,
    private readonly paymentService: PaymentService,
    private readonly boardingQrService: BoardingQrService,
    private readonly translate: TranslateService,
    private readonly authService: AuthService
  ) {
    this.soldByUsername = this.authService.getUsername() ?? '-';
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const id = Number(params.get('bookingId'));
      this.bookingId = Number.isFinite(id) && id > 0 ? id : null;
      this.load();
    });

    // Stop/route labels are server-localized (Accept-Language) and cached in
    // component state on fetch — the same reason sell-page.component.ts
    // re-fetches on a language switch (they don't re-render on their own).
    this.translate.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.load());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected trackByIndex(index: number): number {
    return index;
  }

  protected print(): void {
    window.print();
  }

  protected backToSell(): void {
    void this.router.navigate(['/staff/sell']);
  }

  protected reload(): void {
    this.load();
  }

  private load(): void {
    if (!this.bookingId) {
      this.loadError = true;
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.loadError = false;
    const bookingId = this.bookingId;

    forkJoin({
      // Both calls opt out of the global "Loading..." dialog — this page shows
      // its own inline spinner (isLoading), so letting the interceptor pop the
      // shared modal on top produced a double loading indicator.
      tickets: this.bookingService
        .getBookingTickets(bookingId, true)
        .pipe(catchError(() => of(null))),
      payments: this.paymentService
        .getBookingPayments(bookingId, { skipGlobalLoadingAlert: true })
        .pipe(catchError(() => of(null))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ tickets, payments }) => {
        if (!tickets?.data) {
          this.loadError = true;
          this.isLoading = false;
          return;
        }

        this.applyTicketData(tickets.data);
        if (payments?.data) {
          this.applyPaymentData(payments.data);
        }

        this.fetchBoardingTokens();
        this.isLoading = false;
      });
  }

  private applyTicketData(data: BookingTicketsData): void {
    const locale = this.currentLocale;
    this.bookingNumber = data.bookingNumber?.trim() || '-';

    // Walk-in sales are always one-way today (sell-page.component.ts hardcodes
    // bookingType: 'one_way') — the first journey is the whole trip.
    const journey: BookingTicketJourney | null = data.journeys?.[0] ?? null;

    const fromLabel = journey?.fromStop?.label?.trim() ?? '';
    const toLabel = journey?.toStop?.label?.trim() ?? '';
    // OBRS-1249: the route's own name first — this is the same response, and
    // the same field, the customer's e-ticket reads (OBRS-1219). A walk-in
    // buyer holding this slip and the e-ticket of the trip they were just sold
    // should not find the two naming the trip differently. Falls back to the
    // stop pair for a route with no name seeded, exactly as before.
    const routeName = journey?.routeLabel?.trim();
    this.routeLabel =
      routeName ||
      (fromLabel && toLabel ? `${fromLabel} - ${toLabel}` : fromLabel || toLabel || '-');

    this.departureDisplay = formatDisplayDateTime(journey?.departureDateTime, locale);
    this.arrivalDisplay = formatDisplayDateTime(journey?.arrivalDateTime, locale);

    const tickets = journey?.tickets ?? [];
    this.tickets = tickets.map((ticket) => {
      const ticketId = Number.isFinite(ticket.id) && ticket.id > 0 ? ticket.id : null;
      const qrState = ticketId !== null ? this.boardingQrService.getState(ticketId) : undefined;
      return {
        ticketId,
        ticketNumber: ticket.ticketNumber?.trim() || '-',
        // OBRS-1232: carried as a code, composed with the name by the `titleLabel` pipe in the
        // template - not joined here, or a language switch would leave the old word on screen.
        passengerTitle: ticket.passengerTitle ?? null,
        passengerName: ticket.passengerName?.trim() || '-',
        seat: ticket.seatNumber?.trim() || '-',
        seatOpen: !ticket.seatNumber?.trim(),
        qrDataUrl: qrState?.qrDataUrl ?? '',
        qrUnavailable: qrState?.qrUnavailable ?? false,
      };
    });
  }

  private applyPaymentData(data: PaymentByBookingIdResponse): void {
    this.amountPaid = this.formatAmount(data.paymentSummary?.paidAmount);

    // Most recent transaction first (per the API contract) — the walk-in cash
    // charge is what staff sold, so prefer a paid transaction over a stale
    // pending/failed one if present.
    const transaction: PaymentTransaction | undefined =
      data.transactions?.find((t) => t.status === 'paid') ?? data.transactions?.[0];

    this.paymentMethodLabel = this.resolvePaymentMethodLabel(transaction?.paymentMethod);
    this.paidAtDisplay = formatDisplayDateTime(transaction?.paidAt, this.currentLocale);
  }

  private resolvePaymentMethodLabel(method: string | undefined): string {
    if (method === 'cash') {
      return this.translate.instant('STAFF.SELL.PAYMENT_CASH');
    }
    return method ? this.translate.instant('STAFF.SELL_RECEIPT.PAYMENT_METHOD_OTHER') : '-';
  }

  private formatAmount(value: number | string | null | undefined): string {
    const parsed = typeof value === 'string' ? parseFloat(value) : value;
    return Number.isFinite(parsed) ? Number(parsed).toFixed(2) : '0.00';
  }

  private get currentLocale(): string {
    return String(this.translate.currentLang || this.translate.getDefaultLang() || 'th').toLowerCase();
  }

  /**
   * OBRS-96 / OBRS-221: fetch each confirmed ticket's boarding-token and
   * render it as its own QR via the shared `BoardingQrService` — the same
   * instance-scoped dedupe/isolation/rendering pipeline used by
   * `ETicketComponent.fetchBoardingTokensForPassengers` on the customer
   * e-ticket page, so there is exactly one QR pipeline in the codebase.
   * `skipGlobalLoadingAlert: true` keeps this page's own inline spinner from
   * doubling up with the global loading dialog (OBRS-195).
   */
  private fetchBoardingTokens(): void {
    const ticketIds = this.tickets.map((t) => t.ticketId);

    this.boardingQrService.fetchBoardingTokens(
      ticketIds,
      () => this.applyBoardingQrStates(),
      true
    );
  }

  private applyBoardingQrStates(): void {
    this.tickets = this.tickets.map((ticket) => {
      if (ticket.ticketId === null) {
        return ticket;
      }
      const qrState = this.boardingQrService.getState(ticket.ticketId);
      return qrState ? { ...ticket, ...qrState } : ticket;
    });
  }
}
