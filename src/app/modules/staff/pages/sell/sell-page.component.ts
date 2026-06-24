import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Store, select } from '@ngrx/store';
import { Subscription, firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import {
  ScheduleSearchItemDto,
  ScheduleSearchReqDto,
  StaffApiService,
  WalkInBookingPassengerReqDto,
  WalkInBookingScheduleReqDto,
} from '../../../../services/staff/staff-api.service';
import { invokeSetBookingApi } from '../../../../shared/stores/booking/booking.action';
import {
  StationApi,
  getStationFallbackLabel,
} from '../../../../shared/interfaces/station.interface';
import { invokeGetAllProvinceWithStationApi } from '../../../../shared/stores/station/station.action';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';

type SellStep = 'search' | 'seats' | 'passengers' | 'payment' | 'ticket';

/** A selectable stop in the search dropdowns: the `slug` the API expects, plus a localized label. */
interface StopOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-sell-page',
  templateUrl: './sell-page.component.html',
  styleUrl: './sell-page.component.scss',
})
export class SellPageComponent implements OnInit, OnDestroy {
  protected currentStep: SellStep = 'search';
  protected readonly steps: SellStep[] = ['search', 'seats', 'passengers', 'payment', 'ticket'];

  // Search step
  protected readonly searchForm: FormGroup;
  protected isSearching = false;

  // Stop dropdowns (searchable). `allStopOptions` is the full localized list;
  // `fromStopOptions`/`toStopOptions` exclude the counterpart selection so a
  // staffer cannot pick the same stop for both ends.
  private allStations: StationApi[] = [];
  protected allStopOptions: StopOption[] = [];
  protected fromStopOptions: StopOption[] = [];
  protected toStopOptions: StopOption[] = [];
  protected departureSchedules: ScheduleSearchItemDto[] = [];
  protected arrivalSchedules: ScheduleSearchItemDto[] = [];
  protected selectedDeparture: ScheduleSearchItemDto | null = null;
  protected selectedArrival: ScheduleSearchItemDto | null = null;

  // Seats step
  protected selectedDepartureSeats: string[] = [];
  protected selectedArrivalSeats: string[] = [];
  protected isLoadingSeats = false;

  // Passengers step
  protected readonly passengersForm: FormGroup;
  protected isConfirming = false;
  protected bookingId: number | null = null;
  protected bookingNumber: string | null = null;
  protected totalAmount = 0;

  // Payment step
  protected isProcessingPayment = false;
  private idempotencyKey: string | null = null;

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly router: Router,
    private readonly formBuilder: FormBuilder,
    private readonly store: Store,
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.searchForm = this.formBuilder.group({
      bookingType: ['one_way', [Validators.required]],
      fromStop: ['', [Validators.required]],
      toStop: ['', [Validators.required]],
      departureDate: ['', [Validators.required]],
      returnDate: [''],
      numberOfPassengers: [1, [Validators.required, Validators.min(1)]],
    });

    this.passengersForm = this.formBuilder.group({
      passengers: this.formBuilder.array([]),
      contact: this.formBuilder.group({
        title: ['', [Validators.required]],
        firstName: ['', [Validators.required]],
        middleName: [''],
        lastName: ['', [Validators.required]],
        phoneNumber: ['', [Validators.required]],
        identityCardNumber: ['', [Validators.required]],
        email: ['', [Validators.required, Validators.email]],
        preferredLocale: ['th'],
      }),
    });
  }

  ngOnInit(): void {
    // Load the stop list once (the effect no-ops if already cached) and keep the
    // dropdown options in sync with it and with the active language.
    this.store.dispatch(invokeGetAllProvinceWithStationApi());

    this.subscriptions.add(
      this.store.pipe(select(selectProvinceWithStation)).subscribe((stations) => {
        this.allStations = stations ?? [];
        this.rebuildStopOptions();
      })
    );

    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => this.rebuildStopOptions())
    );

    // Re-filter the opposite list whenever one end changes so the same stop is
    // never selectable on both sides.
    this.subscriptions.add(
      this.searchForm.get('fromStop')!.valueChanges.subscribe(() => this.syncStopOptions())
    );
    this.subscriptions.add(
      this.searchForm.get('toStop')!.valueChanges.subscribe(() => this.syncStopOptions())
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private rebuildStopOptions(): void {
    const locale = this.translate.currentLang || this.translate.defaultLang || 'th';
    this.allStopOptions = this.allStations
      .map((station) => ({
        label: getStationFallbackLabel(station, locale),
        value: station.slug,
      }))
      .filter((option) => !!option.value)
      .sort((a, b) => a.label.localeCompare(b.label, locale));
    this.syncStopOptions();
  }

  private syncStopOptions(): void {
    const from = this.searchForm.get('fromStop')?.value;
    const to = this.searchForm.get('toStop')?.value;
    this.fromStopOptions = this.allStopOptions.filter((option) => option.value !== to);
    this.toStopOptions = this.allStopOptions.filter((option) => option.value !== from);
  }

  protected get isReturnTrip(): boolean {
    return this.searchForm.get('bookingType')?.value === 'return';
  }

  protected get numberOfPassengers(): number {
    return Number(this.searchForm.get('numberOfPassengers')?.value ?? 1);
  }

  protected get passengersArray(): FormArray {
    return this.passengersForm.get('passengers') as FormArray;
  }

  protected get stepIndex(): number {
    return this.steps.indexOf(this.currentStep);
  }

  // Fixed seat universe for the BUS layout (see passenger-seat-bus.component.html: B1..B21).
  private readonly busSeatLabels: string[] = Array.from({ length: 21 }, (_, i) => `B${i + 1}`);

  protected getTakenSeats(schedule: ScheduleSearchItemDto | null): string[] {
    if (!schedule) return [];
    // The BUS seat component has no availableSeatNumbers input, so derive the
    // taken set as the complement of availableSeatNumbers over the fixed layout.
    // availableSeatNumbers are plain digit strings (matching the VAN normalization),
    // so compare on the numeric part of each label.
    const available = (schedule.availableSeatNumbers ?? []).map((s) => String(s).replace(/\D/g, ''));
    if (available.length === 0) return [];
    return this.busSeatLabels.filter((label) => !available.includes(label.replace(/\D/g, '')));
  }

  protected async search(): Promise<void> {
    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();
      await this.alertService.warning(this.translate.instant('STAFF.VALIDATION.FORM_INVALID'));
      return;
    }

    const v = this.searchForm.value as {
      bookingType: 'one_way' | 'return';
      fromStop: string;
      toStop: string;
      departureDate: string;
      returnDate: string;
      numberOfPassengers: number;
    };
    const fromStop = String(v.fromStop ?? '').trim();
    const toStop = String(v.toStop ?? '').trim();
    if (fromStop && toStop && fromStop === toStop) {
      await this.alertService.warning(this.translate.instant('STAFF.VALIDATION.FROM_TO_SAME'));
      return;
    }

    if (v.bookingType === 'return' && v.returnDate && v.departureDate && v.returnDate < v.departureDate) {
      await this.alertService.warning(this.translate.instant('STAFF.VALIDATION.RETURN_DATE_BEFORE_DEPARTURE'));
      return;
    }

    this.isSearching = true;
    try {
      const req: ScheduleSearchReqDto = {
        bookingType: v.bookingType,
        departureDate: v.departureDate,
        fromStop,
        toStop,
        numberOfPassengers: Number(v.numberOfPassengers),
      };
      if (v.bookingType === 'return' && v.returnDate) {
        req.returnDate = v.returnDate;
      }

      const response = await firstValueFrom(this.staffApiService.searchSchedules(req));
      const data = response?.data;
      this.departureSchedules = data?.departureSchedules ?? [];
      this.arrivalSchedules = data?.arrivalSchedules ?? [];
      this.selectedDeparture = null;
      this.selectedArrival = null;
      this.goToStep('seats');
    } catch (error) {
      const message = extractApiErrorMessage(error) || this.translate.instant('STAFF.MESSAGES.LOAD_SCHEDULES_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isSearching = false;
    }
  }

  protected selectDeparture(schedule: ScheduleSearchItemDto): void {
    this.selectedDeparture = schedule;
    this.selectedDepartureSeats = [];
    void this.loadSeatMap(schedule);
  }

  protected selectArrival(schedule: ScheduleSearchItemDto): void {
    this.selectedArrival = schedule;
    this.selectedArrivalSeats = [];
  }

  protected onDepartureSeatChange(seat: string): void {
    const idx = this.selectedDepartureSeats.indexOf(seat);
    if (idx >= 0) {
      this.selectedDepartureSeats.splice(idx, 1);
    } else if (this.selectedDepartureSeats.length < this.numberOfPassengers) {
      this.selectedDepartureSeats.push(seat);
    }
  }

  protected onArrivalSeatChange(seat: string): void {
    const idx = this.selectedArrivalSeats.indexOf(seat);
    if (idx >= 0) {
      this.selectedArrivalSeats.splice(idx, 1);
    } else if (this.selectedArrivalSeats.length < this.numberOfPassengers) {
      this.selectedArrivalSeats.push(seat);
    }
  }

  protected async proceedFromSeats(): Promise<void> {
    if (!this.selectedDeparture) {
      await this.alertService.warning(this.translate.instant('STAFF.VALIDATION.FORM_INVALID'));
      return;
    }
    if (this.selectedDepartureSeats.length !== this.numberOfPassengers) {
      await this.alertService.warning(this.translate.instant('STAFF.VALIDATION.SEAT_COUNT_MISMATCH'));
      return;
    }
    if (this.isReturnTrip) {
      if (!this.selectedArrival) {
        await this.alertService.warning(this.translate.instant('STAFF.VALIDATION.FORM_INVALID'));
        return;
      }
      if (this.selectedArrivalSeats.length !== this.numberOfPassengers) {
        await this.alertService.warning(this.translate.instant('STAFF.VALIDATION.SEAT_COUNT_MISMATCH'));
        return;
      }
    }
    this.buildPassengersFormArray();
    this.calculateTotal();
    this.goToStep('passengers');
  }

  protected async confirmBooking(): Promise<void> {
    if (this.passengersForm.invalid) {
      this.passengersForm.markAllAsTouched();
      await this.alertService.warning(this.translate.instant('STAFF.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isConfirming = true;
    try {
      const searchVal = this.searchForm.value as {
        bookingType: 'one_way' | 'return';
        fromStop: string;
        toStop: string;
      };
      const dep = this.selectedDeparture!;
      const fromStop = String(searchVal.fromStop ?? '').trim();
      const toStop = String(searchVal.toStop ?? '').trim();

      const depPassengers: WalkInBookingPassengerReqDto[] = this.passengersArray.controls.map(
        (ctrl, i) => ({
          passengerType: 'ADULT',
          seatNumber: this.selectedDepartureSeats[i] ?? '',
          title: String(ctrl.get('title')?.value ?? ''),
          firstName: String(ctrl.get('firstName')?.value ?? ''),
          middleName: ctrl.get('middleName')?.value ? String(ctrl.get('middleName')?.value) : undefined,
          lastName: String(ctrl.get('lastName')?.value ?? ''),
          identityCardNumber: String(ctrl.get('identityCardNumber')?.value ?? ''),
          phoneNumber: String(ctrl.get('phoneNumber')?.value ?? ''),
          gender: String(ctrl.get('gender')?.value ?? 'MALE'),
        })
      );

      const depSchedule: WalkInBookingScheduleReqDto = {
        scheduleId: dep.id,
        fromStop,
        toStop,
        departureDateTime: dep.departureDateTime,
        arrivalDateTime: dep.arrivalDateTime,
        passengers: depPassengers,
      };

      const contactVal = this.passengersForm.get('contact')?.value as {
        title: string;
        firstName: string;
        middleName: string;
        lastName: string;
        phoneNumber: string;
        identityCardNumber: string;
        email: string;
        preferredLocale: string;
      };

      const payload: {
        bookingType: 'one_way' | 'return';
        totalAmount: number;
        bookingChannel: 'walk_in';
        departureSchedule: WalkInBookingScheduleReqDto;
        arrivalSchedule?: WalkInBookingScheduleReqDto;
        contact: {
          title: string;
          firstName: string;
          middleName?: string;
          lastName: string;
          phoneNumber: string;
          identityCardNumber: string;
          email: string;
          preferredLocale: string;
        };
      } = {
        bookingType: searchVal.bookingType,
        totalAmount: this.totalAmount,
        bookingChannel: 'walk_in',
        departureSchedule: depSchedule,
        contact: {
          title: String(contactVal?.title ?? ''),
          firstName: String(contactVal?.firstName ?? ''),
          middleName: contactVal?.middleName ? String(contactVal.middleName) : undefined,
          lastName: String(contactVal?.lastName ?? ''),
          phoneNumber: String(contactVal?.phoneNumber ?? ''),
          identityCardNumber: String(contactVal?.identityCardNumber ?? ''),
          email: String(contactVal?.email ?? ''),
          preferredLocale: String(contactVal?.preferredLocale ?? 'th'),
        },
      };

      if (this.isReturnTrip && this.selectedArrival) {
        const arr = this.selectedArrival;
        const arrPassengers: WalkInBookingPassengerReqDto[] = this.passengersArray.controls.map(
          (ctrl, i) => ({
            passengerType: 'ADULT',
            seatNumber: this.selectedArrivalSeats[i] ?? '',
            title: String(ctrl.get('title')?.value ?? ''),
            firstName: String(ctrl.get('firstName')?.value ?? ''),
            middleName: ctrl.get('middleName')?.value ? String(ctrl.get('middleName')?.value) : undefined,
            lastName: String(ctrl.get('lastName')?.value ?? ''),
            identityCardNumber: String(ctrl.get('identityCardNumber')?.value ?? ''),
            phoneNumber: String(ctrl.get('phoneNumber')?.value ?? ''),
            gender: String(ctrl.get('gender')?.value ?? 'MALE'),
          })
        );
        payload.arrivalSchedule = {
          scheduleId: arr.id,
          fromStop: toStop,
          toStop: fromStop,
          departureDateTime: arr.departureDateTime,
          arrivalDateTime: arr.arrivalDateTime,
          passengers: arrPassengers,
        };
      }

      const response = await firstValueFrom(this.staffApiService.createWalkInBooking(payload));
      const data = response?.data;
      this.bookingId = data?.bookingId ?? null;
      this.bookingNumber = data?.bookingNumber ?? null;
      this.idempotencyKey = null;
      this.goToStep('payment');
    } catch (error) {
      const message = extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isConfirming = false;
    }
  }

  protected async pay(): Promise<void> {
    if (!this.bookingId) return;

    // Generate ONCE on first entry; stable across retries
    if (!this.idempotencyKey) {
      this.idempotencyKey = crypto.randomUUID();
    }

    this.isProcessingPayment = true;
    try {
      await firstValueFrom(this.staffApiService.payWalkIn(this.bookingId, this.idempotencyKey));
      this.goToStep('ticket');
    } catch (error) {
      const message = extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isProcessingPayment = false;
    }
  }

  protected viewTicket(): void {
    if (!this.bookingId || !this.bookingNumber) return;
    this.store.dispatch(
      invokeSetBookingApi({ booking: { bookingId: this.bookingId, bookingNumber: this.bookingNumber } })
    );
    void this.router.navigate(['/e-ticket']);
  }

  protected newSale(): void {
    this.currentStep = 'search';
    this.searchForm.reset({ bookingType: 'one_way', numberOfPassengers: 1 });
    this.departureSchedules = [];
    this.arrivalSchedules = [];
    this.selectedDeparture = null;
    this.selectedArrival = null;
    this.selectedDepartureSeats = [];
    this.selectedArrivalSeats = [];
    this.bookingId = null;
    this.bookingNumber = null;
    this.idempotencyKey = null;
    this.totalAmount = 0;
    while (this.passengersArray.length > 0) {
      this.passengersArray.removeAt(0);
    }
  }

  protected goToStep(step: SellStep): void {
    if (step === 'payment' && !this.idempotencyKey) {
      this.idempotencyKey = crypto.randomUUID();
    }
    this.currentStep = step;
  }

  protected goBack(): void {
    const idx = this.steps.indexOf(this.currentStep);
    if (idx > 0) {
      this.currentStep = this.steps[idx - 1];
    }
  }

  private async loadSeatMap(schedule: ScheduleSearchItemDto): Promise<void> {
    this.isLoadingSeats = true;
    try {
      await firstValueFrom(this.staffApiService.getSeatMap(schedule.id));
    } catch {
      // ignore
    } finally {
      this.isLoadingSeats = false;
    }
  }

  private buildPassengersFormArray(): void {
    while (this.passengersArray.length > 0) {
      this.passengersArray.removeAt(0);
    }
    for (let i = 0; i < this.numberOfPassengers; i++) {
      this.passengersArray.push(this.formBuilder.group({
        title: ['', [Validators.required]],
        firstName: ['', [Validators.required]],
        middleName: [''],
        lastName: ['', [Validators.required]],
        identityCardNumber: ['', [Validators.required, Validators.minLength(13), Validators.maxLength(13)]],
        phoneNumber: ['', [Validators.required]],
        gender: ['MALE', [Validators.required]],
      }));
    }
  }

  private calculateTotal(): void {
    const depPrice = parseFloat(this.selectedDeparture?.pricePerSeat ?? '0') || 0;
    const arrPrice = parseFloat(this.selectedArrival?.pricePerSeat ?? '0') || 0;
    this.totalAmount = (depPrice + arrPrice) * this.numberOfPassengers;
  }

  protected isPassengerFieldInvalid(passengerIndex: number, fieldName: string): boolean {
    const ctrl = this.passengersArray.at(passengerIndex)?.get(fieldName);
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  protected isContactFieldInvalid(fieldName: string): boolean {
    const ctrl = this.passengersForm.get('contact')?.get(fieldName);
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }
}
