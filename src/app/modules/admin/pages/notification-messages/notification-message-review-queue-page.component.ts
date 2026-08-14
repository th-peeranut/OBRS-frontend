import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../../auth/auth.service';
import { PendingReviewRowDto } from '../../../../shared/interfaces/notification-message-override.interface';
import { NotificationMessageReviewQueueStore } from './notification-messages.store';

/**
 * OBRS-1308 — `/admin/settings/notification-messages/reviews`, the admin
 * pending-review queue.
 *
 * <p><b>AC5, verified in the worktree (Scrutinize):</b> `getRoles()` returns
 * the raw stored roles, un-expanded (`auth.service.ts:287-305`) — the
 * `ROLE_GRANTS` expansion lives only in `hasAnyRole()` (307-339), which is
 * symmetric (owner grants admin, admin grants owner). So `hasAnyRole(['admin'])`
 * — and this tab's own `requiredRoles: ['admin','owner']` — admit a plain
 * owner too, and the parent `AuthGuard` lets an owner reach this route. The
 * gate below is therefore the FIRST LINE of `ngOnInit`, checked with the raw
 * `getRoles()` read, and returns BEFORE any store call or API call — an
 * owner who deep-links here fires ZERO network requests and sees only the
 * access-denied block, never a 403 from a request the backend would have
 * refused anyway.
 */
@Component({
    selector: 'app-notification-message-review-queue-page',
    templateUrl: './notification-message-review-queue-page.component.html',
    styleUrl: './notification-message-review-queue-page.component.scss',
    standalone: false
})
export class NotificationMessageReviewQueuePageComponent implements OnInit, OnDestroy {
  protected accessDenied = false;
  protected rows: PendingReviewRowDto[] = [];
  protected isLoading = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly authService: AuthService,
    private readonly store: NotificationMessageReviewQueueStore,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    // AC5 — first line, before any store/API call. See class doc.
    if (!this.authService.getRoles().includes('admin')) {
      this.accessDenied = true;
      return;
    }

    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.rows = data ?? [];
    });
    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isLoading = refreshing && !this.store.hasValue;
    });
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected onOpenReview(id: number): void {
    void this.router.navigate(['/admin/settings/notification-messages/reviews', id]);
  }
}
