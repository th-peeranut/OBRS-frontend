import { HttpErrorResponse } from '@angular/common/http';
import { extractApiErrorMessage, statusAlertMessageKey } from './api-error';

/**
 * A backend URL of the shape a user must never see. Every fixture below is
 * built with it so `error.message` really does contain the leak — an
 * HttpErrorResponse with no `url` synthesizes "for (unknown url)", which would
 * make the guard tests vacuous (they would pass against the unfixed code too).
 */
const API_URL = 'https://obrs-backend.example.com/api/external/otp/request/test';

describe('extractApiErrorMessage', () => {
  it('prefers the backend ApiErrorResponse message', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: {
        message: 'Lookup with category: user_status and slug: active already exists',
        errorCode: 'LOOKUP_ERROR_CATEGORY_SLUG_CONFLICT',
      },
    });
    expect(extractApiErrorMessage(error)).toBe(
      'Lookup with category: user_status and slug: active already exists'
    );
  });

  it('returns a raw string error body as-is', () => {
    const error = new HttpErrorResponse({ status: 400, error: 'Bad things' });
    expect(extractApiErrorMessage(error)).toBe('Bad things');
  });

  it('returns "" when there is no usable backend message, so callers can fall back', () => {
    const error = new HttpErrorResponse({ status: 500, error: null });
    expect(extractApiErrorMessage(error)).toBe('');
  });

  it('handles a plain Error', () => {
    expect(extractApiErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns "" for unknown error shapes', () => {
    expect(extractApiErrorMessage('nope')).toBe('');
    expect(extractApiErrorMessage(null)).toBe('');
  });

  // OBRS-567. The suite used to assert the OPPOSITE of the block below —
  // `expect(extractApiErrorMessage(error)).toBe(error.message)` on a status 0 —
  // so the leak shipped with a green test certifying it. These cases are the
  // repro: each one returned the transport string before the fix.
  describe('never returns a transport-level message (OBRS-567)', () => {
    it('returns "" for the real status-0 shape (ProgressEvent body)', () => {
      // What Angular ACTUALLY sets on network loss / CORS / DNS / TLS failure:
      // non-null, not a string, and no .message — which is exactly why it fell
      // through every guard to error.message.
      const error = new HttpErrorResponse({
        status: 0,
        url: API_URL,
        error: new ProgressEvent('error'),
      });

      // Precondition: without it a fix that merely stopped populating
      // error.message would make this test pass without closing the leak.
      expect(error.message).toContain(API_URL);

      expect(extractApiErrorMessage(error)).toBe('');
    });

    it('returns "" for a status-0 body that has an errorCode but no message', () => {
      const error = new HttpErrorResponse({ status: 0, url: API_URL, error: { errorCode: 'X' } });
      expect(extractApiErrorMessage(error)).toBe('');
    });

    it('returns "" for a gateway HTML body (502/504)', () => {
      for (const status of [502, 504]) {
        const error = new HttpErrorResponse({
          status,
          url: API_URL,
          error:
            '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head>' +
            '<body>upstream obrs-backend-8f2a.internal did not respond</body></html>',
        });
        expect(extractApiErrorMessage(error)).toBe('');
      }
    });

    it('returns "" for an HTML body with leading whitespace', () => {
      const error = new HttpErrorResponse({
        status: 504,
        url: API_URL,
        error: '\n  \n<html><body>Gateway Timeout</body></html>',
      });
      expect(extractApiErrorMessage(error)).toBe('');
    });

    // The gate: whatever shape a transport failure arrives in, nothing that
    // reaches a user may carry a URL, a hostname, markup, or Angular's own
    // wording. Asserting the absence of the leak (rather than a specific
    // return value) is what makes this survive a future refactor of the
    // fallback chain.
    it('leaks neither URL nor markup for any transport-failure shape', () => {
      const shapes: unknown[] = [
        new HttpErrorResponse({ status: 0, url: API_URL, error: new ProgressEvent('error') }),
        new HttpErrorResponse({ status: 0, url: API_URL, error: { errorCode: 'X' } }),
        new HttpErrorResponse({ status: 0, url: API_URL, error: undefined }),
        new HttpErrorResponse({ status: 502, url: API_URL, error: '<html>bad gateway</html>' }),
        new HttpErrorResponse({ status: 504, url: API_URL, error: '<HTML>timeout</HTML>' }),
        new HttpErrorResponse({ status: 500, url: API_URL, error: new ProgressEvent('error') }),
      ];

      for (const shape of shapes) {
        const message = extractApiErrorMessage(shape);
        expect(message).not.toContain('Http failure');
        expect(message).not.toContain('obrs-backend.example.com');
        expect(message).not.toContain('http');
        expect(message).not.toContain('<');
      }
    });
  });
});

describe('statusAlertMessageKey', () => {
  it('maps a 503 to the dedicated service-unavailable i18n key', () => {
    const error = new HttpErrorResponse({
      status: 503,
      error: { message: 'An unexpected error occurred.', errorCode: 'UNEXPECTED_ERROR' },
    });
    expect(statusAlertMessageKey(error)).toBe('COMMON.ERROR.SERVICE_UNAVAILABLE');
  });

  // OBRS-567: 502 and 504 used to be in the "returns null" list below, which is
  // how a gateway's HTML page reached the alert.
  it('maps 502 and 504 to the service-unavailable key', () => {
    for (const status of [502, 504]) {
      const error = new HttpErrorResponse({ status, error: '<html>Bad Gateway</html>' });
      expect(statusAlertMessageKey(error)).toBe('COMMON.ERROR.SERVICE_UNAVAILABLE');
    }
  });

  it('maps a bodyless 429 to the rate-limit key', () => {
    const error = new HttpErrorResponse({ status: 429, error: null });
    expect(statusAlertMessageKey(error)).toBe('COMMON.ERROR.TOO_MANY_REQUESTS');
  });

  // OBRS-1381. The generic key blankets every 429 the same way, and since
  // OBRS-1375 signup answers 429 for two opposite reasons: "you, from this
  // network, are too fast" (wait 15 minutes) and "the system-wide daily email
  // cap is full" (nothing you do today helps). The generic string says the
  // first, so the customer hit by the second is both blamed and misdirected.
  it('yields to the backend message on a 429 that carries one', () => {
    const error = new HttpErrorResponse({
      status: 429,
      error: {
        message: 'ระบบสมัครสมาชิกไม่พร้อมให้บริการชั่วคราว กรุณาลองใหม่อีกครั้งภายหลัง',
        errorCode: 'AUTH_SIGNUP_ERROR_TEMPORARILY_UNAVAILABLE',
      },
    });
    expect(statusAlertMessageKey(error)).toBeNull();
  });

  // The edge refuses before our backend is reached, so there is no message of
  // ours to prefer — and a gateway page must never be rendered (OBRS-567).
  it('keeps the generic key for a 429 whose body is a gateway HTML page', () => {
    const error = new HttpErrorResponse({
      status: 429,
      error: '<html><body>429 Too Many Requests</body></html>',
    });
    expect(statusAlertMessageKey(error)).toBe('COMMON.ERROR.TOO_MANY_REQUESTS');
  });

  describe('status 0', () => {
    it('reports the service unreachable while the browser is online', () => {
      spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
      const error = new HttpErrorResponse({ status: 0, url: API_URL, error: new ProgressEvent('error') });
      expect(statusAlertMessageKey(error)).toBe('COMMON.ERROR.SERVICE_UNAVAILABLE');
    });

    it('blames the connection when the browser reports offline', () => {
      // A different user action follows from each: reconnect vs. wait and retry.
      spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
      const error = new HttpErrorResponse({ status: 0, url: API_URL, error: new ProgressEvent('error') });
      expect(statusAlertMessageKey(error)).toBe('COMMON.ERROR.NETWORK_OFFLINE');
    });
  });

  it('returns null for statuses whose backend message is written for the user', () => {
    // Regression guard: blanketing these would replace "this trip is full" with
    // a generic string, which is a downgrade, not a fix.
    for (const status of [400, 401, 403, 404, 409, 422, 500]) {
      const error = new HttpErrorResponse({ status, error: { message: 'x' } });
      expect(statusAlertMessageKey(error)).toBeNull();
    }
  });

  it('returns null for a non-HttpErrorResponse error', () => {
    expect(statusAlertMessageKey(new Error('boom'))).toBeNull();
    expect(statusAlertMessageKey(null)).toBeNull();
    expect(statusAlertMessageKey('nope')).toBeNull();
  });
});
