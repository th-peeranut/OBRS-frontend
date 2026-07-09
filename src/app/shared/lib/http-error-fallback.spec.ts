import { HttpErrorResponse } from '@angular/common/http';
import { classifyHttpFallback } from './http-error-fallback';

describe('classifyHttpFallback', () => {
  it('classifies status 0 (network unreachable) as SERVICE_UNAVAILABLE', () => {
    expect(classifyHttpFallback(new HttpErrorResponse({ status: 0 }))).toBe('SERVICE_UNAVAILABLE');
  });

  it('classifies any 5xx status as SERVICE_UNAVAILABLE', () => {
    expect(classifyHttpFallback(new HttpErrorResponse({ status: 500 }))).toBe('SERVICE_UNAVAILABLE');
    expect(classifyHttpFallback(new HttpErrorResponse({ status: 503 }))).toBe('SERVICE_UNAVAILABLE');
  });

  it('classifies any other 4xx status as ACTION_UNAVAILABLE', () => {
    expect(classifyHttpFallback(new HttpErrorResponse({ status: 400 }))).toBe('ACTION_UNAVAILABLE');
    expect(classifyHttpFallback(new HttpErrorResponse({ status: 403 }))).toBe('ACTION_UNAVAILABLE');
    expect(classifyHttpFallback(new HttpErrorResponse({ status: 409 }))).toBe('ACTION_UNAVAILABLE');
  });

  it('defaults a non-HttpErrorResponse (unexpected JS error) to ACTION_UNAVAILABLE', () => {
    expect(classifyHttpFallback(new Error('boom'))).toBe('ACTION_UNAVAILABLE');
    expect(classifyHttpFallback(null)).toBe('ACTION_UNAVAILABLE');
    expect(classifyHttpFallback(undefined)).toBe('ACTION_UNAVAILABLE');
  });
});
