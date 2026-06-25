import { of } from 'rxjs';
import { AppComponent } from './app.component';
import {
  createLanguageServiceStub,
  createTranslateStub,
} from './testing/test-stubs';

function createThemeServiceStub(): any {
  return {
    mode$: of('light'),
    init: () => {},
    toggle: () => {},
    getStoredMode: () => 'light',
    setMode: () => {},
  };
}

describe('AppComponent', () => {
  let component: AppComponent;

  beforeEach(() => {
    component = new AppComponent(
      createTranslateStub(),
      createLanguageServiceStub(),
      createThemeServiceStub()
    );
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it(`should have as title 'OBRS'`, () => {
    expect(component.title).toEqual('OBRS');
  });
});
