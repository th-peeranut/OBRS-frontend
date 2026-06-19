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
});
