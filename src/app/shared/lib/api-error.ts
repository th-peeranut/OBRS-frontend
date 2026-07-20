import { HttpErrorResponse } from '@angular/common/http';

/**
 * A response body that is a document rather than a message. Gateways (Koyeb,
 * Cloudflare) answer 502/504 with their own HTML error page, and a proxy page
 * routinely names the upstream host. Rendered into a SweetAlert it is both a
 * wall of markup and an infrastructure disclosure, so it is never a message.
 */
function looksLikeMarkup(body: string): boolean {
  const head = body.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith('<');
}

/**
 * Extracts a human-readable message from a failed HTTP call.
 *
 * Returns ONLY text the backend meant a user to read: `ApiErrorResponse.message`
 * (a localized, actionable reason such as "Lookup with category: ... and slug:
 * ... already exists"), or a plain-text string body. Returns '' when nothing
 * usable is present so callers can supply their own generic fallback — every
 * call site already spells one, which is why this function can afford to be
 * strict.
 *
 * TRANSPORT-LEVEL MESSAGES ARE NEVER RETURNED (OBRS-567). `HttpErrorResponse`
 * carries a `message` that Angular synthesizes as
 *
 *     Http failure response for https://api.example.com/api/external/otp/...: 0 Unknown Error
 *
 * — i.e. the backend's real URL. This used to be the last fallback here, and it
 * was reachable in normal operation, not just in dev: on network loss, CORS
 * rejection, DNS/TLS failure or a client-side timeout the status is 0 and
 * Angular sets `error.error` to a `ProgressEvent`, which is non-null, not a
 * string, and has no `.message` — so every guard above fell through to it and
 * the URL went on screen through the global interceptor. It is a transport
 * diagnostic for a developer's console; there is no state in which a passenger
 * can act on it. Statuses that land here are given a real message by
 * `statusAlertMessageKey()` instead.
 *
 * Shared by the global error interceptor and by feature pages (e.g. admin
 * screens) that opt out of the global error alert via SKIP_GLOBAL_ERROR_ALERT
 * and render their own alert — so both surface the same backend message.
 */
export function extractApiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.error == null) {
      return '';
    }

    if (typeof error.error === 'string') {
      return looksLikeMarkup(error.error) ? '' : error.error;
    }

    if (typeof error.error?.message === 'string') {
      return error.error.message;
    }

    return '';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '';
}

/**
 * Maps a transport-level HTTP status to a dedicated i18n message key for the
 * global error alert, or null when the backend-provided message should be used.
 *
 * These are the statuses whose body carries nothing a user can act on — either
 * because there is no body at all (status 0), because it is the gateway's own
 * HTML rather than ours (502/504), or because the backend's generic
 * `UNEXPECTED_ERROR` reads like a code fault (503 — a dependency outage,
 * OBRS-210/216). Every other status returns null so its handling (the backend
 * message via extractApiErrorMessage) is unchanged; that matters because most
 * backend messages are written FOR the user ("this trip is full"), and blanketing
 * them with a generic string would be a downgrade, not a fix.
 *
 * Status 0 splits on `navigator.onLine` because the two causes need opposite
 * things from the user: their own connection dropped (turn wifi back on) versus
 * our API being unreachable while their connection is fine (wait and retry).
 * `onLine === false` is trustworthy — the browser sets it from the OS link
 * state; `true` is only "an interface exists", which is why the offline branch
 * tests for false rather than treating true as proof we are reachable.
 */
export function statusAlertMessageKey(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  if (error.status === 0) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return offline ? 'COMMON.ERROR.NETWORK_OFFLINE' : 'COMMON.ERROR.SERVICE_UNAVAILABLE';
  }

  if (error.status === 429) {
    return 'COMMON.ERROR.TOO_MANY_REQUESTS';
  }

  if (error.status === 502 || error.status === 503 || error.status === 504) {
    return 'COMMON.ERROR.SERVICE_UNAVAILABLE';
  }

  return null;
}
