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
    private bookingService: BookingService
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
        await firstValueFrom(
          this.bookingService.createBooking(bookingPayload).pipe(take(1))
        );
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

    const departurePassengers = this.buildPassengersPayload(
      passengerInfo,
      departureSchedule?.pricePerSeat
    );
    const arrivalPassengers =
      isReturnTrip && arrivalSchedule
        ? this.buildPassengersPayload(passengerInfo, arrivalSchedule.pricePerSeat)
        : [];

    const totalCost =
      this.sumPassengerCost(departurePassengers) +
      this.sumPassengerCost(arrivalPassengers);

    const payload: BookingPayload = {
      bookingType: isReturnTrip ? 'return' : 'one_way',
      totalCost,
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
    passengers: PassengerInfo[],
    pricePerSeat?: string | number | null
  ): BookingSchedulePayload['passengers'] {
    const costPerPassenger = this.getPricePerSeat(pricePerSeat);
    return passengers.map((passenger) => ({
      passengerType: passenger.isAdult ? 'General public' : 'Child',
      seatNumber: passenger.passengerSeat || null,
      cost: costPerPassenger,
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
      pickupStation,
      dropOffStation,
      departureDateTime: this.normalizeDateTime(schedule?.departureDateTime),
      arrivalDateTime: this.normalizeDateTime(schedule?.arrivalDateTime),
      passengers,
    };
  }

  private sumPassengerCost(
    passengers: BookingSchedulePayload['passengers']
  ): number {
    return passengers.reduce((sum, passenger) => sum + (Number(passenger.cost) || 0), 0);
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
}
