import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReviewScheduleBookingSummaryComponent } from './review-schedule-booking-summary.component';

describe('ReviewScheduleBookingSummaryComponent', () => {
  let component: ReviewScheduleBookingSummaryComponent;
  let fixture: ComponentFixture<ReviewScheduleBookingSummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ReviewScheduleBookingSummaryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReviewScheduleBookingSummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
