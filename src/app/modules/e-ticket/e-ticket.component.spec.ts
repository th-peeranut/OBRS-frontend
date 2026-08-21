import { of, throwError, Subject } from 'rxjs';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';

import { ETicketComponent } from './e-ticket.component';
import { AuthService } from '../../auth/auth.service';
import { BookingService } from '../../services/booking/booking.service';
import { RouteMapService } from '../../services/route-map/route-map.service';
import { TicketService } from '../../services/ticket/ticket.service';
import { BoardingQrService } from '../../shared/services/boarding-qr.service';
import { BookingTicketsData } from '../../shared/interfaces/booking-ticket.interface';
import { PassengerInfo } from '../../shared/interfaces/passenger-info.interface';
import { Schedule, ScheduleFilter } from '../../shared/interfaces/schedule.interface';
import { StationApi } from '../../shared/interfaces/station.interface';

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
  // OBRS-1249: the PUBLIC route lookup the pre-API render leans on. Defaults to
  // "no data" so every assertion written before this card keeps exercising the
  // stop/station-pair fallback it was written for.
  let routeMapStub: jasmine.SpyObj<RouteMapService>;

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
    routeMapStub = jasmine.createSpyObj<RouteMapService>('RouteMapService', [
      'getPickupDropoffCached',
    ]);
    routeMapStub.getPickupDropoffCached.and.returnValue(of(null));

    component = new ETicketComponent(
      storeStub,
      bookingServiceStub,
      boardingQrService,
      translateStub,
      authStub as unknown as AuthService,
      routeMapStub
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

  /**
   * OBRS-1249 — the "route" line names the ROUTE, on both of this page's render
   * passes.
   *
   * OBRS-1219 reversed OBRS-264's province pair for that one line, but only on
   * `mapBookingTicketsToCard`, whose sole consumer is the my-bookings modal.
   * This page builds its own line, so the same booking read two different ways
   * to the same customer. The two passes are pinned separately on purpose:
   *
   *  - the STORE pass is the only one a guest ever gets (`loadTicketFromApi`
   *    returns early without a token, OBRS-858, and `/e-ticket` carries no
   *    `requireAuth`), and it has to reach the name through the PUBLIC route
   *    lookup because the store holds `routeSlug` and nothing else;
   *  - the API pass has the resolved name in hand already (`routeLabel`).
   *
   * If only one of them were fixed the line would change under the customer
   * mid-load, which is worse than being consistently old.
   */
  describe('the route line names the route, not the endpoints (OBRS-1249)', () => {
    const stations = [
      { id: 1, slug: 'nong-chak-station' },
      { id: 2, slug: 'mo-chit-station' },
    ] as unknown as StationApi[];

    function scheduleWith(id: number, routeSlug?: string): Schedule {
      return {
        id,
        routeSlug,
        pricePerSeat: '0',
        departureDateTime: '2026-12-20T08:00:00+07:00',
        arrivalDateTime: '2026-12-20T09:48:00+07:00',
      } as unknown as Schedule;
    }

    function titles(map: Record<string, string>) {
      return of({ route: { titleLocalized: map } } as never);
    }

    /** Runs the store-only first paint — what a guest sees, and everyone's
     *  first frame. */
    function paint(schedules: Schedule[], locale: 'en' | 'th' | 'zh' = 'th'): void {
      (component as any).mapTicketFields(
        { schedule: schedules },
        null,
        { startStationId: 1, stopStationId: 2 },
        null,
        stations,
        locale
      );
    }

    it('a guest gets the route name, resolved through the PUBLIC lookup off routeSlug', () => {
      routeMapStub.getPickupDropoffCached.and.returnValue(
        titles({ th: 'หนองชาก-บ้านบึง-กรุงเทพฯ', en: 'Nong Chak-Ban Bueng-Bangkok' })
      );
      authStub.isAuthenticated = () => false;

      paint([scheduleWith(1, 'chonburi-bangkok')]);

      expect(routeMapStub.getPickupDropoffCached).toHaveBeenCalledWith('chonburi-bangkok');
      expect(component.route).toBe('หนองชาก-บ้านบึง-กรุงเทพฯ');
    });

    it('a round trip names BOTH legs from their own route, not the outbound one twice', () => {
      routeMapStub.getPickupDropoffCached.and.callFake((slug: string) =>
        slug === 'chonburi-bangkok'
          ? titles({ th: 'หนองชาก-บ้านบึง-กรุงเทพฯ' })
          : titles({ th: 'กรุงเทพฯ-บ้านบึง-หนองชาก' })
      );

      paint([scheduleWith(1, 'chonburi-bangkok'), scheduleWith(2, 'bangkok-chonburi')]);

      expect(component.route).toBe('หนองชาก-บ้านบึง-กรุงเทพฯ / กรุงเทพฯ-บ้านบึง-หนองชาก');
    });

    // The same ladder OBRS-1219's RouteLabelResolver applies server-side, so
    // the two surfaces agree in an unseeded language too. `zh` is seeded on no
    // route today (OBRS-1046) — and `RouteMeta.titleLocalized` TYPES all three
    // locales as required while the backend only sends the seeded ones, so
    // trusting the type here would render `undefined`.
    it('falls back requested locale → th when the language is unseeded', () => {
      routeMapStub.getPickupDropoffCached.and.returnValue(
        titles({ th: 'หนองชาก-บ้านบึง-กรุงเทพฯ', en: 'Nong Chak-Ban Bueng-Bangkok' })
      );

      paint([scheduleWith(1, 'chonburi-bangkok')], 'zh');

      expect(component.route).toBe('หนองชาก-บ้านบึง-กรุงเทพฯ');
    });

    it('keeps the station pair — never the slug — when the route has no name at all', () => {
      routeMapStub.getPickupDropoffCached.and.returnValue(titles({}));

      paint([scheduleWith(1, 'chonburi-bangkok')]);

      expect(component.route).toBe('nong-chak-station - mo-chit-station');
      expect(component.route).not.toContain('chonburi-bangkok');
    });

    // getPickupDropoffCached swallows a failure to null by design. A route
    // lookup falling over must leave the ticket on its old line, not put an
    // error in front of someone who has just paid.
    it('a failed lookup degrades to the station pair instead of blanking or erroring', () => {
      routeMapStub.getPickupDropoffCached.and.returnValue(of(null));

      expect(() => paint([scheduleWith(1, 'chonburi-bangkok')])).not.toThrow();
      expect(component.route).toBe('nong-chak-station - mo-chit-station');
    });

    it('asks once for an out-and-back on the same physical route', () => {
      routeMapStub.getPickupDropoffCached.and.returnValue(titles({ th: 'สายเดียว' }));

      paint([scheduleWith(1, 'chonburi-bangkok'), scheduleWith(2, 'chonburi-bangkok')]);

      expect(routeMapStub.getPickupDropoffCached).toHaveBeenCalledTimes(1);
    });

    describe('the API overlay pass', () => {
      function overlay(data: BookingTicketsData): void {
        (component as any).ticketApiData = data;
        (component as any).applyApiOverrides('en', null);
      }

      it('renders routeLabel from the tickets response, beating the stop pair', () => {
        const data = buildTicketsData();
        data.journeys![0].routeLabel = 'Nong Chak-Ban Bueng-Bangkok';
        data.journeys![1].routeLabel = 'Bangkok-Ban Bueng-Nong Chak';

        overlay(data);

        expect(component.route).toBe(
          'Nong Chak-Ban Bueng-Bangkok / Bangkok-Ban Bueng-Nong Chak'
        );
        // AC-2 of OBRS-1219 still holds here: the stop rows are the STOPS.
        expect(component.origin).toBe('Nong chak');
        expect(component.destination).toBe('Bts mo chit');
      });

      // A route seeded one way and not the other is a real state — the two
      // directions are two rows in route_translations. Dropping the name that
      // WAS written, to keep the line uniform, hides the owner's own work.
      it('names the legs independently when only one direction is seeded', () => {
        const data = buildTicketsData();
        data.journeys![0].routeLabel = 'Nong Chak-Ban Bueng-Bangkok';
        data.journeys![1].routeLabel = null;

        overlay(data);

        expect(component.route).toBe(
          'Nong Chak-Ban Bueng-Bangkok / Bts mo chit - Nong chak'
        );
      });

      it('falls back to the stop pair when the response carries no name', () => {
        const data = buildTicketsData();
        data.journeys![0].routeLabel = null;
        data.journeys![1].routeLabel = null;

        overlay(data);

        expect(component.route).toBe('Nong chak - Bts mo chit / Bts mo chit - Nong chak');
      });

      // The defect this card is named for: one pass fixed and the other not
      // means the line changes value while the customer is looking at it.
      it('agrees with the store pass, so the line does not change mid-load', () => {
        routeMapStub.getPickupDropoffCached.and.returnValue(
          titles({ en: 'Nong Chak-Ban Bueng-Bangkok' })
        );
        paint([scheduleWith(1, 'chonburi-bangkok')], 'en');
        const afterFirstPaint = component.route;

        const data = buildTicketsData();
        data.journeys = [data.journeys![0]];
        data.journeys[0].routeLabel = 'Nong Chak-Ban Bueng-Bangkok';
        overlay(data);

        expect(afterFirstPaint).toBe('Nong Chak-Ban Bueng-Bangkok');
        expect(component.route).toBe(afterFirstPaint);
      });
    });
  });

  /**
   * OBRS-1246. OBRS-1222 stopped the global modal for `GET /api/stops` and put an
   * inline surface in its place on two pages. This page was not one of them, and
   * `getStationLabelById` returns `''` on a miss, so a roster failure with an
   * empty localStorage cache produced a ticket whose origin and destination were
   * `-` with nothing on screen saying why.
   *
   * The flag, not the `-`, is what the template reads: `-` is this page's generic
   * "no data yet" placeholder and cannot be told apart from a real failure.
   */
  describe('OBRS-1246: stationLabelsUnresolved', () => {
    function station(id: number, slug: string, label: string): StationApi {
      return {
        id,
        slug,
        status: 'active',
        stopType: 'station',
        createdAt: '',
        updatedAt: '',
        translations: [{ locale: 'en', label }],
      };
    }

    const filter = {
      roundTrip: { name: 'One way', code: 'one_way' },
      passengerInfo: [{ type: 'adult', count: 1 }],
      startStationId: 11,
      stopStationId: 22,
      departureDate: '2026-12-20',
    } as unknown as ScheduleFilter;

    function mapFromStore(stationList: StationApi[]): void {
      (component as unknown as {
        mapTicketFields: (
          a: null,
          b: null,
          c: ScheduleFilter,
          d: null,
          e: StationApi[],
          f: 'en'
        ) => void;
      }).mapTicketFields(null, null, filter, null, stationList, 'en');
    }

    it('flags the ticket when the roster is empty - the case a failed /api/stops leaves behind', () => {
      mapFromStore([]);

      expect(component.origin).toBe('-');
      expect(component.destination).toBe('-');
      expect(component.stationLabelsUnresolved).toBeTrue();
    });

    it('flags it when only ONE of the two ids resolves - half a route is still unreadable at the gate', () => {
      mapFromStore([station(11, 'nong_chak', 'Nong chak')]);

      expect(component.origin).toBe('Nong chak');
      expect(component.destination).toBe('-');
      expect(component.stationLabelsUnresolved).toBeTrue();
    });

    it('does NOT flag it when the roster resolves both - no notice on the ordinary path', () => {
      mapFromStore([
        station(11, 'nong_chak', 'Nong chak'),
        station(22, 'bts_mo_chit', 'Bts mo chit'),
      ]);

      expect(component.origin).toBe('Nong chak');
      expect(component.destination).toBe('Bts mo chit');
      expect(component.stationLabelsUnresolved).toBeFalse();
    });

    /**
     * The reason this page cannot just drop `<app-station-load-error>` in bare the
     * way `home-booking` does: for a SIGNED-IN customer the tickets API supplies
     * the names the roster could not, so the ticket is complete and a notice would
     * be an interruption for someone with nothing wrong.
     */
    it('clears the flag when the tickets API supplies both names', () => {
      mapFromStore([]);
      expect(component.stationLabelsUnresolved).toBeTrue();

      (component as unknown as { ticketApiData: BookingTicketsData }).ticketApiData =
        buildTicketsData();
      (component as unknown as {
        applyApiOverrides: (locale: 'en', passengers: null) => void;
      }).applyApiOverrides('en', null);

      expect(component.origin).toBe('Nong chak');
      expect(component.destination).toBe('Bts mo chit');
      expect(component.stationLabelsUnresolved).toBeFalse();
    });

    it('keeps the flag when the API supplies only one name - BOTH is the condition', () => {
      mapFromStore([]);
      const data = buildTicketsData();
      (data.journeys ?? [])[0].toStop = {
        code: '',
        label: '',
        province: { code: '', label: '' },
      };

      (component as unknown as { ticketApiData: BookingTicketsData }).ticketApiData = data;
      (component as unknown as {
        applyApiOverrides: (locale: 'en', passengers: null) => void;
      }).applyApiOverrides('en', null);

      expect(component.origin).toBe('Nong chak');
      expect(component.destination).toBe('-');
      expect(component.stationLabelsUnresolved).toBeTrue();
    });
  });

  /**
   * OBRS-1252. The banner exists for one population: a hard load of /e-ticket that restored the
   * TRIP and provably cannot restore the TICKET, because `booking-context-storage.ts` admits trip
   * identifiers only (PDPA) and the only ticket API needs a token.
   *
   * Each case below is a separate assertion because the ways this can be wrong are not the same
   * failure: firing when a signed-in customer is mid-fetch is a banner that flashes at someone
   * with nothing wrong; not firing on the guest hard load is the bug still shipping.
   */
  describe('OBRS-1252: ticketIncomplete', () => {
    const filter = {
      roundTrip: { name: 'One way', code: 'one_way' },
      passengerInfo: [{ type: 'adult', count: 1 }],
      startStationId: 11,
      stopStationId: 22,
      departureDate: '2026-12-20',
    } as unknown as ScheduleFilter;

    function mapFromStore(booking: { bookingId: number; bookingNumber: string } | null): void {
      (component as unknown as {
        mapTicketFields: (
          a: null,
          b: unknown,
          c: ScheduleFilter,
          d: null,
          e: StationApi[],
          f: 'en'
        ) => void;
      }).mapTicketFields(null, booking, filter, null, [], 'en');
    }

    it('flags the guest hard load - no booking reference in the store and no token to fetch one', () => {
      authStub.isAuthenticated = () => false;

      mapFromStore(null);

      expect(component.bookingNumber).toBe('-');
      expect(component.ticketIncomplete).toBeTrue();
    });

    /**
     * The banner must not appear for a signed-in customer who hard-loads the same URL: they hold
     * a token and an `active_booking_id`, so `loadTicketFromApi` is about to fill the ticket in.
     * A banner shown in that gap is a lie that corrects itself a moment later, which is worse
     * than one that never appeared.
     */
    it('does NOT flag it for a signed-in customer with a booking id - the API pass is coming', () => {
      authStub.isAuthenticated = () => true;

      mapFromStore(null);

      expect(component.bookingNumber).toBe('-');
      expect(component.ticketIncomplete).toBeFalse();
    });

    it('does NOT flag it when the store still holds the booking - the in-session arrival from checkout', () => {
      authStub.isAuthenticated = () => false;

      mapFromStore({ bookingId: 1, bookingNumber: 'B-29RGZW' });

      expect(component.bookingNumber).toBe('B-29RGZW');
      expect(component.ticketIncomplete).toBeFalse();
    });

    /**
     * Both halves of the condition are load-bearing, so each is failed on its own. Here the
     * visitor IS signed in and there is still nothing to fetch with.
     */
    it('flags it for a signed-in customer with no booking id at all', () => {
      authStub.isAuthenticated = () => true;
      spyOn(bookingServiceStub, 'getActiveBookingId').and.returnValue(null);

      mapFromStore(null);

      expect(component.ticketIncomplete).toBeTrue();
    });

    it('clears the flag the moment the tickets API supplies a booking number', () => {
      authStub.isAuthenticated = () => false;
      mapFromStore(null);
      expect(component.ticketIncomplete).toBeTrue();

      (component as unknown as { ticketApiData: BookingTicketsData }).ticketApiData =
        buildTicketsData();
      (component as unknown as {
        applyApiOverrides: (locale: 'en', passengers: null) => void;
      }).applyApiOverrides('en', null);

      expect(component.bookingNumber).toBe('B-29RGZW');
      expect(component.ticketIncomplete).toBeFalse();
    });
  });

  describe('OBRS-1502: the arrival DATE of a leg that lands on a later day', () => {
    function leg(departureDateTime: string, arrivalDateTime: string): Schedule {
      return {
        id: 1,
        pricePerSeat: '0',
        departureDateTime,
        arrivalDateTime,
      } as unknown as Schedule;
    }

    /** The store-only first paint - the pass a guest never gets past. */
    function paint(schedules: Schedule[]): void {
      (component as any).mapTicketFields(
        { schedule: schedules },
        null,
        { startStationId: 1, stopStationId: 2 },
        null,
        [],
        'en'
      );
    }

    function overnightJourneys(): BookingTicketsData {
      const data = buildTicketsData();
      const journeys = data.journeys ?? [];
      journeys[0].departureDateTime = '2026-12-20T23:30:00+07:00';
      journeys[0].arrivalDateTime = '2026-12-21T01:05:00+07:00';
      journeys[1].departureDateTime = '2026-12-24T08:00:00+07:00';
      journeys[1].arrivalDateTime = '2026-12-24T09:48:00+07:00';
      return data;
    }

    it('names the day the bus actually gets in', () => {
      paint([leg('2026-12-20T23:30:00+07:00', '2026-12-21T01:05:00+07:00')]);

      expect(component.travelDate).toBe('20 Dec 2026');
      expect(component.travelTime).toBe('23:30 - 01:05');
      expect(component.arrivalDate).toBe('21 Dec 2026');
    });

    it('says nothing at all when the trip lands on the day it left (AC2)', () => {
      paint([leg('2026-12-20T08:00:00+07:00', '2026-12-20T09:48:00+07:00')]);

      expect(component.arrivalDate).toBe('');
    });

    it('names the real day when the trip crosses two nights, never a counter (AC3)', () => {
      paint([leg('2026-12-20T23:30:00+07:00', '2026-12-22T06:00:00+07:00')]);

      expect(component.arrivalDate).toBe('22 Dec 2026');
    });

    it('marks the crossing leg only, in the same leg order the two cells above use (AC5)', () => {
      paint([
        leg('2026-12-20T23:30:00+07:00', '2026-12-21T01:05:00+07:00'),
        leg('2026-12-24T08:00:00+07:00', '2026-12-24T09:48:00+07:00'),
      ]);

      expect(component.arrivalDate).toBe('21 Dec 2026 / -');
    });

    it('is filled by the API pass as well, not only by the store pass', () => {
      (component as any).ticketApiData = overnightJourneys();
      (component as any).applyApiOverrides('en', null);

      expect(component.arrivalDate).toBe('21 Dec 2026 / -');
    });

    it('does not let an API pass with no timestamps wipe what the store pass found', () => {
      paint([leg('2026-12-20T23:30:00+07:00', '2026-12-21T01:05:00+07:00')]);

      const data = buildTicketsData();
      (data.journeys ?? []).forEach((journey) => {
        journey.departureDateTime = undefined as unknown as string;
        journey.arrivalDateTime = undefined as unknown as string;
      });
      (component as any).ticketApiData = data;
      (component as any).applyApiOverrides('en', null);

      expect(component.arrivalDate).toBe('21 Dec 2026');
    });
  });
});
