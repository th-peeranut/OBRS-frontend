import { of, throwError, Subject } from 'rxjs';
import { SellPageComponent } from './sell-page.component';
import { WalkInTripDto, WalkInRouteGroupDto } from '../../../../services/staff/staff-api.service';
import { createRouterStub, createStoreStub, createTranslateStub } from '../../../../testing/test-stubs';
import { WalkInCheckoutPayload } from '../../components/walk-in-checkout/walk-in-checkout.component';

function makeTrip(overrides: Partial<WalkInTripDto> = {}): WalkInTripDto {
  return {
    scheduleId: 1,
    vehicleType: 'bus',
    licensePlate: 'AB-1234',
    driverName: 'John',
    departureDateTime: '2026-07-01T08:00:00',
    arrivalDateTime: '2026-07-01T12:00:00',
    pricePerSeat: '300',
    capacity: 21,
    availableCount: 15,
    reservedUnpaidCount: 3,
    soldPaidCount: 3,
    availableSeatNumbers: ['1', '2', '3', '4', '5'],
    ...overrides,
  };
}

function makeRouteGroup(trips: WalkInTripDto[] = []): WalkInRouteGroupDto {
  return {
    routeSlug: 'bkk-cm',
    routeLabel: 'Bangkok → Chiang Mai',
    trips,
  };
}

function createStaffApiStub(overrides: Partial<{
  getWalkInSchedules: ReturnType<typeof jasmine.createSpy>;
  createWalkInBooking: ReturnType<typeof jasmine.createSpy>;
  payWalkIn: ReturnType<typeof jasmine.createSpy>;
  getRouteSegments: ReturnType<typeof jasmine.createSpy>;
}> = {}): any {
  return {
    getWalkInSchedules: jasmine.createSpy('getWalkInSchedules').and.returnValue(of({ data: [] })),
    createWalkInBooking: jasmine.createSpy('createWalkInBooking').and.returnValue(
      of({ data: { bookingId: 99, bookingNumber: 'BK-99' } })
    ),
    payWalkIn: jasmine.createSpy('payWalkIn').and.returnValue(of({ data: {} })),
    getRouteSegments: jasmine.createSpy('getRouteSegments').and.returnValue(of({ data: { stopPairs: [] } })),
    ...overrides,
  };
}

function createAlertStub(): any {
  return {
    error: jasmine.createSpy('error').and.returnValue(Promise.resolve()),
    warning: jasmine.createSpy('warning').and.returnValue(Promise.resolve()),
  };
}

function makeComponent(staffApi = createStaffApiStub(), alertService = createAlertStub()): SellPageComponent {
  return new SellPageComponent(
    createRouterStub(),
    createStoreStub(),
    staffApi,
    alertService,
    createTranslateStub()
  );
}

/** A minimal checkout payload (no longer carries fromStop/toStop/pricePerSeat — those live in sell-page). */
const validPayload: WalkInCheckoutPayload = {
  contact: {
    title: 'Mr.',
    firstName: 'Somchai',
    lastName: 'Rakdee',
    phoneNumber: '0812345678',
    email: 'somchai@example.com',
  },
  cashReceived: 300,
};

/** Inject segment fare directly so onSell can build the payload. */
function setSegmentFare(comp: SellPageComponent, fare: number, pickup = 'stop_a', dropoff = 'stop_b'): void {
  (comp as any).fareMap = new Map([[`${pickup}|${dropoff}`, fare]]);
  (comp as any).pickupSlug = pickup;
  (comp as any).dropoffSlug = dropoff;
}

describe('SellPageComponent', () => {
  it('should create', () => {
    const comp = makeComponent();
    expect(comp).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('calls getWalkInSchedules for today on init', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      comp.ngOnInit();
      expect(api.getWalkInSchedules).toHaveBeenCalledTimes(1);
    });

    it('populates routeGroups from API response', () => {
      const trip = makeTrip();
      const groups = [makeRouteGroup([trip])];
      const api = createStaffApiStub({
        getWalkInSchedules: jasmine.createSpy().and.returnValue(of({ data: groups })),
      });
      const comp = makeComponent(api);
      comp.ngOnInit();
      expect((comp as any).routeGroups.length).toBe(1);
    });

    it('renders empty state when API returns empty data array', () => {
      const api = createStaffApiStub({
        getWalkInSchedules: jasmine.createSpy().and.returnValue(of({ data: [] })),
      });
      const comp = makeComponent(api);
      comp.ngOnInit();
      expect((comp as any).routeGroups.length).toBe(0);
    });

    it('sets routeGroups to [] on API error', () => {
      const api = createStaffApiStub({
        getWalkInSchedules: jasmine.createSpy().and.returnValue(throwError(() => new Error('Network error'))),
      });
      const comp = makeComponent(api);
      comp.ngOnInit();
      expect((comp as any).routeGroups).toEqual([]);
    });
  });

  describe('onDateChanged', () => {
    it('triggers getWalkInSchedules with formatted date', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      comp.ngOnInit(); // first call

      const newDate = new Date('2026-07-15');
      (comp as any).onDateChanged(newDate);
      expect(api.getWalkInSchedules).toHaveBeenCalledTimes(2);
      expect(api.getWalkInSchedules.calls.mostRecent().args[0]).toBe('2026-07-15');
    });

    it('clears selectedTrip and seats on date change', () => {
      const comp = makeComponent();
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      (comp as any).onDateChanged(new Date());
      expect((comp as any).selectedTrip).toBeNull();
      expect((comp as any).selectedSeats).toEqual([]);
    });

    it('resets seatPassengerTypes on date change', () => {
      const comp = makeComponent();
      (comp as any).seatPassengerTypes = { B1: 'male', B2: 'female' };
      (comp as any).onDateChanged(new Date());
      expect((comp as any).seatPassengerTypes).toEqual({});
    });
  });

  describe('onPassengerTypeChanged', () => {
    it('updates selectedPassengerType when center-panel emits passengerTypeChange', () => {
      const comp = makeComponent();
      expect((comp as any).selectedPassengerType).toBe('male');
      (comp as any).onPassengerTypeChanged('monk');
      expect((comp as any).selectedPassengerType).toBe('monk');
    });

    it('accepts all valid passenger type slugs', () => {
      const comp = makeComponent();
      for (const slug of ['male', 'female', 'monk', 'nun']) {
        (comp as any).onPassengerTypeChanged(slug);
        expect((comp as any).selectedPassengerType).toBe(slug);
      }
    });

    it('does NOT change already-selected seat types when type changes', () => {
      const comp = makeComponent();
      (comp as any).onPassengerTypeChanged('male');
      (comp as any).onSeatToggled('B1'); // B1 → male
      (comp as any).onPassengerTypeChanged('female');
      // B1 must still be male — changing type must not retro-assign
      expect((comp as any).seatPassengerTypes['B1']).toBe('male');
    });
  });

  describe('onTripSelected', () => {
    it('sets selectedTrip without fetching a separate seat map', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      comp.ngOnInit();
      const trip = makeTrip({ scheduleId: 42 });
      (comp as any).onTripSelected({ trip, routeSlug: 'bkk-cm' });
      expect((comp as any).selectedTrip).toEqual(trip);
      expect((comp as any).selectedRouteSlug).toBe('bkk-cm');
      // Seat availability comes from the trip DTO; no getSeatMap call should exist.
      expect((api as Record<string, unknown>)['getSeatMap']).toBeUndefined();
    });

    it('clears previously selected seats when new trip selected', () => {
      const comp = makeComponent();
      (comp as any).selectedSeats = ['B1', 'B2'];
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      expect((comp as any).selectedSeats).toEqual([]);
    });

    it('resets seatPassengerTypes when new trip selected', () => {
      const comp = makeComponent();
      (comp as any).seatPassengerTypes = { B1: 'male' };
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      expect((comp as any).seatPassengerTypes).toEqual({});
    });
  });

  describe('onSeatToggled', () => {
    it('adds a seat when not yet selected', () => {
      const comp = makeComponent();
      (comp as any).selectedSeats = [];
      (comp as any).onSeatToggled('B1');
      expect((comp as any).selectedSeats).toContain('B1');
    });

    it('removes a seat when already selected', () => {
      const comp = makeComponent();
      (comp as any).selectedSeats = ['B1', 'B2'];
      (comp as any).onSeatToggled('B1');
      expect((comp as any).selectedSeats).not.toContain('B1');
      expect((comp as any).selectedSeats).toContain('B2');
    });

    it('select then deselect leaves selectedSeats empty (length 0)', () => {
      const comp = makeComponent();
      (comp as any).selectedSeats = [];
      (comp as any).onSeatToggled('A1'); // select
      (comp as any).onSeatToggled('A1'); // deselect
      expect((comp as any).selectedSeats.length).toBe(0);
    });

    it('empty string seat is a no-op (phantom guard)', () => {
      const comp = makeComponent();
      (comp as any).selectedSeats = ['B1'];
      (comp as any).onSeatToggled('');
      expect((comp as any).selectedSeats).toEqual(['B1']);
    });

    it('captures passenger type at click time into seatPassengerTypes', () => {
      const comp = makeComponent();
      (comp as any).onPassengerTypeChanged('female');
      (comp as any).onSeatToggled('B1');
      expect((comp as any).seatPassengerTypes['B1']).toBe('female');
    });

    it('removes seat type from seatPassengerTypes when seat is deselected', () => {
      const comp = makeComponent();
      (comp as any).onSeatToggled('B1'); // adds with default 'male'
      (comp as any).onSeatToggled('B1'); // removes
      expect('B1' in (comp as any).seatPassengerTypes).toBeFalse();
    });
  });

  describe('per-seat passenger type (Change 1 core fix)', () => {
    it('seat1 keeps type A after staff switches to type B and adds seat2', () => {
      const comp = makeComponent();
      (comp as any).onPassengerTypeChanged('male');
      (comp as any).onSeatToggled('B1'); // B1 → male
      (comp as any).onPassengerTypeChanged('female');
      (comp as any).onSeatToggled('B2'); // B2 → female

      expect((comp as any).seatPassengerTypes['B1']).toBe('male');
      expect((comp as any).seatPassengerTypes['B2']).toBe('female');
    });

    it('onSell uses per-seat type from seatPassengerTypes in booking payload', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).onPassengerTypeChanged('male');
      (comp as any).onSeatToggled('B1');
      (comp as any).onPassengerTypeChanged('female');
      (comp as any).onSeatToggled('B2');
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      const passengers: { passengerType: string; seatNumber: string }[] = callArg.departureSchedule.passengers;
      const b1 = passengers.find((p) => p.seatNumber === 'B1');
      const b2 = passengers.find((p) => p.seatNumber === 'B2');
      expect(b1?.passengerType).toBe('male');
      expect(b2?.passengerType).toBe('female');
    });
  });

  describe('onSell', () => {
    it('builds booking payload WITHOUT gender and WITHOUT idCard when blank', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      const passenger = callArg.departureSchedule.passengers[0];
      expect('gender' in passenger).toBeFalse();
      expect('identityCardNumber' in passenger).toBeFalse();
    });

    it('includes identityCardNumber in passenger when provided', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      const payloadWithId: WalkInCheckoutPayload = {
        ...validPayload,
        contact: { ...validPayload.contact, identityCardNumber: '1234567890123' },
      };
      (comp as any).onSell(payloadWithId);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      const passenger = callArg.departureSchedule.passengers[0];
      expect(passenger.identityCardNumber).toBe('1234567890123');
    });

    it('sets bookingType to one_way and bookingChannel to walk_in', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      expect(callArg.bookingType).toBe('one_way');
      expect(callArg.bookingChannel).toBe('walk_in');
    });

    it('hardcodes preferredLocale as th in contact', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      expect(callArg.contact.preferredLocale).toBe('th');
    });

    it('creates one passenger per selected seat', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1', 'B2', 'B3'];
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      expect(callArg.departureSchedule.passengers.length).toBe(3);
    });

    it('uses the segment fare from sell-page for totalAmount (fare * seat count)', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip({ pricePerSeat: '300' });
      (comp as any).selectedSeats = ['B1', 'B2'];
      setSegmentFare(comp, 170);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      expect(callArg.totalAmount).toBe(340);
    });

    it('sends a valid passenger_type lookup slug (not the unresolvable "ADULT")', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      const passenger = callArg.departureSchedule.passengers[0];
      expect(['male', 'female', 'monk', 'nun']).toContain(passenger.passengerType);
    });

    it('stamps each passenger with the passenger type staff selected', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      // Add the seats via the real toggle flow so seatPassengerTypes is populated.
      (comp as any).onPassengerTypeChanged('monk');
      (comp as any).onSeatToggled('B1');
      (comp as any).onSeatToggled('B2');
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      const passengers = callArg.departureSchedule.passengers;
      expect(passengers.length).toBe(2);
      for (const p of passengers) {
        expect(p.passengerType).toBe('monk');
      }
    });

    it('forwards the selected pickup/drop-off stops to the booking schedule', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300, 'stop_a', 'stop_b');

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      expect(callArg.departureSchedule.fromStop).toBe('stop_a');
      expect(callArg.departureSchedule.toStop).toBe('stop_b');
    });

    it('calls payWalkIn after successful booking creation', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      expect(api.payWalkIn).toHaveBeenCalledWith(99, jasmine.any(String));
    });

    it('shows alert error on booking failure', () => {
      const alertService = createAlertStub();
      const api = createStaffApiStub({
        createWalkInBooking: jasmine.createSpy().and.returnValue(throwError(() => new Error('API error'))),
      });
      const comp = makeComponent(api, alertService);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      expect(alertService.error).toHaveBeenCalled();
    });

    it('does nothing when selectedTrip is null', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = null;
      (comp as any).selectedSeats = ['B1'];

      (comp as any).onSell(validPayload);

      expect(api.createWalkInBooking).not.toHaveBeenCalled();
    });

    it('resets seatPassengerTypes after a successful sale', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).onSeatToggled('B1');
      (comp as any).seatPassengerTypes = { B1: 'male' };
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      expect((comp as any).seatPassengerTypes).toEqual({});
    });
  });

  describe('re-localization on language change', () => {
    // Stop/route names come from the server resolved by Accept-Language, so they
    // are stale after a language switch unless re-fetched. These guard that the
    // page re-requests them — without resetting the staff's segment selection.
    function segPairsResponse() {
      const pair = (from: string, to: string, fare: string) => ({
        segmentId: 0,
        fromStop: { slug: from, name: from.toUpperCase() },
        toStop: { slug: to, name: to.toUpperCase() },
        vehicleType: { slug: 'bus', name: 'Bus' },
        fare,
        estimatedDurationMinutes: 30,
      });
      return {
        data: {
          stopPairs: [
            pair('stop_a', 'stop_b', '100'),
            pair('stop_b', 'stop_c', '100'),
            pair('stop_a', 'stop_c', '200'),
          ],
        },
      };
    }

    function makeComponentWithTranslate(api = createStaffApiStub()): {
      comp: SellPageComponent;
      translate: any;
    } {
      const translate = createTranslateStub();
      const comp = new SellPageComponent(
        createRouterStub(),
        createStoreStub(),
        api,
        createAlertStub(),
        translate
      );
      return { comp, translate };
    }

    it('re-fetches trips on language change (route-group labels are server-localized)', () => {
      const api = createStaffApiStub();
      const { comp, translate } = makeComponentWithTranslate(api);
      comp.ngOnInit(); // 1st getWalkInSchedules
      (translate.onLangChange as Subject<unknown>).next({ lang: 'th' });
      expect(api.getWalkInSchedules).toHaveBeenCalledTimes(2);
    });

    it('re-fetches segments for the selected trip on language change (core fix)', () => {
      const api = createStaffApiStub({
        getRouteSegments: jasmine.createSpy('getRouteSegments').and.returnValue(of(segPairsResponse())),
      });
      const { comp, translate } = makeComponentWithTranslate(api);
      comp.ngOnInit();
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' }); // 1st getRouteSegments
      (translate.onLangChange as Subject<unknown>).next({ lang: 'th' });
      expect(api.getRouteSegments).toHaveBeenCalledTimes(2);
    });

    it('does NOT re-fetch segments on language change when no trip is selected', () => {
      const api = createStaffApiStub({
        getRouteSegments: jasmine.createSpy('getRouteSegments').and.returnValue(of(segPairsResponse())),
      });
      const { comp, translate } = makeComponentWithTranslate(api);
      comp.ngOnInit();
      (translate.onLangChange as Subject<unknown>).next({ lang: 'th' });
      expect(api.getRouteSegments).not.toHaveBeenCalled();
    });

    it('preserves the current pickup/drop-off selection across the reload', () => {
      const api = createStaffApiStub({
        getRouteSegments: jasmine.createSpy('getRouteSegments').and.returnValue(of(segPairsResponse())),
      });
      const { comp, translate } = makeComponentWithTranslate(api);
      comp.ngOnInit();
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      // Staff narrows the segment away from the default full route (a → c).
      (comp as any).pickupSlug = 'stop_b';
      (comp as any).dropoffSlug = 'stop_c';
      (translate.onLangChange as Subject<unknown>).next({ lang: 'th' });
      expect((comp as any).pickupSlug).toBe('stop_b');
      expect((comp as any).dropoffSlug).toBe('stop_c');
    });

    it('keeps a still-valid pickup but falls back to its first drop-off when the prior drop-off is gone', () => {
      const api = createStaffApiStub({
        getRouteSegments: jasmine.createSpy('getRouteSegments').and.returnValue(of(segPairsResponse())),
      });
      const { comp, translate } = makeComponentWithTranslate(api);
      comp.ngOnInit();
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      (comp as any).pickupSlug = 'stop_a';
      (comp as any).dropoffSlug = 'ghost_stop'; // no longer a valid drop-off for stop_a
      (translate.onLangChange as Subject<unknown>).next({ lang: 'th' });
      expect((comp as any).pickupSlug).toBe('stop_a');
      expect((comp as any).dropoffSlug).toBe('stop_b'); // first valid drop-off for stop_a
    });

    it('resets to the full route default when the preserved pickup is gone', () => {
      const api = createStaffApiStub({
        getRouteSegments: jasmine.createSpy('getRouteSegments').and.returnValue(of(segPairsResponse())),
      });
      const { comp, translate } = makeComponentWithTranslate(api);
      comp.ngOnInit();
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      (comp as any).pickupSlug = 'ghost_stop'; // not present in the re-fetched stops
      (comp as any).dropoffSlug = 'ghost_stop';
      (translate.onLangChange as Subject<unknown>).next({ lang: 'th' });
      expect((comp as any).pickupSlug).toBe('stop_a'); // origin
      expect((comp as any).dropoffSlug).toBe('stop_c'); // destination
    });
  });

  describe('lifecycle', () => {
    it('cleans up on destroy', () => {
      const comp = makeComponent();
      comp.ngOnInit();
      expect(() => comp.ngOnDestroy()).not.toThrow();
    });
  });
});
