import { HttpErrorResponse } from '@angular/common/http';
import {
  extractChangeStopErrorCode,
  isTerminalChangeStopError,
  mapChangeStopErrorCode,
  mapChangeStopStopsLoadError,
} from './change-stop-error';

describe('mapChangeStopErrorCode', () => {
  it('maps every documented CHANGE_STOP_ERROR_* code to its i18n key (never the raw message string)', () => {
    const cases: Array<[string, string]> = [
      ['CHANGE_STOP_ERROR_NOT_CONFIRMED', 'MY_BOOKINGS.CHANGE_STOP.ERROR.NOT_CONFIRMED'],
      ['CHANGE_STOP_ERROR_MAX_COUNT', 'MY_BOOKINGS.CHANGE_STOP.ERROR.MAX_COUNT'],
      ['CHANGE_STOP_ERROR_WINDOW_CLOSED', 'MY_BOOKINGS.CHANGE_STOP.ERROR.WINDOW_CLOSED'],
      ['CHANGE_STOP_ERROR_INVALID_SEGMENT', 'MY_BOOKINGS.CHANGE_STOP.ERROR.INVALID_SEGMENT'],
      ['CHANGE_STOP_ERROR_ROUTE_MISMATCH', 'MY_BOOKINGS.CHANGE_STOP.ERROR.ROUTE_MISMATCH'],
      ['CHANGE_STOP_ERROR_SAME_SEGMENT', 'MY_BOOKINGS.CHANGE_STOP.ERROR.SAME_SEGMENT'],
      ['CHANGE_STOP_ERROR_NO_SEATS', 'MY_BOOKINGS.CHANGE_STOP.ERROR.NO_SEATS'],
      ['CHANGE_STOP_ERROR_NET_AMOUNT_CHANGED', 'MY_BOOKINGS.CHANGE_STOP.ERROR.NET_AMOUNT_CHANGED'],
      ['CHANGE_STOP_ERROR_UNAUTHORIZED', 'MY_BOOKINGS.CHANGE_STOP.ERROR.UNAUTHORIZED'],
      ['CHANGE_STOP_ERROR_BOOKING_NOT_FOUND', 'MY_BOOKINGS.CHANGE_STOP.ERROR.BOOKING_NOT_FOUND'],
      [
        'CHANGE_STOP_ERROR_MULTI_LEG_NOT_SUPPORTED',
        'MY_BOOKINGS.CHANGE_STOP.ERROR.MULTI_LEG_NOT_SUPPORTED',
      ],
    ];

    for (const [code, key] of cases) {
      expect(mapChangeStopErrorCode(code)).toBe(key);
    }
  });

  it('a recognized errorCode wins even when a fallbackTier is also supplied', () => {
    expect(mapChangeStopErrorCode('CHANGE_STOP_ERROR_NO_SEATS', 'SERVICE_UNAVAILABLE')).toBe(
      'MY_BOOKINGS.CHANGE_STOP.ERROR.NO_SEATS'
    );
  });

  describe('OBRS-170: code-less fallback branches on fallbackTier', () => {
    it('defaults to ACTION_UNAVAILABLE when no fallbackTier is passed (back-compat with existing call sites)', () => {
      expect(mapChangeStopErrorCode('SOME_UNMAPPED_CODE')).toBe(
        'MY_BOOKINGS.CHANGE_STOP.ERROR.ACTION_UNAVAILABLE'
      );
      expect(mapChangeStopErrorCode(undefined)).toBe('MY_BOOKINGS.CHANGE_STOP.ERROR.ACTION_UNAVAILABLE');
    });

    it('returns SERVICE_UNAVAILABLE when explicitly told the failure was a backend outage', () => {
      expect(mapChangeStopErrorCode(null, 'SERVICE_UNAVAILABLE')).toBe(
        'MY_BOOKINGS.CHANGE_STOP.ERROR.SERVICE_UNAVAILABLE'
      );
    });
  });
});

describe('mapChangeStopStopsLoadError (OBRS-170)', () => {
  it('returns the SERVICE_UNAVAILABLE key for a 5xx/network failure', () => {
    expect(mapChangeStopStopsLoadError(new HttpErrorResponse({ status: 0 }))).toBe(
      'MY_BOOKINGS.CHANGE_STOP.ERROR.SERVICE_UNAVAILABLE'
    );
    expect(mapChangeStopStopsLoadError(new HttpErrorResponse({ status: 502 }))).toBe(
      'MY_BOOKINGS.CHANGE_STOP.ERROR.SERVICE_UNAVAILABLE'
    );
  });

  it('returns the ACTION_UNAVAILABLE key for any other 4xx failure', () => {
    expect(mapChangeStopStopsLoadError(new HttpErrorResponse({ status: 403 }))).toBe(
      'MY_BOOKINGS.CHANGE_STOP.ERROR.ACTION_UNAVAILABLE'
    );
  });
});

describe('isTerminalChangeStopError', () => {
  it('is terminal only for NOT_CONFIRMED and MAX_COUNT', () => {
    expect(isTerminalChangeStopError('CHANGE_STOP_ERROR_NOT_CONFIRMED')).toBeTrue();
    expect(isTerminalChangeStopError('CHANGE_STOP_ERROR_MAX_COUNT')).toBeTrue();
    expect(isTerminalChangeStopError('CHANGE_STOP_ERROR_NO_SEATS')).toBeFalse();
    expect(isTerminalChangeStopError(undefined)).toBeFalse();
  });
});

describe('extractChangeStopErrorCode', () => {
  it('reads error.error.errorCode off an HttpErrorResponse', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { errorCode: 'CHANGE_STOP_ERROR_NO_SEATS' },
    });

    expect(extractChangeStopErrorCode(error)).toBe('CHANGE_STOP_ERROR_NO_SEATS');
  });

  it('falls back to GENERIC for a non-HTTP error or a missing errorCode', () => {
    expect(extractChangeStopErrorCode(new Error('boom'))).toBe('GENERIC');
    expect(extractChangeStopErrorCode(new HttpErrorResponse({ status: 500 }))).toBe('GENERIC');
  });
});
