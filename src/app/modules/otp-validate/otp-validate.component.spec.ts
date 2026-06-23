import { FormBuilder } from '@angular/forms';

import { OtpValidateComponent } from './otp-validate.component';
import {
  createElementRefStub,
  createLanguageServiceStub,
  createRouterStub,
  createTranslateStub,
} from '../../testing/test-stubs';

describe('OtpValidateComponent', () => {
  let component: OtpValidateComponent;

  beforeEach(() => {
    component = new OtpValidateComponent(
      createTranslateStub(),
      createLanguageServiceStub(),
      {} as never,
      createElementRefStub(),
      new FormBuilder(),
      {} as never,
      {} as never,
      createRouterStub(),
      {} as never,
      {} as never,
      {} as never
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
