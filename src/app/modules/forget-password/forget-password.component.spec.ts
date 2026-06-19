import { FormBuilder } from '@angular/forms';

import { ForgetPasswordComponent } from './forget-password.component';
import {
  createElementRefStub,
  createPrimeNgConfigStub,
  createRouterStub,
  createTranslateStub,
} from '../../testing/test-stubs';

describe('ForgetPasswordComponent', () => {
  let component: ForgetPasswordComponent;

  beforeEach(() => {
    component = new ForgetPasswordComponent(
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
