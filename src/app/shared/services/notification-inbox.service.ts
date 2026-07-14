import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, EMPTY, Subject, timer } from 'rxjs';
import { catchError, switchMap, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../auth/auth.service';
import { NotificationApiService } from '../../services/notifications/notification-api.service';
import { NotificationItem } from '../interfaces/notification.interface';
import { AlertService } from './alert.service';

// Cadence for the unread-count poll — matches the existing sidebar "new
// usability report" badge cadence (NEW_REPORT_COUNT_POLL_MS in
// admin-layout.component.ts), NOT a new cadence invented for this feature.
export const NOTIFICATION_UNREAD_POLL_MS = 60_000;

// Phase 1 list cap: 10 most recent notifications (read + unread), no
// full-inbox page/route yet. See design-system.md's "new pattern" entry.
const INBOX_PAGE_SIZE = 10;

/**
 * OBRS-317: root-scoped cross-cutting state for the owner/staff in-app
 * notification bell + inbox panel. Plain RxJS `BehaviorSubject`s — same
 * shape as `UsabilityReportBadgeRefreshService` / `BadgeSocketService` —
 * deliberately NOT NgRx: NgRx in this codebase is scoped to the
 * customer-facing booking modules; the admin/staff back-office uses
 * root-service state for cross-cutting concerns like this one (see
 * `docs/adr/0018-notification-inbox-overlay-panel-and-root-service-state.md`).
 */
@Injectable({ providedIn: 'root' })
export class NotificationInboxService {
  private readonly unreadCountSubject = new BehaviorSubject<number>(0);
  readonly unreadCount$ = this.unreadCountSubject.asObservable();

  private readonly itemsSubject = new BehaviorSubject<NotificationItem[]>([]);
  readonly items$ = this.itemsSubject.asObservable();

  private readonly totalElementsSubject = new BehaviorSubject<number>(0);
  readonly totalElements$ = this.totalElementsSubject.asObservable();

  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  readonly loading$ = this.loadingSubject.asObservable();

  private readonly errorSubject = new BehaviorSubject<boolean>(false);
  readonly error$ = this.errorSubject.asObservable();

  // Idempotent-start guard, mirroring `BadgeSocketService.connect()` — a
  // repeat call (e.g. more than one mounted bell) doesn't stack a second
  // interval.
  private pollActive = false;
  private readonly stopPoll$ = new Subject<void>();

  constructor(
    private readonly notificationApiService: NotificationApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    authService: AuthService
  ) {
    // Root-scoped state outlives the session (like AdminCollectionStore) —
    // drop it on logout so the next session doesn't briefly see the
    // previous user's notifications, and stop the poll interval too.
    authService.authStatus$.subscribe((isAuthenticated) => {
      if (!isAuthenticated) {
        this.stopPolling();
        this.clear();
      }
    });
  }

  /** Starts the 60s unread-count poll and fires the initial list fetch. Idempotent. */
  startPolling(): void {
    if (this.pollActive) {
      return;
    }
    this.pollActive = true;

    // "Fetch the list on panel open + on init" — this is the "on init" leg.
    this.fetchList();

    timer(0, NOTIFICATION_UNREAD_POLL_MS)
      .pipe(
        switchMap(() =>
          this.notificationApiService.getUnreadCount().pipe(
            // Swallow background-poll failures — keep the last known count,
            // no toast (only user-initiated mark actions surface errors).
            catchError(() => EMPTY)
          )
        ),
        takeUntil(this.stopPoll$)
      )
      .subscribe((response) => {
        this.unreadCountSubject.next(response.data?.unreadCount ?? 0);
      });
  }

  stopPolling(): void {
    this.pollActive = false;
    this.stopPoll$.next();
  }

  /** Force refetch of both the unread count and the first page — called on panel open/retry. */
  refreshOnOpen(): void {
    this.fetchUnreadCount();
    this.fetchList();
  }

  private fetchUnreadCount(): void {
    this.notificationApiService
      .getUnreadCount()
      .pipe(catchError(() => EMPTY))
      .subscribe((response) => {
        this.unreadCountSubject.next(response.data?.unreadCount ?? 0);
      });
  }

  private fetchList(): void {
    // Stale-while-revalidate: only show the first-load spinner when nothing
    // is cached yet; a background refresh keeps existing rows on screen.
    if (this.itemsSubject.value.length === 0) {
      this.loadingSubject.next(true);
    }

    this.notificationApiService
      .getNotifications({ unreadOnly: false, page: 0, size: INBOX_PAGE_SIZE })
      .subscribe({
        next: (response) => {
          this.itemsSubject.next(response.data?.content ?? []);
          this.totalElementsSubject.next(response.data?.totalElements ?? 0);
          this.errorSubject.next(false);
          this.loadingSubject.next(false);
        },
        error: () => {
          this.errorSubject.next(true);
          this.loadingSubject.next(false);
        },
      });
  }

  /** Optimistic mark-one-read: row flips to read + count -1 immediately, rolled back on failure. */
  markOne(id: number): void {
    const previousItems = this.itemsSubject.value;
    const previousCount = this.unreadCountSubject.value;
    const target = previousItems.find((item) => item.id === id);
    if (!target || target.read) {
      return;
    }

    const now = new Date().toISOString();
    this.itemsSubject.next(
      previousItems.map((item) =>
        item.id === id ? { ...item, read: true, readAt: now } : item
      )
    );
    this.unreadCountSubject.next(Math.max(0, previousCount - 1));

    this.notificationApiService.markRead(id).subscribe({
      error: () => {
        this.itemsSubject.next(previousItems);
        this.unreadCountSubject.next(previousCount);
        this.alertService.error(this.translate.instant('NOTIFICATIONS.MARK_READ_ERROR'));
      },
    });
  }

  /** Optimistic mark-all-read: every row flips to read + count -> 0 immediately, rolled back on failure. */
  markAllRead(): void {
    const previousItems = this.itemsSubject.value;
    const previousCount = this.unreadCountSubject.value;
    if (previousCount === 0) {
      return;
    }

    const now = new Date().toISOString();
    this.itemsSubject.next(
      previousItems.map((item) => ({ ...item, read: true, readAt: item.readAt ?? now }))
    );
    this.unreadCountSubject.next(0);

    this.notificationApiService.markAllRead().subscribe({
      error: () => {
        this.itemsSubject.next(previousItems);
        this.unreadCountSubject.next(previousCount);
        this.alertService.error(this.translate.instant('NOTIFICATIONS.MARK_ALL_ERROR'));
      },
    });
  }

  private clear(): void {
    this.itemsSubject.next([]);
    this.totalElementsSubject.next(0);
    this.unreadCountSubject.next(0);
    this.errorSubject.next(false);
    this.loadingSubject.next(false);
  }
}
