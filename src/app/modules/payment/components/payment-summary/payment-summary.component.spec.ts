import { PaymentSummaryComponent } from './payment-summary.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';

describe('PaymentSummaryComponent', () => {
  let component: PaymentSummaryComponent;

  beforeEach(() => {
    component = new PaymentSummaryComponent(
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
