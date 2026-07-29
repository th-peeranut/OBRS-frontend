import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { AnalyticsConsentDecision } from '../../shared/interfaces/analytics.interface';

/**
 * OBRS-867 — the PDPA gate in front of every measurement tag.
 *
 * The key carries a version. When the wording of what we ask for changes, the
 * honest move is to ask again rather than to migrate an old answer forward, and
 * a new key does that with no migration code: the previous answer is simply not
 * found, so the banner returns. (Reading an old consent as covering a new
 * purpose is the thing PDPA is about.)
 */
export const ANALYTICS_CONSENT_STORAGE_KEY = 'obrs_analytics_consent_v1';

/**
 * The single source of truth for whether this visitor agreed to be measured.
 *
 * Mirrors {@link ThemeService} / {@link LanguageService}: a localStorage-backed
 * `BehaviorSubject` any component can follow. It differs from them in one
 * deliberate way — **the safe default is not a preference, it is silence**.
 * Every failure path here (no stored answer, unreadable storage, a corrupted
 * value, a browser with localStorage disabled) resolves to `'unset'`, and
 * `AnalyticsService` sends nothing while the answer is anything but
 * `'granted'`. There is no code path in this class that can produce
 * `'granted'` other than the customer pressing accept.
 *
 * Precedent for the strictness: OBRS-628 gates Google sign-in behind a consent
 * box with a real click-swallowing overlay. This project already decided what
 * level of rigour it wants; this matches it.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsConsentService {
  private readonly decisionSubject: BehaviorSubject<AnalyticsConsentDecision>;

  /** The current decision, as a stream. Replays the latest value on subscribe. */
  readonly decision$: Observable<AnalyticsConsentDecision>;

  /**
   * `true` only while the customer has not answered — i.e. exactly when the
   * banner should be on screen. A denial is an answer: the banner goes away and
   * does not nag.
   */
  readonly isUndecided$: Observable<boolean>;

  /** `true` only after an explicit accept. What the tag loader waits for. */
  readonly isGranted$: Observable<boolean>;

  constructor() {
    this.decisionSubject = new BehaviorSubject<AnalyticsConsentDecision>(
      this.readStoredDecision()
    );
    this.decision$ = this.decisionSubject.asObservable();
    this.isUndecided$ = this.decision$.pipe(
      map((decision) => decision === 'unset'),
      distinctUntilChanged()
    );
    this.isGranted$ = this.decision$.pipe(
      map((decision) => decision === 'granted'),
      distinctUntilChanged()
    );
  }

  /** The current decision, synchronously. */
  get decision(): AnalyticsConsentDecision {
    return this.decisionSubject.value;
  }

  /** Whether measurement is allowed right now. */
  get isGranted(): boolean {
    return this.decisionSubject.value === 'granted';
  }

  /** The customer accepted. Persist and let the tags load. */
  grant(): void {
    this.persist('granted');
  }

  /** The customer declined. Persist so the banner does not ask again. */
  deny(): void {
    this.persist('denied');
  }

  /**
   * Forget the answer and ask again — the withdrawal path PDPA requires a data
   * subject to have. Note what it deliberately does NOT do: nothing here can
   * un-send an event already delivered to a provider, so a withdrawal only ever
   * stops future collection. Reloading after this call is what actually unloads
   * an already-injected tag; the tag scripts have no supported teardown.
   */
  reset(): void {
    try {
      localStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
    } catch {
      // Storage unavailable — the in-memory reset below still takes effect for
      // this session, which is the state that gates sending.
    }
    this.decisionSubject.next('unset');
  }

  private persist(decision: Exclude<AnalyticsConsentDecision, 'unset'>): void {
    try {
      localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, decision);
    } catch {
      // Private-browsing / storage-disabled. The decision still holds for this
      // session; the customer will simply be asked again next visit. Asking
      // twice is the acceptable failure here — assuming a yes is not.
    }
    this.decisionSubject.next(decision);
  }

  private readStoredDecision(): AnalyticsConsentDecision {
    try {
      const stored = localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
      if (stored === 'granted' || stored === 'denied') {
        return stored;
      }
      // Anything else — absent, empty, or a value some other code wrote — is
      // "we have not been told yes", which is `unset`, never `granted`.
      return 'unset';
    } catch {
      return 'unset';
    }
  }
}
