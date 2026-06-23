import { ScheduleBookingComponent } from './schedule-booking.component';
import { createStoreStub } from '../../testing/test-stubs';

describe('ScheduleBookingComponent', () => {
  let component: ScheduleBookingComponent;

  beforeEach(() => {
    component = new ScheduleBookingComponent(createStoreStub());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
