import { Injectable, Signal, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
// OBRS-915: `PrimeNGConfig` from 'primeng/api' became `PrimeNG` in
// 'primeng/config' in v18. Same object, same `setTranslation` - only the name
// and the entry point moved.
import { PrimeNG } from 'primeng/config';
import { firstValueFrom } from 'rxjs';

/** localStorage key the authInterceptor reads to set the Accept-Language header. */
export const APP_LANGUAGE_KEY = 'app_language';
/** Fallback language when nothing has been persisted yet. */
export const DEFAULT_LANGUAGE = 'th';

/**
 * The language the customer has chosen, or the default when they never have.
 *
 * A free function and not only a method on the service, because errorInterceptor
 * has to ask the same question (OBRS-930) and cannot inject LanguageService
 * without dragging TranslateService back into the interceptor's own injection
 * chain — the NG0200 cycle OBRS-352 exists to keep out. Written once so that a
 * later rule about what counts as a valid choice cannot land on one caller only.
 */
export function readStoredLanguage(): string {
  return localStorage.getItem(APP_LANGUAGE_KEY) || DEFAULT_LANGUAGE;
}

/**
 * OBRS-1023: the display format a customer-facing `p-datePicker` binds to,
 * derived from the locale's own `CALENDAR.dateFormat` and prefixed with
 * PrimeNG's short-day-name token `D`.
 *
 * `D` costs no new i18n key: `formatDate` resolves it through `dayNamesShort`,
 * which all three locales already ship and which `setTranslation` below
 * already pushes into PrimeNG (measured in primeng 21.1.9,
 * `primeng-datepicker.mjs` `formatDate`, `case 'D'`). A bus timetable differs
 * on a Saturday from a Tuesday, so the weekday is the part of the date a
 * passenger actually decides on — `03/08/2026` makes them convert it in their
 * head, and for a non-Thai reader it does not even say which number is the
 * month.
 *
 * Exported so the spec can pin the rule where it lives instead of re-deriving
 * it. Idempotent on purpose: a locale that already asks for the day name keeps
 * its own placement, and switching twice to the same language must never stack
 * prefixes.
 */
export function withShortDayName(
  dateFormat: string | null | undefined
): string | undefined {
  if (!dateFormat) {
    return undefined;
  }
  return dateFormat.includes('D') ? dateFormat : `D, ${dateFormat}`;
}

/**
 * Single source of truth for switching the app language. Owns the things that
 * must always happen together: change ngx-translate, persist the choice
 * (so the authInterceptor sends a matching Accept-Language header and backend
 * error messages follow the selected language — see OBRS-frontend #22),
 * refresh the PrimeNG calendar translations, and (OBRS-1023) publish the
 * matching date-picker format. Components keep only their own UI
 * state (dropdown open/closed, the label they display) and delegate the rest
 * here, so the persistence can never drift per-component again.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly calendarDateFormatSource = signal<string | undefined>(
    undefined
  );

  /**
   * OBRS-1023: the `dateFormat` the customer-facing pickers bind to, for the
   * language currently applied.
   *
   * It has to be a live BINDING, not a value read once at startup. PrimeNG's
   * own translation subscription reacts to `setTranslation` by re-running
   * `createWeekDays()` + `markForCheck()` only — it never re-renders the text
   * already sitting in the input (primeng 21.1.9, `primeng-datepicker.mjs`
   * `onInit`). The `dateFormat` setter is the one that calls
   * `updateInputfield()` once `initialized`, so re-binding a changed value is
   * the only thing that repaints a date the user already picked when they
   * switch language mid-page.
   *
   * `undefined` until the first `switch()` resolves, and deliberately so: an
   * unset `dateFormat` input makes PrimeNG fall back to
   * `getTranslation('dateFormat')` by itself (`getDateFormat()` is
   * `this.dateFormat || this.getTranslation('dateFormat')`), so the window
   * before the i18n file lands degrades to PrimeNG's own lookup rather than to
   * a hardcoded guess at which language the visitor chose.
   */
  readonly calendarDateFormat: Signal<string | undefined> =
    this.calendarDateFormatSource.asReadonly();

  constructor(
    private readonly translate: TranslateService,
    private readonly primengConfig: PrimeNG,
    private readonly title: Title
  ) {}

  /** The persisted language, or the default when none has been stored yet. */
  getStoredLanguage(): string {
    return readStoredLanguage();
  }

  /** Apply and persist `lang`, then refresh the PrimeNG calendar translations. */
  async switch(lang: string): Promise<void> {
    // Persist BEFORE `translate.use()`: for an already-loaded language, `use()`
    // emits `onLangChange` synchronously, and subscribers that re-fetch
    // server-localized data (e.g. the walk-in sell page) build their request
    // inside that emission. The authInterceptor reads this key to set the
    // Accept-Language header, so it must already hold the new language or the
    // re-fetch goes out with the old locale and the server data stays stale.
    localStorage.setItem(APP_LANGUAGE_KEY, lang);
    // OBRS-1202: keep the document's declared language on the language the page
    // is actually rendering. `src/index.html` can only ship ONE value (OBRS-1194
    // set it to DEFAULT_LANGUAGE), so from the first switch onwards this is the
    // only thing that keeps the declaration true. It is not cosmetic: a browser
    // that believes a stale `lang` runs its machine translator over text that is
    // already in the reader's language — measured on prod 2026-08-10, that is
    // what turned หนองชาก into "ชุชาก" and the Material Symbols ligatures into
    // the words "เมนู"/"ธง". Set BEFORE `translate.use()`, which emits
    // `onLangChange` synchronously for an already-loaded language: subscribers
    // that re-read the document must not see the previous language.
    document.documentElement.lang = lang;
    this.translate.use(lang);
    const calendar = await firstValueFrom(this.translate.get('CALENDAR'));
    this.primengConfig.setTranslation(calendar);
    // AFTER `setTranslation`, never before: the format string carries `D`, and
    // `formatDate` resolves that through `dayNamesShort` on this same config.
    // Publishing first would let a re-render read the new format against the
    // OLD day names and print e.g. "Mon, 03/08/2026" in Thai.
    this.calendarDateFormatSource.set(withShortDayName(calendar?.dateFormat));
    // OBRS-1700: the browser tab. `src/index.html` can ship only ONE <title>,
    // and nothing had ever updated it, so the tab still read Thai for a
    // visitor who had picked English or 中文 - the same complaint as the hero
    // headline, a different mechanism. It belongs here for the reason the
    // `lang` line above does: it is a thing that must always happen together
    // with the language change, and a component that owns one page cannot own
    // a tab title that survives every route.
    this.title.setTitle(
      await firstValueFrom(this.translate.get('COMMON.APP_TITLE'))
    );
  }
}
