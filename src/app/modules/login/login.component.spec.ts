import { FormBuilder } from '@angular/forms';

import { LoginComponent } from './login.component';
import {
  createElementRefStub,
  createLanguageServiceStub,
  createTranslateStub,
} from '../../testing/test-stubs';

describe('LoginComponent', () => {
  let component: LoginComponent;

  beforeEach(() => {
    component = new LoginComponent(
      createTranslateStub(),
      createLanguageServiceStub(),
      {} as never,
      createElementRefStub(),
      new FormBuilder(),
      {} as never,
      {} as never
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
