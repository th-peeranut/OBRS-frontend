import { FormBuilder } from '@angular/forms';

import { PassengerInfoFormComponent } from './passenger-info-form.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';

describe('PassengerInfoFormComponent', () => {
  let component: PassengerInfoFormComponent;

  beforeEach(() => {
    component = new PassengerInfoFormComponent(
      createStoreStub(),
      createRouterStub(),
      new FormBuilder(),
      createTranslateStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('seat map always visible (Phase 1-A)', () => {
    it('isSelectSeat defaults to true for every new passenger group', () => {
      // insertPassenger goes through createPassengerGroup
      component.insertPassenger(true);
      const group = component.passengerData.at(0);
      expect(group.get('isSelectSeat')?.value).toBeTrue();
    });

    it('isSelectSeat defaults to true for child passengers too', () => {
      component.insertPassenger(false);
      const group = component.passengerData.at(0);
      expect(group.get('isSelectSeat')?.value).toBeTrue();
    });
  });
});
