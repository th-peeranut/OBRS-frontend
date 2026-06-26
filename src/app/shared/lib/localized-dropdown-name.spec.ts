import { localizedDropdownName } from './localized-dropdown-name';
import { Dropdown } from '../interfaces/dropdown.interface';

describe('localizedDropdownName', () => {
  const opt: Dropdown = {
    id: 1,
    nameThai: 'นาย',
    nameEnglish: 'Mr.',
    nameChinese: '先生',
  };

  it('returns the Thai label for th', () => {
    expect(localizedDropdownName(opt, 'th')).toBe('นาย');
  });

  it('returns the Chinese label for zh', () => {
    expect(localizedDropdownName(opt, 'zh')).toBe('先生');
  });

  it('returns the English label for en', () => {
    expect(localizedDropdownName(opt, 'en')).toBe('Mr.');
  });

  it('falls back to English for an unknown/undefined language', () => {
    expect(localizedDropdownName(opt, 'fr')).toBe('Mr.');
    expect(localizedDropdownName(opt, undefined)).toBe('Mr.');
    expect(localizedDropdownName(opt, null)).toBe('Mr.');
  });

  it('falls back to English for zh when no Chinese label exists', () => {
    const noZh: Dropdown = { id: 2, nameThai: 'นาง', nameEnglish: 'Mrs.' };
    expect(localizedDropdownName(noZh, 'zh')).toBe('Mrs.');
  });

  it('returns empty string for an option with no name fields (lets callers fall through)', () => {
    expect(localizedDropdownName({ id: 3 } as Dropdown, 'zh')).toBe('');
    expect(localizedDropdownName({ id: 3 } as Dropdown, 'en')).toBe('');
    expect(localizedDropdownName({ id: 3 } as Dropdown, 'th')).toBe('');
  });

  it('returns empty string for a null/undefined option', () => {
    expect(localizedDropdownName(null, 'zh')).toBe('');
    expect(localizedDropdownName(undefined, 'th')).toBe('');
  });
});
