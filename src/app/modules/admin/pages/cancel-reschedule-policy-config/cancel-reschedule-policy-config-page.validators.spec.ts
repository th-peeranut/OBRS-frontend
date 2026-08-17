import { FormBuilder, FormGroup } from '@angular/forms';
import {
  earlyRateNotBelowLateRate,
  earlyWindowAboveCancelWindow,
  earlyWindowAboveRescheduleWindow,
} from './cancel-reschedule-policy-config-page.validators';

function group(values: Record<string, unknown>): FormGroup {
  return new FormBuilder().group({
    cancelWindowHours: [values['cancelWindowHours'] ?? null],
    rescheduleWindowHours: [values['rescheduleWindowHours'] ?? null],
    earlyWindowHours: [values['earlyWindowHours'] ?? null],
    cancelRefundRateEarlyPct: [values['cancelRefundRateEarlyPct'] ?? null],
    cancelRefundRateLatePct: [values['cancelRefundRateLatePct'] ?? null],
  });
}

// One `it()` per reason: each validator can fail for its own rule and must stay
// silent while an operand is missing, and those are different behaviours.
describe('cancel/reschedule policy cross-field validators (OBRS-699)', () => {
  describe('earlyWindowAboveCancelWindow (BR-4)', () => {
    const validate = earlyWindowAboveCancelWindow();

    it('passes when the boundary is strictly above the cancellation window', () => {
      expect(validate(group({ earlyWindowHours: 24, cancelWindowHours: 2 }))).toBeNull();
    });

    it('fails when the boundary EQUALS the window — the late rate could never apply', () => {
      expect(validate(group({ earlyWindowHours: 2, cancelWindowHours: 2 }))).toEqual({
        earlyNotAboveCancel: true,
      });
    });

    it('fails when the boundary is below the window', () => {
      expect(validate(group({ earlyWindowHours: 1, cancelWindowHours: 2 }))).toEqual({
        earlyNotAboveCancel: true,
      });
    });

    it('stays silent while either operand is blank, so the FIELD error shows alone', () => {
      expect(validate(group({ earlyWindowHours: null, cancelWindowHours: 2 }))).toBeNull();
      expect(validate(group({ earlyWindowHours: 24, cancelWindowHours: '' }))).toBeNull();
    });

    it('treats 0 as a real value, not as blank', () => {
      expect(validate(group({ earlyWindowHours: 1, cancelWindowHours: 0 }))).toBeNull();
      expect(validate(group({ earlyWindowHours: 0, cancelWindowHours: 0 }))).toEqual({
        earlyNotAboveCancel: true,
      });
    });
  });

  describe('earlyWindowAboveRescheduleWindow (BR-4)', () => {
    const validate = earlyWindowAboveRescheduleWindow();

    it('passes when the boundary is strictly above the reschedule window', () => {
      expect(validate(group({ earlyWindowHours: 24, rescheduleWindowHours: 2 }))).toBeNull();
    });

    it('fails when the boundary is not above it — the late fee could never be charged', () => {
      expect(validate(group({ earlyWindowHours: 2, rescheduleWindowHours: 2 }))).toEqual({
        earlyNotAboveReschedule: true,
      });
    });

    it('stays silent while either operand is blank', () => {
      expect(validate(group({ earlyWindowHours: 24, rescheduleWindowHours: null }))).toBeNull();
    });
  });

  describe('earlyRateNotBelowLateRate (BR-5 / D-2)', () => {
    const validate = earlyRateNotBelowLateRate();

    it('passes when early is above late', () => {
      expect(
        validate(group({ cancelRefundRateEarlyPct: 80, cancelRefundRateLatePct: 50 }))
      ).toBeNull();
    });

    it('passes when the two are EQUAL — the rule is >=, not >', () => {
      expect(
        validate(group({ cancelRefundRateEarlyPct: 50, cancelRefundRateLatePct: 50 }))
      ).toBeNull();
    });

    it('fails when cancelling sooner would refund less', () => {
      expect(
        validate(group({ cancelRefundRateEarlyPct: 40, cancelRefundRateLatePct: 50 }))
      ).toEqual({ earlyRateBelowLate: true });
    });

    it('stays silent while either operand is blank', () => {
      expect(
        validate(group({ cancelRefundRateEarlyPct: null, cancelRefundRateLatePct: 50 }))
      ).toBeNull();
    });
  });
});
