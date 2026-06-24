import { Injectable } from '@angular/core';

/** localStorage key used to persist the admin theme preference. */
export const APP_ADMIN_THEME_KEY = 'app_admin_theme';

/** Supported display modes for the admin shell. */
export type ThemeMode = 'light' | 'dark';

/** Default display mode. */
export const DEFAULT_THEME_MODE: ThemeMode = 'light';

/**
 * Persists the admin light/dark mode preference.
 * Mirrors the pattern used by {@link LanguageService}: a single
 * source of truth for localStorage reads/writes so no component
 * can drift from the stored value.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** The persisted mode, or the default when nothing has been stored yet. */
  getStoredMode(): ThemeMode {
    const stored = localStorage.getItem(APP_ADMIN_THEME_KEY);
    return stored === 'dark' ? 'dark' : DEFAULT_THEME_MODE;
  }

  /** Persist `mode` to localStorage. */
  setMode(mode: ThemeMode): void {
    localStorage.setItem(APP_ADMIN_THEME_KEY, mode);
  }
}
