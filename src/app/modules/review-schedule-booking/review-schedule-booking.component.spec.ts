import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReviewScheduleBookingComponent } from './review-schedule-booking.component';

describe('ReviewScheduleBookingComponent', () => {
  let component: ReviewScheduleBookingComponent;
  let fixture: ComponentFixture<ReviewScheduleBookingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ReviewScheduleBookingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReviewScheduleBookingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
