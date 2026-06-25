import { Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, startWith, Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { ThemeService } from '../../shared/services/theme.service';
import { TranslateService } from '@ngx-translate/core';

interface StaffNavItem {
  path: string;
  labelKey: string;
  icon: string;
}

@Component({
  selector: 'app-staff-layout',
  templateUrl: './staff-layout.component.html',
  styleUrl: './staff-layout.component.scss',
})
export class StaffLayoutComponent implements OnInit, OnDestroy {
  protected pageTitleKey = 'STAFF.PAGES.SELL';
  // Route-driven subtitle (mirrors pageTitleKey); falls back to the generic
  // portal subtitle when a route doesn't declare one.
  protected pageSubtitleKey = 'STAFF.LAYOUT.SUBTITLE';

  protected isSidebarOpen = false;
  protected isSidebarCollapsed = false;
  protected isProfileMenuOpen = false;
  protected isDarkMode = false;

  private readonly destroy$ = new Subject<void>();

  // Desktop sidebar collapse state, shared across admin + staff areas.
  private static readonly SIDEBAR_COLLAPSED_KEY = 'obrs-sidebar-collapsed';

  // Whether to surface the Admin Dashboard shortcut in the profile menu.
  // Admins satisfy the /staff route guard via the backend role hierarchy
  // (see AuthService.hasAnyRole), so they can land here; gate the link on the
  // admin role so non-admin staff don't get a dead link the /admin AuthGuard
  // would only bounce.
  protected isAdmin = false;

  // Computed once in ngOnInit and held in a stable field. Must NOT be a getter:
  // a getter returning a fresh array each change-detection cycle, bound to an
  // *ngFor containing routerLinkActive, recreates those directives on every cycle
  // and never lets change detection stabilise — hard-locking the browser.
  protected navItems: StaffNavItem[] = [];

  private buildNavItems(): StaffNavItem[] {
    const isSalesperson = this.authService.hasAnyRole(['salesperson']);
    const isDriver = this.authService.hasAnyRole(['driver']);
    const items: StaffNavItem[] = [];

    if (isSalesperson) {
      items.push({ path: 'sell', labelKey: 'STAFF.NAV.SELL', icon: 'sell' });
      items.push({ path: 'schedules', labelKey: 'STAFF.NAV.SCHEDULES', icon: 'calendar_month' });
    }

    if (isDriver) {
      items.push({ path: 'driver', labelKey: 'STAFF.NAV.MY_SCHEDULES', icon: 'directions_bus' });
    }

    if (isSalesperson || isDriver) {
      items.push({ path: 'boarding', labelKey: 'STAFF.NAV.BOARDING', icon: 'how_to_reg' });
    }

    return items;
  }

  protected trackNavItem(_index: number, item: StaffNavItem): string {
    return item.path;
  }

  protected get userInitials(): string {
    const username = this.authService.getUsername() ?? '';
    const namePart = username.split('@')[0] ?? '';
    const segments = namePart.split(/[.\-_\s]+/).filter((s) => s.length > 0);
    if (segments.length === 0) return 'ST';
    if (segments.length === 1) return segments[0].slice(0, 2).toUpperCase();
    return (segments[0][0] + segments[1][0]).toUpperCase();
  }

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly themeService: ThemeService
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    this.navItems = this.buildNavItems();
    this.isAdmin = this.authService.hasAnyRole(['admin']);
    this.isSidebarCollapsed = this.readCollapsedPreference();
    this.themeService.mode$.pipe(takeUntil(this.destroy$)).subscribe((mode) => {
      this.isDarkMode = mode === 'dark';
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        startWith(new NavigationEnd(0, this.router.url, this.router.url))
      )
      .subscribe(() => {
        const activeRoute = this.getDeepestRoute(this.route);
        const titleKey = activeRoute.snapshot.data['titleKey'];
        this.pageTitleKey =
          typeof titleKey === 'string' && titleKey.length > 0
            ? titleKey
            : 'STAFF.PAGES.SELL';
        const subtitleKey = activeRoute.snapshot.data['subtitleKey'];
        this.pageSubtitleKey =
          typeof subtitleKey === 'string' && subtitleKey.length > 0
            ? subtitleKey
            : 'STAFF.LAYOUT.SUBTITLE';
        this.isSidebarOpen = false;
      });
  }

  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  protected closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  protected toggleSidebarCollapse(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    try {
      localStorage.setItem(
        StaffLayoutComponent.SIDEBAR_COLLAPSED_KEY,
        this.isSidebarCollapsed ? '1' : '0'
      );
    } catch {
      // localStorage unavailable (private mode) — collapse still works in-session.
    }
  }

  private readCollapsedPreference(): boolean {
    try {
      return localStorage.getItem(StaffLayoutComponent.SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  }

  protected toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  protected closeProfileMenu(): void {
    this.isProfileMenuOpen = false;
  }

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

  protected onLogout(): void {
    this.isProfileMenuOpen = false;
    void this.alertService.success(this.translate.instant('STAFF.LAYOUT.LOGOUT_SUCCESS'));
    this.authService.logout();
  }

  private getDeepestRoute(route: ActivatedRoute): ActivatedRoute {
    let currentRoute = route;
    while (currentRoute.firstChild) {
      currentRoute = currentRoute.firstChild;
    }
    return currentRoute;
  }
}
