import { HttpErrorResponse } from '@angular/common/http';
import { extractApiErrorCode } from './api-error-code';

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
