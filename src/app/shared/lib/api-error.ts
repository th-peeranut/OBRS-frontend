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
 * 429 is the exception to "one key per status" (OBRS-1381). Our rate limiters
 * all answer through the same handler as every other domain error, so their 429
 * carries a localized message that says which ceiling was hit — and since
 * OBRS-1375 signup has two whose advice is opposite: retry in fifteen minutes,
 * versus a system-wide daily cap that nothing but tomorrow clears. Blanketing
 * both with "you sent too many requests, wait a moment" blames and misdirects
 * the customer who only ever sent one. So the body decides: ours is used, and
 * an edge refusal (no body, or the gateway's HTML) still gets the generic key.
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
    // OBRS-1381: 429 is the one status here that can come from either side of
    // the edge, so it is decided per response rather than per status. Our own
    // limiters answer with a localized, specific message; the edge answers with
    // nothing, or with its own HTML page.
    return extractApiErrorMessage(error) ? null : 'COMMON.ERROR.TOO_MANY_REQUESTS';
  }

  if (error.status === 502 || error.status === 503 || error.status === 504) {
    return 'COMMON.ERROR.SERVICE_UNAVAILABLE';
  }

  return null;
}

/**
 * The exact message the global error interceptor would have shown for `error`.
 *
 * Extracted (OBRS-1072) because a page that opts out of the global alert to
 * handle ONE error code still has to reproduce the alert for every other error —
 * and reproducing it by hand is how the two drift. The interceptor now calls
 * this too, so there is one implementation of the rule rather than a copy per
 * opted-out page.
 *
 * `translate` is a plain `(key) => string` rather than TranslateService so this
 * file stays free of Angular DI (the interceptor documents an NG0200 cycle it
 * must not re-enter). Pass `null` where no translator is available; the caller
 * then gets the untranslated key, exactly as before.
 */
export function resolveApiAlertMessage(
  error: unknown,
  translate: ((key: string) => string) | null
): string {
  const statusKey = statusAlertMessageKey(error);
  // Skip the body entirely once a status key applies: on those statuses the
  // body is a ProgressEvent or the gateway's HTML, never our message.
  const backendMessage = statusKey ? '' : extractApiErrorMessage(error);
  return (
    backendMessage ||
    (translate
      ? translate(statusKey ?? 'COMMON.ERROR.REQUEST_FAILED')
      : 'Request failed.')
  );
}

/** One entry of `ApiErrorRespDto.errors[]` — the backend's per-field rejection. */
export interface ApiFieldError {
  field: string;
  rejectedValue: unknown;
  reason: string;
}

/**
 * The per-field rejections on a `VALIDATION_FAILED` body, keyed by field name (OBRS-1255).
 *
 * `ApiErrorRespDto` has carried an `errors[]` array since the first validation handler, and every
 * caller ignored it in favour of the one generic `message` — so a 400 naming a specific field
 * ("email: must be valid") reached the user as "ข้อมูลไม่ผ่านการตรวจสอบ" with nothing on screen
 * pointing at the field, and on a DISABLED field the user could not even see the value that was
 * refused. Returns `{}` for any error that is not a field-level validation failure, so a caller
 * can branch on emptiness rather than on the shape of the body.
 *
 * Later entries win on a duplicated field, which only matters if the backend ever reports two
 * violations for one field; showing the last is arbitrary but stable.
 */
export function apiFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof HttpErrorResponse)) {
    return {};
  }

  const raw = (error.error as { errors?: unknown })?.errors;
  if (!Array.isArray(raw)) {
    return {};
  }

  const byField: Record<string, string> = {};
  for (const entry of raw as ApiFieldError[]) {
    const field = String(entry?.field ?? '').trim();
    const reason = String(entry?.reason ?? '').trim();
    if (field.length > 0 && reason.length > 0) {
      byField[field] = reason;
    }
  }

  return byField;
}

/**
 * The stable, locale-independent code the backend puts on an error body
 * (`ApiErrorRespDto.errorCode`, derived from the message key — e.g.
 * `otp.send.phone-not-registered` -> `OTP_SEND_PHONE_NOT_REGISTERED`). Branch on
 * this, never on the message text, which is translated and rewritten freely.
 */
export function apiErrorCode(error: unknown): string | null {
  if (error instanceof HttpErrorResponse && typeof error.error?.errorCode === 'string') {
    return error.error.errorCode;
  }
  return null;
}
