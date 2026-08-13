import { BehaviorSubject } from 'rxjs';
import { NotificationMessageListPageComponent } from './notification-message-list-page.component';

function makeStoreStub() {
  const data$ = new BehaviorSubject<any>(null);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeRouterStub() {
  return { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };
}

describe('NotificationMessageListPageComponent', () => {
  it('refreshes the store on init', () => {
    const store = makeStoreStub();
    const component = new NotificationMessageListPageComponent(store as any, makeRouterStub() as any);
    component.ngOnInit();
    expect(store.refresh).toHaveBeenCalled();
  });

  it('honors a null data$ emission as an empty array, not stale rows', () => {
    const store = makeStoreStub();
    const component = new NotificationMessageListPageComponent(store as any, makeRouterStub() as any);
    component.ngOnInit();

    store.data$.next([{ messageCode: 'x' }]);
    expect(component['keys']).toEqual([{ messageCode: 'x' } as any]);

    store.data$.next(null);
    expect(component['keys']).toEqual([]);
  });

  it('navigates to the edit route with the code and locale on editKey', () => {
    const store = makeStoreStub();
    const router = makeRouterStub();
    const component = new NotificationMessageListPageComponent(store as any, router as any);

    component['onEditKey']({ code: 'notification.sms.payment.confirmed', locale: 'th' });

    expect(router.navigate).toHaveBeenCalledWith([
      '/admin/settings/notification-messages/edit',
      'notification.sms.payment.confirmed',
      'th',
    ]);
  });
});
