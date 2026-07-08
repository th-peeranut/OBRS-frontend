import { Component, OnInit, ViewChild } from '@angular/core';
import { Store } from '@ngrx/store';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Menu } from 'primeng/menu';
import dayjs from 'dayjs';
import { Observable, combineLatest, map, startWith } from 'rxjs';
import {
  CANCELLABLE_BOOKING_STATUS,
  MyBookingDto,
  MyBookingView,
  RESCHEDULE_WINDOW_HOURS,
  SupportedLocale,
  getStopLabel,
  normalizeStatusCode,
  toAmountNumber,
} from '../../shared/interfaces/my-booking.interface';
import { CHANGE_SEAT_WINDOW_HOURS } from '../../shared/interfaces/change-seat.interface';
import {
  closeChangeSeatDialog,
  closeRescheduleDialog,
  invokeLoadMyBookingsApi,
  openChangeSeatDialog,
  openRescheduleDialog,
  requestCancelBooking,
} from './store/my-bookings.action';
import {
  selectChangeSeatDialogBookingId,
  selectMyBookings,
  selectRescheduleDialogBookingId,
} from './store/my-bookings.selector';

interface MyBookingsVm {
  items: MyBookingView[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  cancellingBookingId: number | null;
}

interface RescheduleEligibility {
  eligible: boolean;
  reasonKey: string | null;
}

interface ChangeSeatEligibility {
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

  /** Single shared popup menu, rebuilt per row on open — same pattern as
   * `WalkInTripBrowserComponent.tripActionMenu` (staff module). */
  @ViewChild('actionMenu') actionMenu!: Menu;
  actionMenuItems: ActionMenuItem[] = [];
  private lastActionMenuTrigger: HTMLButtonElement | null = null;

  readonly statusFilters: StatusFilterOption[] = [
    { value: '', labelKey: 'MY_BOOKINGS.FILTERS.ALL' },
    { value: 'confirmed', labelKey: 'MY_BOOKINGS.FILTERS.CONFIRMED' },
    { value: 'pending', labelKey: 'MY_BOOKINGS.FILTERS.PENDING' },
    { value: 'cancelled', labelKey: 'MY_BOOKINGS.FILTERS.CANCELLED' },
    { value: 'expired', labelKey: 'MY_BOOKINGS.FILTERS.EXPIRED' },
  ];

  vm$!: Observable<MyBookingsVm>;

  private readonly monthLabels: Record<SupportedLocale, readonly string[]> = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
    zh: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  };

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
      }))
    );

    this.rescheduleDialogBookingId$ = this.store.select(selectRescheduleDialogBookingId);
    this.changeSeatDialogBookingId$ = this.store.select(selectChangeSeatDialogBookingId);

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
        command: () => this.onViewTicket(booking),
      });
    }

    items.push({
      label: this.translate.instant('MY_BOOKINGS.RESCHEDULE.ACTION'),
      disabled: !booking.rescheduleEligible,
      reasonText: booking.rescheduleEligible
        ? undefined
        : this.translate.instant(booking.rescheduleReasonKey ?? ''),
      command: () => this.onReschedule(booking),
    });

    items.push({
      label: this.translate.instant('MY_BOOKINGS.CHANGE_SEAT.ACTION'),
      disabled: !booking.changeSeatEligible,
      reasonText: booking.changeSeatEligible
        ? undefined
        : this.translate.instant(booking.changeSeatReasonKey ?? ''),
      command: () => this.onChangeSeat(booking),
    });

    if (booking.cancellable) {
      items.push({
        label: this.translate.instant('MY_BOOKINGS.CANCEL.ACTION'),
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

    return {
      id: booking.id,
      bookingNumber: booking.bookingNumber?.trim() || `#BK-${booking.id}`,
      statusCode,
      bookingType: normalizeStatusCode(booking.bookingType) || 'one_way',
      route,
      departureLabel: this.formatDateTime(firstLeg?.departureDateTime, locale),
      passengerCount: firstLeg?.tickets?.length ?? 0,
      totalAmount,
      totalAmountLabel: this.formatCurrency(totalAmount),
      createdLabel: this.formatDateTime(booking.createdAt, locale),
      cancellable: statusCode === CANCELLABLE_BOOKING_STATUS,
      paid: statusCode === CANCELLABLE_BOOKING_STATUS,
      rescheduleEligible: rescheduleEligibility.eligible,
      rescheduleReasonKey: rescheduleEligibility.reasonKey,
      changeSeatEligible: changeSeatEligibility.eligible,
      changeSeatReasonKey: changeSeatEligibility.reasonKey,
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

    if (Number(booking.seatChangeCount ?? 0) >= 1) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.CHANGE_SEAT.REASON.ALREADY_USED' };
    }

    const departure = dayjs(schedules?.[0]?.departureDateTime);
    if (!departure.isValid() || departure.diff(dayjs(), 'hour', true) <= CHANGE_SEAT_WINDOW_HOURS) {
      return { eligible: false, reasonKey: 'MY_BOOKINGS.CHANGE_SEAT.REASON.NO_WINDOW' };
    }

    return { eligible: true, reasonKey: null };
  }

  private formatDateTime(
    value: string | undefined,
    locale: SupportedLocale
  ): string {
    if (!value) {
      return '-';
    }
    const date = dayjs(value);
    if (!date.isValid()) {
      return '-';
    }
    const month = this.monthLabels[locale][date.month()];
    return `${date.date()} ${month} ${date.year()} • ${date.format('HH:mm')}`;
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
