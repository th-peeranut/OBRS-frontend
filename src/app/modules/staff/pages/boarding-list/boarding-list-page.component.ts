import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { BoardingListItemDto, StaffApiService } from '../../../../services/staff/staff-api.service';
import { BoardingListStore } from './boarding-list.store';

@Component({
  selector: 'app-boarding-list-page',
  templateUrl: './boarding-list-page.component.html',
  styleUrl: './boarding-list-page.component.scss',
})
export class BoardingListPageComponent implements OnInit, OnDestroy {
  protected items: BoardingListItemDto[] = [];
  protected isRefreshing = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected checkingInIds = new Set<number>();

  private scheduleId = 0;
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    readonly store: BoardingListStore
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('scheduleId'));
    this.scheduleId = id;
    this.store.setScheduleId(id);

    this.subscriptions.add(
      this.store.data$.subscribe((data) => {
        this.items = data ?? [];
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((r) => (this.isRefreshing = r))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        if (failed && !this.store.hasValue) {
          this.errorMessage = this.translate.instant('STAFF.MESSAGES.LOAD_BOARDING_FAILED');
        } else {
          this.errorMessage = '';
        }
      })
    );

    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  protected isCheckedIn(item: BoardingListItemDto): boolean {
    return item.status.code === 'checked_in';
  }

  protected isCheckingIn(item: BoardingListItemDto): boolean {
    return this.checkingInIds.has(item.ticketId);
  }

  protected async checkIn(item: BoardingListItemDto): Promise<void> {
    if (this.isCheckedIn(item) || this.isCheckingIn(item)) {
      return;
    }

    this.checkingInIds.add(item.ticketId);
    const originalStatus = { ...item.status };

    // Optimistic update
    this.store.mutate((items) =>
      items.map((i) =>
        i.ticketId === item.ticketId
          ? { ...i, status: { code: 'checked_in', label: this.translate.instant('STAFF.BOARDING.CHECKED_IN') } }
          : i
      )
    );

    try {
      await firstValueFrom(this.staffApiService.checkIn(item.ticketId));
      await this.alertService.success(this.translate.instant('STAFF.MESSAGES.CHECK_IN_SUCCESS'));
      void this.store.refresh();
    } catch (error) {
      // Revert optimistic update
      this.store.mutate((items) =>
        items.map((i) =>
          i.ticketId === item.ticketId ? { ...i, status: originalStatus } : i
        )
      );
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('STAFF.MESSAGES.CHECK_IN_FAILED');
      await this.alertService.error(message);
    } finally {
      this.checkingInIds.delete(item.ticketId);
    }
  }

  protected goBack(): void {
    void this.router.navigate(['/staff']);
  }

  // Expose scheduleId to template if needed
  protected get currentScheduleId(): number {
    return this.scheduleId;
  }
}
