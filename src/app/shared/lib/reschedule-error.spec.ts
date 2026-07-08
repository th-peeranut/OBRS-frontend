import { HttpErrorResponse } from '@angular/common/http';
import {
  extractRescheduleErrorCode,
  isTerminalRescheduleError,
  mapRescheduleErrorCode,
  shouldReturnToOptions,
} from './reschedule-error';

describe('mapRescheduleErrorCode', () => {
  it('maps every documented RESCHEDULE_ERROR_* code to its i18n key (never the raw message string)', () => {
    const cases: Array<[string, string]> = [
      ['RESCHEDULE_ERROR_NOT_CONFIRMED', 'MY_BOOKINGS.RESCHEDULE.ERROR.NOT_CONFIRMED'],
      ['RESCHEDULE_ERROR_MAX_COUNT', 'MY_BOOKINGS.RESCHEDULE.ERROR.MAX_COUNT'],
      [
        'RESCHEDULE_ERROR_MULTI_LEG_NOT_SUPPORTED',
        'MY_BOOKINGS.RESCHEDULE.ERROR.MULTI_LEG_NOT_SUPPORTED',
      ],
      ['RESCHEDULE_ERROR_SAME_SCHEDULE', 'MY_BOOKINGS.RESCHEDULE.ERROR.SAME_SCHEDULE'],
      ['RESCHEDULE_ERROR_BOOKING_NOT_FOUND', 'MY_BOOKINGS.RESCHEDULE.ERROR.BOOKING_NOT_FOUND'],
      ['RESCHEDULE_ERROR_WINDOW_CLOSED', 'MY_BOOKINGS.RESCHEDULE.ERROR.WINDOW_CLOSED'],
      ['RESCHEDULE_ERROR_DATE_TOO_FAR', 'MY_BOOKINGS.RESCHEDULE.ERROR.DATE_TOO_FAR'],
      ['RESCHEDULE_ERROR_ROUTE_MISMATCH', 'MY_BOOKINGS.RESCHEDULE.ERROR.ROUTE_MISMATCH'],
      ['RESCHEDULE_ERROR_NO_SEATS', 'MY_BOOKINGS.RESCHEDULE.ERROR.NO_SEATS'],
      ['RESCHEDULE_ERROR_NET_AMOUNT_CHANGED', 'MY_BOOKINGS.RESCHEDULE.ERROR.NET_AMOUNT_CHANGED'],
      ['RESCHEDULE_ERROR_UNAUTHORIZED', 'MY_BOOKINGS.RESCHEDULE.ERROR.UNAUTHORIZED'],
      ['RESCHEDULE_PRICE_CHANGED', 'MY_BOOKINGS.RESCHEDULE.PRICE_CHANGED'],
    ];

    for (const [code, key] of cases) {
      expect(mapRescheduleErrorCode(code)).toBe(key);
    }
  });

  it('falls back to the GENERIC key for an unknown or missing code', () => {
    expect(mapRescheduleErrorCode('SOME_UNMAPPED_CODE')).toBe('MY_BOOKINGS.RESCHEDULE.ERROR.GENERIC');
    expect(mapRescheduleErrorCode(undefined)).toBe('MY_BOOKINGS.RESCHEDULE.ERROR.GENERIC');
    expect(mapRescheduleErrorCode(null)).toBe('MY_BOOKINGS.RESCHEDULE.ERROR.GENERIC');
  });
});

describe('isTerminalRescheduleError', () => {
  it('is terminal only for NOT_CONFIRMED and MAX_COUNT', () => {
    expect(isTerminalRescheduleError('RESCHEDULE_ERROR_NOT_CONFIRMED')).toBeTrue();
    expect(isTerminalRescheduleError('RESCHEDULE_ERROR_MAX_COUNT')).toBeTrue();
    expect(isTerminalRescheduleError('RESCHEDULE_ERROR_NO_SEATS')).toBeFalse();
    expect(isTerminalRescheduleError(undefined)).toBeFalse();
  });
});

describe('shouldReturnToOptions', () => {
  it('is true only for NO_SEATS', () => {
    expect(shouldReturnToOptions('RESCHEDULE_ERROR_NO_SEATS')).toBeTrue();
    expect(shouldReturnToOptions('RESCHEDULE_ERROR_MAX_COUNT')).toBeFalse();
  });
});

describe('extractRescheduleErrorCode', () => {
  it('reads error.error.errorCode off an HttpErrorResponse', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: { errorCode: 'RESCHEDULE_ERROR_NO_SEATS', message: 'ไม่มีที่นั่งว่าง' },
    });

    expect(extractRescheduleErrorCode(error)).toBe('RESCHEDULE_ERROR_NO_SEATS');
  });

  it('falls back to GENERIC for a non-HTTP error or a missing errorCode', () => {
    expect(extractRescheduleErrorCode(new Error('boom'))).toBe('GENERIC');
    expect(
      extractRescheduleErrorCode(new HttpErrorResponse({ status: 500, error: { message: 'oops' } }))
    ).toBe('GENERIC');
  });
});
