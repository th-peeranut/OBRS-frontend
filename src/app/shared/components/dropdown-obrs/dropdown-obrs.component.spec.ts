import { DropdownObrsComponent } from './dropdown-obrs.component';
import {
  createElementRefStub,
  createTranslateStub,
} from '../../../testing/test-stubs';

describe('DropdownObrsComponent', () => {
  let component: DropdownObrsComponent;

  beforeEach(() => {
    component = new DropdownObrsComponent(
      {} as never,
      createElementRefStub(),
      createTranslateStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('getValue localization', () => {
    function withLang(lang: string): DropdownObrsComponent {
      const translate = createTranslateStub();
      translate.currentLang = lang;
      return new DropdownObrsComponent({} as never, createElementRefStub(), translate);
    }

    const title = { id: 1, nameThai: 'นาย', nameEnglish: 'Mr.', nameChinese: '先生' };

    it('returns the Chinese name-based label under zh', () => {
      expect(withLang('zh').getValue(title)).toBe('先生');
    });

    it('returns Thai under th and English under en', () => {
      expect(withLang('th').getValue(title)).toBe('นาย');
      expect(withLang('en').getValue(title)).toBe('Mr.');
    });

    it('falls back to English under zh when a name option has no Chinese label', () => {
      expect(withLang('zh').getValue({ id: 2, nameThai: 'นาง', nameEnglish: 'Mrs.' })).toBe('Mrs.');
    });

    it('leaves translation-backed (station/lookup) options unchanged under zh — falls through to the en translation', () => {
      // No name* fields → helper returns '' → existing translations path runs.
      // zh still collapses to 'en' for the translations lookup (pre-existing behavior).
      const station = {
        id: 9,
        translations: [
          { locale: 'en', label: 'Mochit' },
          { locale: 'th', label: 'หมอชิต' },
        ],
      };
      expect(withLang('zh').getValue(station)).toBe('Mochit');
    });
  });
});
