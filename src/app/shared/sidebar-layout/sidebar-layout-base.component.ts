import { Directive, ElementRef, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, startWith, Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { ThemeService } from '../../shared/services/theme.service';
import { TranslateService } from '@ngx-translate/core';

/**
 * Abstract base for the shared sidebar-shell chrome (AdminLayoutComponent
 * and StaffLayoutComponent). Holds all sidebar interaction state, hover-expand
 * logic, pin/localStorage, keyboard handlers, theme, route-title subscriptions,
 * and the profile-menu toggle.
 *
 * Decorated with @Directive() (no selector) so @HostListener decorators and
 * Angular metadata are inherited by concrete child components. Uses Angular 18
 * inject() for deps so children do not need a large super(...) constructor call.
 *
 * See: docs/adr/0004-shared-sidebar-base-hover-expand.md
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

  // ── Desktop hover-expand / pin state ───────────────────────────────────────
  /** True when the sidebar is pinned open (reserved layout column, content reflows). */
  protected isSidebarPinned = false;
  /** True while hover or focus is inside the sidebar (overlay expansion). */
  protected isSidebarExpanded = false;
  private collapseTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Shared key with the old click-collapse behaviour:
   *   '0' = was expanded → now means "pinned open"
   *   '1' = was collapsed → now means "icon rail (unpinned)"
   *   absent → icon rail (first-time users default to hover model)
   */
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

  // ── Computed ────────────────────────────────────────────────────────────────

  /**
   * Font variation settings for the push_pin Material Symbol icon.
   * Expressed as a getter to avoid double-quote escaping issues inside HTML
   * attribute bindings — the raw `"FILL" 1` value is not safely embeddable
   * inline in Angular template expressions (the HTML parser closes the attribute
   * at the unescaped double-quote before Angular can interpret it).
   */
  protected get pinIconVariation(): string {
    return this.isSidebarPinned ? '"FILL" 1' : '"FILL" 0';
  }

  protected get userInitials(): string {
    const username = this.authService.getUsername() ?? '';
    const namePart = username.split('@')[0] ?? '';
    const segments = namePart.split(/[.\-_\s]+/).filter((s) => s.length > 0);
    if (segments.length === 0) return 'XX';
    if (segments.length === 1) return segments[0].slice(0, 2).toUpperCase();
    return (segments[0][0] + segments[1][0]).toUpperCase();
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
    this.cancelCollapseTimer();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── localStorage: pin preference ────────────────────────────────────────────
  /**
   * Reads the stored sidebar state. The key was written by the old collapse code
   * as '1' = collapsed, '0' = expanded. Re-interpreted: '0' → pinned open;
   * anything else (or absent) → icon-rail unpinned. Canonicalises on read.
   */
  private readPinPreference(): void {
    try {
      const stored = localStorage.getItem(SidebarLayoutBaseComponent.SIDEBAR_STORAGE_KEY);
      this.isSidebarPinned = stored === '0';
      this.isSidebarExpanded = this.isSidebarPinned;
      this.writePinPreference(this.isSidebarPinned);
    } catch {
      // localStorage unavailable (private mode) — defaults apply for the session.
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

  // ── Sidebar hover / focus expand handlers ──────────────────────────────────
  protected onSidebarMouseEnter(): void {
    this.cancelCollapseTimer();
    this.isSidebarExpanded = true;
  }

  protected onSidebarMouseLeave(): void {
    if (this.isSidebarPinned) return;
    this.startCollapseTimer();
  }

  protected onSidebarFocusIn(): void {
    this.cancelCollapseTimer();
    this.isSidebarExpanded = true;
  }

  protected onSidebarFocusOut(e: FocusEvent): void {
    if (this.isSidebarPinned) return;
    const sidebar = this.elementRef.nativeElement.querySelector('.admin-sidebar');
    // contains(null) returns false → collapse when focus leaves the window; acceptable.
    if (sidebar && sidebar.contains(e.relatedTarget as Node)) return;
    this.isSidebarExpanded = false;
  }

  // ── Pin toggle ──────────────────────────────────────────────────────────────
  protected togglePin(): void {
    if (!this.isSidebarPinned) {
      this.isSidebarPinned = true;
      this.isSidebarExpanded = true;
      this.writePinPreference(true);
    } else {
      this.isSidebarPinned = false;
      // Keep expanded until pointer/focus leaves — mouseleave/focusout start the
      // collapse timer, preventing an abrupt snap back on unpin.
      this.isSidebarExpanded = true;
      this.writePinPreference(false);
    }
  }

  // ── Nav link click ──────────────────────────────────────────────────────────
  /**
   * Closes the mobile drawer and, on desktop when unpinned, immediately
   * collapses the hover-overlay so it does not linger after navigation.
   */
  protected onNavLinkClick(): void {
    this.isSidebarOpen = false;
    if (!this.isSidebarPinned) {
      this.cancelCollapseTimer();
      this.isSidebarExpanded = false;
    }
  }

  // ── Collapse timer helpers ──────────────────────────────────────────────────
  private startCollapseTimer(): void {
    this.cancelCollapseTimer();
    this.collapseTimer = setTimeout(() => {
      this.isSidebarExpanded = false;
      this.collapseTimer = null;
    }, 120);
  }

  private cancelCollapseTimer(): void {
    if (this.collapseTimer !== null) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
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
    if (this.isSidebarExpanded && !this.isSidebarPinned) {
      this.cancelCollapseTimer();
      this.isSidebarExpanded = false;
    }
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
