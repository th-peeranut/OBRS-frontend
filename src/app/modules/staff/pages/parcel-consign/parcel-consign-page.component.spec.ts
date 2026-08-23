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
                seatingMode: 'ASSIGNED',
                availableSeatNumbers: ['A1', 'A2'],
              },
              // OBRS-615: an OPEN-seating trip that DOES carry a seat list — on OPEN the
              // backend aggregates every seat on the vehicle however full it is, so a stub
              // with an empty list here would prove nothing about the branch.
              {
                scheduleId: 43,
                vehicleType: 'bus',
                licensePlate: 'CD-5678',
                driverName: 'Jane',
                departureDateTime: '2026-07-14T09:30:00',
                arrivalDateTime: '2026-07-14T19:30:00',
                pricePerSeat: '300',
                capacity: 21,
                availableCount: 10,
                reservedUnpaidCount: 0,
                soldPaidCount: 0,
                seatingMode: 'OPEN',
                availableSeatNumbers: ['B1', 'B2'],
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
    // OBRS-341 (card AC follow-up)
    payWalkIn: jasmine.createSpy('payWalkIn').and.returnValue(
      of({
        code: 200,
        message: 'OK',
        data: { id: 1, bookingId: 91, status: 'paid', paymentMethod: 'cash', amount: 150 },
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

// OBRS-960 — a bare BehaviorSubject-backed stub of ParcelShareConfigStore's
// public surface (data$/error$/refresh()), same shape as createCargoStoreStub
// above. Tests drive fail-safe behavior by pushing onto these subjects directly.
function createShareConfigStoreStub(): any {
  return {
    data$: new BehaviorSubject<{ driverPct: number; salespersonPct: number; configured: boolean } | null>(null),
    error$: new BehaviorSubject(false),
    refresh: jasmine.createSpy('refresh').and.returnValue(Promise.resolve()),
  };
}

describe('ParcelConsignPageComponent', () => {
  let staffApi: any;
  let cargoStore: any;
  let shareConfigStore: any;
  let component: ParcelConsignPageComponent;

  beforeEach(() => {
    staffApi = createStaffApiStub();
    cargoStore = createCargoStoreStub();
    shareConfigStore = createShareConfigStoreStub();
    component = new ParcelConsignPageComponent(staffApi, cargoStore, shareConfigStore);
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
      { value: '43', label: 'Bangkok - Chiang Mai · 09:30 · bus' },
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
    component.ngOnInit(); // OBRS-616 — the quote pipeline is wired there
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
    component.ngOnInit(); // OBRS-616 — the quote pipeline is wired there
    staffApi.getParcelQuote.and.returnValue(
      throwError(() => ({ error: { errorCode: 'PARCEL_STOP_PAIR_NOT_PRICEABLE' } }))
    );
    component['onQuoteParamsChange']({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 });

    expect(component['quoteErrorKey']).toBe('STAFF.PARCEL_CONSIGN.ERROR.STOP_PAIR_NOT_PRICEABLE');
  });

  // OBRS-616 — two quote requests overlap whenever the salesperson changes a
  // field faster than the API answers (debounce shortens that window, it does
  // not close it). Which price the page ends up showing must be decided by
  // which request was issued LAST, never by which response the network
  // happened to deliver last. Walked red against the pre-fix plain
  // `.subscribe()`: the stale 100 overwrote the fresh 180.
  it('IGNORES an earlier quote response that arrives after a newer request was issued', () => {
    component.ngOnInit();
    const first$ = new Subject<any>();
    const second$ = new Subject<any>();
    staffApi.getParcelQuote.and.returnValues(first$.asObservable(), second$.asObservable());

    component['onQuoteParamsChange']({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 });
    component['onQuoteParamsChange']({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 9 });

    second$.next({
      code: 200,
      message: 'OK',
      data: { amount: 180, farePerUnit: 20, unitCount: 9, weightTierMultiplier: 1 },
    });
    first$.next({
      code: 200,
      message: 'OK',
      data: { amount: 100, farePerUnit: 20, unitCount: 5, weightTierMultiplier: 1 },
    });

    expect(component['quote']).toEqual({ amount: 180, farePerUnit: 20, unitCount: 9, weightTierMultiplier: 1 });
    expect(component['isLoadingQuote']).toBeFalse();
  });

  // OBRS-616 — same race, error branch: the stale response's own writer is
  // `quote = null` + `quoteErrorKey`, so an earlier request FAILING late used
  // to blank a price that the newer request had already answered correctly.
  it('IGNORES an earlier quote ERROR that arrives after a newer request was issued', () => {
    component.ngOnInit();
    const first$ = new Subject<any>();
    const second$ = new Subject<any>();
    staffApi.getParcelQuote.and.returnValues(first$.asObservable(), second$.asObservable());

    component['onQuoteParamsChange']({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 5 });
    component['onQuoteParamsChange']({ scheduleId: 42, pickupStopId: 1, dropoffStopId: 2, weightKg: 9 });

    second$.next({
      code: 200,
      message: 'OK',
      data: { amount: 180, farePerUnit: 20, unitCount: 9, weightTierMultiplier: 1 },
    });
    first$.error({ error: { errorCode: 'PARCEL_STOP_PAIR_NOT_PRICEABLE' } });

    expect(component['quote']).toEqual({ amount: 180, farePerUnit: 20, unitCount: 9, weightTierMultiplier: 1 });
    expect(component['quoteErrorKey']).toBeNull();
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

  it('onScheduleChange() offers NO seat numbers on an OPEN-seating trip, seat list or not (OBRS-615)', () => {
    component.ngOnInit();
    component['onScheduleChange']('42');
    expect(component['carryOnAvailableSeatNumbers']).toEqual(['A1', 'A2']);

    component['onScheduleChange']('43');

    expect(component['carryOnAvailableSeatNumbers']).toEqual([]);
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

  // ---------------------------------------------------------------------------
  // OBRS-341 (card AC follow-up) — "เก็บเงินสด" (pay cash)
  // ---------------------------------------------------------------------------

  describe('onPayCash() — double-click / retry safety and free-aisle exclusion', () => {
    function seedOnSeatResult(): void {
      component['carryOnResult'] = {
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
      };
    }

    it('calls payWalkIn with the bookingId from the carry-on result and flips carryOnPaid on success', () => {
      seedOnSeatResult();

      component['onPayCash']();

      expect(staffApi.payWalkIn).toHaveBeenCalledWith(91, jasmine.any(String));
      expect(component['carryOnPaid']).toBeTrue();
      expect(component['isPayingCarryOn']).toBeFalse();
    });

    // Card AC follow-up hard requirement: "Generate the idempotency key ONCE
    // per minted booking and reuse it on retry — do not mint a fresh key per
    // click, or a double-click becomes a double charge."
    it('reuses the SAME idempotency key across a synchronous double-click (in-flight guard blocks the 2nd)', () => {
      seedOnSeatResult();
      const late$ = new Subject<any>();
      staffApi.payWalkIn.and.returnValue(late$.asObservable());

      component['onPayCash'](); // 1st click — isPayingCarryOn flips true
      component['onPayCash'](); // 2nd click while still in flight — must no-op

      expect(staffApi.payWalkIn).toHaveBeenCalledTimes(1);
    });

    it('reuses the SAME idempotency key on a RETRY after a failed attempt (no fresh key minted)', () => {
      seedOnSeatResult();
      staffApi.payWalkIn.and.returnValue(throwError(() => ({ error: { errorCode: 'PAYMENT_IN_PROGRESS' } })));

      component['onPayCash'](); // fails
      expect(component['carryOnPaid']).toBeFalse();

      staffApi.payWalkIn.and.returnValue(
        of({ code: 200, message: 'OK', data: { id: 1, bookingId: 91, status: 'paid', paymentMethod: 'cash', amount: 150 } })
      );
      component['onPayCash'](); // retry

      const keys = staffApi.payWalkIn.calls.allArgs().map((args: unknown[]) => args[1]);
      expect(keys[0]).toBe(keys[1]); // SAME key both times, not regenerated
      expect(component['carryOnPaid']).toBeTrue();
    });

    it('does nothing once already paid (button not reachable again)', () => {
      seedOnSeatResult();
      component['carryOnPaid'] = true;

      component['onPayCash']();

      expect(staffApi.payWalkIn).not.toHaveBeenCalled();
    });

    it('maps a failed pay attempt to its i18n key and leaves the action retryable', () => {
      seedOnSeatResult();
      staffApi.payWalkIn.and.returnValue(throwError(() => ({ error: { errorCode: 'BOOKING_ALREADY_PAID' } })));

      component['onPayCash']();

      expect(component['carryOnPayErrorKey']).toBe('STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.PAY_BOOKING_ALREADY_PAID');
      expect(component['carryOnPaid']).toBeFalse();
      expect(component['isPayingCarryOn']).toBeFalse(); // re-enabled, not stuck disabled
    });

    // Defense-in-depth: the result panel's template never renders the pay
    // button for a free-aisle result (see that component's spec), but this
    // pins the PAGE method itself also refuses to charge a 0.00 booking.
    it('is a no-op for a free-aisle result even if called directly', () => {
      component['carryOnResult'] = {
        parcelId: 6,
        trackingNumber: 'P-FREE1',
        bookingId: 92,
        bookingNumber: 'B-000092',
        parcelType: 'carry_on_seat',
        freeAisle: true,
        seatCount: null,
        seatNumbers: null,
        amount: 0,
        bookingNetAmount: 0,
      };

      component['onPayCash']();

      expect(staffApi.payWalkIn).not.toHaveBeenCalled();
    });

    // Same shape as the modeEpoch quote/submit guards above (AGENT_MEMORY.md's
    // OBRS-341 note): a pay response for one item must not write onto
    // whatever the page shows after the salesperson has already moved on.
    it('DROPS a pay response that resolves after the salesperson moved to the next item', () => {
      seedOnSeatResult();
      const late$ = new Subject<any>();
      staffApi.payWalkIn.and.returnValue(late$.asObservable());

      component['onPayCash']();
      component['onNextItem'](); // resultEpoch bumps; carryOnResult cleared
      late$.next({ code: 200, message: 'OK', data: { id: 1, bookingId: 91, status: 'paid', paymentMethod: 'cash', amount: 150 } });

      expect(component['carryOnPaid']).toBeFalse();
    });

    it('DROPS a pay response that resolves after a mode switch', () => {
      // Enter carry-on mode FIRST (default mode is already 'consigned', so
      // switching straight to 'consigned' below would be a no-op and never
      // bump resultEpoch — this mirrors the real flow: pay while IN
      // carry-on mode, then the salesperson switches away).
      component['onModeChange']('carry_on_seat');
      seedOnSeatResult();
      const late$ = new Subject<any>();
      staffApi.payWalkIn.and.returnValue(late$.asObservable());

      component['onPayCash']();
      component['onModeChange']('consigned'); // an ACTUAL switch this time
      late$.next({ code: 200, message: 'OK', data: { id: 1, bookingId: 91, status: 'paid', paymentMethod: 'cash', amount: 150 } });

      expect(component['carryOnPaid']).toBeFalse();
    });
  });

  // ---------------------------------------------------------------------------
  // OBRS-341 (card AC follow-up) — "รับชิ้นต่อไป" (next item)
  // ---------------------------------------------------------------------------

  describe('onNextItem() — resets the page to an empty form of the SAME mode', () => {
    it('clears the result/quote/payment state without changing mode', () => {
      component.ngOnInit();
      component['onModeChange']('carry_on_seat');
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
      component['carryOnPaid'] = true;
      component['serverErrorKey'] = 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.GENERIC';

      component['onNextItem']();

      expect(component['mode']).toBe('carry_on_seat'); // SAME mode, not reset
      expect(component['carryOnResult']).toBeNull();
      expect(component['result']).toBeNull();
      expect(component['carryOnPaid']).toBeFalse();
      expect(component['isPayingCarryOn']).toBeFalse();
      expect(component['serverErrorKey']).toBeNull();
    });

    it('calls the form\'s resetForNextItem() so the underlying FormGroup is blanked too', () => {
      const resetSpy = jasmine.createSpy('resetForNextItem');
      component['formRef'] = { resetForNextItem: resetSpy } as any;

      component['onNextItem']();

      expect(resetSpy).toHaveBeenCalled();
    });

    it('a NEW booking after "next item" mints a fresh idempotency key (not the previous booking\'s)', () => {
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
      component['onPayCash']();
      const firstKey = staffApi.payWalkIn.calls.mostRecent().args[1];

      component['onNextItem']();
      component['carryOnResult'] = {
        parcelId: 7,
        trackingNumber: 'P-2',
        bookingId: 93,
        bookingNumber: 'B-93',
        parcelType: 'carry_on_seat',
        freeAisle: false,
        seatCount: 1,
        seatNumbers: ['A2'],
        amount: 150,
        bookingNetAmount: 150,
      };
      component['onPayCash']();
      const secondKey = staffApi.payWalkIn.calls.mostRecent().args[1];

      expect(secondKey).not.toBe(firstKey);
    });
  });

  // OBRS-960 — the card's central fail-safe requirement: an error on the
  // share-config GET must still SHOW the warning, never hide it (the amount
  // freezes at whatever % was in effect at intake, so hiding the warning on
  // a transient failure would let parcels silently freeze at 0%).
  describe('OBRS-960 — parcel share "not configured" banner (fail-safe)', () => {
    it('defaults shareNotConfigured to true before any fetch resolves', () => {
      expect(component['shareNotConfigured']).toBeTrue();
    });

    it('clears the warning only on a successful fetch reporting configured:true', () => {
      component.ngOnInit();
      shareConfigStore.data$.next({ driverPct: 10, salespersonPct: 5, configured: true });
      expect(component['shareNotConfigured']).toBeFalse();
    });

    it('keeps the warning when a successful fetch reports configured:false', () => {
      component.ngOnInit();
      shareConfigStore.data$.next({ driverPct: 0, salespersonPct: 0, configured: false });
      expect(component['shareNotConfigured']).toBeTrue();
    });

    it('re-shows the warning when the GET fails, even after a prior configured:true fetch', () => {
      component.ngOnInit();
      shareConfigStore.data$.next({ driverPct: 10, salespersonPct: 5, configured: true });
      expect(component['shareNotConfigured']).toBeFalse();

      shareConfigStore.error$.next(true);
      expect(component['shareNotConfigured']).toBeTrue();
    });
  });
});
