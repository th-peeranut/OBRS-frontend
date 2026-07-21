import { HttpErrorResponse } from '@angular/common/http';
import { extractApiErrorCode, mapApiErrorCode } from './api-error-code';

describe('extractApiErrorCode', () => {
  it('reads error.error.errorCode off an HttpErrorResponse', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { errorCode: 'CHANGE_STOP_ERROR_NO_SEATS' },
    });

    expect(extractApiErrorCode(error, 'GENERIC')).toBe('CHANGE_STOP_ERROR_NO_SEATS');
  });

  it('returns the caller-supplied fallback for a non-HTTP error or a missing errorCode', () => {
    expect(extractApiErrorCode(new Error('boom'), 'GENERIC')).toBe('GENERIC');
    expect(extractApiErrorCode(new HttpErrorResponse({ status: 500 }), 'GENERIC')).toBe('GENERIC');
    expect(extractApiErrorCode(new Error('boom'), null)).toBeNull();
    expect(extractApiErrorCode(new HttpErrorResponse({ status: 500 }), null)).toBeNull();
  });

  it('treats an empty-string errorCode as absent', () => {
    const error = new HttpErrorResponse({ status: 400, error: { errorCode: '' } });

    expect(extractApiErrorCode(error, 'GENERIC')).toBe('GENERIC');
  });

  // OBRS-413: the instanceof guard is the contract, not an implementation detail.
  // settlements-page/sell-page read the same field WITHOUT it and their specs throw
  // plain literals like this one — which is exactly why they are not migrated onto
  // this util. If this expectation ever flips, those two call sites change behavior.
  // See docs/adr/0022-shared-api-error-code-extractor.md.
  it('ignores a non-HttpErrorResponse object that merely has the same shape', () => {
    expect(extractApiErrorCode({ error: { errorCode: 'LOOKS_REAL' } }, 'GENERIC')).toBe('GENERIC');
  });

  it('returns the fallback for null/undefined', () => {
    expect(extractApiErrorCode(null, 'GENERIC')).toBe('GENERIC');
    expect(extractApiErrorCode(undefined, null)).toBeNull();
  });
});

describe('mapApiErrorCode', () => {
  const KNOWN: Record<string, string> = {
    NO_SEATS: 'DOMAIN.ERROR.NO_SEATS',
    TOO_LATE: 'DOMAIN.ERROR.TOO_LATE',
  };
  const FALLBACK = 'DOMAIN.ERROR.GENERIC';

  it('maps a code the caller declared', () => {
    expect(mapApiErrorCode('NO_SEATS', KNOWN, FALLBACK)).toBe('DOMAIN.ERROR.NO_SEATS');
    expect(mapApiErrorCode('TOO_LATE', KNOWN, FALLBACK)).toBe('DOMAIN.ERROR.TOO_LATE');
  });

  it('falls back for an absent, empty or unknown code', () => {
    expect(mapApiErrorCode(null, KNOWN, FALLBACK)).toBe(FALLBACK);
    expect(mapApiErrorCode(undefined, KNOWN, FALLBACK)).toBe(FALLBACK);
    expect(mapApiErrorCode('', KNOWN, FALLBACK)).toBe(FALLBACK);
    expect(mapApiErrorCode('SOMETHING_NEW', KNOWN, FALLBACK)).toBe(FALLBACK);
  });

  it('is case-sensitive — server codes are stable UPPER_SNAKE, not normalized', () => {
    expect(mapApiErrorCode('no_seats', KNOWN, FALLBACK)).toBe(FALLBACK);
  });

  // OBRS-601. This is the case the sixteen open-coded versions all got wrong:
  // the map is an object literal, so `KNOWN['constructor']` is the `Object`
  // FUNCTION — non-nullish (`??` never fires) and truthy (`||` never fires) —
  // and the caller handed that function to `translate.instant()`, which throws
  // on `.split('.')`. Server codes are NOT lower-cased anywhere on this path,
  // so every prototype member is reachable, not just the lowercase pair.
  [
    'constructor',
    '__proto__',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
  ].forEach((member) => {
    it(`falls back for inherited member "${member}" and returns a string`, () => {
      const key = mapApiErrorCode(member, KNOWN, FALLBACK);
      expect(key).withContext(member).toBe(FALLBACK);
      expect(typeof key).withContext(member).toBe('string');
    });
  });
});
