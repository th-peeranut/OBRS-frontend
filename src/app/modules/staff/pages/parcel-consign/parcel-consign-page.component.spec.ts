import { BehaviorSubject, of, throwError } from 'rxjs';
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
                availableSeatNumbers: [],
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
});
