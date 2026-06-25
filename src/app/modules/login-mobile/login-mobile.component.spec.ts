import { FormBuilder } from '@angular/forms';

import { LoginMobileComponent } from './login-mobile.component';
import { createRouterStub } from '../../testing/test-stubs';

describe('LoginMobileComponent', () => {
  let component: LoginMobileComponent;

  beforeEach(() => {
    component = new LoginMobileComponent(new FormBuilder(), createRouterStub());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
