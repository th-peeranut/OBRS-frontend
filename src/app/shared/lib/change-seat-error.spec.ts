import { HttpErrorResponse } from '@angular/common/http';
import {
  extractChangeSeatErrorCode,
  isTerminalChangeSeatError,
  mapChangeSeatErrorCode,
} from './change-seat-error';

describe('mapChangeSeatErrorCode', () => {
  it('maps every documented CHANGE_SEAT_ERROR_* code to its i18n key (never the raw message string)', () => {
    const cases: Array<[string, string]> = [
      ['CHANGE_SEAT_ERROR_NOT_CONFIRMED', 'MY_BOOKINGS.CHANGE_SEAT.ERROR.NOT_CONFIRMED'],
      ['CHANGE_SEAT_ERROR_MAX_COUNT', 'MY_BOOKINGS.CHANGE_SEAT.ERROR.MAX_COUNT'],
      ['CHANGE_SEAT_ERROR_WINDOW_CLOSED', 'MY_BOOKINGS.CHANGE_SEAT.ERROR.WINDOW_CLOSED'],
      ['CHANGE_SEAT_ERROR_SEAT_UNAVAILABLE', 'MY_BOOKINGS.CHANGE_SEAT.ERROR.SEAT_UNAVAILABLE'],
      ['CHANGE_SEAT_ERROR_NO_SEATS', 'MY_BOOKINGS.CHANGE_SEAT.ERROR.NO_SEATS'],
      ['CHANGE_SEAT_ERROR_SEAT_NOT_IN_MAP', 'MY_BOOKINGS.CHANGE_SEAT.ERROR.SEAT_NOT_IN_MAP'],
      ['CHANGE_SEAT_ERROR_TICKET_MISMATCH', 'MY_BOOKINGS.CHANGE_SEAT.ERROR.TICKET_MISMATCH'],
      [
        'CHANGE_SEAT_ERROR_MULTI_LEG_NOT_SUPPORTED',
        'MY_BOOKINGS.CHANGE_SEAT.ERROR.MULTI_LEG_NOT_SUPPORTED',
      ],
      ['CHANGE_SEAT_ERROR_UNAUTHORIZED', 'MY_BOOKINGS.CHANGE_SEAT.ERROR.UNAUTHORIZED'],
      ['CHANGE_SEAT_ERROR_BOOKING_NOT_FOUND', 'MY_BOOKINGS.CHANGE_SEAT.ERROR.BOOKING_NOT_FOUND'],
      // OBRS-358: shared jump-seat channel-guard code -> the shared COMMON.ERROR.* key.
      ['SEAT_ERROR_WALK_IN_ONLY', 'COMMON.ERROR.SEAT_WALK_IN_ONLY'],
    ];

    for (const [code, key] of cases) {
      expect(mapChangeSeatErrorCode(code)).toBe(key);
    }
  });

  it('a recognized errorCode wins even when a fallbackTier is also supplied', () => {
    expect(mapChangeSeatErrorCode('CHANGE_SEAT_ERROR_NO_SEATS', 'SERVICE_UNAVAILABLE')).toBe(
      'MY_BOOKINGS.CHANGE_SEAT.ERROR.NO_SEATS'
    );
  });

  describe('OBRS-170: code-less fallback branches on fallbackTier', () => {
    it('defaults to ACTION_UNAVAILABLE when no fallbackTier is passed (back-compat with existing call sites)', () => {
      expect(mapChangeSeatErrorCode('SOME_UNMAPPED_CODE')).toBe(
        'MY_BOOKINGS.CHANGE_SEAT.ERROR.ACTION_UNAVAILABLE'
      );
      expect(mapChangeSeatErrorCode(undefined)).toBe('MY_BOOKINGS.CHANGE_SEAT.ERROR.ACTION_UNAVAILABLE');
      expect(mapChangeSeatErrorCode(null)).toBe('MY_BOOKINGS.CHANGE_SEAT.ERROR.ACTION_UNAVAILABLE');
    });

    it('returns SERVICE_UNAVAILABLE when explicitly told the failure was a backend outage', () => {
      expect(mapChangeSeatErrorCode(null, 'SERVICE_UNAVAILABLE')).toBe(
        'MY_BOOKINGS.CHANGE_SEAT.ERROR.SERVICE_UNAVAILABLE'
      );
    });

    it('returns ACTION_UNAVAILABLE when explicitly told the failure was a reachable-but-rejected request', () => {
      expect(mapChangeSeatErrorCode(undefined, 'ACTION_UNAVAILABLE')).toBe(
        'MY_BOOKINGS.CHANGE_SEAT.ERROR.ACTION_UNAVAILABLE'
      );
    });
  });
});

describe('isTerminalChangeSeatError', () => {
  it('is terminal for NOT_CONFIRMED/MAX_COUNT/WINDOW_CLOSED/MULTI_LEG/UNAUTHORIZED/BOOKING_NOT_FOUND', () => {
    expect(isTerminalChangeSeatError('CHANGE_SEAT_ERROR_NOT_CONFIRMED')).toBeTrue();
    expect(isTerminalChangeSeatError('CHANGE_SEAT_ERROR_MAX_COUNT')).toBeTrue();
    expect(isTerminalChangeSeatError('CHANGE_SEAT_ERROR_SEAT_UNAVAILABLE')).toBeFalse();
    expect(isTerminalChangeSeatError(undefined)).toBeFalse();
  });
});

describe('extractChangeSeatErrorCode', () => {
  it('reads error.error.errorCode off an HttpErrorResponse', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { errorCode: 'CHANGE_SEAT_ERROR_SEAT_UNAVAILABLE' },
    });

    expect(extractChangeSeatErrorCode(error)).toBe('CHANGE_SEAT_ERROR_SEAT_UNAVAILABLE');
  });

  it('falls back to GENERIC for a non-HTTP error or a missing errorCode', () => {
    expect(extractChangeSeatErrorCode(new Error('boom'))).toBe('GENERIC');
    expect(extractChangeSeatErrorCode(new HttpErrorResponse({ status: 500 }))).toBe('GENERIC');
  });
});
