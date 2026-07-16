import { HttpErrorResponse } from '@angular/common/http';

/**
 * OBRS-413: the one `error.error.errorCode` reader. Every per-domain
 * `extract*ErrorCode()` delegates here instead of re-implementing the same
 * five lines — branch on the stable UPPER_SNAKE code, never the localized
 * `message` (design-system §9).
 *
 * `fallback` is what the caller wants when no code is readable, which is the
 * only axis the per-domain helpers ever varied on: `'GENERIC'` for the ones
 * whose `map*ErrorCode()` has a GENERIC i18n key, `null` for the ones whose
 * caller branches on absence.
 *
 * The `instanceof HttpErrorResponse` guard is load-bearing, not incidental:
 * `settlements-page` and `sell-page` read the same field WITHOUT it, and their
 * specs throw plain `{ error: { errorCode } }` literals that this function
 * would (correctly) reject. Those two are deliberately NOT migrated here —
 * doing so would change their behavior for non-HttpErrorResponse input. See
 * `docs/adr/0022-shared-api-error-code-extractor.md`.
 */
export function extractApiErrorCode<T extends string | null>(
  error: unknown,
  fallback: T,
): string | T {
  if (error instanceof HttpErrorResponse) {
    const code = (error.error as { errorCode?: string } | null)?.errorCode;
    if (code) {
      return code;
    }
  }
  return fallback;
}
