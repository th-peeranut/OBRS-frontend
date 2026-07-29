import { PaymentComponent } from './payment.component';
import {
  createAnalyticsServiceStub,
  createRouterStub,
  createStoreStub,
} from '../../testing/test-stubs';

describe('PaymentComponent', () => {
  let component: PaymentComponent;

  beforeEach(() => {
    component = new PaymentComponent(
      createStoreStub(),
      createRouterStub(),
      createAnalyticsServiceStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
