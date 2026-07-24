import { of } from 'rxjs';
import { RouteMapService } from './route-map.service';

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
});
