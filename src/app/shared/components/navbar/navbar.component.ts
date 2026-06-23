import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  Renderer2,
  ViewChild,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../auth/auth.service';
import { Router } from '@angular/router';
import { AlertService } from '../../services/alert.service';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit, OnDestroy {
  isProfileDropdownOpen: boolean = false;

  isShowPassword: boolean = false;

  currentLanguage: string = 'th';

  @ViewChild('profileDropdown') profileDropdown!: ElementRef;

  isLogin: boolean = false;
  isAdmin: boolean = false;
  isSalesperson: boolean = false;
  isDriver: boolean = false;

  authSubscription$: Subscription;
  private unlistenProfileDropdown?: () => void;

  constructor(
    private translate: TranslateService,
    private renderer: Renderer2,
    private elementRef: ElementRef,
    private authService: AuthService,
    private router: Router,
    private alertService: AlertService,
    private languageService: LanguageService
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
      }
    );
  }

  ngOnDestroy(): void {
    if (this.authSubscription$) this.authSubscription$.unsubscribe();
    this.unlistenProfileDropdown?.();
  }

  get userInitials(): string {
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

  switchLanguage(lang: string) {
    this.currentLanguage = lang;
    void this.languageService.switch(lang);
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

  // Mirror the admin topbar: Escape closes the open profile menu.
  @HostListener('document:keydown.escape')
  closeProfileDropdownOnEscape() {
    if (this.isProfileDropdownOpen) {
      this.isProfileDropdownOpen = false;
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
