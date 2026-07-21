import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { ParcelConsignPageComponent } from './parcel-consign-page.component';

function createStaffApiStub(): any {
  return {
    getWalkInSchedules: jasmine.createSpy('getWalkInSchedules').and.returnValue(
      of({
        code: 200,
        message: 'OK',
        data: [
          {
            routeSlug: 'bkk-cnx',
            routeLabel: 'Bangkok - Chiang Mai',
            trips: [
              {
                scheduleId: 42,
                vehicleType: 'bus',
                licensePlate: 'AB-1234',
                driverName: 'John',
                departureDateTime: '2026-07-14T08:00:00',
                arrivalDateTime: '2026-07-14T18:00:00',
                pricePerSeat: '300',
                capacity: 21,
                availableCount: 10,
                reservedUnpaidCount: 0,
                soldPaidCount: 0,
                availableSeatNumbers: ['A1', 'A2'],
              },
            ],
          },
        ],
      })
    ),
    getRouteSegments: jasmine.createSpy('getRouteSegments').and.returnValue(
      of({
        code: 200,
        message: 'OK',
        data: {
          route: { slug: 'bkk-cnx', name: 'Bangkok - Chiang Mai' },
          stopPairs: [
            {
              segmentId: 1,
              fromStop: { slug: 'bkk', name: 'Bangkok' },
              toStop: { slug: 'cnx', name: 'Chiang Mai' },
              vehicleType: { slug: 'bus', name: 'Bus' },
              fare: '300',
              estimatedDurationMinutes: 600,
            },
          ],
          popularPickupStops: [],
          popularDropoffStops: [],
        },
      })
    ),
    getRouteStops: jasmine.createSpy('getRouteStops').and.returnValue(
      of({
        code: 200,
        message: 'OK',
        data: {
          stops: [
            { stopOrder: 1, offsetMinutesFromOrigin: 0, stop: { code: 'bkk', id: 1 } },
            { stopOrder: 2, offsetMinutesFromOrigin: 600, stop: { code: 'cnx', id: 2 } },
          ],
        },
      })
    ),
    getParcelQuote: jasmine.createSpy('getParcelQuote').and.returnValue(
      of({ code: 200, message: 'OK', data: { amount: 100, farePerUnit: 100, unitCount: 1, weightTierMultiplier: 1 } })
    ),
    createConsignedParcel: jasmine.createSpy('createConsignedParcel').and.returnValue(
      of({
        code: 201,
        message: 'Created',
        data: {
          parcelId: 1,
          trackingNumber: 'PCL-1',
          bookingId: 10,
          bookingNumber: 'BK-1',
          amount: 100,
          deliveryStatus: 'accepted',
          collectionCode: 'ABC123',
          waybillUrl: '/staff/parcels/1/waybill',
        },
      })
    ),
    // OBRS-341
    createCarryOnParcel: jasmine.createSpy('createCarryOnParcel').and.returnValue(
      of({
        code: 201,
        message: 'Created',
        data: {
          parcelId: 5,
          trackingNumber: 'P-AB12CD34EF',
          bookingId: 91,
          bookingNumber: 'B-000091',
          parcelType: 'carry_on_seat',
          freeAisle: false,
          seatCount: 1,
          seatNumbers: ['A1'],
          amount: 150,
          bookingNetAmount: 150,
        },
      })
    ),
  };
}

function createCargoStoreStub(): any {
  return {
    data$: new BehaviorSubject(null),
    refreshing$: new BehaviorSubject(false),
    error$: new BehaviorSubject(false),
    setScheduleId: jasmine.createSpy('setScheduleId'),
    refresh: jasmine.createSpy('refresh').and.returnValue(Promise.resolve()),
  };
}

describe('ParcelConsignPageComponent', () => {
  let staffApi: any;
  let cargoStore: any;
  let component: ParcelConsignPageComponent;

  beforeEach(() => {
    staffApi = createStaffApiStub();
    cargoStore = createCargoStoreStub();
    component = new ParcelConsignPageComponent(staffApi, cargoStore);
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('loads schedule options for the selected date on init', () => {
    component.ngOnInit();
    expect(staffApi.getWalkInSchedules).toHaveBeenCalled();
    expect(component['scheduleOptions']).toEqual([
      { value: '42', label: 'Bangkok - Chiang Mai · 08:00 · bus' },
    ]);
  });

  it('resolves ordered pickup stops (by numeric stop id) on schedule change', () => {
    component.ngOnInit();
    component['onScheduleChange']('42');

    expect(staffApi.getRouteSegments).toHaveBeenCalledWith('bkk-cnx');
    expect(staffApi.getRouteStops).toHaveBeenCalledWith('bkk-cnx');
    expect(component['pickupOptions']).toEqual([
      { value: '1', label: 'Bangkok' },
      { value: '2', label: 'Chiang Mai' },
    ]);
    expect(cargoStore.setScheduleId).toHaveBeenCalledWith(42);
    expect(cargoStore.refresh).toHaveBeenCalled();
  });

  // OBRS-305 (QA-flagged blocker, 2026-07-14): pins the exact regression QA
  // reported — `GET /private/route-stops/{slug}` returning stops with NO
  // `id` (the pre-fix backend `LookupResponse` shape) must degrade to empty
  // dropdown options (never a crash, never a stop pushed with an unusable
  // id), and the fixed/with-`id` shape (the test right above this one) must
  // populate them. Together these two tests lock both sides of the fix.
  it('renders EMPTY pickup options when the backend route-stops response has no stop.id (pre-fix shape)', () => {
    staffApi.getRouteStops.and.returnValue(
      of({
        code: 200,
        message: 'OK',
        data: {
          stops: [
            { stopOrder: 1, offsetMinutesFromOrigin: 0, stop: { code: 'bkk' } },
            { stopOrder: 2, offsetMinutesFromOrigin: 600, stop: { code: 'cnx' } },
          ],
        },
      })
    );

    component.ngOnInit();
    component['onScheduleChange']('42');

    expect(component['pickupOptions']).toEqual([]);
    expect(component['dropoffOptions']).toEqual([]);
  });

  it('filters dropoff options to stops AFTER the chosen pickup (client pre-check)', () => {
    component.ngOnInit();
    component['onScheduleChange']('42');
    component['onPickupChange']('1'); // Bangkok, stopOrder 1

    expect(component['dropoffOptions']).toEqual([{ value: '2', label: 'Chiang Mai' }]);
  });

  it('emits no dropoff options when the pickup is the last stop', () => {
    component.ngOnInit();
    component['onScheduleChange']('42');
    component['onPickupChange']('2'); // Chiang Mai, stopOrder 2 (last)

    expect(component['dropoffOptions']).toEqual([]);
  });

  it('fetches a quote when quoteParamsChange emits complete params', () => {
    component['onQuoteParamsChange']({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 });

    expect(staffApi.getParcelQuote).toHaveBeenCalledWith({
      parcelType: 'consigned',
      scheduleId: 42,
      pickupStopId: 1,
      dropoffStopId: 2,
      weightKg: 5,
    });
    expect(component['quote']).toEqual({ amount: 100, farePerUnit: 100, unitCount: 1, weightTierMultiplier: 1 });
  });

  it('clears the quote when quoteParamsChange emits null', () => {
    component['onQuoteParamsChange']({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 });
    component['onQuoteParamsChange'](null);

    expect(component['quote']).toBeNull();
  });

  it('maps a PARCEL_STOP_PAIR_NOT_PRICEABLE quote error to its i18n key', () => {
    staffApi.getParcelQuote.and.returnValue(
      throwError(() => ({ error: { errorCode: 'PARCEL_STOP_PAIR_NOT_PRICEABLE' } }))
    );
    component['onQuoteParamsChange']({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 });

    expect(component['quoteErrorKey']).toBe('STAFF.PARCEL_CONSIGN.ERROR.STOP_PAIR_NOT_PRICEABLE');
  });

  it('submits and sets the result on success (201)', () => {
    component['onSubmit']({
      mode: 'consigned',
      sender: { name: 'Somchai', phone: '0812345678' },
      recipient: { name: 'Somsri', phone: '0898765432' },
      scheduleId: 42,
      pickupStopId: 1,
      dropoffStopId: 2,
      weightKg: 5,
      description: 'Documents',
      prohibitedAcknowledged: true,
    });

    expect(staffApi.createConsignedParcel).toHaveBeenCalledWith(
      jasmine.objectContaining({ parcelType: 'consigned', seatCount: null, paymentMethod: 'cash' })
    );
    expect(component['result']?.trackingNumber).toBe('PCL-1');
  });

  it('maps each documented 409 errorCode to its own inline i18n key (never the raw message)', () => {
    const cases: [string, string][] = [
      ['PARCEL_PROHIBITED_CATEGORY', 'STAFF.PARCEL_CONSIGN.ERROR.PROHIBITED_CATEGORY'],
      ['PARCEL_CARGO_CAPACITY_EXCEEDED', 'STAFF.PARCEL_CONSIGN.ERROR.CARGO_CAPACITY_EXCEEDED'],
      ['PARCEL_CARGO_CAPACITY_NOT_CONFIGURED', 'STAFF.PARCEL_CONSIGN.ERROR.CARGO_CAPACITY_NOT_CONFIGURED'],
      ['PARCEL_STOP_PAIR_NOT_PRICEABLE', 'STAFF.PARCEL_CONSIGN.ERROR.STOP_PAIR_NOT_PRICEABLE'],
    ];

    for (const [errorCode, expectedKey] of cases) {
      staffApi.createConsignedParcel.and.returnValue(throwError(() => ({ error: { errorCode } })));
      component['onSubmit']({
        mode: 'consigned',
        sender: { name: 'Somchai', phone: '0812345678' },
        recipient: { name: 'Somsri', phone: '0898765432' },
        scheduleId: 42,
        pickupStopId: 1,
        dropoffStopId: 2,
        weightKg: 5,
        description: 'Documents',
        prohibitedAcknowledged: true,
      });
      expect(component['serverErrorKey']).toBe(expectedKey);
      expect(component['result']).toBeNull();
    }
  });

  // ---------------------------------------------------------------------------
  // OBRS-341 — carry-on-on-seat mode
  // ---------------------------------------------------------------------------

  describe('onModeChange() — mode switching must not leak state between branches', () => {
    it('is a no-op when re-selecting the CURRENT mode', () => {
      component.ngOnInit();
      component['onQuoteParamsChange']({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 });
      expect(component['quote']).not.toBeNull();

      component['onModeChange']('consigned'); // already the default

      expect(component['quote']).not.toBeNull(); // untouched — no reset fired
    });

    // Scrutinize regression (OBRS-341): clearing the fields inside
    // onModeChange() is NOT sufficient on its own — a request issued under the
    // OLD mode is still in flight and its handler runs AFTER that clear,
    // re-displaying the old branch's price / success panel under the new
    // branch. Walked red by deleting the `epoch !== this.modeEpoch` guards.
    it('DROPS a quote response that resolves after a mode switch (no stale price under the new mode)', () => {
      component.ngOnInit();
      const late$ = new Subject<any>();
      staffApi.getParcelQuote.and.returnValue(late$.asObservable());

      component['onQuoteParamsChange']({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 });
      component['onModeChange']('carry_on_seat');
      late$.next({
        code: 200,
        message: 'OK',
        data: { amount: 100, farePerUnit: 100, unitCount: 1, weightTierMultiplier: 1 },
      });

      expect(component['quote']).toBeNull();
    });

    it('DROPS a submit response that resolves after a mode switch (no cross-branch result panel)', () => {
      component.ngOnInit();
      const late$ = new Subject<any>();
      staffApi.createConsignedParcel.and.returnValue(late$.asObservable());

      component['onSubmit']({
        mode: 'consigned',
        sender: { name: 'Somchai', phone: '0812345678' },
        recipient: { name: 'Somsri', phone: '0898765432' },
        scheduleId: 42,
        pickupStopId: 1,
        dropoffStopId: 2,
        weightKg: 5,
        description: 'Documents',
        prohibitedAcknowledged: true,
      });
      component['onModeChange']('carry_on_seat');
      late$.next({ code: 201, message: 'Created', data: { parcelId: 1, trackingNumber: 'PCL-LATE' } });

      expect(component['result']).toBeNull();
      expect(component['isSubmitting']).toBeFalse();
    });

    it('clears quote/result/serverErrorKey/stop selections/seat numbers on an ACTUAL mode switch', () => {
      component.ngOnInit();
      component['onScheduleChange']('42');
      component['onQuoteParamsChange']({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 });
      component['result'] = {
        parcelId: 1,
        trackingNumber: 'PCL-1',
        bookingId: 10,
        bookingNumber: 'BK-1',
        amount: 100,
        deliveryStatus: 'accepted',
        collectionCode: 'ABC123',
        waybillUrl: null,
      };
      component['serverErrorKey'] = 'STAFF.PARCEL_CONSIGN.ERROR.GENERIC';
      expect(component['pickupOptions'].length).toBeGreaterThan(0);
      expect(component['carryOnAvailableSeatNumbers']).toEqual(['A1', 'A2']);

      component['onModeChange']('carry_on_seat');

      expect(component['mode']).toBe('carry_on_seat');
      expect(component['quote']).toBeNull();
      expect(component['result']).toBeNull();
      expect(component['carryOnResult']).toBeNull();
      expect(component['serverErrorKey']).toBeNull();
      expect(component['pickupOptions']).toEqual([]);
      expect(component['dropoffOptions']).toEqual([]);
      expect(component['carryOnAvailableSeatNumbers']).toEqual([]);
      expect(cargoStore.setScheduleId).toHaveBeenCalledWith(null);
    });

    it('clears a carry-on result when switching back to consigned (the reverse direction)', () => {
      component.ngOnInit();
      component['carryOnResult'] = {
        parcelId: 5,
        trackingNumber: 'P-1',
        bookingId: 91,
        bookingNumber: 'B-91',
        parcelType: 'carry_on_seat',
        freeAisle: false,
        seatCount: 1,
        seatNumbers: ['A1'],
        amount: 150,
        bookingNetAmount: 150,
      };

      component['onModeChange']('carry_on_seat'); // enter carry-on mode first
      component['carryOnResult'] = {
        parcelId: 5,
        trackingNumber: 'P-1',
        bookingId: 91,
        bookingNumber: 'B-91',
        parcelType: 'carry_on_seat',
        freeAisle: false,
        seatCount: 1,
        seatNumbers: ['A1'],
        amount: 150,
        bookingNetAmount: 150,
      };
      component['onModeChange']('consigned'); // then back out

      expect(component['carryOnResult']).toBeNull();
    });
  });

  it('onScheduleChange() populates carryOnAvailableSeatNumbers from the matching trip (OBRS-341)', () => {
    component.ngOnInit();
    component['onScheduleChange']('42');

    expect(component['carryOnAvailableSeatNumbers']).toEqual(['A1', 'A2']);
  });

  it('getParcelQuote() is called with parcelType=carry_on_seat once in carry-on mode', () => {
    component.ngOnInit();
    component['onModeChange']('carry_on_seat');
    component['onQuoteParamsChange']({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 });

    expect(staffApi.getParcelQuote).toHaveBeenCalledWith({
      parcelType: 'carry_on_seat',
      scheduleId: 42,
      pickupStopId: 1,
      dropoffStopId: 2,
      weightKg: 5,
    });
  });

  describe('carry-on-on-seat submit', () => {
    const onSeatFormValue = {
      mode: 'carry_on_seat' as const,
      sender: { name: 'Somchai', phone: '0812345678' },
      scheduleId: 42,
      pickupStopId: 1,
      dropoffStopId: 2,
      weightKg: 5,
      description: 'Oversized backpack',
      prohibitedAcknowledged: true,
      dimensions: { lengthCm: 80, widthCm: 40, heightCm: 30 },
      seatCount: 1,
      seatNumbers: ['A1'],
    };

    it('posts carry_on_seat with seatCount/seatNumbers and sets carryOnResult on success (201)', () => {
      component['onSubmit'](onSeatFormValue);

      expect(staffApi.createCarryOnParcel).toHaveBeenCalledWith(
        jasmine.objectContaining({
          parcelType: 'carry_on_seat',
          paymentMethod: 'cash',
          seatCount: 1,
          seatNumbers: ['A1'],
        })
      );
      expect(component['result']).toBeNull(); // the OTHER branch's result field is untouched
      expect(component['carryOnResult']?.trackingNumber).toBe('P-AB12CD34EF');
    });

    it('omits seatCount/seatNumbers entirely for a free-aisle submission (contract: MUST BE ABSENT)', () => {
      const freeAisleValue = {
        ...onSeatFormValue,
        dimensions: { lengthCm: 30, widthCm: 20, heightCm: 10 },
        seatCount: undefined,
        seatNumbers: undefined,
      };

      component['onSubmit'](freeAisleValue);

      const body = staffApi.createCarryOnParcel.calls.mostRecent().args[0];
      expect('seatCount' in body).toBeFalse();
      expect('seatNumbers' in body).toBeFalse();
    });

    it('never sends a recipient field for carry_on_seat', () => {
      component['onSubmit'](onSeatFormValue);

      const body = staffApi.createCarryOnParcel.calls.mostRecent().args[0];
      expect('recipient' in body).toBeFalse();
    });

    it('maps each documented carry-on errorCode to its own CARRY_ON.ERROR.* i18n key', () => {
      const cases: [string, string][] = [
        ['PARCEL_SEAT_COUNT_REQUIRED', 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.SEAT_COUNT_REQUIRED'],
        ['PARCEL_SEAT_COUNT_NOT_ALLOWED', 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.SEAT_COUNT_NOT_ALLOWED'],
        ['PARCEL_FREE_AISLE_CAP_EXCEEDED', 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.FREE_AISLE_CAP_EXCEEDED'],
      ];

      for (const [errorCode, expectedKey] of cases) {
        staffApi.createCarryOnParcel.and.returnValue(throwError(() => ({ error: { errorCode } })));
        component['onSubmit'](onSeatFormValue);
        expect(component['serverErrorKey']).toBe(expectedKey);
        expect(component['carryOnResult']).toBeNull();
      }
    });
  });
});
