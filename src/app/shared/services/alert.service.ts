import { Injectable, inject } from '@angular/core';
import Swal, { SweetAlertIcon, SweetAlertTheme } from 'sweetalert2';
import { ThemeService } from './theme.service';

@Injectable({
  providedIn: 'root',
})
export class AlertService {
  private loadingCount = 0;
  private isLoadingVisible = false;

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
    this.isLoadingVisible = false;
    return Swal.fire({ icon: 'success', title: message, theme: this.theme });
  }

  error(message: string) {
    this.isLoadingVisible = false;
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
    this.isLoadingVisible = false;
    return Swal.fire({
      icon: 'error',
      title: message,
      customClass: { container: 'swal-guard-backdrop' },
      theme: this.theme,
    });
  }

  info(message: string) {
    this.isLoadingVisible = false;
    return Swal.fire({ icon: 'info', title: message, theme: this.theme });
  }

  warning(message: string) {
    this.isLoadingVisible = false;
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
    this.isLoadingVisible = false;
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

  showLoading(title = 'Loading...') {
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
      theme: this.theme,
      didOpen: () => {
        Swal.showLoading();
      },
    });
  }

  hideLoading() {
    if (this.loadingCount > 0) {
      this.loadingCount -= 1;
    }

    if (this.loadingCount === 0 && this.isLoadingVisible) {
      if (Swal.isLoading()) {
        Swal.close();
      }
      this.isLoadingVisible = false;
    }
  }
}
