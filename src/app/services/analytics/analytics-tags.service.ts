import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  AnalyticsEventName,
  AnalyticsParamValue,
} from '../../shared/interfaces/analytics.interface';

/**
 * OBRS-867 — the only place in this app that talks to a third party about a
 * customer's behaviour.
 *
 * PROVIDERS AND WHY THESE TWO (AC-5; full rationale in docs/adr/0034)
 * - **GA4** answers "how many, from where, and where did they drop out" — the
 *   funnel questions OBRS-862 and OBRS-872 are both blocked on. Free at our
 *   volume and free at ten times our volume.
 * - **Microsoft Clarity** answers "*why* did they drop out" by replaying the
 *   session. Unlimited and free; the first week after go-live is exactly when
 *   a recording is worth more than a number.
 * Neither needs an npm dependency, which matters here: CLAUDE.md forbids adding
 * one without prior approval, and a tag we load ourselves is also a tag we can
 * refuse to load — the whole point of this file.
 *
 * WHAT THIS SERVICE GUARANTEES
 * 1. It reaches the network only from `load()`, and `AnalyticsService` calls
 *    `load()` only after `AnalyticsConsentService` reports `granted`. Nothing
 *    is injected at import time, at bootstrap, or from a constructor.
 * 2. An empty ID is a no-op, not a broken tag. That is the same shape as
 *    `mapsApiKey` / `maptilerKey` (OBRS-424): a fresh clone and CI take the
 *    empty path, so no developer has to hold a real property ID to run the app,
 *    and no local run pollutes production statistics.
 * 3. It is idempotent. Consent can be granted once per page but the stream that
 *    drives it may emit more than once; a second `load()` adds no second tag.
 */

/** Minimal shape of the globals the two tags install. No `any`. */
interface AnalyticsWindow extends Window {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
}

const GA4_SCRIPT_ID = 'obrs-ga4-tag';
const CLARITY_SCRIPT_ID = 'obrs-clarity-tag';

@Injectable({ providedIn: 'root' })
export class AnalyticsTagsService {
  private ga4Loaded = false;
  private clarityLoaded = false;

  constructor(@Inject(DOCUMENT) private readonly document: Document) {}

  /** Whether a GA4 tag is present and configured. Used by specs and by `AnalyticsService`. */
  get isGa4Active(): boolean {
    return this.ga4Loaded;
  }

  /** Whether a Clarity tag is present. */
  get isClarityActive(): boolean {
    return this.clarityLoaded;
  }

  /**
   * Injects whichever tags are configured. Safe to call repeatedly.
   *
   * MUST NOT be called before consent — this method is the network boundary
   * AC-1 is asserted against.
   */
  load(): void {
    this.loadGa4();
    this.loadClarity();
  }

  /**
   * Forwards one event to every loaded tag. A no-op when nothing is loaded,
   * which is the state on every un-consented, un-configured and CI run.
   *
   * Clarity gets the event NAME only, deliberately: it is a replay filter, not
   * a metrics store, and the fewer places a parameter bag is copied to, the
   * fewer places it has to be re-audited (AC-4).
   */
  sendEvent(
    name: AnalyticsEventName,
    params: Readonly<Record<string, AnalyticsParamValue>>
  ): void {
    const target = this.document.defaultView as AnalyticsWindow | null;
    if (!target) {
      return;
    }

    if (this.ga4Loaded && typeof target.gtag === 'function') {
      target.gtag('event', name, params);
    }

    if (this.clarityLoaded && typeof target.clarity === 'function') {
      target.clarity('event', name);
    }
  }

  private loadGa4(): void {
    const measurementId = environment.analytics?.ga4MeasurementId?.trim();
    if (this.ga4Loaded || !measurementId) {
      return;
    }

    const target = this.document.defaultView as AnalyticsWindow | null;
    if (!target) {
      return;
    }

    target.dataLayer = target.dataLayer || [];
    if (typeof target.gtag !== 'function') {
      // Google's own shim, kept in its original `arguments`-pushing form rather
      // than rewritten with rest parameters: gtag.js reads the pushed value as
      // an `arguments` object, and this is the shape it documents.
      target.gtag = function gtag() {
        target.dataLayer?.push(arguments);
      };
    }

    target.gtag('js', new Date());
    target.gtag('config', measurementId, {
      // We emit our own `page_view` on router navigation — GA4's automatic one
      // fires on the initial document load only and would double-count the
      // landing page while missing every SPA route change after it.
      send_page_view: false,
      // None of these are defaults. Leaving them out is a decision to allow
      // advertising identifiers and cross-site signals we have no consent
      // basis for and no use for (OBRS-586's lesson: an omitted optional field
      // is a choice, not a neutral).
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    this.appendScript(
      GA4_SCRIPT_ID,
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
    );
    this.ga4Loaded = true;
  }

  private loadClarity(): void {
    const projectId = environment.analytics?.clarityProjectId?.trim();
    if (this.clarityLoaded || !projectId) {
      return;
    }

    const target = this.document.defaultView as AnalyticsWindow | null;
    if (!target) {
      return;
    }

    if (typeof target.clarity !== 'function') {
      // Clarity's own bootstrap shape: a queueing stub whose `.q` the real tag
      // drains once it arrives. The script is `async`, so a call made in the
      // window between injection and load would otherwise be dropped.
      const queue: unknown[] = [];
      target.clarity = Object.assign(
        (...args: unknown[]) => {
          queue.push(args);
        },
        { q: queue }
      );
    }

    this.appendScript(
      CLARITY_SCRIPT_ID,
      `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`
    );
    this.clarityLoaded = true;
  }

  /**
   * Appends one `async` external script. External `src` only — no inline
   * script body anywhere in this file, so adding a Content-Security-Policy
   * later needs a `script-src` host entry and nothing else. (AC-7: this repo
   * ships no CSP header today — `netlify.toml` has only the SPA redirect — so
   * there is nothing to break yet, and this keeps it that way.)
   */
  private appendScript(id: string, src: string): void {
    if (this.document.getElementById(id)) {
      return;
    }

    const script = this.document.createElement('script');
    script.id = id;
    script.async = true;
    script.src = src;
    this.document.head.appendChild(script);
  }
}
