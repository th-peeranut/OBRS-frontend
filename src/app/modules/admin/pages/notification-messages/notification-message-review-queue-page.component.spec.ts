import { BehaviorSubject } from 'rxjs';
import { NotificationMessageReviewQueuePageComponent } from './notification-message-review-queue-page.component';

function makeStoreStub() {
  const data$ = new BehaviorSubject<any>(null);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

/**
 * Deliberately NOT stubbing `hasAnyRole` here — the whole point of this test
 * is to pin that the component asks `getRoles()`, never `hasAnyRole()`. A
 * `hasAnyRole` spy would make a wrong implementation (one that regressed to
 * calling it) invisible, exactly the trap
 * `system-settings-page.component.spec.ts`'s header describes for a
 * hand-written `hasAnyRole` re-implementation. `getRoles()` itself is a
 * trivial passthrough (no `ROLE_GRANTS` expansion lives there — see
 * `auth.service.ts:287-305`), so stubbing IT directly hides nothing subtle.
 */
function makeAuthStub(roles: string[]) {
  return {
    getRoles: jasmine.createSpy('getRoles').and.returnValue(roles),
    hasAnyRole: jasmine.createSpy('hasAnyRole (must never be called by this component)'),
  };
}

function makeRouterStub() {
  return { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };
}

function makeComponent(roles: string[], store = makeStoreStub()) {
  const auth = makeAuthStub(roles);
  const router = makeRouterStub();
  const component = new NotificationMessageReviewQueuePageComponent(
    auth as any,
    store as any,
    router as any
  );
  return { component, auth, store, router };
}

/**
 * OBRS-1308 AC5 — the frontend half. Verified in the worktree (Scrutinize):
 * `getRoles()` returns the raw stored roles, un-expanded; `hasAnyRole()`'s
 * `ROLE_GRANTS` expansion is symmetric (owner grants admin), so it would
 * admit a plain owner too. The gate under test is the FIRST LINE of
 * `ngOnInit` and must fire ZERO network requests (no store refresh) for a
 * denied session.
 */
describe('NotificationMessageReviewQueuePageComponent (AC5)', () => {
  it('denies a plain owner — access-denied, ZERO store/network call, getRoles asked (never hasAnyRole)', () => {
    const { component, auth, store } = makeComponent(['owner']);

    component.ngOnInit();

    expect(component['accessDenied']).toBeTrue();
    expect(auth.getRoles).toHaveBeenCalled();
    expect(auth.hasAnyRole).not.toHaveBeenCalled();
    expect(store.refresh).not.toHaveBeenCalled();
  });

  it('denies a customer/salesperson session the same way', () => {
    const { component, store } = makeComponent(['customer']);
    component.ngOnInit();
    expect(component['accessDenied']).toBeTrue();
    expect(store.refresh).not.toHaveBeenCalled();
  });

  it('denies a session with NO roles at all', () => {
    const { component, store } = makeComponent([]);
    component.ngOnInit();
    expect(component['accessDenied']).toBeTrue();
    expect(store.refresh).not.toHaveBeenCalled();
  });

  it('admits an admin session — refreshes the queue store', () => {
    const { component, store } = makeComponent(['admin']);
    component.ngOnInit();
    expect(component['accessDenied']).toBeFalse();
    expect(store.refresh).toHaveBeenCalled();
  });

  it('admits an admin+owner dual-role session (raw array includes admin)', () => {
    const { component, store } = makeComponent(['admin', 'owner']);
    component.ngOnInit();
    expect(component['accessDenied']).toBeFalse();
    expect(store.refresh).toHaveBeenCalled();
  });

  it('subscribes to store.data$/refreshing$ once admitted, honoring a null emission as empty (not stale rows)', () => {
    const { component, store } = makeComponent(['admin']);
    component.ngOnInit();

    store.data$.next([{ id: 1 }]);
    expect(component['rows']).toEqual([{ id: 1 } as any]);

    store.data$.next(null);
    expect(component['rows']).toEqual([]);
  });

  it('navigates to the review detail route when a row requests open', () => {
    const { component, router } = makeComponent(['admin']);
    component.ngOnInit();

    component['onOpenReview'](55);

    expect(router.navigate).toHaveBeenCalledWith(['/admin/settings/notification-messages/reviews', 55]);
  });
});
