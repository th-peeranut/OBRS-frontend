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

/** Let the `forkJoin` subscription + the real `QRCode.toDataURL` promise settle
 *  — the same wait the e-ticket page's own QR specs use. */
function settleQr(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe('ETicketCardComponent', () => {
  let component: ETicketCardComponent;

  beforeEach(() => {
    component = new ETicketCardComponent(
      new BoardingQrService(
        createTicketServiceStub() as unknown as TicketService
      )
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('builds a filesystem-safe download name from the ticket number', () => {
    component.ticketNumber = 'T-ABC, T-DEF';

    const filename = (component as unknown as {
      getTicketDownloadFilename: () => string;
    }).getTicketDownloadFilename();

    expect(filename).toBe('e-ticket-T-ABC--T-DEF.png');
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
      declarations: [ETicketCardComponent],
      imports: [TranslateModule.forRoot(), PhoneFormatPipe],
      // The component's own `providers: [BoardingQrService]` resolves
      // TicketService from here, so the real QR pipeline runs over the stub.
      providers: [{ provide: TicketService, useValue: ticketServiceStub }],
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
      declarations: [ETicketCardComponent],
      imports: [TranslateModule.forRoot(), PhoneFormatPipe],
      providers: [{ provide: TicketService, useValue: createTicketServiceStub() }],
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
      declarations: [ETicketCardComponent],
      imports: [TranslateModule.forRoot(), PhoneFormatPipe],
      providers: [{ provide: TicketService, useValue: createTicketServiceStub() }],
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
