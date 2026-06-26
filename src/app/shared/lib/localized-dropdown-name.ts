import { Dropdown } from '../interfaces/dropdown.interface';

/**
 * Resolve the label of a name-based dropdown option (e.g. TITLE_OPTIONS) for the
 * active language: Thai → nameThai, Chinese → nameChinese (falling back to
 * nameEnglish when no Chinese label exists), anything else → nameEnglish.
 *
 * Returns '' when the option carries no name* fields, so callers that also
 * support translation-backed options (stations, lookups) can fall through to
 * their existing resolution path unchanged.
 */
export function localizedDropdownName(
  option: Partial<Dropdown> | null | undefined,
  currentLang: string | null | undefined
): string {
  if (!option) return '';
  switch (currentLang) {
    case 'th':
      return option.nameThai ?? '';
    case 'zh':
      return option.nameChinese || option.nameEnglish || '';
    default:
      return option.nameEnglish ?? '';
  }
}
