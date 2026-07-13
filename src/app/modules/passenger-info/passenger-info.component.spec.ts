import { PassengerInfoComponent } from './passenger-info.component';
import { PassengerInfo } from '../../shared/interfaces/passenger-info.interface';
import {
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
      {} as never
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
  });
});
