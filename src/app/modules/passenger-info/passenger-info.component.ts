import { Component, ViewChild } from '@angular/core';
import { Store, select } from '@ngrx/store';
import { Router } from '@angular/router';
import { invokeGetAllProvinceWithStationApi } from '../../shared/stores/province/province.action';
import {
  invokeSetScheduleBookingApi,
  invokeGetScheduleBookingApi,
} from '../../shared/stores/schedule-booking/schedule-booking.action';
import {
  invokeSetScheduleFilterApi,
  invokeGetScheduleFilterApi,
} from '../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeSetPassengerInfo } from '../../shared/stores/passenger-info/passenger-info.action';
import { PassengerInfoFormComponent } from './components/passenger-info-form/passenger-info-form.component';
import { selectScheduleBooking } from '../../shared/stores/schedule-booking/schedule-booking.selector';
import { selectScheduleFilter } from '../../shared/stores/schedule-filter/schedule-filter.selector';
import { BookingService } from '../../services/booking/booking.service';
import {
  BookingPayload,
  BookingSchedulePayload,
} from '../../shared/interfaces/booking.interface';
import { Schedule } from '../../shared/interfaces/schedule.interface';
import { PassengerInfo } from '../../shared/interfaces/passenger-info.interface';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import dayjs from 'dayjs';
import { selectProvinceWithStation } from '../../shared/stores/province/province.selector';
import { ProvinceStation } from '../../shared/interfaces/province.interface';
import { Observable } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { AlertService } from '../../shared/services/alert.service';

@Component({
  selector: 'app-passenger-info',
  templateUrl: './passenger-info.component.html',
  styleUrl: './passenger-info.component.scss',
})
export class PassengerInfoComponent {
  @ViewChild(PassengerInfoFormComponent)
  passengerInfoFormComponent?: PassengerInfoFormComponent;
  isPassengerFormValid = false;
  rawProvinceStationList: Observable<ProvinceStation[]>;

  constructor(
    private store: Store,
    private router: Router,
    private bookingService: BookingService,
    private translateService: TranslateService,
    private alertService: AlertService
  ) {
    this.rawProvinceStationList = this.store.pipe(
      select(selectProvinceWithStation)
    );
  }

  ngOnInit(): void {
    this.store.dispatch(invokeGetAllProvinceWithStationApi());
    this.store.dispatch(invokeGetScheduleBookingApi());
    this.store.dispatch(invokeGetScheduleFilterApi());
  }

  onPassengerFormValidityChange(isValid: boolean): void {
    this.isPassengerFormValid = isValid;
  }

  async onSubmitPassengerInfo(): Promise<void> {
    const passengerInfo =
      this.passengerInfoFormComponent?.validateAndGetPassengerInfo();

    if (!passengerInfo) {
      return;
    }

    this.store.dispatch(invokeSetPassengerInfo({ passengerInfo }));

    const bookingPayload = await this.buildBookingPayload(passengerInfo);

    if (bookingPayload) {
      try {
        const response = await firstValueFrom(
          this.bookingService.createBooking(bookingPayload).pipe(take(1))
        );
        if (response?.code === 200 || response?.code === 201) {
          this.alertService.success(
            this.translateService.instant(
              'PASSENGER_INFO.ALERT.CREATE_SUCCESS'
            )
          );
        }
      } catch (error) {
        console.error('Booking creation failed', error);
      }
    }

    this.router.navigate(['/payment']);
  }

  onBack(): void {
    this.router.navigate(['/review-schedule-booking']);
  }

  private async buildBookingPayload(
    passengerInfo: PassengerInfo[]
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

    const departurePassengers = this.buildPassengersPayload(passengerInfo);
    const arrivalPassengers =
      isReturnTrip && arrivalSchedule
        ? this.buildPassengersPayload(passengerInfo)
        : [];

    const totalAmount =
      this.calculateTotalAmount(passengerInfo, departureSchedule?.pricePerSeat) +
      (isReturnTrip
        ? this.calculateTotalAmount(passengerInfo, arrivalSchedule?.pricePerSeat)
        : 0);

    const contact = this.buildContactPayload(passengerInfo);

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

  private isReturnTrip(roundTrip: any): boolean {
    const roundTripId =
      typeof roundTrip === 'object' && roundTrip !== null ? roundTrip.id : roundTrip;
    const value = String(roundTripId).toLowerCase();
    return roundTripId === 2 || value === 'return' || value === '2';
  }

  private buildPassengersPayload(
    passengers: PassengerInfo[]
  ): BookingSchedulePayload['passengers'] {
    return passengers.map((passenger) => ({
      passengerType: this.normalizePassengerType(passenger.gender),
      seatNumber: this.normalizeSeatNumber(passenger.passengerSeat),
      firstName: passenger.firstName,
      middleName: passenger.middleName || null,
      lastName: passenger.lastName,
    }));
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
    const costPerPassenger = this.getPricePerSeat(pricePerSeat);
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

    const provinceList = await firstValueFrom(
      this.rawProvinceStationList.pipe(take(1))
    );
    for (const province of provinceList ?? []) {
      const match = province.stations.find((station) => station.id === parsed);
      if (match) {
        return match.code || String(raw);
      }
    }

    return String(raw);
  }

  private getPricePerSeat(value: string | number | null | undefined): number {
    const parsed = typeof value === 'string' ? parseFloat(value) : value ?? 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private buildContactPayload(passengers: PassengerInfo[]): BookingPayload['contact'] {
    const primary = passengers[0];
    const fullName = this.buildFullName(primary);
    const phoneNumber = primary?.phoneNumber ?? '';
    const preferredLocale = this.getPreferredLocale();

    return {
      fullName,
      phoneNumber,
      preferredLocale,
    };
  }

  private buildFullName(passenger?: PassengerInfo | null): string {
    if (!passenger) {
      return '';
    }

    const parts = [
      passenger.firstName,
      passenger.middleName,
      passenger.lastName,
    ]
      .map((value) => (value ?? '').trim())
      .filter((value) => value.length > 0);

    return parts.join(' ');
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
    if (!dateTime) {
      return '';
    }

    const normalized = dateTime.includes('T')
      ? dateTime
      : dateTime.replace(' ', 'T');
    const datetime = dayjs(normalized);

    return datetime.isValid()
      ? datetime.format('YYYY-MM-DDTHH:mm:ss')
      : normalized;
  }

  private normalizeSeatNumber(seatNumber?: string | null): string | null {
    if (!seatNumber) {
      return null;
    }

    const digits = seatNumber.match(/\d+/g)?.join('') ?? '';
    return digits.length > 0 ? digits : null;
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
}
