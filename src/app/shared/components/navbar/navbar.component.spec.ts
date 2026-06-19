import { NavbarComponent } from './navbar.component';
import {
  createElementRefStub,
  createPrimeNgConfigStub,
  createRouterStub,
  createTranslateStub,
} from '../../../testing/test-stubs';

describe('NavbarComponent', () => {
  let component: NavbarComponent;

  beforeEach(() => {
    component = new NavbarComponent(
      createTranslateStub(),
      createPrimeNgConfigStub(),
      {} as never,
      createElementRefStub(),
      {} as never,
      createRouterStub(),
      {} as never
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
