import { of, throwError } from 'rxjs';
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
}> = {}): any {
  return {
    getWalkInSchedules: jasmine.createSpy('getWalkInSchedules').and.returnValue(of({ data: [] })),
    createWalkInBooking: jasmine.createSpy('createWalkInBooking').and.returnValue(
      of({ data: { bookingId: 99, bookingNumber: 'BK-99' } })
    ),
    payWalkIn: jasmine.createSpy('payWalkIn').and.returnValue(of({ data: {} })),
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

const validPayload: WalkInCheckoutPayload = {
  contact: {
    title: 'Mr.',
    firstName: 'Somchai',
    lastName: 'Rakdee',
    phoneNumber: '0812345678',
    email: 'somchai@example.com',
  },
  fromStop: 'stop_a',
  toStop: 'stop_b',
  pricePerSeat: 300,
  cashReceived: 300,
};

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
  });

  describe('onSell', () => {
    it('builds booking payload WITHOUT gender and WITHOUT idCard when blank', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];

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

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      expect(callArg.contact.preferredLocale).toBe('th');
    });

    it('creates one passenger per selected seat', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1', 'B2', 'B3'];

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      expect(callArg.departureSchedule.passengers.length).toBe(3);
    });

    it('uses the segment fare from the payload for totalAmount (fare * seat count)', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip({ pricePerSeat: '300' });
      (comp as any).selectedSeats = ['B1', 'B2'];

      // payload.pricePerSeat (170) is the chosen segment's fare, NOT the trip's
      // full-route pricePerSeat (300) — proves the segment fare drives the total.
      (comp as any).onSell({ ...validPayload, pricePerSeat: 170 });

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      expect(callArg.totalAmount).toBe(340);
    });

    it('sends a valid passenger_type lookup slug (not the unresolvable "ADULT")', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      const passenger = callArg.departureSchedule.passengers[0];
      // Backend resolves passenger_type by exact lookup slug; 'ADULT' matched
      // none and 404'd. Must be one of the seeded gender-neutral/role slugs.
      expect(['male', 'female', 'monk', 'nun']).toContain(passenger.passengerType);
    });

    it('stamps each passenger with the passenger type staff selected', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1', 'B2'];
      (comp as any).onPassengerTypeChanged('monk');

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      for (const p of callArg.departureSchedule.passengers) {
        expect(p.passengerType).toBe('monk');
      }
    });

    it('forwards the selected pickup/drop-off stops to the booking schedule', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];

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
  });

  describe('lifecycle', () => {
    it('cleans up on destroy', () => {
      const comp = makeComponent();
      comp.ngOnInit();
      expect(() => comp.ngOnDestroy()).not.toThrow();
    });
  });
});
