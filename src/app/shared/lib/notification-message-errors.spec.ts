import { HttpErrorResponse } from '@angular/common/http';
import { extractPlaceholderError } from './notification-message-errors';

describe('extractPlaceholderError', () => {
  it('reads the { data: { reason, missingIndices, extraIndices, formatError } } shape off a 400', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: {
        data: {
          reason: 'PLACEHOLDER_MISMATCH',
          missingIndices: [1],
          extraIndices: [2],
          formatError: null,
        },
      },
    });

    expect(extractPlaceholderError(error)).toEqual({
      reason: 'PLACEHOLDER_MISMATCH',
      missingIndices: [1],
      extraIndices: [2],
      formatError: null,
    });
  });

  it('returns null for a non-HttpErrorResponse', () => {
    expect(extractPlaceholderError(new Error('boom'))).toBeNull();
    expect(extractPlaceholderError('boom')).toBeNull();
    expect(extractPlaceholderError(null)).toBeNull();
  });

  it('returns null when the 400 body has no data.reason field', () => {
    const error = new HttpErrorResponse({ status: 400, error: { message: 'blank body' } });
    expect(extractPlaceholderError(error)).toBeNull();
  });

  it('returns null when the error body has no data key at all', () => {
    const error = new HttpErrorResponse({ status: 500, error: null });
    expect(extractPlaceholderError(error)).toBeNull();
  });
});
