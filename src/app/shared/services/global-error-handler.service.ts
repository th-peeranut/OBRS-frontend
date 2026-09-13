import { ErrorHandler, Injectable } from '@angular/core';

/**
 * Root ErrorHandler (2026-09-11 production-readiness review).
 *
 * Two jobs, both previously done by nobody:
 *
 * 1. Every deploy re-hashes the lazy chunks (`outputHashing: all`, no service worker), so a tab
 *    that was open across a deploy fails its next lazy navigation with a ChunkLoadError - and
 *    the customer this most often happens to is the one sitting on the payment page.
 *    `promote-sit.yml` has recorded this for months. A stale-chunk failure is answered with ONE
 *    reload per RELOAD_COOLDOWN_MS (sessionStorage timestamp; a second failure inside that window is
 *    logged, not looped, while a tab that meets a later deploy can still recover - see claimReload).
 * 2. Everything else is still logged, but through one seam that a reporting sink can be attached
 *    to later, instead of 27 scattered `console.error` calls being the only trace.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  static readonly RELOAD_FLAG = 'obrs_chunk_reload';

  /** A genuine reload loop re-fails in seconds; a second deploy is minutes or hours away. */
  static readonly RELOAD_COOLDOWN_MS = 10 * 60 * 1000;

  private static readonly CHUNK_LOAD_PATTERNS = [
    /ChunkLoadError/i,
    /Loading chunk [\w-]+ failed/i,
    /Failed to fetch dynamically imported module/i,
    /Importing a module script failed/i,
    /error loading dynamically imported module/i,
  ];

  handleError(error: unknown): void {
    const unwrapped = GlobalErrorHandler.unwrap(error);

    if (GlobalErrorHandler.isStaleChunkError(unwrapped)) {
      if (this.claimReload()) {
        this.reload();
        return;
      }
    }

    // eslint-disable-next-line no-console
    console.error(unwrapped);
  }

  static isStaleChunkError(error: unknown): boolean {
    const text = GlobalErrorHandler.describe(error);
    return GlobalErrorHandler.CHUNK_LOAD_PATTERNS.some((pattern) => pattern.test(text));
  }

  /** Angular wraps unhandled promise rejections as `{ rejection }`; unwrap to the cause. */
  private static unwrap(error: unknown): unknown {
    if (error && typeof error === 'object' && 'rejection' in error) {
      const rejection = (error as { rejection?: unknown }).rejection;
      if (rejection) {
        return rejection;
      }
    }
    return error;
  }

  private static describe(error: unknown): string {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object') {
      const named = error as { name?: unknown; message?: unknown };
      return `${String(named.name ?? '')}: ${String(named.message ?? '')}`;
    }
    return String(error);
  }

  /**
   * True unless this session already reloaded within the last RELOAD_COOLDOWN_MS; false when
   * storage is unavailable.
   *
   * OBRS-1853: this used to test the stored value for truthiness only, so the timestamp it
   * wrote was never read and the session got exactly ONE reload, ever. A tab open across two
   * deploys - the same hours-long payment-page tab the class exists for - spent its reload on
   * the first stale chunk and answered the second with a console line: a dead button and no
   * message. A cooldown keeps the loop protection (a real loop re-fails within seconds) while
   * letting a second deploy, minutes or hours later, be recovered from.
   */
  private claimReload(): boolean {
    try {
      const last = sessionStorage.getItem(GlobalErrorHandler.RELOAD_FLAG);
      if (last) {
        const at = Date.parse(last);
        if (Number.isNaN(at)) {
          // Only an older build of this flag wrote a non-timestamp. Refuse this reload - it may be
          // the second of a loop - but stamp a real timestamp so the tab is not stuck refusing for
          // the rest of its session, which is what returning early used to do.
          sessionStorage.setItem(GlobalErrorHandler.RELOAD_FLAG, new Date().toISOString());
          return false;
        }
        if (Date.now() - at < GlobalErrorHandler.RELOAD_COOLDOWN_MS) {
          return false;
        }
      }
      sessionStorage.setItem(GlobalErrorHandler.RELOAD_FLAG, new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  }

  protected reload(): void {
    window.location.reload();
  }
}
