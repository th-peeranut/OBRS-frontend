import { FormBuilder } from '@angular/forms';

import { ScheduleBookingFilterComponent } from './schedule-booking-filter.component';
import { createRouterStub, createStoreStub } from '../../../../testing/test-stubs';

describe('ScheduleBookingFilterComponent', () => {
  let component: ScheduleBookingFilterComponent;

  beforeEach(() => {
    component = new ScheduleBookingFilterComponent(
      new FormBuilder(),
      createRouterStub(),
      createStoreStub(),
      createStoreStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
