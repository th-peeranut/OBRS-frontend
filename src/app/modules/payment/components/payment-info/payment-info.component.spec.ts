import { PaymentInfoComponent } from './payment-info.component';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';

describe('PaymentInfoComponent', () => {
  let component: PaymentInfoComponent;

  beforeEach(() => {
    component = new PaymentInfoComponent(
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
