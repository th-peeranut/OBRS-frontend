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

  describe('per-leg return seats (Phase B)', () => {
    it('passengerSeatReturn defaults to empty for every new passenger group', () => {
      component.insertPassenger(true);
      expect(component.getFormValue(0, 'passengerSeatReturn')).toBe('');
    });

    it('setPassengerSeatReturn sets the return seat without touching the outbound seat', () => {
      component.insertPassenger(true);
      component.setPassengerSeat(0, '3');
      component.setPassengerSeatReturn(0, '7');
      expect(component.getFormValue(0, 'passengerSeat')).toBe('3');
      expect(component.getFormValue(0, 'passengerSeatReturn')).toBe('7');
    });

    it('outbound and return pools are independent — the same label is allowed on each leg', () => {
      component.insertPassenger(true);
      component.setPassengerSeat(0, '5');
      component.setPassengerSeatReturn(0, '5');
      expect(component.getFormValue(0, 'passengerSeat')).toBe('5');
      expect(component.getFormValue(0, 'passengerSeatReturn')).toBe('5');
    });

    it('getTakenSeatsReturn excludes the current passenger and lists the others’ return seats', () => {
      component.insertPassenger(true);
      component.insertPassenger(true);
      component.setPassengerSeatReturn(0, '2');
      component.setPassengerSeatReturn(1, '4');
      expect(component.getTakenSeatsReturn(0)).toEqual(['4']);
      expect(component.getTakenSeatsReturn(1)).toEqual(['2']);
    });

    it('setPassengerSeatReturn refuses a seat already taken by another passenger on the return leg', () => {
      component.insertPassenger(true);
      component.insertPassenger(true);
      component.setPassengerSeatReturn(0, '6');
      component.setPassengerSeatReturn(1, '6');
      expect(component.getFormValue(1, 'passengerSeatReturn')).toBe('');
    });
  });
});
