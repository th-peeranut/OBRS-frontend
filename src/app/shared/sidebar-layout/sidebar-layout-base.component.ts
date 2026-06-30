import { Directive, ElementRef, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, startWith, Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { ThemeService } from '../../shared/services/theme.service';
import { TranslateService } from '@ngx-translate/core';

/**
 * Abstract base for the shared sidebar-shell chrome (AdminLayoutComponent
 * and StaffLayoutComponent). Holds all sidebar interaction state, the
 * click-toggle expand/collapse mechanism, localStorage persistence, keyboard
 * handlers, theme, route-title subscriptions, and the profile-menu toggle.
 *
 * Decorated with @Directive() (no selector) so @HostListener decorators and
 * Angular metadata are inherited by concrete child components. Uses Angular 18
 * inject() for deps so children do not need a large super(...) constructor call.
 *
 * See: docs/adr/0005-shared-sidebar-base-hover-expand.md
 * (Amended 2026-06-30: switched from hover-overlay to always-reserved-column.)
 */
@Directive()
export abstract class SidebarLayoutBaseComponent implements OnInit, OnDestroy {
  // ── Abstract members implemented by each child ─────────────────────────────
  /** i18n key for the logout success toast (differs per portal area). */
  protected abstract readonly logoutSuccessKey: string;
  /** Fallback page title when the active route declares no titleKey. */
  protected abstract readonly defaultTitleKey: string;
  /** Fallback page subtitle when the active route declares no subtitleKey. */
  protected abstract readonly defaultSubtitleKey: string;

  // ── Page header ─────────────────────────────────────────────────────────────
  protected pageTitleKey = '';
  protected pageSubtitleKey = '';

  // ── Mobile drawer ───────────────────────────────────────────────────────────
  protected isSidebarOpen = false;

  // ── Profile menu ────────────────────────────────────────────────────────────
  protected isProfileMenuOpen = false;

  // ── Dark mode mirror ────────────────────────────────────────────────────────
  protected isDarkMode = false;

  // ── Desktop always-reserved-column state ───────────────────────────────────
  /**
   * True = expanded 280px reserved column (labels visible); default for new
   * users. False = collapsed 76px icon rail. Toggled by an explicit click on
   * the toggle button — no hover/focus expansion in this model.
   *
   * localStorage semantics (migration-safe with the old pin model):
   *   '0' = expanded (was "pinned open")
   *   '1' = collapsed (was "icon rail")
   *   absent → expanded (new default; old users who never toggled see expanded)
   */
  protected isSidebarPinned = true;

  private static readonly SIDEBAR_STORAGE_KEY = 'obrs-sidebar-collapsed';

  // ── RxJS cleanup ────────────────────────────────────────────────────────────
  protected readonly destroy$ = new Subject<void>();

  // ── Injected deps — Angular 18 inject() avoids super() parameter bloat ─────
  protected readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  protected readonly authService = inject(AuthService);
  protected readonly alertService = inject(AlertService);
  protected readonly translate = inject(TranslateService);
  protected readonly themeService = inject(ThemeService);
  protected readonly elementRef = inject(ElementRef<HTMLElement>);

  protected get userInitials(): string {
    const username = this.authService.getUsername() ?? '';
    const namePart = username.split('@')[0] ?? '';
    const segments = namePart.split(/[.\-_\s]+/).filter((s) => s.length > 0);
    if (segments.length === 0) return 'XX';
    if (segments.length === 1) return segments[0].slice(0, 2).toUpperCase();
    return (segments[0][0] + segments[1][0]).toUpperCase();
  }

  // ── Computed ────────────────────────────────────────────────────────────────

  /**
   * Material Symbol icon name for the sidebar toggle button.
   * Expanded state → show "collapse" affordance (chevron pointing left).
   * Collapsed state → show "expand" affordance (chevron pointing right).
   */
  protected get toggleIconName(): string {
    return this.isSidebarPinned ? 'chevron_left' : 'chevron_right';
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.readPinPreference();

    this.themeService.mode$.pipe(takeUntil(this.destroy$)).subscribe((mode) => {
      this.isDarkMode = mode === 'dark';
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        startWith(new NavigationEnd(0, this.router.url, this.router.url)),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        const activeRoute = this.getDeepestRoute(this.route);
        const titleKey = activeRoute.snapshot.data['titleKey'];
        this.pageTitleKey =
          typeof titleKey === 'string' && titleKey.length > 0
            ? titleKey
            : this.defaultTitleKey;
        const subtitleKey = activeRoute.snapshot.data['subtitleKey'];
        this.pageSubtitleKey =
          typeof subtitleKey === 'string' && subtitleKey.length > 0
            ? subtitleKey
            : this.defaultSubtitleKey;
        this.isSidebarOpen = false;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── localStorage: expand/collapse preference ────────────────────────────────
  /**
   * Reads the stored sidebar state and applies it. Semantics:
   *   '0' = expanded (was "pinned") — continues to mean expanded.
   *   '1' = collapsed (was "icon-rail") — continues to mean collapsed.
   *   absent → expanded (new default; migration-safe: old users who never
   *             toggled were on the hover model, which showed the rail —
   *             giving them an expanded default is a safe, expected improvement).
   * Canonicalises the stored value on read so later writes are consistent.
   */
  private readPinPreference(): void {
    try {
      const stored = localStorage.getItem(SidebarLayoutBaseComponent.SIDEBAR_STORAGE_KEY);
      // Only '1' means collapsed; absent or '0' → expanded.
      this.isSidebarPinned = stored !== '1';
      this.writePinPreference(this.isSidebarPinned);
    } catch {
      // localStorage unavailable (private mode) — field-initialiser default (true) applies.
    }
  }

  private writePinPreference(pinned: boolean): void {
    try {
      localStorage.setItem(
        SidebarLayoutBaseComponent.SIDEBAR_STORAGE_KEY,
        pinned ? '0' : '1'
      );
    } catch {
      // localStorage unavailable — pin works for the session only.
    }
  }

  // ── Sidebar collapse/expand toggle ─────────────────────────────────────────
  /**
   * Toggles the sidebar between its two reserved-column widths (280px expanded
   * / 76px collapsed). Persists the choice to localStorage. No hover/overlay
   * mode exists in this model — only an explicit click causes a width change.
   */
  protected togglePin(): void {
    this.isSidebarPinned = !this.isSidebarPinned;
    this.writePinPreference(this.isSidebarPinned);
  }

  // ── Nav link click ──────────────────────────────────────────────────────────
  /** Closes the mobile drawer on navigation. Desktop state is untouched. */
  protected onNavLinkClick(): void {
    this.isSidebarOpen = false;
  }

  // ── Mobile sidebar ──────────────────────────────────────────────────────────
  protected toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  protected closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  // ── Theme ───────────────────────────────────────────────────────────────────
  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  // ── Profile menu ────────────────────────────────────────────────────────────
  protected toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  protected closeProfileMenu(): void {
    this.isProfileMenuOpen = false;
  }

  // ── Logout ──────────────────────────────────────────────────────────────────
  protected onLogout(): void {
    this.isProfileMenuOpen = false;
    this.alertService.success(this.translate.instant(this.logoutSuccessKey));
    this.authService.logout();
  }

  // ── Keyboard / global event handlers ───────────────────────────────────────
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.isSidebarOpen = false;
    this.isProfileMenuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const profile = this.elementRef.nativeElement.querySelector('.admin-profile');
    if (this.isProfileMenuOpen && profile && !profile.contains(event.target as Node)) {
      this.isProfileMenuOpen = false;
    }
  }

  // ── Route helpers ───────────────────────────────────────────────────────────
  protected getDeepestRoute(route: ActivatedRoute): ActivatedRoute {
    let currentRoute = route;
    while (currentRoute.firstChild) {
      currentRoute = currentRoute.firstChild;
    }
    return currentRoute;
  }
}
