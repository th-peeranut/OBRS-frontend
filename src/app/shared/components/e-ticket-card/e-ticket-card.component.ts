import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import {
  BookingService,
  ETicketPdfDownload,
  ETicketPdfError,
} from '../../../services/booking/booking.service';
import { TicketLeg, TicketPassenger } from '../../interfaces/e-ticket.interface';
import { saveBlob } from '../../lib/blob-download';
import { buildMapsDirectionsUrl } from '../../lib/maps-directions-url';
import { formatMoney } from '../../lib/money-display';
import { AlertService } from '../../services/alert.service';
import {
  BoardingQrService,
  BoardingQrState,
} from '../../services/boarding-qr.service';

/**
 * The two lane-2 rejections that are NOT dead ends: the booking-scoped guest
 * token has simply aged out (60-minute TTL, ADR-0123 D6) or been invalidated, so
 * the customer can still prove the booking is theirs with the phone number they
 * booked with. Falling through to that step is what the server copy for these
 * codes already tells them to do.
 */
const GUEST_TOKEN_REJECTED_CODES = [
  'GUEST_PAYMENT_TOKEN_EXPIRED',
  'GUEST_PAYMENT_TOKEN_INVALID',
];

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
  @Input() bookingNumber = '-';

  /**
   * OBRS-1802: which booking the download button asks the backend to render.
   * Booking-scoped, so it cannot live on `legs` (those are per-leg), and it is
   * passed in rather than read from `BookingService.getActiveBookingId()` -
   * that key holds whatever checkout last wrote, which is the wrong booking
   * whenever this card is the My Bookings modal showing an older row.
   *
   * `null` hides the button entirely: with no id there is nothing to ask for,
   * and on `/e-ticket` that state is exactly the incomplete-ticket render the
   * page already warns about.
   */
  @Input() bookingId: number | null = null;

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
    private readonly translate: TranslateService,
    private readonly bookingService: BookingService,
    private readonly alertService: AlertService
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

  /**
   * OBRS-1802. The e-ticket is now the PDF the BACKEND renders, not a
   * client-side rasterisation of this card - so what the customer keeps is the
   * printable document the server is the authority on, identical on every
   * device, instead of a screenshot of whatever this browser happened to lay
   * out. It replaces `downloadTicketImage()`, whose client-side canvas-
   * rasteriser dependency left the tree with it (OBRS-1802 - do not reintroduce
   * one; `git log -S` on this file names it).
   *
   * <p>Three doors, one document, and the CREDENTIAL picks the door - see
   * `BookingService.downloadETicketPdf`. A guest who is still holding the token
   * checkout handed them types nothing at all; one who is not (came back later,
   * another device) is asked for the phone number they booked with, and so is a
   * guest whose token has aged out mid-session.
   *
   * <p>The pending affordance is the existing one verbatim
   * (`isDownloadingTicket` -> `[disabled]` + `[appPending]`), set before the
   * first call and cleared in `finally` so it also clears when the customer
   * dismisses the phone dialog.
   */
  async downloadTicketPdf(): Promise<void> {
    if (this.bookingId == null || this.isDownloadingTicket) {
      return;
    }

    this.isDownloadingTicket = true;

    try {
      if (!this.bookingService.canDownloadETicketByBookingId()) {
        await this.downloadByCredential();
        return;
      }

      try {
        await this.save(
          await firstValueFrom(
            this.bookingService.downloadETicketPdf(this.bookingId)
          )
        );
      } catch (error) {
        if (this.isGuestTokenRejected(error)) {
          await this.downloadByCredential();
          return;
        }
        this.reportFailure(error);
      }
    } finally {
      this.isDownloadingTicket = false;
    }
  }

  /**
   * Lane 3. The phone number is read from one dialog, handed to one request and
   * dropped: it is deliberately never written to `localStorage`, to
   * `sessionStorage`, or to a field on this component, and it is never prefilled
   * (PDPA - the app does not persist it today and this card does not start).
   * The booking NUMBER is shown read-only inside the dialog copy instead, since
   * it is already on screen on this very card.
   */
  private async downloadByCredential(): Promise<void> {
    const bookingNumber = this.resolveBookingNumber();
    if (!bookingNumber) {
      this.reportFailure(null);
      return;
    }

    const phoneNumber = await this.alertService.promptText({
      title: this.translate.instant('E_TICKET.DOWNLOAD_CONFIRM_TITLE'),
      text: this.translate.instant('E_TICKET.DOWNLOAD_CONFIRM_BODY', {
        bookingNumber,
      }),
      inputLabel: this.translate.instant('E_TICKET.DOWNLOAD_CONFIRM_PHONE_LABEL'),
      confirmButtonText: this.translate.instant('E_TICKET.DOWNLOAD_CONFIRM_SUBMIT'),
      // The adopted dialog idiom's own close affordance, not a new `_CANCEL` key.
      cancelButtonText: this.translate.instant('COMMON.CLOSE'),
      inputType: 'tel',
    });

    if (!phoneNumber) {
      return;
    }

    try {
      await this.save(
        await firstValueFrom(
          this.bookingService.downloadETicketPdfByCredential(
            bookingNumber,
            phoneNumber
          )
        ),
        bookingNumber
      );
    } catch (error) {
      this.reportFailure(error);
    }
  }

  private async save(
    download: ETicketPdfDownload,
    bookingNumber = this.resolveBookingNumber()
  ): Promise<void> {
    saveBlob(
      download.blob,
      download.filename || `e-ticket-${bookingNumber || 'ticket'}.pdf`
    );
  }

  /**
   * ONE refusal for a 404, saying nothing about WHICH half was wrong. The
   * backend answers "no such booking number" and "wrong phone" with the same
   * byte-identical 404 precisely so the endpoint cannot be used to confirm which
   * booking numbers exist (the same rule `/find-booking` is built on); splitting
   * it here - even into a friendlier message - would rebuild that oracle on the
   * client. Every other failure gets the one generic toast.
   */
  private reportFailure(error: unknown): void {
    const key =
      this.errorOf(error)?.status === 404
        ? 'E_TICKET.DOWNLOAD_NOT_FOUND'
        : 'E_TICKET.DOWNLOAD_FAILED';
    this.alertService.toast(this.translate.instant(key), 'error');
  }

  private isGuestTokenRejected(error: unknown): boolean {
    const code = this.errorOf(error)?.errorCode;
    return !!code && GUEST_TOKEN_REJECTED_CODES.includes(code);
  }

  private errorOf(error: unknown): ETicketPdfError | null {
    const candidate = error as Partial<ETicketPdfError> | null;
    return typeof candidate?.errorCode === 'string' &&
      typeof candidate?.status === 'number'
      ? (candidate as ETicketPdfError)
      : null;
  }

  /** The number on the card if it has one, else the one checkout last wrote. */
  private resolveBookingNumber(): string {
    const onCard = this.bookingNumber?.trim();
    if (onCard && onCard !== '-') {
      return onCard;
    }
    return this.bookingService.getActiveBookingNumber() ?? '';
  }
}
