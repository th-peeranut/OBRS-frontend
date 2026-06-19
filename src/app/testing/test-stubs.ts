import { of, Subject } from 'rxjs';

// Lightweight dependency stubs for component "should create" smoke tests.
// Components here are instantiated directly (no TestBed/template render), so the
// stubs only need to satisfy the work done in constructors — store selection,
// language switching, navigation. Returned as `any` so callers can pass them to
// typed constructor params without per-call casts.

/** NgRx Store: `pipe`/`select` yield an inert stream; `dispatch` is a no-op. */
export function createStoreStub(): any {
  return {
    pipe: () => of(null),
    select: () => of(null),
    dispatch: () => {},
  };
}

/** Angular Router: navigation resolves; `events` is an inert stream. */
export function createRouterStub(): any {
  return {
    navigate: () => Promise.resolve(true),
    navigateByUrl: () => Promise.resolve(true),
    events: of(),
  };
}

/** ngx-translate TranslateService: lang accessors plus inert change streams. */
export function createTranslateStub(): any {
  return {
    currentLang: 'en',
    defaultLang: 'en',
    onLangChange: new Subject(),
    onTranslationChange: new Subject(),
    onDefaultLangChange: new Subject(),
    addLangs: () => {},
    use: () => of({}),
    get: () => of({}),
    stream: () => of(''),
    instant: (key: string) => key,
    setDefaultLang: () => {},
  };
}

/** PrimeNG global config: only `setTranslation` is exercised on construction. */
export function createPrimeNgConfigStub(): any {
  return { setTranslation: () => {} };
}

/** ElementRef backed by a detached DOM node. */
export function createElementRefStub(): any {
  return { nativeElement: document.createElement('div') };
}
