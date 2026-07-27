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

    it('is warning between 1 and 7 days', () => {
      expect(queueAgeSeverity(1)).toBe('is-warning');
      expect(queueAgeSeverity(7)).toBe('is-warning');
    });

    it('is danger past 7 days', () => {
      expect(queueAgeSeverity(8)).toBe('is-danger');
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
