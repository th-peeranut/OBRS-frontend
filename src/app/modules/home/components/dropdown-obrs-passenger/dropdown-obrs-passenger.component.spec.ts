import { DropdownObrsPassengerComponent } from './dropdown-obrs-passenger.component';
import { createElementRefStub } from '../../../../testing/test-stubs';

describe('DropdownObrsPassengerComponent', () => {
  let component: DropdownObrsPassengerComponent;

  beforeEach(() => {
    component = new DropdownObrsPassengerComponent({} as never, createElementRefStub());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('caps the total passenger count at maxPassengers', () => {
    for (let i = 0; i < component.maxPassengers + 5; i++) {
      component.updatePassengerCount('ADULT', 'ADD');
    }
    expect(component.sumPassenger).toBe(component.maxPassengers);
    expect(component.isAtMaxPassengers).toBe(true);
  });

  it('does not add across types once the total reaches maxPassengers', () => {
    for (let i = 0; i < component.maxPassengers; i++) {
      component.updatePassengerCount('ADULT', 'ADD');
    }
    component.updatePassengerCount('KIDS', 'ADD');
    expect(component.sumPassenger).toBe(component.maxPassengers);
    expect(component.sumKidsPassenger).toBe(0);
  });

  it('allows adding again after decrementing below the max', () => {
    for (let i = 0; i < component.maxPassengers; i++) {
      component.updatePassengerCount('ADULT', 'ADD');
    }
    component.updatePassengerCount('ADULT', 'MINUS');
    expect(component.isAtMaxPassengers).toBe(false);
    component.updatePassengerCount('KIDS', 'ADD');
    expect(component.sumPassenger).toBe(component.maxPassengers);
    expect(component.sumKidsPassenger).toBe(1);
  });
});
