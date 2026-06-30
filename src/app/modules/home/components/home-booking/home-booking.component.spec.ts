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

  it('defaults the passenger selection to 1 adult and 0 kids', () => {
    expect(component.bookingForm.get('passengerInfo')?.value).toEqual([
      { type: 'ADULT', count: 1 },
      { type: 'KIDS', count: 0 },
    ]);
  });

  it('is searchable by default because a passenger is pre-selected', () => {
    expect(component.isPassengerSelected).toBe(true);
  });
});
