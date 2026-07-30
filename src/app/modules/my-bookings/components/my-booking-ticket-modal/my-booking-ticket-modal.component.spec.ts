import { of, throwError } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BookingService } from '../../../../services/booking/booking.service';
import { BookingTicketsData } from '../../../../shared/interfaces/booking-ticket.interface';
import { ETicketCardComponent } from '../../../../shared/components/e-ticket-card/e-ticket-card.component';
import { ETicketCardModule } from '../../../../shared/components/e-ticket-card/e-ticket-card.module';
import { TicketService } from '../../../../services/ticket/ticket.service';
import { MyBookingTicketModalComponent } from './my-booking-ticket-modal.component';
// OBRS-907 scrutinize follow-up: declared (not left to NO_ERRORS_SCHEMA below) so
// the loading-state render test can measure its REAL computed size — an
// undeclared custom element under NO_ERRORS_SCHEMA renders as an opaque leaf
// with no children, which would make the ring span impossible to query at all.
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';

function buildTicketsData(): BookingTicketsData {
  return {
    bookingId: 5,
    bookingNumber: 'B-1',
    totalAmount: '500.00',
    contactPhoneNumber: '0812345678',
    journeys: [
      {
        legType: { code: 'outbound', label: 'Outbound' },
        fromStop: {
          code: 'a',
          label: 'Station A',
          distanceKmFromOrigin: 10,
          offsetMinutesFromOrigin: 15,
        },
        toStop: {
          code: 'b',
          label: 'Station B',
          distanceKmFromOrigin: 55,
          offsetMinutesFromOrigin: 60,
        },
        departureDateTime: '2026-12-20T08:00:00',
        arrivalDateTime: '2026-12-20T09:00:00',
        vehicle: {
          vehicleType: { code: 'van', label: 'Van' },
          numberPlate: '1234',
          vehicleNumber: '12',
        },
        tickets: [
          { id: 1, ticketNumber: 'T-1', seatNumber: '1', passengerName: 'Mr A' },
        ],
      },
    ],
  };
}

describe('MyBookingTicketModalComponent', () => {
  let component: MyBookingTicketModalComponent;

  const bookingServiceStub = {
    getBookingTickets: () => of({ code: 200, message: 'OK', data: buildTicketsData() }),
  } as unknown as BookingService;

  const translateStub = {
    instant: (key: string) => key,
    currentLang: 'en',
  } as unknown as TranslateService;

  function changeBookingId(value: number): void {
    component.bookingId = value;
    component.ngOnChanges({
      bookingId: {
        currentValue: value,
        previousValue: null,
        firstChange: true,
        isFirstChange: () => true,
      },
    });
  }

  beforeEach(() => {
    component = new MyBookingTicketModalComponent(bookingServiceStub, translateStub);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads and maps the ticket when the booking id changes', () => {
    changeBookingId(5);

    expect(component.loading).toBeFalse();
    expect(component.error).toBe('');
    expect(component.card?.bookingNumber).toBe('B-1');
    expect(component.card?.legs.length).toBe(1);
    expect(component.card?.legs[0].route).toBe('Station A - Station B');
    expect(component.card?.legs[0].passengers.length).toBe(1);
    expect(component.card?.booker?.phone).toBe('0812345678');
    // SPEC-OBRS-426 M1: the tracker target is computed alongside the card.
    expect(component.trackTargets.length).toBe(2);
    expect(component.trackTargets[0]?.ticketId).toBe(1);
  });

  it('surfaces a localized error when the request fails', () => {
    spyOn(bookingServiceStub, 'getBookingTickets').and.returnValue(
      throwError(() => new Error('boom'))
    );

    changeBookingId(5);

    expect(component.loading).toBeFalse();
    expect(component.card).toBeNull();
    expect(component.error).toBe('MY_BOOKINGS.TICKET_MODAL.LOAD_FAILED');
  });

  it('closes only when the backdrop itself is clicked', () => {
    const closedSpy = jasmine.createSpy('closed');
    component.closed.subscribe(closedSpy);

    const backdrop = {} as EventTarget;
    component.onBackdropClick({
      target: document.createElement('div'),
      currentTarget: backdrop,
    } as unknown as MouseEvent);
    expect(closedSpy).not.toHaveBeenCalled();

    component.onBackdropClick({
      target: backdrop,
      currentTarget: backdrop,
    } as unknown as MouseEvent);
    expect(closedSpy).toHaveBeenCalled();
  });
});

describe('MyBookingTicketModalComponent — legs passthrough (render)', () => {
  let fixture: ComponentFixture<MyBookingTicketModalComponent>;
  let component: MyBookingTicketModalComponent;
  let ticketServiceStub: { getBoardingToken: jasmine.Spy };

  beforeEach(async () => {
    const bookingServiceStub = {
      getBookingTickets: () => of({ code: 200, message: 'OK', data: buildTicketsData() }),
    } as unknown as BookingService;
    // OBRS-866: the real ETicketCardComponent now fetches a boarding token per
    // ticket (its own component-scoped BoardingQrService resolves TicketService
    // from here), so this suite must supply one or the card can't be built.
    ticketServiceStub = {
      getBoardingToken: jasmine.createSpy('getBoardingToken').and.returnValue(
        of({
          code: 200,
          message: 'OK',
          data: { ticketId: 1, ticketNumber: 'T-1', boardingToken: 'tok-1', expiresAt: '' },
        })
      ),
    };

    await TestBed.configureTestingModule({
      declarations: [MyBookingTicketModalComponent, LoadingStateComponent],
      // app-trip-track-panel (SPEC-OBRS-426) is a real child component of a
      // sibling module (MyBookingsModule) — not declared here, same NO_ERRORS_SCHEMA
      // pattern as FleetMapPageComponent's own template-wiring spec: this
      // suite only verifies the modal passes the right inputs down, not the
      // tracker's own behavior (covered by trip-track-panel.component.spec.ts).
      schemas: [NO_ERRORS_SCHEMA],
      imports: [ETicketCardModule, TranslateModule.forRoot()],
      providers: [
        { provide: BookingService, useValue: bookingServiceStub },
        { provide: TicketService, useValue: ticketServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyBookingTicketModalComponent);
    component = fixture.componentInstance;
  });

  it('passes card.legs through to the e-ticket card', () => {
    component.bookingId = 5;
    component.ngOnChanges({
      bookingId: {
        currentValue: 5,
        previousValue: null,
        firstChange: true,
        isFirstChange: () => true,
      },
    });
    fixture.detectChanges();

    const cardDebugEl = fixture.debugElement.query(By.directive(ETicketCardComponent));
    const cardInstance = cardDebugEl.componentInstance as ETicketCardComponent;

    expect(cardInstance.legs.length).toBe(1);
    expect(cardInstance.legs[0].distanceKm).toBe(45);
  });

  // OBRS-866: the integration point the bug actually lived at — My Bookings is
  // the only post-payment surface a customer can reach, and the QR it showed
  // encoded the `ticketNumber` string, which the staff scanner rejects. Pin
  // that the card reached here asks for THIS booking's ticket's boarding token.
  it('OBRS-866: the card fetches a real boarding token for the booking\'s ticket', () => {
    component.bookingId = 5;
    component.ngOnChanges({
      bookingId: {
        currentValue: 5,
        previousValue: null,
        firstChange: true,
        isFirstChange: () => true,
      },
    });
    fixture.detectChanges();

    expect(ticketServiceStub.getBoardingToken).toHaveBeenCalledOnceWith(1, true);

    const cardInstance = fixture.debugElement.query(By.directive(ETicketCardComponent))
      .componentInstance as ETicketCardComponent;
    expect(
      cardInstance.legPassengerRows.map((rows) => rows.map((row) => row.ticketId))
    ).toEqual([[1]]);
  });

  // SPEC-OBRS-426 BR-2: the tracker renders as a SIBLING of app-e-ticket-card,
  // below it, inside the modal body — never inside ETicketCardComponent.
  it('renders app-trip-track-panel as a sibling of app-e-ticket-card, with the M1 target\'s fields', () => {
    component.bookingId = 5;
    component.ngOnChanges({
      bookingId: {
        currentValue: 5,
        previousValue: null,
        firstChange: true,
        isFirstChange: () => true,
      },
    });
    fixture.detectChanges();

    expect(component.trackTargets.length).toBe(2);
    expect(component.trackTargets[0]?.ticketId).toBe(1);
    expect(component.trackTargets[1]).toBeNull(); // one-way booking — no inbound leg

    const panel = fixture.debugElement.query(By.css('app-trip-track-panel'));
    expect(panel).withContext('exactly one tracker for the one leg with an eligible ticket').not.toBeNull();
    expect(panel.properties['ticketId']).toBe(1);
    expect(panel.properties['boardingStopLabel']).toBe('Station A');

    const body = fixture.debugElement.query(By.css('.ticket-modal__body'));
    const cardIndex = Array.from(body.nativeElement.children).findIndex(
      (el: any) => el.tagName?.toLowerCase() === 'app-e-ticket-card'
    );
    const panelIndex = Array.from(body.nativeElement.children).findIndex(
      (el: any) => el.tagName?.toLowerCase() === 'app-trip-track-panel'
    );
    expect(cardIndex).toBeGreaterThanOrEqual(0);
    expect(panelIndex).toBeGreaterThan(cardIndex); // below the card, not inside it
  });

  // OBRS-907 scrutinize follow-up: pin the ACTUAL COMPUTED size, not just presence.
  // The notification-inbox-panel sibling migration silently grew 28px -> 34px past
  // 4334 green tests because nothing read getComputedStyle -- this is that class of
  // regression, closed for the ticket modal's ring graphic too. Karma's `styles`
  // array already loads src/styles.scss (OBRS-721 lesson), so this sees the REAL
  // cascade, not a guess about it.
  it('OBRS-907: pins the ring spinner at its computed 36px size / 4px border width (matching the old .ticket-modal__spinner it replaced)', () => {
    component.loading = true;
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    try {
      const ring = fixture.debugElement.query(By.css('.loading-state-ring'));
      expect(ring).withContext('the ring graphic must render while loading is true').not.toBeNull();
      const style = getComputedStyle(ring.nativeElement);
      expect(style.width).toBe('36px');
      expect(style.height).toBe('36px');
      expect(style.borderWidth).toBe('4px');
    } finally {
      fixture.nativeElement.remove();
    }
  });
});
