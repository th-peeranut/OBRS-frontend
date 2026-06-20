import { FormBuilder } from '@angular/forms';

import { LoginMobileComponent } from './login-mobile.component';
import {
  createElementRefStub,
  createLanguageServiceStub,
  createRouterStub,
  createTranslateStub,
} from '../../testing/test-stubs';

describe('LoginMobileComponent', () => {
  let component: LoginMobileComponent;

  beforeEach(() => {
    component = new LoginMobileComponent(
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
