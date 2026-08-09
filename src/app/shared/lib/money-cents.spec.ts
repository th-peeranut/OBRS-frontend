import { centsToDecimalString, toCents, toSignedCents } from './money-cents';

describe('money-cents', () => {
  describe('toCents', () => {
    it('parses a plain integer amount', () => {
      expect(toCents('100')).toBe(10000);
    });

    it('parses a 2-decimal amount', () => {
      expect(toCents('99.99')).toBe(9999);
    });

    it('parses "0.00"', () => {
      expect(toCents('0.00')).toBe(0);
    });

    it('rejects more than 2 fraction digits', () => {
      expect(toCents('1.234')).toBeNull();
    });

    it('rejects a negative amount', () => {
      expect(toCents('-5.00')).toBeNull();
    });

    it('rejects a non-numeric string', () => {
      expect(toCents('abc')).toBeNull();
    });

    it('rejects an empty string', () => {
      expect(toCents('')).toBeNull();
    });

    it('trims surrounding whitespace before validating', () => {
      expect(toCents('  42.50  ')).toBe(4250);
    });

    // The exact case this module exists to guard: 0.1 + 0.2 !== 0.3 under
    // IEEE 754 binary float. A caller doing float arithmetic directly on
    // parsed decimal amounts (instead of integer cents) would compute this
    // wrong — this locks that toCents() itself returns the EXACT integer,
    // so any cents-based arithmetic built on top is exact.
    it('a value that rounds wrong under naive float arithmetic converts to an exact integer', () => {
      expect(toCents('0.1')).toBe(10);
      expect(toCents('0.2')).toBe(20);
      // 0.1 + 0.2 !== 0.3 in IEEE 754 (it's 0.30000000000000004), but the
      // CENTS sum is exact:
      expect((toCents('0.1') as number) + (toCents('0.2') as number)).toBe(30);
      expect(0.1 + 0.2).not.toBe(0.3); // the float trap this module avoids
    });

    it('a value whose float representation is not exact still parses to the exact cents (e.g. 19.9 * ... trap)', () => {
      // 19.9 in binary float is 19.899999999999998578... — Number('19.90')
      // still parses to a double close to 19.9, but Math.round(x*100)
      // recovers the exact integer rather than 1989.
      expect(toCents('19.90')).toBe(1990);
      // The naive float approach — Number(a) - Number(b) directly — is
      // where a real bug would show; cents arithmetic sidesteps it:
      const a = toCents('20.00') as number;
      const b = toCents('19.90') as number;
      expect(a - b).toBe(10); // exactly 0.10 in cents, never 9 or 11
    });
  });

  // OBRS-1144 — a BALANCE, not a cash count. The two parsers are deliberately
  // separate; the pair of suites below is what keeps them from converging.
  describe('toSignedCents', () => {
    it('parses a negative amount', () => {
      expect(toSignedCents('-20.00')).toBe(-2000);
    });

    it('parses the smallest negative amount', () => {
      expect(toSignedCents('-0.01')).toBe(-1);
    });

    it('still parses every positive form toCents accepts', () => {
      expect(toSignedCents('100')).toBe(10000);
      expect(toSignedCents('99.99')).toBe(9999);
      expect(toSignedCents('0.00')).toBe(0);
      expect(toSignedCents('  42.50  ')).toBe(4250);
    });

    it('rejects a bare minus sign', () => {
      expect(toSignedCents('-')).toBeNull();
    });

    it('rejects a doubled minus sign', () => {
      expect(toSignedCents('--5')).toBeNull();
    });

    it('rejects a minus with no integer part', () => {
      expect(toSignedCents('-.5')).toBeNull();
    });

    it('rejects a trailing minus sign', () => {
      expect(toSignedCents('5-')).toBeNull();
    });

    it('rejects more than 2 fraction digits, same as toCents', () => {
      expect(toSignedCents('-1.234')).toBeNull();
    });

    it('holds the exact integer on the negative side of the float trap too', () => {
      const expected = toSignedCents('-19.90') as number;
      const returned = toSignedCents('-20.00') as number;
      expect(expected).toBe(-1990);
      expect(returned - expected).toBe(-10); // exactly -0.10, never -9 or -11
    });

    // The guard that keeps decision (ข) honest: relaxing the SHARED parser
    // instead of adding this one would have let a minus sign into the
    // settlement cash count (OBRS-671), where a stack of notes cannot be
    // negative and a stray `-` would post a silent credit.
    it('toCents is NOT relaxed by the existence of this function', () => {
      expect(toCents('-20.00')).toBeNull();
      expect(toCents('-0.01')).toBeNull();
    });
  });

  describe('centsToDecimalString', () => {
    it('formats cents back to a 2-decimal string', () => {
      expect(centsToDecimalString(9999)).toBe('99.99');
    });

    it('round-trips through toCents', () => {
      const cents = toCents('123.45') as number;
      expect(centsToDecimalString(cents)).toBe('123.45');
    });

    // OBRS-1144 — this is the value that goes back INTO the input box as the
    // prefill, so the minus has to survive the round trip or the seeded day
    // would read as a 40.00 discrepancy on a -20.00 expectation.
    it('round-trips a negative amount through toSignedCents, keeping the sign', () => {
      const cents = toSignedCents('-20.00') as number;
      expect(centsToDecimalString(cents)).toBe('-20.00');
    });
  });
});
