import { HttpErrorResponse } from '@angular/common/http';
import { extractChildFareFlagErrorCode, mapChildFareFlagErrorCode } from './child-fare-flag-error';

describe('mapChildFareFlagErrorCode', () => {
  it('maps every documented flag/unflag errorCode to its i18n key (never the raw message string)', () => {
    const cases: Array<[string, string]> = [
      ['ALREADY_FLAGGED', 'STAFF.BOARDING.CHILD_FARE_ERROR.ALREADY_FLAGGED'],
      ['NOT_FLAGGED', 'STAFF.BOARDING.CHILD_FARE_ERROR.NOT_FLAGGED'],
    ];

    for (const [code, key] of cases) {
      expect(mapChildFareFlagErrorCode(code)).toBe(key);
    }
  });

  it('falls back to the GENERIC key for an unknown or missing code', () => {
    expect(mapChildFareFlagErrorCode('SOME_UNMAPPED_CODE')).toBe('STAFF.BOARDING.CHILD_FARE_ERROR.GENERIC');
    expect(mapChildFareFlagErrorCode(undefined)).toBe('STAFF.BOARDING.CHILD_FARE_ERROR.GENERIC');
    expect(mapChildFareFlagErrorCode(null)).toBe('STAFF.BOARDING.CHILD_FARE_ERROR.GENERIC');
  });

  it('has its own code set, distinct from the board/unboard action error codes', () => {
    expect(mapChildFareFlagErrorCode('ALREADY_BOARDED')).toBe('STAFF.BOARDING.CHILD_FARE_ERROR.GENERIC');
    expect(mapChildFareFlagErrorCode('NOT_BOARDED')).toBe('STAFF.BOARDING.CHILD_FARE_ERROR.GENERIC');
  });
});

describe('extractChildFareFlagErrorCode', () => {
  it('reads error.error.errorCode off an HttpErrorResponse', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { errorCode: 'ALREADY_FLAGGED', message: 'ตั๋วนี้ถูกแจ้งไปแล้ว' },
    });

    expect(extractChildFareFlagErrorCode(error)).toBe('ALREADY_FLAGGED');
  });

  it('falls back to GENERIC for a non-HTTP error or a missing errorCode', () => {
    expect(extractChildFareFlagErrorCode(new Error('boom'))).toBe('GENERIC');
    expect(
      extractChildFareFlagErrorCode(new HttpErrorResponse({ status: 500, error: { message: 'oops' } }))
    ).toBe('GENERIC');
  });
});
