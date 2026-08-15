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
});
