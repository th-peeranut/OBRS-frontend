import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import html2canvas from 'html2canvas';
import { TicketLeg, TicketPassenger } from '../../interfaces/e-ticket.interface';
import { buildMapsDirectionsUrl } from '../../lib/maps-directions-url';
import { formatMoney } from '../../lib/money-display';
import {
  BoardingQrService,
  BoardingQrState,
} from '../../services/boarding-qr.service';

/** One rendered passenger row: the input row plus its resolved boarding-QR
 *  state. Kept out of `TicketPassenger` itself so the mapper that produces the
 *  card's inputs (`mapBookingTicketsToCard`) stays pure and free of render
 *  state — the QR is resolved here, where the fetch lives. */
export type TicketPassengerRow = TicketPassenger & BoardingQrState;

/**
 * Presentational e-ticket "paper". Renders the same markup/style as the booking
 * flow's e-ticket page but is data-driven via inputs, so it can also be shown in
 * a modal (e.g. from "My Bookings") without the flow's stepper.
 *
 * OBRS-866 — QR rendering: one QR per PASSENGER, each encoding that ticket's
 * signed boarding token (`GET /tickets/{id}/boarding-token`), delegated to the
 * shared `BoardingQrService`. It used to render a single QR of the
 * human-readable `ticketNumber` string, which the staff scanner rejects
 * (`POST /tickets/boarding-scan` → 400 `INVALID_TICKET_TOKEN`, since the
 * payload must be the JWT), and which could not have boarded more than one of
 * a multi-passenger booking's tickets even if the payload had been right.
 * Do not reintroduce a card-level QR: a boarding pass is per-ticket.
 *
 * OBRS-873 — and per-LEG, not per-booking: the rows come from
 * `TicketLeg.passengers`, so a round trip renders both legs' tickets. The
 * booking-level `passengers` input this replaced could only ever hold one
 * leg's tickets, which left the return leg with no QR at all. Do not
 * reintroduce a flat passenger input either.
 */
@Component({
    selector: 'app-e-ticket-card',
    templateUrl: './e-ticket-card.component.html',
    styleUrl: './e-ticket-card.component.scss',
    // Component-scoped so its resolved (short-lived!) boarding tokens die with
    // this card instance — see the class comment on BoardingQrService.
    providers: [BoardingQrService],
    standalone: false
})
export class ETicketCardComponent implements OnChanges {
  @ViewChild('ticketPaper') private ticketPaper?: ElementRef<HTMLElement>;

  @Input() bookingNumber = '-';
  @Input() ticketNumber = '-';
  @Input() legs: TicketLeg[] = [];
  @Input() paymentDate = '-';
  @Input() totalAmount = '0.00';
  @Input() booker: TicketPassenger | null = null;

  /** OBRS-873: what the template renders — one array of rows PER LEG, index-
   *  aligned with `legs`, each row being that leg's `TicketPassenger` with its
   *  resolved QR merged in. Never mutates the `@Input()` arrays. A one-way
   *  booking has exactly one entry, so it renders the same single list it
   *  always did. */
  legPassengerRows: TicketPassengerRow[][] = [];
  isDownloadingTicket = false;

  constructor(
    private readonly boardingQrService: BoardingQrService,
    private readonly translate: TranslateService
  ) {}

  /** OBRS-1592: the ticket used to print `{{ totalAmount }} {{ TOTAL_UNIT }}`,
   * i.e. the raw `'0.00'`-shaped string with a `บาท` i18n key after it. */
  protected formatMoney(value: number | string | null | undefined): string {
    return formatMoney(value, this.translate.currentLang);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['legs']) {
      // Seed synchronously from whatever the service already resolved, so
      // rebuilt legs (e.g. the modal re-mapping on a locale switch) don't flash
      // blank while the dedupe guard skips re-fetching.
      this.applyBoardingQrStates();
      this.boardingQrService.fetchBoardingTokens(
        // Flattened across legs: one fetch pass covers the return leg's tickets
        // too, and the service dedupes by ticket id anyway.
        this.legPassengerRows.flatMap((rows) => rows.map((row) => row.ticketId)),
        () => this.applyBoardingQrStates(),
        // The modal renders its own state; a global "Loading…" dialog per
        // ticket on top of an already-rendered ticket is noise. The per-row
        // placeholder is the loading indicator.
        true
      );
    }
  }

  /** True while any leg has at least one row — drives the QR hint, which must
   *  not render under an empty passengers block on a booking whose legs carry
   *  no tickets. */
  get hasPassengerRows(): boolean {
    return this.legPassengerRows.some((rows) => rows.length > 0);
  }

  /** True only when TWO legs actually have ticket rows — the condition for
   *  labelling the lists outbound/return. Counts non-empty legs, not legs: a
   *  round trip whose return leg carries no tickets renders one unlabelled
   *  list, same as a one-way, instead of a stray "Return" heading over
   *  nothing. */
  get hasMultiplePassengerLegs(): boolean {
    return this.legPassengerRows.filter((rows) => rows.length > 0).length > 1;
  }

  /** Re-derive every row from the service's current state rather than mutating
   *  rows in place, so a stray re-render always reflects the latest result. */
  private applyBoardingQrStates(): void {
    this.legPassengerRows = (this.legs ?? []).map((leg) =>
      (leg.passengers ?? []).map((passenger) => {
        const qrState =
          passenger.ticketId !== null
            ? this.boardingQrService.getState(passenger.ticketId)
            : undefined;
        return {
          ...passenger,
          qrDataUrl: qrState?.qrDataUrl ?? '',
          qrUnavailable: qrState?.qrUnavailable ?? false,
        };
      })
    );
  }

  trackByIndex(index: number): number {
    return index;
  }

  /** OBRS-269: opens Google Maps Directions from the user's current location to
   *  this leg's own pickup stop — a deep-link only (no Directions API call).
   *  Guarded on both coords being present; the template hides the button
   *  entirely (not disables it) when either is null, so this is a defensive
   *  no-op rather than the primary gate. */
  navigateToPickup(leg: TicketLeg): void {
    if (leg.pickupLatitude == null || leg.pickupLongitude == null) {
      return;
    }
    const url = buildMapsDirectionsUrl(leg.pickupLatitude, leg.pickupLongitude);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async downloadTicketImage(): Promise<void> {
    const ticketElement = this.ticketPaper?.nativeElement;
    if (!ticketElement || this.isDownloadingTicket) {
      return;
    }

    this.isDownloadingTicket = true;

    try {
      const canvas = await html2canvas(ticketElement, {
        backgroundColor: '#ffffff',
        scale: Math.max(window.devicePixelRatio || 1, 2),
        useCORS: true,
        onclone: (clonedDocument) => {
          clonedDocument
            .querySelector('.ticket-paper')
            ?.classList.add('is-exporting');
        },
        ignoreElements: (element) =>
          element.classList.contains('download-btn') ||
          element.classList.contains('ticket-nav-btn'),
      });

      this.triggerTicketDownload(canvas.toDataURL('image/png'));
    } catch (error) {
      console.error('Download e-ticket image failed', error);
    } finally {
      this.isDownloadingTicket = false;
    }
  }

  private triggerTicketDownload(imageUrl: string): void {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = this.getTicketDownloadFilename();
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private getTicketDownloadFilename(): string {
    const rawReference =
      this.ticketNumber !== '-' ? this.ticketNumber : this.bookingNumber;
    const safeReference = String(rawReference || 'ticket')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '-');

    return `e-ticket-${safeReference || 'ticket'}.png`;
  }
}
