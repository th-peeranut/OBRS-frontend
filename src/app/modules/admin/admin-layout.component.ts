import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { PrimeNGConfig } from 'primeng/api';
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
  protected pageTitleKey = 'ADMIN.PAGES.LOOKUP_SETTINGS';
  protected readonly pageSubtitleKey = 'ADMIN.LAYOUT.SUBTITLE';
  protected readonly navItems: AdminNavItem[] = [
    {
      path: 'lookup-settings',
      labelKey: 'ADMIN.PAGES.LOOKUP_SETTINGS',
      icon: 'settings_input_component',
    },
    {
      path: 'role-management',
      labelKey: 'ADMIN.PAGES.ROLE_MANAGEMENT',
      icon: 'admin_panel_settings',
    },
    {
      path: 'user-management',
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

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly primengConfig: PrimeNGConfig
  ) {}

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
      });
  }

  protected async switchLanguage(lang: string): Promise<void> {
    this.currentLanguage = lang;
    localStorage.setItem('app_language', lang);
    this.translate.use(lang);

    const calendarTranslation = await firstValueFrom(this.translate.get('CALENDAR'));
    this.primengConfig.setTranslation(calendarTranslation);
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
    const savedLanguage = localStorage.getItem('app_language');
    const activeLanguage = savedLanguage || this.translate.currentLang || 'th';
    await this.switchLanguage(activeLanguage);
  }

  private getDeepestRoute(route: ActivatedRoute): ActivatedRoute {
    let currentRoute = route;
    while (currentRoute.firstChild) {
      currentRoute = currentRoute.firstChild;
    }
    return currentRoute;
  }
}

