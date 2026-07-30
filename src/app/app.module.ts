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
import Lara from '@primeng/themes/lara';

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
    StoreModule.forRoot({ appState: appReducer }),
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
        preset: Lara,
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
