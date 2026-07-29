import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
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
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly destroy$ = new Subject<void>();
  private initialised = false;

  constructor(
    private readonly consent: AnalyticsConsentService,
    private readonly tags: AnalyticsTagsService,
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
   */
  init(): void {
    if (this.initialised) {
      return;
    }
    this.initialised = true;

    this.consent.isGranted$
      .pipe(
        filter((granted) => granted),
        takeUntil(this.destroy$)
      )
      .subscribe(() => this.tags.load());

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
   * @throws AnalyticsPiiError on a non-production build when `params` carries
   *   personal data. Never throws in production — see the class comment.
   */
  track(name: AnalyticsEventName, params: AnalyticsParams = {}): void {
    const { params: safeParams, violations } = sanitizeAnalyticsParams(params);

    if (violations.length > 0) {
      const error = new AnalyticsPiiError(name, violations);
      console.error(error.message);
      if (!environment.production) {
        throw error;
      }
    }

    if (!this.consent.isGranted) {
      return;
    }

    try {
      this.tags.sendEvent(name, safeParams);
    } catch (error) {
      // A measurement failure is never worth a broken checkout.
      console.warn('Analytics event could not be sent', error);
    }
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
    this.track('page_view', {
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
