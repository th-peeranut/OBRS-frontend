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

@Component({
  selector: 'app-passenger-info',
  templateUrl: './passenger-info.component.html',
  styleUrl: './passenger-info.component.scss',
})
export class PassengerInfoComponent {
  @ViewChild(PassengerInfoFormComponent)
  passengerInfoFormComponent?: PassengerInfoFormComponent;
  isPassengerFormValid = false;

  constructor(
    private store: Store,
    private router: Router,
    private bookingService: BookingService
  ) {}

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
    const departureSchedule = schedules[0];
    const arrivalSchedule = isReturnTrip ? schedules[1] : null;

    const departurePassengers = this.buildPassengersPayload(
      passengerInfo,
      departureSchedule?.fare
    );
    const arrivalPassengers =
      isReturnTrip && arrivalSchedule
        ? this.buildPassengersPayload(passengerInfo, arrivalSchedule.fare)
        : [];

    const totalCost =
      this.sumPassengerCost(departurePassengers) +
      this.sumPassengerCost(arrivalPassengers);

    const payload: BookingPayload = {
      bookingType: isReturnTrip ? 'Return' : 'One way',
      totalCost,
      departureSchedule: this.buildSchedulePayload(
        departureSchedule,
        this.toNumber(scheduleFilter?.startStationId),
        this.toNumber(scheduleFilter?.stopStationId),
        departurePassengers
      ),
    };

    if (arrivalPassengers.length && arrivalSchedule) {
      payload.arrivalSchedule = this.buildSchedulePayload(
        arrivalSchedule,
        this.toNumber(scheduleFilter?.stopStationId),
        this.toNumber(scheduleFilter?.startStationId),
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
    fare?: number
  ): BookingSchedulePayload['passengers'] {
    const costPerPassenger = Number(fare) || 0;
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
    pickupStationId: number,
    dropOffStationId: number,
    passengers: BookingSchedulePayload['passengers']
  ): BookingSchedulePayload {
    return {
      scheduleId: schedule?.id ?? 0,
      pickupStationId,
      dropOffStationId,
      departureDateTime: this.toDateTime(
        schedule?.departureDate,
        schedule?.departureTime
      ),
      arrivalDateTime: this.toDateTime(
        schedule?.departureDate,
        schedule?.arrivalTime
      ),
      passengers,
    };
  }

  private sumPassengerCost(
    passengers: BookingSchedulePayload['passengers']
  ): number {
    return passengers.reduce((sum, passenger) => sum + (Number(passenger.cost) || 0), 0);
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toDateTime(dateStr?: string, timeStr?: string): string {
    if (!dateStr || !timeStr) {
      return '';
    }

    const normalizedTime =
      timeStr.length === 5 ? `${timeStr}:00` : timeStr || '00:00:00';
    const datetime = dayjs(`${dateStr}T${normalizedTime}`);

    return datetime.isValid()
      ? datetime.format('YYYY-MM-DDTHH:mm:ss')
      : `${dateStr}T${normalizedTime}`;
  }
}
