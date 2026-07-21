import { BehaviorSubject, of, throwError, Subject } from 'rxjs';
import { FormBuilder } from '@angular/forms';
import { SellPageComponent } from './sell-page.component';
import { WalkInTripDto, WalkInRouteGroupDto } from '../../../../services/staff/staff-api.service';
import { createRouterStub, createTranslateStub } from '../../../../testing/test-stubs';
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

function makeRouteGroup(routeSlug: string, trips: WalkInTripDto[]): WalkInRouteGroupDto {
  return {
    routeSlug,
    routeLabel: `Route ${routeSlug}`,
    trips,
  };
}

function createStaffApiStub(overrides: Partial<{
  getWalkInSchedules: ReturnType<typeof jasmine.createSpy>;
  createWalkInBooking: ReturnType<typeof jasmine.createSpy>;
  payWalkIn: ReturnType<typeof jasmine.createSpy>;
  getRouteSegments: ReturnType<typeof jasmine.createSpy>;
  getRouteStops: ReturnType<typeof jasmine.createSpy>;
  getMe: ReturnType<typeof jasmine.createSpy>;
}> = {}): any {
  return {
    getWalkInSchedules: jasmine.createSpy('getWalkInSchedules').and.returnValue(of({ data: [] })),
    createWalkInBooking: jasmine.createSpy('createWalkInBooking').and.returnValue(
      of({ data: { bookingId: 99, bookingNumber: 'BK-99' } })
    ),
    payWalkIn: jasmine.createSpy('payWalkIn').and.returnValue(of({ data: {} })),
    getRouteSegments: jasmine.createSpy('getRouteSegments').and.returnValue(of({ data: { stopPairs: [] } })),
    getRouteStops: jasmine.createSpy('getRouteStops').and.returnValue(of({ data: { stops: [] } })),
    // OBRS-193: default = no assigned sales point (salesPointStop: null), same as
    // any account that hasn't been assigned one — origin-default behavior is
    // unaffected for every pre-existing test that doesn't override this.
    getMe: jasmine.createSpy('getMe').and.returnValue(of({ data: { salesPointStop: null } })),
    ...overrides,
  };
}

function createAdminApiStub(): any {
  return {
    createSchedule: jasmine.createSpy('createSchedule').and.returnValue(of({})),
    updateSchedule: jasmine.createSpy('updateSchedule').and.returnValue(of({})),
    deleteSchedule: jasmine.createSpy('deleteSchedule').and.returnValue(of({})),
    getScheduleById: jasmine.createSpy('getScheduleById').and.returnValue(of({ data: null })),
  };
}

function createScheduleStoreStub(hasValue = false): any {
  const sub = new BehaviorSubject<null>(null);
  return {
    data$: sub.asObservable(),
    hasValue,
    refresh: jasmine.createSpy('refresh').and.returnValue(Promise.resolve()),
  };
}

/** Store stub that exposes the BehaviorSubject for mid-test data emissions. */
function createControllableScheduleStoreStub(): {
  store: any;
  subject: BehaviorSubject<any>;
  hasValueRef: { value: boolean };
} {
  const subject = new BehaviorSubject<any>(null);
  const hasValueRef = { value: false };
  const store = {
    get data$() { return subject.asObservable(); },
    get hasValue() { return hasValueRef.value; },
    refresh: jasmine.createSpy('refresh').and.callFake(() => {
      hasValueRef.value = true;
      return Promise.resolve();
    }),
  };
  return { store, subject, hasValueRef };
}

function createAlertStub(): any {
  return {
    error: jasmine.createSpy('error').and.returnValue(Promise.resolve()),
    warning: jasmine.createSpy('warning').and.returnValue(Promise.resolve()),
    success: jasmine.createSpy('success').and.returnValue(Promise.resolve()),
    // OBRS-195: the post-sale success prompt now offers a "Print ticket"
    // choice via AlertService.confirm(); default to "not confirmed" (staff
    // dismissed/closed) so existing tests that don't care about printing are
    // unaffected — tests that DO care override this per-call.
    confirm: jasmine.createSpy('confirm').and.returnValue(Promise.resolve(false)),
  };
}

function makeComponent(
  staffApi = createStaffApiStub(),
  alertService = createAlertStub(),
  adminApi = createAdminApiStub(),
  scheduleStore = createScheduleStoreStub(),
  router = createRouterStub()
): SellPageComponent {
  return new SellPageComponent(
    staffApi,
    alertService,
    createTranslateStub(),
    new FormBuilder(),
    adminApi,
    scheduleStore,
    router
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
      const groups = [makeRouteGroup('bkk-cm', [trip])];
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

    it('resets passengerCount to 1 on date change (OBRS-324)', () => {
      const comp = makeComponent();
      (comp as any).passengerCount = 5;
      (comp as any).onDateChanged(new Date());
      expect((comp as any).passengerCount).toBe(1);
    });

    it('resets seatPassengerTypes on date change', () => {
      const comp = makeComponent();
      (comp as any).seatPassengerTypes = { B1: 'male', B2: 'female' };
      (comp as any).onDateChanged(new Date());
      expect((comp as any).seatPassengerTypes).toEqual({});
    });

    it('resets activeTabIndex to 0 on date change (OBRS-130 checkout/center layout follow-up)', () => {
      const comp = makeComponent();
      (comp as any).activeTabIndex = 2;
      (comp as any).onDateChanged(new Date());
      expect((comp as any).activeTabIndex).toBe(0);
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

    it('resets passengerCount to 1 when a new trip is selected (OBRS-324)', () => {
      const comp = makeComponent();
      (comp as any).passengerCount = 5;
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      expect((comp as any).passengerCount).toBe(1);
    });

    it('resets activeTabIndex to 0 when a new trip is selected (the center panel\'s p-tabView remounts on tab 0)', () => {
      const comp = makeComponent();
      (comp as any).activeTabIndex = 1;
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      expect((comp as any).activeTabIndex).toBe(0);
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
      // Booking payload seatNumber is normalized to bare digits (OBRS-179) — the
      // label 'B1'/'B2' is UI-only, the backend contract is numeric.
      const b1 = passengers.find((p) => p.seatNumber === '1');
      const b2 = passengers.find((p) => p.seatNumber === '2');
      expect(b1?.passengerType).toBe('male');
      expect(b2?.passengerType).toBe('female');
    });
  });

  describe('onSell seatNumber normalization (OBRS-179 regression)', () => {
    it('sends the bare numeric seat for a van trip, not the letter label', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip({ vehicleType: 'van' });
      (comp as any).onSeatToggled('A2'); // walk-in van seat map label
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      const passengers: { seatNumber: string }[] = callArg.departureSchedule.passengers;
      // This is the exact regression witness for OBRS-179: the old behavior sent
      // the raw label 'A2', which 400'd as BOOKING_ERROR_SEATS_NOT_FOUND: A2.
      expect(passengers[0].seatNumber).toBe('2');
      expect(passengers[0].seatNumber).not.toBe('A2');
    });

    it('sends the bare numeric seat for a bus trip label too', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip({ vehicleType: 'bus' });
      (comp as any).onSeatToggled('B12');
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      const passengers: { seatNumber: string }[] = callArg.departureSchedule.passengers;
      expect(passengers[0].seatNumber).toBe('12');
    });

    it('leaves the displayed selectedSeats label untouched (chips/highlighting keep "A2")', () => {
      const comp = makeComponent();
      (comp as any).onSeatToggled('A2');
      expect((comp as any).selectedSeats).toEqual(['A2']);
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

    it('on a successful sale clears the selected trip, reloads trips, and confirms in place — no /e-ticket navigation (OBRS-188)', () => {
      const api = createStaffApiStub();
      const alert = createAlertStub();
      const comp = makeComponent(api, alert);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      (comp as any).activeTabIndex = 2;
      setSegmentFare(comp, 300);
      const loadTripsSpy = spyOn(comp as any, 'loadTrips');

      (comp as any).onSell(validPayload);

      expect(api.createWalkInBooking).toHaveBeenCalled();
      expect(api.payWalkIn).toHaveBeenCalled();
      // Seat map is closed so the just-sold seat can't still render as available,
      // and the trip list is reloaded so the sold-count badge updates.
      expect((comp as any).selectedTrip).toBeNull();
      expect((comp as any).selectedSeats).toEqual([]);
      expect(loadTripsSpy).toHaveBeenCalled();
      // OBRS-130 checkout/center layout follow-up: back to the Ticket Sales tab
      // (index 0) so the checkout column reappears for the next sale.
      expect((comp as any).activeTabIndex).toBe(0);
      // OBRS-195: staff get an in-place success prompt (via AlertService.confirm,
      // never a direct Swal.fire()) offering to print — not a bounce to the
      // customerArea /e-ticket route (OBRS-188).
      expect(alert.confirm).toHaveBeenCalled();
    });

    it('navigates to the staff receipt route (never /e-ticket) when staff confirms "Print ticket" (OBRS-195/OBRS-188)', async () => {
      const api = createStaffApiStub();
      const alert = createAlertStub();
      alert.confirm.and.returnValue(Promise.resolve(true));
      const router = createRouterStub();
      const navigateSpy = spyOn(router, 'navigate').and.callThrough();
      const comp = makeComponent(api, alert, createAdminApiStub(), createScheduleStoreStub(), router);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);
      spyOn(comp as any, 'loadTrips');

      (comp as any).onSell(validPayload);
      // Let the confirm() promise resolve before asserting the navigation.
      await Promise.resolve();
      await Promise.resolve();

      expect(navigateSpy).toHaveBeenCalledWith(['/staff/sell/receipt', 99]);
    });

    it('does NOT navigate when staff dismisses the print prompt', async () => {
      const api = createStaffApiStub();
      const alert = createAlertStub(); // confirm() defaults to resolving false
      const router = createRouterStub();
      const navigateSpy = spyOn(router, 'navigate').and.callThrough();
      const comp = makeComponent(api, alert, createAdminApiStub(), createScheduleStoreStub(), router);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);
      spyOn(comp as any, 'loadTrips');

      (comp as any).onSell(validPayload);
      await Promise.resolve();
      await Promise.resolve();

      expect(navigateSpy).not.toHaveBeenCalled();
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

  // OBRS-324 (Epic OBRS-318 open seating, 318-d)
  describe('isOpenSeating getter', () => {
    it('is false when no trip is selected', () => {
      const comp = makeComponent();
      expect((comp as any).isOpenSeating).toBeFalse();
    });

    it('is false when the trip has no seatingMode (safe default)', () => {
      const comp = makeComponent();
      (comp as any).selectedTrip = makeTrip();
      expect((comp as any).isOpenSeating).toBeFalse();
    });

    it('is true when the trip seatingMode is OPEN', () => {
      const comp = makeComponent();
      (comp as any).selectedTrip = makeTrip({ seatingMode: 'OPEN' });
      expect((comp as any).isOpenSeating).toBeTrue();
    });
  });

  describe('onPassengerCountChanged', () => {
    it('clamps to the trip availableCount', () => {
      const comp = makeComponent();
      (comp as any).selectedTrip = makeTrip({ availableCount: 4 });
      (comp as any).onPassengerCountChanged(9);
      expect((comp as any).passengerCount).toBe(4);
    });

    it('floors at 1', () => {
      const comp = makeComponent();
      (comp as any).selectedTrip = makeTrip({ availableCount: 4 });
      (comp as any).onPassengerCountChanged(0);
      expect((comp as any).passengerCount).toBe(1);
    });

    it('accepts a value within range unchanged', () => {
      const comp = makeComponent();
      (comp as any).selectedTrip = makeTrip({ availableCount: 10 });
      (comp as any).onPassengerCountChanged(3);
      expect((comp as any).passengerCount).toBe(3);
    });
  });

  describe('onSell — OPEN seating (OBRS-324)', () => {
    it('builds passengerCount passengers with a blank seatNumber, ignoring selectedSeats', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip({ seatingMode: 'OPEN' });
      (comp as any).selectedSeats = ['B1']; // must be ignored for OPEN
      (comp as any).passengerCount = 3;
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      const passengers: { seatNumber: string }[] = callArg.departureSchedule.passengers;
      expect(passengers.length).toBe(3);
      for (const p of passengers) {
        expect(p.seatNumber).toBe('');
      }
    });

    it('totalAmount is fare * passengerCount (not selectedSeats.length)', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip({ seatingMode: 'OPEN' });
      (comp as any).selectedSeats = ['B1', 'B2']; // 2 seats, must be ignored
      (comp as any).passengerCount = 5;
      setSegmentFare(comp, 100);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      expect(callArg.totalAmount).toBe(500);
    });

    it('ASSIGNED trip (default) is unaffected — still one passenger per selected seat', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip(); // no seatingMode → ASSIGNED
      (comp as any).selectedSeats = ['B1', 'B2'];
      (comp as any).passengerCount = 7; // must be ignored for ASSIGNED
      setSegmentFare(comp, 300);

      (comp as any).onSell(validPayload);

      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      expect(callArg.departureSchedule.passengers.length).toBe(2);
      expect(callArg.totalAmount).toBe(600);
    });

    it('resets passengerCount to 1 after a successful sale', () => {
      const api = createStaffApiStub();
      const comp = makeComponent(api);
      (comp as any).selectedTrip = makeTrip({ seatingMode: 'OPEN' });
      (comp as any).passengerCount = 4;
      setSegmentFare(comp, 300);
      spyOn(comp as any, 'loadTrips');

      (comp as any).onSell(validPayload);

      expect((comp as any).passengerCount).toBe(1);
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
        api,
        createAlertStub(),
        translate,
        new FormBuilder(),
        createAdminApiStub(),
        createScheduleStoreStub(),
        createRouterStub()
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

  describe('per-stop times & ordering from route-stops (OBRS-191)', () => {
    const trip = makeTrip({ departureDateTime: '2026-07-01T08:00:00' });

    it('sets every stop time to departure + its offsetMinutesFromOrigin', () => {
      const comp = makeComponent();
      (comp as any).stopOffsetMap = new Map([['origin', 0], ['mid', 40], ['dest', 70]]);
      (comp as any)._buildStopTimes(trip);
      expect((comp as any).stopTime('origin')).toBe('08:00');
      expect((comp as any).stopTime('mid')).toBe('08:40');
      expect((comp as any).stopTime('dest')).toBe('09:10');
    });

    it('gives parallel origin-area stops sharing an offset the same time (not just one)', () => {
      const comp = makeComponent();
      // Regression (OBRS-191): the old segment-graph approach left only the origin
      // with a time on multi-pickup routes; route offsets time every pickup point.
      (comp as any).stopOffsetMap = new Map([['p1', 0], ['p2', 0], ['d1', 40]]);
      (comp as any)._buildStopTimes(trip);
      expect((comp as any).stopTime('p1')).toBe('08:00');
      expect((comp as any).stopTime('p2')).toBe('08:00');
      expect((comp as any).stopTime('d1')).toBe('08:40');
    });

    it('returns an empty time for a stop with no known offset', () => {
      const comp = makeComponent();
      (comp as any).stopOffsetMap = new Map([['origin', 0]]);
      (comp as any)._buildStopTimes(trip);
      expect((comp as any).stopTime('ghost')).toBe('');
    });

    it('orders sellable stops by the route stop_order, not the segment-graph shape', () => {
      const comp = makeComponent();
      (comp as any).stopOrderMap = new Map([['a', 1], ['b', 2], ['c', 3]]);
      const pairs = [
        { fromStop: { slug: 'c', name: 'C' }, toStop: { slug: 'a', name: 'A' } },
        { fromStop: { slug: 'a', name: 'A' }, toStop: { slug: 'b', name: 'B' } },
      ];
      const ordered = (comp as any)._buildOrderedStops(pairs);
      expect(ordered.map((s: { slug: string }) => s.slug)).toEqual(['a', 'b', 'c']);
    });

    it('sorts stops missing from route-stops to the end', () => {
      const comp = makeComponent();
      (comp as any).stopOrderMap = new Map([['a', 1], ['b', 2]]);
      const pairs = [
        { fromStop: { slug: 'a', name: 'A' }, toStop: { slug: 'zzz', name: 'Z' } },
        { fromStop: { slug: 'b', name: 'B' }, toStop: { slug: 'zzz', name: 'Z' } },
      ];
      const ordered = (comp as any)._buildOrderedStops(pairs);
      expect(ordered.map((s: { slug: string }) => s.slug)).toEqual(['a', 'b', 'zzz']);
    });
  });

  // OBRS-193: salesperson sales-point default pickup. The pickup no longer
  // always defaults to the route origin — it defaults to the salesperson's
  // assigned salesPointStop (GET /users/me) when one is set AND it's on the
  // current route; otherwise it falls back to the origin exactly as before.
  describe('salesperson default pickup (OBRS-193)', () => {
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

    function makeComponentWithSalesPoint(salesPointStop: string | null): {
      comp: SellPageComponent;
      api: any;
      translate: any;
    } {
      const api = createStaffApiStub({
        getRouteSegments: jasmine.createSpy('getRouteSegments').and.returnValue(of(segPairsResponse())),
        getMe: jasmine.createSpy('getMe').and.returnValue(of({ data: { salesPointStop } })),
      });
      const translate = createTranslateStub();
      const comp = new SellPageComponent(
        api,
        createAlertStub(),
        translate,
        new FormBuilder(),
        createAdminApiStub(),
        createScheduleStoreStub(),
        createRouterStub()
      );
      return { comp, api, translate };
    }

    it('(a) defaults pickup to salesPointStop when it is present AND on the route', () => {
      const { comp } = makeComponentWithSalesPoint('stop_b');
      comp.ngOnInit();
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      expect((comp as any).pickupSlug).toBe('stop_b');
    });

    it('(b) falls back to the route origin when salesPointStop is present but NOT on the route', () => {
      const { comp } = makeComponentWithSalesPoint('ghost_stop');
      comp.ngOnInit();
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      expect((comp as any).pickupSlug).toBe('stop_a');
    });

    it('(c) defaults pickup to the route origin when salesPointStop is null — regression, unchanged behavior', () => {
      const { comp } = makeComponentWithSalesPoint(null);
      comp.ngOnInit();
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      expect((comp as any).pickupSlug).toBe('stop_a');
    });

    it('(d) preserves a manual pickup override across a reload even though it differs from salesPointStop', () => {
      const { comp, translate } = makeComponentWithSalesPoint('stop_b');
      comp.ngOnInit();
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      // Sales point would default pickup to stop_b; staff manually overrides to
      // the origin instead.
      (comp as any).pickupSlug = 'stop_a';
      (comp as any).dropoffSlug = 'stop_b';
      (translate.onLangChange as Subject<unknown>).next({ lang: 'th' });
      // The existing preserve mechanism must still win — re-default must NOT
      // silently reassert the sales-point stop over the manual choice.
      expect((comp as any).pickupSlug).toBe('stop_a');
      expect((comp as any).dropoffSlug).toBe('stop_b');
    });

    it('fetches /users/me only ONCE across ngOnInit + multiple trip selections (cached, not refetched)', () => {
      const { comp, api } = makeComponentWithSalesPoint('stop_b');
      comp.ngOnInit();
      (comp as any).onTripSelected({ trip: makeTrip({ scheduleId: 1 }), routeSlug: 'bkk-cm' });
      (comp as any).onTripSelected({ trip: makeTrip({ scheduleId: 2 }), routeSlug: 'bkk-cm' });
      expect(api.getMe).toHaveBeenCalledTimes(1);
    });

    it('does not refetch /users/me on a language-switch reload', () => {
      const { comp, api, translate } = makeComponentWithSalesPoint('stop_b');
      comp.ngOnInit();
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      (translate.onLangChange as Subject<unknown>).next({ lang: 'th' });
      expect(api.getMe).toHaveBeenCalledTimes(1);
    });

    it('a /users/me error is treated as no sales point and does not block segment loading', () => {
      const api = createStaffApiStub({
        getRouteSegments: jasmine.createSpy('getRouteSegments').and.returnValue(of(segPairsResponse())),
        getMe: jasmine.createSpy('getMe').and.returnValue(throwError(() => new Error('network error'))),
      });
      const comp = new SellPageComponent(
        api, createAlertStub(), createTranslateStub(), new FormBuilder(),
        createAdminApiStub(), createScheduleStoreStub(), createRouterStub()
      );
      comp.ngOnInit();
      (comp as any).onTripSelected({ trip: makeTrip(), routeSlug: 'bkk-cm' });
      expect((comp as any).isLoadingSegments).toBeFalse();
      expect((comp as any).pickupSlug).toBe('stop_a');
    });
  });

  describe('schedule management — optimistic delete', () => {
    it('removes the deleted scheduleId from routeGroups immediately (optimistic)', () => {
      const comp = makeComponent();

      const tripToDelete = makeTrip({ scheduleId: 10 });
      const otherTrip = makeTrip({ scheduleId: 20 });
      (comp as any).routeGroups = [
        makeRouteGroup('r1', [tripToDelete]),
        makeRouteGroup('r2', [otherTrip]),
      ];

      (comp as any).onDeleteScheduleClicked({ trip: tripToDelete, routeSlug: 'r1' });
      void (comp as any).confirmDeleteSchedule();

      const groups: WalkInRouteGroupDto[] = (comp as any).routeGroups;
      // Empty group should be dropped
      expect(groups.length).toBe(1);
      expect(groups[0].routeSlug).toBe('r2');
      expect(groups[0].trips[0].scheduleId).toBe(20);
    });

    it('returns a new routeGroups array reference after optimistic delete', () => {
      const comp = makeComponent();

      const tripToDelete = makeTrip({ scheduleId: 10 });
      const originalGroups: WalkInRouteGroupDto[] = [makeRouteGroup('r1', [tripToDelete])];
      (comp as any).routeGroups = originalGroups;

      (comp as any).onDeleteScheduleClicked({ trip: tripToDelete, routeSlug: 'r1' });
      void (comp as any).confirmDeleteSchedule();

      expect((comp as any).routeGroups).not.toBe(originalGroups);
    });

    it('clears selectedTrip when the deleted trip was the selected one', () => {
      const comp = makeComponent();

      const tripToDelete = makeTrip({ scheduleId: 10 });
      (comp as any).routeGroups = [makeRouteGroup('r1', [tripToDelete])];
      (comp as any).selectedTrip = tripToDelete;
      (comp as any).selectedSeats = ['B1', 'B2'];
      (comp as any).seatPassengerTypes = { B1: 'male', B2: 'female' };

      (comp as any).activeTabIndex = 1;
      (comp as any).onDeleteScheduleClicked({ trip: tripToDelete, routeSlug: 'r1' });
      void (comp as any).confirmDeleteSchedule();

      expect((comp as any).selectedTrip).toBeNull();
      expect((comp as any).selectedSeats).toEqual([]);
      expect((comp as any).seatPassengerTypes).toEqual({});
      expect((comp as any).activeTabIndex).toBe(0);
    });

    it('does NOT clear selectedTrip when a different trip was deleted', () => {
      const comp = makeComponent();

      const tripToDelete = makeTrip({ scheduleId: 10 });
      const selectedTrip = makeTrip({ scheduleId: 20 });
      (comp as any).routeGroups = [
        makeRouteGroup('r1', [tripToDelete]),
        makeRouteGroup('r2', [selectedTrip]),
      ];
      (comp as any).selectedTrip = selectedTrip;
      (comp as any).selectedSeats = ['B1'];

      (comp as any).onDeleteScheduleClicked({ trip: tripToDelete, routeSlug: 'r1' });
      void (comp as any).confirmDeleteSchedule();

      expect((comp as any).selectedTrip).toEqual(selectedTrip);
      expect((comp as any).selectedSeats).toEqual(['B1']);
    });
  });

  // OBRS-283: smart delete/cancel branch driven by the trip's `deletable` +
  // `confirmedBookingCount` fields (see shared/lib/schedule-delete-mode.ts).
  describe('schedule management — OBRS-283 smart cancel branch', () => {
    it('deletable===false + confirmedBookingCount>0 resolves the "cancel-refund" dialog mode', () => {
      const comp = makeComponent();
      const trip = makeTrip({ scheduleId: 10, deletable: false, confirmedBookingCount: 4 });
      (comp as any).onDeleteScheduleClicked({ trip, routeSlug: 'r1' });
      expect((comp as any).scheduleDeleteModalMode).toBe('cancel-refund');
    });

    it('deletable===false + confirmedBookingCount===0 resolves the "cancel-no-refund" dialog mode', () => {
      const comp = makeComponent();
      const trip = makeTrip({ scheduleId: 10, deletable: false, confirmedBookingCount: 0 });
      (comp as any).onDeleteScheduleClicked({ trip, routeSlug: 'r1' });
      expect((comp as any).scheduleDeleteModalMode).toBe('cancel-no-refund');
    });

    it('a trip missing `deletable` (undefined, the default from makeTrip()) falls through to "delete"', () => {
      const comp = makeComponent();
      const trip = makeTrip({ scheduleId: 10 });
      (comp as any).onDeleteScheduleClicked({ trip, routeSlug: 'r1' });
      expect((comp as any).scheduleDeleteModalMode).toBe('delete');
    });

    it('cancel-refund mode calls adminApiService.cancelSchedule() (not deleteSchedule()) and shows the success toast with the response affectedBookingCount', async () => {
      const cancelSchedule = jasmine.createSpy('cancelSchedule').and.returnValue(
        of({ data: { scheduleId: 10, status: 'cancelled', affectedBookingCount: 5 } })
      );
      const adminApi = { ...createAdminApiStub(), cancelSchedule };
      const alert = createAlertStub();
      const comp = makeComponent(createStaffApiStub(), alert, adminApi);

      const trip = makeTrip({ scheduleId: 10, deletable: false, confirmedBookingCount: 5 });
      (comp as any).routeGroups = [makeRouteGroup('r1', [trip])];
      (comp as any).onDeleteScheduleClicked({ trip, routeSlug: 'r1' });

      await (comp as any).confirmDeleteSchedule();

      expect(cancelSchedule).toHaveBeenCalledWith(10);
      expect(adminApi.deleteSchedule).not.toHaveBeenCalled();
      expect(alert.success).toHaveBeenCalledWith('ADMIN.MESSAGES.SCHEDULE_CANCELLED');
    });

    it('deletable===true still calls adminApiService.deleteSchedule() (unchanged)', async () => {
      const adminApi = createAdminApiStub();
      const alert = createAlertStub();
      const comp = makeComponent(createStaffApiStub(), alert, adminApi);

      const trip = makeTrip({ scheduleId: 10, deletable: true });
      (comp as any).routeGroups = [makeRouteGroup('r1', [trip])];
      (comp as any).onDeleteScheduleClicked({ trip, routeSlug: 'r1' });

      await (comp as any).confirmDeleteSchedule();

      expect(adminApi.deleteSchedule).toHaveBeenCalledWith(10);
      expect(alert.success).toHaveBeenCalledWith('ADMIN.MESSAGES.DELETED');
    });
  });

  // Regression: AC-1/AC-6 cold-open "Add schedule" has a blank route.
  // When the store hasn't loaded yet on first modal open, scheduleRouteOptions is
  // empty — so the form.reset() defaults route to ''. Fix: applyScheduleLocalization
  // applies the first-option default to the pristine blank ROUTE control when the
  // create form is open and no user pick has been made.
  // vehicleType is deliberately NOT defaulted (design-system §3.1): a form select
  // starts on its placeholder and the user picks explicitly, like Vehicle/Driver.
  describe('schedule management — cold-open first-option defaults (regression AC-1/AC-6)', () => {
    function makeStoreData(): any {
      return {
        routes: [{ slug: 'bkk-cm', label_th: 'BKK-CM', label_en: 'BKK-CM', translations: [] }],
        vehicleTypes: [{ slug: 'bus', label_th: 'บัส', label_en: 'Bus', translations: [] }],
        vehicles: [],
        drivers: [],
        lookups: [],
      };
    }

    it('applies the first-option default to route (but NOT vehicleType) when store loads while create modal is open', () => {
      const { store, subject, hasValueRef } = createControllableScheduleStoreStub();
      const comp = new SellPageComponent(
        createStaffApiStub(),
        createAlertStub(), createTranslateStub(), new FormBuilder(),
        createAdminApiStub(), store, createRouterStub()
      );
      comp.ngOnInit();

      // Cold open: store has no data yet → options arrays are empty → form gets ''
      (comp as any).onAddScheduleClicked();
      expect((comp as any).isScheduleFormOpen).toBeTrue();
      expect((comp as any).scheduleItemForm.get('route')?.value).toBe('');
      expect((comp as any).scheduleItemForm.get('vehicleType')?.value).toBe('');

      // Store data arrives (e.g. after async refresh completes)
      hasValueRef.value = true;
      subject.next(makeStoreData());

      // Route's first-option default is now applied to the still-pristine blank control...
      expect((comp as any).scheduleItemForm.get('route')?.value).toBe('bkk-cm');
      // ...but vehicleType stays on its placeholder (design-system §3.1): no silent default.
      expect((comp as any).scheduleItemForm.get('vehicleType')?.value).toBe('');

      comp.ngOnDestroy();
    });

    it('does NOT overwrite a user-picked route when store data arrives', () => {
      const { store, subject, hasValueRef } = createControllableScheduleStoreStub();
      const comp = new SellPageComponent(
        createStaffApiStub(),
        createAlertStub(), createTranslateStub(), new FormBuilder(),
        createAdminApiStub(), store, createRouterStub()
      );
      comp.ngOnInit();

      (comp as any).onAddScheduleClicked();

      // Simulate user picking a specific route (makes the control dirty)
      const routeCtrl = (comp as any).scheduleItemForm.get('route');
      routeCtrl.setValue('phuket-express');
      routeCtrl.markAsDirty();

      // Store data arrives with a different first option
      hasValueRef.value = true;
      subject.next(makeStoreData());

      // User's pick must be preserved — dirty controls are not overwritten
      expect((comp as any).scheduleItemForm.get('route')?.value).toBe('phuket-express');

      comp.ngOnDestroy();
    });

    it('does NOT apply first-option defaults when the form is in edit mode', () => {
      const { store, subject, hasValueRef } = createControllableScheduleStoreStub();
      const comp = new SellPageComponent(
        createStaffApiStub(),
        createAlertStub(), createTranslateStub(), new FormBuilder(),
        createAdminApiStub(), store, createRouterStub()
      );
      comp.ngOnInit();

      // Simulate edit mode open with a specific route set
      (comp as any).isScheduleFormOpen = true;
      (comp as any).isScheduleEditMode = true;
      (comp as any).scheduleItemForm.get('route')?.setValue('existing-route');

      // Store data arrives
      hasValueRef.value = true;
      subject.next(makeStoreData());

      // Edit mode: must not touch the form controls
      expect((comp as any).scheduleItemForm.get('route')?.value).toBe('existing-route');

      comp.ngOnDestroy();
    });

    it('does NOT apply defaults when the create form is closed', () => {
      const { store, subject, hasValueRef } = createControllableScheduleStoreStub();
      const comp = new SellPageComponent(
        createStaffApiStub(),
        createAlertStub(), createTranslateStub(), new FormBuilder(),
        createAdminApiStub(), store, createRouterStub()
      );
      comp.ngOnInit();

      // Form is closed (default state)
      expect((comp as any).isScheduleFormOpen).toBeFalse();

      hasValueRef.value = true;
      subject.next(makeStoreData());

      // Schedule options are populated but form was not open — no side-effects
      expect((comp as any).scheduleRouteOptions.length).toBeGreaterThan(0);
      // Form controls remain at initial reset values
      expect((comp as any).scheduleItemForm.get('route')?.value).toBe('');

      comp.ngOnDestroy();
    });

    // OBRS-506: a null emission (clear(), e.g. on logout) must reset the
    // schedule option arrays this subscription populates, not leave a
    // previous session's routes/vehicleTypes/vehicles/drivers selectable in
    // the create-sale form — same shape as the already-fixed
    // usability-reports-page.component.ts (OBRS-467).
    it('clears the schedule option arrays when the store emits null (OBRS-506)', () => {
      const { store, subject, hasValueRef } = createControllableScheduleStoreStub();
      const comp = new SellPageComponent(
        createStaffApiStub(),
        createAlertStub(), createTranslateStub(), new FormBuilder(),
        createAdminApiStub(), store, createRouterStub()
      );
      comp.ngOnInit();

      hasValueRef.value = true;
      subject.next(makeStoreData());
      expect((comp as any).scheduleRouteOptions.length).toBeGreaterThan(0);
      expect((comp as any).scheduleVehicleTypeOptions.length).toBeGreaterThan(0);

      hasValueRef.value = false;
      subject.next(null);

      expect((comp as any).scheduleRouteOptions)
        .withContext('a null emission must not leave the previous session\'s route options selectable')
        .toEqual([]);
      expect((comp as any).scheduleVehicleTypeOptions).toEqual([]);
      expect((comp as any).scheduleVehicleOptions).toEqual([]);
      expect((comp as any).scheduleDriverOptions).toEqual([]);

      comp.ngOnDestroy();
    });
  });

  describe('lifecycle', () => {
    it('cleans up on destroy', () => {
      const comp = makeComponent();
      comp.ngOnInit();
      expect(() => comp.ngOnDestroy()).not.toThrow();
    });
  });

  // OBRS-358: jump-seat overflow hint + staff-acknowledgment gate.
  describe('overflowUnits / requiresJumpSeatAck getters', () => {
    it('is 0 / false when the trip has no normalCapacity (backend predating this card)', () => {
      const comp = makeComponent();
      (comp as any).selectedTrip = makeTrip({ soldPaidCount: 20, reservedUnpaidCount: 0 });
      (comp as any).selectedSeats = ['B1'];

      expect((comp as any).overflowUnits).toBe(0);
      expect((comp as any).requiresJumpSeatAck).toBeFalse();
    });

    it('is 0 / false when existing + ticketCount stays within normalCapacity', () => {
      const comp = makeComponent();
      (comp as any).selectedTrip = makeTrip({
        soldPaidCount: 10,
        reservedUnpaidCount: 5,
        normalCapacity: 20,
      });
      (comp as any).selectedSeats = ['B1'];

      expect((comp as any).overflowUnits).toBe(0);
      expect((comp as any).requiresJumpSeatAck).toBeFalse();
    });

    it('computes overflowUnits as max(0, existing + ticketCount - normalCapacity) and flips requiresJumpSeatAck true', () => {
      const comp = makeComponent();
      (comp as any).selectedTrip = makeTrip({
        soldPaidCount: 15,
        reservedUnpaidCount: 4,
        normalCapacity: 20,
      });
      (comp as any).selectedSeats = ['B1', 'B2'];

      // existing (19) + ticketCount (2) - normalCapacity (20) = 1
      expect((comp as any).overflowUnits).toBe(1);
      expect((comp as any).requiresJumpSeatAck).toBeTrue();
    });
  });

  describe('onSell — jump-seat acknowledgment gate (OBRS-358)', () => {
    function makeOverflowTrip(): WalkInTripDto {
      // existing (soldPaidCount + reservedUnpaidCount = 20) + ticketCount (1) -
      // normalCapacity (20) = 1 unit of overflow.
      return makeTrip({ soldPaidCount: 20, reservedUnpaidCount: 0, normalCapacity: 20 });
    }

    it('does NOT call the jump-seat confirm prompt when the sale does not overflow', async () => {
      const api = createStaffApiStub();
      const alert = createAlertStub();
      const comp = makeComponent(api, alert);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);
      // Isolate the jump-seat ack gate from the unrelated post-sale
      // "Print ticket" offer (offerPrintTicket() also calls
      // alertService.confirm() — see OBRS-195), so this assertion only
      // reflects OBRS-358's gate, not that later prompt.
      spyOn(comp as any, 'offerPrintTicket').and.returnValue(Promise.resolve());

      await (comp as any).onSell(validPayload);

      expect(alert.confirm).not.toHaveBeenCalled();
      expect(api.createWalkInBooking).toHaveBeenCalled();
      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      expect('jumpSeatAcknowledged' in callArg).toBeFalse();
    });

    it('gates onSell on AlertService.confirm() when the sale overflows into the jump seat, and makes NO API call when declined', async () => {
      const api = createStaffApiStub();
      const alert = createAlertStub(); // confirm() defaults to resolving false
      const comp = makeComponent(api, alert);
      (comp as any).selectedTrip = makeOverflowTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      await (comp as any).onSell(validPayload);

      expect(alert.confirm).toHaveBeenCalledWith(
        jasmine.objectContaining({
          title: 'STAFF.SELL.JUMP_SEAT_CONFIRM_TITLE',
          text: 'STAFF.SELL.JUMP_SEAT_CONFIRM_TEXT',
          confirmButtonText: 'STAFF.SELL.JUMP_SEAT_CONFIRM_OK',
          icon: 'warning',
        })
      );
      expect(api.createWalkInBooking).not.toHaveBeenCalled();
    });

    it('sends jumpSeatAcknowledged: true on the booking payload when staff confirms the overflow prompt', async () => {
      const api = createStaffApiStub();
      const alert = createAlertStub();
      alert.confirm.and.returnValue(Promise.resolve(true));
      const comp = makeComponent(api, alert);
      (comp as any).selectedTrip = makeOverflowTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      await (comp as any).onSell(validPayload);

      expect(api.createWalkInBooking).toHaveBeenCalled();
      const callArg = api.createWalkInBooking.calls.mostRecent().args[0];
      expect(callArg.jumpSeatAcknowledged).toBeTrue();
    });
  });

  describe('onSell — jump-seat errorCode mapping (OBRS-358)', () => {
    function errorWithCode(errorCode: string): unknown {
      return { error: { errorCode } };
    }

    // BOOKING_ERROR_JUMPSEAT_ACKNOWLEDGMENT_REQUIRED is deliberately excluded
    // from this generic "always a plain toast" table — the reactive-retry
    // follow-up below routes it through confirmJumpSeatSale() instead. See
    // the dedicated 'onSell — reactive jump-seat ack retry' describe block.
    ([
      ['BOOKING_ERROR_JUMPSEAT_DISABLED', 'STAFF.SELL.ERR_JUMPSEAT_DISABLED'],
      ['BOOKING_ERROR_JUMPSEAT_NORMAL_SEATS_AVAILABLE', 'STAFF.SELL.ERR_JUMPSEAT_NORMAL_AVAILABLE'],
      ['SEAT_ERROR_WALK_IN_ONLY', 'COMMON.ERROR.SEAT_WALK_IN_ONLY'],
    ] as const).forEach(([errorCode, i18nKey]) => {
      it(`maps ${errorCode} -> ${i18nKey} (never the raw code) on booking-create failure`, async () => {
        const alert = createAlertStub();
        const api = createStaffApiStub({
          createWalkInBooking: jasmine
            .createSpy()
            .and.returnValue(throwError(() => errorWithCode(errorCode))),
        });
        const comp = makeComponent(api, alert);
        (comp as any).selectedTrip = makeTrip();
        (comp as any).selectedSeats = ['B1'];
        setSegmentFare(comp, 300);

        await (comp as any).onSell(validPayload);

        expect(alert.error).toHaveBeenCalledWith(i18nKey);
      });
    });

    it('falls back to extractApiErrorMessage/SAVE_FAILED for an unrecognized errorCode', async () => {
      const alert = createAlertStub();
      const api = createStaffApiStub({
        createWalkInBooking: jasmine
          .createSpy()
          .and.returnValue(throwError(() => errorWithCode('SOME_OTHER_ERROR'))),
      });
      const comp = makeComponent(api, alert);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      await (comp as any).onSell(validPayload);

      expect(alert.error).toHaveBeenCalledWith('ADMIN.MESSAGES.SAVE_FAILED');
    });
  });

  // OBRS-358 follow-up: the proactive overflowUnits hint under-reports on
  // OPEN trips (findWalkInSchedulesByDate's soldPaidCount is always 0 there
  // — a pre-existing backend bug, not FE's to fix), so the server's 400
  // BOOKING_ERROR_JUMPSEAT_ACKNOWLEDGMENT_REQUIRED must be treated as the
  // authoritative, reactive trigger for the SAME ack dialog — otherwise
  // staff hit a dead-end selling the 21st (jump) seat.
  describe('onSell — reactive jump-seat ack retry (OBRS-358 follow-up)', () => {
    function errorWithCode(errorCode: string): unknown {
      return { error: { errorCode } };
    }

    it('on a 400 ACK_REQUIRED (no proactive hint), shows the SAME confirm dialog and, on Confirm, retries with jumpSeatAcknowledged:true using a FRESH idempotency key — then completes the sale', async () => {
      const api = createStaffApiStub({
        createWalkInBooking: jasmine
          .createSpy('createWalkInBooking')
          .and.returnValues(
            throwError(() => errorWithCode('BOOKING_ERROR_JUMPSEAT_ACKNOWLEDGMENT_REQUIRED')),
            of({ data: { bookingId: 99, bookingNumber: 'BK-99' } })
          ),
      });
      const alert = createAlertStub();
      alert.confirm.and.returnValue(Promise.resolve(true));
      const comp = makeComponent(api, alert);
      (comp as any).selectedTrip = makeTrip(); // no normalCapacity -> proactive hint does NOT fire
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);
      spyOn(comp as any, 'offerPrintTicket').and.returnValue(Promise.resolve());

      await (comp as any).onSell(validPayload);

      // Proactive gate never fired; the ONE confirm() call is the reactive one.
      expect(alert.confirm).toHaveBeenCalledTimes(1);
      expect(alert.confirm).toHaveBeenCalledWith(
        jasmine.objectContaining({
          title: 'STAFF.SELL.JUMP_SEAT_CONFIRM_TITLE',
          text: 'STAFF.SELL.JUMP_SEAT_CONFIRM_TEXT',
          confirmButtonText: 'STAFF.SELL.JUMP_SEAT_CONFIRM_OK',
          icon: 'warning',
        })
      );

      expect(api.createWalkInBooking).toHaveBeenCalledTimes(2);
      const firstArg = api.createWalkInBooking.calls.argsFor(0)[0];
      const retryArg = api.createWalkInBooking.calls.argsFor(1)[0];
      expect('jumpSeatAcknowledged' in firstArg).toBeFalse();
      expect(retryArg.jumpSeatAcknowledged).toBeTrue();

      // The retry succeeds and pays with a key — that key must NOT be the
      // one the failed first attempt would have used (fresh per retry).
      expect(api.payWalkIn).toHaveBeenCalledTimes(1);
      const payKey = api.payWalkIn.calls.mostRecent().args[1];
      expect(typeof payKey).toBe('string');
      expect(payKey.length).toBeGreaterThan(0);

      // Sale completed end-to-end (no dead-end, no leftover error toast).
      expect(alert.error).not.toHaveBeenCalled();
      expect((comp as any).selectedTrip).toBeNull();
    });

    it('uses a DIFFERENT idempotency key on the retry than the one held after the failed first attempt (never reuses the failed key)', async () => {
      const api = createStaffApiStub({
        createWalkInBooking: jasmine
          .createSpy('createWalkInBooking')
          .and.returnValues(
            throwError(() => errorWithCode('BOOKING_ERROR_JUMPSEAT_ACKNOWLEDGMENT_REQUIRED')),
            of({ data: { bookingId: 99, bookingNumber: 'BK-99' } })
          ),
      });
      const alert = createAlertStub();
      // Snapshot the key the FAILED first attempt was holding at the moment
      // the reactive dialog is shown (submitWalkInBooking() sets it
      // unconditionally before the HTTP call, so it's already populated here).
      let keyHeldAfterFailedFirstAttempt: string | null = null;
      alert.confirm.and.callFake(() => {
        keyHeldAfterFailedFirstAttempt = (comp as any).idempotencyKey;
        return Promise.resolve(true);
      });
      const comp = makeComponent(api, alert);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);
      spyOn(comp as any, 'offerPrintTicket').and.returnValue(Promise.resolve());

      await (comp as any).onSell(validPayload);

      expect(keyHeldAfterFailedFirstAttempt).toEqual(jasmine.any(String));
      const retryKeyUsedForPayment = api.payWalkIn.calls.mostRecent().args[1];
      expect(retryKeyUsedForPayment).toEqual(jasmine.any(String));
      expect(retryKeyUsedForPayment).not.toBe(keyHeldAfterFailedFirstAttempt);
    });

    it('does NOT retry when staff declines the reactive ack dialog — quiet abort, no toast, no second API call', async () => {
      const api = createStaffApiStub({
        createWalkInBooking: jasmine
          .createSpy('createWalkInBooking')
          .and.returnValue(throwError(() => errorWithCode('BOOKING_ERROR_JUMPSEAT_ACKNOWLEDGMENT_REQUIRED'))),
      });
      const alert = createAlertStub(); // confirm() defaults to resolving false
      const comp = makeComponent(api, alert);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      await (comp as any).onSell(validPayload);

      expect(alert.confirm).toHaveBeenCalledTimes(1);
      expect(api.createWalkInBooking).toHaveBeenCalledTimes(1);
      expect(alert.error).not.toHaveBeenCalled();
      expect((comp as any).isSelling).toBeFalse();
    });

    it('guards against a retry loop: if the retry itself returns ACK_REQUIRED again, falls through to the plain error toast instead of retrying a second time', async () => {
      const api = createStaffApiStub({
        createWalkInBooking: jasmine
          .createSpy('createWalkInBooking')
          .and.returnValue(throwError(() => errorWithCode('BOOKING_ERROR_JUMPSEAT_ACKNOWLEDGMENT_REQUIRED'))),
      });
      const alert = createAlertStub();
      alert.confirm.and.returnValue(Promise.resolve(true));
      const comp = makeComponent(api, alert);
      (comp as any).selectedTrip = makeTrip();
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      await (comp as any).onSell(validPayload);

      // Exactly one confirm prompt and one retry attempt (2 total create
      // calls) — the second failure does NOT prompt again.
      expect(alert.confirm).toHaveBeenCalledTimes(1);
      expect(api.createWalkInBooking).toHaveBeenCalledTimes(2);
      expect(alert.error).toHaveBeenCalledWith('STAFF.SELL.ERR_JUMPSEAT_ACK_REQUIRED');
    });

    it('does NOT reactively retry when the proactive hint already sent jumpSeatAcknowledged:true (defensive — should not occur once ack=true is sent)', async () => {
      const api = createStaffApiStub({
        createWalkInBooking: jasmine
          .createSpy('createWalkInBooking')
          .and.returnValue(throwError(() => errorWithCode('BOOKING_ERROR_JUMPSEAT_ACKNOWLEDGMENT_REQUIRED'))),
      });
      const alert = createAlertStub();
      alert.confirm.and.returnValue(Promise.resolve(true)); // proactive gate confirms
      const comp = makeComponent(api, alert);
      (comp as any).selectedTrip = makeTrip({
        soldPaidCount: 20,
        reservedUnpaidCount: 0,
        normalCapacity: 20,
      }); // proactive hint DOES fire (overflowUnits = 1)
      (comp as any).selectedSeats = ['B1'];
      setSegmentFare(comp, 300);

      await (comp as any).onSell(validPayload);

      // Only the ONE proactive confirm — no second (reactive) prompt, since
      // this attempt already carried jumpSeatAcknowledged:true.
      expect(alert.confirm).toHaveBeenCalledTimes(1);
      expect(api.createWalkInBooking).toHaveBeenCalledTimes(1);
      expect(alert.error).toHaveBeenCalledWith('STAFF.SELL.ERR_JUMPSEAT_ACK_REQUIRED');
    });
  });
});
