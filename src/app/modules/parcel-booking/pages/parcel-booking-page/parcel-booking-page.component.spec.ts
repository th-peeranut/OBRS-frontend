import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { StationService } from '../../../../services/station/station.service';
import { ParcelBookingService } from '../../../../services/parcel-booking/parcel-booking.service';
import { BookingService } from '../../../../services/booking/booking.service';
import { ParcelBookingPageComponent } from './parcel-booking-page.component';
// OBRS-1141: the component resolves the delay-disclosure strings itself,
// because a PrimeNG dropdown option is a plain `{id,label}` and cannot host
// the shared component. With no dictionary loaded, `instant()` returns the
// KEY, which is what the assertions below match on.
import { TranslateModule } from '@ngx-translate/core';

describe('ParcelBookingPageComponent', () => {
  let component: ParcelBookingPageComponent;
  let fixture: ComponentFixture<ParcelBookingPageComponent>;
  let stationService: jasmine.SpyObj<StationService>;
  let parcelBookingService: jasmine.SpyObj<ParcelBookingService>;
  let bookingService: jasmine.SpyObj<BookingService>;

  const stations = [
    { id: 1, slug: 'a', status: 'operational', stopType: 'station', createdAt: '', updatedAt: '' },
    { id: 2, slug: 'b', status: 'operational', stopType: 'station', createdAt: '', updatedAt: '' },
  ];

  beforeEach(async () => {
    stationService = jasmine.createSpyObj('StationService', ['getAll']);
    parcelBookingService = jasmine.createSpyObj('ParcelBookingService', [
      'getMyProfile',
      'getParcelQuote',
      'createOnlineParcelBooking',
      'searchParcelSchedules',
    ]);
    bookingService = jasmine.createSpyObj('BookingService', [
      'setActiveBookingId',
      'clearActiveBookingId',
    ]);

    stationService.getAll.and.returnValue(of({ code: 200, message: 'OK', data: stations as any }));

    await TestBed.configureTestingModule({
      declarations: [ParcelBookingPageComponent],
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: StationService, useValue: stationService },
        { provide: ParcelBookingService, useValue: parcelBookingService },
        { provide: BookingService, useValue: bookingService },
      ],
      schemas: [],
    })
      .overrideComponent(ParcelBookingPageComponent, {
        set: { template: '' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ParcelBookingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates and loads the station list on init', () => {
    expect(component).toBeTruthy();
    expect(stationService.getAll).toHaveBeenCalled();
    expect((component as any).allStations.length).toBe(2);
  });

  it('searches schedules once from/to/date are all set, using station SLUGS, via the dedicated parcel search endpoint (NOT the passenger schedule search)', () => {
    parcelBookingService.searchParcelSchedules.and.returnValue(
      of({
        code: 200,
        message: 'OK',
        data: [
          {
            id: 42,
            vehicleType: 'Van',
            departureDateTime: '2026-08-01T08:00:00+07:00',
            arrivalDateTime: '2026-08-01T10:00:00+07:00',
            pricePerSeat: 100,
            availableSeats: 10,
            availableSeatNumbers: [],
          },
        ],
      })
    );

    (component as any).onFromStationChange(1);
    (component as any).onToStationChange(2);
    (component as any).onDateChange(new Date('2026-08-01'));

    expect(parcelBookingService.searchParcelSchedules).toHaveBeenCalled();
    const payload = parcelBookingService.searchParcelSchedules.calls.mostRecent().args[0] as any;
    expect(payload.fromStop).toBe('a');
    expect(payload.toStop).toBe('b');
    expect(payload.departureDate).toBe('2026-08-01');
    // No numberOfPassengers/bookingType — this endpoint is cargo-only.
    expect(payload.numberOfPassengers).toBeUndefined();
    expect(payload.bookingType).toBeUndefined();
    expect((component as any).scheduleOptions.length).toBe(1);
    expect((component as any).scheduleOptions[0].id).toBe(42);
    expect((component as any).noSchedulesFound).toBe(false);
  });

  // This is the regression OBRS-415 exists to fix: the passenger schedule
  // search filters on seat availability and would silently hide a
  // seat-full schedule that still has free cargo quota. A consigned parcel
  // takes zero seats, so a schedule with availableSeats:0 MUST still
  // surface as a pickable option here — it must not be filtered, hidden,
  // or dropped client-side.
  it('still surfaces a schedule with availableSeats:0 as a pickable option (seat-full-but-cargo-open)', () => {
    parcelBookingService.searchParcelSchedules.and.returnValue(
      of({
        code: 200,
        message: 'OK',
        data: [
          {
            id: 123,
            vehicleType: 'van_std',
            departureDateTime: '2026-08-01T08:00:00+07:00',
            arrivalDateTime: '2026-08-01T10:00:00+07:00',
            pricePerSeat: '300.00',
            availableSeats: 0,
            availableSeatNumbers: [],
            routeSlug: 'route-ab',
            seatingMode: 'OPEN',
          },
        ],
      })
    );

    (component as any).onFromStationChange(1);
    (component as any).onToStationChange(2);
    (component as any).onDateChange(new Date('2026-08-01'));

    expect((component as any).scheduleOptions.length).toBe(1);
    expect((component as any).scheduleOptions[0].id).toBe(123);
    expect((component as any).noSchedulesFound).toBe(false);
  });

  it('on a search error: clears scheduleOptions and sets noSchedulesFound', () => {
    parcelBookingService.searchParcelSchedules.and.returnValue(throwError(() => new Error('boom')));

    (component as any).onFromStationChange(1);
    (component as any).onToStationChange(2);
    (component as any).onDateChange(new Date('2026-08-01'));

    expect((component as any).scheduleOptions.length).toBe(0);
    expect((component as any).noSchedulesFound).toBe(true);
    expect((component as any).isLoadingSchedules).toBe(false);
  });

  it('advances to details phase on trip next and loads the profile', () => {
    parcelBookingService.getMyProfile.and.returnValue(
      of({
        code: 200,
        message: 'OK',
        data: { firstName: 'Somchai', lastName: 'Jaidee', phoneNumber: '0812345678' },
      })
    );

    (component as any).onTripNext({
      fromStationId: 1,
      toStationId: 2,
      date: new Date('2026-08-01'),
      scheduleId: 42,
    });

    expect((component as any).phase).toBe('details');
    expect((component as any).senderNameDisplay).toBe('Somchai Jaidee');
    expect((component as any).senderPhonePrefill).toBe('0812345678');
    expect((component as any).detailsScheduleId).toBe(42);
    expect((component as any).detailsPickupStopId).toBe(1);
    expect((component as any).detailsDropoffStopId).toBe(2);
  });

  it('on successful submit: sets the active booking id and advances to payment', () => {
    (component as any).tripValue = {
      fromStationId: 1,
      toStationId: 2,
      date: new Date('2026-08-01'),
      scheduleId: 42,
    };
    parcelBookingService.createOnlineParcelBooking.and.returnValue(
      of({
        code: 201,
        message: 'Created',
        data: {
          parcelId: 1,
          trackingNumber: 'PCL1',
          bookingId: 99,
          bookingNumber: 'BK1',
          amount: 120,
          deliveryStatus: 'created',
          collectionCode: null,
          recipientName: 'Somchai',
          waybillUrl: null,
        },
      })
    );

    (component as any).onDetailsSubmit({
      senderPhone: '0812345678',
      recipient: { name: 'Somchai', phone: '0898765432' },
      weightKg: 5,
      description: 'a box',
      prohibitedAcknowledged: true,
    });

    expect(bookingService.setActiveBookingId).toHaveBeenCalledWith(99);
    expect((component as any).phase).toBe('payment');
    expect((component as any).trackingNumber).toBe('PCL1');
    expect((component as any).amount).toBe(120);
  });

  it('on a mapped server error: sets serverErrorKey and stays on the details phase', () => {
    (component as any).tripValue = {
      fromStationId: 1,
      toStationId: 2,
      date: new Date('2026-08-01'),
      scheduleId: 42,
    };
    (component as any).phase = 'details';
    parcelBookingService.createOnlineParcelBooking.and.returnValue(
      throwError(() => ({ error: { errorCode: 'PARCEL_CARGO_CAPACITY_EXCEEDED' } }))
    );

    (component as any).onDetailsSubmit({
      senderPhone: '0812345678',
      recipient: { name: 'Somchai', phone: '0898765432' },
      weightKg: 5,
      description: 'a box',
      prohibitedAcknowledged: true,
    });

    expect((component as any).phase).toBe('details');
    expect((component as any).serverErrorKey).toBe('PARCEL_BOOKING.ERROR.CARGO_CAPACITY_EXCEEDED');
    expect(bookingService.setActiveBookingId).not.toHaveBeenCalled();
  });

  // Scrutinize finding: PARCEL_SENDER_NAME_UNRESOLVED (the backend's
  // resolveSenderName 409, a deliberate spec-sanctioned new code) was
  // absent from the FE error map — it must not fall through to GENERIC.
  it('maps PARCEL_SENDER_NAME_UNRESOLVED to its own "complete your profile" key', () => {
    (component as any).tripValue = {
      fromStationId: 1,
      toStationId: 2,
      date: new Date('2026-08-01'),
      scheduleId: 42,
    };
    (component as any).phase = 'details';
    parcelBookingService.createOnlineParcelBooking.and.returnValue(
      throwError(() => ({ error: { errorCode: 'PARCEL_SENDER_NAME_UNRESOLVED' } }))
    );

    (component as any).onDetailsSubmit({
      senderPhone: '0812345678',
      recipient: { name: 'Somchai', phone: '0898765432' },
      weightKg: 5,
      description: 'a box',
      prohibitedAcknowledged: true,
    });

    expect((component as any).serverErrorKey).toBe('PARCEL_BOOKING.ERROR.SENDER_NAME_UNRESOLVED');
    expect((component as any).serverErrorKey).not.toBe('PARCEL_BOOKING.ERROR.GENERIC');
  });

  // OBRS-839 (found by that card's census — this file was not on its list).
  // Both error maps keyed the schedule/stop not-found cases by the DOTTED
  // messageKey. `ResourceNotFoundException` is thrown with a messageKey and no
  // explicit errorCode, so `DomainException.getErrorCode()` derives
  // `SCHEDULE_ERROR_ID_NOT_FOUND` — the dotted key could never be hit, and a
  // customer whose chosen trip disappeared between search and pay got GENERIC
  // instead of being told the trip is gone.
  it('maps the WIRE code for a vanished schedule to NOT_FOUND, not GENERIC', () => {
    (component as any).tripValue = {
      fromStationId: 1,
      toStationId: 2,
      date: new Date('2026-08-01'),
      scheduleId: 42,
    };
    (component as any).phase = 'details';
    parcelBookingService.createOnlineParcelBooking.and.returnValue(
      throwError(() => ({ error: { errorCode: 'SCHEDULE_ERROR_ID_NOT_FOUND' } }))
    );

    (component as any).onDetailsSubmit({
      senderPhone: '0812345678',
      recipient: { name: 'Somchai', phone: '0898765432' },
      weightKg: 5,
      description: 'a box',
      prohibitedAcknowledged: true,
    });

    expect((component as any).serverErrorKey).toBe('PARCEL_BOOKING.ERROR.NOT_FOUND');
  });

  it('OBRS-839 (must-NOT-match): the dotted messageKey falls through to GENERIC', () => {
    // Proof the assertion above can fail: the form the wire never carries must
    // NOT be mapped. If the map is reverted to dotted keys, the test above
    // starts failing and this one starts passing for the wrong reason — so both
    // are needed to pin the direction.
    (component as any).tripValue = {
      fromStationId: 1,
      toStationId: 2,
      date: new Date('2026-08-01'),
      scheduleId: 42,
    };
    (component as any).phase = 'details';
    parcelBookingService.createOnlineParcelBooking.and.returnValue(
      throwError(() => ({ error: { errorCode: 'schedule.error.id-not-found' } }))
    );

    (component as any).onDetailsSubmit({
      senderPhone: '0812345678',
      recipient: { name: 'Somchai', phone: '0898765432' },
      weightKg: 5,
      description: 'a box',
      prohibitedAcknowledged: true,
    });

    expect((component as any).serverErrorKey).toBe('PARCEL_BOOKING.ERROR.GENERIC');
  });

  it('onPaymentCompleted clears the active booking id as a safety net', () => {
    (component as any).onPaymentCompleted();
    expect(bookingService.clearActiveBookingId).toHaveBeenCalled();
  });

  // OBRS-1141 AC3. This dropdown is the parcel flow's schedule search result and
  // runs the SAME searchSchedulesWithAvailability query as the passenger search
  // (searchSchedulesForParcel delegates to it), so its rows can carry an
  // announced delay. The disclosure has to live in the label text here, because
  // a ParcelScheduleOption is {id,label} with nowhere to put markup.
  function searchWith(rows: any[]): void {
    parcelBookingService.searchParcelSchedules.and.returnValue(
      of({ code: 200, message: 'OK', data: rows })
    );
    (component as any).onFromStationChange(1);
    (component as any).onToStationChange(2);
    (component as any).onDateChange(new Date('2026-08-01'));
  }

  const onTimeRow = {
    id: 7,
    vehicleType: 'Van',
    departureDateTime: '2026-08-01T08:00:00',
    arrivalDateTime: '2026-08-01T10:00:00',
    pricePerSeat: 100,
    availableSeats: 10,
    availableSeatNumbers: [],
  };

  it('AC2 — an on-time schedule keeps its label exactly as before', () => {
    searchWith([onTimeRow]);

    const label = (component as any).scheduleOptions[0].label as string;
    expect(label).toBe('01/08/2026 08:00 - 10:00 · Van');
  });

  it('AC1/AC3 — a delayed schedule says so in the label, with the time it was planned for', () => {
    searchWith([
      {
        ...onTimeRow,
        id: 8,
        departureDateTime: '2026-08-01T10:00:00',
        arrivalDateTime: '2026-08-01T12:00:00',
        scheduledDepartureDateTime: '2026-08-01T08:00:00',
      },
    ]);

    const label = (component as any).scheduleOptions[0].label as string;
    // The headline is still the EFFECTIVE departure (OBRS-1099)...
    expect(label).toContain('01/08/2026 10:00');
    // ...plus the disclosure, both strings resolved through i18n, never literal.
    expect(label).toContain('SCHEDULE_DELAY_NOTICE.BADGE');
    expect(label).toContain('SCHEDULE_DELAY_NOTICE.PLANNED');
  });

  it('AC5 — a delay across midnight is legible because the label already carries the DATE', () => {
    searchWith([
      {
        ...onTimeRow,
        id: 9,
        departureDateTime: '2026-08-02T00:30:00',
        arrivalDateTime: '2026-08-02T02:30:00',
        scheduledDepartureDateTime: '2026-08-01T23:30:00',
      },
    ]);

    const label = (component as any).scheduleOptions[0].label as string;
    expect(label).toContain('02/08/2026 00:30');
    expect(label).toContain('SCHEDULE_DELAY_NOTICE.BADGE');
  });
});
