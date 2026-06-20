import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AlertService } from '../../shared/services/alert.service';
import { PrimeNGConfig } from 'primeng/api';
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
export class StaffLayoutComponent implements OnInit {
  protected pageTitleKey = 'STAFF.PAGES.SELL';
  protected readonly pageSubtitleKey = 'STAFF.LAYOUT.SUBTITLE';

  protected currentLanguage = 'th';
  protected isProfileMenuOpen = false;
  protected isSidebarOpen = false;

  protected get navItems(): StaffNavItem[] {
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

    return items;
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
    private readonly primengConfig: PrimeNGConfig,
    private readonly elementRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    void this.setupLanguage();

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
        this.isSidebarOpen = false;
      });
  }

  protected toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.isProfileMenuOpen = false;
    this.isSidebarOpen = false;
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const profile = this.elementRef.nativeElement.querySelector('.staff-profile');
    if (this.isProfileMenuOpen && profile && !profile.contains(event.target as Node)) {
      this.isProfileMenuOpen = false;
    }
  }

  protected async switchLanguage(lang: string): Promise<void> {
    this.currentLanguage = lang;
    localStorage.setItem('app_language', lang);
    this.translate.use(lang);
    const calendarTranslation = await firstValueFrom(this.translate.get('CALENDAR'));
    this.primengConfig.setTranslation(calendarTranslation as Record<string, unknown>);
  }

  protected toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  protected onLogout(): void {
    this.isProfileMenuOpen = false;
    void this.alertService.success(this.translate.instant('STAFF.LAYOUT.LOGOUT_SUCCESS'));
    this.authService.logout();
  }

  private async setupLanguage(): Promise<void> {
    const savedLanguage = localStorage.getItem('app_language');
    const activeLanguage = savedLanguage ?? this.translate.currentLang ?? 'th';
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
