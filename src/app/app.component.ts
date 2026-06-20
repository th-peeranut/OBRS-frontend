import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from './shared/services/language.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'OBRS';

  constructor(
    private translate: TranslateService,
    private languageService: LanguageService
  ) {
    translate.addLangs(['en', 'th']);
    translate.setDefaultLang('th');
    void this.languageService.switch(this.languageService.getStoredLanguage());
  }
}
