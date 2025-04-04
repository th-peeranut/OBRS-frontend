import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScheduleBookingListComponent } from './schedule-booking-list.component';

describe('ScheduleBookingListComponent', () => {
  let component: ScheduleBookingListComponent;
  let fixture: ComponentFixture<ScheduleBookingListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ScheduleBookingListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
