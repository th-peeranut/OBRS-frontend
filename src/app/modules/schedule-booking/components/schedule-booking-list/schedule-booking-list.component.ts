import { Component } from '@angular/core';

@Component({
  selector: 'app-schedule-booking-list',
  templateUrl: './schedule-booking-list.component.html',
  styleUrl: './schedule-booking-list.component.scss',
})
export class ScheduleBookingListComponent {
  schedules = [
    {
      departure: '07:00',
      hour: 1,
      minute: 5,
      route: 'หมอชิต - BTS หมอชิต',
      arrival: '08:05',
      price: 150,
      available: 5,
    },
    {
      departure: '10:00',
      hour: 1,
      minute: 5,
      route: 'หมอชิต - BTS หมอชิต',
      arrival: '11:05',
      price: 150,
      available: 10,
    },
    {
      departure: '13:00',
      hour: 1,
      minute: 5,
      route: 'หมอชิต - BTS หมอชิต',
      arrival: '14:05',
      price: 150,
      available: 7,
    },
    {
      departure: '15:00',
      hour: 1,
      minute: 5,
      route: 'หมอชิต - BTS หมอชิต',
      arrival: '16:05',
      price: 150,
      available: 0,
    },
    {
      departure: '19:00',
      hour: 1,
      minute: 5,
      route: 'หมอชิต - BTS หมอชิต',
      arrival: '20:05',
      price: 150,
      available: 5,
    },
    {
      departure: '20:00',
      hour: 1,
      minute: 5,
      route: 'หมอชิต - BTS หมอชิต',
      arrival: '21:05',
      price: 150,
      available: 11,
    },
  ];

  selectSchedule(schedule: any) {
    console.log('Schedule selected:', schedule);
    // Implement logic to save selection

    
  }
}
