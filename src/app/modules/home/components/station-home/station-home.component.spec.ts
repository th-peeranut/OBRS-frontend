import { StationHomeComponent } from './station-home.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';

describe('StationHomeComponent', () => {
  let component: StationHomeComponent;

  beforeEach(() => {
    component = new StationHomeComponent(
      createRouterStub(),
      createTranslateStub(),
      createStoreStub(),
      createStoreStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
