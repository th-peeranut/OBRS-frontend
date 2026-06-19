import { PaymentComponent } from './payment.component';
import { createRouterStub, createStoreStub } from '../../testing/test-stubs';

describe('PaymentComponent', () => {
  let component: PaymentComponent;

  beforeEach(() => {
    component = new PaymentComponent(createStoreStub(), createRouterStub());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
