import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { combineLatest, Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  AnalyticsEventName,
  AnalyticsParams,
} from '../../shared/interfaces/analytics.interface';
import {
  AnalyticsPiiError,
  sanitizeAnalyticsParams,
} from '../../shared/lib/analytics-pii-guard';
import { AnalyticsConsentService } from './analytics-consent.service';
import { AnalyticsRouteScopeService } from './analytics-route-scope.service';
import { AnalyticsTagsService } from './analytics-tags.service';

/**
 * OBRS-867 — the app's single entry point for measurement.
 *
 * Everything that could go wrong with analytics is centralised here so that no
 * call site has to remember any of it:
 *
 * - **Consent is checked on every send, not once at startup.** A visitor can
 *   accept mid-session, and (via `AnalyticsConsentService.reset()`) withdraw;
 *   a service that latched a boolean at boot would keep sending after a
 *   withdrawal.
 * - **The PII guard runs before the consent check, on purpose.** A developer
 *   who has personally declined analytics must still see their own leaking
 *   payload fail loudly — otherwise the AC-4 gate is only armed for whoever
 *   happened to press accept.
 * - **Analytics may never break a booking.** Transport is wrapped: a blocked
 *   tag, an ad-blocker, an offline provider — all of it is swallowed with a
 *   console warning. The one thing deliberately NOT swallowed is a PII
 *   violation on a non-production build, because that is a defect in our code
 *   and should stop the developer, not the customer.
 * - **A dropped `page_view` is remembered, not forgotten (OBRS-1195).** The
 *   banner is answered *after* the page it sits on has loaded, so the
 *   `NavigationEnd` that would have counted the visitor's entry page has always
 *   already passed. That one screened-out `page_view` is replayed when consent
 *   arrives — and only then, never on a route change, or every navigation would
 *   be counted twice.
 * - **Consent is necessary but not sufficient (OBRS-887).** On `/staff/**` and
 *   `/admin/**` the screen shows *customers'* personal data, and the person
 *   holding the keyboard cannot consent on their behalf. So the route gate sits
 *   beside the consent gate rather than behind it: measurement needs a granted
 *   answer AND a route that is ours to measure.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly destroy$ = new Subject<void>();
  private initialised = false;

  /**
   * OBRS-1195. `true` when the most recent navigation's `page_view` was screened
   * out by {@link track} instead of sent — i.e. the visitor is sitting on a page
   * that measurement never saw.
   *
   * Written from `track()`'s own verdict rather than from a second copy of the
   * gate conditions kept here. Two copies drift, and this one would be the copy
   * nobody re-reads the day a third gate is added beside consent and scope.
   */
  private pageViewSuppressed = false;

  /**
   * The previous value of `isGranted$`, so the loader can tell "consent just
   * arrived" from "consent was already granted and something else changed".
   * Both reach the same `combineLatest` subscriber and only the first of them
   * may replay a `page_view` — see {@link init}.
   */
  private consentWasGranted = false;

  constructor(
    private readonly consent: AnalyticsConsentService,
    private readonly tags: AnalyticsTagsService,
    private readonly scope: AnalyticsRouteScopeService,
    private readonly router: Router,
    private readonly translate: TranslateService
  ) {}

  /**
   * Wires consent to tag loading and the router to `page_view`. Call once from
   * `AppComponent`, next to `ThemeService.init()`.
   *
   * Note what does NOT happen until consent arrives: no script tag, no network
   * request, no global. Subscribing to the router here is free — the events it
   * produces are dropped by `track()` while consent is anything but granted.
   *
   * OBRS-887 made loading depend on TWO streams instead of one. `combineLatest`
   * rather than a `filter` on consent alone, because the pair has to be
   * re-evaluated when EITHER side changes: granting consent on a customer page
   * loads the tags, and walking into `/staff/sell` afterwards has to suspend
   * them again. A `filter(granted)` can only ever fire in the first direction.
   */
  init(): void {
    if (this.initialised) {
      return;
    }
    this.initialised = true;

    combineLatest([this.consent.isGranted$, this.scope.isMeasurable$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([granted, measurable]) => {
        const consentJustArrived = granted && !this.consentWasGranted;
        this.consentWasGranted = granted;

        if (granted && measurable) {
          this.tags.setSuspended(false);
          this.tags.load();

          // OBRS-1195 — the landing page of a first visit, replayed.
          //
          // `NavigationEnd` for the page the visitor arrived on has already
          // passed by the time they answer the banner (the banner cannot be
          // clicked before the page it sits on has rendered), and `track()`
          // dropped that `page_view` because consent was not granted yet.
          // Nothing replayed it, `send_page_view: false` means gtag sends
          // nothing on its own, and the result was measured on prod: a first
          // visit produced ZERO `page_view` — the entry page of every new
          // visitor was missing from the funnel it exists to feed.
          //
          // TWO conditions, and dropping either one double-counts:
          //
          // - `consentJustArrived` — this subscriber also fires when only the
          //   ROUTE changed, and it fires BEFORE this service's own
          //   `NavigationEnd` handler does (`AnalyticsRouteScopeService` is
          //   constructed first, so it is notified first). Replaying on a
          //   route change would therefore send the new page's `page_view`
          //   here and again a moment later. Consent arrives from a click on
          //   the banner, never mid-navigation, so this flag is what keeps the
          //   replay off the navigation path entirely.
          // - `pageViewSuppressed` — a returning visitor who already consented
          //   has nothing to replay: their `NavigationEnd` will send the one
          //   and only `page_view`. Measured as 1 before this change, and
          //   staying 1 is the regression AC-2 names.
          if (consentJustArrived && this.pageViewSuppressed) {
            this.trackPageView();
          }
          return;
        }

        // Covers three different states with one call, deliberately: not yet
        // consented, consent withdrawn, and "on a staff page right now". Only
        // the last one has anything to suspend, and `setSuspended` is a no-op
        // when the value has not changed.
        this.tags.setSuspended(true);
      });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => this.trackPageView());
  }

  /** Tears down the router/consent subscriptions. Exists for tests and symmetry. */
  destroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Screens, then (if allowed) sends one event.
   *
   * @returns whether the event got past the gates and was handed to the tag
   *   layer. Every existing call site ignores it; `trackPageView` does not,
   *   because "this navigation was never measured" is the fact OBRS-1195's
   *   replay is keyed on, and inferring it by re-testing consent and scope in
   *   the caller would be a second copy of this method's own rules.
   *   `false` means a gate said no — not that the network call failed. A
   *   swallowed transport error still counts as sent, deliberately: retrying
   *   into a blocked tag would replay forever.
   * @throws AnalyticsPiiError on a non-production build when `params` carries
   *   personal data. Never throws in production — see the class comment.
   */
  track(name: AnalyticsEventName, params: AnalyticsParams = {}): boolean {
    const { params: safeParams, violations } = sanitizeAnalyticsParams(params);

    if (violations.length > 0) {
      const error = new AnalyticsPiiError(name, violations);
      console.error(error.message);
      if (!environment.production) {
        throw error;
      }
    }

    if (!this.consent.isGranted) {
      return false;
    }

    // OBRS-887. Read live from the router rather than from a cached flag: this
    // also runs on the `page_view` path, where `AnalyticsRouteScopeService` and
    // this service are two subscribers to the same `NavigationEnd` and the
    // order they are notified in is an accident of construction.
    //
    // This drops `page_view` for staff pages too, which is the point. The
    // pattern of an admin route is not personal data, but a stream of them is a
    // description of how a named employee spends their shift, and we have no
    // basis to hand that to Google either.
    if (this.scope.isRestricted) {
      return false;
    }

    try {
      this.tags.sendEvent(name, safeParams);
    } catch (error) {
      // A measurement failure is never worth a broken checkout.
      console.warn('Analytics event could not be sent', error);
    }

    return true;
  }

  /**
   * Emits `page_view` for the current route.
   *
   * It reports the route **pattern** (`/otp/:option/:phoneno`), never the
   * resolved URL — and that is not tidiness. `/otp/sms/0812345678` puts a
   * customer's phone number in the path, and `/reset-password?token=…` puts a
   * credential in the query string; sending either verbatim would hand a
   * third party exactly what AC-4 forbids, through the one parameter nobody
   * thinks of as a payload. Patterns also aggregate correctly, which the raw
   * URLs never would.
   */
  private trackPageView(): void {
    // OBRS-1195: remember the verdict. A `false` here is the only record that
    // the page on screen was never counted, and it is what the consent
    // subscriber above reads when the visitor finally answers the banner.
    this.pageViewSuppressed = !this.track('page_view', {
      page_path: this.currentRoutePattern(),
      page_language: this.translate.currentLang || this.translate.defaultLang || '',
    });
  }

  private currentRoutePattern(): string {
    const segments: string[] = [];
    let node: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;

    while (node) {
      const configured = node.routeConfig?.path;
      if (configured) {
        segments.push(configured);
      }
      node = node.firstChild;
    }

    return `/${segments.join('/')}`;
  }
}
