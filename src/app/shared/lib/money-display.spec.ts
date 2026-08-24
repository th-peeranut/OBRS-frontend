import { formatMoney } from './money-display';

describe('formatMoney', () => {
  it('shows no decimals when the amount has no satang — the OBRS-1592 standard', () => {
    // The complaint that opened the card: `.00` on every fare, and no fare has satang.
    expect(formatMoney(200, 'th')).toBe('200 บาท');
    expect(formatMoney(30, 'th')).toBe('30 บาท');
    expect(formatMoney(0, 'th')).toBe('0 บาท');
  });

  it('shows exactly two decimals when there are satang', () => {
    expect(formatMoney(199.5, 'th')).toBe('199.50 บาท');
    expect(formatMoney(199.05, 'th')).toBe('199.05 บาท');
  });

  it('groups thousands — the search page had no separator at all before this', () => {
    expect(formatMoney(1850, 'th')).toBe('1,850 บาท');
    expect(formatMoney(1234567.5, 'th')).toBe('1,234,567.50 บาท');
  });

  it('puts a code BEFORE the number in English, matching the confirmation email', () => {
    // messages.properties: notification.currency.format=THB {0}
    expect(formatMoney(200, 'en')).toBe('THB 200');
    expect(formatMoney(199.5, 'en')).toBe('THB 199.50');
    expect(formatMoney(1850, 'en')).toBe('THB 1,850');
  });

  it('puts the unit AFTER the number with no space in Chinese', () => {
    // CJK sets no space before a unit; measured against CLDR zh-CN, which
    // renders the currency-name form as `200.00泰铢`.
    expect(formatMoney(200, 'zh')).toBe('200泰铢');
    expect(formatMoney(199.5, 'zh')).toBe('199.50泰铢');
    expect(formatMoney(1850, 'zh')).toBe('1,850泰铢');
  });

  it('accepts the region-tagged language codes the app actually holds', () => {
    expect(formatMoney(200, 'th-TH')).toBe('200 บาท');
    expect(formatMoney(200, 'zh-CN')).toBe('200泰铢');
    expect(formatMoney(200, 'TH')).toBe('200 บาท');
  });

  it('falls back to the English shape for a missing or unknown language', () => {
    expect(formatMoney(200)).toBe('THB 200');
    expect(formatMoney(200, null)).toBe('THB 200');
    expect(formatMoney(200, 'ja')).toBe('THB 200');
  });

  it('parses the decimal STRINGS the money endpoints actually return', () => {
    // Every amount in these payloads is a string, e.g. "1850.00" / "199.50".
    expect(formatMoney('1850.00', 'th')).toBe('1,850 บาท');
    expect(formatMoney('199.50', 'th')).toBe('199.50 บาท');
  });

  it('renders 0 rather than a broken string for missing or unparsable input', () => {
    expect(formatMoney(null, 'th')).toBe('0 บาท');
    expect(formatMoney(undefined, 'th')).toBe('0 บาท');
    expect(formatMoney('', 'th')).toBe('0 บาท');
    expect(formatMoney('not-money', 'th')).toBe('0 บาท');
    expect(formatMoney(Number.NaN, 'th')).toBe('0 บาท');
    expect(formatMoney(Number.POSITIVE_INFINITY, 'th')).toBe('0 บาท');
  });

  it('keeps the sign — a negative balance is a real state on the driver-cash day', () => {
    // OBRS-1073 made that balance genuinely two-sided; do not hide it.
    expect(formatMoney(-200, 'th')).toBe('-200 บาท');
    expect(formatMoney(-199.5, 'en')).toBe('THB -199.50');
  });

  it('drops float noise below satang instead of printing a false .00', () => {
    expect(formatMoney(199.999, 'th')).toBe('200 บาท');
    expect(formatMoney(0.1 + 0.2, 'th')).toBe('0.30 บาท');
  });

  describe('MUST-NOT regress — the four formats this file replaced', () => {
    const everyLang = ['th', 'en', 'zh'];

    it('never prints the ฿ sign a reader has to already recognise', () => {
      for (const lang of everyLang) {
        expect(formatMoney(200, lang)).not.toContain('฿');
        expect(formatMoney(199.5, lang)).not.toContain('฿');
      }
    });

    it('never pads a whole amount with .00', () => {
      for (const lang of everyLang) {
        expect(formatMoney(200, lang)).not.toContain('.00');
        expect(formatMoney(1850, lang)).not.toContain('.00');
      }
    });

    it('never drops the thousand separator', () => {
      for (const lang of everyLang) {
        expect(formatMoney(1850, lang)).toContain('1,850');
      }
    });
  });
});
