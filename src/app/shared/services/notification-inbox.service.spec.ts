import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { NotificationApiService } from '../../services/notifications/notification-api.service';
import { NotificationItem } from '../interfaces/notification.interface';
import { createTranslateStub } from '../../testing/test-stubs';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from './alert.service';
import { NOTIFICATION_UNREAD_POLL_MS, NotificationInboxService } from './notification-inbox.service';

function makeItem(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 1,
    message: 'Your booking is confirmed',
    notificationType: 'BOOKING_CONFIRMED',
    channel: 'IN_APP',
    status: 'SENT',
    bookingScheduleId: null,
    targetDate: null,
    sentAt: '2026-07-14T08:00:00+07:00',
    readAt: null,
    read: false,
    ...overrides,
  };
}

describe('NotificationInboxService', () => {
  let service: NotificationInboxService;
  let apiSpy: jasmine.SpyObj<NotificationApiService>;
  let alertSpy: jasmine.SpyObj<AlertService>;
  let authStatus$: Subject<boolean>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('NotificationApiService', [
      'getNotifications',
      'getUnreadCount',
      'markRead',
      'markAllRead',
    ]);
    apiSpy.getUnreadCount.and.returnValue(of({ code: 200, message: 'OK', data: { unreadCount: 0 } }));
    apiSpy.getNotifications.and.returnValue(
      of({ code: 200, message: 'OK', data: { content: [], totalElements: 0, totalPages: 0, size: 10, number: 0, numberOfElements: 0 } })
    );
    alertSpy = jasmine.createSpyObj('AlertService', ['error']);
    authStatus$ = new Subject<boolean>();

    TestBed.configureTestingModule({
      providers: [
        NotificationInboxService,
        { provide: NotificationApiService, useValue: apiSpy },
        { provide: AlertService, useValue: alertSpy },
        { provide: TranslateService, useValue: createTranslateStub() },
        { provide: AuthService, useValue: { authStatus$: authStatus$.asObservable() } },
      ],
    });

    service = TestBed.inject(NotificationInboxService);
  });

  it('startPolling() is idempotent — a second call does not re-trigger the initial list fetch', fakeAsync(() => {
    service.startPolling();
    service.startPolling();
    tick();
    discardPeriodicTasks();

    expect(apiSpy.getNotifications).toHaveBeenCalledTimes(1);
  }));

  it('startPolling() fetches the unread count on an interval matching NOTIFICATION_UNREAD_POLL_MS (60s)', fakeAsync(() => {
    service.startPolling();
    tick(); // dueTime 0
    expect(apiSpy.getUnreadCount).toHaveBeenCalledTimes(1);

    tick(NOTIFICATION_UNREAD_POLL_MS);
    expect(apiSpy.getUnreadCount).toHaveBeenCalledTimes(2);

    discardPeriodicTasks();
  }));

  it('swallows a background poll failure and keeps the last known unread count', fakeAsync(() => {
    let callCount = 0;
    apiSpy.getUnreadCount.and.callFake(() => {
      callCount++;
      return callCount === 1
        ? of({ code: 200, message: 'OK', data: { unreadCount: 4 } })
        : throwError(() => new Error('network error'));
    });

    service.startPolling();
    tick();
    expect(service['unreadCountSubject'].value).toBe(4);

    expect(() => tick(NOTIFICATION_UNREAD_POLL_MS)).not.toThrow();
    expect(service['unreadCountSubject'].value)
      .withContext('a failed background poll must not reset/clear the last known count')
      .toBe(4);
    expect(alertSpy.error).not.toHaveBeenCalled();

    discardPeriodicTasks();
  }));

  it('markOne() optimistically flips the row to read and decrements unreadCount immediately', () => {
    service['itemsSubject'].next([makeItem({ id: 5, read: false })]);
    service['unreadCountSubject'].next(2);
    apiSpy.markRead.and.returnValue(of({ code: 200, message: 'OK', data: { id: 5, readAt: 'now', read: true } }));

    service.markOne(5);

    expect(service['itemsSubject'].value[0].read).toBeTrue();
    expect(service['unreadCountSubject'].value).toBe(1);
  });

  it('markOne() rolls back the optimistic update and calls AlertService.error on failure', () => {
    const original = [makeItem({ id: 5, read: false })];
    service['itemsSubject'].next(original);
    service['unreadCountSubject'].next(2);
    apiSpy.markRead.and.returnValue(throwError(() => new Error('boom')));

    service.markOne(5);

    expect(service['itemsSubject'].value[0].read)
      .withContext('a failed mark-read must roll back the row to unread')
      .toBeFalse();
    expect(service['unreadCountSubject'].value)
      .withContext('a failed mark-read must roll back the count')
      .toBe(2);
    expect(alertSpy.error).toHaveBeenCalledWith('NOTIFICATIONS.MARK_READ_ERROR');
  });

  it('markAllRead() optimistically flips every row to read and zeroes unreadCount immediately', () => {
    service['itemsSubject'].next([makeItem({ id: 1, read: false }), makeItem({ id: 2, read: false })]);
    service['unreadCountSubject'].next(2);
    apiSpy.markAllRead.and.returnValue(of({ code: 200, message: 'OK', data: { updatedCount: 2 } }));

    service.markAllRead();

    expect(service['itemsSubject'].value.every((item) => item.read)).toBeTrue();
    expect(service['unreadCountSubject'].value).toBe(0);
  });

  it('markAllRead() rolls back and calls AlertService.error on failure', () => {
    const original = [makeItem({ id: 1, read: false }), makeItem({ id: 2, read: false })];
    service['itemsSubject'].next(original);
    service['unreadCountSubject'].next(2);
    apiSpy.markAllRead.and.returnValue(throwError(() => new Error('boom')));

    service.markAllRead();

    expect(service['itemsSubject'].value.every((item) => !item.read))
      .withContext('a failed mark-all-read must roll back every row to unread')
      .toBeTrue();
    expect(service['unreadCountSubject'].value).toBe(2);
    expect(alertSpy.error).toHaveBeenCalledWith('NOTIFICATIONS.MARK_ALL_ERROR');
  });

  it('markAllRead() is a no-op when unreadCount is already 0', () => {
    service['unreadCountSubject'].next(0);
    service.markAllRead();
    expect(apiSpy.markAllRead).not.toHaveBeenCalled();
  });

  it('clears state and stops polling when authStatus$ emits false (logout)', fakeAsync(() => {
    service.startPolling();
    tick();
    service['itemsSubject'].next([makeItem()]);
    service['unreadCountSubject'].next(3);

    authStatus$.next(false);

    expect(service['itemsSubject'].value).toEqual([]);
    expect(service['unreadCountSubject'].value).toBe(0);

    // Polling must actually be stopped — advancing past another tick must not
    // trigger a further getUnreadCount call.
    const callsBeforeAdvance = apiSpy.getUnreadCount.calls.count();
    tick(NOTIFICATION_UNREAD_POLL_MS * 2);
    expect(apiSpy.getUnreadCount.calls.count()).toBe(callsBeforeAdvance);
  }));
});
