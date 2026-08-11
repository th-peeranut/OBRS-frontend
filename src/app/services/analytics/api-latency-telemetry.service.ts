import { Injectable, Injector, inject } from '@angular/core';
import { AnalyticsService } from './analytics.service';
import { toApiEndpointPattern } from '../../shared/lib/api-endpoint-pattern';

/**
 * Only a request that took at least this long is reported individually.
 *
 * The floor is the whole cost-control mechanism (AC1). `git grep -n "http.get"
 * src/app` finds 51 call sites; one event per request would be tens of events
 * per session for a number that is boring 99% of the time. What the card needs
 * is the TAIL — and 5s is already an order of magnitude past the measured prod
 * baseline for `GET /api/stops` (0.15-0.26s TTFB, curl x3, 2026-08-10), so
 * nothing healthy lands above it.
 */
export const SLOW_REQUEST_THRESHOLD_MS = 5_000;

/** How many completed requests one `api_request_census` speaks for. */
export const CENSUS_WINDOW_SIZE = 10;

/** How a measured request ended. */
export type ApiRequestOutcome = 'ok' | 'error' | 'timed_out' | 'cancelled';

/** One completed idempotent `/api/` request, as the interceptor saw it. */
export interface ApiRequestMeasurement {
  readonly url: string;
  readonly method: string;
  readonly durationMs: number;
  readonly outcome: ApiRequestOutcome;
}

/**
 * OBRS-1223 — client-observed latency for the requests the 30s ceiling applies
 * to, so `IDEMPOTENT_REQUEST_TIMEOUT_MS` can eventually be set from data.
 *
 * WHY THIS IS NOT MEASURED SERVER-SIDE. OBRS-51 (Prometheus) measures how long
 * the BACKEND took. The ceiling has to cover what the CUSTOMER waited: DNS +
 * TLS + a phone on mobile data + any queue + the backend. The two numbers are
 * different by exactly the part that makes 30s a judgement call, so OBRS-51
 * cannot close this card and this card does not duplicate it.
 *
 * WHY IT IS A SERVICE AND NOT SIX LINES IN THE INTERCEPTOR
 * `error.interceptor.ts` must not `inject(AnalyticsService)`. That service
 * depends on `TranslateService` and `Router`, and the interceptor is the exact
 * place where injecting `TranslateService` unconditionally re-entered its own
 * HTTP loader and broke i18n app-wide on cold load (OBRS-352, NG0200). This
 * class takes only `Injector` — which is always resolvable — and resolves
 * `AnalyticsService` lazily, inside a try/catch, at the moment an event is
 * actually due. That also keeps every existing `error.interceptor.spec.ts`
 * TestBed valid: none of them provide a Router.
 *
 * EVERYTHING PII IS SOMEONE ELSE'S JOB, ON PURPOSE. The URL is turned into a
 * pattern by `toApiEndpointPattern` (an allowlist — see that file), and the
 * resulting bag still goes through `AnalyticsService.track`, which runs
 * `sanitizeAnalyticsParams` and the consent and route-scope gates on every
 * send. Nothing here re-implements any of that; a second copy of a PII rule is
 * a second copy to drift.
 */
@Injectable({ providedIn: 'root' })
export class ApiLatencyTelemetryService {
  private readonly injector = inject(Injector);

  private windowTotal = 0;
  private windowSlow = 0;
  private windowTimedOut = 0;

  /**
   * Records one completed request. Never throws — AC5. A measurement failure is
   * never worth a customer's request, and this runs inside the interceptor's
   * `finalize`, where a throw would surface as an error on a request that
   * actually succeeded.
   *
   * Note the try/catch is NOT redundant with `AnalyticsService.track`'s own:
   * `track` deliberately RETHROWS `AnalyticsPiiError` on a non-production build
   * so a developer meets their own leak immediately. That is right for a call
   * site in a component and wrong here — on a dev build it would turn every
   * slow request into a broken one. Caught, logged, and swallowed.
   */
  record(measurement: ApiRequestMeasurement): void {
    try {
      this.windowTotal += 1;

      const isSlow = measurement.durationMs >= SLOW_REQUEST_THRESHOLD_MS;
      if (isSlow) this.windowSlow += 1;
      if (measurement.outcome === 'timed_out') this.windowTimedOut += 1;

      if (isSlow) this.emitSlowRequest(measurement);
      if (this.windowTotal >= CENSUS_WINDOW_SIZE) this.emitCensus();
    } catch (error) {
      console.warn('API latency telemetry could not be recorded', error);
    }
  }

  private emitSlowRequest(measurement: ApiRequestMeasurement): void {
    this.analytics()?.track('slow_api_request', {
      endpoint_pattern: toApiEndpointPattern(measurement.url),
      http_method: measurement.method,
      // Rounded to 100ms. The extra precision is not real — this is wall-clock
      // across a mobile network — and an exact millisecond count is one more
      // way to make two sessions distinguishable from each other.
      duration_ms: Math.round(measurement.durationMs / 100) * 100,
      duration_bucket: durationBucket(measurement.durationMs),
      outcome: measurement.outcome,
    });
  }

  /**
   * AC4 lives here: `timed_out_count` is the number this card is ultimately
   * about — "how many real requests did the 30s ceiling kill" is the only
   * figure that makes lowering or raising it an argument rather than a taste.
   */
  private emitCensus(): void {
    const window = {
      window_size: this.windowTotal,
      slow_count: this.windowSlow,
      timed_out_count: this.windowTimedOut,
    };

    // Reset BEFORE the send, not after: `track` can throw on a dev build (see
    // `record`), and a window that failed to send must not be counted twice.
    this.windowTotal = 0;
    this.windowSlow = 0;
    this.windowTimedOut = 0;

    this.analytics()?.track('api_request_census', window);
  }

  /**
   * Resolved per emit rather than held as a field. Constructing
   * `AnalyticsService` pulls `Router` and `TranslateService`, and doing that
   * from this class's constructor would drag both into every TestBed that
   * happens to exercise the interceptor. `null` when it cannot be built, which
   * in production it always can.
   */
  private analytics(): AnalyticsService | null {
    try {
      return this.injector.get(AnalyticsService, null);
    } catch {
      return null;
    }
  }
}

/**
 * Coarse buckets for a chart that answers "where does the tail sit relative to
 * the ceiling", which is the question. The exact `duration_ms` rides along for
 * percentiles; this is what makes the shape readable without one.
 */
export function durationBucket(durationMs: number): string {
  if (durationMs < 10_000) return '5-10s';
  if (durationMs < 20_000) return '10-20s';
  if (durationMs < 30_000) return '20-30s';
  return '30s+';
}
