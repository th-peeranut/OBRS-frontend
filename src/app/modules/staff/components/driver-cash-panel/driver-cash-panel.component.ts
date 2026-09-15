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
import { DriverCashDayStore } from './driver-cash-day.store';
import { DriverCashDayRespDto } from '../../../../shared/interfaces/driver-cash.interface';
import { formatMoney } from '../../../../shared/lib/money-display';
import { formatDisplayDate } from '../../../../shared/lib/display-date-time';
import { bangkokInstantMs } from '../../../../shared/lib/api-date-time';

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

/**
 * OBRS-1579 — the Bangkok calendar date of an API date-time, as `yyyy-MM-dd`,
 * or null when it is absent or unparseable. See `loadScheduleBusinessDate()`
 * for why neither half of this can be skipped.
 */
const BANGKOK_DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toBangkokBusinessDate(value: string | null | undefined): string | null {
  const ms = bangkokInstantMs(value);
  if (ms === null) {
    return null;
  }
  const parts = BANGKOK_DATE_PARTS.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

/**
 * OBRS-960 — smart: `/staff/boarding/:scheduleId`'s per-round cash panel.
 * Owns `DriverCashDayStore` (component-scoped, `providers: []` below — see
 * that store's doc comment). Rendered by
 * `BoardingListPageComponent` ONLY when the viewer is a salesperson —
 * drivers reach the same route but never handle cash (view-selection, not
 * authorization, mirroring `BoardingEntryPageComponent`'s
 * `isDriver`/`isSalesperson` idiom).
 *
 * OBRS-1727 AC-3 (owner ruling D2, 2026-09-14) — READ-ONLY since that card.
 * The four entry forms it used to host (advance · per-head · expense · repair)
 * were removed together, not one at a time: each had already gained a second
 * home (advance + per-head on the round's "ส่งยอด" tab, OBRS-1755; expense +
 * repair on `/staff/settlement`, OBRS-1756), and every amount that can be typed
 * in two places can be typed twice — OBRS-1880 is that bug, already on the
 * board. What stays is the pair of totals the salesperson has to read at the
 * vehicle: the driver's box and their own.
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
  /**
   * OBRS-1579 — the business date of the box this round's entries land in,
   * resolved from the SCHEDULE rather than from `day`, because on the morning
   * the late bill arrives the round often has no box yet: `day` is null until
   * the first entry creates it, and that is exactly when nothing on screen
   * said which day's box was about to be opened.
   */
  protected scheduleBusinessDate: string | null = null;

  protected topOffsetPx = 0;

  private resizeDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: DriverCashDayStore,
    private readonly staffApiService: StaffApiService,
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
    this.loadScheduleBusinessDate();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scheduleId'] && !changes['scheduleId'].firstChange && this.scheduleId) {
      this.store.setScheduleId(this.scheduleId);
      void this.store.refresh();
      this.scheduleBusinessDate = null;
      this.loadScheduleBusinessDate();
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

  /**
   * OBRS-1579 — which day's cash box an entry made here will land in. `day`'s
   * own value wins whenever the box exists (it is what the server already
   * decided); the schedule-derived date is the fallback for a round whose box
   * has not been opened yet.
   */
  protected get boxBusinessDate(): string | null {
    return this.day?.businessDate ?? this.scheduleBusinessDate;
  }

  /**
   * Mirrors the backend exactly: `DriverCashService#getOpenDriverDayOrThrow`
   * derives the business date from `DateTimeUtil.toBangkokDate(schedule
   * .getDepartureDateTime())`.
   *
   * ⛔ `departureDateTime`, NOT `delayedDepartureDateTime` — a delayed trip
   * keeps its original business date on the backend, and reading the delayed
   * field here would put a different date on screen from the one the entry
   * actually lands on, which is the entire failure this card removes.
   *
   * ⛔ And NOT `new Date(raw)` + local getters, which is what this method did
   * first. `departureDateTime` is one of the fields this API emits WITHOUT an
   * offset (`ParcelScheduleTabsPageComponent`'s doc names it), and `Date` then
   * reads an offset-less string as the VIEWER's wall clock while prod and SIT
   * run their JVM and Postgres in UTC — seven hours early, which around a
   * late-evening or after-midnight departure is a different calendar day. That
   * would put a confident, wrong date on the one label this card exists to
   * add. `bangkokInstantMs()` pins the offset-less case to Bangkok (OBRS-574)
   * and `BANGKOK_DATE_PARTS` reads the calendar date back in Bangkok, so the
   * viewer's own timezone drops out of both ends.
   *
   * Fails silently, like `loadMyDay()`: this is supplementary signposting and
   * must not put a banner over a boarding list the round depends on.
   */
  private loadScheduleBusinessDate(): void {
    if (!this.scheduleId) {
      return;
    }
    this.staffApiService
      .getScheduleById(this.scheduleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.scheduleBusinessDate = toBangkokBusinessDate(resp?.data?.departureDateTime);
        },
        error: () => { this.scheduleBusinessDate = null; },
      });
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

  /** OBRS-1592: driver-cash printed these decimal strings raw — no unit, no
   * thousand separator, `.00` on every whole amount. Staff money is money. */
  protected formatMoney(value: number | string | null | undefined): string {
    return formatMoney(value, this.translate.currentLang);
  }

  protected displayDate(value: string | null | undefined): string {
    return formatDisplayDate(value, this.translate.currentLang);
  }

}
