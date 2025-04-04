import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScheduleBookingComponent } from './schedule-booking.component';

describe('ScheduleBookingComponent', () => {
  let component: ScheduleBookingComponent;
  let fixture: ComponentFixture<ScheduleBookingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ScheduleBookingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
