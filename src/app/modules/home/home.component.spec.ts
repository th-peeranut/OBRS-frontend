import { HomeComponent } from './home.component';
import { createStoreStub } from '../../testing/test-stubs';

describe('HomeComponent', () => {
  let component: HomeComponent;

  beforeEach(() => {
    component = new HomeComponent(createStoreStub());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
