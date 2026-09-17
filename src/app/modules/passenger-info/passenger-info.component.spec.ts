import { of, throwError } from 'rxjs';
import { PassengerInfoComponent } from './passenger-info.component';
import { PassengerInfo } from '../../shared/interfaces/passenger-info.interface';
import { PRIVACY_POLICY_VERSION } from '../privacy-policy/privacy-policy.version';
import {
  createAnalyticsServiceStub,
  createRouterStub,
  createScheduleServiceStub,
  createStoreStub,
  createTranslateStub,
} from '../../testing/test-stubs';
import { PassengerInfoSummaryComponent } from './components/passenger-info-summary/passenger-info-summary.component';
import { BookerInfoFormComponent } from './components/booker-info-form/booker-info-form.component';
import { PassengerInfoFormComponent } from './components/passenger-info-form/passenger-info-form.component';
import { FormBuilder } from '@angular/forms';

describe('PassengerInfoComponent', () => {
  let component: PassengerInfoComponent;

  beforeEach(() => {
    component = new PassengerInfoComponent(
      createStoreStub(),
      createRouterStub(),
      {} as never,
      createTranslateStub(),
      {} as never,
      createAnalyticsServiceStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('buildPassengersPayload() (OBRS-296)', () => {
    function buildPassenger(overrides: Partial<PassengerInfo> = {}): PassengerInfo {
      return {
        isAdult: true,
        title: 1,
        firstName: 'John',
        middleName: '',
        lastName: 'Doe',
        phoneNumber: '',
        gender: 'MALE',
        isSelectSeat: true,
        passengerSeat: '1',
        passengerSeatReturn: '',
        ...overrides,
      };
    }

    it('emits fareCategory: "adult" for an adult passenger (isAdult: true)', () => {
      const passengers = [buildPassenger({ isAdult: true })];

      const payload = (component as any).buildPassengersPayload(passengers, 'outbound');

      expect(payload[0].fareCategory).toBe('adult');
    });

    it('emits fareCategory: "child" for a child passenger (isAdult: false) — never coerced truthy', () => {
      const passengers = [buildPassenger({ isAdult: false })];

      const payload = (component as any).buildPassengersPayload(passengers, 'outbound');

      expect(payload[0].fareCategory).toBe('child');
    });

    it('passengerType (gender) and fareCategory are independent fields on the same passenger', () => {
      const passengers = [buildPassenger({ isAdult: false, gender: 'FEMALE' })];

      const payload = (component as any).buildPassengersPayload(passengers, 'outbound');

      expect(payload[0].fareCategory).toBe('child');
      expect(payload[0].passengerType).toBe('female');
    });

    // OBRS-1357: RED on the old code, which returned 'male' for anything falsy. That default was
    // unreachable while the form required the field, so making the field optional would have turned
    // it into a silent lie — every customer who declined to answer recorded as male, and told so in
    // their own confirmation email. "Not stated" has to survive the payload boundary as null.
    it('emits passengerType: null when the passenger stated no gender/status — never a "male" default', () => {
      const passengers = [buildPassenger({ gender: '' })];

      const payload = (component as any).buildPassengersPayload(passengers, 'outbound');

      expect(payload[0].passengerType).toBeNull();
    });

    it('emits passengerType: null when gender is null or undefined too', () => {
      const payload = (component as any).buildPassengersPayload(
        [buildPassenger({ gender: null as never }), buildPassenger({ gender: undefined as never })],
        'outbound'
      );

      expect(payload[0].passengerType).toBeNull();
      expect(payload[1].passengerType).toBeNull();
    });
  });

  // AC-361.5 (scrutinize blocker): a leg whose schedule is OPEN seating must
  // never carry a passenger's seatPreference/seatRequirement, even if the
  // passenger set one — the 3rd `isLegOpen` arg is the gate, sourced from
  // the LEG's `seatingMode`, not from whether a seat number happens to be
  // present.
  describe('buildPassengersPayload() seatPreference/seatRequirement (OBRS-361 / AC-361.5)', () => {
    function buildPassenger(overrides: Partial<PassengerInfo> = {}): PassengerInfo {
      return {
        isAdult: true,
        title: 1,
        firstName: 'John',
        middleName: '',
        lastName: 'Doe',
        phoneNumber: '',
        gender: 'MALE',
        isSelectSeat: true,
        passengerSeat: '1',
        passengerSeatReturn: '',
        seatPreference: 'WINDOW',
        seatRequirement: 'WHEELCHAIR',
        ...overrides,
      };
    }

    it('maps uppercase FE enum values to lowercase for the API on an ASSIGNED leg', () => {
      const passengers = [buildPassenger()];

      const payload = (component as any).buildPassengersPayload(passengers, 'outbound', false);

      expect(payload[0].seatPreference).toBe('window');
      expect(payload[0].seatRequirement).toBe('wheelchair');
    });

    it('sends null for both fields when the passenger set neither (ASSIGNED leg)', () => {
      const passengers = [buildPassenger({ seatPreference: null, seatRequirement: null })];

      const payload = (component as any).buildPassengersPayload(passengers, 'outbound', false);

      expect(payload[0].seatPreference).toBeNull();
      expect(payload[0].seatRequirement).toBeNull();
    });

    it('AC-361.5: an OPEN leg strips both fields to null even though the passenger set them', () => {
      const passengers = [buildPassenger()];

      const payload = (component as any).buildPassengersPayload(passengers, 'outbound', true);

      expect(payload[0].seatPreference).toBeNull();
      expect(payload[0].seatRequirement).toBeNull();
    });

    it('AC-361.5 mixed round trip: OPEN outbound gets no prefs, ASSIGNED return gets them', () => {
      const passengers = [buildPassenger()];

      const outboundPayload = (component as any).buildPassengersPayload(
        passengers,
        'outbound',
        true // outbound leg is OPEN
      );
      const inboundPayload = (component as any).buildPassengersPayload(
        passengers,
        'inbound',
        false // return leg is ASSIGNED
      );

      expect(outboundPayload[0].seatPreference).toBeNull();
      expect(outboundPayload[0].seatRequirement).toBeNull();
      expect(inboundPayload[0].seatPreference).toBe('window');
      expect(inboundPayload[0].seatRequirement).toBe('wheelchair');
    });

    it('defaults isLegOpen to false when the 3rd arg is omitted (existing call shape preserved)', () => {
      const passengers = [buildPassenger()];

      const payload = (component as any).buildPassengersPayload(passengers, 'outbound');

      expect(payload[0].seatPreference).toBe('window');
      expect(payload[0].seatRequirement).toBe('wheelchair');
    });
  });

  // OBRS-1226 AC5: the headcount the summary sidebar shows and the headcount
  // POST /bookings carries are the same list, counted the same way. Both sides
  // are asserted against ONE array here on purpose — the bug was two sources
  // drifting apart, so a test that builds its own expectation per side would
  // not have caught it.
  describe('the summary headcount and the POST /bookings headcount are the same list (OBRS-1226)', () => {
    function buildPassenger(overrides: Partial<PassengerInfo> = {}): PassengerInfo {
      return {
        isAdult: true,
        title: 1,
        firstName: 'John',
        middleName: '',
        lastName: 'Doe',
        phoneNumber: '',
        gender: 'MALE',
        isSelectSeat: true,
        passengerSeat: '',
        passengerSeatReturn: '',
        ...overrides,
      };
    }

    it('3 rows displayed = 3 passengers submitted, per leg', () => {
      const passengers = [
        buildPassenger(),
        buildPassenger(),
        buildPassenger({ isAdult: false }),
      ];
      const summary = new PassengerInfoSummaryComponent(
        createStoreStub(),
        createRouterStub(),
        createStoreStub(),
        createTranslateStub()
      );

      const outbound = (component as any).buildPassengersPayload(passengers, 'outbound', true);
      const inbound = (component as any).buildPassengersPayload(passengers, 'inbound', true);

      expect(summary.sumPassengers(passengers)).toBe(3);
      expect(outbound.length).toBe(summary.sumPassengers(passengers));
      expect(inbound.length).toBe(summary.sumPassengers(passengers));
      expect(summary.getAdultCount(passengers) + summary.getKidCount(passengers)).toBe(
        outbound.length
      );
    });
  });
  describe('buildPassengersPayload() passengerTypeConsentVersion (OBRS-1666)', () => {
    function buildPassenger(overrides: Partial<PassengerInfo> = {}): PassengerInfo {
      return {
        isAdult: true,
        title: 1,
        firstName: 'John',
        middleName: '',
        lastName: 'Doe',
        phoneNumber: '',
        gender: 'MALE',
        isSelectSeat: true,
        passengerSeat: '1',
        passengerSeatReturn: '',
        ...overrides,
      };
    }

    it('sends the notice version when a monk consented', () => {
      const payload = (component as any).buildPassengersPayload(
        [buildPassenger({ gender: 'MONK', passengerTypeConsent: true })],
        'outbound'
      );

      expect(payload[0].passengerType).toBe('monk');
      expect(payload[0].passengerTypeConsentVersion).toBe(PRIVACY_POLICY_VERSION);
    });

    it('sends null when a monk did NOT consent - the backend then drops the type', () => {
      const payload = (component as any).buildPassengersPayload(
        [buildPassenger({ gender: 'MONK', passengerTypeConsent: false })],
        'outbound'
      );

      expect(payload[0].passengerTypeConsentVersion).toBeNull();
    });

    it('sends null when the consent flag is simply absent (an untouched form)', () => {
      const payload = (component as any).buildPassengersPayload(
        [buildPassenger({ gender: 'NUN' })],
        'outbound'
      );

      expect(payload[0].passengerTypeConsentVersion).toBeNull();
    });

    it('sends null for male/female even if a consent flag somehow got set - section 26 does not cover sex', () => {
      const payload = (component as any).buildPassengersPayload(
        [
          buildPassenger({ gender: 'MALE', passengerTypeConsent: true }),
          buildPassenger({ gender: 'FEMALE', passengerTypeConsent: true }),
        ],
        'outbound'
      );

      expect(payload[0].passengerType).toBe('male');
      expect(payload[0].passengerTypeConsentVersion).toBeNull();
      expect(payload[1].passengerTypeConsentVersion).toBeNull();
    });
  });
});

/**
 * OBRS-1853. The 2026-09-11 review added `isSubmitting` to stop a double tap creating two
 * seat holds, but shipped no test for it - and the guard released too early: the success
 * path ends in `router.navigate(['/payment'])`, which was not awaited, so the flag was
 * cleared while the lazy payment chunk was still downloading and Next came back to life on
 * exactly the slow connection the guard was written for. `submitPassengerInfo` now awaits
 * the navigation, so the flag outlives it - which is what the first spec below pins down, by
 * running the real method and holding only `router.navigate` open. The rest cover the guard.
 */
describe('PassengerInfoComponent single-flight submit (OBRS-1853)', () => {
  let component: PassengerInfoComponent;

  const stubForms = (c: PassengerInfoComponent) => {
    (c as any).passengerInfoFormComponent = {
      validateAndGetPassengerInfo: () => [{ firstName: 'A' } as unknown as PassengerInfo],
    };
    (c as any).bookerInfoFormComponent = {
      validateAndGetBooker: () => ({ firstName: 'A' } as unknown as PassengerInfo),
    };
  };

  beforeEach(() => {
    component = new PassengerInfoComponent(
      createStoreStub(),
      createRouterStub(),
      {} as never,
      createTranslateStub(),
      {} as never,
      createAnalyticsServiceStub()
    );
    stubForms(component);
  });

  /**
   * The one that covers the FIX rather than the guard around it: `submitPassengerInfo` runs for
   * real, and the only thing held open is `router.navigate`. Drop the `await` in front of it and
   * this test fails - the flag is released while the lazy /payment chunk is still loading, which
   * is exactly the window a second tap used to get through.
   */
  it('keeps isSubmitting true until the navigation to /payment settles', async () => {
    let arrive!: (ok: boolean) => void;
    const navigation = new Promise<boolean>((resolve) => (arrive = resolve));
    const navigate = jasmine.createSpy('navigate').and.returnValue(navigation);

    const component = new PassengerInfoComponent(
      createStoreStub(),
      { navigate } as never,
      {
        createBooking: () =>
          of({ code: 201, data: { bookingId: 7, bookingNumber: 'BK-7' } }),
        setActiveBookingId: () => undefined,
      } as never,
      createTranslateStub(),
      { success: () => undefined, error: () => undefined } as never,
      createAnalyticsServiceStub()
    );
    stubForms(component);
    spyOn(component as any, 'buildBookingPayload').and.returnValue(
      Promise.resolve({ scheduleId: 1 })
    );
    spyOn(component as any, 'setBookingStore').and.stub();

    const submit = component.onSubmitPassengerInfo();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(navigate).toHaveBeenCalledWith(['/payment']);
    expect(component.isSubmitting).toBeTrue();

    arrive(true);
    await submit;

    expect(component.isSubmitting).toBeFalse();
  });

  it('holds isSubmitting for the whole submit', async () => {
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => (release = resolve));
    spyOn(component as any, 'submitPassengerInfo').and.returnValue(inFlight);

    const submit = component.onSubmitPassengerInfo();
    expect(component.isSubmitting).toBeTrue();

    release();
    await submit;
    expect(component.isSubmitting).toBeFalse();
  });

  it('ignores a second tap while the first submit is still in flight', async () => {
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => (release = resolve));
    const inner = spyOn(component as any, 'submitPassengerInfo').and.returnValue(inFlight);

    const first = component.onSubmitPassengerInfo();
    await component.onSubmitPassengerInfo();

    expect(inner).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('releases the guard when the submit fails, so the user can retry', async () => {
    spyOn(component as any, 'submitPassengerInfo').and.returnValue(
      Promise.reject(new Error('network'))
    );

    await expectAsync(component.onSubmitPassengerInfo()).toBeRejected();

    expect(component.isSubmitting).toBeFalse();
  });
});

/**
 * OBRS-25. `isSubmitting` closes the double TAP; this closes the RETRY. The server now refuses a
 * repeat of the same `Idempotency-Key`, but only if the client sends the same key twice - a key
 * minted per call would make the guard unreachable and leave the defect exactly where it was.
 */
describe('PassengerInfoComponent idempotency key (OBRS-25)', () => {
  const stubForms = (c: PassengerInfoComponent) => {
    (c as any).passengerInfoFormComponent = {
      validateAndGetPassengerInfo: () => [{ firstName: 'A' } as unknown as PassengerInfo],
    };
    (c as any).bookerInfoFormComponent = {
      validateAndGetBooker: () => ({ firstName: 'A' } as unknown as PassengerInfo),
    };
  };

  function componentWith(createBooking: jasmine.Spy): PassengerInfoComponent {
    const component = new PassengerInfoComponent(
      createStoreStub(),
      createRouterStub(),
      { createBooking, setActiveBookingId: () => undefined } as never,
      createTranslateStub(),
      { success: () => undefined, error: () => undefined } as never,
      createAnalyticsServiceStub()
    );
    stubForms(component);
    spyOn(component as any, 'setBookingStore').and.stub();
    return component;
  }

  const keysFrom = (spy: jasmine.Spy): string[] =>
    spy.calls.allArgs().map((args) => args[2] as string);

  it('reuses the SAME key when the customer retries an unchanged booking', async () => {
    const createBooking = jasmine
      .createSpy('createBooking')
      .and.returnValues(
        throwError(() => new Error('network')),
        of({ code: 201, data: { bookingId: 7, bookingNumber: 'BK-7' } })
      );
    const component = componentWith(createBooking);
    spyOn(component as any, 'buildBookingPayload').and.returnValue(
      Promise.resolve({ scheduleId: 1 })
    );

    await component.onSubmitPassengerInfo();
    await component.onSubmitPassengerInfo();

    const [firstKey, retryKey] = keysFrom(createBooking);
    expect(firstKey).toBeTruthy();
    expect(retryKey).toBe(firstKey);
  });

  it('mints a NEW key once the payload changes - a different booking is not a replay', async () => {
    const createBooking = jasmine
      .createSpy('createBooking')
      .and.returnValue(throwError(() => new Error('network')));
    const component = componentWith(createBooking);
    spyOn(component as any, 'buildBookingPayload').and.returnValues(
      Promise.resolve({ scheduleId: 1 }),
      Promise.resolve({ scheduleId: 2 })
    );

    await component.onSubmitPassengerInfo();
    await component.onSubmitPassengerInfo();

    const [firstKey, secondKey] = keysFrom(createBooking);
    expect(secondKey).not.toBe(firstKey);
  });

  it('drops the key after a booking is made, so the next booking is its own request', async () => {
    const createBooking = jasmine
      .createSpy('createBooking')
      .and.returnValue(of({ code: 201, data: { bookingId: 7, bookingNumber: 'BK-7' } }));
    const component = componentWith(createBooking);
    spyOn(component as any, 'buildBookingPayload').and.returnValue(
      Promise.resolve({ scheduleId: 1 })
    );

    await component.onSubmitPassengerInfo();
    await component.onSubmitPassengerInfo();

    const [firstKey, secondKey] = keysFrom(createBooking);
    expect(secondKey).not.toBe(firstKey);
  });
});

/**
 * OBRS-1952, end of the chain: the two child forms are the REAL components here, not stubs, so
 * this is the whole path the customer walked in the 2026-09-17 report — a one-character surname
 * that the browser waved through and the server answered with a bare "ข้อมูลไม่ผ่านการตรวจสอบ".
 * With the length rule in place the request is never made at all.
 */
describe('PassengerInfoComponent — a too-short name never reaches createBooking (OBRS-1952)', () => {
  function pageWith(createBooking: jasmine.Spy, lastName: string): PassengerInfoComponent {
    const component = new PassengerInfoComponent(
      createStoreStub(),
      createRouterStub(),
      { createBooking, setActiveBookingId: () => undefined } as never,
      createTranslateStub(),
      { success: () => undefined, error: () => undefined } as never,
      createAnalyticsServiceStub()
    );
    spyOn(component as any, 'setBookingStore').and.stub();

    const booker = new BookerInfoFormComponent(new FormBuilder());
    booker.bookerForm.patchValue({
      firstName: 'Somchai',
      lastName,
      phoneNumber: '0812345678',
    });

    const passengers = new PassengerInfoFormComponent(
      createStoreStub(),
      createRouterStub(),
      new FormBuilder(),
      createTranslateStub(),
      createScheduleServiceStub()
    );
    passengers.ngOnInit();
    if (passengers.passengerData.length === 0) {
      passengers.insertPassenger(true);
    }
    passengers.passengerData.at(0).patchValue({ firstName: 'Somchai', lastName });

    (component as any).bookerInfoFormComponent = booker;
    (component as any).passengerInfoFormComponent = passengers;
    return component;
  }

  it('does not call createBooking when the surname is one character', async () => {
    const createBooking = jasmine.createSpy('createBooking');
    const component = pageWith(createBooking, 'T');

    await component.onSubmitPassengerInfo();

    expect(createBooking).not.toHaveBeenCalled();
  });

  it('marks the offending control invalid rather than failing silently somewhere else', async () => {
    const createBooking = jasmine.createSpy('createBooking');
    const component = pageWith(createBooking, 'T');

    await component.onSubmitPassengerInfo();

    const booker = (component as any).bookerInfoFormComponent as BookerInfoFormComponent;
    expect(booker.bookerForm.get('lastName')?.hasError('minlength')).toBeTrue();
    expect(booker.bookerForm.get('lastName')?.touched)
      .withContext('markAllAsTouched() ran, so the inline error is on screen')
      .toBeTrue();
  });
});
