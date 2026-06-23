import { ReviewScheduleBookingTotalComponent } from './review-schedule-booking-total.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';

describe('ReviewScheduleBookingTotalComponent', () => {
  let component: ReviewScheduleBookingTotalComponent;

  beforeEach(() => {
    component = new ReviewScheduleBookingTotalComponent(
      createStoreStub(),
      createRouterStub(),
      createStoreStub(),
      createTranslateStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
