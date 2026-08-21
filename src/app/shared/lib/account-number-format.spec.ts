import {
  caretAfterDigits,
  formatAccountNumber,
  stripAccountNumber,
} from './account-number-format';

describe('account-number-format (OBRS-1465)', () => {
  describe('stripAccountNumber', () => {
    it('accepts a number that is pasted ALREADY grouped (AC-3)', () => {
      expect(stripAccountNumber('148-0-62262-1')).toBe('1480622621');
    });

    it('accepts spaces, and drops letters rather than bouncing the input', () => {
      expect(stripAccountNumber(' 148 0 62262 1 ')).toBe('1480622621');
      expect(stripAccountNumber('148a0')).toBe('1480');
    });

    it('is empty for an empty field', () => {
      expect(stripAccountNumber('')).toBe('');
    });
  });

  describe('formatAccountNumber', () => {
    it('groups a 10-digit number as 012-3-45678-9, the Thai convention', () => {
      expect(formatAccountNumber('1480622621', null)).toBe('148-0-62262-1');
    });

    it('grows group by group as the user types, which is the whole point', () => {
      expect(formatAccountNumber('', null)).toBe('');
      expect(formatAccountNumber('1', null)).toBe('1');
      expect(formatAccountNumber('148', null)).toBe('148');
      expect(formatAccountNumber('1480', null)).toBe('148-0');
      expect(formatAccountNumber('14806', null)).toBe('148-0-6');
      expect(formatAccountNumber('148062262', null)).toBe('148-0-62262');
    });

    it('uses the bank-specific grouping when the bank has one (GSB, 12 digits)', () => {
      expect(formatAccountNumber('054590056674', '030')).toBe('0-5459005667-4');
    });

    it('leaves a bank with no sourced grouping on the convention', () => {
      expect(formatAccountNumber('1480622621', '004')).toBe('148-0-62262-1');
    });

    it('does not answer a prototype key with a function (ADR-0028)', () => {
      // 'constructor' is truthy on any object literal, so `MAP[key] || FALLBACK`
      // would have handed a FUNCTION to the loop. The guard is what keeps this
      // a formatted number instead of a crash, and only a test says so -- the
      // gate is satisfied by a comment too.
      expect(formatAccountNumber('1480622621', 'constructor')).toBe('148-0-62262-1');
      expect(formatAccountNumber('1480622621', '__proto__')).toBe('148-0-62262-1');
    });

    it('emits digits past the template as one trailing group, never dropping them', () => {
      // The server bounds the length nowhere on purpose (OBRS-1464), so a
      // number longer than the template must still render in full.
      expect(formatAccountNumber('148062262199', null)).toBe('148-0-62262-1-99');
    });
  });

  describe('caretAfterDigits', () => {
    it('lands after the nth DIGIT, not the nth character', () => {
      expect(caretAfterDigits('148-0-62262-1', 3)).toBe(3);
      expect(caretAfterDigits('148-0-62262-1', 4)).toBe(5);
      expect(caretAfterDigits('148-0-62262-1', 5)).toBe(7);
    });

    it('is 0 at the start and clamps to the end past the last digit', () => {
      expect(caretAfterDigits('148-0', 0)).toBe(0);
      expect(caretAfterDigits('148-0', 99)).toBe(5);
    });
  });
});
