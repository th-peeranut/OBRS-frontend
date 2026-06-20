import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  Renderer2,
  ViewChild,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { PrimeNGConfig } from 'primeng/api';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../auth/auth.service';
import { Router } from '@angular/router';
import { AlertService } from '../../services/alert.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit, OnDestroy {
  isLanguageDropdownOpen: boolean = false;
  isProfileDropdownOpen: boolean = false;

  isShowPassword: boolean = false;

  currentLanguage: string = 'th';

  @ViewChild('languageDropdown', { static: true })
  languageDropdown!: ElementRef;
  @ViewChild('profileDropdown', { static: true }) profileDropdown!: ElementRef;

  isLogin: boolean = false;
  isAdmin: boolean = false;
  isSalesperson: boolean = false;
  isDriver: boolean = false;
  userName: string | null = '';

  languageOnChange$: Subscription;
  authSubscription$: Subscription;
  private unlistenLanguageDropdown?: () => void;
  private unlistenProfileDropdown?: () => void;

  constructor(
    private translate: TranslateService,
    private primengConfig: PrimeNGConfig,
    private renderer: Renderer2,
    private elementRef: ElementRef,
    private authService: AuthService,
    private router: Router,
    private alertService: AlertService
  ) {
    const currentLanguage = this.translate.currentLang;
    this.switchLanguage(currentLanguage ? currentLanguage : 'th');
  }

  ngOnInit(): void {
    this.authSubscription$ = this.authService.authStatus$.subscribe(
      (status) => {
        this.isLogin = status;
        this.isAdmin = status && this.authService.hasAnyRole(['admin']);
        this.isSalesperson = status && this.authService.hasAnyRole(['salesperson']);
        this.isDriver = status && this.authService.hasAnyRole(['driver']);
        this.userName = this.authService.getUsername();
      }
    );
  }

  ngOnDestroy(): void {
    if (this.languageOnChange$) this.languageOnChange$.unsubscribe();
    if (this.authSubscription$) this.authSubscription$.unsubscribe();
    this.unlistenLanguageDropdown?.();
    this.unlistenProfileDropdown?.();
  }

  switchLanguage(lang: string) {
    this.isLanguageDropdownOpen = false;
    this.currentLanguage = lang;
    this.translate.use(lang);
    // Persist so the authInterceptor sends a matching Accept-Language header;
    // otherwise it falls back to 'th' and backend error messages stay Thai.
    localStorage.setItem('app_language', lang);
    this.languageOnChange$ = this.translate
      .get('CALENDAR')
      .subscribe((res) => this.primengConfig.setTranslation(res));
  }

  toggleDropdown() {
    this.isLanguageDropdownOpen = !this.isLanguageDropdownOpen;

    if (this.isLanguageDropdownOpen) {
      this.unlistenLanguageDropdown?.();
      this.unlistenLanguageDropdown = this.renderer.listen('document', 'click', (event: Event) =>
        this.handleLanguageDropdownOutsideClick(event)
      );
    } else {
      this.unlistenLanguageDropdown?.();
      this.unlistenLanguageDropdown = undefined;
    }
  }

  handleLanguageDropdownOutsideClick(event: Event) {
    const targetElement = event.target as HTMLElement;
    const clickedInsideDropdown =
      this.elementRef.nativeElement.contains(targetElement);
    const clickedDropdownButton =
      this.languageDropdown.nativeElement.contains(targetElement);

    if (clickedInsideDropdown && clickedDropdownButton) {
      this.isLanguageDropdownOpen = true;
    } else {
      this.isLanguageDropdownOpen = false;
    }
  }

  toggleProfileDropdown() {
    this.isProfileDropdownOpen = !this.isProfileDropdownOpen;

    if (this.isProfileDropdownOpen) {
      this.unlistenProfileDropdown?.();
      this.unlistenProfileDropdown = this.renderer.listen('document', 'click', (event: Event) =>
        this.handleProfileDropdownOutsideClick(event)
      );
    } else {
      this.unlistenProfileDropdown?.();
      this.unlistenProfileDropdown = undefined;
    }
  }

  handleProfileDropdownOutsideClick(event: Event) {
    const targetElement = event.target as HTMLElement;
    const clickedInsideDropdown =
      this.elementRef.nativeElement.contains(targetElement);
    const clickedDropdownButton =
      this.profileDropdown.nativeElement.contains(targetElement);

    if (clickedInsideDropdown && clickedDropdownButton) {
      this.isProfileDropdownOpen = true;
    } else {
      this.isProfileDropdownOpen = false;
    }
  }

  toggleShowPassword() {
    this.isShowPassword = !this.isShowPassword;
  }

  // The contact details live in the footer, which is rendered as a sibling
  // component on every page that shows the navbar — so scroll to it by id
  // rather than reaching across components with a ViewChild.
  scrollToContact() {
    document
      .getElementById('footer-contact')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async onLogout() {
    this.isProfileDropdownOpen = false;

    this.authService.clearAuthData();
    this.alertService.success(
      this.translate.instant('HOME.NAVBAR.SIGNOUT_SUCCESS')
    );
  }
}
