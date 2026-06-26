import { of } from 'rxjs';

import {
  APP_LANGUAGE_KEY,
  DEFAULT_LANGUAGE,
  LanguageService,
} from './language.service';

describe('LanguageService', () => {
  let translate: any;
  let primeng: any;
  let service: LanguageService;

  beforeEach(() => {
    translate = {
      use: jasmine.createSpy('use'),
      get: jasmine.createSpy('get').and.returnValue(of({ dayNames: [] })),
    };
    primeng = { setTranslation: jasmine.createSpy('setTranslation') };
    service = new LanguageService(translate, primeng);
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
});
