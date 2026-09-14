import { translationLabel } from './translation-label';

describe('translationLabel', () => {
  it('returns null for a missing or non-object value', () => {
    expect(translationLabel(null, 'th')).toBeNull();
    expect(translationLabel(undefined, 'th')).toBeNull();
    expect(translationLabel('ตลาด', 'th')).toBeNull();
    expect(translationLabel(42, 'th')).toBeNull();
  });

  describe('list shape', () => {
    const list = [
      { locale: 'EN', label: 'Market' },
      { locale: 'th', label: 'ตลาด' },
    ];

    it('matches the locale case-insensitively', () => {
      expect(translationLabel(list, 'en')).toBe('Market');
      expect(translationLabel(list, 'th')).toBe('ตลาด');
    });

    it('falls back to the first entry with a label when the locale is absent', () => {
      expect(translationLabel(list, 'zh')).toBe('Market');
      expect(translationLabel([{ locale: 'th' }, { locale: 'en', label: 'Market' }], 'zh')).toBe('Market');
    });

    it('returns null when no entry carries a label', () => {
      expect(translationLabel([], 'th')).toBeNull();
      expect(translationLabel([{ locale: 'th' }, 'not-an-entry'], 'th')).toBeNull();
    });
  });

  describe('map shape', () => {
    const map = { th: { label: 'ตลาด' }, en: { label: 'Market' } };

    it('reads the locale key directly', () => {
      expect(translationLabel(map, 'th')).toBe('ตลาด');
      expect(translationLabel(map, 'en')).toBe('Market');
    });

    it('falls back to the first value with a label when the locale key is absent', () => {
      expect(translationLabel({ zh: null, en: { label: 'Market' } }, 'th')).toBe('Market');
    });

    it('returns null when no value carries a label', () => {
      expect(translationLabel({ th: {}, en: null }, 'th')).toBeNull();
    });
  });
});
