import { HttpErrorResponse } from '@angular/common/http';
import { hasOwnKey } from './own-key';

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

/**
 * OBRS-601: the other half of ADR-0022. `extractApiErrorCode` reads the code;
 * this turns it into an i18n key. Eighteen call sites had open-coded the same
 * three shapes —
 *
 * ```ts
 * (errorCode && knownCodes[errorCode]) || FALLBACK
 * errorCode ? knownCodes[errorCode] ?? FALLBACK : FALLBACK
 * if (errorCode && knownCodes[errorCode]) { return knownCodes[errorCode]; }
 * ```
 *
 * — and all three are the same defect, because the map is an object literal
 * that inherits from `Object.prototype`. A server `errorCode` of `constructor`
 * resolves to the `Object` function: non-nullish, so `??` never fires, and
 * truthy, so `||` never fires either. The caller then hands a *function* to
 * `translate.instant()`, which throws on `.split('.')` — inside an error
 * handler, so the toast is lost AND the statements after it never run.
 *
 * These codes are un-normalized server text, so all eight `Object.prototype`
 * members are reachable here, not just the two that survive lower-casing.
 *
 * Behavior is otherwise identical to the shapes above (every map value is a
 * non-empty i18n key, so the `||`-vs-`hasOwnProperty` distinction on falsy
 * values is not reachable). Deliberately NOT merged with
 * `extractApiErrorCode` — reading the wire and choosing a translation are
 * separate concerns, and a caller may already hold a code.
 */
export function mapApiErrorCode(
  errorCode: string | null | undefined,
  knownCodes: Record<string, string>,
  fallbackKey: string,
): string {
  const code = String(errorCode ?? '');
  return hasOwnKey(knownCodes, code) ? knownCodes[code] : fallbackKey;
}
