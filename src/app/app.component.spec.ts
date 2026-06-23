import { AppComponent } from './app.component';
import {
  createLanguageServiceStub,
  createTranslateStub,
} from './testing/test-stubs';

describe('AppComponent', () => {
  let component: AppComponent;

  beforeEach(() => {
    component = new AppComponent(
      createTranslateStub(),
      createLanguageServiceStub()
    );
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it(`should have as title 'OBRS'`, () => {
    expect(component.title).toEqual('OBRS');
  });
});
