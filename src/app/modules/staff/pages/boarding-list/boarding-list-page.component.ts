import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import {
  boardingScanErrorIcon,
  boardingScanErrorSeverity,
  extractBoardingScanErrorCode,
  mapBoardingScanErrorCode,
} from '../../../../shared/lib/boarding-scan-error';
import { BoardingScanResultDto } from '../../../../shared/interfaces/ticket-boarding.interface';
import { BoardingListItemDto, StaffApiService } from '../../../../services/staff/staff-api.service';
import { BoardingListStore } from './boarding-list.store';

/** Inline result of the manual boarding-scan box — success carries the
 * boarded passenger/seat/time, failure carries the errorCode-derived i18n
 * key + severity + icon (design-system §11: never distinguish by color
 * alone). */
export interface BoardingScanErrorResult {
  messageKey: string;
  severity: 'danger' | 'warning';
  icon: string;
}

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

  // Manual boarding-scan box (OBRS-96) — text-entry token only, camera
  // scanning is out of scope for this card.
  protected scanToken = '';
  protected isScanning = false;
  protected scanResult: BoardingScanResultDto | null = null;
  protected scanError: BoardingScanErrorResult | null = null;

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

  /**
   * OBRS-96: validate a manually-entered/pasted boarding token against this
   * schedule and mark the ticket boarded. `scheduleId` always comes from the
   * route, never user input. Errors branch on `error.error.errorCode`
   * (never the localized message) via `boarding-scan-error.ts`.
   */
  protected async validateScan(): Promise<void> {
    const token = this.scanToken.trim();
    if (!token || this.isScanning) {
      return;
    }

    this.isScanning = true;
    this.scanResult = null;
    this.scanError = null;

    try {
      const response = await firstValueFrom(
        this.staffApiService.boardingScan({ token, scheduleId: this.scheduleId })
      );
      if (response?.data) {
        this.scanResult = response.data;
        this.scanToken = '';
        this.reflectBoardedInList(response.data);
      }
    } catch (error) {
      const errorCode = extractBoardingScanErrorCode(error);
      this.scanError = {
        messageKey: mapBoardingScanErrorCode(errorCode),
        severity: boardingScanErrorSeverity(errorCode),
        icon: boardingScanErrorIcon(errorCode),
      };
    } finally {
      this.isScanning = false;
    }
  }

  protected dismissScanResult(): void {
    this.scanResult = null;
    this.scanError = null;
  }

  private reflectBoardedInList(result: BoardingScanResultDto): void {
    const boardedLabel = this.translate.instant('STAFF.BOARDING.CHECKED_IN');
    this.store.mutate((items) =>
      items.map((item) =>
        item.ticketId === result.ticketId
          ? {
              ...item,
              status: { code: 'checked_in', label: boardedLabel },
              boardedAt: result.boardedAt,
            }
          : item
      )
    );
  }

  protected goBack(): void {
    void this.router.navigate(['/staff']);
  }

  // Expose scheduleId to template if needed
  protected get currentScheduleId(): number {
    return this.scheduleId;
  }
}
