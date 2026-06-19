import { FormBuilder } from '@angular/forms';

import { RegisterComponent } from './register.component';
import {
  createElementRefStub,
  createPrimeNgConfigStub,
  createRouterStub,
  createTranslateStub,
} from '../../testing/test-stubs';

describe('RegisterComponent', () => {
  let component: RegisterComponent;

  beforeEach(() => {
    component = new RegisterComponent(
      createTranslateStub(),
      createPrimeNgConfigStub(),
      {} as never,
      createElementRefStub(),
      new FormBuilder(),
      {} as never,
      {} as never,
      {} as never,
      createRouterStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
