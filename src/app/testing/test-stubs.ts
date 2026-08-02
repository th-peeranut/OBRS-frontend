import { BehaviorSubject, of, Subject } from 'rxjs';

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

/** LanguageService: `switch` resolves; `getStoredLanguage` returns a default. */
export function createLanguageServiceStub(): any {
  return {
    switch: () => Promise.resolve(),
    getStoredLanguage: () => 'th',
  };
}

/** ElementRef backed by a detached DOM node. */
export function createElementRefStub(): any {
  return { nativeElement: document.createElement('div') };
}

/** RouteMapService: `getPickupDropoffCached` resolves to an inert `null` (no data yet). */
export function createRouteMapServiceStub(): any {
  return {
    getPickupDropoff: () => of(null),
    getActiveRoutes: () => of([]),
    getFirstActiveRouteSlug: () => of(null),
    getPickupDropoffCached: () => of(null),
  };
}

/** ScheduleService: `getSeatMap` resolves to an empty seat list (no fetch
 *  side-effects for a bare-instantiation "should create" smoke test). */
export function createScheduleServiceStub(): any {
  return {
    getByFilter: () => of({ data: null }),
    getSeatMap: () => of({ data: [] }),
  };
}

/** AuthService: `authStatus$` is a real BehaviorSubject so a test can `.next()`
 *  auth-state transitions; defaults anonymous (false).
 *
 *  OBRS-667: `hasAnyRole` is an optional 2nd param, default `false`, so every
 *  existing single-arg call site (`createAuthServiceStub(true)`) stays
 *  byte-identical. Pass `true` for an owner/admin-equivalent stub, `false`
 *  for salesperson/driver, or a predicate `(roles) => boolean` for a case
 *  that cares which roles were asked for. */
export function createAuthServiceStub(
  isAuthenticated = false,
  hasAnyRole: boolean | ((roles: string[]) => boolean) = false
): any {
  return {
    authStatus$: new BehaviorSubject<boolean>(isAuthenticated),
    isAuthenticated: () => isAuthenticated,
    hasAnyRole: jasmine.createSpy('hasAnyRole').and.callFake(
      typeof hasAnyRole === 'function' ? hasAnyRole : () => hasAnyRole
    ),
  };
}

/** BookingService: `getMyBookings` resolves to an empty page (no bookings) —
 *  no fetch side-effects for a bare-instantiation "should create" smoke test. */
export function createBookingServiceStub(): any {
  return {
    getMyBookings: () => of({ data: { content: [] } }),
  };
}

/**
 * AnalyticsService (OBRS-867): `track` records nothing and sends nothing.
 *
 * A stub is the right call for these smoke tests specifically: the real service
 * would be inert here anyway (no consent is granted in a bare instantiation),
 * so a stub swaps one no-op for another while keeping the tests free of a
 * localStorage dependency. The behaviour it stands in for is asserted
 * first-hand in analytics.service.spec.ts and analytics.effect.spec.ts — do
 * NOT let this stub become the only place the funnel is "tested".
 */
export function createAnalyticsServiceStub(): any {
  return {
    init: () => {},
    destroy: () => {},
    track: () => {},
  };
}
