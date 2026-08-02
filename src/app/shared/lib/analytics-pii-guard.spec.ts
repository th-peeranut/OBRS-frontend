import {
  AnalyticsPiiError,
  sanitizeAnalyticsParams,
} from './analytics-pii-guard';

/**
 * OBRS-867 AC-4. This spec is the gate, not the doc comment above the guard.
 *
 * It is written as two halves on purpose. A deny list that blocks everything
 * passes any "must catch" suite ever written, and would silently delete the
 * entire funnel — so the must-NOT-catch half is load-bearing, and every key it
 * lists is one this app really sends (see `analytics.effect.ts` and the
 * `AnalyticsService` call sites).
 */
describe('sanitizeAnalyticsParams (OBRS-867 AC-4)', () => {
  describe('MUST CATCH — nothing personal may survive', () => {
    const forbiddenByKey: ReadonlyArray<[string, unknown]> = [
      ['email', 'somsak@example.com'],
      ['customer_email', 'somsak@example.com'],
      ['phone', '0812345678'],
      ['phone_number', '0812345678'],
      ['mobileNo', '0812345678'],
      ['passenger_name', 'Somsak'],
      ['firstName', 'Somsak'],
      ['fullname', 'Somsak Jaidee'],
      ['seat_number', '12A'],
      ['seatNumbers', '12A'],
      ['ticket_no', 'TCK-991'],
      ['booking_ref', 'BK-2026-0001'],
      ['bookingId', 4102],
      ['reference_no', 'RQ17...'],
      ['citizen_id', '1103700123456'],
      ['passport_no', 'AA1234567'],
      ['date_of_birth', '1990-01-01'],
      ['card_number', '4242424242424242'],
      ['password', 'hunter2'],
      ['access_token', 'ey...'],
      ['user_id', 77],
      ['actor_id', 77],
      ['idempotency_key', 'abc-123'],
    ];

    forbiddenByKey.forEach(([key, value]) => {
      it(`drops '${key}' by name`, () => {
        const result = sanitizeAnalyticsParams({
          [key]: value,
        } as never);

        expect(Object.keys(result.params)).toEqual([]);
        expect(result.violations.length).toBe(1);
        // The reason must name the key so the developer can find the call site,
        // and must NOT echo the value — that only relocates the leak.
        expect(result.violations[0]).toContain(key);
        expect(result.violations[0]).not.toContain(String(value));
      });
    });

    /**
     * Written after a mutation test caught the suite lying to itself.
     *
     * The cases above pair each forbidden key with a realistic value — and for
     * `email` / `customer_email` / `phone_number` that value is ALSO caught by
     * the value-shape rules further down. Deleting `'email'` from
     * FORBIDDEN_KEY_SUBSTRINGS therefore left the whole suite green: the tests
     * claimed to prove the key rule and were quietly proving the value rule.
     *
     * These cases pin the key rule on its own, by giving each forbidden key a
     * value no shape rule would ever object to. Delete a deny-list entry and
     * exactly one of these goes red.
     */
    const forbiddenByKeyAlone: readonly string[] = [
      'passenger_name',
      'station_name',
      'customer_email',
      'email_verified',
      'phone_verified',
      'mobile_confirmed',
      'passport_checked',
      'password_set',
      'citizen_verified',
      'national_checked',
      'birth_year',
      'seat',
      'ticket',
      'reference',
      'token',
      'user_id',
      'booking_id',
    ];

    forbiddenByKeyAlone.forEach((key) => {
      it(`drops '${key}' on the KEY alone, with a value no shape rule objects to`, () => {
        const result = sanitizeAnalyticsParams({ [key]: true } as never);

        expect(Object.keys(result.params))
          .withContext(`'${key}' must be refused by name, not by its value`)
          .toEqual([]);
        expect(result.violations.length).toBe(1);
      });
    });

    it('drops an email hiding under an innocent key', () => {
      const result = sanitizeAnalyticsParams({ note: 'somsak@example.com' } as never);

      expect(result.params['note']).toBeUndefined();
      expect(result.violations[0]).toContain('email address');
    });

    it('drops a Thai phone number hiding under an innocent key', () => {
      const local = sanitizeAnalyticsParams({ contact: '081-234-5678' } as never);
      const international = sanitizeAnalyticsParams({ contact: '+66812345678' } as never);

      expect(local.params['contact']).toBeUndefined();
      expect(international.params['contact']).toBeUndefined();
      expect(local.violations[0]).toContain('phone number');
    });

    it('drops a 13-digit national ID hiding under an innocent key', () => {
      const result = sanitizeAnalyticsParams({ code: '1103700123456' } as never);

      expect(result.params['code']).toBeUndefined();
      expect(result.violations[0]).toContain('national ID');
    });

    it('drops a value that is not a GA4-safe primitive', () => {
      const result = sanitizeAnalyticsParams({
        stops: ['chonburi', 'bangkok'],
        detail: { a: 1 },
        broken: Number.NaN,
      } as never);

      expect(Object.keys(result.params)).toEqual([]);
      expect(result.violations.length).toBe(3);
    });

    it('cannot be bypassed through the prototype chain', () => {
      // `Object.entries` walks own enumerable keys only. A key planted on the
      // prototype must therefore never reach the output (OBRS-427/601).
      const polluted = Object.create({ email: 'somsak@example.com' }) as Record<
        string,
        unknown
      >;
      polluted['route_from'] = 'chonburi';

      const result = sanitizeAnalyticsParams(polluted as never);

      expect(result.params).toEqual({ route_from: 'chonburi' });
      expect(result.violations).toEqual([]);
    });
  });

  describe('MUST NOT CATCH — the real funnel must survive intact', () => {
    it('passes every parameter this app actually sends', () => {
      const realPayload = {
        page_path: '/passenger-info',
        page_language: 'th',
        route_from: 'chonburi',
        route_to: 'bangkok',
        search_date: '2026-07-29',
        passenger_count: 2,
        seat_count: 3,
        trip_type: 'one_way',
        has_results: false,
        result_count: 0,
        schedule_id: 41,
        leg: 'departure',
        seating_mode: 'ASSIGNED',
        price_per_seat: 250,
        payment_method: 'qr_promptpay',
        value: 500,
        currency: 'THB',
      };

      const result = sanitizeAnalyticsParams(realPayload);

      expect(result.violations).toEqual([]);
      expect(result.params).toEqual(realPayload);
    });

    it('keeps a zero, an empty string and `false` rather than treating them as absent', () => {
      const result = sanitizeAnalyticsParams({
        result_count: 0,
        has_results: false,
        seating_mode: '',
      });

      expect(result.violations).toEqual([]);
      expect(result.params).toEqual({
        result_count: 0,
        has_results: false,
        seating_mode: '',
      });
    });

    it('drops null/undefined silently — an absent optional is not a violation', () => {
      const result = sanitizeAnalyticsParams({
        route_from: 'chonburi',
        seating_mode: null,
        leg: undefined,
      });

      expect(result.violations).toEqual([]);
      expect(result.params).toEqual({ route_from: 'chonburi' });
    });

    it('handles a missing bag without inventing a violation', () => {
      expect(sanitizeAnalyticsParams(null)).toEqual({ params: {}, violations: [] });
      expect(sanitizeAnalyticsParams(undefined)).toEqual({ params: {}, violations: [] });
    });
  });

  describe('AnalyticsPiiError', () => {
    it('names the event and every violation, and cites the card', () => {
      const error = new AnalyticsPiiError('booking_completed', [
        "'email' is a personal-data field name.",
      ]);

      expect(error.name).toBe('AnalyticsPiiError');
      expect(error.message).toContain('booking_completed');
      expect(error.message).toContain('OBRS-867 AC-4');
      expect(error.message).toContain("'email'");
    });
  });
});
