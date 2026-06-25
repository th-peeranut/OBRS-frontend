import { FormBuilder } from '@angular/forms';

import { LoginComponent } from './login.component';
import { createTranslateStub } from '../../testing/test-stubs';

describe('LoginComponent', () => {
  let component: LoginComponent;

  beforeEach(() => {
    component = new LoginComponent(
      createTranslateStub(),
      new FormBuilder(),
      {} as never,
      {} as never
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
