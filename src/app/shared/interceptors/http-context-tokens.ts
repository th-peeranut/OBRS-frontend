import { HttpContextToken } from '@angular/common/http';

export const SKIP_GLOBAL_LOADING_ALERT = new HttpContextToken<boolean>(
  () => false
);

export const SKIP_GLOBAL_ERROR_ALERT = new HttpContextToken<boolean>(
  () => false
);

/**
 * Exempts a request from `IDEMPOTENT_REQUEST_TIMEOUT_MS`, the 30s ceiling
 * `error.interceptor.ts` puts on GET/HEAD (OBRS-642).
 *
 * That ceiling was reasoned about from ONE endpoint — `GET /api/stops`, measured at
 * 0.15-0.26s TTFB — and then applied to every idempotent request, which is not the same
 * claim. The counter-example is a GET whose time is spent SERVER-SIDE before the first
 * byte: `ExportService.export()` asks the backend to generate a report, and RxJS
 * `timeout({each})` only resets per emitted HttpEvent, so with `reportProgress` off it
 * degenerates into a time-to-first-byte limit. A large export that takes longer than
 * 30s to build would be cancelled mid-generation and reported to the user as a plain
 * export failure — a working feature broken by a fix for an unrelated one.
 *
 * Set this on any request whose LATENCY IS THE WORK (report/export generation, bulk
 * jobs), never merely on one that is "sometimes a bit slow" — the whole value of the
 * ceiling is that a genuinely dead request cannot hold the app forever.
 */
export const SKIP_REQUEST_TIMEOUT = new HttpContextToken<boolean>(() => false);

/**
 * Governs ONLY whether a 401 response forces a logout + redirect to /login
 * (`auth.interceptor.ts`). Default `false` = a 401 DOES force logout — this is
 * the safe default for every authenticated call. Set `true` only on calls that
 * are genuinely public or must tolerate a transient/expected 401 without
 * nuking the session (e.g. a silent preview hitting a cold-start blip).
 *
 * Deliberately independent of `SKIP_GLOBAL_ERROR_ALERT` (which only suppresses
 * the global toast): a call can suppress the toast and still force-logout on a
 * real 401 (most authenticated calls), or suppress both (public/tolerant
 * calls). Do not conflate the two again — that conflation (OBRS-181) is what
 * let expired sessions on protected pages get stuck instead of redirecting
 * (OBRS-187).
 */
export const SKIP_AUTH_LOGOUT = new HttpContextToken<boolean>(() => false);
