import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
  provideHttpClient,
  HttpClient,
  withInterceptors,
} from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AppRoutingModule } from './app-routing.module';
import { errorInterceptor } from './shared/interceptors/error.interceptor';

// PrimeNG theming (OBRS-915). PrimeNG 18 deleted the CSS-file theme system, so
// `primeng/resources/themes/lara-light-blue/theme.css` no longer exists and the
// two `styles[]` entries that loaded it are gone from angular.json. The theme is
// configured here instead.
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeng/themes';
import Lara from '@primeng/themes/lara';

/**
 * Lara with its primary palette put back to BLUE.
 *
 * The stylesheet this replaces was `lara-light-blue`. `@primeng/themes/lara`
 * is only the Lara *structure*: its semantic primary is `{emerald.*}`
 * (node_modules/@primeng/themes/lara/base/index.mjs), so `preset: Lara` alone
 * ships a green app.
 *
 * That is not a theory. OBRS-915 measured the checked ToggleSwitch in light
 * mode at `rgb(59, 130, 246)` before the upgrade and `rgb(16, 185, 129)` after
 * — blue.500 to emerald.500. Nothing failed: the build was green, all 4428
 * specs were green, and the control had simply changed colour. Mapping primary
 * back onto `{blue.*}` restores 59/130/246 exactly, which is why the palette is
 * referenced by token rather than hard-coded — the token IS the previous value.
 */
const LaraBlue = definePreset(Lara, {
  semantic: {
    primary: {
      50: '{blue.50}',
      100: '{blue.100}',
      200: '{blue.200}',
      300: '{blue.300}',
      400: '{blue.400}',
      500: '{blue.500}',
      600: '{blue.600}',
      700: '{blue.700}',
      800: '{blue.800}',
      900: '{blue.900}',
      950: '{blue.950}',
    },
  },
});

// auth
import { AuthGuard } from './auth/auth.guard';
import { authInterceptor } from './auth/auth.interceptor';
import { AuthService } from './auth/auth.service';

// i18n
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

// STORE IMPORT
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { appReducer } from './shared/stores/app.reducer';
// OBRS-867: registered at the ROOT, not in a feature module. A search is
// dispatched from the home page and from the results page, and `forFeature`
// would only see the one whose module happened to be loaded.
import { AnalyticsEffect } from './shared/stores/analytics/analytics.effect';
// OBRS-1222: root for the same reason. `ProvinceEffect` is registered via
// `forFeature` in six lazy modules and can fail under any of them, while
// `app-station-load-error` renders under two — a `forFeature` registration
// would drop the failure action wherever the reducer was not loaded, and a
// dropped failure is indistinguishable from a successful load.
import {
  STATION_LOAD_STATUS_FEATURE_KEY,
  StationLoadStatusReducer,
} from './shared/stores/station/station-load-status.reducer';

import { AppComponent } from './app.component';
import { SharedModule } from './shared/shared.module';
import { environment } from '../environments/environment';

export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, '/i18n/', '.json');
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,

    AppRoutingModule,

    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient],
      },
      defaultLanguage: 'th',
    }),
    
    // STORE IMPORT
    EffectsModule.forRoot([AnalyticsEffect]),
    StoreModule.forRoot({
      appState: appReducer,
      [STATION_LOAD_STATUS_FEATURE_KEY]: StationLoadStatusReducer,
    }),
    StoreDevtoolsModule.instrument({ maxAge: 25, logOnly: environment.production }),

    SharedModule,
  ],
  providers: [
    AuthService,
    AuthGuard,
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    providePrimeNG({
      theme: {
        // Lara, because that is what the deleted stylesheet was
        // (`lara-light-blue`). Aura is PrimeNG's own default and would be a
        // second, undeclared visual change riding along with the upgrade.
        // The `-blue` half of that name has to be asked for separately — see
        // LaraBlue above.
        preset: LaraBlue,
        options: {
          // NOT the default. PrimeNG 19 defaults `darkModeSelector` to
          // 'system', i.e. prefers-color-scheme - which would put PrimeNG
          // components into dark mode whenever the OS is dark, even while the
          // app is showing its light theme, because this app decides dark from
          // `body.is-dark` (ThemeService, localStorage `app_admin_theme`) and
          // never from the OS. Pointing PrimeNG at the same class is what keeps
          // the two halves of a page agreeing.
          darkModeSelector: '.is-dark',
          cssLayer: {
            // Our own SCSS overrides PrimeNG in ~230 places and none of it is
            // written in a layer, so unlayered rules must win. A named layer
            // makes PrimeNG's base styles lose to every plain selector we have,
            // which is the only ordering under which those overrides keep the
            // meaning they had against the v17 stylesheet.
            name: 'primeng',
            order: 'primeng',
          },
        },
      },
    }),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
