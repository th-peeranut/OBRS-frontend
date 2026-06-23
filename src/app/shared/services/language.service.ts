import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { PrimeNGConfig } from 'primeng/api';
import { firstValueFrom } from 'rxjs';

/** localStorage key the authInterceptor reads to set the Accept-Language header. */
export const APP_LANGUAGE_KEY = 'app_language';
/** Fallback language when nothing has been persisted yet. */
export const DEFAULT_LANGUAGE = 'th';

/**
 * Single source of truth for switching the app language. Owns the three things
 * that must always happen together: change ngx-translate, persist the choice
 * (so the authInterceptor sends a matching Accept-Language header and backend
 * error messages follow the selected language — see OBRS-frontend #22), and
 * refresh the PrimeNG calendar translations. Components keep only their own UI
 * state (dropdown open/closed, the label they display) and delegate the rest
 * here, so the persistence can never drift per-component again.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  constructor(
    private readonly translate: TranslateService,
    private readonly primengConfig: PrimeNGConfig
  ) {}

  /** The persisted language, or the default when none has been stored yet. */
  getStoredLanguage(): string {
    return localStorage.getItem(APP_LANGUAGE_KEY) || DEFAULT_LANGUAGE;
  }

  /** Apply and persist `lang`, then refresh the PrimeNG calendar translations. */
  async switch(lang: string): Promise<void> {
    this.translate.use(lang);
    localStorage.setItem(APP_LANGUAGE_KEY, lang);
    const calendar = await firstValueFrom(this.translate.get('CALENDAR'));
    this.primengConfig.setTranslation(calendar);
  }
}
