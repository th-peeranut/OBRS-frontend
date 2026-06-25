import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * localStorage key used to persist the global theme preference.
 * Originally named `app_admin_theme` — kept as-is to avoid a migration;
 * this key now drives the whole app, not just the admin shell.
 */
export const APP_ADMIN_THEME_KEY = 'app_admin_theme';

/** Supported display modes. */
export type ThemeMode = 'light' | 'dark';

/** Default display mode. */
export const DEFAULT_THEME_MODE: ThemeMode = 'light';

/** CSS class applied to `document.body` in dark mode. */
const DARK_CLASS = 'is-dark';

/**
 * Global source of truth for the light/dark mode preference.
 *
 * Mirrors the pattern used by {@link LanguageService}:
 * - Persists to `localStorage` under `app_admin_theme`.
 * - Applies / removes the `is-dark` class on `document.body`.
 * - Exposes a reactive `mode$` stream so any component can stay in sync.
 *
 * Call `init()` once at app bootstrap (from `AppComponent`) to restore the
 * stored preference before the first render.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly modeSubject = new BehaviorSubject<ThemeMode>(DEFAULT_THEME_MODE);

  /** Observable stream of the current theme mode. */
  readonly mode$ = this.modeSubject.asObservable();

  /** The persisted mode, or the default when nothing has been stored yet. */
  getStoredMode(): ThemeMode {
    try {
      const stored = localStorage.getItem(APP_ADMIN_THEME_KEY);
      return stored === 'dark' ? 'dark' : DEFAULT_THEME_MODE;
    } catch {
      return DEFAULT_THEME_MODE;
    }
  }

  /**
   * Reads the stored preference, applies the body class, and emits the
   * initial mode. Call once from `AppComponent` before the first render.
   */
  init(): void {
    const mode = this.getStoredMode();
    this.applyBodyClass(mode);
    this.modeSubject.next(mode);
  }

  /** Persist `mode` to localStorage, apply the body class, and emit. */
  setMode(mode: ThemeMode): void {
    try {
      localStorage.setItem(APP_ADMIN_THEME_KEY, mode);
    } catch {
      // localStorage unavailable (private mode) — theme still works in-session.
    }
    this.applyBodyClass(mode);
    this.modeSubject.next(mode);
  }

  /** Toggle between light and dark mode. */
  toggle(): void {
    const next: ThemeMode = this.modeSubject.value === 'dark' ? 'light' : 'dark';
    this.setMode(next);
  }

  private applyBodyClass(mode: ThemeMode): void {
    if (typeof document !== 'undefined') {
      if (mode === 'dark') {
        document.body.classList.add(DARK_CLASS);
      } else {
        document.body.classList.remove(DARK_CLASS);
      }
    }
  }
}
