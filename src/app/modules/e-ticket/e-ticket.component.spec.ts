import { of, throwError, Subject } from 'rxjs';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';

import { ETicketComponent } from './e-ticket.component';
import { AuthService } from '../../auth/auth.service';
import { BookingService } from '../../services/booking/booking.service';
import { TicketService } from '../../services/ticket/ticket.service';
import { BoardingQrService } from '../../shared/services/boarding-qr.service';
import { BookingTicketsData } from '../../shared/interfaces/booking-ticket.interface';
import { PassengerInfo } from '../../shared/interfaces/passenger-info.interface';

function buildTicketsData(): BookingTicketsData {
  return {
    bookingId: 1,
    bookingNumber: 'B-29RGZW',
    bookingStatus: 'confirmed',
    totalTickets: 2,
    journeys: [
      {
        legType: { code: 'outbound', label: 'Outbound' },
        fromStop: {
          code: 'nong_chak',
          label: 'Nong chak',
          province: { code: 'chonburi', label: 'Chonburi' },
        },
        toStop: {
          code: 'bts_mo_chit',
          label: 'Bts mo chit',
          province: { code: 'bangkok', label: 'Bangkok' },
        },
        departureDateTime: '2026-12-20 08:00:00',
        arrivalDateTime: '2026-12-20 09:48:00',
        vehicle: {
          vehicleType: { code: 'van', label: 'Van' },
          numberPlate: 'กข 1234',
          vehicleNumber: '12-34',
        },
        tickets: [
          {
            id: 1,
            ticketNumber: 'T-Q4QZXTZAFY',
            passengerType: { code: 'male', label: 'Male' },
            passengerName: 'Mr. Abc Def',
            seatNumber: '1',
            status: { code: 'confirmed', label: 'Confirmed' },
            // OBRS-296: server-authoritative fare category.
            fareCategory: 'child',
          },
        ],
      },
      {
        legType: { code: 'inbound', label: 'Inbound' },
        fromStop: {
          code: 'bts_mo_chit',
          label: 'Bts mo chit',
          province: { code: 'bangkok', label: 'Bangkok' },
        },
        toStop: {
          code: 'nong_chak',
          label: 'Nong chak',
          province: { code: 'chonburi', label: 'Chonburi' },
        },
        departureDateTime: '2026-12-20 18:14:00',
        arrivalDateTime: '2026-12-20 20:02:00',
        vehicle: {
          vehicleType: { code: 'van', label: 'Van' },
          numberPlate: 'กข 1234',
          vehicleNumber: '12-34',
        },
        tickets: [
          {
            id: 2,
            ticketNumber: 'T-JJTETZNMF2',
            passengerType: { code: 'male', label: 'Male' },
            passengerName: 'Mr. Abc Def',
            seatNumber: '1',
            status: { code: 'confirmed', label: 'Confirmed' },
          },
        ],
      },
    ],
  };
}

describe('ETicketComponent', () => {
  let component: ETicketComponent;

  const storeStub = {
    pipe: () => of(null),
    dispatch: () => undefined,
  } as unknown as Store;

  const bookingServiceStub = {
    getActiveBookingId: () => 1,
    getBookingTickets: () => of(null),
  } as unknown as BookingService;

  let ticketServiceStub: jasmine.SpyObj<TicketService>;
  let boardingQrService: BoardingQrService;
  // OBRS-858: loadTicketFromApi skips the private ticket call entirely for a guest. Defaults to
  // TRUE so every pre-existing assertion in this file keeps exercising the authenticated path
  // it was written for; the guest case flips it explicitly.
  let authStub: { isAuthenticated: () => boolean };

  const translateStub = {
    onLangChange: new Subject(),
    currentLang: 'en',
  } as unknown as TranslateService;

  beforeEach(() => {
    ticketServiceStub = jasmine.createSpyObj<TicketService>('TicketService', [
      'getBoardingToken',
    ]);
    ticketServiceStub.getBoardingToken.and.returnValue(
      of(null) as unknown as ReturnType<TicketService['getBoardingToken']>
    );
    // Real BoardingQrService wired to the ticket-service stub (not a mock of
    // the service itself) — a fresh instance per test, matching the
    // component-scoped `providers: [BoardingQrService]` lifetime, so the
    // existing assertions on `ticketServiceStub.getBoardingToken` calls stay
    // meaningful (OBRS-221 extraction).
    boardingQrService = new BoardingQrService(ticketServiceStub);
    authStub = { isAuthenticated: () => true };

    component = new ETicketComponent(
      storeStub,
      bookingServiceStub,
      boardingQrService,
      translateStub,
      authStub as unknown as AuthService
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // OBRS-858: the private ticket endpoint could only 401 for a guest, and a token-less 401 is
  // turned by the interceptor into a "Please sign in to continue" toast (OBRS-856) - shown right
  // after the customer paid. Not calling it is the fix; this is what pins that.
  it('does NOT call the private ticket endpoint when the visitor holds no token', async () => {
    authStub.isAuthenticated = () => false;
    const spy = spyOn(bookingServiceStub, 'getBookingTickets').and.callThrough();

    await (component as unknown as {
      loadTicketFromApi: (id: number | null) => Promise<void>;
    }).loadTicketFromApi(1);

    expect(spy).not.toHaveBeenCalled();
  });

  it('DOES call it for a signed-in customer - the skip is about the token, not the page', async () => {
    authStub.isAuthenticated = () => true;
    const spy = spyOn(bookingServiceStub, 'getBookingTickets').and.callThrough();

    await (component as unknown as {
      loadTicketFromApi: (id: number | null) => Promise<void>;
    }).loadTicketFromApi(1);

    expect(spy).toHaveBeenCalledWith(1);
  });

  describe('applyApiOverrides', () => {
    const storePassengers: PassengerInfo[] = [
      {
        isAdult: true,
        title: 1,
        firstName: 'Abc',
        middleName: '',
        lastName: 'Def',
        phoneNumber: '0812345678',
        gender: 'male',
        isSelectSeat: true,
        passengerSeat: '1',
      },
    ];

    function apply(data: BookingTicketsData): void {
      (component as any).ticketApiData = data;
      (component as any).applyApiOverrides('en', storePassengers);
    }

    it('maps booking and ticket numbers from every journey', () => {
      apply(buildTicketsData());

      expect(component.bookingNumber).toBe('B-29RGZW');
      expect(component.ticketNumber).toBe('T-Q4QZXTZAFY, T-JJTETZNMF2');
    });

    it('maps route, origin and destination from the outbound stops', () => {
      apply(buildTicketsData());

      expect(component.origin).toBe('Nong chak');
      expect(component.destination).toBe('Bts mo chit');
      expect(component.route).toBe(
        'Nong chak - Bts mo chit / Bts mo chit - Nong chak'
      );
    });

    it('maps travel date and time from the journeys', () => {
      apply(buildTicketsData());

      expect(component.travelDate).toBe('20 Dec 2026');
      expect(component.travelTime).toBe('08:00 - 09:48 / 18:14 - 20:02');
    });

    it('maps vehicle type from the code/label object shape', () => {
      apply(buildTicketsData());

      expect(component.vehicleType).toBe('Van');
      expect(component.vehiclePlate).toBe('12-34/กข 1234');
    });

    it('maps passengers and seats, matching phone from the store by seat, and threads ticketId/ticketNumber through for the per-ticket QR fetch', () => {
      apply(buildTicketsData());

      // The journey-level seat summary stays outbound-only (OBRS-873 left it
      // alone deliberately — the per-leg seat breakdown lives on the shared
      // card, not on this flat page).
      expect(component.seats).toBe('1');
      // The default ticketServiceStub resolves with no boardingToken, so the
      // (synchronous, since the empty-token branch never awaits) QR fetch has
      // already marked this ticket qrUnavailable by the time we assert here.
      expect(component.passengerGroups[0].passengers).toEqual([
        {
          name: 'Mr. Abc Def',
          phone: '0812345678',
          seat: '1',
          ticketId: 1,
          ticketNumber: 'T-Q4QZXTZAFY',
          qrDataUrl: '',
          qrUnavailable: true,
          seatOpen: false,
          // OBRS-296: server-authoritative — carried from the ticket
          // response's fareCategory, never re-derived client-side.
          fareCategory: 'child',
        },
      ]);
      expect(component.seatsOpen).toBeFalse();
    });

    /**
     * OBRS-873 — this fixture has ALWAYS been a round trip, and the page only
     * ever built rows from its outbound journey: ticket 2 (`T-JJTETZNMF2`)
     * existed in the response and reached no surface at all, so a passenger
     * flying home had no QR to scan. These pin both legs through.
     */
    it('OBRS-873: builds a group per leg, so the RETURN leg\'s ticket gets its own row and QR', () => {
      apply(buildTicketsData());

      expect(component.passengerGroups.length).toBe(2);
      expect(component.passengerGroups[0].isReturn).toBeFalse();
      expect(component.passengerGroups[1].isReturn).toBeTrue();
      expect(
        component.passengerGroups.map((g) => g.passengers.map((p) => p.ticketNumber))
      ).toEqual([['T-Q4QZXTZAFY'], ['T-JJTETZNMF2']]);
      // …and the flat list the QR fetch walks covers both legs' ticket ids.
      expect(component.passengers.map((p) => p.ticketId)).toEqual([1, 2]);
    });

    it('OBRS-873: a one-way booking yields a single unlabelled group', () => {
      const data = buildTicketsData();
      data.journeys = [data.journeys![0]];

      apply(data);

      expect(component.passengerGroups.length).toBe(1);
      expect(component.passengerGroups[0].isReturn).toBeFalse();
      expect(component.passengers.map((p) => p.ticketId)).toEqual([1]);
    });

    it('selects the outbound journey even when legType order changes', () => {
      const data = buildTicketsData();
      data.journeys = [data.journeys![1], data.journeys![0]];

      apply(data);

      expect(component.origin).toBe('Nong chak');
      expect(component.destination).toBe('Bts mo chit');
    });

    it('keeps a one-way booking without a return leg', () => {
      const data = buildTicketsData();
      data.journeys = [data.journeys![0]];

      apply(data);

      expect(component.ticketNumber).toBe('T-Q4QZXTZAFY');
      expect(component.route).toBe('Nong chak - Bts mo chit');
      expect(component.travelTime).toBe('08:00 - 09:48');
    });

    it('does nothing when there is no api data', () => {
      component.bookingNumber = 'STORE-REF';
      (component as any).ticketApiData = null;

      (component as any).applyApiOverrides('en', storePassengers);

      expect(component.bookingNumber).toBe('STORE-REF');
    });

    it('OBRS-269: threads originLatitude/originLongitude from the outbound fromStop coords', () => {
      const data = buildTicketsData();
      data.journeys![0].fromStop!.latitude = 13.7563;
      data.journeys![0].fromStop!.longitude = 100.5018;

      apply(data);

      expect(component.originLatitude).toBe(13.7563);
      expect(component.originLongitude).toBe(100.5018);
    });

    it('OBRS-269: leaves originLatitude/originLongitude null when the outbound fromStop has no coords', () => {
      apply(buildTicketsData());

      expect(component.originLatitude).toBeNull();
      expect(component.originLongitude).toBeNull();
    });

    it('OBRS-325: an OPEN ticket (null seatNumber) flags seatOpen on the passenger and seatsOpen overall, and seat falls back to "-"', () => {
      const data = buildTicketsData();
      data.journeys![0].tickets![0].seatNumber = undefined;

      apply(data);

      expect(component.seatsOpen).toBeTrue();
      expect(component.passengers[0].seat).toBe('-');
      expect(component.passengers[0].seatOpen).toBeTrue();
    });

    it('OBRS-325 (ASSIGNED regression): a ticket with a seatNumber keeps seatOpen false and the real seat unchanged', () => {
      apply(buildTicketsData());

      expect(component.seatsOpen).toBeFalse();
      expect(component.passengers[0].seat).toBe('1');
      expect(component.passengers[0].seatOpen).toBeFalse();
    });
  });

  describe('OBRS-350: e-ticket passenger phone resolution under OPEN seating', () => {
    function openTicketsData(
      tickets: { id: number; ticketNumber: string; passengerName: string }[]
    ): BookingTicketsData {
      const data = buildTicketsData();
      data.journeys = [
        {
          ...data.journeys![0],
          tickets: tickets.map((t) => ({
            ...t,
            seatNumber: undefined,
            status: { code: 'confirmed', label: 'Confirmed' },
          })),
        },
      ];
      return data;
    }

    function apply(
      data: BookingTicketsData,
      storePassengers: PassengerInfo[]
    ): void {
      (component as any).ticketApiData = data;
      (component as any).applyApiOverrides('en', storePassengers);
    }

    function passenger(
      firstName: string,
      lastName: string,
      phoneNumber: string
    ): PassengerInfo {
      return {
        isAdult: true,
        title: 1,
        firstName,
        middleName: '',
        lastName,
        phoneNumber,
        gender: 'male',
        isSelectSeat: false,
        passengerSeat: '',
      };
    }

    it('resolves each passenger phone by name when seatNumber is null, regardless of store-list order', () => {
      const data = openTicketsData([
        { id: 1, ticketNumber: 'T-1', passengerName: 'Mr. Alice Wong' },
        { id: 2, ticketNumber: 'T-2', passengerName: 'Ms. Bob Lee' },
      ]);
      // Store order intentionally reversed vs. ticket order, so a positional
      // (index) match would give the WRONG phone — only a real name match
      // gets this right.
      const storePassengers = [
        passenger('Bob', 'Lee', '0822222222'),
        passenger('Alice', 'Wong', '0811111111'),
      ];

      apply(data, storePassengers);

      expect(component.passengers[0].name).toBe('Mr. Alice Wong');
      expect(component.passengers[0].phone).toBe('0811111111');
      expect(component.passengers[1].name).toBe('Ms. Bob Lee');
      expect(component.passengers[1].phone).toBe('0822222222');
    });

    it('ASSIGNED regression: seat-based match is untouched when real seat numbers are present, even with the same store-list reordering trick', () => {
      const data = buildTicketsData();
      data.journeys = [
        {
          ...data.journeys![0],
          tickets: [
            { id: 1, ticketNumber: 'T-1', passengerName: 'Mr. Alice Wong', seatNumber: '2' },
            { id: 2, ticketNumber: 'T-2', passengerName: 'Ms. Bob Lee', seatNumber: '5' },
          ],
        },
      ];
      const storePassengers = [
        { ...passenger('Bob', 'Lee', '0822222222'), passengerSeat: '5' },
        { ...passenger('Alice', 'Wong', '0811111111'), passengerSeat: '2' },
      ];

      apply(data, storePassengers);

      expect(component.passengers[0].seat).toBe('2');
      expect(component.passengers[0].phone).toBe('0811111111');
      expect(component.passengers[1].seat).toBe('5');
      expect(component.passengers[1].phone).toBe('0822222222');
    });

    it('OPEN + duplicate passenger names: falls back to positional index within an aligned (same-length) list, never leaking the wrong phone', () => {
      const data = openTicketsData([
        { id: 1, ticketNumber: 'T-1', passengerName: 'Mr. Sam Lee' },
        { id: 2, ticketNumber: 'T-2', passengerName: 'Mr. Sam Lee' },
      ]);
      const storePassengers = [
        passenger('Sam', 'Lee', '0810000001'),
        passenger('Sam', 'Lee', '0810000002'),
      ];

      apply(data, storePassengers);

      expect(component.passengers[0].phone).toBe('0810000001');
      expect(component.passengers[1].phone).toBe('0810000002');
    });

    it('OPEN + round-trip/length-mismatch (store holds more/fewer passengers than this leg has tickets): ambiguous name + mismatched length never guesses positionally — falls back to "-"', () => {
      const data = openTicketsData([
        { id: 1, ticketNumber: 'T-1', passengerName: 'Mr. Sam Lee' },
        { id: 2, ticketNumber: 'T-2', passengerName: 'Mr. Sam Lee' },
      ]);
      // storePassengers holds 3 entries (e.g. a round-trip where the store
      // carries every passenger for the whole booking) while this leg has
      // only 2 tickets — lengths don't correspond, and the name is
      // ambiguous, so neither fallback may guess.
      const storePassengers = [
        passenger('Sam', 'Lee', '0810000001'),
        passenger('Sam', 'Lee', '0810000002'),
        passenger('Alex', 'Chan', '0810000003'),
      ];

      apply(data, storePassengers);

      expect(component.passengers[0].phone).toBe('-');
      expect(component.passengers[1].phone).toBe('-');
    });

    it('OPEN + unique name match still resolves correctly even when list lengths differ', () => {
      const data = openTicketsData([
        { id: 1, ticketNumber: 'T-1', passengerName: 'Mr. Alice Wong' },
      ]);
      const storePassengers = [
        passenger('Alice', 'Wong', '0811111111'),
        passenger('Bob', 'Lee', '0822222222'),
        passenger('Carol', 'Ng', '0833333333'),
      ];

      apply(data, storePassengers);

      expect(component.passengers[0].phone).toBe('0811111111');
    });
  });

  describe('navigateToPickup (OBRS-269)', () => {
    it('opens the Google Maps directions deep-link when coords are present', () => {
      component.originLatitude = 13.7563;
      component.originLongitude = 100.5018;
      const openSpy = spyOn(window, 'open');

      component.navigateToPickup();

      expect(openSpy).toHaveBeenCalledWith(
        'https://www.google.com/maps/dir/?api=1&destination=13.7563,100.5018&travelmode=driving',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('does nothing when coords are missing', () => {
      component.originLatitude = null;
      component.originLongitude = null;
      const openSpy = spyOn(window, 'open');

      component.navigateToPickup();

      expect(openSpy).not.toHaveBeenCalled();
    });
  });

  describe('per-ticket boarding-token QR fetch (OBRS-96)', () => {
    const storePassengers: PassengerInfo[] = [];

    function twoTicketData(): BookingTicketsData {
      const data = buildTicketsData();
      // OBRS-873: one-way on purpose. This fixture is about TWO TICKETS ON ONE
      // LEG (one of them cancelled); keeping the inbound journey would add a
      // third ticket and make "the other ticket's QR still renders" ambiguous.
      data.journeys = [data.journeys![0]];
      data.journeys[0].tickets = [
        {
          id: 1,
          ticketNumber: 'T-OK',
          passengerName: 'Mr. Ok Passenger',
          seatNumber: '1',
          status: { code: 'confirmed', label: 'Confirmed' },
        },
        {
          id: 2,
          ticketNumber: 'T-CANCELLED',
          passengerName: 'Mr. Cancelled Passenger',
          seatNumber: '2',
          status: { code: 'cancelled', label: 'Cancelled' },
        },
      ];
      return data;
    }

    function apply(data: BookingTicketsData): void {
      (component as any).ticketApiData = data;
      (component as any).applyApiOverrides('en', storePassengers);
    }

    it('fetches one boarding token per ticketId — across BOTH legs of a round trip (OBRS-873)', () => {
      apply(buildTicketsData());

      expect(ticketServiceStub.getBoardingToken.calls.allArgs()).toEqual([[1], [2]]);
    });

    it('does not re-issue the GET for a ticket already fetched/in-flight (duplicate-fetch guard, e.g. a locale switch)', () => {
      apply(buildTicketsData());
      apply(buildTicketsData());

      // Two tickets (one per leg), fetched once each — not four calls.
      expect(ticketServiceStub.getBoardingToken).toHaveBeenCalledTimes(2);
    });

    it('isolates one ticket\'s failure via forkJoin + per-inner catchError — the other ticket\'s QR still renders, the page never blanks', async () => {
      ticketServiceStub.getBoardingToken.and.callFake((ticketId: number) =>
        ticketId === 1
          ? (of({ code: 200, message: 'OK', data: { ticketId: 1, ticketNumber: 'T-OK', boardingToken: 'valid-token-1', expiresAt: '' } }) as never)
          : (throwError(() => ({ error: { errorCode: 'TICKET_NOT_CONFIRMED' } })) as never)
      );

      apply(twoTicketData());
      // Let the forkJoin subscription + the real QRCode.toDataURL promise settle.
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(component.passengers.length).toBe(2);
      const okPassenger = component.passengers.find((p) => p.ticketId === 1);
      const cancelledPassenger = component.passengers.find((p) => p.ticketId === 2);

      expect(okPassenger?.qrUnavailable).toBeFalse();
      expect(okPassenger?.qrDataUrl).toContain('data:image');
      expect(cancelledPassenger?.qrUnavailable).toBeTrue();
      expect(cancelledPassenger?.qrDataUrl).toBe('');
    });
  });
});
