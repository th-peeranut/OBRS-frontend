import { HttpErrorResponse } from '@angular/common/http';

/**
 * Generic-copy tier for a failed HTTP call with NO recognized domain
 * `errorCode` (OBRS-170). Before this, every code-less failure — a
 * transient backend/Koyeb outage AND a plain rejected-but-reachable request
 * — collapsed into one vague message, indistinguishable from "you're not
 * eligible"/"no permission". Splitting into two tiers lets the copy tell
 * the traveler which situation they're in:
 * - `SERVICE_UNAVAILABLE` — the backend itself is unreachable/erroring
 *   ("try again later").
 * - `ACTION_UNAVAILABLE` — the backend responded but rejected the request
 *   with no stable code to explain why ("can't do this right now").
 */
export type HttpFallbackTier = 'SERVICE_UNAVAILABLE' | 'ACTION_UNAVAILABLE';

/**
 * Classifies a failed HTTP call for its fallback-copy tier:
 * - status `0` (network unreachable/CORS/DNS) or `>= 500` → `SERVICE_UNAVAILABLE`.
 * - any other `4xx` → `ACTION_UNAVAILABLE`.
 * - a non-`HttpErrorResponse` (unexpected, e.g. a thrown JS error) defaults to
 *   `ACTION_UNAVAILABLE`, matching the single-GENERIC-message behavior this
 *   replaces for that edge case.
 *
 * Shared by the change-seat and change-stop error-mapping helpers so both
 * features branch on status identically (DRY) — see `change-seat-error.ts` /
 * `change-stop-error.ts`.
 */
export function classifyHttpFallback(error: unknown): HttpFallbackTier {
  if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500)) {
    return 'SERVICE_UNAVAILABLE';
  }
  return 'ACTION_UNAVAILABLE';
}
