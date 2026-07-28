import { FormControl } from '@angular/forms';
import {
  formatThaiMobile,
  separatorTolerantPattern,
  stripPhoneSeparators,
  THAI_MOBILE_PATTERN,
  THAI_LOCAL_PHONE_PATTERN,
  ANY_DIGITS_PHONE_PATTERN,
} from './thai-msisdn';

describe('thai-msisdn helpers (OBRS-646)', () => {
  describe('stripPhoneSeparators', () => {
    it('keeps only digits', () => {
      expect(stripPhoneSeparators('080-000-0000')).toBe('0800000000');
      expect(stripPhoneSeparators('080 000 0000')).toBe('0800000000');
      expect(stripPhoneSeparators('0800000000')).toBe('0800000000');
    });

    it('treats null/undefined/empty as empty', () => {
      expect(stripPhoneSeparators(null)).toBe('');
      expect(stripPhoneSeparators(undefined)).toBe('');
      expect(stripPhoneSeparators('')).toBe('');
    });
  });

  describe('formatThaiMobile', () => {
    it('groups a full 10-digit local number as 3-3-4', () => {
      expect(formatThaiMobile('0800000000')).toBe('080-000-0000');
      expect(formatThaiMobile('0812345678')).toBe('081-234-5678');
    });

    it('is idempotent — regrouping an already-grouped number is a no-op', () => {
      expect(formatThaiMobile('081-234-5678')).toBe('081-234-5678');
    });

    it('leaves a half-typed number as bare digits rather than mis-placing a dash', () => {
      expect(formatThaiMobile('0812')).toBe('0812');
      expect(formatThaiMobile('081234567')).toBe('081234567'); // 9 digits, not yet complete
    });

    it('never fabricates a value from nothing', () => {
      expect(formatThaiMobile('')).toBe('');
      expect(formatThaiMobile(null)).toBe('');
    });
  });

  it('the grouped form round-trips back through the validation pattern', () => {
    // The whole point: dashes are display-only, so stripping them recovers a value the
    // pattern accepts. If this ever fails, the field would validate stricter than signup.
    expect(THAI_MOBILE_PATTERN.test(stripPhoneSeparators('081-234-5678'))).toBe(true);
  });

  describe('separatorTolerantPattern (OBRS-691)', () => {
    const validator = separatorTolerantPattern(THAI_MOBILE_PATTERN);

    it('passes a dashed value whose stripped digits match the pattern', () => {
      const control = new FormControl('081-234-5678');
      expect(validator(control)).toBeNull();
    });

    it('fails a dashed value whose stripped digits do NOT match the pattern, with the same {pattern:true} shape Validators.pattern produces', () => {
      // 02-345-6789 strips to 0234567689... use a clean landline-shaped 10-digit
      // number that fails THAI_MOBILE_PATTERN (only 0[689] prefixes are valid mobiles).
      const control = new FormControl('021-234-5678');
      expect(validator(control)).toEqual({ pattern: true });
    });

    it('returns null on empty/null/undefined — required owns the empty case', () => {
      expect(validator(new FormControl(''))).toBeNull();
      expect(validator(new FormControl(null))).toBeNull();
      expect(validator(new FormControl(undefined))).toBeNull();
    });

    it('strips separators before testing — a bare value that would fail must also pass when dashed the same way', () => {
      const bareControl = new FormControl('0812345678');
      const dashedControl = new FormControl('081-234-5678');
      expect(validator(bareControl)).toEqual(validator(dashedControl));
      expect(validator(bareControl)).toBeNull();
    });
  });

  // OBRS-455: three rules live here now, and the only thing stopping a future edit from
  // "simplifying" them into one is a test that states they must differ, and where.
  describe('the three phone rules are deliberately different', () => {
    const bangkokLandline = '0212345678';
    const thaiMobile = '0812345678';
    const twelveDigits = '123456789012';

    it('THAI_MOBILE_PATTERN is the strictest — mobiles only', () => {
      expect(THAI_MOBILE_PATTERN.test(thaiMobile)).toBe(true);
      expect(THAI_MOBILE_PATTERN.test(bangkokLandline)).toBe(false);
      expect(THAI_MOBILE_PATTERN.test(twelveDigits)).toBe(false);
    });

    it('THAI_LOCAL_PHONE_PATTERN admits the landline the mobile rule rejects', () => {
      expect(THAI_LOCAL_PHONE_PATTERN.test(bangkokLandline)).toBe(true);
      expect(THAI_LOCAL_PHONE_PATTERN.test(twelveDigits)).toBe(false);
    });

    it('ANY_DIGITS_PHONE_PATTERN admits what neither of the others does', () => {
      expect(ANY_DIGITS_PHONE_PATTERN.test(twelveDigits)).toBe(true);
      expect(ANY_DIGITS_PHONE_PATTERN.test('12345')).toBe(false);
    });

    it('every mobile is also a local number — the narrowing is a subset, not a different shape', () => {
      for (const value of ['0612345678', '0812345678', '0912345678']) {
        expect(THAI_MOBILE_PATTERN.test(value)).withContext(value).toBe(true);
        expect(THAI_LOCAL_PHONE_PATTERN.test(value)).withContext(value).toBe(true);
      }
    });
  });
});
