import { DropdownObrsComponent } from './dropdown-obrs.component';
import { TITLE_OPTIONS } from '../../constants/title-options';
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

  /**
   * OBRS-1231. The owner's decision was "a title is never required", and the obvious
   * reading of that is `Validators.required`. That was not the thing asserting a title:
   * `ngOnChanges` finds an `isDefault` option and calls `onChange()` with it, so the
   * dropdown itself wrote 'นาย' into the control of every register / passenger-info form
   * before the traveller touched anything. Dropping the validator alone would have left
   * that untouched, and the fix would have looked done while changing nothing.
   *
   * Both halves are asserted deliberately. A test that only proved "TITLE_OPTIONS writes
   * nothing" would still pass if the isDefault branch were deleted outright - which would
   * silently change the trip-type toggle and every other dropdown that DOES want one.
   */
  describe('OBRS-1231 - the isDefault write-through', () => {
    function componentWith(options: unknown[]): {
      dropdown: DropdownObrsComponent;
      written: unknown[];
    } {
      const dropdown = new DropdownObrsComponent(
        {} as never,
        createElementRefStub(),
        createTranslateStub()
      );
      const written: unknown[] = [];
      dropdown.registerOnChange(((value: unknown) => written.push(value)) as never);
      dropdown.options = options;
      return { dropdown, written };
    }

    it('writes nothing into the control for TITLE_OPTIONS - no title is a valid answer', () => {
      const { dropdown, written } = componentWith(TITLE_OPTIONS);

      dropdown.ngOnChanges({} as never);

      expect(written).toEqual([]);
      expect(dropdown.selectedValue).toBeFalsy();
    });

    it('still writes the default through for an option list that declares one', () => {
      const withDefault = [
        { id: 1, nameThai: 'ก', nameEnglish: 'A' },
        { id: 2, nameThai: 'ข', nameEnglish: 'B', isDefault: true },
      ];

      const { dropdown, written } = componentWith(withDefault);

      dropdown.ngOnChanges({} as never);

      expect(written).toEqual([withDefault[1]]);
    });
  });
});
