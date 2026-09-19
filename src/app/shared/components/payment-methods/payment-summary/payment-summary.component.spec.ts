import { PaymentSummaryComponent } from './payment-summary.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';
import { PassengerInfo } from '../../../../shared/interfaces/passenger-info.interface';

describe('PaymentSummaryComponent', () => {
  let component: PaymentSummaryComponent;

  beforeEach(() => {
    component = new PaymentSummaryComponent(
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
   * OBRS-1384 AC-2/AC-4. These rows used to read `scheduleFilter.passengerInfo` — the
   * headcount typed on the SEARCH page — which is what put "ผู้ใหญ่ 1 คน" directly
   * above a server total of 380 once the customer stepped an OPEN-seating booking
   * from one seat to two. They now count the passenger rows that become the tickets,
   * the same source OBRS-1226 moved /passenger-info's summary to.
   */
  describe('passenger rows, not the search headcount (OBRS-1384)', () => {
    // What /passenger-info dispatched right before it created the booking, after an
    // OPEN-seating +: two adults, where the search page was left saying one.
    const TWO_ADULTS: PassengerInfo[] = [
      { isAdult: true, firstName: 'A' } as PassengerInfo,
      { isAdult: true, firstName: 'B' } as PassengerInfo,
    ];

    it('counts the adults and children on the booking', () => {
      const mixed: PassengerInfo[] = [
        { isAdult: true } as PassengerInfo,
        { isAdult: false } as PassengerInfo,
        { isAdult: false } as PassengerInfo,
      ];

      expect(component.getAdultCount(mixed)).toBe(1);
      expect(component.getKidCount(mixed)).toBe(2);
    });

    it('follows the OPEN-seating + through to the passenger row', () => {
      expect(component.getAdultCount(TWO_ADULTS)).toBe(2);
    });

    it('says nothing rather than guessing when there are no passenger rows', () => {
      expect(component.getAdultCount(null)).toBe(0);
      expect(component.getKidCount(undefined)).toBe(0);
    });
  });

  /**
   * OBRS-1986. `sumFare`/`sumPassengers` were deleted with the template branch that
   * called them - the fare-times-headcount total is the defect itself, so it is not left
   * lying around as a "safety net" for the next template to reach for.
   */
  describe('the total is the server figure or nothing (OBRS-1986)', () => {
    it('treats a missing server netAmount as no total at all', () => {
      expect(component.hasServerTotal(null)).toBeFalse();
    });

    it('accepts a server netAmount of zero as a real, stated total', () => {
      expect(component.hasServerTotal(0)).toBeTrue();
    });
  });
});
