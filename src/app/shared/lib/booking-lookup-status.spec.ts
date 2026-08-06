import {
  bookingLookupStatusKey,
  bookingLookupStatusTone,
  bookingLookupStopLabel,
} from './booking-lookup-status';
import thBundle from '../../../../public/i18n/th.json';

describe('booking-lookup-status', () => {
  describe('bookingLookupStatusKey', () => {
    it('maps each shipped status to its own key', () => {
      expect(bookingLookupStatusKey('confirmed')).toBe('MY_BOOKINGS.STATUS.confirmed');
      expect(bookingLookupStatusKey('cancelled')).toBe('MY_BOOKINGS.STATUS.cancelled');
      expect(bookingLookupStatusKey('refunded')).toBe('MY_BOOKINGS.STATUS.refunded');
    });

    it('normalizes case and surrounding space', () => {
      expect(bookingLookupStatusKey('  CONFIRMED ')).toBe('MY_BOOKINGS.STATUS.confirmed');
    });

    it('falls back to a generic key — never to the raw slug', () => {
      // The failure this prevents: a status the bundle has never heard of rendering as
      // `MY_BOOKINGS.STATUS.awaiting_settlement` on the passenger's screen. The i18n parity gate
      // cannot catch it, because a key missing from ALL THREE locales is still at parity.
      expect(bookingLookupStatusKey('awaiting_settlement')).toBe('FIND_BOOKING.STATUS_UNKNOWN');
      expect(bookingLookupStatusKey(null)).toBe('FIND_BOOKING.STATUS_UNKNOWN');
      expect(bookingLookupStatusKey('')).toBe('FIND_BOOKING.STATUS_UNKNOWN');
    });

    it('does not resolve Object.prototype members (ADR-0028)', () => {
      // `'constructor' in MAP` is true, and the unguarded lookup would hand the template the
      // Object function. OBRS-427 shipped exactly this shape as the FIX for a raw-key defect.
      expect(bookingLookupStatusKey('constructor')).toBe('FIND_BOOKING.STATUS_UNKNOWN');
      expect(bookingLookupStatusKey('__proto__')).toBe('FIND_BOOKING.STATUS_UNKNOWN');
      expect(bookingLookupStatusTone('constructor')).toBe('is-danger');
    });

    it('every key it can emit actually exists in the shipped bundle', () => {
      // Reads the REAL th.json rather than a fixture: a helper that returns a key no locale
      // carries is the same user-visible defect as concatenating one, and only the real bundle
      // can falsify it.
      const bundle = thBundle as unknown as Record<string, Record<string, unknown>>;
      const emitted = [
        'confirmed',
        'pending',
        'cancelled',
        'expired',
        'refunded',
        'no-such-status',
      ].map((s) => bookingLookupStatusKey(s));

      for (const key of emitted) {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
        expect(typeof value).withContext(`missing i18n key: ${key}`).toBe('string');
      }
    });
  });

  describe('bookingLookupStatusTone', () => {
    it('mirrors the my-bookings chip tones', () => {
      expect(bookingLookupStatusTone('confirmed')).toBe('is-success');
      expect(bookingLookupStatusTone('pending')).toBe('is-warning');
      expect(bookingLookupStatusTone('refunded')).toBe('is-info');
      expect(bookingLookupStatusTone('cancelled')).toBe('is-danger');
    });
  });

  describe('bookingLookupStopLabel', () => {
    it('prefers the localized label', () => {
      expect(bookingLookupStopLabel({ code: 'nong_chak', label: 'หนองจาก' })).toBe('หนองจาก');
    });

    it('falls back to the code when the stop has no label for this locale', () => {
      // A stop renamed since the booking resolves to label: null on the backend. Rendering the
      // slug is poor; rendering an empty cell on a boarding screen is worse.
      expect(bookingLookupStopLabel({ code: 'stop_renamed_away', label: null })).toBe(
        'stop_renamed_away'
      );
      expect(bookingLookupStopLabel({ code: 'nong_chak', label: '   ' })).toBe('nong_chak');
    });

    it('renders a dash rather than "undefined" for a missing stop', () => {
      expect(bookingLookupStopLabel(null)).toBe('-');
      expect(bookingLookupStopLabel({ code: '', label: '' })).toBe('-');
    });
  });
});
