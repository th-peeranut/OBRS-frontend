import { of } from 'rxjs';

import {
  APP_LANGUAGE_KEY,
  DEFAULT_LANGUAGE,
  LanguageService,
  withShortDayName,
} from './language.service';

/** The `CALENDAR.dateFormat` each shipped locale actually declares, read out of
 *  `public/i18n/*.json` — NOT invented here. If one of those files changes, this
 *  table is what makes the spec notice. */
const SHIPPED_DATE_FORMATS: ReadonlyArray<[string, string, string]> = [
  ['th', 'dd/mm/yy', 'D, dd/mm/yy'],
  ['en', 'mm/dd/yy', 'D, mm/dd/yy'],
  ['zh', 'yy/mm/dd', 'D, yy/mm/dd'],
];

/** The `COMMON.APP_TITLE` each shipped locale declares, read out of
 *  `public/i18n/*.json` — NOT invented here, same rule as the table above. */
const SHIPPED_APP_TITLES: ReadonlyArray<[string, string]> = [
  ['th', 'จองตั๋วออนไลน์ คิวรถ NJ ผู้ใหญ่ปู'],
  ['en', 'Book bus tickets online | NJ Phuyaipu'],
  ['zh', '在线预订巴士车票 | NJ Phuyaipu'],
];

describe('LanguageService', () => {
  let translate: any;
  let primeng: any;
  let title: any;
  let service: LanguageService;

  beforeEach(() => {
    translate = {
      use: jasmine.createSpy('use'),
      get: jasmine.createSpy('get').and.returnValue(of({ dayNames: [] })),
    };
    primeng = { setTranslation: jasmine.createSpy('setTranslation') };
    title = { setTitle: jasmine.createSpy('setTitle') };
    service = new LanguageService(translate, primeng, title);
    localStorage.removeItem(APP_LANGUAGE_KEY);
  });

  it('persists the language and applies it to ngx-translate and PrimeNG', async () => {
    // Regression for #22: the persisted value is what the authInterceptor reads
    // for the Accept-Language header, so switching must always write it.
    await service.switch('en');

    expect(translate.use).toHaveBeenCalledWith('en');
    expect(localStorage.getItem(APP_LANGUAGE_KEY)).toBe('en');
    expect(primeng.setTranslation).toHaveBeenCalled();
  });

  it('persists the new language BEFORE calling translate.use', async () => {
    // `translate.use` emits onLangChange synchronously for an already-loaded
    // language; subscribers that re-fetch server-localized data build their
    // request inside that emission. The authInterceptor reads APP_LANGUAGE_KEY
    // for the Accept-Language header, so the new value must already be persisted
    // when `use` runs — otherwise the re-fetch goes out with the old locale.
    let langAtUseTime: string | null = 'NOT_SET';
    translate.use.and.callFake(() => {
      langAtUseTime = localStorage.getItem(APP_LANGUAGE_KEY);
    });

    await service.switch('th');

    expect(langAtUseTime).toBe('th');
  });

  it('getStoredLanguage returns the persisted value', () => {
    localStorage.setItem(APP_LANGUAGE_KEY, 'en');
    expect(service.getStoredLanguage()).toBe('en');
  });

  it('getStoredLanguage falls back to the default when nothing is stored', () => {
    expect(service.getStoredLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  // OBRS-1202 ------------------------------------------------------------
  describe('document language declaration', () => {
    const originalLang = document.documentElement.lang;

    afterEach(() => {
      document.documentElement.lang = originalLang;
    });

    ['th', 'en', 'zh'].forEach((lang) => {
      it(`sets <html lang="${lang}"> when switching to ${lang}`, async () => {
        document.documentElement.lang = 'xx';

        await service.switch(lang);

        expect(document.documentElement.lang).toBe(lang);
      });
    });

    it('declares the new language BEFORE translate.use runs', async () => {
      // Same reason the persistence above is ordered: `use()` emits
      // onLangChange synchronously for an already-loaded language, so anything
      // reacting to that emission must not read the previous declaration.
      document.documentElement.lang = 'xx';
      let langAtUseTime = 'NOT_SET';
      translate.use.and.callFake(() => {
        langAtUseTime = document.documentElement.lang;
      });

      await service.switch('en');

      expect(langAtUseTime).toBe('en');
    });

    it('re-declares on every switch, so a second language change cannot leave a stale value', async () => {
      // The bug this closes is not "the first render is wrong" — index.html
      // already ships DEFAULT_LANGUAGE (OBRS-1194). It is the visitor who
      // switches: from then on the declaration is only ever as true as this.
      await service.switch('en');
      await service.switch('zh');

      expect(document.documentElement.lang).toBe('zh');
    });
  });

  // OBRS-1700 ------------------------------------------------------------
  describe('browser tab title', () => {
    beforeEach(() => {
      // Key-aware, because this is the one block that cares WHICH key was
      // asked for: `switch()` reads CALENDAR and COMMON.APP_TITLE off the same
      // spy, and a single blanket return value cannot tell them apart.
      translate.get.and.callFake((key: string) =>
        of(
          key === 'COMMON.APP_TITLE'
            ? (SHIPPED_APP_TITLES.find(
                ([lang]) => lang === localStorage.getItem(APP_LANGUAGE_KEY)
              ) ?? [])[1]
            : { dayNames: [] }
        )
      );
    });

    SHIPPED_APP_TITLES.forEach(([lang, shipped]) => {
      it(`sets the tab title to the ${lang} string when switching to ${lang}`, async () => {
        await service.switch(lang);

        expect(title.setTitle).toHaveBeenCalledWith(shipped);
      });
    });

    it('re-titles on every switch, so a second language change cannot leave a stale tab', async () => {
      // index.html ships ONE hardcoded Thai <title> and nothing ever updated
      // it — that is the whole bug. From the first switch on, this is the only
      // thing keeping the tab on the language the visitor picked.
      await service.switch('en');
      await service.switch('zh');

      expect(title.setTitle).toHaveBeenCalledWith(SHIPPED_APP_TITLES[2][1]);
    });
  });

  // OBRS-1023 ------------------------------------------------------------
  describe('calendarDateFormat', () => {
    it('starts undefined so PrimeNG keeps its own dateFormat fallback', () => {
      // Not cosmetic: `getDateFormat()` is `this.dateFormat ||
      // getTranslation('dateFormat')`, so publishing a placeholder here would
      // SHADOW that fallback during the window before the i18n file lands —
      // exactly the bug this card is fixing, one layer down.
      expect(service.calendarDateFormat()).toBeUndefined();
    });

    SHIPPED_DATE_FORMATS.forEach(([lang, shipped, expected]) => {
      it(`publishes "${expected}" for ${lang}`, async () => {
        translate.get.and.returnValue(of({ dateFormat: shipped }));

        await service.switch(lang);

        expect(service.calendarDateFormat()).toBe(expected);
      });
    });

    it('publishes the format only AFTER the day names reach PrimeNG', async () => {
      // The format carries `D`, which `formatDate` resolves against
      // `dayNamesShort` from the PrimeNG config. If the signal were set first,
      // a re-render triggered by it would read the new format against the old
      // day names. Ordering is the whole guarantee, so assert the ordering.
      let formatWhenTranslationLanded: string | undefined = 'NOT_SET';
      primeng.setTranslation.and.callFake(() => {
        formatWhenTranslationLanded = service.calendarDateFormat();
      });
      translate.get.and.returnValue(of({ dateFormat: 'mm/dd/yy' }));

      await service.switch('en');

      expect(formatWhenTranslationLanded).toBeUndefined();
      expect(service.calendarDateFormat()).toBe('D, mm/dd/yy');
    });

    it('stays undefined when the locale ships no dateFormat', async () => {
      translate.get.and.returnValue(of({ dayNames: [] }));

      await service.switch('en');

      expect(service.calendarDateFormat()).toBeUndefined();
    });
  });

  describe('withShortDayName', () => {
    it('prefixes the short-day-name token', () => {
      expect(withShortDayName('dd/mm/yy')).toBe('D, dd/mm/yy');
    });

    it('is idempotent — a second switch to the same language cannot stack prefixes', () => {
      expect(withShortDayName('D, dd/mm/yy')).toBe('D, dd/mm/yy');
    });

    it('leaves a locale that places the day name itself alone', () => {
      expect(withShortDayName('yy/mm/dd D')).toBe('yy/mm/dd D');
    });

    it('returns undefined for a missing format rather than a bare "D, "', () => {
      // `'D, ' + undefined` would be the string "D, undefined", which PrimeNG
      // would happily render into the customer's input box.
      expect(withShortDayName(undefined)).toBeUndefined();
      expect(withShortDayName(null)).toBeUndefined();
      expect(withShortDayName('')).toBeUndefined();
    });
  });
});
