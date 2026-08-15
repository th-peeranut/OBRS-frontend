import { PassengerInfoComponent } from './passenger-info.component';
import { PassengerInfo } from '../../shared/interfaces/passenger-info.interface';
import {
  createAnalyticsServiceStub,
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../testing/test-stubs';

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
});
