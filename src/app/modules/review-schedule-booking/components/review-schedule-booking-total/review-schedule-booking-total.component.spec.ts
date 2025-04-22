import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReviewScheduleBookingTotalComponent } from './review-schedule-booking-total.component';

describe('ReviewScheduleBookingTotalComponent', () => {
  let component: ReviewScheduleBookingTotalComponent;
  let fixture: ComponentFixture<ReviewScheduleBookingTotalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ReviewScheduleBookingTotalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReviewScheduleBookingTotalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
