import { AppComponent } from './app.component';
import {
  createPrimeNgConfigStub,
  createTranslateStub,
} from './testing/test-stubs';

describe('AppComponent', () => {
  let component: AppComponent;

  beforeEach(() => {
    component = new AppComponent(
      createTranslateStub(),
      createPrimeNgConfigStub()
    );
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it(`should have as title 'OBRS'`, () => {
    expect(component.title).toEqual('OBRS');
  });
});
