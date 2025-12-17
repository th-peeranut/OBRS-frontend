import { Component, ViewChild } from '@angular/core';
import { Store } from '@ngrx/store';
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

@Component({
  selector: 'app-passenger-info',
  templateUrl: './passenger-info.component.html',
  styleUrl: './passenger-info.component.scss',
})
export class PassengerInfoComponent {
  @ViewChild(PassengerInfoFormComponent)
  passengerInfoFormComponent?: PassengerInfoFormComponent;
  isPassengerFormValid = false;

  constructor(private store: Store, private router: Router) {}

  ngOnInit(): void {
    this.store.dispatch(invokeGetAllProvinceWithStationApi());
    this.store.dispatch(invokeGetScheduleBookingApi());
    this.store.dispatch(invokeGetScheduleFilterApi());
  }

  onPassengerFormValidityChange(isValid: boolean): void {
    this.isPassengerFormValid = isValid;
  }

  onSubmitPassengerInfo(): void {
    const passengerInfo =
      this.passengerInfoFormComponent?.validateAndGetPassengerInfo();

    if (!passengerInfo) {
      return;
    }

    this.store.dispatch(invokeSetPassengerInfo({ passengerInfo }));
    this.router.navigate(['/payment']);
  }

  onBack(): void {
    this.router.navigate(['/review-schedule-booking']);
  }
}
