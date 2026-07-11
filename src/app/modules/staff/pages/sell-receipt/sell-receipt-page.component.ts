import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject, catchError, forkJoin, map, of, takeUntil } from 'rxjs';
import QRCode from 'qrcode';
import { AuthService } from '../../../../auth/auth.service';
import { BookingService } from '../../../../services/booking/booking.service';
import { PaymentService } from '../../../../services/payment/payment.service';
import { TicketService } from '../../../../services/ticket/ticket.service';
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
  passengerName: string;
  seat: string;
  qrDataUrl: string;
  qrUnavailable: boolean;
}

@Component({
  selector: 'app-sell-receipt-page',
  templateUrl: './sell-receipt-page.component.html',
  styleUrl: './sell-receipt-page.component.scss',
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
  /** Keyed by ticketId — survives `tickets` being rebuilt on a locale-driven
   * refetch, same guard pattern as ETicketComponent (OBRS-96). */
  private readonly qrStateByTicketId = new Map<
    number,
    { qrDataUrl: string; qrUnavailable: boolean }
  >();
  private readonly fetchedTicketIds = new Set<number>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly bookingService: BookingService,
    private readonly paymentService: PaymentService,
    private readonly ticketService: TicketService,
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
    this.routeLabel =
      fromLabel && toLabel ? `${fromLabel} - ${toLabel}` : fromLabel || toLabel || '-';

    this.departureDisplay = formatDisplayDateTime(journey?.departureDateTime, locale);
    this.arrivalDisplay = formatDisplayDateTime(journey?.arrivalDateTime, locale);

    const tickets = journey?.tickets ?? [];
    this.tickets = tickets.map((ticket) => {
      const ticketId = Number.isFinite(ticket.id) && ticket.id > 0 ? ticket.id : null;
      const qrState = ticketId !== null ? this.qrStateByTicketId.get(ticketId) : undefined;
      return {
        ticketId,
        ticketNumber: ticket.ticketNumber?.trim() || '-',
        passengerName: ticket.passengerName?.trim() || '-',
        seat: ticket.seatNumber?.trim() || '-',
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
   * OBRS-96 reuse: fetch each confirmed ticket's boarding-token and render it
   * as its own QR — identical library (`qrcode`) and rendering options to
   * `ETicketComponent.fetchBoardingTokensForPassengers` / rendering used on
   * the customer e-ticket page, so there is exactly one QR pipeline in the
   * codebase. `catchError` per ticket isolates a single 409/404 (e.g. a
   * cancelled leg) from blanking the rest of the receipt.
   */
  private fetchBoardingTokens(): void {
    const pendingTicketIds = this.tickets
      .map((t) => t.ticketId)
      .filter((id): id is number => id !== null && !this.fetchedTicketIds.has(id));

    if (pendingTicketIds.length === 0) {
      return;
    }
    pendingTicketIds.forEach((id) => this.fetchedTicketIds.add(id));

    forkJoin(
      pendingTicketIds.map((ticketId) =>
        this.ticketService.getBoardingToken(ticketId, true).pipe(
          map((response) => ({
            ticketId,
            boardingToken: response?.data?.boardingToken?.trim() ?? '',
          })),
          catchError(() => of({ ticketId, boardingToken: '' }))
        )
      )
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe((results) => {
        void this.applyBoardingTokenResults(results);
      });
  }

  private async applyBoardingTokenResults(
    results: { ticketId: number; boardingToken: string }[]
  ): Promise<void> {
    for (const result of results) {
      if (!result.boardingToken) {
        this.qrStateByTicketId.set(result.ticketId, { qrDataUrl: '', qrUnavailable: true });
        continue;
      }

      try {
        const qrDataUrl = await QRCode.toDataURL(result.boardingToken, {
          width: 140,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        this.qrStateByTicketId.set(result.ticketId, { qrDataUrl, qrUnavailable: false });
      } catch {
        this.qrStateByTicketId.set(result.ticketId, { qrDataUrl: '', qrUnavailable: true });
      }
    }

    this.tickets = this.tickets.map((ticket) => {
      if (ticket.ticketId === null) {
        return ticket;
      }
      const qrState = this.qrStateByTicketId.get(ticket.ticketId);
      return qrState ? { ...ticket, ...qrState } : ticket;
    });
  }
}
