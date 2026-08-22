import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { AnalyticsConsentService } from '../../../services/analytics/analytics-consent.service';
import { AnalyticsConsentDecision } from '../../interfaces/analytics.interface';
import { hasAnyMeasurementId } from '../../lib/analytics-measurement-ids';
import { hasOwnKey } from '../../lib/own-key';

/**
 * OBRS-874 — the withdrawal surface PDPA ม.19 วรรคห้า requires.
 *
 * WHY THIS EXISTS AT ALL
 *
 * OBRS-867 shipped `AnalyticsConsentService.reset()` and nothing in the app
 * called it. A visitor who pressed accept could only change their mind by
 * opening devtools and deleting `obrs_analytics_consent_v1` by hand. ม.19
 * วรรคห้า says withdrawing must be as easy as consenting was — one press, on the
 * page the banner already links to.
 *
 * That is also why OBRS-631 could not publish its 2.0 notice before this: it
 * declares the withdrawal right, and a declared right with no mechanism is the
 * OBRS-627 defect (a refund policy the system could not perform), just spelled
 * differently.
 *
 * WITHDRAWING RETURNS TO `unset`, NOT TO `denied`
 *
 * A withdrawal removes the answer; it does not put a refusal in its place, and
 * `reset()` is the method written for exactly that. The visible consequence is
 * that this control goes back to offering "accept" — which is correct, because
 * that IS the state: we hold no answer from this person. The bottom bar does not
 * pop up to re-ask, because it hides on this route (`analytics-consent-control.ts`).
 *
 * WHAT THE BUTTON ACTUALLY STOPS — measured, not assumed (AC-6)
 *
 * `AnalyticsService.init()` subscribes to `isGranted$`, so `reset()` runs
 * `AnalyticsTagsService.setSuspended(true)` in the same tick: `ga-disable-<id>`
 * goes true and `clarity('stop')` is called. So collection stops WITHOUT a
 * reload, for a tag already in the document — and on the next load the scripts
 * are never injected at all, because `load()` is only reached while granted.
 *
 * ⚠️ That stops gtag COLLECTING, not gtag SENDING: a hit already queued when
 * consent was withdrawn still goes out, about five seconds later. This block used
 * to assert the flag is "read at send time" — false, removed from
 * `analytics-tags.service.ts` by OBRS-1206, and this was its surviving copy
 * (OBRS-1539). The measurements, the alternatives that were tried, and why that
 * tail is ACCEPTED live in `AnalyticsTagsService.setSuspended` and ADR-0034 §10;
 * do not "fix" it here without overturning that section.
 *
 * The vendor switches are best-effort by nature (a renamed global is caught and
 * warned, see `setSuspended`); the never-injected path is the hard guarantee,
 * and the copy below is written to match.
 *
 * IT STANDS DOWN WITH THE BANNER WHEN THERE IS NO ID (OBRS-1179)
 *
 * Same reason, one step further on: a build with no measurement ID collects
 * nothing, so there is no permission to grant here and nothing to withdraw. What
 * disappears is a switch wired to nothing; the policy page keeps its notice.
 * Hiding it does NOT clear a stored answer — the moment an ID is configured the
 * control comes back showing whatever the visitor last chose.
 */
@Component({
  selector: 'app-analytics-consent-control',
  templateUrl: './analytics-consent-control.component.html',
  styleUrl: './analytics-consent-control.component.scss',
  standalone: false,
})
export class AnalyticsConsentControlComponent {
  protected readonly decision$: Observable<AnalyticsConsentDecision>;

  /** i18n keys per decision, so the template holds no branching text. */
  private static readonly STATUS_KEYS: Record<AnalyticsConsentDecision, string> = {
    granted: 'ANALYTICS_CONSENT.CONTROL_STATUS_GRANTED',
    denied: 'ANALYTICS_CONSENT.CONTROL_STATUS_DENIED',
    unset: 'ANALYTICS_CONSENT.CONTROL_STATUS_UNSET',
  };

  /**
   * OBRS-1179. Read once here rather than called from the template, where every
   * change-detection pass would re-ask a question whose answer is fixed at build.
   */
  protected readonly measured = hasAnyMeasurementId();

  constructor(private readonly consent: AnalyticsConsentService) {
    this.decision$ = this.consent.decision$;
  }

  /**
   * `decision` is a typed union, so an inherited key looks impossible from here.
   * It arrives through the async pipe from a `BehaviorSubject` whose seed is
   * read out of localStorage, and the compile-time type is exactly the guarantee
   * `hasOwnKey` exists to distrust (OBRS-601): `MAP['constructor']` is the
   * Object function — non-nullish and truthy, so `?? fallback` never fires and
   * `translate` would be handed a function. Falling back to the `unset` copy is
   * also the right answer on its merits: no recognisable answer means we hold
   * none, which is what that line says.
   */
  protected statusKey(decision: AnalyticsConsentDecision): string {
    const keys = AnalyticsConsentControlComponent.STATUS_KEYS;
    return hasOwnKey(keys, decision) ? keys[decision] : keys.unset;
  }

  protected withdraw(): void {
    this.consent.reset();
  }

  protected grant(): void {
    this.consent.grant();
  }
}
