import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { LanguageService } from '../../shared/services/language.service';
import { TranslateService } from '@ngx-translate/core';

interface AdminNavItem {
  path: string;
  labelKey: string;
  icon: string;
}

@Component({
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent implements OnInit {
  protected pageTitleKey = 'ADMIN.PAGES.DASHBOARD';
  protected readonly pageSubtitleKey = 'ADMIN.LAYOUT.SUBTITLE';
  protected readonly navItems: AdminNavItem[] = [
    {
      path: 'dashboard',
      labelKey: 'ADMIN.PAGES.DASHBOARD',
      icon: 'dashboard',
    },
    {
      path: 'lookups',
      labelKey: 'ADMIN.PAGES.LOOKUP_SETTINGS',
      icon: 'settings_input_component',
    },
    {
      path: 'roles',
      labelKey: 'ADMIN.PAGES.ROLE_MANAGEMENT',
      icon: 'admin_panel_settings',
    },
    {
      path: 'users',
      labelKey: 'ADMIN.PAGES.USER_MANAGEMENT',
      icon: 'group',
    },
    {
      path: 'vehicles',
      labelKey: 'ADMIN.PAGES.VEHICLE_MANAGEMENT',
      icon: 'directions_bus',
    },
    { path: 'routes', labelKey: 'ADMIN.PAGES.ROUTE_MANAGEMENT', icon: 'route' },
    { path: 'schedules', labelKey: 'ADMIN.PAGES.SCHEDULES', icon: 'calendar_month' },
    { path: 'bookings', labelKey: 'ADMIN.PAGES.BOOKINGS_MANAGEMENT', icon: 'confirmation_number' },
  ];

  protected currentLanguage = 'th';
  protected isProfileMenuOpen = false;
  protected isSidebarOpen = false;

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly languageService: LanguageService,
    private readonly elementRef: ElementRef<HTMLElement>
  ) {}

  protected get userInitials(): string {
    const username = this.authService.getUsername() ?? '';
    const namePart = username.split('@')[0] ?? '';
    const segments = namePart.split(/[.\-_\s]+/).filter((segment) => segment.length > 0);

    if (segments.length === 0) {
      return 'AD';
    }

    if (segments.length === 1) {
      return segments[0].slice(0, 2).toUpperCase();
    }

    return (segments[0][0] + segments[1][0]).toUpperCase();
  }

  ngOnInit(): void {
    this.setupLanguage();

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
            : 'ADMIN.PAGES.DEFAULT';
        // Collapse the mobile drawer whenever navigation completes.
        this.isSidebarOpen = false;
      });
  }

  protected toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  protected closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.isProfileMenuOpen = false;
    this.isSidebarOpen = false;
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const profile = this.elementRef.nativeElement.querySelector('.admin-profile');
    if (this.isProfileMenuOpen && profile && !profile.contains(event.target as Node)) {
      this.isProfileMenuOpen = false;
    }
  }

  protected async switchLanguage(lang: string): Promise<void> {
    this.currentLanguage = lang;
    await this.languageService.switch(lang);
  }

  protected toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  protected onLogout(): void {
    this.isProfileMenuOpen = false;
    this.alertService.success(this.translate.instant('ADMIN.LAYOUT.LOGOUT_SUCCESS'));
    this.authService.logout();
  }

  private async setupLanguage(): Promise<void> {
    await this.switchLanguage(this.languageService.getStoredLanguage());
  }

  private getDeepestRoute(route: ActivatedRoute): ActivatedRoute {
    let currentRoute = route;
    while (currentRoute.firstChild) {
      currentRoute = currentRoute.firstChild;
    }
    return currentRoute;
  }
}

