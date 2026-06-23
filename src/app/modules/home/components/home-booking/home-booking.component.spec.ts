import { FormBuilder } from '@angular/forms';

import { HomeBookingComponent } from './home-booking.component';
import { createRouterStub, createStoreStub } from '../../../../testing/test-stubs';

describe('HomeBookingComponent', () => {
  let component: HomeBookingComponent;

  beforeEach(() => {
    component = new HomeBookingComponent(
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
