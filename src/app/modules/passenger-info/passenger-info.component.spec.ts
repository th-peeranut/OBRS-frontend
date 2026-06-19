import { PassengerInfoComponent } from './passenger-info.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../testing/test-stubs';

describe('PassengerInfoComponent', () => {
  let component: PassengerInfoComponent;

  beforeEach(() => {
    component = new PassengerInfoComponent(
      createStoreStub(),
      createRouterStub(),
      {} as never,
      createTranslateStub(),
      {} as never
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
