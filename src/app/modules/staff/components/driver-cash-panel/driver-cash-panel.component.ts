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

/** Local calendar date as `yyyy-MM-dd`, the same hand-rolled shape
 * `SettlementsPageComponent#toDateInputValue` and `BookingTrendStore` use — a
 * staff device runs on Bangkok time, and `toISOString()` would shift the date
 * backwards for the whole evening. */
function todayBusinessDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// OBRS-1389 — OBRS-1368 put the sales-point 403 behind these two forms as well,
// and both were still `{}`, so the refusal read as GENERIC's "please try again".
// They do NOT share the expense sentence: the backend runs a DIFFERENT gate per
// form (`DriverCashService#assertCallerSalesPointOrThrow` weighs the round's
// ORIGIN, `#assertCallerSalesPointCoversStopOrThrow` weighs the STOP the request
// names) behind one wire code, so per-head gets its own key — telling a
// salesperson the round is not theirs, when what is not theirs is the stop they
// picked, is the same unfollowable advice this card exists to remove.
const ADVANCE_ERROR_KEYS: Record<string, string> = {
  DRIVER_CASH_SALES_POINT_FORBIDDEN: 'STAFF.DRIVER_CASH.ERROR.SALES_POINT_FORBIDDEN',
};
const PER_HEAD_ERROR_KEYS: Record<string, string> = {
  DRIVER_CASH_SALES_POINT_FORBIDDEN: 'STAFF.DRIVER_CASH.ERROR.PER_HEAD_SALES_POINT_FORBIDDEN',
};
// OBRS-1356 — the ONE expense code worth naming: the generic message would
// leave a salesperson retrying a wage entry that cannot succeed until the
// owner sets the rate, and only this text says who has to do what.
// OBRS-1361 — the same argument, one refusal later. The sales-point 403 is
// PERMANENT for this round, and GENERIC's "please try again" is advice that
// cannot work: measured in the AFTER capture before this line existed, the
// backend's own Thai message never reached the screen.
const EXPENSE_ERROR_KEYS: Record<string, string> = {
  DRIVER_WAGE_RATE_NOT_CONFIGURED: 'STAFF.DRIVER_CASH.ERROR.WAGE_RATE_NOT_CONFIGURED',
  DRIVER_CASH_SALES_POINT_FORBIDDEN: 'STAFF.DRIVER_CASH.ERROR.SALES_POINT_FORBIDDEN',
};

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
  /**
   * OBRS-1073 — the CALLER's own cash day, which since that card is a
   * DIFFERENT row from `day`: the per-head fee is the salesperson's pay and
   * lands on their box, while `day` is the DRIVER's (advance, field costs).
   * Held separately and never merged, because `store.mutate()`-ing the
   * per-head response over `day` would have swapped one person's running
   * totals for another's on the strip the salesperson reads at the vehicle.
   */
  protected myDay: DriverCashDayRespDto | null = null;
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

    this.loadMyDay();
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

  /**
   * The per-head form's stop list comes off a day response's `perHeadRates`.
   * `day` (the driver's) stays the primary source so nothing changes for a
   * round that already has an advance on it; `myDay` is the fallback for the
   * case OBRS-1073 created, where the salesperson has recorded heads but this
   * round has no driver-side entry yet.
   *
   * ⚠️ Pre-existing and untouched by this card: when NEITHER day exists yet
   * the list is empty, because the only source of stops on this screen is a
   * day response that does not exist until the first entry.
   */
  protected get perHeadRates() {
    return this.day?.perHeadRates ?? this.myDay?.perHeadRates ?? [];
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
        // NOT onActionSuccess: this response is the CALLER's day, not the
        // driver's, so it must not overwrite `day`. See `myDay`.
        next: (resp) => this.onPerHeadSuccess(resp?.data ?? null),
        error: (err: unknown) => {
          this.isSubmitting = false;
          this.perHeadError = this.mapError(err, PER_HEAD_ERROR_KEYS);
        },
      });
  }

  protected onSubmitExpense(payload: {
    category: string;
    amount?: string;
    note?: string;
    categoryOtherLabel?: string;
  }): void {
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

  /**
   * OBRS-1073 — the per-head POST answers about the caller's OWN day. The
   * driver's day is genuinely unchanged by it (his ledger no longer carries
   * this fee at all), so there is nothing to refetch — the panel simply gains
   * a second, clearly-labelled figure.
   */
  private onPerHeadSuccess(data: DriverCashDayRespDto | null): void {
    this.isSubmitting = false;
    if (data) {
      this.myDay = data;
    }
    this.activeAction = null;
  }

  /**
   * OBRS-1073 — without this the salesperson's own box existed ONLY inside the
   * browser tab that recorded a head: `myDay` was set from the per-head POST
   * response and from nowhere else, so a reload, a second round, or coming back
   * after lunch showed nothing at all, while the money they must hand over
   * tonight was sitting on a real row. Measured during the AFTER capture — the
   * `GET /my-day` this card added had no caller.
   *
   * Failure is silent on purpose. `data: null` is the ordinary answer for a
   * salesperson who has taken no heads yet, and an error here must not put a
   * banner over a boarding list the round actually depends on.
   */
  private loadMyDay(): void {
    this.staffApiService
      .getDriverCashMyDay(todayBusinessDate())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => { this.myDay = resp?.data ?? null; },
        error: () => { this.myDay = null; },
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
