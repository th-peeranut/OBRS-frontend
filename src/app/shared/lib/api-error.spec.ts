import { HttpErrorResponse } from '@angular/common/http';
import { extractApiErrorMessage } from './api-error';

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

  it('falls back to the transport message when the body has no message field', () => {
    const error = new HttpErrorResponse({ status: 0, error: { errorCode: 'X' } });
    expect(extractApiErrorMessage(error)).toBe(error.message);
  });

  it('handles a plain Error', () => {
    expect(extractApiErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns "" for unknown error shapes', () => {
    expect(extractApiErrorMessage('nope')).toBe('');
    expect(extractApiErrorMessage(null)).toBe('');
  });
});
