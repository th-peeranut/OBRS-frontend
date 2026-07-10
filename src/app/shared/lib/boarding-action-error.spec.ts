import { HttpErrorResponse } from '@angular/common/http';
import { extractBoardingActionErrorCode, mapBoardingActionErrorCode } from './boarding-action-error';

describe('mapBoardingActionErrorCode', () => {
  it('maps every documented board/unboard errorCode to its i18n key (never the raw message string)', () => {
    const cases: Array<[string, string]> = [
      ['ALREADY_BOARDED', 'STAFF.BOARDING.ACTION_ERROR.ALREADY_BOARDED'],
      ['NOT_BOARDED', 'STAFF.BOARDING.ACTION_ERROR.NOT_BOARDED'],
      ['TICKET_NOT_CONFIRMED', 'STAFF.BOARDING.ACTION_ERROR.TICKET_NOT_CONFIRMED'],
      ['BOARDING_WINDOW_NOT_OPEN', 'STAFF.BOARDING.ACTION_ERROR.BOARDING_WINDOW_NOT_OPEN'],
      ['TICKET_ERROR_ID_NOT_FOUND', 'STAFF.BOARDING.ACTION_ERROR.TICKET_ERROR_ID_NOT_FOUND'],
    ];

    for (const [code, key] of cases) {
      expect(mapBoardingActionErrorCode(code)).toBe(key);
    }
  });

  it('falls back to the GENERIC key for an unknown or missing code', () => {
    expect(mapBoardingActionErrorCode('SOME_UNMAPPED_CODE')).toBe('STAFF.BOARDING.ACTION_ERROR.GENERIC');
    expect(mapBoardingActionErrorCode(undefined)).toBe('STAFF.BOARDING.ACTION_ERROR.GENERIC');
    expect(mapBoardingActionErrorCode(null)).toBe('STAFF.BOARDING.ACTION_ERROR.GENERIC');
  });

  it('keeps the ERROR_ segment of TICKET_ERROR_ID_NOT_FOUND exactly (not tidied to TICKET_NOT_FOUND)', () => {
    expect(mapBoardingActionErrorCode('TICKET_ERROR_ID_NOT_FOUND')).toBe(
      'STAFF.BOARDING.ACTION_ERROR.TICKET_ERROR_ID_NOT_FOUND'
    );
    expect(mapBoardingActionErrorCode('TICKET_NOT_FOUND')).toBe('STAFF.BOARDING.ACTION_ERROR.GENERIC');
  });

  it('has its own code set, distinct from the boarding-scan error codes (no token-shaped codes)', () => {
    expect(mapBoardingActionErrorCode('INVALID_TICKET_TOKEN')).toBe('STAFF.BOARDING.ACTION_ERROR.GENERIC');
    expect(mapBoardingActionErrorCode('EXPIRED_TICKET_TOKEN')).toBe('STAFF.BOARDING.ACTION_ERROR.GENERIC');
    expect(mapBoardingActionErrorCode('WRONG_SCHEDULE_TICKET')).toBe('STAFF.BOARDING.ACTION_ERROR.GENERIC');
  });
});

describe('extractBoardingActionErrorCode', () => {
  it('reads error.error.errorCode off an HttpErrorResponse', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { errorCode: 'ALREADY_BOARDED', message: 'ตั๋วนี้ขึ้นรถไปแล้ว' },
    });

    expect(extractBoardingActionErrorCode(error)).toBe('ALREADY_BOARDED');
  });

  it('falls back to GENERIC for a non-HTTP error or a missing errorCode', () => {
    expect(extractBoardingActionErrorCode(new Error('boom'))).toBe('GENERIC');
    expect(
      extractBoardingActionErrorCode(new HttpErrorResponse({ status: 500, error: { message: 'oops' } }))
    ).toBe('GENERIC');
  });
});
