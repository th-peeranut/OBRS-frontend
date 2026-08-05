import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Store } from '@ngrx/store';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import dayjs from 'dayjs';
import { formatDisplayDateTime } from '../../shared/lib/display-date-time';
import { Observable, combineLatest, map, startWith, tap } from 'rxjs';
import {
  CANCELLABLE_BOOKING_STATUS,
  CancellationPolicy,
  MyBookingDto,
  MyBookingView,
  RESCHEDULE_WINDOW_HOURS,
  SupportedLocale,
  getStopLabel,
  normalizeStatusCode,
  toAmountNumber,
} from '../../shared/interfaces/my-booking.interface';
import { CHANGE_SEAT_WINDOW_HOURS } from '../../shared/interfaces/change-seat.interface';
import { CHANGE_STOP_WINDOW_HOURS } from '../../shared/interfaces/change-stop.interface';
import { RefundDestinationReqDto } from '../../shared/interfaces/refund-destination.interface';
import {
  closeCancelRefundDestinationModal,
  closeChangeSeatDialog,
  closeChangeStopDialog,
  closeRescheduleDialog,
  confirmCancelWithDestination,
  invokeLoadMoreMyBookingsApi,
  invokeLoadMyBookingsApi,
  openChangeSeatDialog,
  openChangeStopDialog,
  openRescheduleDialog,
  requestCancelBooking,
} from './store/my-bookings.action';
import {
  selectCancelRefundDestinationModal,
  selectChangeSeatDialogBookingId,
  selectChangeStopDialogBookingId,
  selectMyBookings,
  selectRescheduleDialogBookingId,
} from './store/my-bookings.selector';

interface MyBookingsVm {
  items: MyBookingView[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  cancellingBookingId: number | null;
  /** OBRS-577 — total rows for the active filter, for the count line. */
  totalElements: number;
  /** OBRS-577 — whether the "Load more" button should render. */
  hasMore: boolean;
  /** OBRS-577 — a Load more request is in flight (never the first load / a
   * filter switch, which use `loading` instead). */
  loadingMore: boolean;
}

interface RescheduleEligibility {
  eligible: boolean;
  reasonKey: string | null;
}

interface ChangeSeatEligibility {
  eligible: boolean;
  reasonKey: string | null;
}

interface ChangeStopEligibility {
  eligible: boolean;
  reasonKey: string | null;
}

/** A single card's overflow menu item. Reschedule is always included
 * (disabled + `reasonText` when ineligible — never omitted); View e-ticket /
 * Cancel booking keep their existing conditional presence. */
export interface ActionMenuItem extends MenuItem {
  /** Localized disabled-reason, rendered as subtext under the label. */
  reasonText?: string;
  /** Destructive item (Cancel booking) — styled distinctly from the rest. */
  danger?: boolean;
  /** This specific row's cancel is in flight — shows an inline spinner. */
  submitting?: boolean;
  // `icon` (inherited from PrimeNG's `MenuItem`) is a leading `bi bi-*`
  // bootstrap-icon class — every item sets one so the menu never renders
  // PrimeNG's blank icon-slot gutter (OBRS-170).
}

interface StatusFilterOption {
  /** API status slug, or '' for "all". */
  value: string;
  labelKey: string;
}

@Component({
    selector: 'app-my-bookings',
    templateUrl: './my-bookings.component.html',
    styleUrl: './my-bookings.component.scss',
    standalone: false
})
export class MyBookingsComponent implements OnInit {
  selectedStatus = '';
  readonly skeletonRows = Array.from({ length: 3 });

  /** Booking whose e-ticket modal is open, or null when closed. */
  activeTicketBookingId: number | null = null;

  /** Booking whose reschedule dialog is open — NgRx-driven so the dialog
   * opens optimistically the instant `openRescheduleDialog` dispatches. */
  rescheduleDialogBookingId$!: Observable<number | null>;

  /** Booking whose change-seat dialog is open — same optimistic-open
   * contract as `rescheduleDialogBookingId$` (OBRS-110). */
  changeSeatDialogBookingId$!: Observable<number | null>;

  /** Booking whose change-stop dialog is open — same optimistic-open
   * contract as `rescheduleDialogBookingId$` (OBRS-110 wave 2). */
  changeStopDialogBookingId$!: Observable<number | null>;

  /** OBRS-286 Flow A1 — non-null while the cancel-with-destination modal is
   * open (replaces the plain Swal confirm for a manual-refund cancel). */
  cancelRefundDestinationModal$!: Observable<{
    booking: MyBookingView;
    policy: CancellationPolicy;
    error: string | null;
  } | null>;

  /** Single shared popup menu, rebuilt per row on open — same pattern as
   * `WalkInTripBrowserComponent.tripActionMenu` (staff module). */
  @ViewChild('actionMenu') actionMenu!: Menu;
  actionMenuItems: ActionMenuItem[] = [];
  private lastActionMenuTrigger: HTMLButtonElement | null = null;

  /** OBRS-577 accessibility: the count line's own DOM node (`tabindex="-1"`),
   * the focus target when the last "Load more" click removes the button
   * itself from the DOM (see `maybeShiftFocusAfterLoadMore` below). */
  @ViewChild('countRegion') countRegionRef?: ElementRef<HTMLElement>;
  /** Set synchronously in `onLoadMore()`; consumed (and cleared) the moment
   * `loadingMore` next flips back to false — i.e. exactly that click's own
   * response, success or failure, never a later unrelated state change. Scoped
   * to the `loadingMore` transition rather than `hasMore` itself so a
   * status-filter switch (which also changes `hasMore`) can never be
   * misread as "that load-more click's response". */
  private awaitingLoadMoreFocusShift = false;
  private previousLoadingMore = false;

  readonly statusFilters: StatusFilterOption[] = [
    { value: '', labelKey: 'MY_BOOKINGS.FILTERS.ALL' },
    { value: 'confirmed', labelKey: 'MY_BOOKINGS.FILTERS.CONFIRMED' },
    { value: 'pending', labelKey: 'MY_BOOKINGS.FILTERS.PENDING' },
    { value: 'cancelled', labelKey: 'MY_BOOKINGS.FILTERS.CANCELLED' },
    { value: 'expired', labelKey: 'MY_BOOKINGS.FILTERS.EXPIRED' },
  ];

  vm$!: Observable<MyBookingsVm>;

  constructor(
    private readonly store: Store,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    const locale$ = this.translate.onLangChange.pipe(
      map((event: LangChangeEvent) => this.normalizeLocale(event.lang)),
      startWith(this.normalizeLocale(this.translate.currentLang))
    );

    this.vm$ = combineLatest([this.store.select(selectMyBookings), locale$]).pipe(
      map(([state, locale]) => ({
        items: state.bookings.map((booking) => this.toView(booking, locale)),
        loading: state.loading,
        loaded: state.loaded,
        error: state.error,
        cancellingBookingId: state.cancellingBookingId,
        totalElements: state.totalElements,
        hasMore: state.totalPages > 0 && state.pagesLoaded < state.totalPages,
        loadingMore: state.loadingMore,
      })),
      tap((vm) => this.maybeShiftFocusAfterLoadMore(vm))
    );

    this.rescheduleDialogBookingId$ = this.store.select(selectRescheduleDialogBookingId);
    this.changeSeatDialogBookingId$ = this.store.select(selectChangeSeatDialogBookingId);
    this.changeStopDialogBookingId$ = this.store.select(selectChangeStopDialogBookingId);
    this.cancelRefundDestinationModal$ = this.store.select(selectCancelRefundDestinationModal);

    this.store.dispatch(invokeLoadMyBookingsApi({ status: null }));
  }

  onStatusChange(status: string): void {
    if (status === this.selectedStatus) {
      return;
    }
    this.selectedStatus = status;
    // Switching filters keeps the current cards on screen, so surface the
    // global loading dialog instead of the (first-load only) skeletons.
    this.store.dispatch(
      invokeLoadMyBookingsApi({ status: status || null, showLoading: true })
    );
  }

  onCancel(booking: MyBookingView): void {
    this.store.dispatch(requestCancelBooking({ booking }));
  }

  // --- Cancel-with-destination modal (OBRS-286 Flow A1) ---

  onConfirmCancelWithDestination(
    booking: MyBookingView,
    event: { refundDestination?: RefundDestinationReqDto }
  ): void {
    this.store.dispatch(
      confirmCancelWithDestination({ booking, refundDestination: event.refundDestination })
    );
  }

  onCancelRefundDestinationModalClosed(): void {
    this.store.dispatch(closeCancelRefundDestinationModal());
  }

  /**
   * OBRS-813 — the traveler took the other door offered inside the cancel
   * modal. Closes the cancel modal and hands them to the SAME reschedule
   * dialog the card menu opens (`onReschedule`), including its eligibility
   * guard: one entry point, so a booking the backend would refuse can't get in
   * through this one. Nothing is cancelled — the cancel was never submitted.
   */
  onRescheduleInsteadOfCancel(booking: MyBookingView): void {
    this.store.dispatch(closeCancelRefundDestinationModal());
    this.onReschedule(booking);
  }

  /**
   * Builds and opens the single per-card overflow menu (View e-ticket,
   * Reschedule, Cancel booking). Reschedule is always included — disabled
   * with its localized reason as `reasonText` when ineligible, never
   * omitted, since presenting *some* Reschedule affordance (even a disabled
   * one explaining why) is the whole point of OBRS-83. View e-ticket / Cancel
   * booking keep their existing conditional presence (only shown when
   * applicable), same as the previous inline-button layout.
   */
  openActionMenu(event: Event, booking: MyBookingView, cancellingBookingId: number | null): void {
    event.stopPropagation();

    const items: ActionMenuItem[] = [];

    if (booking.paid) {
      items.push({
        label: this.translate.instant('MY_BOOKINGS.VIEW_TICKET'),
        icon: 'bi-ticket-perforated',
        command: () => this.onViewTicket(booking),
      });
    }

    items.push({
      label: this.translate.instant('MY_BOOKINGS.RESCHEDULE.ACTION'),
      icon: 'bi-arrow-repeat',
      disabled: !booking.rescheduleEligible,
      reasonText: booking.rescheduleEligible
        ? undefined
        : this.translate.instant(booking.rescheduleReasonKey ?? ''),
      command: () => this.onReschedule(booking),
    });

    items.push({
      label: this.translate.instant('MY_BOOKINGS.CHANGE_SEAT.ACTION'),
      icon: 'bi-grid-3x3-gap',
      disabled: !booking.changeSeatEligible,
      reasonText: booking.changeSeatEligible
        ? undefined
        : this.translate.instant(booking.changeSeatReasonKey ?? ''),
      command: () => this.onChangeSeat(booking),
    });

    items.push({
      label: this.translate.instant('MY_BOOKINGS.CHANGE_STOP.ACTION'),
      icon: 'bi-geo-alt',
      disabled: !booking.changeStopEligible,
      reasonText: booking.changeStopEligible
        ? undefined
        : this.translate.instant(booking.changeStopReasonKey ?? ''),
      command: () => this.onChangeStop(booking),
    });

    if (booking.cancellable) {
      items.push({
        label: this.translate.instant('MY_BOOKINGS.CANCEL.ACTION'),
        icon: 'bi-x-circle',
        danger: true,
        disabled: cancellingBookingId !== null,
        submitting: cancellingBookingId === booking.id,
        command: () => this.onCancel(booking),
      });
    }

    this.actionMenuItems = items;
    this.lastActionMenuTrigger = event.currentTarget as HTMLButtonElement;
    this.actionMenu.toggle(event);
  }

  /** Restores focus to the trigger button that opened the menu — same
   * pattern as `WalkInTripBrowserComponent.onTripMenuHide`. */
  onActionMenuHide(): void {
    this.lastActionMenuTrigger?.focus();
    this.lastActionMenuTrigger = null;
  }

  /** Opens the reschedule dialog optimistically — the dialog itself owns its
   * own background data loads (design-system §6: modals open optimistically,
   * never gated on an awaited fetch). */
  onReschedule(booking: MyBookingView): void {
    if (!booking.rescheduleEligible) {
      return;
    }
    this.store.dispatch(openRescheduleDialog({ bookingId: booking.id }));
  }

  onRescheduleDialogClosed(): void {
    this.store.dispatch(closeRescheduleDialog());
  }

  /** Opens the change-seat dialog optimistically — the dialog itself owns
   * its own background data loads (design-system §6). */
  onChangeSeat(booking: MyBookingView): void {
    if (!booking.changeSeatEligible) {
      return;
    }
    this.store.dispatch(openChangeSeatDialog({ bookingId: booking.id }));
  }

  onChangeSeatDialogClosed(): void {
    this.store.dispatch(closeChangeSeatDialog());
  }

  /** Opens the change-stop dialog optimistically — the dialog itself owns
   * its own background data loads (design-system §6). */
  onChangeStop(booking: MyBookingView): void {
    if (!booking.changeStopEligible) {
      return;
    }
    this.store.dispatch(openChangeStopDialog({ bookingId: booking.id }));
  }

  onChangeStopDialogClosed(): void {
    this.store.dispatch(closeChangeStopDialog());
  }

  /** Open the e-ticket modal for a paid booking. */
  onViewTicket(booking: MyBookingView): void {
    this.activeTicketBookingId = booking.id;
  }

  onCloseTicket(): void {
    this.activeTicketBookingId = null;
  }

  onRetry(): void {
    this.store.dispatch(
      invokeLoadMyBookingsApi({
        status: this.selectedStatus || null,
        showLoading: true,
      })
    );
  }

  /** OBRS-577 AC2/AC6 — dispatches the next page fetch. No status/page
   * payload: the effect reads `statusFilter`/`pagesLoaded` off the current
   * state itself (see `MyBookingsEffect.loadMoreMyBookings$`). */
  onLoadMore(): void {
    this.awaitingLoadMoreFocusShift = true;
    this.store.dispatch(invokeLoadMoreMyBookingsApi());
  }

  /**
   * OBRS-577 Accessibility — when the "Load more" button's own click turns
   * out to be the LAST page (`hasMore` becomes false), the button is removed
   * from the DOM and, left alone, the browser drops focus to `<body>`. Moves
   * it to the count line's region instead. Gated on the `loadingMore`
   * true→false transition (that click settling) rather than on `hasMore`
   * alone, so a status-filter switch — which can also flip `hasMore` — is
   * never misattributed to a Load more click that never happened.
   */
  private maybeShiftFocusAfterLoadMore(vm: MyBookingsVm): void {
    const loadMoreJustSettled = this.previousLoadingMore && !vm.loadingMore;
    this.previousLoadingMore = vm.loadingMore;

    if (!loadMoreJustSettled || !this.awaitingLoadMoreFocusShift) {
      return;
    }
    this.awaitingLoadMoreFocusShift = false;

    if (vm.hasMore) {
      // More pages remain — the button stays put, nothing to shift away from.
      return;
    }
    // Deferred a tick so the button has actually left the DOM (the `@if`
    // re-render that removes it) before focus is moved off it.
    setTimeout(() => this.countRegionRef?.nativeElement.focus({ preventScroll: true }));
  }

  trackById(_index: number, booking: MyBookingView): number {
    return booking.id;
  }

  statusClass(statusCode: string): string {
    switch (statusCode) {
      case 'confirmed':
        return 'is-success';
      case 'pending':
        return 'is-warning';
      case 'refunded':
        return 'is-info';
      default:
        // cancelled, expired, and any unknown status
        return 'is-danger';
    }
  }

  private toView(booking: MyBookingDto, locale: SupportedLocale): MyBookingView {
    const schedules = booking.bookingSchedules ?? [];
    const firstLeg = schedules[0];
    const fromLabel = getStopLabel(firstLeg?.fromStop, locale);
    const toLabel = getStopLabel(firstLeg?.toStop, locale);
    const route =
      fromLabel && toLabel
        ? `${fromLabel} → ${toLabel}`
        : fromLabel || toLabel || '-';

    const statusCode = normalizeStatusCode(booking.status);
    const totalAmount = toAmountNumber(booking.totalAmount);
    const rescheduleEligibility = this.computeRescheduleEligibility(booking, statusCode, schedules);
    const changeSeatEligibility = this.computeChangeSeatEligibility(booking, statusCode, schedules);
    const changeStopEligibility = this.computeChangeStopEligibility(booking, statusCode, schedules);

    return {
      id: booking.id,
      bookingNumber: booking.bookingNumber?.trim() || `#BK-${booking.id}`,
      statusCode,
      bookingType: normalizeStatusCode(booking.bookingType) || 'one_way',
      route,
      departureLabel: formatDisplayDateTime(firstLeg?.departureDateTime, locale),
      // OBRS-635: read the server-computed count, NEVER firstLeg.tickets.length —
      // this endpoint leaves `tickets` null by design, so counting it printed
      // "0 passengers" on every card. See MyBookingScheduleDto.passengerCount.
      passengerCount: firstLeg?.passengerCount ?? 0,
      totalAmount,
      totalAmountLabel: this.formatCurrency(totalAmount),
      createdLabel: formatDisplayDateTime(booking.createdAt, locale),
      cancellable: statusCode === CANCELLABLE_BOOKING_STATUS,
      paid: statusCode === CANCELLABLE_BOOKING_STATUS,
      rescheduleEligible: rescheduleEligibility.eligible,
      rescheduleReasonKey: rescheduleEligibility.reasonKey,
      changeSeatEligible: changeSeatEligibility.eligible,
      changeSeatReasonKey: changeSeatEligibility.reasonKey,
      changeStopEligible: changeStopEligibility.eligible,
      changeStopReasonKey: changeStopEligibility.reasonKey,
    };
  }

  /**
   * Mirrors the backend's reschedule prerequisites (see
   * OBRS-backend/docs/api/booking.md) so the card never presents Reschedule
   * as available when the server would reject it (acceptance criterion #3).
   * First failing check wins; the server remains the final authority.
   */
  private computeRescheduleEligibility(
    booking: MyBookingDto,
    statusCode: string,
    schedules: MyBookingDto['bookingSchedules']
  ): RescheduleEligibility {
    if (statusCode !== CANCELLABLE_BOOKING_STATUS) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.RESCHEDULE.REASON.NOT_CONFIRMED' };
    }

    const bookingType = normalizeStatusCode(booking.bookingType) || 'one_way';
    if (bookingType !== 'one_way' || (schedules?.length ?? 0) !== 1) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.RESCHEDULE.REASON.NOT_ONE_WAY' };
    }

    if (Number(booking.rescheduleCount ?? 0) >= 1) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.RESCHEDULE.REASON.ALREADY_USED' };
    }

    const departure = dayjs(schedules?.[0]?.departureDateTime);
    if (!departure.isValid() || departure.diff(dayjs(), 'hour', true) <= RESCHEDULE_WINDOW_HOURS) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.RESCHEDULE.REASON.NO_WINDOW' };
    }

    return { eligible: true, reasonKey: null };
  }

  /**
   * Mirrors the backend's change-seat prerequisites (OBRS-110; see
   * OBRS-backend/docs/api/booking.md) so the card never presents Change seat
   * as available when the server would reject it. First failing check wins;
   * the server remains the final authority. Unlike reschedule, there is no
   * 30-day/TOO_FAR check — change-seat only cares about the 4h window.
   */
  private computeChangeSeatEligibility(
    booking: MyBookingDto,
    statusCode: string,
    schedules: MyBookingDto['bookingSchedules']
  ): ChangeSeatEligibility {
    if (statusCode !== CANCELLABLE_BOOKING_STATUS) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.CHANGE_SEAT.REASON.NOT_CONFIRMED' };
    }

    const bookingType = normalizeStatusCode(booking.bookingType) || 'one_way';
    if (bookingType !== 'one_way' || (schedules?.length ?? 0) !== 1) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.CHANGE_SEAT.REASON.NOT_ONE_WAY' };
    }

    // OBRS-483: an OPEN-seating schedule (the real fleet's default,
    // OBRS-358) has no assigned seat to change at all — a domain rule, not
    // a limitation. Ineligible actions stay rendered but disabled with a
    // reason (design-system §6/§11, my-bookings.component.ts's own
    // established convention), never hidden.
    if (schedules?.[0]?.seatingMode === 'OPEN') {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.CHANGE_SEAT.REASON.OPEN_SEATING' };
    }

    if (Number(booking.seatChangeCount ?? 0) >= 1) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.CHANGE_SEAT.REASON.ALREADY_USED' };
    }

    const departure = dayjs(schedules?.[0]?.departureDateTime);
    if (!departure.isValid() || departure.diff(dayjs(), 'hour', true) <= CHANGE_SEAT_WINDOW_HOURS) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.CHANGE_SEAT.REASON.NO_WINDOW' };
    }

    return { eligible: true, reasonKey: null };
  }

  /**
   * Mirrors the backend's change-stop prerequisites (OBRS-110 wave 2; see
   * OBRS-backend/docs/api/booking.md) so the card never presents Change stop
   * as available when the server would reject it. First failing check wins;
   * the server remains the final authority. Like change-seat (and unlike
   * reschedule), there is no 30-day/TOO_FAR check — change-stop doesn't move
   * the departure date, only the pickup/drop-off stops.
   */
  private computeChangeStopEligibility(
    booking: MyBookingDto,
    statusCode: string,
    schedules: MyBookingDto['bookingSchedules']
  ): ChangeStopEligibility {
    if (statusCode !== CANCELLABLE_BOOKING_STATUS) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.CHANGE_STOP.REASON.NOT_CONFIRMED' };
    }

    const bookingType = normalizeStatusCode(booking.bookingType) || 'one_way';
    if (bookingType !== 'one_way' || (schedules?.length ?? 0) !== 1) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.CHANGE_STOP.REASON.NOT_ONE_WAY' };
    }

    // OBRS-483: unlike change-seat (OPEN has no assigned seat to change — a
    // permanent domain rule), change-stop is fully available on OPEN — the
    // backend now supports it (the headline feature of this card; the
    // pickup/drop-off segment concept is independent of seating mode).
    // Deliberately no OPEN gate here.

    if (Number(booking.stopChangeCount ?? 0) >= 1) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.CHANGE_STOP.REASON.ALREADY_USED' };
    }

    const departure = dayjs(schedules?.[0]?.departureDateTime);
    if (!departure.isValid() || departure.diff(dayjs(), 'hour', true) <= CHANGE_STOP_WINDOW_HOURS) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.CHANGE_STOP.REASON.NO_WINDOW' };
    }

    return { eligible: true, reasonKey: null };
  }


  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 2,
    }).format(value);
  }

  private normalizeLocale(locale: string | null | undefined): SupportedLocale {
    const value = (locale || '').toLowerCase();
    if (value.startsWith('th')) {
      return 'th';
    }
    if (value.startsWith('zh')) {
      return 'zh';
    }
    return 'en';
  }
}
