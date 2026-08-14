import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  NotificationMessageLocale,
  OverridableMessageKeyDto,
} from '../../../../shared/interfaces/notification-message-override.interface';
import { NotificationMessagesStore } from './notification-messages.store';

/**
 * OBRS-1308 — `/admin/settings/notification-messages` (index tab): the owner's
 * list of overridable keys × th/en/zh status. Standard `AdminCollectionStore`
 * SWR page (driver-cash-rates-page precedent) — `refresh()` on init, no
 * fetch-in-`ngOnInit` bare HTTP call.
 */
@Component({
    selector: 'app-notification-message-list-page',
    templateUrl: './notification-message-list-page.component.html',
    styleUrl: './notification-message-list-page.component.scss',
    standalone: false
})
export class NotificationMessageListPageComponent implements OnInit, OnDestroy {
  protected keys: OverridableMessageKeyDto[] = [];
  protected isLoading = false;
  protected hasError = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: NotificationMessagesStore,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    // OBRS-506/OBRS-1308: data$ emits null on clear() (e.g. logout) — honor
    // null rather than keeping stale rows.
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.keys = data ?? [];
    });
    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isLoading = refreshing && !this.store.hasValue;
    });
    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.hasError = failed && !this.store.hasValue;
    });
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected onEditKey(event: { code: string; locale: NotificationMessageLocale }): void {
    void this.router.navigate([
      '/admin/settings/notification-messages/edit',
      event.code,
      event.locale,
    ]);
  }
}
