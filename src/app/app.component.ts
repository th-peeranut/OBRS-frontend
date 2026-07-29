import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from './shared/services/language.service';
import { ThemeService } from './shared/services/theme.service';
import { AnalyticsService } from './services/analytics/analytics.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'OBRS';

  constructor(
    private translate: TranslateService,
    private languageService: LanguageService,
    private themeService: ThemeService,
    private analyticsService: AnalyticsService
  ) {
    translate.addLangs(['en', 'th', 'zh']);
    translate.setDefaultLang('th');
    void this.languageService.switch(this.languageService.getStoredLanguage());
    this.themeService.init();
    // OBRS-867. This subscribes to the router and to the consent stream; it
    // does NOT load a tag or touch the network. Nothing is injected until
    // AnalyticsConsentService reports `granted`, which only the visitor
    // pressing accept can produce.
    this.analyticsService.init();
  }
}
