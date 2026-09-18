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
import { selectScheduleList } from '../../shared/stores/schedule-list/schedule-list.selector';
import { crossPairBoardingStop } from '../../shared/lib/return-boarding-stop';
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
import { generateIdempotencyKey } from '../../shared/lib/idempotency-key';
import { normalizeSeatNumber as stripSeatDigits } from '../../shared/lib/seat-label';
import { selectProvinceWithStation } from '../../shared/stores/station/station.selector';
import { StationApi } from '../../shared/interfaces/station.interface';
import { Observable } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../shared/services/alert.service';
import { HttpErrorResponse } from '@angular/common/http';
import { AnalyticsService } from '../../services/analytics/analytics.service';
import { PRIVACY_POLICY_VERSION } from '../privacy-policy/privacy-policy.version';
import { BUSINESS_POLICY_VERSION } from '../business-policy/business-policy.version';
import { TITLE_OPTIONS } from '../../shared/constants/title-options';
import {
  apiErrorCode,
  apiFieldErrors,
  resolveApiAlertMessage,
} from '../../shared/lib/api-error';
import {
  BookingFieldError,
  describeControlId,
  mapBookingFieldErrors,
} from './booking-field-errors';

/**
 * OBRS-1955. `[formControlName]` and not a bare `.ng-invalid`: Angular puts that class on the
 * `<form>` and on every `formGroupName`/`formArrayName` wrapper too, and those come FIRST in DOM
 * order, so the bare selector would scroll to the top of the card and focus nothing. Scoped to the
 * page's own host element, in DOM order — which on this page is reading order, booker card first.
 */
const INVALID_CONTROL_SELECTOR = 'app-passenger-info [formControlName].ng-invalid';

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
  /**
   * OBRS-1955: these no longer gate the Next button — the owner's decision this card was to stop
   * letting the form's validity grey it out and to explain the refusal on click instead. They
   * still gate the PROMO field, which `isNextDisabled` used to carry by accident: the summary's
   * `[disabled]="isNextDisabled"` on `<app-promo-code-field>` meant that making Next live would
   * have made the promo field live too. That is a change nobody asked for, and the
   * customer-contrast gate caught it — an enabled promo input exposes a 1.35:1 border, under the
   * AA floor of 3. `isFormIncomplete` keeps the two questions apart.
   */
  isPassengerFormValid = false;
  isBookerFormValid = false;
  /**
   * 2026-09-11 review: this page had no in-flight guard - a double tap could create two seat holds
   * for the same passenger. The submit is single-flight on the client: the Next button is disabled
   * while a create is outstanding and a re-entrant call returns without sending.
   *
   * <p>OBRS-25: this closes the double TAP only. A request the server received and answered into a
   * dead connection is retried by the platform with this flag already back to false, and only the
   * server can recognise that one - which is what `pendingIdempotencyKey` below is for.
   */
  isSubmitting = false;
  /**
   * OBRS-25: minted ONCE per booking attempt and reused for as long as the payload is unchanged,
   * the same shape `StaffRemittanceTabComponent#onSubmit` uses. A key minted per call would defeat
   * the server-side guard entirely: the retry would carry a new key and be a new booking.
   */
  private pendingIdempotencyKey: string | null = null;
  private pendingPayloadSignature: string | null = null;
  // OBRS-109 (#37): the confirmed-applied promo code (from the summary
  // sidebar's instant preview). Only this value — never a guessed/typed one
  // that wasn't confirmed — is ever sent on the create-booking call.
  private appliedPromoCode: string | null = null;
  /**
   * OBRS-1955: what the server refused, field by field, shown above the forms until the next
   * submit. Empty on every path except a 400 whose `errors[]` named at least one field.
   */
  serverFieldErrors: BookingFieldError[] = [];
  rawProvinceStationList: Observable<StationApi[]>;
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
    if (this.isSubmitting) {
      return;
    }
    // OBRS-1955: a new attempt answers the previous refusal — leaving the old list up while the
    // customer edits would keep pointing at a field they may already have fixed.
    this.serverFieldErrors = [];

    const passengerInfo =
      this.passengerInfoFormComponent?.validateAndGetPassengerInfo();
    const booker = this.bookerInfoFormComponent?.validateAndGetBooker();

    if (!passengerInfo || !booker) {
      // OBRS-1955: this used to be a bare `return`, and it was unreachable anyway — the Next
      // button disabled itself the moment either form went invalid, so the customer met a dead
      // button and no reason at all. The button is now live (see the template) and this is where
      // the refusal is explained: the same list the server path fills, and the page taken to the
      // first offending field, whose inline message says what is wrong with it.
      this.serverFieldErrors = this.describeInvalidControls();
      this.focusFirstInvalidControl();
      return;
    }

    this.isSubmitting = true;
    try {
      // OBRS-1853: the await has to cover the navigation too. submitPassengerInfo ends
      // in router.navigate(['/payment']), and /payment is lazy — without awaiting it the
      // finally below re-enabled Next while the payment chunk was still downloading, so a
      // second tap on a slow link created a second booking: exactly what this guard exists
      // to stop. Awaiting means the flag is only released once the route has settled (or
      // been refused by a guard), and the write after a successful navigation lands on an
      // already-destroyed component, which is harmless.
      await this.submitPassengerInfo(passengerInfo, booker);
    } finally {
      this.isSubmitting = false;
    }
  }

  private async submitPassengerInfo(
    passengerInfo: PassengerInfo[],
    booker: PassengerInfo
  ): Promise<void> {
    this.store.dispatch(invokeSetPassengerInfo({ passengerInfo }));

    const bookingPayload = await this.buildBookingPayload(passengerInfo, booker);

    let isBookingCreated = false;

    if (bookingPayload) {
      // OBRS-109 (#37) opted out of the global error alert only when a promo code was applied,
      // so a PROMO_CODE_* rejection could be shown inline on the reverted field instead.
      // OBRS-1955 makes that unconditional: a 400 naming fields must be answered by the list
      // above the forms, not by a modal that says only "ข้อมูลไม่ผ่านการตรวจสอบ", and the choice
      // has to be made from the RESPONSE, which the request-time flag cannot see.
      // handleBookingCreationError now owns every ending, and falls back to
      // `resolveApiAlertMessage` — the interceptor's own text — so nothing else changes.
      // It suppresses the ALERT only: the 401 path is a separate argument below, because
      // bundling them is what would have left an expired session with no recovery at all.
      const suppressGlobalErrorAlert = true;

      try {
        const response = await firstValueFrom(
          this.bookingService
            .createBooking(
              bookingPayload,
              suppressGlobalErrorAlert,
              this.idempotencyKeyFor(bookingPayload),
              // OBRS-1955: the 401 recovery stays on for an ordinary booking. Only the
              // promo-preview race, which OBRS-109 bundled into this call, may swallow a 401 -
              // see BookingService.createBooking.
              !!this.appliedPromoCode
            )
            .pipe(take(1))
        );
        if (response?.code === 200 || response?.code === 201) {
          // createBooking already normalizes the intake response to the canonical
          // { bookingId, bookingNumber }; 0/'' mean "not created".
          const bookingId = response.data?.bookingId || null;
          const bookingNumber = response.data?.bookingNumber || null;
          this.bookingService.setActiveBookingId(bookingId, bookingNumber);
          this.setBookingStore(bookingId, bookingNumber, response.data);
          this.alertService.success(
            this.translateService.instant(
              'PASSENGER_INFO.ALERT.CREATE_SUCCESS'
            )
          );
          isBookingCreated = true;
          // The booking exists; the next attempt on this page is a different booking and must
          // not replay this one. On the error path the key is deliberately KEPT, so a retry of
          // the same payload is answered with the booking already made.
          this.pendingIdempotencyKey = null;
          this.pendingPayloadSignature = null;
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
      await this.router.navigate(['/payment']);
    }
  }

  /** Same key while the payload is unchanged; a new one the moment the customer edits it. */
  private idempotencyKeyFor(payload: BookingPayload): string {
    const signature = JSON.stringify(payload);
    if (
      this.pendingIdempotencyKey === null ||
      this.pendingPayloadSignature !== signature
    ) {
      this.pendingIdempotencyKey = generateIdempotencyKey();
      this.pendingPayloadSignature = signature;
    }
    return this.pendingIdempotencyKey;
  }

  onBack(): void {
    this.router.navigate(['/review-schedule-booking']);
  }

  /**
   * The single owner of what a failed create-booking shows, since OBRS-1955 made the global alert
   * unconditionally suppressed for this call. Order matters: the promo race and the capacity
   * refusal are named codes with their own remedy, a field-level 400 goes to the list above the
   * forms, and everything else keeps the interceptor's own text.
   */
  private handleBookingCreationError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      this.alertService.error(
        this.translateService.instant('PASSENGER_INFO.ALERT.CREATE_FAILED')
      );
      return;
    }

    const errorCode = String(error.error?.errorCode ?? '');

    // OBRS-109 (#37): the expected preview->submit race — surface it inline on the reverted field.
    if (this.appliedPromoCode && errorCode.startsWith('PROMO_CODE')) {
      this.passengerInfoSummaryComponent?.revertPromoWithError(errorCode);
      this.appliedPromoCode = null;
      return;
    }

    // OBRS-323: capacity-full rejection. Its own message, because "seats just went" is not a
    // field the customer can correct.
    if (errorCode.startsWith('BOOKING_ERROR_SEATS')) {
      this.alertService.error(
        this.translateService.instant('PASSENGER_INFO.ALERT.CAPACITY_FULL')
      );
      return;
    }

    // OBRS-1955: the case the owner reported. The body already names every refused field; show
    // them, take the customer to the first one, and say nothing generic on top of it.
    if (apiErrorCode(error) === 'VALIDATION_FAILED') {
      const fields = mapBookingFieldErrors(apiFieldErrors(error), (key, params) =>
        this.translateService.instant(key, params)
      );
      if (fields.length > 0) {
        this.serverFieldErrors = fields;
        this.focusControlById(fields.find((f) => f.controlId)?.controlId ?? null);
        return;
      }
      // A VALIDATION_FAILED with an empty `errors[]` names nothing to point at. Falling through
      // to the alert is deliberate: silence would be worse than the modal this card is replacing.
    }

    this.alertService.error(
      resolveApiAlertMessage(error, (key) => this.translateService.instant(key))
    );
  }

  /**
   * Takes the customer to the first control the browser has marked invalid, in DOM order — the
   * booker card comes before the passenger cards in the template, so DOM order is reading order.
   *
   * Angular puts `ng-invalid` on the control's own element, so this needs no list of field names
   * and cannot fall behind one: a validator added to either form tomorrow is covered.
   *
   * Queried off `document` rather than through an injected `ElementRef`, the same way and for the
   * same reason as `schedule-booking-filter.component.ts`: the spec constructs this component with
   * `new` and positional arguments, so a new constructor parameter is a compile error in files
   * this card has no business editing. `app-passenger-info` scopes it to this page.
   */
  private focusFirstInvalidControl(): boolean {
    return this.bringIntoView(document.querySelector<HTMLElement>(INVALID_CONTROL_SELECTOR));
  }

  /** Every control the browser has marked invalid, named the same way a server rejection is. */
  private describeInvalidControls(): BookingFieldError[] {
    return Array.from(document.querySelectorAll<HTMLElement>(INVALID_CONTROL_SELECTOR))
      .filter((el) => el.id)
      .map((el) =>
        describeControlId(el.id, (key, params) => this.translateService.instant(key, params))
      );
  }

  private focusControlById(controlId: string | null): boolean {
    if (!controlId) {
      return false;
    }
    return this.bringIntoView(document.getElementById(controlId));
  }

  private bringIntoView(el: HTMLElement | null): boolean {
    if (!el) {
      return false;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // `preventScroll` so the smooth scroll above is not cut short by the jump focus() would make.
    el.focus({ preventScroll: true });
    return true;
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
    const scheduleList = await firstValueFrom(
      this.store.pipe(select(selectScheduleList), take(1))
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
      // OBRS-658 AC 3 (ADR-0125): the SAME constant /business-policy renders, so the string
      // recorded against the sale is the one the customer could actually have read — not the
      // backend's idea of "current", which is what a server-side stamp would have made it. Sent on
      // every sale regardless of channel or sign-in state: the question this answers ("which terms
      // was this ticket sold under?") is asked of the booking, not of the person.
      bookingPolicyVersion: BUSINESS_POLICY_VERSION,
    };

    if (arrivalPassengers.length && arrivalSchedule) {
      // OBRS-1343: the return leg boards where the SEARCH ran from, which for 4
      // of the 6 Bangkok destinations of `chonburi_bangkok` is not the outbound
      // drop-off. Mirroring the two codes here would post a from/to pair with no
      // `segments` fare row, and `SegmentService#getPricePerSeatBy` throws on a
      // missing fare — a 404 at the moment of payment (V74), after the customer
      // has filled in every passenger. The ticket must also name the stop the
      // customer was actually told to go to.
      payload.arrivalSchedule = this.buildSchedulePayload(
        arrivalSchedule,
        crossPairBoardingStop(scheduleList)?.slug ?? stopStationCode,
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
      passengerTypeConsentVersion: this.passengerTypeConsentVersion(passenger),
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

  // OBRS-1232: sends the option's stable CODE ('MISS'), not its English label. The private
  // English-only map this used to hold was the bug: it made `Miss กุลธิดา นาใจคง` the value
  // stored on production, after which no reader in any language could be shown anything else.
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
      return TITLE_OPTIONS.find((option) => option.id === title)?.code ?? null;
    }

    return null;
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    return (phoneNumber || '').replace(/\D+/g, '').slice(0, 15);
  }

  /**
   * OBRS-1357: returns null when nothing was chosen, where it used to fall back to `'male'`.
   * That fallback was invisible: the form made the field required, so the branch only ever ran on
   * a path the UI could not reach — until the field became optional, at which point it would have
   * silently recorded every silent customer as male and then printed "(ชาย)" back at them in the
   * confirmation email. `PassengerReqDto.passengerType` dropped its `@NotBlank` in the same change
   * and `tickets.passenger_type_id` has been nullable since ADR-0061, so null survives end to end.
   */
  /**
   * OBRS-1666: the version of the notice the traveller actually saw, sent only when they ticked
   * the consent box beside a monk/nun answer. Null for every other type - nothing asked for
   * consent to 'male'/'female', which PDPA section 26 does not cover - and null when the box was
   * left unticked, which the backend reads as a refusal and answers by dropping the type. The
   * booking is never blocked either way: the field has been optional since OBRS-1357.
   */
  private passengerTypeConsentVersion(passenger: PassengerInfo): string | null {
    const type = this.normalizePassengerType(passenger.gender);
    const isSensitive = type === 'monk' || type === 'nun';
    return isSensitive && passenger.passengerTypeConsent ? PRIVACY_POLICY_VERSION : null;
  }

  private normalizePassengerType(gender?: string | null): string | null {
    const normalized = (gender ?? '').toString().trim().toLowerCase();
    if (
      normalized === 'male' ||
      normalized === 'female' ||
      normalized === 'monk' ||
      normalized === 'nun'
    ) {
      return normalized;
    }

    return normalized || null;
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


