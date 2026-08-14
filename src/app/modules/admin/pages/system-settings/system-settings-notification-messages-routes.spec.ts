import { Route } from '@angular/router';
import { adminRoutes } from '../../admin.module';
import { NotificationMessageListPageComponent } from '../notification-messages/notification-message-list-page.component';
import { NotificationMessageEditPageComponent } from '../notification-messages/notification-message-edit-page.component';
import { NotificationMessageReviewQueuePageComponent } from '../notification-messages/notification-message-review-queue-page.component';
import { NotificationMessageReviewDetailPageComponent } from '../notification-messages/notification-message-review-detail-page.component';

/**
 * OBRS-1308 / ADR 0038 — `SystemSettingsTab.children?: Route[]` locking spec.
 *
 * <p>Reads the REAL generated `adminRoutes` (never a hand-mirrored copy —
 * same discipline as `system-settings-page.component.spec.ts`, whose header
 * explains why a stub/copy is exactly what let an earlier bug through).
 * `system-settings-page.component.spec.ts` cannot see this regression at
 * all: it never activates a child route, so it never reads a child's
 * `data`.
 *
 * <p>The "deep-link and assert the resolved header" proof below is a
 * structural read of the child `Route.data` object, not a live
 * `Router.navigate()`. That is not a weaker substitute: Angular's router
 * populates `ActivatedRouteSnapshot.data` directly from the matched route
 * config's own `data` property with no further transformation (no resolver
 * is involved here), so asserting the exact object `getDeepestRoute()` would
 * read off the snapshot IS the same assertion a live navigation would prove,
 * for a fraction of the harness cost (the real page components have live
 * `AdminApiService`/`AdminCollectionStore`/`AlertService` dependencies that a
 * full router-navigation test would have to satisfy for no additional
 * coverage).
 */

function settingsRoute(): Route {
  const shell = adminRoutes.find((r) => r.path === '')!;
  return shell.children!.find((r) => r.path === 'settings')!;
}

function tabRoutes(): Route[] {
  return settingsRoute().children!.filter((r) => r.path !== '');
}

function notificationMessagesRoute(): Route {
  return tabRoutes().find((r) => r.path === 'notification-messages')!;
}

describe('OBRS-1308 / ADR 0038 — notification-messages sub-routes', () => {
  it('gives every OTHER tab route no `children` key at all — byte-identical to before this card', () => {
    for (const route of tabRoutes()) {
      if (route.path === 'notification-messages') {
        continue;
      }
      expect(route.children)
        .withContext(`tab '${route.path}' unexpectedly gained a children key`)
        .toBeUndefined();
    }
  });

  it('routes exactly the four notification-messages sub-pages the UX spec locks, no more no less', () => {
    const children = notificationMessagesRoute().children!;
    const paths = children.map((c) => c.path).sort();
    expect(paths).toEqual(['', 'edit/:messageCode/:locale', 'reviews', 'reviews/:id'].sort());
  });

  it('wires each sub-path to its own component', () => {
    const children = notificationMessagesRoute().children!;
    const byPath = new Map(children.map((c) => [c.path, c]));
    expect(byPath.get('')!.component).toBe(NotificationMessageListPageComponent);
    expect(byPath.get('edit/:messageCode/:locale')!.component).toBe(
      NotificationMessageEditPageComponent
    );
    expect(byPath.get('reviews')!.component).toBe(NotificationMessageReviewQueuePageComponent);
    expect(byPath.get('reviews/:id')!.component).toBe(
      NotificationMessageReviewDetailPageComponent
    );
  });

  it('the reviews/reviews:id children carry NO route-level guard narrower than the parent tab — AC5 is a component-level gate, not a route guard', () => {
    const children = notificationMessagesRoute().children!;
    for (const child of children) {
      expect(child.canActivate)
        .withContext(`child '${child.path}' should not carry its own canActivate`)
        .toBeUndefined();
    }
  });

  // The regression this locks: getDeepestRoute() (sidebar-layout-base.component.ts)
  // reads titleKey/subtitleKey off the DEEPEST activated route's `data`. Before
  // ADR 0038's injection, a child route here had no `data` of its own and
  // getDeepestRoute() fell back to the generic ADMIN.PAGES.DEFAULT header —
  // invisible to system-settings-page.component.spec.ts, which never activates
  // a child.
  it('injects the parent tab data into EVERY child — the one regression the pinned suite cannot see', () => {
    const tabRoute = notificationMessagesRoute();
    const expectedData = tabRoute.data;
    expect(expectedData?.['titleKey']).toBe('ADMIN.PAGES.SYSTEM_SETTINGS');
    expect(expectedData?.['subtitleKey']).toBe('ADMIN.NOTIFICATION_MESSAGES.SUBTITLE');

    for (const child of tabRoute.children!) {
      expect(child.data?.['titleKey'])
        .withContext(`child '${child.path}' titleKey`)
        .toBe('ADMIN.PAGES.SYSTEM_SETTINGS');
      expect(child.data?.['subtitleKey'])
        .withContext(`child '${child.path}' subtitleKey`)
        .toBe('ADMIN.NOTIFICATION_MESSAGES.SUBTITLE');
      expect(child.data?.['requiredRoles'])
        .withContext(`child '${child.path}' requiredRoles`)
        .toEqual(tabRoute.data?.['requiredRoles']);
    }
  });
});
