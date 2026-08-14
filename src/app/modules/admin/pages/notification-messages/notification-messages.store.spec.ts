import { of } from 'rxjs';
import { NotificationMessagesStore, NotificationMessageReviewQueueStore } from './notification-messages.store';

function createAuthServiceStub(): any {
  return { authStatus$: of(true) };
}

describe('NotificationMessagesStore', () => {
  it('fetches the owner message-key list', async () => {
    const keys = [{ messageCode: 'notification.sms.payment.confirmed' }];
    const adminApi: any = {
      getNotificationMessages: jasmine
        .createSpy('getNotificationMessages')
        .and.returnValue(of({ code: 200, message: 'OK', data: keys })),
    };
    const store = new NotificationMessagesStore(adminApi, createAuthServiceStub());

    await store.refresh();

    expect(store.value).toEqual(keys as any);
  });

  it('defaults to an empty array when the response has no data', async () => {
    const adminApi: any = {
      getNotificationMessages: jasmine
        .createSpy('getNotificationMessages')
        .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    };
    const store = new NotificationMessagesStore(adminApi, createAuthServiceStub());

    await store.refresh();

    expect(store.value).toEqual([]);
  });
});

describe('NotificationMessageReviewQueueStore', () => {
  it('fetches the admin pending-review queue', async () => {
    const rows = [{ id: 1, messageCode: 'x', notificationType: 'Y', locale: 'th', proposedBy: 'owner', proposedAt: '2026-08-13T00:00:00Z' }];
    const adminApi: any = {
      getNotificationMessageReviewsPending: jasmine
        .createSpy('getNotificationMessageReviewsPending')
        .and.returnValue(of({ code: 200, message: 'OK', data: rows })),
    };
    const store = new NotificationMessageReviewQueueStore(adminApi, createAuthServiceStub());

    await store.refresh();

    expect(store.value).toEqual(rows as any);
  });

  it('defaults to an empty array when the response has no data', async () => {
    const adminApi: any = {
      getNotificationMessageReviewsPending: jasmine
        .createSpy('getNotificationMessageReviewsPending')
        .and.returnValue(of({ code: 200, message: 'OK', data: null })),
    };
    const store = new NotificationMessageReviewQueueStore(adminApi, createAuthServiceStub());

    await store.refresh();

    expect(store.value).toEqual([]);
  });
});
