import { PendingRefund } from '../../../../shared/interfaces/payment.interface';
import { hasDestination, queueAgeDays, queueAgeSeverity } from './manual-refund-worklist-page.mappers';

function buildRow(overrides: Partial<PendingRefund> = {}): PendingRefund {
  return {
    paymentId: 1,
    bookingId: 1,
    amount: 500,
    paymentMethod: 'qr_promptpay',
    ...overrides,
  };
}

describe('manual-refund-worklist-page.mappers', () => {
  describe('queueAgeDays', () => {
    it('returns null when queuedAt is null/undefined (finding #3)', () => {
      expect(queueAgeDays(null)).toBeNull();
      expect(queueAgeDays(undefined)).toBeNull();
    });

    it('returns null on an unparseable date rather than throwing', () => {
      expect(queueAgeDays('not-a-date')).toBeNull();
    });

    it('computes whole days elapsed', () => {
      const now = new Date('2026-07-27T10:00:00Z');
      expect(queueAgeDays('2026-07-25T10:00:00Z', now)).toBe(2);
      expect(queueAgeDays('2026-07-27T09:00:00Z', now)).toBe(0);
    });
  });

  describe('queueAgeSeverity', () => {
    it('is neutral for unknown age', () => {
      expect(queueAgeSeverity(null)).toBe('is-neutral');
    });

    it('is neutral under 24h (day 0)', () => {
      expect(queueAgeSeverity(0)).toBe('is-neutral');
    });

    it('is warning from day 1 onwards while the row is still within its window', () => {
      expect(queueAgeSeverity(1)).toBe('is-warning');
      expect(queueAgeSeverity(7)).toBe('is-warning');
    });

    // OBRS-1136 AC-4. The pre-card rule was `days > 7` computed here, in CALENDAR days,
    // against a threshold the UI spec itself marked as unsigned-off. The signed-off rule is
    // 7 BUSINESS days, so these two cases are precisely the ones the old code got wrong:
    // a 30-day-old row inside its window (it cannot be, in practice — this pins that the
    // server, not the age, is what decides) and an 8-day-old row that is NOT yet late
    // because a weekend fell inside it.
    it('is NOT danger past 7 calendar days when the server says the row is not overdue', () => {
      expect(queueAgeSeverity(8, false)).toBe('is-warning');
      expect(queueAgeSeverity(9, false)).toBe('is-warning');
    });

    it('is danger exactly when the server says overdue, whatever the calendar age', () => {
      expect(queueAgeSeverity(8, true)).toBe('is-danger');
      expect(queueAgeSeverity(0, true)).toBe('is-danger');
      expect(queueAgeSeverity(null, true)).toBe('is-danger');
    });

    it('treats a missing overdue flag as not overdue rather than throwing', () => {
      expect(queueAgeSeverity(8, undefined)).toBe('is-warning');
    });
  });

  describe('hasDestination', () => {
    it('is false for a NULL destinationType (batch-originated row, SA rule 6)', () => {
      expect(hasDestination(buildRow({ destinationType: null }))).toBeFalse();
      expect(hasDestination(buildRow({}))).toBeFalse();
    });

    it('is true when a destinationType is present', () => {
      expect(hasDestination(buildRow({ destinationType: 'promptpay' }))).toBeTrue();
    });
  });
});
