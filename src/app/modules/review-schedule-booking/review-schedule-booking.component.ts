import { Component } from '@angular/core';

// store
import { Store } from '@ngrx/store';
import {
  invokeGetScheduleBookingApi,
  invokeSetScheduleBookingApi,
} from '../../shared/stores/schedule-booking/schedule-booking.action';
import {
  invokeGetScheduleFilterApi,
  invokeSetScheduleFilterApi,
} from '../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeGetAllProvinceWithStationApi } from '../../shared/stores/province/province.action';

@Component({
  selector: 'app-review-schedule-booking',
  templateUrl: './review-schedule-booking.component.html',
  styleUrl: './review-schedule-booking.component.scss',
})
export class ReviewScheduleBookingComponent {
  mockData = [
    {
      id: 1,
      departureDate: '2025-12-20',
      departureTime: '08:00:00',
      availableSeat: 21,
      status: 'Scheduled',
      createdBy: 'system',
      createdDate: '2025-08-19 20:28:46',
      lastUpdatedBy: 'system',
      lastUpdatedDate: '2025-08-19 20:28:46',
      route: {
        id: 1,
        nameThai: 'ชลบุรี-กรุงเทพฯ',
        nameEnglish: 'Chonburi-Bangkok',
        createdBy: 'system',
        createdDate: '2025-08-19 20:28:46',
        lastUpdatedBy: 'system',
        lastUpdatedDate: '2025-08-19 20:28:46',
      },
      vehicle: {
        id: 1,
        numberPlate: 'กข 1234',
        vehicleNumber: '12-34',
        status: 1,
        createdBy: 'system',
        createdDate: '2025-08-19 20:28:46',
        lastUpdatedBy: 'system',
        lastUpdatedDate: '2025-08-19 20:28:46',
        vehicleType: {
          id: 1,
          name: 'Van',
          totalSeat: 14,
          seatingMap: 2,
          createdBy: 'system',
          createdDate: '2025-08-19 20:28:46',
          lastUpdatedBy: 'system',
          lastUpdatedDate: '2025-08-19 20:28:46',
        },
      },
      vehicleType: {
        id: 1,
        name: 'Van',
        totalSeat: 14,
        seatingMap: 2,
        createdBy: 'system',
        createdDate: '2025-08-19 20:28:46',
        lastUpdatedBy: 'system',
        lastUpdatedDate: '2025-08-19 20:28:46',
      },
      driver: null,
      arrivalTime: '10:25:00',
      travelTime: '02:25',
      fare: 180,
    },
    {
      id: 2,
      departureDate: '2025-12-20',
      departureTime: '11:05:00',
      availableSeat: 21,
      status: 'Scheduled',
      createdBy: 'system',
      createdDate: '2025-08-19 20:28:46',
      lastUpdatedBy: 'system',
      lastUpdatedDate: '2025-08-19 20:28:46',
      route: {
        id: 2,
        nameThai: 'กรุงเทพฯ-ชลบุรี',
        nameEnglish: 'Bangkok-Chonburi',
        createdBy: 'system',
        createdDate: '2025-08-19 20:28:46',
        lastUpdatedBy: 'system',
        lastUpdatedDate: '2025-08-19 20:28:46',
      },
      vehicle: {
        id: 1,
        numberPlate: 'กข 1234',
        vehicleNumber: '12-34',
        status: 1,
        createdBy: 'system',
        createdDate: '2025-08-19 20:28:46',
        lastUpdatedBy: 'system',
        lastUpdatedDate: '2025-08-19 20:28:46',
        vehicleType: {
          id: 1,
          name: 'Van',
          totalSeat: 14,
          seatingMap: 2,
          createdBy: 'system',
          createdDate: '2025-08-19 20:28:46',
          lastUpdatedBy: 'system',
          lastUpdatedDate: '2025-08-19 20:28:46',
        },
      },
      vehicleType: {
        id: 1,
        name: 'Van',
        totalSeat: 14,
        seatingMap: 2,
        createdBy: 'system',
        createdDate: '2025-08-19 20:28:46',
        lastUpdatedBy: 'system',
        lastUpdatedDate: '2025-08-19 20:28:46',
      },
      driver: null,
      arrivalTime: '13:30:00',
      travelTime: '02:25',
      fare: 170,
    },
  ];

  mockFilter = {
    roundTrip: {
      id: 2,
      nameThai: 'ไป-กลับ',
      nameEnglish: 'Round-trip',
    },
    passengerInfo: [
      {
        type: 'ADULT',
        count: 1,
      },
      {
        type: 'KIDS',
        count: 1,
      },
    ],
    startStationId: 1,
    stopStationId: 3,
    departureDate: '2025-12-19T17:00:00.000Z',
    startReturnStationId: '',
    stopReturnStationId: '',
    returnDate: '2025-12-19T17:00:00.000Z',
  };

  constructor(private store: Store) {
    // this.store.dispatch(
    //   invokeSetScheduleBookingApi({
    //     schedule_booking: {
    //       schedule: this.mockData,
    //     },
    //   })
    // );

    //  this.store.dispatch(
    //   invokeSetScheduleFilterApi({
    //     schedule_filter: this.mockFilter,
    //   })
    // );
  }

  ngOnInit(): void {
    this.store.dispatch(invokeGetAllProvinceWithStationApi());
    this.store.dispatch(invokeGetScheduleBookingApi());
    this.store.dispatch(invokeGetScheduleFilterApi());
  }
}
