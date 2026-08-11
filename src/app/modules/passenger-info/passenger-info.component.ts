import { Component, ViewChild } from '@angular/core';
import { Store, select } from '@ngrx/store';
import { Router } from '@angular/router';
import { invokeGetAllProvinceWithStationApi } from '../../shared/stores/station/station.action';
import {
  invokeGetScheduleBookingApi,
  revalidateRestoredScheduleBooking,
} from '../../shared/stores/schedule-booking/schedule-booking.action';
import {
  invokeSetScheduleFilterApi,
  invokeGetScheduleFilterApi,
} from '../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeSetPassengerInfo } from '../../shared/stores/passenger-info/passenger-info.action';
import { invokeSetBookingApi } from '../../shared/stores/booking/booking.action';
import { PassengerInfoFormComponent } from './components/passenger-info-form/passenger-info-form.component';
import { BookerInfoFormComponent } from './components/booker-info-form/booker-info-form.component';
import { PassengerInfoSummaryComponent } from './components/passenger-info-summary/passenger-info-summary.component';
import { PromoCodeAppliedEvent } from '../../shared/components/promo-code-field/promo-code-field.component';
import { selectScheduleBooking } from '../../shared/stores/schedule-booking/schedule-booking.selector';
import { selectScheduleFilter } from '../../shared/stores/schedule-filter/schedule-filter.selector';
import { BookingService } from '../../services/booking/booking.service';
import { parsePricePerSeat } from '../../shared/lib/trip-format';
import {
  BookingPayload,
  BookingSchedulePayload,
  CreateBookingResponse,
} from '../../shared/interfaces/booking.interface';
import { Schedule, ScheduleFilter } from '../../shared/interfaces/schedule.interface';
import { PassengerInfo } from '../../shared/interfaces/passenger-info.interface';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import dayjs from 'dayjs';
import { toApiOffsetDateTime } from '../../shared/lib/api-date-time';
import { normalizeSeatNumber as stripSeatDigits } from '../../shared/lib/seat-label';
import { selectProvinceWithStation } from '../../shared/stores/station/station.selector';
import { StationApi } from '../../shared/interfaces/station.interface';
import { Observable } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../shared/services/alert.service';
import { HttpErrorResponse } from '@angular/common/http';
import { AnalyticsService } from '../../services/analytics/analytics.service';
import { PRIVACY_POLICY_VERSION } from '../privacy-policy/privacy-policy.version';

@Component({
    selector: 'app-passenger-info',
    templateUrl: './passenger-info.component.html',
    styleUrl: './passenger-info.component.scss',
    standalone: false
})
export class PassengerInfoComponent {
  @ViewChild(PassengerInfoFormComponent)
  passengerInfoFormComponent?: PassengerInfoFormComponent;
  @ViewChild(BookerInfoFormComponent)
  bookerInfoFormComponent?: BookerInfoFormComponent;
  @ViewChild(PassengerInfoSummaryComponent)
  passengerInfoSummaryComponent?: PassengerInfoSummaryComponent;
  isPassengerFormValid = false;
  isBookerFormValid = false;
  // OBRS-109 (#37): the confirmed-applied promo code (from the summary
  // sidebar's instant preview). Only this value — never a guessed/typed one
  // that wasn't confirmed — is ever sent on the create-booking call.
  private appliedPromoCode: string | null = null;
  rawProvinceStationList: Observable<StationApi[]>;
  private readonly titleMap: Record<number, string> = {
    1: 'Mr.',
    2: 'Miss',
    3: 'Mrs.',
    4: 'Master',
    5: 'Miss (Child)',
    6: 'Dr.',
    7: 'Professor',
    8: 'Associate Professor',
    9: 'Assistant Professor',
  };

  constructor(
    private store: Store,
    private router: Router,
    private bookingService: BookingService,
    private translateService: TranslateService,
    private alertService: AlertService,
    private analytics: AnalyticsService
  ) {
    this.rawProvinceStationList = this.store.pipe(
      select(selectProvinceWithStation)
    );
  }

  ngOnInit(): void {
    // OBRS-867 funnel step 4. This is the step the card names as decisive for
    // OBRS-872: it is the first screen behind AuthGuard's `requireAuth` path
    // that a customer meets after choosing a trip, so the gap between
    // `schedule_selected` and this event is the cost of having no guest
    // checkout. Deliberately carries no field from either form — this fires
    // before anything is typed, and must keep doing so.
    this.analytics.track('passenger_info_reached');

    this.store.dispatch(invokeGetAllProvinceWithStationApi());
    this.store.dispatch(invokeGetScheduleBookingApi());
    this.store.dispatch(invokeGetScheduleFilterApi());
    // OBRS-903: this is where a customer who was forced through registration
    // lands, and where the seat map is drawn from `Schedule.availableSeatNumbers`
    // — so a selection restored from the pre-login tab is re-checked here before
    // any seat is offered (AC3). No-op for a selection made in this tab.
    this.store.dispatch(revalidateRestoredScheduleBooking());
  }

  onPassengerFormValidityChange(isValid: boolean): void {
    this.isPassengerFormValid = isValid;
  }

  onBookerFormValidityChange(isValid: boolean): void {
    this.isBookerFormValid = isValid;
  }

  onUseBookerAsPassenger(index: number): void {
    const booker = this.bookerInfoFormComponent?.getCurrentBooker();
    if (booker) {
      this.passengerInfoFormComponent?.applyBookerToPassenger(index, booker);
    }
  }

  onPromoApplied(event: PromoCodeAppliedEvent): void {
    this.appliedPromoCode = event.code;
  }

  onPromoRemoved(): void {
    this.appliedPromoCode = null;
  }

  async onSubmitPassengerInfo(): Promise<void> {
    const passengerInfo =
      this.passengerInfoFormComponent?.validateAndGetPassengerInfo();
    const booker = this.bookerInfoFormComponent?.validateAndGetBooker();

    if (!passengerInfo || !booker) {
      return;
    }

    this.store.dispatch(invokeSetPassengerInfo({ passengerInfo }));

    const bookingPayload = await this.buildBookingPayload(passengerInfo, booker);

    let isBookingCreated = false;

    if (bookingPayload) {
      // OBRS-109 (#37): when a confirmed promo code is being sent, opt out of
      // the global error alert so a PROMO_CODE_* rejection (the preview ->
      // submit race) can be shown inline on the reverted field instead —
      // handleBookingCreationError replicates the generic alert for any
      // other error on this call.
      const suppressGlobalErrorAlert = !!this.appliedPromoCode;

      try {
        const response = await firstValueFrom(
          this.bookingService
            .createBooking(bookingPayload, suppressGlobalErrorAlert)
            .pipe(take(1))
        );
        if (response?.code === 200 || response?.code === 201) {
          // createBooking already normalizes the intake response to the canonical
          // { bookingId, bookingNumber }; 0/'' mean "not created".
          const bookingId = response.data?.bookingId || null;
          const bookingNumber = response.data?.bookingNumber || null;
          this.bookingService.setActiveBookingId(bookingId);
          this.setBookingStore(bookingId, bookingNumber, response.data);
          this.alertService.success(
            this.translateService.instant(
              'PASSENGER_INFO.ALERT.CREATE_SUCCESS'
            )
          );
          isBookingCreated = true;
        }
      } catch (error) {
        console.error('Booking creation failed', error);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          return;
        }
        this.handleBookingCreationError(error);
        return;
      }
    }

    if (isBookingCreated) {
      this.router.navigate(['/payment']);
    }
  }

  onBack(): void {
    this.router.navigate(['/review-schedule-booking']);
  }

  // OBRS-109 (#37): createBooking was called with the global error alert
  // suppressed only when a promo code was applied. A PROMO_CODE_* rejection
  // is the expected preview->submit race — surface it inline on the reverted
  // field. Any other error on that same (silenced) call still needs an
  // alert, since the interceptor won't show one for this request.
  private handleBookingCreationError(error: unknown): void {
    if (!this.appliedPromoCode || !(error instanceof HttpErrorResponse)) {
      return;
    }

    const errorCode = String(error.error?.errorCode ?? '');
    if (errorCode.startsWith('PROMO_CODE')) {
      this.passengerInfoSummaryComponent?.revertPromoWithError(errorCode);
      this.appliedPromoCode = null;
      return;
    }

    // OBRS-323: capacity-full rejection on this (promo-suppressed) call —
    // the no-promo path already gets this from the BE's localized message via
    // the global error interceptor, so this branch only fires when the global
    // alert was suppressed for the applied-promo call.
    if (errorCode.startsWith('BOOKING_ERROR_SEATS')) {
      this.alertService.error(
        this.translateService.instant('PASSENGER_INFO.ALERT.CAPACITY_FULL')
      );
      return;
    }

    this.alertService.error(
      this.translateService.instant('PASSENGER_INFO.ALERT.CREATE_FAILED')
    );
  }

  private async buildBookingPayload(
    passengerInfo: PassengerInfo[],
    booker: PassengerInfo
  ): Promise<BookingPayload | null> {
    const scheduleBooking = await firstValueFrom(
      this.store.pipe(select(selectScheduleBooking), take(1))
    );
    const scheduleFilter = await firstValueFrom(
      this.store.pipe(select(selectScheduleFilter), take(1))
    );

    const schedules = this.normalizeSchedules(scheduleBooking?.schedule);
    if (!schedules.length) {
      return null;
    }

    const isReturnTrip = this.isReturnTrip(scheduleFilter?.roundTrip);
    const startStationCode = await this.getStationCodeById(
      scheduleFilter?.startStationId
    );
    const stopStationCode = await this.getStationCodeById(
      scheduleFilter?.stopStationId
    );
    const departureSchedule = schedules[0];
    const arrivalSchedule = isReturnTrip ? schedules[1] : null;

    // AC-361.5 (scrutinize blocker): never attach a seat preference/
    // requirement to a leg whose schedule sells with no fixed seat — gate on
    // the LEG's seatingMode, not just whether a seatNumber happens to be
    // present, so a mixed round trip (e.g. OPEN outbound / ASSIGNED return)
    // sends prefs on the ASSIGNED leg only.
    const departurePassengers = this.buildPassengersPayload(
      passengerInfo,
      'outbound',
      departureSchedule?.seatingMode === 'OPEN'
    );
    const arrivalPassengers =
      isReturnTrip && arrivalSchedule
        ? this.buildPassengersPayload(
            passengerInfo,
            'inbound',
            arrivalSchedule?.seatingMode === 'OPEN'
          )
        : [];

    const totalAmount =
      this.calculateTotalAmount(passengerInfo, departureSchedule?.pricePerSeat) +
      (isReturnTrip
        ? this.calculateTotalAmount(passengerInfo, arrivalSchedule?.pricePerSeat)
        : 0);

    const contact = this.buildContactPayload(booker);

    const payload: BookingPayload = {
      bookingType: isReturnTrip ? 'return' : 'one_way',
      totalAmount,
      bookingChannel: 'online',
      contact,
      departureSchedule: this.buildSchedulePayload(
        departureSchedule,
        startStationCode,
        stopStationCode,
        departurePassengers
      ),
      // Only a code confirmed via the summary sidebar's instant preview is
      // ever sent — never a typed-but-unconfirmed value.
      promotionCode: this.appliedPromoCode ?? null,
      // OBRS-858 (ADR-0123 Decision 4): the SAME constant the register form and the
      // re-consent banner send (PRIVACY_POLICY_VERSION), so one privacy-notice bump moves
      // every consent record together. Sent unconditionally rather than only when logged
      // out: the client does not get to decide whose consent this is, and the backend
      // ignores it for an authenticated caller.
      pdpaConsentVersion: PRIVACY_POLICY_VERSION,
    };

    if (arrivalPassengers.length && arrivalSchedule) {
      payload.arrivalSchedule = this.buildSchedulePayload(
        arrivalSchedule,
        stopStationCode,
        startStationCode,
        arrivalPassengers
      );
    }

    return payload;
  }

  private normalizeSchedules(
    schedule: Schedule[] | Schedule | null | undefined
  ): Schedule[] {
    if (!schedule) return [];
    return Array.isArray(schedule) ? schedule : [schedule];
  }

  private isReturnTrip(roundTrip: ScheduleFilter['roundTrip'] | number | null | undefined): boolean {
    const roundTripId =
      typeof roundTrip === 'object' && roundTrip !== null ? roundTrip.id : roundTrip;
    const value = String(roundTripId).toLowerCase();
    return roundTripId === 2 || value === 'return' || value === '2';
  }

  private buildPassengersPayload(
    passengers: PassengerInfo[],
    leg: 'outbound' | 'inbound' = 'outbound',
    isLegOpen = false
  ): BookingSchedulePayload['passengers'] {
    return passengers.map((passenger) => ({
      passengerType: this.normalizePassengerType(passenger.gender),
      seatNumber: this.normalizeSeatNumber(
        leg === 'inbound' ? passenger.passengerSeatReturn : passenger.passengerSeat
      ),
      title: this.normalizeTitle(passenger.title),
      firstName: passenger.firstName,
      middleName: passenger.middleName || null,
      lastName: passenger.lastName,
      // OBRS-296: separate from passengerType (gender) — the server computes
      // the child discount off this field. isAdult is a real boolean control
      // (property-bound radios, not the gender radios' string-attribute
      // form), so this is never accidentally 'adult' for a falsy string.
      fareCategory: passenger.isAdult ? 'adult' : 'child',
      // OBRS-361 / AC-361.5: an OPEN leg never carries a preference, even if
      // the passenger set one (e.g. while a mixed round trip's other leg was
      // ASSIGNED) — best-effort fields, lowercase per the backend contract.
      seatPreference: isLegOpen
        ? null
        : this.normalizeSeatPreference(passenger.seatPreference),
      seatRequirement: isLegOpen
        ? null
        : this.normalizeSeatRequirement(passenger.seatRequirement),
    }));
  }

  private normalizeSeatPreference(
    value: PassengerInfo['seatPreference']
  ): 'window' | 'aisle' | null {
    if (value === 'WINDOW') return 'window';
    if (value === 'AISLE') return 'aisle';
    return null;
  }

  private normalizeSeatRequirement(
    value: PassengerInfo['seatRequirement']
  ): 'wheelchair' | 'extra_legroom' | null {
    if (value === 'WHEELCHAIR') return 'wheelchair';
    if (value === 'EXTRA_LEGROOM') return 'extra_legroom';
    return null;
  }

  private buildSchedulePayload(
    schedule: Schedule,
    pickupStation: string,
    dropOffStation: string,
    passengers: BookingSchedulePayload['passengers']
  ): BookingSchedulePayload {
    return {
      scheduleId: schedule?.id ?? 0,
      fromStop: pickupStation,
      toStop: dropOffStation,
      departureDateTime: this.normalizeDateTime(schedule?.departureDateTime),
      arrivalDateTime: this.normalizeDateTime(schedule?.arrivalDateTime),
      passengers,
    };
  }

  private calculateTotalAmount(
    passengers: PassengerInfo[],
    pricePerSeat?: string | number | null
  ): number {
    const costPerPassenger = parsePricePerSeat(pricePerSeat);
    const passengerCount = passengers.length;
    return passengerCount * costPerPassenger;
  }

  private async getStationCodeById(
    stationId: string | number | null | undefined
  ): Promise<string> {
    if (stationId === null || stationId === undefined || stationId === '') {
      return '';
    }

    const raw = stationId;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return String(raw);
    }

    const stationList = await firstValueFrom(
      this.rawProvinceStationList.pipe(take(1))
    );
    const match = (stationList ?? []).find((station) => station.id === parsed);
    if (match) return match.slug || String(raw);

    return String(raw);
  }

  private buildContactPayload(booker: PassengerInfo): BookingPayload['contact'] {
    const phoneNumber = this.normalizePhoneNumber(booker?.phoneNumber ?? '');
    const preferredLocale = this.getPreferredLocale();

    return {
      title: this.normalizeTitle(booker?.title),
      firstName: (booker?.firstName ?? '').trim(),
      middleName: (booker?.middleName ?? '').trim() || null,
      lastName: (booker?.lastName ?? '').trim(),
      phoneNumber,
      // OBRS-238: ONLINE bookingChannel requires contact.email (backend
      // BookingReqDtoValidator 400s without it) — sourced from the booker
      // form's required+email-format-validated field.
      email: (booker?.email ?? '').trim() || null,
      preferredLocale,
    };
  }

  private getPreferredLocale(): string {
    const current =
      this.translateService.currentLang ||
      this.translateService.getDefaultLang?.() ||
      '';
    const normalized = current.toLowerCase();

    if (normalized.startsWith('th')) {
      return 'th';
    }
    if (normalized.startsWith('zh')) {
      return 'zh';
    }
    return 'en';
  }

  private normalizeDateTime(dateTime?: string): string {
    return toApiOffsetDateTime(dateTime);
  }

  private normalizeSeatNumber(seatNumber?: string | null): string | null {
    // Booking-payload seat number: reuse the shared digit-strip (OBRS-362), then
    // apply the payload-specific null semantics ('' / no-digit means "no manual
    // seat", which the backend expects as null, not an empty string).
    const digits = stripSeatDigits(seatNumber);
    return digits.length > 0 ? digits : null;
  }

  // OBRS-1231: no title is a legitimate answer, so this returns null rather than
  // inventing one. The three 'Mr.' fallbacks it used to have were not defaults in any
  // useful sense - nothing downstream needed a value (the backend joins the name parts
  // with a null-filter), so they only ever asserted a gender the traveller never gave.
  private normalizeTitle(title: number | string | null | undefined): string | null {
    if (typeof title === 'string') {
      const normalized = title.trim();
      return normalized.length > 0 ? normalized : null;
    }

    if (typeof title === 'number') {
      return this.titleMap[title] ?? null;
    }

    return null;
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    return (phoneNumber || '').replace(/\D+/g, '').slice(0, 15);
  }

  private normalizePassengerType(gender?: string | null): string {
    const normalized = (gender ?? '').toString().trim().toLowerCase();
    if (
      normalized === 'male' ||
      normalized === 'female' ||
      normalized === 'monk' ||
      normalized === 'nun'
    ) {
      return normalized;
    }

    return normalized || 'male';
  }

  private setBookingStore(
    bookingId: number | null,
    bookingNumber: string | null,
    createBookingData?: CreateBookingResponse
  ): void {
    this.store.dispatch(
      invokeSetBookingApi({
        booking: {
          bookingId,
          bookingNumber,
          // OBRS-85: forward the server-computed discount snapshot as-is; the
          // booking store is the single seam PaymentSummaryComponent reads
          // from, so no other component needs to know about these fields.
          totalAmount: createBookingData?.totalAmount,
          discountAmountSnapshot: createBookingData?.discountAmountSnapshot,
          netAmount: createBookingData?.netAmount,
        },
      })
    );
  }
}


