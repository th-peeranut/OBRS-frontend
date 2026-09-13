import { ActivatedRouteSnapshot } from '@angular/router';
import { isRestrictedRoute } from './analytics-route-scope';

/**
 * Snapshot-shaped double: the predicate reads only `data` and the child links, so a plain
 * object with those fields is enough and keeps the spec free of a router harness.
 */
function node(
  data: Record<string, unknown> | undefined,
  children: ActivatedRouteSnapshot[] = []
): ActivatedRouteSnapshot {
  return {
    data,
    children,
    firstChild: children[0] ?? null,
  } as unknown as ActivatedRouteSnapshot;
}

describe('isRestrictedRoute', () => {
  it('is false for an empty or customer tree', () => {
    expect(isRestrictedRoute(null)).toBeFalse();
    expect(isRestrictedRoute(node({ customerArea: true }, [node({})]))).toBeFalse();
  });

  it('is true when any node declares requiredRoles (staff shells)', () => {
    expect(isRestrictedRoute(node({}, [node({ requiredRoles: ['admin'] })]))).toBeTrue();
  });

  it('ignores an empty requiredRoles list', () => {
    expect(isRestrictedRoute(node({ requiredRoles: [] }))).toBeFalse();
  });

  describe('security review 2026-09 (FE-2): analyticsRestricted', () => {
    it('is true for a route that opts out because its URL carries a one-time token', () => {
      expect(isRestrictedRoute(node({}, [node({ analyticsRestricted: true })]))).toBeTrue();
    });

    it('only an explicit true counts', () => {
      expect(isRestrictedRoute(node({ analyticsRestricted: false }))).toBeFalse();
      expect(isRestrictedRoute(node({ analyticsRestricted: 'yes' }))).toBeFalse();
    });

    it('does not read the flag off the prototype', () => {
      const data = Object.create({ analyticsRestricted: true }) as Record<string, unknown>;
      expect(isRestrictedRoute(node(data))).toBeFalse();
    });
  });
});
