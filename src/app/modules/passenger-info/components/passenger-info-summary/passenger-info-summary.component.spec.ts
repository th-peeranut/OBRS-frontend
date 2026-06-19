import { PassengerInfoSummaryComponent } from './passenger-info-summary.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';

describe('PassengerInfoSummaryComponent', () => {
  let component: PassengerInfoSummaryComponent;

  beforeEach(() => {
    component = new PassengerInfoSummaryComponent(
      createStoreStub(),
      createRouterStub(),
      createStoreStub(),
      createTranslateStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
