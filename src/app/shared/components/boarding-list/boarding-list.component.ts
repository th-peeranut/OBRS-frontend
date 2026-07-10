import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../auth/auth.service';
import { AlertService } from '../../services/alert.service';
import {
  boardingScanErrorIcon,
  boardingScanErrorSeverity,
  extractBoardingScanErrorCode,
  mapBoardingScanErrorCode,
} from '../../lib/boarding-scan-error';
import { extractBoardingActionErrorCode, mapBoardingActionErrorCode } from '../../lib/boarding-action-error';
import { BoardingScanResultDto } from '../../interfaces/ticket-boarding.interface';
import { BoardingListItemDto, StaffApiService } from '../../../services/staff/staff-api.service';
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

/**
 * OBRS-130: the driver-manifest / walk-in-boarding-tab shared presentational
 * component. Self-sufficient — owns its own `BoardingListStore` instance
 * (component-scoped, see `providers` below) and calls `StaffApiService`
 * directly, so either host only needs to pass `[scheduleId]`.
 *
 * **Single-owner re-bind contract**: only `ngOnChanges` calls
 * `store.setScheduleId()` + `refresh()`. A host must NOT call
 * `store.setScheduleId()` itself — doing so from both places would
 * double-fetch on mount.
 */
@Component({
  selector: 'app-boarding-list',
  templateUrl: './boarding-list.component.html',
  styleUrl: './boarding-list.component.scss',
  providers: [BoardingListStore],
})
export class BoardingListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() scheduleId!: number;

  protected items: BoardingListItemDto[] = [];
  protected isRefreshing = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 5 });

  /** Ticket ids with a board() call in flight (button spinner/disabled state). */
  protected boardingIds = new Set<number>();
  /** Ticket ids with an unboard() call in flight. */
  protected unboardingIds = new Set<number>();

  /** Un-board is salesperson/admin only (admin inherits via ROLE_GRANTS) —
   * hidden, not disabled, for a driver. Same precedent as
   * `ExportButtonComponent.canExport`. */
  protected readonly canUnboard: boolean;

  // Manual boarding-scan box (OBRS-96) — text-entry token only, camera
  // scanning is out of scope for this card.
  protected scanToken = '';
  protected isScanning = false;
  protected scanResult: BoardingScanResultDto | null = null;
  protected scanError: BoardingScanErrorResult | null = null;

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly authService: AuthService,
    protected readonly store: BoardingListStore
  ) {
    this.canUnboard = this.authService.hasAnyRole(['salesperson']);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scheduleId']) {
      this.store.setScheduleId(this.scheduleId);
      void this.store.refresh();
    }
  }

  ngOnInit(): void {
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
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  /** OBRS-130: boarded state is `boardedAt != null` — status-neutral, not
   * `status.code === 'checked_in'` (see docs/adr/0030-boarding-state-model.md,
   * backend, and the OBRS-130 frontend ADR). */
  protected isBoarded(item: BoardingListItemDto): boolean {
    return item.boardedAt != null;
  }

  protected isBoarding(item: BoardingListItemDto): boolean {
    return this.boardingIds.has(item.ticketId);
  }

  protected isUnboarding(item: BoardingListItemDto): boolean {
    return this.unboardingIds.has(item.ticketId);
  }

  /** OBRS-130: manual Board action — replaces the retired check-in flow. */
  protected async board(item: BoardingListItemDto): Promise<void> {
    if (this.isBoarded(item) || this.isBoarding(item)) {
      return;
    }

    this.boardingIds.add(item.ticketId);
    const originalBoardedAt = item.boardedAt;
    const originalBoardedByName = item.boardedByName;
    // You are the operator clicking Board right now, so it's correct (not the
    // pre-existing-row misattribution bug) to optimistically label *this one
    // row* with your own name — it reconciles with the backend-resolved name
    // on the next refresh.
    const boarderName = this.authService.getUsername() ?? undefined;

    this.store.mutate((items) =>
      items.map((i) =>
        i.ticketId === item.ticketId
          ? { ...i, boardedAt: new Date().toISOString(), boardedByName: boarderName }
          : i
      )
    );

    try {
      await firstValueFrom(this.staffApiService.board(item.ticketId));
      await this.alertService.success(this.translate.instant('STAFF.BOARDING.BOARD_SUCCESS'));
      void this.store.refresh();
    } catch (error) {
      this.store.mutate((items) =>
        items.map((i) =>
          i.ticketId === item.ticketId
            ? { ...i, boardedAt: originalBoardedAt, boardedByName: originalBoardedByName }
            : i
        )
      );
      const errorCode = extractBoardingActionErrorCode(error);
      await this.alertService.error(this.translate.instant(mapBoardingActionErrorCode(errorCode)));
    } finally {
      this.boardingIds.delete(item.ticketId);
    }
  }

  /** OBRS-130: reverse a boarding stamp. Salesperson/admin only (hidden for
   * drivers, see `canUnboard`) and requires a confirm, since it reverses a
   * recorded fact. */
  protected async unboard(item: BoardingListItemDto): Promise<void> {
    if (!this.canUnboard || !this.isBoarded(item) || this.isUnboarding(item)) {
      return;
    }

    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('STAFF.BOARDING.UNBOARD_CONFIRM_TITLE'),
      text: this.translate.instant('STAFF.BOARDING.UNBOARD_CONFIRM_TEXT'),
      confirmButtonText: this.translate.instant('STAFF.BOARDING.UNBOARD_CONFIRM_CONFIRM'),
      cancelButtonText: this.translate.instant('STAFF.BOARDING.UNBOARD_CONFIRM_CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.unboardingIds.add(item.ticketId);
    const originalBoardedAt = item.boardedAt;
    const originalBoardedByName = item.boardedByName;

    this.store.mutate((items) =>
      items.map((i) =>
        i.ticketId === item.ticketId ? { ...i, boardedAt: undefined, boardedByName: undefined } : i
      )
    );

    try {
      await firstValueFrom(this.staffApiService.unboard(item.ticketId));
      await this.alertService.success(this.translate.instant('STAFF.BOARDING.UNBOARD_SUCCESS'));
      void this.store.refresh();
    } catch (error) {
      this.store.mutate((items) =>
        items.map((i) =>
          i.ticketId === item.ticketId
            ? { ...i, boardedAt: originalBoardedAt, boardedByName: originalBoardedByName }
            : i
        )
      );
      const errorCode = extractBoardingActionErrorCode(error);
      await this.alertService.error(this.translate.instant(mapBoardingActionErrorCode(errorCode)));
    } finally {
      this.unboardingIds.delete(item.ticketId);
    }
  }

  /**
   * OBRS-96: validate a manually-entered/pasted boarding token against this
   * schedule and mark the ticket boarded. `scheduleId` always comes from the
   * `[scheduleId]` input, never user input. Errors branch on
   * `error.error.errorCode` (never the localized message) via
   * `boarding-scan-error.ts`.
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

  /** OBRS-130: status-neutral — stamps `boardedAt` from the scan response
   * only, no fake `status: 'checked_in'`. Same "you are the actual boarder"
   * reasoning as `board()` applies to the name: you just scanned this ticket
   * yourself, so seeding your own name on *this* freshly-boarded row is
   * correct; it reconciles with the backend-resolved name on next refresh. */
  private reflectBoardedInList(result: BoardingScanResultDto): void {
    const boarderName = this.authService.getUsername() ?? undefined;
    this.store.mutate((items) =>
      items.map((item) =>
        item.ticketId === result.ticketId
          ? { ...item, boardedAt: result.boardedAt, boardedByName: boarderName }
          : item
      )
    );
  }
}
