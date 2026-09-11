import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import QRCode from 'qrcode';
import { TicketLeg, TicketPassenger } from '../../interfaces/e-ticket.interface';
import { BoardingQrService } from '../../services/boarding-qr.service';
import { TicketService } from '../../../services/ticket/ticket.service';
import { ETicketCardComponent } from './e-ticket-card.component';
import { PhoneFormatPipe } from '../../pipes/phone-format.pipe';
import { TitleLabelPipe } from '../../pipes/title-label.pipe';
import { PendingButtonDirective } from '../../directives/pending-button.directive';
import { createTranslateStub } from '../../../testing/test-stubs';
import {
  BookingService,
  ETicketPdfDownload,
  ETicketPdfError,
} from '../../../services/booking/booking.service';
import { AlertService } from '../../services/alert.service';

function buildLeg(overrides: Partial<TicketLeg> = {}): TicketLeg {
  return {
    travelDate: '20 Dec 2026',
    travelTime: '08:00 - 09:00',
    arrivalDate: '',
    route: 'Station A - Station B',
    origin: 'Station A',
    destination: 'Station B',
    vehicleType: 'Van',
    vehiclePlate: '12/1234',
    seats: '1',
    isOpenSeating: false,
    distanceKm: 45,
    pickupLatitude: null,
    pickupLongitude: null,
    passengers: [],
    ...overrides,
  };
}

function buildPassenger(overrides: Partial<TicketPassenger> = {}): TicketPassenger {
  return {
    name: 'Mr A',
    phone: '-',
    seat: '1',
    ticketId: 1,
    ticketNumber: 'T-1',
    seatOpen: false,
    ...overrides,
  };
}

function boardingTokenResponse(ticketId: number) {
  return of({
    code: 200,
    message: 'OK',
    data: {
      ticketId,
      ticketNumber: `T-${ticketId}`,
      boardingToken: `tok-${ticketId}`,
      expiresAt: '',
    },
  });
}

function createTicketServiceStub(): { getBoardingToken: jasmine.Spy } {
  return {
    getBoardingToken: jasmine
      .createSpy('getBoardingToken')
      .and.callFake((ticketId: number) => boardingTokenResponse(ticketId)),
  };
}

/**
 * OBRS-1802. The card now asks `BookingService` for the backend-rendered PDF and
 * `AlertService` for the phone-confirm dialog. Stubbed rather than wired to the
 * real services: WHICH URL each lane hits is pinned in
 * `booking.service.spec.ts`, and what belongs here is the card's own decision —
 * which lane it asks for, what it saves, and what it says when refused.
 */
function pdfDownload(filename: string): ETicketPdfDownload {
  return { blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), filename };
}

function pdfError(status: number, errorCode = 'ETICKET_PDF_ERROR'): ETicketPdfError {
  return { status, errorCode };
}

interface BookingServiceStub {
  canDownloadETicketByBookingId: jasmine.Spy;
  downloadETicketPdf: jasmine.Spy;
  downloadETicketPdfByCredential: jasmine.Spy;
  getActiveBookingNumber: jasmine.Spy;
}

function createBookingServiceStub(): BookingServiceStub {
  return {
    canDownloadETicketByBookingId: jasmine
      .createSpy('canDownloadETicketByBookingId')
      .and.returnValue(true),
    downloadETicketPdf: jasmine
      .createSpy('downloadETicketPdf')
      .and.returnValue(of(pdfDownload('e-ticket-BK-7.pdf'))),
    downloadETicketPdfByCredential: jasmine
      .createSpy('downloadETicketPdfByCredential')
      .and.returnValue(of(pdfDownload('e-ticket-BK-7.pdf'))),
    getActiveBookingNumber: jasmine
      .createSpy('getActiveBookingNumber')
      .and.returnValue(null),
  };
}

interface AlertServiceStub {
  toast: jasmine.Spy;
  promptText: jasmine.Spy;
}

function createAlertServiceStub(): AlertServiceStub {
  return {
    toast: jasmine.createSpy('toast'),
    promptText: jasmine.createSpy('promptText').and.resolveTo('0812345678'),
  };
}

/** The download name the browser was actually handed. `saveBlob` builds a real
 *  `<a download>` and clicks it, so the assertion has to read that anchor —
 *  nothing else in this flow records the filename. */
function captureSavedAnchor(): HTMLAnchorElement {
  const anchor = document.createElement('a');
  const realCreateElement = document.createElement.bind(document);
  spyOn(anchor, 'click');
  spyOn(document, 'createElement').and.callFake((tag: string) =>
    tag === 'a' ? anchor : realCreateElement(tag)
  );
  spyOn(URL, 'createObjectURL').and.returnValue('blob:e-ticket');
  spyOn(URL, 'revokeObjectURL');
  return anchor;
}

/** Let the `forkJoin` subscription + the real `QRCode.toDataURL` promise settle
 *  — the same wait the e-ticket page's own QR specs use. */
function settleQr(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe('ETicketCardComponent', () => {
  let component: ETicketCardComponent;
  let bookingServiceStub: BookingServiceStub;
  let alertServiceStub: AlertServiceStub;

  beforeEach(() => {
    bookingServiceStub = createBookingServiceStub();
    alertServiceStub = createAlertServiceStub();
    component = new ETicketCardComponent(
      new BoardingQrService(
        createTicketServiceStub() as unknown as TicketService
      ),
      createTranslateStub(),
      bookingServiceStub as unknown as BookingService,
      alertServiceStub as unknown as AlertService
    );
    component.bookingId = 7;
    component.bookingNumber = 'BK-7';
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /**
   * OBRS-1802 replaced the client-side PNG with the backend's PDF, so the
   * filename is no longer something this component composes — it is the one the
   * server put in `Content-Disposition`. The test it replaces asserted
   * `e-ticket-T-ABC--T-DEF.png` out of a private `getTicketDownloadFilename()`
   * that no longer exists.
   */
  it('saves under the filename the SERVER sent', async () => {
    const anchor = captureSavedAnchor();

    await component.downloadTicketPdf();

    expect(bookingServiceStub.downloadETicketPdf).toHaveBeenCalledWith(7);
    expect(anchor.download).toBe('e-ticket-BK-7.pdf');
  });

  it('falls back to the booking number when the response carried no filename', async () => {
    bookingServiceStub.downloadETicketPdf.and.returnValue(of(pdfDownload('')));
    const anchor = captureSavedAnchor();

    await component.downloadTicketPdf();

    expect(anchor.download).toBe('e-ticket-BK-7.pdf');
  });

  it('does nothing at all without a bookingId — there is nothing to ask for', async () => {
    component.bookingId = null;

    await component.downloadTicketPdf();

    expect(bookingServiceStub.downloadETicketPdf).not.toHaveBeenCalled();
    expect(alertServiceStub.promptText).not.toHaveBeenCalled();
  });

  it('is re-entrancy guarded: a second click while one is in flight is ignored', async () => {
    component.isDownloadingTicket = true;

    await component.downloadTicketPdf();

    expect(bookingServiceStub.downloadETicketPdf).not.toHaveBeenCalled();
  });

  describe('lane selection (OBRS-1802)', () => {
    it('a credential-holding customer is asked NOTHING — one call, no dialog', async () => {
      captureSavedAnchor();

      await component.downloadTicketPdf();

      expect(alertServiceStub.promptText).not.toHaveBeenCalled();
      expect(
        bookingServiceStub.downloadETicketPdfByCredential
      ).not.toHaveBeenCalled();
    });

    it('a guest holding no token is asked for the phone, then POSTs the pair', async () => {
      bookingServiceStub.canDownloadETicketByBookingId.and.returnValue(false);
      captureSavedAnchor();

      await component.downloadTicketPdf();

      expect(bookingServiceStub.downloadETicketPdf).not.toHaveBeenCalled();
      expect(alertServiceStub.promptText).toHaveBeenCalledTimes(1);
      expect(
        bookingServiceStub.downloadETicketPdfByCredential
      ).toHaveBeenCalledWith('BK-7', '0812345678');
    });

    it('the phone dialog never arrives prefilled', async () => {
      bookingServiceStub.canDownloadETicketByBookingId.and.returnValue(false);
      captureSavedAnchor();

      await component.downloadTicketPdf();

      const options = alertServiceStub.promptText.calls.mostRecent()
        .args[0] as Record<string, unknown>;
      // Whatever else the dialog carries, it must not carry a phone number to
      // start from — the app does not persist one and must not look like it does.
      expect(Object.keys(options)).not.toContain('inputValue');
      expect(JSON.stringify(options)).not.toContain('081');
    });

    it('a dismissed phone dialog sends nothing and leaves the button usable', async () => {
      bookingServiceStub.canDownloadETicketByBookingId.and.returnValue(false);
      alertServiceStub.promptText.and.resolveTo(null);

      await component.downloadTicketPdf();

      expect(
        bookingServiceStub.downloadETicketPdfByCredential
      ).not.toHaveBeenCalled();
      expect(component.isDownloadingTicket).toBeFalse();
    });

    /**
     * An aged-out guest token (60-minute TTL, ADR-0123 D6) must fall THROUGH to
     * the phone step rather than dead-end — which is what the server copy for
     * these two codes already tells the customer to do.
     */
    ['GUEST_PAYMENT_TOKEN_EXPIRED', 'GUEST_PAYMENT_TOKEN_INVALID'].forEach(
      (errorCode) => {
        it(`falls through to the phone step on ${errorCode}`, async () => {
          bookingServiceStub.downloadETicketPdf.and.returnValue(
            throwError(() => pdfError(400, errorCode))
          );
          captureSavedAnchor();

          await component.downloadTicketPdf();

          expect(alertServiceStub.promptText).toHaveBeenCalledTimes(1);
          expect(
            bookingServiceStub.downloadETicketPdfByCredential
          ).toHaveBeenCalledWith('BK-7', '0812345678');
          // And it must not ALSO toast a failure on the way through.
          expect(alertServiceStub.toast).not.toHaveBeenCalled();
        });
      }
    );

    it('does NOT fall through on any other failure — that would loop a dialog forever', async () => {
      bookingServiceStub.downloadETicketPdf.and.returnValue(
        throwError(() => pdfError(409, 'NO_PRINTABLE_TICKET'))
      );

      await component.downloadTicketPdf();

      expect(alertServiceStub.promptText).not.toHaveBeenCalled();
      expect(alertServiceStub.toast).toHaveBeenCalledWith(
        'E_TICKET.DOWNLOAD_FAILED',
        'error'
      );
    });
  });

  describe('the 404 refusal says nothing about WHICH half was wrong (OBRS-1802)', () => {
    beforeEach(() => {
      bookingServiceStub.canDownloadETicketByBookingId.and.returnValue(false);
    });

    it('renders the one neutral message', async () => {
      bookingServiceStub.downloadETicketPdfByCredential.and.returnValue(
        throwError(() => pdfError(404, 'BOOKING_NOT_FOUND'))
      );

      await component.downloadTicketPdf();

      expect(alertServiceStub.toast).toHaveBeenCalledTimes(1);
      expect(alertServiceStub.toast).toHaveBeenCalledWith(
        'E_TICKET.DOWNLOAD_NOT_FOUND',
        'error'
      );
    });

    /**
     * The enumeration oracle the backend spent a whole service class closing: a
     * wrong booking number and a wrong phone come back as the same 404, and the
     * client must not split them apart again. Asserting that two DIFFERENT 404
     * codes produce the byte-identical message is the form of that claim a test
     * can actually go red on — a spec that only checks one key cannot see a
     * second variant being added beside it.
     */
    it('two different 404 codes produce the SAME message', async () => {
      for (const errorCode of ['BOOKING_NOT_FOUND', 'PHONE_MISMATCH']) {
        alertServiceStub.toast.calls.reset();
        bookingServiceStub.downloadETicketPdfByCredential.and.returnValue(
          throwError(() => pdfError(404, errorCode))
        );

        await component.downloadTicketPdf();

        expect(alertServiceStub.toast).toHaveBeenCalledWith(
          'E_TICKET.DOWNLOAD_NOT_FOUND',
          'error'
        );
      }
    });

    it('a 429 is not mistaken for a refusal', async () => {
      bookingServiceStub.downloadETicketPdfByCredential.and.returnValue(
        throwError(() => pdfError(429, 'TOO_MANY_REQUESTS'))
      );

      await component.downloadTicketPdf();

      expect(alertServiceStub.toast).toHaveBeenCalledWith(
        'E_TICKET.DOWNLOAD_FAILED',
        'error'
      );
    });
  });

  /**
   * PDPA. The phone number is read from one dialog, handed to one request and
   * dropped. This is the assertion that rots quietly if nobody writes it: a
   * `localStorage.setItem` added later for "convenience" breaks nothing visible.
   */
  it('retains the phone number NOWHERE after a credential download', async () => {
    localStorage.clear();
    sessionStorage.clear();
    bookingServiceStub.canDownloadETicketByBookingId.and.returnValue(false);
    captureSavedAnchor();

    await component.downloadTicketPdf();

    const dump = (store: Storage): string =>
      Object.keys(store)
        .map((key) => `${key}=${store.getItem(key)}`)
        .join('|');

    expect(dump(localStorage)).not.toContain('0812345678');
    expect(dump(sessionStorage)).not.toContain('0812345678');
    expect(JSON.stringify(component)).not.toContain('0812345678');
  });

  it('navigateToPickup opens the Google Maps directions deep-link for the leg pickup coords', () => {
    const openSpy = spyOn(window, 'open');

    component.navigateToPickup(buildLeg({ pickupLatitude: 13.7563, pickupLongitude: 100.5018 }));

    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=13.7563,100.5018&travelmode=driving',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('navigateToPickup does nothing when the leg has no pickup coords', () => {
    const openSpy = spyOn(window, 'open');

    component.navigateToPickup(buildLeg({ pickupLatitude: null, pickupLongitude: null }));

    expect(openSpy).not.toHaveBeenCalled();
  });
});

/**
 * OBRS-866 — the card used to render ONE QR encoding the human-readable
 * `ticketNumber` string. `POST /tickets/boarding-scan` rejects that with 400
 * `INVALID_TICKET_TOKEN` (the payload must be the signed boarding JWT), and a
 * single card-level QR could not have boarded more than one of a
 * multi-passenger booking's tickets even had the payload been right. These
 * specs pin both halves: the payload is the per-ticket boarding token, and
 * there is one QR per ticket.
 *
 * Wired to the REAL `BoardingQrService` over a `TicketService` stub, never a
 * mock of the QR service itself — a mocked QR service passes happily while the
 * card asks it for the wrong thing, which is exactly this defect's shape.
 */
describe('ETicketCardComponent — boarding QR (OBRS-866)', () => {
  let fixture: ComponentFixture<ETicketCardComponent>;
  let component: ETicketCardComponent;
  let ticketServiceStub: { getBoardingToken: jasmine.Spy };

  beforeEach(async () => {
    ticketServiceStub = createTicketServiceStub();

    await TestBed.configureTestingModule({
      declarations: [ETicketCardComponent, PendingButtonDirective],
      imports: [TitleLabelPipe, TranslateModule.forRoot(), PhoneFormatPipe],
      // The component's own `providers: [BoardingQrService]` resolves
      // TicketService from here, so the real QR pipeline runs over the stub.
      providers: [
        { provide: TicketService, useValue: ticketServiceStub },
        { provide: BookingService, useValue: createBookingServiceStub() },
        { provide: AlertService, useValue: createAlertServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ETicketCardComponent);
    component = fixture.componentInstance;
  });

  function qrImages(): HTMLImageElement[] {
    return fixture.debugElement
      .queryAll(By.css('.passenger-qr img.qr-code'))
      .map((el) => el.nativeElement as HTMLImageElement);
  }

  /** One-way shorthand: a single leg carrying these passengers. */
  function setPassengers(passengers: TicketPassenger[]): void {
    setLegs([buildLeg({ passengers })]);
  }

  function setLegs(legs: TicketLeg[]): void {
    component.legs = legs;
    component.ngOnChanges({
      legs: {
        currentValue: legs,
        previousValue: [],
        firstChange: true,
        isFirstChange: () => true,
      },
    });
    fixture.detectChanges();
  }

  it('encodes the ticket\'s BOARDING TOKEN, never its ticketNumber', async () => {
    const qrSpy = spyOn(QRCode, 'toDataURL').and.callThrough() as unknown as jasmine.Spy;

    setPassengers([buildPassenger({ ticketId: 7, ticketNumber: 'T-7' })]);
    await settleQr();

    expect(ticketServiceStub.getBoardingToken).toHaveBeenCalledOnceWith(7, true);
    expect(qrSpy).toHaveBeenCalledTimes(1);
    expect(qrSpy.calls.mostRecent().args[0]).toBe('tok-7');
    // The regression itself: the human-readable number must never be the payload.
    expect(qrSpy.calls.mostRecent().args[0]).not.toBe('T-7');
  });

  it('renders one QR per passenger, each from its own ticket (a 2-passenger booking gets 2 distinct QRs)', async () => {
    setPassengers([
      buildPassenger({ name: 'Mr A', ticketId: 1, ticketNumber: 'T-1' }),
      buildPassenger({ name: 'Mrs B', ticketId: 2, ticketNumber: 'T-2' }),
    ]);
    await settleQr();
    fixture.detectChanges();

    expect(ticketServiceStub.getBoardingToken.calls.allArgs()).toEqual([
      [1, true],
      [2, true],
    ]);

    const images = qrImages();
    expect(images.length).toBe(2);
    expect(images[0].src).toContain('data:image');
    expect(images[1].src).toContain('data:image');
    // Different tokens must produce different QR images — one shared QR for the
    // whole booking is the bug, not a rendering detail.
    expect(images[0].src).not.toBe(images[1].src);
  });

  it('no card-level QR survives: the only QRs on the paper are the per-passenger ones', async () => {
    setPassengers([buildPassenger()]);
    await settleQr();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.ticket-qr'))).toBeNull();
    expect(fixture.debugElement.queryAll(By.css('.qr-code')).length).toBe(1);
    expect(fixture.debugElement.queryAll(By.css('.passenger-qr')).length).toBe(1);
  });

  it('a row with no ticket of its own (ticketId null, e.g. the booker) renders no QR and issues no GET', async () => {
    setPassengers([buildPassenger({ ticketId: null, ticketNumber: '-' })]);
    await settleQr();
    fixture.detectChanges();

    expect(ticketServiceStub.getBoardingToken).not.toHaveBeenCalled();
    expect(fixture.debugElement.query(By.css('.passenger-qr'))).toBeNull();
  });

  it('isolates one ticket\'s failure — that row shows the unavailable placeholder, the other still renders its QR', async () => {
    ticketServiceStub.getBoardingToken.and.callFake((ticketId: number) =>
      ticketId === 1
        ? boardingTokenResponse(1)
        : throwError(() => ({ error: { errorCode: 'TICKET_NOT_CONFIRMED' } }))
    );

    setPassengers([
      buildPassenger({ ticketId: 1, ticketNumber: 'T-1' }),
      buildPassenger({ ticketId: 2, ticketNumber: 'T-2' }),
    ]);
    await settleQr();
    fixture.detectChanges();

    expect(component.legPassengerRows[0][0].qrUnavailable).toBeFalse();
    expect(component.legPassengerRows[0][0].qrDataUrl).toContain('data:image');
    expect(component.legPassengerRows[0][1].qrUnavailable).toBeTrue();
    expect(component.legPassengerRows[0][1].qrDataUrl).toBe('');

    expect(qrImages().length).toBe(1);
    expect(
      fixture.debugElement.queryAll(By.css('.qr-code-placeholder.is-unavailable')).length
    ).toBe(1);
  });

  it('shows each QR next to its own ticket number', async () => {
    setPassengers([
      buildPassenger({ ticketId: 1, ticketNumber: 'T-1' }),
      buildPassenger({ ticketId: 2, ticketNumber: 'T-2' }),
    ]);
    await settleQr();
    fixture.detectChanges();

    const numbers = fixture.debugElement
      .queryAll(By.css('.passenger-ticket-number'))
      .map((el) => (el.nativeElement.textContent || '').trim());
    expect(numbers).toEqual(['T-1', 'T-2']);
  });

  it('does not re-issue the GET when passengers are rebuilt (e.g. a locale switch re-running the mapper)', async () => {
    setPassengers([buildPassenger({ ticketId: 1 })]);
    await settleQr();
    setPassengers([buildPassenger({ ticketId: 1 })]);
    await settleQr();

    expect(ticketServiceStub.getBoardingToken).toHaveBeenCalledTimes(1);
    // …and the already-resolved QR is re-seeded synchronously rather than
    // flashing blank on the rebuilt array.
    expect(component.legPassengerRows[0][0].qrDataUrl).toContain('data:image');
  });

  /**
   * OBRS-873 — the round-trip half. A round trip issues a SEPARATE ticket per
   * leg, and the card used to receive one booking-level passenger list built
   * from a single journey: the other leg's passengers reached the gate with no
   * QR at all. These pin that both legs' tickets are fetched and rendered, and
   * that they stay tellable apart.
   */
  it('round trip: fetches a boarding token for BOTH legs\' tickets, not just the outbound leg\'s', async () => {
    setLegs([
      buildLeg({ passengers: [buildPassenger({ ticketId: 1, ticketNumber: 'T-1' })] }),
      buildLeg({ passengers: [buildPassenger({ ticketId: 2, ticketNumber: 'T-2' })] }),
    ]);
    await settleQr();
    fixture.detectChanges();

    expect(ticketServiceStub.getBoardingToken.calls.allArgs()).toEqual([
      [1, true],
      [2, true],
    ]);
    expect(qrImages().length).toBe(2);
    // The return leg's QR must not be a copy of the outbound one — that is the
    // whole failure this card fixes.
    expect(qrImages()[0].src).not.toBe(qrImages()[1].src);
  });

  it('round trip: labels the two passenger lists outbound / return so a QR can be traced to its leg', async () => {
    setLegs([
      buildLeg({ passengers: [buildPassenger({ ticketId: 1, ticketNumber: 'T-1' })] }),
      buildLeg({ passengers: [buildPassenger({ ticketId: 2, ticketNumber: 'T-2' })] }),
    ]);
    await settleQr();
    fixture.detectChanges();

    const passengerHeadings = fixture.debugElement
      .queryAll(By.css('.ticket-passengers .ticket-leg-heading'))
      .map((el) => (el.nativeElement.textContent || '').trim());
    expect(passengerHeadings).toEqual([
      'E_TICKET.LABEL.LEG_OUTBOUND',
      'E_TICKET.LABEL.LEG_RETURN',
    ]);

    const numbers = fixture.debugElement
      .queryAll(By.css('.passenger-ticket-number'))
      .map((el) => (el.nativeElement.textContent || '').trim());
    expect(numbers).toEqual(['T-1', 'T-2']);
  });

  it('one-way: renders a single unlabelled passenger list (no leg heading in the passengers block)', async () => {
    setPassengers([buildPassenger({ ticketId: 1, ticketNumber: 'T-1' })]);
    await settleQr();
    fixture.detectChanges();

    expect(
      fixture.debugElement.queryAll(By.css('.ticket-passengers .ticket-leg-heading')).length
    ).toBe(0);
    expect(qrImages().length).toBe(1);
  });

  it('a return leg with no tickets of its own gets no heading and no empty list', async () => {
    setLegs([
      buildLeg({ passengers: [buildPassenger({ ticketId: 1, ticketNumber: 'T-1' })] }),
      buildLeg({ passengers: [] }),
    ]);
    await settleQr();
    fixture.detectChanges();

    expect(
      fixture.debugElement.queryAll(By.css('.ticket-passengers .ticket-leg-heading')).length
    ).toBe(0);
    expect(fixture.debugElement.queryAll(By.css('.passenger-list')).length).toBe(1);
  });
});

describe('ETicketCardComponent — leg rendering', () => {
  let fixture: ComponentFixture<ETicketCardComponent>;
  let component: ETicketCardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ETicketCardComponent, PendingButtonDirective],
      imports: [TitleLabelPipe, TranslateModule.forRoot(), PhoneFormatPipe],
      providers: [
        { provide: TicketService, useValue: createTicketServiceStub() },
        { provide: BookingService, useValue: createBookingServiceStub() },
        { provide: AlertService, useValue: createAlertServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ETicketCardComponent);
    component = fixture.componentInstance;
  });

  function headings(): string[] {
    return fixture.debugElement
      .queryAll(By.css('.ticket-leg-heading'))
      .map((el) => (el.nativeElement.textContent || '').trim());
  }

  function distanceChips(): string[] {
    return fixture.debugElement
      .queryAll(By.css('.trip-estimate'))
      .map((el) => (el.nativeElement.textContent || '').trim().replace(/\s+/g, ' '));
  }

  it('one-way (legs.length === 1): renders no leg heading', () => {
    component.legs = [buildLeg()];
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.ticket-leg-heading'))).toBeNull();
  });

  it('one-way: renders the leg fields directly', () => {
    component.legs = [buildLeg()];
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent || '').replace(/\s+/g, ' ');
    expect(text).toContain('Station A - Station B');
    expect(distanceChips().length).toBe(1);
    expect(distanceChips()[0]).toContain('≈ 45');
  });

  it('round-trip (legs.length === 2): renders exactly two headings with the correct translated text', () => {
    component.legs = [
      buildLeg({ route: 'Station A - Station B', distanceKm: 45 }),
      buildLeg({ route: 'Station B - Station C', distanceKm: 40 }),
    ];
    fixture.detectChanges();

    const headingTexts = headings();
    expect(headingTexts.length).toBe(2);
    expect(headingTexts[0]).toBe('E_TICKET.LABEL.LEG_OUTBOUND');
    expect(headingTexts[1]).toBe('E_TICKET.LABEL.LEG_RETURN');
  });

  it('round-trip: each leg shows its own distance chip', () => {
    component.legs = [
      buildLeg({ route: 'Station A - Station B', distanceKm: 45 }),
      buildLeg({ route: 'Station B - Station C', distanceKm: 40 }),
    ];
    fixture.detectChanges();

    const chips = distanceChips();
    expect(chips.length).toBe(2);
    expect(chips[0]).toContain('≈ 45');
    expect(chips[1]).toContain('≈ 40');
  });

  it('hides a leg\'s distance chip when its distanceKm is null', () => {
    component.legs = [
      buildLeg({ distanceKm: 45 }),
      buildLeg({ distanceKm: null }),
    ];
    fixture.detectChanges();

    expect(distanceChips().length).toBe(1);
  });

  it('renders the passengers/total block frame exactly once regardless of leg count', () => {
    component.legs = [
      buildLeg({ passengers: [buildPassenger({ ticketId: 1, ticketNumber: 'T-1' })] }),
      buildLeg({ passengers: [buildPassenger({ ticketId: 2, ticketNumber: 'T-2' })] }),
    ];
    component.ngOnChanges({
      legs: {
        currentValue: component.legs,
        previousValue: [],
        firstChange: true,
        isFirstChange: () => true,
      },
    });
    component.totalAmount = '500.00';
    fixture.detectChanges();

    // The frame — total and the "scan before boarding" hint — stays singular…
    expect(fixture.debugElement.queryAll(By.css('.ticket-total')).length).toBe(1);
    expect(fixture.debugElement.queryAll(By.css('.qr-hint')).length).toBe(1);
    // …while the rows themselves are per-ticket and therefore per-leg
    // (OBRS-866: one QR per ticket; OBRS-873: every leg's tickets, not one
    // leg's).
    expect(fixture.debugElement.queryAll(By.css('.passenger-row')).length).toBe(2);
    expect(fixture.debugElement.queryAll(By.css('.passenger-qr')).length).toBe(2);
  });

  it('OBRS-1781: the boarding-scan hint heads the passenger list instead of trailing it', () => {
    component.legs = [
      buildLeg({ passengers: [buildPassenger({ ticketId: 1, ticketNumber: 'T-1' })] }),
      buildLeg({ passengers: [buildPassenger({ ticketId: 2, ticketNumber: 'T-2' })] }),
    ];
    component.ngOnChanges({
      legs: {
        currentValue: component.legs,
        previousValue: [],
        firstChange: true,
        isFirstChange: () => true,
      },
    });
    fixture.detectChanges();

    const hint: HTMLElement = fixture.nativeElement.querySelector('.qr-hint');
    const firstList: HTMLElement = fixture.nativeElement.querySelector('.passenger-list');
    expect(hint).toBeTruthy();
    expect(firstList).toBeTruthy();
    // The reader meets "scan this before boarding" ahead of the QRs it
    // describes, not one passenger block per traveller below them.
    expect(hint.compareDocumentPosition(firstList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('OBRS-269: hides the Navigate button for a leg with no pickup coords', () => {
    component.legs = [buildLeg({ pickupLatitude: null, pickupLongitude: null })];
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.ticket-nav-btn'))).toBeNull();
  });

  it('OBRS-269: shows the Navigate button for a leg with pickup coords', () => {
    component.legs = [buildLeg({ pickupLatitude: 13.7563, pickupLongitude: 100.5018 })];
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.ticket-nav-btn'))).not.toBeNull();
  });

  it('OBRS-269: round-trip shows a Navigate button per leg that has pickup coords, independently', () => {
    component.legs = [
      buildLeg({ pickupLatitude: 13.7563, pickupLongitude: 100.5018 }),
      buildLeg({ pickupLatitude: null, pickupLongitude: null }),
    ];
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(By.css('.ticket-nav-btn')).length).toBe(1);
  });

  it('OBRS-325: shows the open-seating label instead of the seat list when isOpenSeating is true', () => {
    component.legs = [buildLeg({ isOpenSeating: true, seats: '-' })];
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent || '').replace(/\s+/g, ' ');
    expect(text).toContain('E_TICKET.LABEL.SEAT_OPEN');
  });

  it('OBRS-325 (ASSIGNED regression): shows the real seat number unchanged when isOpenSeating is false', () => {
    component.legs = [buildLeg({ isOpenSeating: false, seats: 'A5' })];
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent || '').replace(/\s+/g, ' ');
    expect(text).toContain('A5');
    expect(text).not.toContain('E_TICKET.LABEL.SEAT_OPEN');
  });

  // OBRS-1510 AC-7: the TICKET_NO row is gated in the CARD, deliberately not
  // behind a new `@Input()` flag (a flag would just be a second lever for the
  // same drift this consolidation exists to close — see ADR-0041). Guest
  // renders never set `ticketNumber`, so the default '-' is what keeps this
  // row hidden for them, exactly as it already was on the page before this
  // card; a signed-in customer's real ticket number is what the my-bookings
  // modal has ALWAYS supplied, unchanged by this card.
  it('OBRS-1510 AC-7: hides the TICKET_NO row when ticketNumber is the "-" default (guest)', () => {
    component.ticketNumber = '-';
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent || '').replace(/\s+/g, ' ');
    expect(text).not.toContain('E_TICKET.LABEL.TICKET_NO');
  });

  it('OBRS-1510 AC-7: shows the TICKET_NO row once a real ticketNumber is set', () => {
    component.ticketNumber = 'T-Q4QZXTZAFY';
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent || '').replace(/\s+/g, ' ');
    expect(text).toContain('E_TICKET.LABEL.TICKET_NO');
    expect(text).toContain('T-Q4QZXTZAFY');
  });

  // OBRS-1510 AC-2: this leg-level cell used to live only on the e-ticket
  // page's own template (OBRS-1502) — now on the card, so the my-bookings
  // modal gets it too.
  it('OBRS-1510 AC-2: hides the ARRIVAL_DATE cell when the leg\'s arrivalDate is empty (same-day trip)', () => {
    component.legs = [buildLeg({ arrivalDate: '' })];
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent || '').replace(/\s+/g, ' ');
    expect(text).not.toContain('E_TICKET.LABEL.ARRIVAL_DATE');
  });

  it('OBRS-1510 AC-2: shows the ARRIVAL_DATE cell with its value when the leg lands on a later day', () => {
    component.legs = [buildLeg({ arrivalDate: '21 Dec 2026' })];
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent || '').replace(/\s+/g, ' ');
    expect(text).toContain('E_TICKET.LABEL.ARRIVAL_DATE');
    expect(text).toContain('21 Dec 2026');
  });

  it('OBRS-1510 AC-2: round trip shows the ARRIVAL_DATE cell only on the leg that crosses', () => {
    component.legs = [
      buildLeg({ arrivalDate: '21 Dec 2026' }),
      buildLeg({ arrivalDate: '' }),
    ];
    fixture.detectChanges();

    expect(
      fixture.debugElement.queryAll(By.css('.ticket-leg .ticket-item')).filter((el) =>
        (el.nativeElement.textContent || '').includes('E_TICKET.LABEL.ARRIVAL_DATE')
      ).length
    ).toBe(1);
  });
});

/**
 * OBRS-1510 AC-8: the per-passenger SEAT cell — lifted from the e-ticket
 * page's own passenger-card markup onto the shared card, so the my-bookings
 * modal gets it too (intentional per the AC). Rendered from
 * `legPassengerRows`, which only the real `ngOnChanges` lifecycle populates —
 * same TestBed/TicketService-stub setup as the boarding-QR describe above.
 */
describe('ETicketCardComponent — per-passenger SEAT cell (OBRS-1510 AC-8)', () => {
  let fixture: ComponentFixture<ETicketCardComponent>;
  let component: ETicketCardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ETicketCardComponent, PendingButtonDirective],
      imports: [TitleLabelPipe, TranslateModule.forRoot(), PhoneFormatPipe],
      providers: [
        { provide: TicketService, useValue: createTicketServiceStub() },
        { provide: BookingService, useValue: createBookingServiceStub() },
        { provide: AlertService, useValue: createAlertServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ETicketCardComponent);
    component = fixture.componentInstance;
  });

  function setLegs(legs: TicketLeg[]): void {
    component.legs = legs;
    component.ngOnChanges({
      legs: {
        currentValue: legs,
        previousValue: [],
        firstChange: true,
        isFirstChange: () => true,
      },
    });
    fixture.detectChanges();
  }

  function seatCells(): string[] {
    return fixture.debugElement
      .queryAll(By.css('.passenger-field'))
      .filter((el) => (el.nativeElement.textContent || '').includes('E_TICKET.LABEL.SEAT'))
      .map((el) => (el.nativeElement.textContent || '').trim());
  }

  it('hides this passenger\'s own SEAT cell when seatOpen is true (open seating)', () => {
    setLegs([
      buildLeg({ passengers: [buildPassenger({ seatOpen: true, seat: '-' })] }),
    ]);

    expect(seatCells().length).toBe(0);
  });

  it('shows this passenger\'s own SEAT cell with the real seat when seatOpen is false', () => {
    setLegs([
      buildLeg({ passengers: [buildPassenger({ seatOpen: false, seat: 'A5' })] }),
    ]);

    expect(seatCells().length).toBe(1);
    expect(seatCells()[0]).toContain('A5');
  });

  it('gates independently PER PASSENGER, not per leg — one open-seating row and one assigned row on the same leg', () => {
    setLegs([
      buildLeg({
        passengers: [
          buildPassenger({ name: 'Open Passenger', ticketId: 1, seatOpen: true, seat: '-' }),
          buildPassenger({ name: 'Assigned Passenger', ticketId: 2, seatOpen: false, seat: 'B2' }),
        ],
      }),
    ]);

    expect(seatCells().length).toBe(1);
    expect(seatCells()[0]).toContain('B2');
  });
});

/**
 * OBRS-1802 AC: the Download button is visible to a GUEST (owner decision
 * 2026-09-11). `/e-ticket` is a public route — `customerArea: true` with NO
 * `requireAuth` — so the customer standing in front of this card immediately
 * after paying usually has no account at all, and that is precisely the person
 * whose only copy of the ticket is this screen.
 *
 * No `isAuthenticated()` condition exists anywhere in this template; the only
 * gate is `bookingId`, because with no id there is nothing to ask the backend to
 * render. Both directions are pinned — the positive one would pass on its own
 * even if someone re-added an auth condition that happened to be true in the
 * fixture.
 */
describe('ETicketCardComponent — download button visibility (OBRS-1802)', () => {
  let fixture: ComponentFixture<ETicketCardComponent>;
  let component: ETicketCardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ETicketCardComponent, PendingButtonDirective],
      imports: [TitleLabelPipe, TranslateModule.forRoot(), PhoneFormatPipe],
      providers: [
        { provide: TicketService, useValue: createTicketServiceStub() },
        {
          provide: BookingService,
          // A guest holding no token: the weakest caller there is. If even this
          // one sees the button, no authentication is being required.
          useValue: {
            ...createBookingServiceStub(),
            canDownloadETicketByBookingId: jasmine
              .createSpy('canDownloadETicketByBookingId')
              .and.returnValue(false),
          },
        },
        { provide: AlertService, useValue: createAlertServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ETicketCardComponent);
    component = fixture.componentInstance;
  });

  function downloadButton(): HTMLButtonElement | null {
    const el = fixture.debugElement.query(By.css('button.download-btn'));
    return el ? (el.nativeElement as HTMLButtonElement) : null;
  }

  it('renders for a guest — no authentication of any kind', () => {
    component.bookingId = 7;
    fixture.detectChanges();

    const button = downloadButton();
    expect(button).not.toBeNull();
    expect(button?.disabled).toBeFalse();
  });

  /** Kept as the class name, not renamed: `e2e/support/customer-pages.ts` names
   *  `.download-btn` in the contrast gate's hover sweep, and that job cannot be
   *  seen from `ng test` at all. */
  it('keeps the `.download-btn` class and the E_TICKET.DOWNLOAD key', () => {
    component.bookingId = 7;
    fixture.detectChanges();

    expect(downloadButton()?.textContent).toContain('E_TICKET.DOWNLOAD');
  });

  it('is absent with no bookingId', () => {
    component.bookingId = null;
    fixture.detectChanges();

    expect(downloadButton()).toBeNull();
  });

  it('shows the pending affordance while a download is in flight', () => {
    component.bookingId = 7;
    component.isDownloadingTicket = true;
    fixture.detectChanges();

    expect(downloadButton()?.disabled).toBeTrue();
  });
});
