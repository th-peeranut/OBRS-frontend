import { of } from 'rxjs';
import { AppComponent } from './app.component';
import {
  createAnalyticsServiceStub,
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
  let analytics: any;

  beforeEach(() => {
    analytics = createAnalyticsServiceStub();
    spyOn(analytics, 'init').and.callThrough();

    component = new AppComponent(
      createTranslateStub(),
      createLanguageServiceStub(),
      createThemeServiceStub(),
      analytics
    );
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it(`should have as title 'OBRS'`, () => {
    expect(component.title).toEqual('OBRS');
  });

  it('wires analytics at bootstrap (OBRS-867)', () => {
    // `init()` only subscribes — it loads no tag and reaches no network until
    // consent is granted (asserted in analytics.service.spec.ts). If this call
    // is ever dropped, the funnel silently stops recording with nothing red.
    expect(analytics.init).toHaveBeenCalled();
  });
});
