import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import html2canvas from 'html2canvas';
import { TicketLeg, TicketPassenger } from '../../interfaces/e-ticket.interface';
import { buildMapsDirectionsUrl } from '../../lib/maps-directions-url';
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
 */
@Component({
  selector: 'app-e-ticket-card',
  templateUrl: './e-ticket-card.component.html',
  styleUrl: './e-ticket-card.component.scss',
  // Component-scoped so its resolved (short-lived!) boarding tokens die with
  // this card instance — see the class comment on BoardingQrService.
  providers: [BoardingQrService],
})
export class ETicketCardComponent implements OnChanges {
  @ViewChild('ticketPaper') private ticketPaper?: ElementRef<HTMLElement>;

  @Input() bookingNumber = '-';
  @Input() ticketNumber = '-';
  @Input() legs: TicketLeg[] = [];
  @Input() paymentDate = '-';
  @Input() totalAmount = '0.00';
  @Input() passengers: TicketPassenger[] = [];
  @Input() booker: TicketPassenger | null = null;

  /** What the template renders — `passengers` with each row's resolved QR
   *  merged in. Never mutates the `@Input()` array. */
  passengerRows: TicketPassengerRow[] = [];
  isDownloadingTicket = false;

  constructor(private readonly boardingQrService: BoardingQrService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['passengers']) {
      // Seed synchronously from whatever the service already resolved, so a
      // rebuilt `passengers` array (e.g. the modal re-mapping on a locale
      // switch) doesn't flash blank while the dedupe guard skips re-fetching.
      this.applyBoardingQrStates();
      this.boardingQrService.fetchBoardingTokens(
        this.passengerRows.map((row) => row.ticketId),
        () => this.applyBoardingQrStates(),
        // The modal renders its own state; a global "Loading…" dialog per
        // ticket on top of an already-rendered ticket is noise. The per-row
        // placeholder is the loading indicator.
        true
      );
    }
  }

  /** Re-derive every row from the service's current state rather than mutating
   *  rows in place, so a stray re-render always reflects the latest result. */
  private applyBoardingQrStates(): void {
    this.passengerRows = (this.passengers ?? []).map((passenger) => {
      const qrState =
        passenger.ticketId !== null
          ? this.boardingQrService.getState(passenger.ticketId)
          : undefined;
      return {
        ...passenger,
        qrDataUrl: qrState?.qrDataUrl ?? '',
        qrUnavailable: qrState?.qrUnavailable ?? false,
      };
    });
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
