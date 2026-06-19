import { StepperComponent } from './stepper.component';
import { createRouterStub } from '../../../testing/test-stubs';

describe('StepperComponent', () => {
  let component: StepperComponent;

  beforeEach(() => {
    component = new StepperComponent(createRouterStub());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
