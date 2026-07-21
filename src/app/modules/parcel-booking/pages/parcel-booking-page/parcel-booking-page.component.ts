import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import dayjs from 'dayjs';
import { StationService } from '../../../../services/station/station.service';
import { ParcelBookingService } from '../../../../services/parcel-booking/parcel-booking.service';
import { BookingService } from '../../../../services/booking/booking.service';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import { ParcelOnlineQuoteParams, ParcelOnlineReqDto, ParcelQuoteRespDto } from '../../../../shared/interfaces/parcel.interface';
import { ParcelBookingProgressStep } from '../../components/parcel-booking-progress/parcel-booking-progress.component';
import { ParcelScheduleOption, ParcelTripFormValue } from '../../components/parcel-trip-form/parcel-trip-form.component';
import { ParcelDetailsFormValue } from '../../components/parcel-details-form/parcel-details-form.component';
import { stashParcelBookingAmount } from '../../parcel-booking-amount-session';
import { mapApiErrorCode } from '../../../../shared/lib/api-error-code';

type ParcelBookingPhase = 'trip' | 'details' | 'payment';
type PaymentTab = 'creditcard' | 'qrcode';

const QUOTE_ERROR_KEYS: Record<string, string> = {
  PARCEL_STOP_PAIR_NOT_PRICEABLE: 'PARCEL_BOOKING.ERROR.STOP_PAIR_NOT_PRICEABLE',
  'schedule.error.id-not-found': 'PARCEL_BOOKING.ERROR.NOT_FOUND',
  'stop.error.id-not-found': 'PARCEL_BOOKING.ERROR.NOT_FOUND',
};

const SUBMIT_ERROR_KEYS: Record<string, string> = {
  PARCEL_PROHIBITED_NOT_ACKNOWLEDGED: 'PARCEL_BOOKING.ERROR.PROHIBITED_NOT_ACK',
  PARCEL_WEIGHT_EXCEEDS_MAX: 'PARCEL_BOOKING.ERROR.WEIGHT_EXCEEDS_MAX',
  PARCEL_RECIPIENT_REQUIRED: 'PARCEL_BOOKING.ERROR.RECIPIENT_REQUIRED',
  PARCEL_RECIPIENT_PHONE_INVALID: 'PARCEL_BOOKING.ERROR.RECIPIENT_PHONE_INVALID',
  PARCEL_STOP_ORDER_INVALID: 'PARCEL_BOOKING.ERROR.STOP_ORDER_INVALID',
  PARCEL_PROHIBITED_CATEGORY: 'PARCEL_BOOKING.ERROR.PROHIBITED_CATEGORY',
  PARCEL_STOP_PAIR_NOT_PRICEABLE: 'PARCEL_BOOKING.ERROR.STOP_PAIR_NOT_PRICEABLE',
  PARCEL_CARGO_CAPACITY_NOT_CONFIGURED: 'PARCEL_BOOKING.ERROR.CARGO_NOT_CONFIGURED',
  PARCEL_CARGO_CAPACITY_EXCEEDED: 'PARCEL_BOOKING.ERROR.CARGO_CAPACITY_EXCEEDED',
  // Defensive 409 (ParcelIntakeService#resolveSenderName): the account's
  // profile has no firstName/lastName to derive contact_name_snapshot from.
  // Not in the UX §7 error table (added by the backend after its own
  // scrutinize pass) — mapped here rather than falling through to GENERIC,
  // since the guard's whole point is a clean, actionable message.
  PARCEL_SENDER_NAME_UNRESOLVED: 'PARCEL_BOOKING.ERROR.SENDER_NAME_UNRESOLVED',
  'schedule.error.id-not-found': 'PARCEL_BOOKING.ERROR.NOT_FOUND',
  'stop.error.id-not-found': 'PARCEL_BOOKING.ERROR.NOT_FOUND',
};

/**
 * Smart page: `/parcel-booking` — the customer online consigned-parcel
 * booking wizard (SPEC/UX-OBRS-415). One route, an in-page 3-phase state
 * machine (Trip → Details → Payment) — deliberately NOT the 5-route
 * seat-booking funnel and NOT routed through `/payment` (UX-OBRS-415 §1):
 * a parcel booking has none of the multi-passenger/round-trip state those
 * stores exist for, and reusing `PaymentMethodsModule`'s dumb components
 * directly (not the routed `PaymentModule`) is the whole point.
 *
 * Bypasses NgRx for station/schedule search entirely (UX §3) — calls the
 * EXISTING `StationService` directly rather than dispatching through the
 * `station`/`scheduleFilter`/`scheduleList` feature stores, which are built
 * around multi-passenger/round-trip concepts this flow doesn't have.
 *
 * Schedule search (OBRS-415 rewire) goes through
 * `ParcelBookingService.searchParcelSchedules` — the dedicated
 * `POST /api/private/parcels/schedules/search` endpoint — NOT the passenger
 * `ScheduleService.getByFilter`. The passenger search filters on seat
 * availability (`numberOfPassengers`), which silently hides a schedule that
 * is seat-full but still has free cargo quota; a consigned parcel takes zero
 * seats, so that filter is wrong here.
 */
@Component({
  selector: 'app-parcel-booking-page',
  templateUrl: './parcel-booking-page.component.html',
  styleUrl: './parcel-booking-page.component.scss',
})
export class ParcelBookingPageComponent implements OnInit, OnDestroy {
  protected readonly steps: ParcelBookingProgressStep[] = [
    { labelKey: 'PARCEL_BOOKING.STEP.TRIP' },
    { labelKey: 'PARCEL_BOOKING.STEP.DETAILS' },
    { labelKey: 'PARCEL_BOOKING.STEP.PAYMENT' },
  ];

  protected phase: ParcelBookingPhase = 'trip';
  protected readonly minDate = new Date();

  // --- Trip phase state ---
  protected allStations: StationApi[] = [];
  protected fromStationOptions: StationApi[] = [];
  protected toStationOptions: StationApi[] = [];
  protected scheduleOptions: ParcelScheduleOption[] = [];
  protected isLoadingSchedules = false;
  protected noSchedulesFound = false;
  private fromStationId: number | null = null;
  private toStationId: number | null = null;
  private selectedDate: Date = new Date();
  private scheduleId: number | null = null;

  // --- Resolved trip selection (carried into Details/Payment) ---
  protected tripValue: ParcelTripFormValue | null = null;

  // --- Details phase state ---
  protected senderNameDisplay = '';
  protected senderPhonePrefill: string | null = null;
  protected quote: ParcelQuoteRespDto | null = null;
  protected isLoadingQuote = false;
  protected quoteErrorKey: string | null = null;
  protected serverErrorKey: string | null = null;
  protected isSubmitting = false;

  // --- Payment phase state ---
  protected activeTab: PaymentTab = 'creditcard';
  protected trackingNumber = '';
  protected amount = 0;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly stationService: StationService,
    private readonly parcelBookingService: ParcelBookingService,
    private readonly bookingService: BookingService
  ) {}

  ngOnInit(): void {
    this.stationService
      .getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.allStations = resp?.data ?? [];
          this.syncStationOptions();
        },
        error: () => {
          this.allStations = [];
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------------------------------------------------------------------
  // Trip phase
  // ---------------------------------------------------------------------

  protected onFromStationChange(stationId: number): void {
    this.fromStationId = stationId;
    this.syncStationOptions();
    this.searchSchedules();
  }

  protected onToStationChange(stationId: number): void {
    this.toStationId = stationId;
    this.syncStationOptions();
    this.searchSchedules();
  }

  protected onDateChange(date: Date): void {
    this.selectedDate = date;
    this.searchSchedules();
  }

  protected onScheduleChange(scheduleId: number): void {
    this.scheduleId = scheduleId;
  }

  private syncStationOptions(): void {
    this.fromStationOptions = this.allStations.filter((s) => s.id !== this.toStationId);
    this.toStationOptions = this.allStations.filter((s) => s.id !== this.fromStationId);
  }

  private searchSchedules(): void {
    const fromSlug = this.slugForStationId(this.fromStationId);
    const toSlug = this.slugForStationId(this.toStationId);
    if (!fromSlug || !toSlug || !this.selectedDate) {
      this.scheduleOptions = [];
      this.noSchedulesFound = false;
      return;
    }

    const payload = {
      fromStop: fromSlug,
      toStop: toSlug,
      departureDate: dayjs(this.selectedDate).format('YYYY-MM-DD'),
    };

    this.isLoadingSchedules = true;
    this.noSchedulesFound = false;
    this.parcelBookingService
      .searchParcelSchedules(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          // Plain array in `data` (NOT `{departureSchedules,arrivalSchedules}`
          // like the passenger search) — and deliberately NOT filtered on
          // `availableSeats` here either: a schedule with `availableSeats:0`
          // still has free cargo quota and MUST still appear as an option
          // (that's the entire reason this endpoint exists, OBRS-415).
          const schedules = resp?.data ?? [];
          this.scheduleOptions = schedules.map((s) => ({
            id: s.id,
            label: `${dayjs(s.departureDateTime).format('DD/MM/YYYY HH:mm')} - ${dayjs(s.arrivalDateTime).format('HH:mm')}${s.vehicleType ? ' · ' + s.vehicleType : ''}`,
          }));
          this.isLoadingSchedules = false;
          this.noSchedulesFound = this.scheduleOptions.length === 0;
        },
        error: () => {
          this.scheduleOptions = [];
          this.isLoadingSchedules = false;
          this.noSchedulesFound = true;
        },
      });
  }

  private slugForStationId(stationId: number | null): string | null {
    if (stationId === null) return null;
    return this.allStations.find((s) => s.id === stationId)?.slug ?? null;
  }

  protected onTripNext(value: ParcelTripFormValue): void {
    this.tripValue = value;
    this.phase = 'details';
    this.loadProfile();
  }

  // ---------------------------------------------------------------------
  // Details phase
  // ---------------------------------------------------------------------

  private loadProfile(): void {
    this.parcelBookingService
      .getMyProfile()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          const profile = resp?.data;
          // Scrutinize R2 (2026-07-17): firstName + lastName ONLY — must mirror
          // `ParcelIntakeService#resolveSenderName`'s derivation byte-for-byte.
          // This previously preferred `profile.fullName`, which the backend
          // builds from title + firstName + middleName + lastName
          // (`UserProfile#getFullName`) — so an account with a title/middle name
          // was SHOWN "Mr. Somchai K. Jaidee" on the read-only sender line while
          // the backend persisted (and the waybill/counter-verification reads)
          // "Somchai Jaidee". The name is deliberately non-editable here (spec
          // §1.4), so this display is the customer's only chance to see it — it
          // must be the value that is actually stored, not a prettier one.
          this.senderNameDisplay = [profile?.firstName, profile?.lastName]
            .filter(Boolean)
            .join(' ')
            .trim();
          this.senderPhonePrefill = profile?.phoneNumber ?? null;
        },
        error: () => {
          // Sender name display is cosmetic-only here — the backend derives
          // the real value independently regardless of what this call
          // returns (SPEC-OBRS-415 §1.4). A failed profile fetch just leaves
          // the display blank and the phone field unprefilled/editable.
          this.senderNameDisplay = '';
          this.senderPhonePrefill = null;
        },
      });
  }

  protected get detailsScheduleId(): number | null {
    return this.tripValue?.scheduleId ?? null;
  }

  protected get detailsPickupStopId(): number | null {
    return this.tripValue?.fromStationId ?? null;
  }

  protected get detailsDropoffStopId(): number | null {
    return this.tripValue?.toStationId ?? null;
  }

  protected onQuoteParamsChange(params: ParcelOnlineQuoteParams | null): void {
    if (!params) {
      this.quote = null;
      this.quoteErrorKey = null;
      this.isLoadingQuote = false;
      return;
    }

    this.isLoadingQuote = true;
    this.quoteErrorKey = null;
    this.parcelBookingService
      .getParcelQuote(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.quote = resp?.data ?? null;
          this.isLoadingQuote = false;
        },
        error: (err: unknown) => {
          this.quote = null;
          this.isLoadingQuote = false;
          this.quoteErrorKey = this.mapErrorCode(err, QUOTE_ERROR_KEYS, 'PARCEL_BOOKING.ERROR.GENERIC');
        },
      });
  }

  protected onDetailsSubmit(value: ParcelDetailsFormValue): void {
    if (this.isSubmitting || !this.tripValue) return;
    this.isSubmitting = true;
    this.serverErrorKey = null;

    const payload: ParcelOnlineReqDto = {
      scheduleId: this.tripValue.scheduleId,
      pickupStopId: this.tripValue.fromStationId,
      dropoffStopId: this.tripValue.toStationId,
      weightKg: value.weightKg,
      description: value.description,
      prohibitedAcknowledged: value.prohibitedAcknowledged,
      senderPhone: value.senderPhone,
      recipient: value.recipient,
      ...(value.dimensions ? { dimensions: value.dimensions } : {}),
    };

    this.parcelBookingService
      .createOnlineParcelBooking(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.isSubmitting = false;
          const data = resp?.data;
          if (!data) {
            this.serverErrorKey = 'PARCEL_BOOKING.ERROR.GENERIC';
            return;
          }
          this.trackingNumber = data.trackingNumber;
          this.amount = Number(data.amount);
          this.bookingService.setActiveBookingId(data.bookingId);
          this.phase = 'payment';
        },
        error: (err: unknown) => {
          this.isSubmitting = false;
          this.serverErrorKey = this.mapErrorCode(err, SUBMIT_ERROR_KEYS, 'PARCEL_BOOKING.ERROR.GENERIC');
        },
      });
  }

  private mapErrorCode(err: unknown, map: Record<string, string>, fallbackKey: string): string {
    const errorCode = (err as HttpErrorResponse)?.error?.errorCode as string | undefined;
    return mapApiErrorCode(errorCode, map, fallbackKey);
  }

  // ---------------------------------------------------------------------
  // Payment phase
  // ---------------------------------------------------------------------

  protected onPaymentTabChange(tab: PaymentTab): void {
    this.activeTab = tab;
  }

  protected onPaymentCompleted(): void {
    // Safety net alongside `successRedirect` — the router navigation is the
    // primary mechanism, this just guarantees a stale active-booking-id
    // never lingers if navigation is ever interrupted.
    this.bookingService.clearActiveBookingId();
    // Stash the amount BEFORE the child's own successRedirect navigation
    // fires (this handler runs synchronously inside `paymentCompleted.emit()`,
    // ahead of the child's subsequent `router.navigate()` call) — see
    // `parcel-booking-amount-session.ts` for why this exists.
    if (this.trackingNumber) {
      stashParcelBookingAmount(this.trackingNumber, this.amount);
    }
  }

  protected get successRedirect(): string[] {
    return ['/parcel-booking', 'success', this.trackingNumber];
  }

  protected get currentStepIndex(): number {
    return this.phase === 'trip' ? 0 : this.phase === 'details' ? 1 : 2;
  }
}
