import {
  AfterViewChecked,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { select, Store } from '@ngrx/store';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import dayjs from 'dayjs';
import {
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  startWith,
  Subject,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';

import { Appstate } from '../../../../shared/stores/appstate';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import {
  ScheduleAvailability,
  ScheduleAvailabilityReq,
  ScheduleFilter,
} from '../../../../shared/interfaces/schedule.interface';
import { ScheduleService } from '../../../../services/schedule/schedule.service';
import { BookingPolicyService } from '../../../../services/booking-policy/booking-policy.service';
import {
  availabilityRequestFor,
  availabilityRequestKey,
  buildDayWindow,
} from '../../../../shared/lib/schedule-day-window';
import { scheduleFilterForDay } from '../../../../shared/lib/schedule-day-jump';
import { formatDayChip } from '../../../../shared/lib/day-label';

/**
 * `unknown` renders EXACTLY like `available` — identical tokens, selectable.
 * Greying a day is a statement to a customer ("there are no trips"), and beyond
 * the server's `effectiveDays` we have not been told that. Rendering it as
 * available makes no claim and lets the search — the authority — answer. It is
 * kept as its own value rather than folded into `available` so the reason
 * survives; do NOT give it a third visual state, because the only thing the
 * customer could do with the distinction is what they can already do: tap it.
 */
export type DayChipState = 'selected' | 'available' | 'unavailable' | 'unknown';

export interface DayChip {
  iso: string;
  weekdayLabel: string;
  dateLabel: string;
  state: DayChipState;
}

interface DayStripContext {
  filter: ScheduleFilter | null;
  lang: string;
  maxAdvanceDays: number;
  windowDays: string[];
  request: ScheduleAvailabilityReq | null;
}

/**
 * OBRS-862 — the results page's day control (AC#1/AC#2).
 *
 * It owns no NgRx surface at all: it reads `selectScheduleFilter` /
 * `selectProvinceWithStation`, and a tap writes `invokeSetScheduleFilterApi`.
 * `ScheduleBookingFilterComponent`'s existing `scheduleFilter` subscription
 * then patches its own date control AND re-runs the search, so the list, the
 * form and the store cannot disagree about which day is on screen.
 *
 * It MUST NOT dispatch `invokeGetScheduleListApi` — that is the OBRS-1503 bug
 * (two identical POST /schedules/search per press).
 */
@Component({
  selector: 'app-schedule-booking-day-strip',
  templateUrl: './schedule-booking-day-strip.component.html',
  styleUrl: './schedule-booking-day-strip.component.scss',
  standalone: false,
})
export class ScheduleBookingDayStripComponent
  implements OnInit, OnDestroy, AfterViewChecked
{
  /** The whole strip is gated on this: with no station pair and no passengers
   *  no search has run either, and an orphan day control above an empty page is
   *  worse than nothing. Same condition as the filter's `isSearchable()`. */
  isSearchable = false;
  days: DayChip[] = [];
  isAvailabilityInFlight = false;

  @ViewChildren('chip') private chipRefs?: QueryList<ElementRef<HTMLButtonElement>>;

  private context: DayStripContext | null = null;
  private availability: ScheduleAvailability | null = null;
  private lastScrolledIso: string | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private store: Store<Appstate>,
    private translate: TranslateService,
    private scheduleService: ScheduleService,
    private bookingPolicyService: BookingPolicyService
  ) {}

  ngOnInit(): void {
    // AC#3. The upper bound is the owner-editable advance-sale cap, read from
    // the API and never a literal. The fallback, the failed-fetch handling and
    // the "render before the answer lands" `startWith` all live on
    // `BookingPolicyService.maxAdvanceDays$` — shared with the filter and the
    // list so this strip and the empty-state hint can never hold two different
    // caps, compute two different windows, and put two identical availability
    // POSTs on the wire.
    const maxAdvanceDays$ = this.bookingPolicyService.maxAdvanceDays$;

    const lang$ = this.translate.onLangChange.pipe(
      map((event: LangChangeEvent) => event.lang),
      startWith(this.translate.currentLang)
    );

    combineLatest([
      this.store.pipe(select(selectScheduleFilter)),
      this.store.pipe(select(selectProvinceWithStation)),
      lang$,
      maxAdvanceDays$,
    ])
      .pipe(
        map(([filter, stations, lang, maxAdvanceDays]) => {
          const windowDays = buildDayWindow(
            filter?.departureDate,
            new Date(),
            maxAdvanceDays
          );
          return {
            filter: filter ?? null,
            lang,
            maxAdvanceDays,
            windowDays,
            request: availabilityRequestFor(
              filter,
              stations as StationApi[],
              windowDays
            ),
          } as DayStripContext;
        }),
        // Chips render on EVERY emission, before availability is asked for:
        // they are their own reserved space and the strip is fully usable
        // without the answer, which only ever removes options. No spinner, no
        // skeleton — a spinner would advertise a wait that blocks nothing.
        tap((context) => {
          this.context = context;
          this.renderChips();
        }),
        // One tap slides the window, so the question changes and is asked once.
        // The several `scheduleFilter` emissions a single change produces
        // collapse here.
        distinctUntilChanged(
          (previous, current) =>
            availabilityRequestKey(previous.request) ===
            availabilityRequestKey(current.request)
        ),
        tap((context) => {
          this.availability = null;
          this.isAvailabilityInFlight = !!context.request;
          this.renderChips();
        }),
        switchMap((context) =>
          context.request
            ? this.scheduleService.getAvailabilityCached(context.request)
            : of(null)
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((availability) => {
        this.availability = availability;
        this.isAvailabilityInFlight = false;
        this.renderChips();
      });
  }

  ngAfterViewChecked(): void {
    this.scrollSelectedIntoView();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * An unavailable chip no-ops: no dispatch, no request, no toast. It keeps its
   * place in the tab order (`aria-disabled`, never the native `disabled`) so a
   * keyboard user can still reach it and hear WHY the day is dead.
   */
  selectDay(day: DayChip): void {
    if (day.state === 'unavailable' || day.state === 'selected') {
      return;
    }
    const context = this.context;
    if (!context?.filter) {
      return;
    }

    this.store.dispatch(
      invokeSetScheduleFilterApi({
        schedule_filter: scheduleFilterForDay(
          context.filter,
          day.iso,
          dayjs().add(context.maxAdvanceDays, 'day').toDate()
        ),
      })
    );
  }

  private renderChips(): void {
    const context = this.context;
    this.isSearchable = !!context?.request;
    if (!context) {
      this.days = [];
      return;
    }

    const selectedIso = this.selectedIso(context);
    const availableDates = this.availability?.availableDates ?? [];
    const effectiveDays = this.availability?.effectiveDays ?? 0;

    this.days = context.windowDays.map((iso, index) => {
      const chip = formatDayChip(dayjs(iso).toDate(), context.lang);
      return {
        iso,
        weekdayLabel: dayjs(iso).isSame(dayjs(), 'day')
          ? this.translate.instant('SCHEDULE_BOOKING.DAY_STRIP_TODAY')
          : chip.weekday,
        dateLabel: chip.date,
        state: this.resolveState(
          iso,
          index,
          selectedIso,
          availableDates,
          effectiveDays
        ),
      };
    });
  }

  private resolveState(
    iso: string,
    index: number,
    selectedIso: string,
    availableDates: string[],
    effectiveDays: number
  ): DayChipState {
    if (iso === selectedIso) return 'selected';
    // No answer yet (in flight, failed, or nothing to ask) leaves every chip
    // enabled — see `DayChipState` for why `unknown` is not a third look.
    if (!this.availability) return 'available';
    if (index >= effectiveDays) return 'unknown';
    return availableDates.includes(iso) ? 'available' : 'unavailable';
  }

  /** The window is already clamped to [today, cap], so the selected day is the
   *  filter's date clamped the same way — which is what the window's own
   *  clamping produced. */
  private selectedIso(context: DayStripContext): string {
    const selected = dayjs(context.filter?.departureDate ?? undefined);
    const iso =
      context.filter?.departureDate && selected.isValid()
        ? selected.format('YYYY-MM-DD')
        : '';
    if (context.windowDays.includes(iso)) return iso;
    const first = context.windowDays[0];
    const last = context.windowDays[context.windowDays.length - 1];
    return iso && iso > last ? last : first;
  }

  /**
   * Required, not decoration: the window slides on every tap, so on a phone the
   * selected chip would otherwise land off-screen and AC#1 fails. `block:
   * 'nearest'` is load-bearing — without it the PAGE scrolls vertically.
   */
  private scrollSelectedIntoView(): void {
    const selected = this.days.find((day) => day.state === 'selected');
    if (!selected || selected.iso === this.lastScrolledIso) {
      return;
    }
    const index = this.days.indexOf(selected);
    const element = this.chipRefs?.get(index)?.nativeElement;
    if (!element?.scrollIntoView) {
      return;
    }
    this.lastScrolledIso = selected.iso;
    element.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
