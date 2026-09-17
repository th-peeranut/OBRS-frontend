import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { PassengerInfoComponent } from './passenger-info.component';
import { PassengerInfo } from '../../shared/interfaces/passenger-info.interface';
import { PRIVACY_POLICY_VERSION } from '../privacy-policy/privacy-policy.version';
import {
  createAnalyticsServiceStub,
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../testing/test-stubs';
import { PassengerInfoSummaryComponent } from './components/passenger-info-summary/passenger-info-summary.component';

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
 * OBRS-1955. Two endings used to be silent or unhelpful: a form the client itself refused just
 * `return`ed, leaving an inline error the customer could not see; and a 400 that NAMED the fields
 * it refused was collapsed into one "ข้อมูลไม่ผ่านการตรวจสอบ" modal. Both are asserted from the
 * component's own entry point, not from a helper.
 */
describe('PassengerInfoComponent — validation that points at the field (OBRS-1955)', () => {
  let alertError: jasmine.Spy;
  let host: HTMLElement;

  function componentWith(createBooking: jasmine.Spy): PassengerInfoComponent {
    alertError = jasmine.createSpy('error');
    const component = new PassengerInfoComponent(
      createStoreStub(),
      createRouterStub(),
      { createBooking, setActiveBookingId: () => undefined } as never,
      { instant: (key: string) => key } as never,
      { success: () => undefined, error: alertError } as never,
      createAnalyticsServiceStub()
    );
    spyOn(component as any, 'setBookingStore').and.stub();
    // Same shortcut the OBRS-25 harness above takes: `createStoreStub()` yields `of(null)`, so the
    // real `buildBookingPayload` returns null and the request is never made - which would make
    // every assertion below pass against a component that does nothing.
    spyOn(component as any, 'buildBookingPayload').and.returnValue(
      Promise.resolve({ scheduleId: 1 })
    );
    (component as any).passengerInfoFormComponent = {
      validateAndGetPassengerInfo: () => [{ firstName: 'A' } as unknown as PassengerInfo],
    };
    (component as any).bookerInfoFormComponent = {
      validateAndGetBooker: () => ({ firstName: 'A' } as unknown as PassengerInfo),
    };
    return component;
  }

  /** The page's own markup is not under test here — only that the scroll/focus finds it. */
  function renderHost(): { invalid: HTMLInputElement; valid: HTMLInputElement } {
    host = document.createElement('app-passenger-info');
    // Taken out of the document's flow: a stray block element in <body> for the length of one
    // spec changes the document height, and AnalyticsConsentBannerComponent's resize spec reads
    // exactly that. `position: fixed` still focuses and still reports a rect.
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    const valid = document.createElement('input');
    valid.id = 'booker-firstName';
    valid.setAttribute('formControlName', 'firstName');
    const invalid = document.createElement('input');
    invalid.id = 'booker-lastName';
    invalid.setAttribute('formControlName', 'lastName');
    invalid.classList.add('ng-invalid');
    // Angular marks the <form> and every group wrapper ng-invalid too, and they come first in
    // DOM order - the selector has to skip them or it focuses nothing (OBRS-1955).
    const formWrapper = document.createElement('form');
    formWrapper.classList.add('ng-invalid');
    host.append(formWrapper, valid, invalid);
    document.body.appendChild(host);
    return { invalid, valid };
  }

  function badRequest(errors: unknown[]): HttpErrorResponse {
    return new HttpErrorResponse({
      status: 400,
      error: {
        status: 400,
        message: 'ข้อมูลไม่ผ่านการตรวจสอบ',
        errorCode: 'VALIDATION_FAILED',
        errors,
      },
    });
  }

  afterEach(() => {
    host?.remove();
  });

  it('takes the customer to the first control the client itself refused', async () => {
    const { invalid } = renderHost();
    const component = componentWith(jasmine.createSpy('createBooking'));
    (component as any).passengerInfoFormComponent = {
      validateAndGetPassengerInfo: () => null,
    };

    await component.onSubmitPassengerInfo();

    expect(document.activeElement).toBe(invalid);
  });

  it('names the client-refused fields in the same list the server path fills', async () => {
    renderHost();
    const component = componentWith(jasmine.createSpy('createBooking'));
    (component as any).passengerInfoFormComponent = {
      validateAndGetPassengerInfo: () => null,
    };

    await component.onSubmitPassengerInfo();

    expect(component.serverFieldErrors.map((e) => e.controlId)).toEqual(['booker-lastName']);
    // No reason: the inline message under the field is the reason, and the customer is now
    // looking at it.
    expect(component.serverFieldErrors[0].reason).toBe('');
  });

  it('never calls the API when the client refused', async () => {
    renderHost();
    const createBooking = jasmine.createSpy('createBooking');
    const component = componentWith(createBooking);
    (component as any).bookerInfoFormComponent = { validateAndGetBooker: () => null };

    await component.onSubmitPassengerInfo();

    expect(createBooking).not.toHaveBeenCalled();
  });

  it('lists the fields a 400 named, and shows no generic modal on top of them', async () => {
    renderHost();
    const createBooking = jasmine
      .createSpy('createBooking')
      .and.returnValue(
        throwError(() =>
          badRequest([
            {
              field: 'contact.lastName',
              rejectedValue: 'T',
              reason: 'ต้องมีความยาวระหว่าง 2 ถึง 50 ตัวอักษร',
            },
          ])
        )
      );
    const component = componentWith(createBooking);

    await component.onSubmitPassengerInfo();

    expect(component.serverFieldErrors.length).toBe(1);
    expect(component.serverFieldErrors[0].reason).toBe(
      'ต้องมีความยาวระหว่าง 2 ถึง 50 ตัวอักษร'
    );
    expect(component.serverFieldErrors[0].controlId).toBe('booker-lastName');
    expect(alertError).not.toHaveBeenCalled();
  });

  it('focuses the first field the server named', async () => {
    const { invalid } = renderHost();
    const createBooking = jasmine
      .createSpy('createBooking')
      .and.returnValue(
        throwError(() =>
          badRequest([{ field: 'contact.lastName', rejectedValue: 'T', reason: 'too short' }])
        )
      );

    await componentWith(createBooking).onSubmitPassengerInfo();

    expect(document.activeElement).toBe(invalid);
  });

  it('keeps the modal when the 400 names no field — silence would be worse', async () => {
    renderHost();
    const createBooking = jasmine
      .createSpy('createBooking')
      .and.returnValue(throwError(() => badRequest([])));
    const component = componentWith(createBooking);

    await component.onSubmitPassengerInfo();

    expect(component.serverFieldErrors).toEqual([]);
    expect(alertError).toHaveBeenCalled();
  });

  it('still alerts on an error that is not a field-level rejection', async () => {
    renderHost();
    const createBooking = jasmine.createSpy('createBooking').and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 500,
            error: { message: 'Something broke', errorCode: 'REQUEST_FAILED' },
          })
      )
    );
    const component = componentWith(createBooking);

    await component.onSubmitPassengerInfo();

    expect(component.serverFieldErrors).toEqual([]);
    expect(alertError).toHaveBeenCalledWith('Something broke');
  });

  /**
   * OBRS-1955 review finding: `suppressGlobalErrorAlert` used to also set `SKIP_AUTH_LOGOUT`.
   * Suppressing the alert on EVERY booking would therefore have left an expired session with no
   * refresh, no logout and no notice, on the one call that holds the customer's seats. The two
   * are separate arguments now, and this pins which one this page asks for.
   */
  it('suppresses the alert on every booking but keeps the 401 recovery', async () => {
    renderHost();
    const createBooking = jasmine
      .createSpy('createBooking')
      .and.returnValue(throwError(() => badRequest([])));

    await componentWith(createBooking).onSubmitPassengerInfo();

    const [, suppressAlert, , skipAuthLogout] = createBooking.calls.mostRecent().args;
    expect(suppressAlert).withContext('the page renders its own failure').toBeTrue();
    expect(skipAuthLogout).withContext('a 401 must still be recovered or told').toBeFalse();
  });

  it('lets the promo-preview race keep the opt-out OBRS-109 gave it', async () => {
    renderHost();
    const createBooking = jasmine
      .createSpy('createBooking')
      .and.returnValue(throwError(() => badRequest([])));
    const component = componentWith(createBooking);
    component.onPromoApplied({ code: 'SAVE10' } as never);

    await component.onSubmitPassengerInfo();

    expect(createBooking.calls.mostRecent().args[3]).toBeTrue();
  });

  it('clears the previous refusal when the customer submits again', async () => {
    renderHost();
    const createBooking = jasmine
      .createSpy('createBooking')
      .and.returnValues(
        throwError(() =>
          badRequest([{ field: 'contact.lastName', rejectedValue: 'T', reason: 'too short' }])
        ),
        throwError(() => badRequest([]))
      );
    const component = componentWith(createBooking);

    await component.onSubmitPassengerInfo();
    expect(component.serverFieldErrors.length).toBe(1);

    await component.onSubmitPassengerInfo();
    expect(component.serverFieldErrors).toEqual([]);
  });
});
