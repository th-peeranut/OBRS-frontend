import { FormBuilder } from '@angular/forms';

import { ForgetPasswordComponent } from './forget-password.component';
import { createRouterStub } from '../../testing/test-stubs';

describe('ForgetPasswordComponent', () => {
  let component: ForgetPasswordComponent;

  beforeEach(() => {
    component = new ForgetPasswordComponent(new FormBuilder(), createRouterStub());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
