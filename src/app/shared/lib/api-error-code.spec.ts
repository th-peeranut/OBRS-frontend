import { HttpErrorResponse } from '@angular/common/http';
import { errorCodeFromMessageKey, extractApiErrorCode, mapApiErrorCode } from './api-error-code';

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

// OBRS-766 (QA-caught): the counter-cancel screen compared `extractApiErrorCode()`
// (real wire field) against the dotted `messageKey` form directly — a comparison
// that can never match, since `DomainException.getErrorCode()` never puts dots on
// the wire. Unit tests didn't catch it because the mocked error responses used the
// same wrong dotted form the component compared against. This transform is the
// fix: derive the wire form from the messageKey instead of hand-typing it, so a
// caller's constant and the backend's real output cannot independently drift.
describe('errorCodeFromMessageKey', () => {
  it('mirrors DomainException.getErrorCode() — upper-cases, then replaces every dot and hyphen with underscore', () => {
    expect(errorCodeFromMessageKey('cancel.error.window-closed')).toBe('CANCEL_ERROR_WINDOW_CLOSED');
    expect(errorCodeFromMessageKey('cancel.error.approval-required')).toBe('CANCEL_ERROR_APPROVAL_REQUIRED');
    expect(errorCodeFromMessageKey('cancel.error.approver-invalid')).toBe('CANCEL_ERROR_APPROVER_INVALID');
    expect(errorCodeFromMessageKey('cancel.error.approver-not-owner')).toBe('CANCEL_ERROR_APPROVER_NOT_OWNER');
    expect(errorCodeFromMessageKey('cancel.error.approver-self')).toBe('CANCEL_ERROR_APPROVER_SELF');
    expect(errorCodeFromMessageKey('cancel.error.refund-destination-required')).toBe(
      'CANCEL_ERROR_REFUND_DESTINATION_REQUIRED'
    );
    expect(errorCodeFromMessageKey('cancel.error.refund-destination-invalid')).toBe(
      'CANCEL_ERROR_REFUND_DESTINATION_INVALID'
    );
    expect(errorCodeFromMessageKey('cancel.error.booking-not-found')).toBe('CANCEL_ERROR_BOOKING_NOT_FOUND');
    expect(errorCodeFromMessageKey('booking.search.error.criteria-required')).toBe(
      'BOOKING_SEARCH_ERROR_CRITERIA_REQUIRED'
    );
  });

  // Real body captured against the running local backend
  // (`{"status":403,...,"errorCode":"CANCEL_ERROR_UNAUTHORIZED"}`) — the
  // sample that actually caught this bug, pinned here so it can't regress
  // silently again.
  it('matches a real backend-captured wire code', () => {
    expect(errorCodeFromMessageKey('cancel.error.unauthorized')).toBe('CANCEL_ERROR_UNAUTHORIZED');
  });

  it('replaces every dot/hyphen, not just the first (multi-segment keys)', () => {
    expect(errorCodeFromMessageKey('a.b-c.d-e')).toBe('A_B_C_D_E');
  });
});
