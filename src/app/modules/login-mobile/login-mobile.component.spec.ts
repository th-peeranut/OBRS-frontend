import { FormBuilder } from '@angular/forms';

import { LoginMobileComponent } from './login-mobile.component';
import {
  createElementRefStub,
  createPrimeNgConfigStub,
  createRouterStub,
  createTranslateStub,
} from '../../testing/test-stubs';

describe('LoginMobileComponent', () => {
  let component: LoginMobileComponent;

  beforeEach(() => {
    component = new LoginMobileComponent(
      createTranslateStub(),
      createPrimeNgConfigStub(),
      {} as never,
      createElementRefStub(),
      new FormBuilder(),
      createRouterStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
