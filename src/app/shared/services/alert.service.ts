import { Injectable, inject } from '@angular/core';
import Swal, { SweetAlertIcon, SweetAlertTheme } from 'sweetalert2';
import { ThemeService } from './theme.service';

/**
 * How long the blocking loading overlay may hold the whole screen before it has to
 * offer the customer a way out (OBRS-642).
 *
 * The overlay is fired with `allowOutsideClick: false`, `allowEscapeKey: false` and no
 * close button, so while a request is in flight there is literally no way off it but a
 * page refresh. Measured on prod 2026-08-10: a first visit on a phone sat on this
 * overlay for over a minute and the customer had to reload to escape.
 *
 * 8s is chosen against a MEASURED prod baseline — `GET /api/stops` answered in
 * 0.15-0.26s TTFB (curl, 3 runs, 2026-08-10) — so this only ever fires on a request
 * that is already far outside normal. It does NOT cancel anything: the request keeps
 * running and the overlay keeps spinning; all that changes is that the door is now
 * unlocked.
 */
export const LOADING_ESCAPE_AFTER_MS = 8_000;

/**
 * Stamped on the popup this service opens so `hideLoading()` can identify its own.
 *
 * The identity check used to be `Swal.isLoading()`, i.e. "does the popup carry
 * data-loading", which sweetalert2 only sets from inside `didOpen` — and it schedules
 * `didOpen` with `setTimeout` (sweetalert2 11.26.18, `sweetalert2.js:4342-4344`). So for
 * the first macrotask of the popup's life the check reports false, the close is skipped,
 * and `isLoadingVisible` is nonetheless set to false — leaving an overlay on screen that
 * this service no longer believes exists and can therefore never close again.
 */
const LOADING_POPUP_CLASS = 'swal-global-loading';

@Injectable({
  providedIn: 'root',
})
export class AlertService {
  private loadingCount = 0;
  private isLoadingVisible = false;
  private escapeTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly themeService = inject(ThemeService);
  private currentTheme: SweetAlertTheme = 'light';

  /**
   * OBRS-520: SweetAlert2 defaults to `theme: 'light'` and stamps
   * `data-swal2-theme="light"` on its container regardless of our app theme, so
   * every one of the ~16 AlertService call sites rendered a stark white card on
   * the dark shell — measured on the real dark admin page at rgb(255,255,255)
   * popup / rgb(84,84,84) text against a #1d2226 surface.
   *
   * Fixed by passing the theme through rather than by hand-writing CSS
   * overrides: sweetalert2 11.26 already ships `[data-swal2-theme=dark]` rules
   * inside the `sweetalert2.min.css` we import in styles.scss, so the supported
   * option covers every popup shape (confirm, toast, loading, icons, inputs) at
   * once, with no `!important` fight against the vendor stylesheet.
   *
   * `theme: 'auto'` is deliberately NOT used — it follows the OS
   * `prefers-color-scheme`, which is not our source of truth. ThemeService is
   * (the user can pick a theme that disagrees with their OS, and OBRS honours
   * that everywhere else).
   */
  constructor() {
    this.themeService.mode$.subscribe((mode) => {
      this.currentTheme = mode === 'dark' ? 'dark' : 'light';
    });
  }

  /** Theme to hand every `Swal.fire`, read at call time so a mid-session toggle applies. */
  private get theme(): SweetAlertTheme {
    return this.currentTheme;
  }

  success(message: string) {
    this.resetLoadingState();
    return Swal.fire({ icon: 'success', title: message, theme: this.theme });
  }

  error(message: string) {
    this.resetLoadingState();
    return Swal.fire({ icon: 'error', title: message, theme: this.theme });
  }

  /**
   * Error alert for the AuthGuard no-permission bounce (OBRS-265). Same as
   * error(), but obscures the just-bounced-to destination behind a blurred,
   * slightly darker backdrop (via the `.swal-guard-backdrop` container class in
   * styles.scss) so the page underneath reads as calm rather than a fully
   * legible page with a modal floating on top. Not a security control — the
   * destination is a page the user is already allowed to see.
   */
  permissionDenied(message: string) {
    this.resetLoadingState();
    return Swal.fire({
      icon: 'error',
      title: message,
      customClass: { container: 'swal-guard-backdrop' },
      theme: this.theme,
    });
  }

  info(message: string) {
    this.resetLoadingState();
    return Swal.fire({ icon: 'info', title: message, theme: this.theme });
  }

  warning(message: string) {
    this.resetLoadingState();
    return Swal.fire({ icon: 'warning', title: message, theme: this.theme });
  }

  toast(message: string, icon: SweetAlertIcon = 'info'): void {
    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      theme: this.theme,
      icon,
      title: message,
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
      },
    });
    void Toast.fire();
  }

  async confirm(options: {
    title: string;
    text: string;
    confirmButtonText: string;
    cancelButtonText: string;
    icon?: SweetAlertIcon;
  }): Promise<boolean> {
    this.resetLoadingState();
    const result = await Swal.fire({
      icon: options.icon ?? 'warning',
      title: options.title,
      text: options.text,
      showCancelButton: true,
      confirmButtonText: options.confirmButtonText,
      cancelButtonText: options.cancelButtonText,
      reverseButtons: true,
      focusCancel: true,
      theme: this.theme,
    });

    return result.isConfirmed;
  }

  /**
   * @param title       spinner title, already translated by the caller.
   * @param slowHint    line shown alongside the close button once the overlay has been
   *                    up for `LOADING_ESCAPE_AFTER_MS`, explaining why it is still
   *                    there. Optional: without it the escape hatch still appears, just
   *                    without an explanation.
   * @param closeLabel  accessible name for that close button.
   */
  showLoading(title = 'Loading...', slowHint?: string, closeLabel?: string) {
    this.loadingCount += 1;

    if (this.isLoadingVisible) {
      return;
    }

    this.isLoadingVisible = true;
    void Swal.fire({
      title,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      customClass: { popup: LOADING_POPUP_CLASS },
      theme: this.theme,
      didOpen: () => {
        Swal.showLoading();
        this.armEscapeHatch(slowHint, closeLabel);
      },
      didClose: () => {
        // Fires for OUR close and for a close the customer performed through the escape
        // hatch. Resetting the counter is what makes the second case safe: leaving it at
        // 1 for a request that never returns would mean the NEXT overlay could never
        // count back down to 0, so it would never close either.
        //
        // KNOWN, ACCEPTED IMBALANCE (found in review): a single counter cannot tell a
        // dismissed request from a finished one. If A is dismissed while still in
        // flight and a later request C opens its own overlay, A's eventual completion
        // decrements C's count and closes C's overlay early. The screen becomes usable
        // sooner than C intended — which is this card's goal, not its bug — so the
        // trade is deliberate. Making it exact needs per-request tracking rather than a
        // count; do that if a case ever shows up where the early close actually costs
        // something.
        this.resetLoadingState();
      },
    });
  }

  hideLoading() {
    if (this.loadingCount > 0) {
      this.loadingCount -= 1;
    }

    if (this.loadingCount > 0 || !this.isLoadingVisible) {
      return;
    }

    // Close only a popup this service opened. Identifying it by class rather than by
    // `Swal.isLoading()` is what closes the OBRS-642 hole documented on
    // LOADING_POPUP_CLASS, while keeping the original protection: an error/confirm
    // dialog that replaced the spinner mid-flight must not be closed out from under
    // the customer by a late-arriving response.
    if (Swal.getPopup()?.classList.contains(LOADING_POPUP_CLASS)) {
      Swal.close();
    }
    this.resetLoadingState();
  }

  /**
   * Give the customer a door out of the overlay once it has clearly stopped being a
   * momentary flash. The in-flight request is untouched — cancelling it is not this
   * service's call to make, and on a mutation (a payment) it would be the wrong one.
   */
  private armEscapeHatch(slowHint?: string, closeLabel?: string): void {
    this.clearEscapeTimer();
    this.escapeTimer = setTimeout(() => {
      this.escapeTimer = null;
      if (!this.isLoadingVisible) {
        return;
      }
      if (!Swal.getPopup()?.classList.contains(LOADING_POPUP_CLASS)) {
        return;
      }
      Swal.update({
        showCloseButton: true,
        allowEscapeKey: true,
        allowOutsideClick: true,
        ...(slowHint ? { text: slowHint } : {}),
        ...(closeLabel ? { closeButtonAriaLabel: closeLabel } : {}),
      });
      // Swal.update() re-renders the popup, which drops the spinner. Put it back: the
      // request really is still running, and an overlay with no spinner would read as
      // finished-but-stuck.
      Swal.showLoading();
    }, LOADING_ESCAPE_AFTER_MS);
  }

  private clearEscapeTimer(): void {
    if (this.escapeTimer !== null) {
      clearTimeout(this.escapeTimer);
      this.escapeTimer = null;
    }
  }

  /** Single place that returns the loading bookkeeping to "nothing is on screen". */
  private resetLoadingState(): void {
    this.clearEscapeTimer();
    this.loadingCount = 0;
    this.isLoadingVisible = false;
  }
}
