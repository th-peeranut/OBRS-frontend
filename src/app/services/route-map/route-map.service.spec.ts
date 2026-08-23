import { of, throwError } from 'rxjs';
import { RouteMapService } from './route-map.service';
import { APP_LANGUAGE_KEY } from '../../shared/services/language.service';

function createHttpStub(responseData: unknown): any {
  return {
    get: () => of(responseData),
    post: () => of(responseData),
  };
}

describe('RouteMapService', () => {
  it('should create', () => {
    const service = new RouteMapService(createHttpStub({}));
    expect(service).toBeTruthy();
  });

  it('getPickupDropoff returns the response', (done) => {
    const mockResponse = { status: 'success', message: 'ok', data: {} };
    const service = new RouteMapService(createHttpStub(mockResponse));
    service.getPickupDropoff('test-slug').subscribe((res) => {
      expect(res).toEqual(mockResponse as any);
      done();
    });
  });

  it('getFirstActiveRouteSlug finds the first active route', (done) => {
    const mockResponse = {
      status: 'success',
      message: 'ok',
      data: [
        { slug: 'inactive-route', status: 'inactive' },
        { slug: 'active-route', status: 'active' },
      ],
    };
    const service = new RouteMapService(createHttpStub(mockResponse));
    service.getFirstActiveRouteSlug().subscribe((slug) => {
      expect(slug).toBe('active-route');
      done();
    });
  });

  it('getFirstActiveRouteSlug handles object status with code field', (done) => {
    const mockResponse = {
      status: 'success',
      message: 'ok',
      data: [{ slug: 'route-1', status: { code: 'ACTIVE' } }],
    };
    const service = new RouteMapService(createHttpStub(mockResponse));
    service.getFirstActiveRouteSlug().subscribe((slug) => {
      expect(slug).toBe('route-1');
      done();
    });
  });

  it('getFirstActiveRouteSlug returns null when no active routes', (done) => {
    const mockResponse = {
      status: 'success',
      message: 'ok',
      data: [{ slug: 'route-1', status: 'inactive' }],
    };
    const service = new RouteMapService(createHttpStub(mockResponse));
    service.getFirstActiveRouteSlug().subscribe((slug) => {
      expect(slug).toBeNull();
      done();
    });
  });

  it('getActiveRoutes excludes leaked E2E test routes even when active', (done) => {
    const mockResponse = {
      status: 'success',
      message: 'ok',
      data: [
        { slug: 'chonburi_bangkok', status: 'active' },
        { slug: 'TEST-e2e-schedules-route', status: 'active' },
        { slug: 'bangkok_chonburi', status: 'active' },
      ],
    };
    const service = new RouteMapService(createHttpStub(mockResponse));
    service.getActiveRoutes().subscribe((routes) => {
      expect(routes.map((r) => r.slug)).toEqual([
        'chonburi_bangkok',
        'bangkok_chonburi',
      ]);
      done();
    });
  });

  // OBRS-617: the guard was narrowed from /(^test[-_])|e2e/i to /^TEST-/. It must still
  // hide the ADR TEST- fixtures, but must NOT hide a real route merely because its slug
  // contains the substring "e2e" or starts with a lowercase "test".
  it('getActiveRoutes hides only ^TEST- slugs, not real slugs containing "e2e"', (done) => {
    const mockResponse = {
      status: 'success',
      message: 'ok',
      data: [
        { slug: 'chonburi_bangkok', status: 'active' },
        { slug: 'TEST-e2e-schedules-route', status: 'active' }, // fixture — hidden
        { slug: 'e2e-riverside', status: 'active' }, // real route, substring only — shown
        { slug: 'test_market', status: 'active' }, // lowercase, not the TEST- prefix — shown
      ],
    };
    const service = new RouteMapService(createHttpStub(mockResponse));
    service.getActiveRoutes().subscribe((routes) => {
      expect(routes.map((r) => r.slug)).toEqual([
        'chonburi_bangkok',
        'e2e-riverside',
        'test_market',
      ]);
      done();
    });
  });

  // OBRS-1213 moved the dedup DOWN, from `getPickupDropoffCached`'s mapped
  // result to the raw GET, because /home now has two independent consumers of
  // the same route data: the map (which needs the error to propagate so its
  // retry button means something) and the booking form's origin/destination
  // filter (which degrades to null).
  describe('one GET per URL, replayed (OBRS-1213)', () => {
    /** Counts calls and lets the test decide what each one answers. */
    function createCountingHttpStub(answers: () => any): any {
      const stub: any = {
        calls: [] as string[],
        get: (url: string) => {
          stub.calls.push(url);
          return answers();
        },
      };
      return stub;
    }

    it('issues ONE request no matter how many callers ask for the same route', () => {
      const http = createCountingHttpStub(() => of({ data: { pickup: [], dropoff: [] } }));
      const service = new RouteMapService(http);

      service.getPickupDropoff('corridor').subscribe();
      service.getPickupDropoffCached('corridor').subscribe();
      service.getPickupDropoffCached('corridor').subscribe();

      expect(http.calls.length).toBe(1);
    });

    it('still issues one request PER route — the dedup keys on the URL, not the endpoint', () => {
      const http = createCountingHttpStub(() => of({ data: { pickup: [], dropoff: [] } }));
      const service = new RouteMapService(http);

      service.getPickupDropoffCached('outbound').subscribe();
      service.getPickupDropoffCached('inbound').subscribe();

      expect(http.calls.length).toBe(2);
    });

    it('replays the response to a caller that subscribes after the first one finished', (done) => {
      const http = createCountingHttpStub(() => of({ data: { pickup: [], dropoff: [] } }));
      const service = new RouteMapService(http);

      service.getPickupDropoffCached('corridor').subscribe();
      service.getPickupDropoffCached('corridor').subscribe((data) => {
        expect(data).toEqual({ pickup: [], dropoff: [] } as any);
        expect(http.calls.length).toBe(1);
        done();
      });
    });

    it('dedupes /api/routes too, so the map and the booking form share one call', () => {
      const http = createCountingHttpStub(() => of({ data: [] }));
      const service = new RouteMapService(http);

      service.getActiveRoutes().subscribe();
      service.getActiveRoutes().subscribe();
      service.getFirstActiveRouteSlug().subscribe();

      expect(http.calls.length).toBe(1);
    });

    // This is the reason `shared()` is hand-written instead of a bare
    // `shareReplay`: shareReplay caches the ERROR notification too, so without
    // the eviction the map's retry button would re-subscribe to a dead
    // observable and "fail" forever with no request leaving the browser.
    it('a FAILED request is not cached — the next caller really refetches', () => {
      let shouldFail = true;
      const http = createCountingHttpStub(() =>
        shouldFail
          ? throwError(() => new Error('network down'))
          : of({ data: { pickup: [], dropoff: [] } })
      );
      const service = new RouteMapService(http);

      let firstError: unknown = null;
      service.getPickupDropoff('corridor').subscribe({ error: (e) => (firstError = e) });
      expect(firstError).toBeTruthy();
      expect(http.calls.length).toBe(1);

      shouldFail = false;
      let recovered: unknown = null;
      service.getPickupDropoff('corridor').subscribe((res) => (recovered = res));

      expect(http.calls.length).toBe(2);
      expect(recovered).toBeTruthy();
    });

    // OBRS-929 AC-2. The payload is localized by the BACKEND from Accept-Language, which
    // authInterceptor sets from this very localStorage key — so a cache keyed on the URL alone
    // replays the first language's stop names and addresses for the rest of the page, and the
    // language switch on /home looks broken no matter what the component does.
    describe('language-scoped cache (OBRS-929)', () => {
      const original = localStorage.getItem(APP_LANGUAGE_KEY);

      afterEach(() => {
        if (original === null) {
          localStorage.removeItem(APP_LANGUAGE_KEY);
        } else {
          localStorage.setItem(APP_LANGUAGE_KEY, original);
        }
      });

      function localizedHttpStub(): any {
        return createCountingHttpStub(() =>
          of({
            data: {
              pickup: [
                {
                  slug: 'nong_chak',
                  name:
                    localStorage.getItem(APP_LANGUAGE_KEY) === 'en'
                      ? 'Nong Chak'
                      : 'หนองชาก',
                },
              ],
              dropoff: [],
            },
          })
        );
      }

      it('asking in a second language refetches and returns THAT language payload', () => {
        const http = localizedHttpStub();
        const service = new RouteMapService(http);

        localStorage.setItem(APP_LANGUAGE_KEY, 'th');
        let th: any = null;
        service.getPickupDropoffCached('corridor').subscribe((d) => (th = d));

        localStorage.setItem(APP_LANGUAGE_KEY, 'en');
        let en: any = null;
        service.getPickupDropoffCached('corridor').subscribe((d) => (en = d));

        expect(http.calls.length).toBe(2);
        expect(th.pickup[0].name).toBe('หนองชาก');
        expect(en.pickup[0].name).toBe('Nong Chak');
      });

      it('still dedupes WITHIN one language', () => {
        const http = localizedHttpStub();
        const service = new RouteMapService(http);

        localStorage.setItem(APP_LANGUAGE_KEY, 'en');
        service.getPickupDropoff('corridor').subscribe();
        service.getPickupDropoffCached('corridor').subscribe();

        expect(http.calls.length).toBe(1);
      });

      // /api/routes ships every language in one payload, so scoping its key would buy nothing
      // and cost the map + booking form their shared call.
      it('leaves /api/routes deduped across a language switch', () => {
        const http = createCountingHttpStub(() => of({ data: [] }));
        const service = new RouteMapService(http);

        localStorage.setItem(APP_LANGUAGE_KEY, 'th');
        service.getActiveRoutes().subscribe();
        localStorage.setItem(APP_LANGUAGE_KEY, 'en');
        service.getActiveRoutes().subscribe();

        expect(http.calls.length).toBe(1);
      });
    });

    it('propagates the failure to the raw caller; only the cached variant swallows it', () => {
      const http = createCountingHttpStub(() => throwError(() => new Error('network down')));
      const service = new RouteMapService(http);

      let raised = false;
      service.getPickupDropoff('corridor').subscribe({ error: () => (raised = true) });
      expect(raised).toBeTrue();

      let swallowed: unknown = 'untouched';
      service.getPickupDropoffCached('corridor').subscribe((data) => (swallowed = data));
      expect(swallowed).toBeNull();
    });
  });
});
