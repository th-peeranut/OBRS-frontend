import { HttpErrorResponse } from '@angular/common/http';
import {
  boardingScanErrorIcon,
  boardingScanErrorSeverity,
  extractBoardingScanErrorCode,
  mapBoardingScanErrorCode,
} from './boarding-scan-error';

describe('mapBoardingScanErrorCode', () => {
  it('maps every documented boarding-scan errorCode to its i18n key (never the raw message string)', () => {
    const cases: Array<[string, string]> = [
      ['INVALID_TICKET_TOKEN', 'STAFF.BOARDING.SCAN.ERROR.INVALID_TICKET_TOKEN'],
      ['EXPIRED_TICKET_TOKEN', 'STAFF.BOARDING.SCAN.ERROR.EXPIRED_TICKET_TOKEN'],
      ['WRONG_SCHEDULE_TICKET', 'STAFF.BOARDING.SCAN.ERROR.WRONG_SCHEDULE_TICKET'],
      ['BOARDING_WINDOW_NOT_OPEN', 'STAFF.BOARDING.SCAN.ERROR.BOARDING_WINDOW_NOT_OPEN'],
      ['TICKET_NOT_CONFIRMED', 'STAFF.BOARDING.SCAN.ERROR.TICKET_NOT_CONFIRMED'],
      ['ALREADY_BOARDED', 'STAFF.BOARDING.SCAN.ERROR.ALREADY_BOARDED'],
      ['TICKET_ERROR_ID_NOT_FOUND', 'STAFF.BOARDING.SCAN.ERROR.TICKET_ERROR_ID_NOT_FOUND'],
    ];

    for (const [code, key] of cases) {
      expect(mapBoardingScanErrorCode(code)).toBe(key);
    }
  });

  it('falls back to the GENERIC key for an unknown or missing code', () => {
    expect(mapBoardingScanErrorCode('SOME_UNMAPPED_CODE')).toBe('STAFF.BOARDING.SCAN.ERROR.GENERIC');
    expect(mapBoardingScanErrorCode(undefined)).toBe('STAFF.BOARDING.SCAN.ERROR.GENERIC');
    expect(mapBoardingScanErrorCode(null)).toBe('STAFF.BOARDING.SCAN.ERROR.GENERIC');
  });

  it('keeps the ERROR_ segment of TICKET_ERROR_ID_NOT_FOUND exactly (not tidied to TICKET_NOT_FOUND)', () => {
    expect(mapBoardingScanErrorCode('TICKET_ERROR_ID_NOT_FOUND')).toBe(
      'STAFF.BOARDING.SCAN.ERROR.TICKET_ERROR_ID_NOT_FOUND'
    );
    expect(mapBoardingScanErrorCode('TICKET_NOT_FOUND')).toBe('STAFF.BOARDING.SCAN.ERROR.GENERIC');
  });
});

describe('boardingScanErrorSeverity', () => {
  it('is warning for a timing/already-settled state', () => {
    expect(boardingScanErrorSeverity('EXPIRED_TICKET_TOKEN')).toBe('warning');
    expect(boardingScanErrorSeverity('WRONG_SCHEDULE_TICKET')).toBe('warning');
    expect(boardingScanErrorSeverity('BOARDING_WINDOW_NOT_OPEN')).toBe('warning');
    expect(boardingScanErrorSeverity('ALREADY_BOARDED')).toBe('warning');
  });

  it('is danger for an invalid/forged token, a non-boardable ticket, an unknown id, or GENERIC', () => {
    expect(boardingScanErrorSeverity('INVALID_TICKET_TOKEN')).toBe('danger');
    expect(boardingScanErrorSeverity('TICKET_NOT_CONFIRMED')).toBe('danger');
    expect(boardingScanErrorSeverity('TICKET_ERROR_ID_NOT_FOUND')).toBe('danger');
    expect(boardingScanErrorSeverity('GENERIC')).toBe('danger');
    expect(boardingScanErrorSeverity(undefined)).toBe('danger');
  });
});

describe('boardingScanErrorIcon', () => {
  it('gives every errorCode a distinct icon so severity is never color-only', () => {
    const icons = new Set(
      [
        'INVALID_TICKET_TOKEN',
        'EXPIRED_TICKET_TOKEN',
        'WRONG_SCHEDULE_TICKET',
        'BOARDING_WINDOW_NOT_OPEN',
        'TICKET_NOT_CONFIRMED',
        'ALREADY_BOARDED',
        'TICKET_ERROR_ID_NOT_FOUND',
        'GENERIC',
      ].map((code) => boardingScanErrorIcon(code))
    );

    expect(icons.size).toBe(8);
  });

  it('falls back to the GENERIC icon for an unmapped code', () => {
    expect(boardingScanErrorIcon('SOME_UNMAPPED_CODE')).toBe(boardingScanErrorIcon('GENERIC'));
  });
});

describe('extractBoardingScanErrorCode', () => {
  it('reads error.error.errorCode off an HttpErrorResponse', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { errorCode: 'ALREADY_BOARDED', message: 'ตั๋วนี้ขึ้นรถไปแล้ว' },
    });

    expect(extractBoardingScanErrorCode(error)).toBe('ALREADY_BOARDED');
  });

  it('falls back to GENERIC for a non-HTTP error or a missing errorCode', () => {
    expect(extractBoardingScanErrorCode(new Error('boom'))).toBe('GENERIC');
    expect(
      extractBoardingScanErrorCode(new HttpErrorResponse({ status: 500, error: { message: 'oops' } }))
    ).toBe('GENERIC');
  });
});
