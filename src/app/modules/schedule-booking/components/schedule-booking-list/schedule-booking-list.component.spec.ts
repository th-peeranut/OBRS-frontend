import { ScheduleBookingListComponent } from './schedule-booking-list.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';

describe('ScheduleBookingListComponent', () => {
  let component: ScheduleBookingListComponent;

  beforeEach(() => {
    component = new ScheduleBookingListComponent(
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
