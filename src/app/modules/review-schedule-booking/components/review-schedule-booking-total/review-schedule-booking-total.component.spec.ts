import { ReviewScheduleBookingTotalComponent } from './review-schedule-booking-total.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';
import { PassengerInfo } from '../../../../shared/interfaces/passenger-info.interface';
import { Schedule, ScheduleFilter } from '../../../../shared/interfaces/schedule.interface';

describe('ReviewScheduleBookingTotalComponent', () => {
  let component: ReviewScheduleBookingTotalComponent;

  beforeEach(() => {
    component = new ReviewScheduleBookingTotalComponent(
      createStoreStub(),
      createRouterStub(),
      createStoreStub(),
      createTranslateStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /**
   * OBRS-1384 AC-3. This page sits BEFORE /passenger-info in the stepper, so the two
   * directions through it have different correct answers and both are pinned here —
   * the card is explicit that copying OBRS-1226's /passenger-info fix ("read the
   * passenger rows, full stop") would print 0 คน on every normal forward visit.
   */
  describe('the headcount source depends on which way the customer walked in (OBRS-1384)', () => {
    const FILTER = {
      passengerInfo: [
        { type: 'ADULT', count: 1 },
        { type: 'KIDS', count: 0 },
      ],
    } as unknown as ScheduleFilter;

    // What /passenger-info left behind after an OPEN-seating + : two adults.
    const PASSENGERS: PassengerInfo[] = [
      { isAdult: true, firstName: 'A' } as PassengerInfo,
      { isAdult: true, firstName: 'B' } as PassengerInfo,
    ];

    const ONE_WAY_190 = [{ pricePerSeat: '190' }] as unknown as Schedule[];

    it('forward leg: no passenger rows yet, so the SEARCH filter is the source', () => {
      expect(component.getAdultCount(FILTER, null)).toBe(1);
      expect(component.getKidCount(FILTER, null)).toBe(0);
      expect(component.sumPassengers(FILTER, null)).toBe(1);
      expect(component.sumFare(ONE_WAY_190, FILTER, null)).toBe(190);
    });

    it('forward leg: an EMPTY passenger array is still the forward leg, not "0 คน"', () => {
      expect(component.getAdultCount(FILTER, [])).toBe(1);
      expect(component.sumFare(ONE_WAY_190, FILTER, [])).toBe(190);
    });

    it('back leg: passenger rows exist, so they win over the stale filter', () => {
      expect(component.getAdultCount(FILTER, PASSENGERS)).toBe(2);
      expect(component.getKidCount(FILTER, PASSENGERS)).toBe(0);
      expect(component.sumPassengers(FILTER, PASSENGERS)).toBe(2);
      expect(component.sumFare(ONE_WAY_190, FILTER, PASSENGERS)).toBe(380);
    });

    it('back leg: an adult/child split the search page never saw is read off the rows', () => {
      const mixed: PassengerInfo[] = [
        { isAdult: true } as PassengerInfo,
        { isAdult: false } as PassengerInfo,
      ];

      expect(component.getAdultCount(FILTER, mixed)).toBe(1);
      expect(component.getKidCount(FILTER, mixed)).toBe(1);
    });
  });
});
