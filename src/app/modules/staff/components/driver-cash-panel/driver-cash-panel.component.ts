import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorCode, mapApiErrorCode } from '../../../../shared/lib/api-error-code';
import { DriverCashDayStore } from './driver-cash-day.store';
import { DriverCashDayRespDto } from '../../../../shared/interfaces/driver-cash.interface';

type DriverCashAction = 'advance' | 'perHead' | 'expense' | null;

const ADVANCE_ERROR_KEYS: Record<string, string> = {};
const PER_HEAD_ERROR_KEYS: Record<string, string> = {};
const EXPENSE_ERROR_KEYS: Record<string, string> = {};

/**
 * OBRS-960 — smart: `/staff/boarding/:scheduleId`'s per-round cash panel.
 * Owns `DriverCashDayStore` (component-scoped, `providers: []` below — see
 * that store's doc comment) and the 3 POSTs. Rendered by
 * `BoardingListPageComponent` ONLY when the viewer is a salesperson —
 * drivers reach the same route but never handle cash (view-selection, not
 * authorization, mirroring `BoardingEntryPageComponent`'s
 * `isDriver`/`isSalesperson` idiom).
 *
 * No stop-list fetch of its own: `perHeadRates[]` on the day response
 * already carries every stop the per-head form needs (id/name/rate/
 * configured) — `shared/components/boarding-list/boarding-list.store.ts`
 * exposes only the flat boarding manifest (no stops), and the card is
 * explicit that this response covers it, so nothing was added.
 *
 * Sticky context strip: reuses the OBRS-312/ADR-0023 pattern EXACTLY —
 * measures `.admin-topbar`'s live rendered height at runtime and binds this
 * strip's own `top` to it (never a second hardcoded `top: 0` sibling to the
 * already-sticky shell topbar).
 */
@Component({
    selector: 'app-driver-cash-panel',
    templateUrl: './driver-cash-panel.component.html',
    styleUrl: './driver-cash-panel.component.scss',
    providers: [DriverCashDayStore],
    standalone: false
})
export class DriverCashPanelComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() scheduleId!: number;

  protected day: DriverCashDayRespDto | null = null;
  protected isLoading = false;

  protected activeAction: DriverCashAction = null;
  protected isSubmitting = false;
  protected advanceError: string | null = null;
  protected perHeadError: string | null = null;
  protected expenseError: string | null = null;

  protected topOffsetPx = 0;

  private resizeDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: DriverCashDayStore,
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly elementRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.day = data;
    });
    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isLoading = refreshing;
    });
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      setTimeout(() => this.measureTopOffset(), 0);
    });

    if (this.scheduleId) {
      this.store.setScheduleId(this.scheduleId);
      void this.store.refresh();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scheduleId'] && !changes['scheduleId'].firstChange && this.scheduleId) {
      this.store.setScheduleId(this.scheduleId);
      void this.store.refresh();
      this.activeAction = null;
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.measureTopOffset(), 0);
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    if (this.resizeDebounceHandle) {
      clearTimeout(this.resizeDebounceHandle);
    }
    this.resizeDebounceHandle = setTimeout(() => this.measureTopOffset(), 100);
  }

  ngOnDestroy(): void {
    if (this.resizeDebounceHandle) {
      clearTimeout(this.resizeDebounceHandle);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** See `InspectionPageComponent.measureTopOffset()` (ADR-0023) — same
   * mechanism, applied to this panel's own sticky strip. */
  private measureTopOffset(): void {
    const topbar = document.querySelector('.admin-topbar');
    this.topOffsetPx = topbar instanceof HTMLElement ? topbar.getBoundingClientRect().height : 0;
  }

  // ── Accordion — one open at a time, no modal/navigation (card) ───────────

  protected toggleAction(action: Exclude<DriverCashAction, null>): void {
    this.activeAction = this.activeAction === action ? null : action;
  }

  protected isActionOpen(action: Exclude<DriverCashAction, null>): boolean {
    return this.activeAction === action;
  }

  // ── Submit handlers — never reset the form on failure (card) ─────────────

  protected onSubmitAdvance(payload: { amount: string }): void {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.advanceError = null;
    this.staffApiService
      .postDriverCashAdvance(this.scheduleId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => this.onActionSuccess(resp?.data ?? null),
        error: (err: unknown) => {
          this.isSubmitting = false;
          this.advanceError = this.mapError(err, ADVANCE_ERROR_KEYS);
        },
      });
  }

  protected onSubmitPerHead(payload: { stopId: number; headCount: number }): void {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.perHeadError = null;
    this.staffApiService
      .postDriverCashPerHead(this.scheduleId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => this.onActionSuccess(resp?.data ?? null),
        error: (err: unknown) => {
          this.isSubmitting = false;
          this.perHeadError = this.mapError(err, PER_HEAD_ERROR_KEYS);
        },
      });
  }

  protected onSubmitExpense(payload: { category: string; amount: string; note?: string }): void {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.expenseError = null;
    this.staffApiService
      .postDriverCashExpense(this.scheduleId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => this.onActionSuccess(resp?.data ?? null),
        error: (err: unknown) => {
          this.isSubmitting = false;
          this.expenseError = this.mapError(err, EXPENSE_ERROR_KEYS);
        },
      });
  }

  private onActionSuccess(data: DriverCashDayRespDto | null): void {
    this.isSubmitting = false;
    if (data) {
      this.store.mutate(() => data);
    }
    // Collapse back to the totals view — the whole point of the accordion
    // is one tap in, one tap done, at the vehicle.
    this.activeAction = null;
  }

  private mapError(error: unknown, knownCodes: Record<string, string>): string {
    const code = extractApiErrorCode(error, null);
    const key = mapApiErrorCode(code, knownCodes, 'STAFF.DRIVER_CASH.ERROR.GENERIC');
    const message = this.translate.instant(key);
    this.alertService.error(message);
    return message;
  }
}
