import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { PrimeNGConfig } from 'primeng/api';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'OBRS';

  constructor(
    private translate: TranslateService,
    private primengConfig: PrimeNGConfig
  ) {
    translate.addLangs(['en', 'th']);
    const preferredLanguage = localStorage.getItem('app_language') || 'th';
    translate.setDefaultLang('th');
    translate.use(preferredLanguage);

    this.translate.get('CALENDAR').subscribe((res) => {
      this.primengConfig.setTranslation(res);
    });
  }
}
