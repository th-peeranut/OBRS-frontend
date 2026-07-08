import { RescheduleEstimateSummaryComponent } from './reschedule-estimate-summary.component';
import { RescheduleEstimate } from '../../../../../shared/interfaces/reschedule.interface';

function buildEstimate(overrides: Partial<RescheduleEstimate> = {}): RescheduleEstimate {
  return {
    oldFare: '200.00',
    newFare: '250.00',
    fareDiff: '50.00',
    rescheduleFee: '30.00',
    netAmount: '80.00',
    paymentDirection: 'TOP_UP',
    ...overrides,
  };
}

describe('RescheduleEstimateSummaryComponent', () => {
  let component: RescheduleEstimateSummaryComponent;

  beforeEach(() => {
    component = new RescheduleEstimateSummaryComponent();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('paymentDirectionLabelKey', () => {
    it('maps TOP_UP to the "you pay" key', () => {
      component.estimate = buildEstimate({ paymentDirection: 'TOP_UP' });
      expect(component.paymentDirectionLabelKey).toBe('MY_BOOKINGS.RESCHEDULE.ESTIMATE.TOP_UP');
    });

    it('maps REFUND to the "you will be refunded" key', () => {
      component.estimate = buildEstimate({ paymentDirection: 'REFUND', netAmount: '-40.00' });
      expect(component.paymentDirectionLabelKey).toBe('MY_BOOKINGS.RESCHEDULE.ESTIMATE.REFUND');
    });

    it('maps NO_PAYMENT to the "no additional charge" key', () => {
      component.estimate = buildEstimate({ paymentDirection: 'NO_PAYMENT', netAmount: '0' });
      expect(component.paymentDirectionLabelKey).toBe('MY_BOOKINGS.RESCHEDULE.ESTIMATE.NO_PAYMENT');
    });

    it('defaults to NO_PAYMENT when there is no estimate yet', () => {
      component.estimate = null;
      expect(component.paymentDirectionLabelKey).toBe('MY_BOOKINGS.RESCHEDULE.ESTIMATE.NO_PAYMENT');
    });
  });

  it('shows the absolute net amount regardless of payment direction sign', () => {
    component.estimate = buildEstimate({ netAmount: '-40.00' });
    expect(component.netAmountAbsLabel).toContain('40');
    expect(component.netAmountAbsLabel).not.toContain('-40');
  });

  describe('onConfirm', () => {
    it('emits confirm when an estimate is present and not loading/submitting', () => {
      component.estimate = buildEstimate();
      const confirmSpy = jasmine.createSpy('confirm');
      component.confirm.subscribe(confirmSpy);

      component.onConfirm();

      expect(confirmSpy).toHaveBeenCalled();
    });

    it('does not emit confirm while loading', () => {
      component.estimate = buildEstimate();
      component.loading = true;
      const confirmSpy = jasmine.createSpy('confirm');
      component.confirm.subscribe(confirmSpy);

      component.onConfirm();

      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('does not emit confirm while submitting', () => {
      component.estimate = buildEstimate();
      component.submitting = true;
      const confirmSpy = jasmine.createSpy('confirm');
      component.confirm.subscribe(confirmSpy);

      component.onConfirm();

      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('does not emit confirm when there is no estimate', () => {
      component.estimate = null;
      const confirmSpy = jasmine.createSpy('confirm');
      component.confirm.subscribe(confirmSpy);

      component.onConfirm();

      expect(confirmSpy).not.toHaveBeenCalled();
    });
  });

  it('emits back', () => {
    const backSpy = jasmine.createSpy('back');
    component.back.subscribe(backSpy);

    component.onBack();

    expect(backSpy).toHaveBeenCalled();
  });
});
