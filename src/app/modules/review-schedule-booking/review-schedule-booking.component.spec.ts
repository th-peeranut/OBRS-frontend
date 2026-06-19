import { ReviewScheduleBookingComponent } from './review-schedule-booking.component';
import { createStoreStub } from '../../testing/test-stubs';

describe('ReviewScheduleBookingComponent', () => {
  let component: ReviewScheduleBookingComponent;

  beforeEach(() => {
    component = new ReviewScheduleBookingComponent(createStoreStub());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
