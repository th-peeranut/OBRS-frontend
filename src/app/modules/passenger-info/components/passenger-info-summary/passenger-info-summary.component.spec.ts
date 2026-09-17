import { PassengerInfoSummaryComponent } from './passenger-info-summary.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';
import { PassengerInfo } from '../../../../shared/interfaces/passenger-info.interface';
import { Schedule } from '../../../../shared/interfaces/schedule.interface';

describe('PassengerInfoSummaryComponent', () => {
  let component: PassengerInfoSummaryComponent;

  beforeEach(() => {
    component = new PassengerInfoSummaryComponent(
      createStoreStub(),
      createRouterStub(),
      createStoreStub(),
      createTranslateStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // OBRS-1226: these read the passenger-info store (the rows that become the
  // tickets), NOT `scheduleFilter.passengerInfo`, which is frozen at whatever
  // was typed on the SEARCH page. RED before the fix: the old signature took
  // `{type, count}[]` and a 2-passenger form still totalled one seat's fare.
  describe('headcount and total come from the passenger rows (OBRS-1226)', () => {
    const oneWay200 = [{ pricePerSeat: '200' } as Schedule];
    const roundTrip = [
      { pricePerSeat: '200' } as Schedule,
      { pricePerSeat: '180' } as Schedule,
    ];

    function rows(...isAdultFlags: boolean[]): PassengerInfo[] {
      return isAdultFlags.map((isAdult) => ({ isAdult }) as PassengerInfo);
    }

    it('counts adults and children off each row’s isAdult flag', () => {
      expect(component.getAdultCount(rows(true, true, false))).toBe(2);
      expect(component.getKidCount(rows(true, true, false))).toBe(1);
    });

    it('the total follows the row count — 2 passengers on a 200 leg is 400', () => {
      expect(component.sumFare(oneWay200, rows(true))).toBe(200);
      expect(component.sumFare(oneWay200, rows(true, true))).toBe(400);
    });

    it('a round trip sums both legs per passenger', () => {
      expect(component.sumFare(roundTrip, rows(true, true))).toBe(760);
    });

    it('an empty or not-yet-seeded store reads as zero, never NaN', () => {
      expect(component.sumFare(oneWay200, null)).toBe(0);
      expect(component.sumFare(oneWay200, [])).toBe(0);
      expect(component.getAdultCount(null)).toBe(0);
      expect(component.getKidCount(undefined)).toBe(0);
    });
  });

  // OBRS-1943: the seatless chip used to be drawn on `!passengerSeat &&
  // !passengerSeatReturn` alone, so an OPEN journey — where seats are always
  // null — told every passenger "not chosen yet". RED before the fix: the OPEN
  // case below returned the NO_SEAT key.
  describe('seatless chip wording follows seatingMode (OBRS-1943)', () => {
    const OPEN_KEY = 'PASSENGER_INFO.SUMMARY.OPEN_SEATING_BADGE';
    const NO_SEAT_KEY = 'PASSENGER_INFO.SUMMARY.NO_SEAT';

    function legs(...modes: (string | undefined)[]): Schedule[] {
      return modes.map((seatingMode) => ({ seatingMode }) as Schedule);
    }

    const seatless = {} as PassengerInfo;

    it('OPEN leg + no seat → the open-seating wording, not "not chosen yet"', () => {
      expect(component.seatlessChipKey(seatless, legs('OPEN'))).toBe(OPEN_KEY);
    });

    it('ASSIGNED leg + no seat → still "not chosen yet" (must not regress)', () => {
      expect(component.seatlessChipKey(seatless, legs('ASSIGNED'))).toBe(
        NO_SEAT_KEY
      );
    });

    it('ASSIGNED leg + a seat picked → no chip at all', () => {
      const picked = { passengerSeat: 'A1' } as PassengerInfo;
      expect(component.seatlessChipKey(picked, legs('ASSIGNED'))).toBeNull();
      const pickedReturn = { passengerSeatReturn: 'B2' } as PassengerInfo;
      expect(component.seatlessChipKey(pickedReturn, legs('OPEN'))).toBeNull();
    });

    it('a missing/unknown seatingMode is treated as ASSIGNED, never OPEN', () => {
      expect(component.seatlessChipKey(seatless, legs(undefined))).toBe(
        NO_SEAT_KEY
      );
      expect(component.seatlessChipKey(seatless, null)).toBe(NO_SEAT_KEY);
      expect(component.seatlessChipKey(seatless, [])).toBe(NO_SEAT_KEY);
    });

    it('a mixed round trip keeps "not chosen yet" — the ASSIGNED leg still offers a seat', () => {
      expect(component.seatlessChipKey(seatless, legs('OPEN', 'ASSIGNED'))).toBe(
        NO_SEAT_KEY
      );
      expect(component.seatlessChipKey(seatless, legs('OPEN', 'OPEN'))).toBe(
        OPEN_KEY
      );
    });
  });
});
