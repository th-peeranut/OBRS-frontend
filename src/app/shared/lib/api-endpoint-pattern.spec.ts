import { OPAQUE_SEGMENT, toApiEndpointPattern } from './api-endpoint-pattern';
import { sanitizeAnalyticsParams } from './analytics-pii-guard';

describe('toApiEndpointPattern (OBRS-1223)', () => {
  it('keeps a plain lookup path unchanged — the pattern has to stay readable', () => {
    expect(toApiEndpointPattern('http://localhost:8080/api/stops')).toBe('/api/stops');
    expect(toApiEndpointPattern('/api/booking-policy')).toBe('/api/booking-policy');
  });

  it('drops the query string whole', () => {
    expect(toApiEndpointPattern('/api/schedules?from=1&to=2&date=2026-08-11')).toBe(
      '/api/schedules'
    );
    // The reason it is dropped WHOLE rather than filtered: this is a credential.
    expect(toApiEndpointPattern('/api/reset-password?token=abc123def')).toBe(
      '/api/reset-password'
    );
  });

  describe('AC3 — a raw URL must never survive into a payload', () => {
    it('replaces a numeric id', () => {
      expect(toApiEndpointPattern('/api/bookings/42')).toBe(`/api/bookings/${OPAQUE_SEGMENT}`);
    });

    it('replaces a uuid', () => {
      expect(
        toApiEndpointPattern('/api/tickets/3f2504e0-4f89-11d3-9a0c-0305e82c3301')
      ).toBe(`/api/tickets/${OPAQUE_SEGMENT}`);
    });

    it('replaces a booking reference — the case a numeric-only rule would have kept', () => {
      // `bookingref` is an exact entry on analytics-pii-guard's deny list, and a
      // denylist of ID SHAPES would have printed this verbatim. This is the test
      // that justifies the allowlist.
      expect(toApiEndpointPattern('/api/bookings/lookup/B-P4HPH6')).toBe(
        `/api/bookings/lookup/${OPAQUE_SEGMENT}`
      );
    });

    it('replaces a phone number in a path segment', () => {
      expect(toApiEndpointPattern('/api/external/otp/sms/0812345678')).toBe(
        `/api/external/otp/sms/${OPAQUE_SEGMENT}`
      );
    });

    it('replaces anything with a digit in it, however innocent it looks', () => {
      expect(toApiEndpointPattern('/api/v2/stops')).toBe(`/api/${OPAQUE_SEGMENT}/stops`);
    });

    it('the produced pattern passes the app PII guard, for every case above', () => {
      const urls = [
        '/api/stops',
        '/api/bookings/42',
        '/api/tickets/3f2504e0-4f89-11d3-9a0c-0305e82c3301',
        '/api/bookings/lookup/B-P4HPH6',
        '/api/external/otp/sms/0812345678',
        '/api/reset-password?token=abc123def',
      ];

      for (const url of urls) {
        const { params, violations } = sanitizeAnalyticsParams({
          endpoint_pattern: toApiEndpointPattern(url),
        });
        expect(violations)
          .withContext(`sanitizer rejected the pattern for ${url}`)
          .toEqual([]);
        expect(params['endpoint_pattern']).toBeDefined();
      }
    });
  });

  it('answers /unknown instead of throwing — a measurement may never break a request (AC5)', () => {
    expect(toApiEndpointPattern('')).toBe('/unknown');
    expect(toApiEndpointPattern(null)).toBe('/unknown');
    expect(toApiEndpointPattern(undefined)).toBe('/unknown');
  });
});
