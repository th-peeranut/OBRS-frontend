import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from './shared/services/language.service';
import { ThemeService } from './shared/services/theme.service';
import { AnalyticsService } from './services/analytics/analytics.service';
import { MaintenanceWindowService } from './services/maintenance-window/maintenance-window.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    standalone: false
})
export class AppComponent {
  title = 'OBRS';

  constructor(
    private translate: TranslateService,
    private languageService: LanguageService,
    private themeService: ThemeService,
    private analyticsService: AnalyticsService,
    private maintenanceWindowService: MaintenanceWindowService
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
    // OBRS-1902. Started here rather than from the banner component so that the announcement is
    // already cached on a visitor who never happened to have the banner on screen - the whole
    // point is to still know about the outage once the backend stops answering.
    this.maintenanceWindowService.start();
  }
}
