import { FormBuilder } from '@angular/forms';

import { ForgetPasswordComponent } from './forget-password.component';
import {
  createElementRefStub,
  createLanguageServiceStub,
  createRouterStub,
  createTranslateStub,
} from '../../testing/test-stubs';

describe('ForgetPasswordComponent', () => {
  let component: ForgetPasswordComponent;

  beforeEach(() => {
    component = new ForgetPasswordComponent(
      createTranslateStub(),
      createLanguageServiceStub(),
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
