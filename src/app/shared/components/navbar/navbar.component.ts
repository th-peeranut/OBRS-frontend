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

interface LanguageOption {
  code: string;
  endonym: string;
  /** i18n key for the item's aria-label, e.g. HOME.NAVBAR.LANGUAGE_EN */
  ariaKey: string;
}

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit, OnDestroy {
  isProfileDropdownOpen: boolean = false;
  isLangDropdownOpen: boolean = false;
  isMobileMenuOpen: boolean = false;

  isShowPassword: boolean = false;

  currentLanguage: string = 'th';

  /** Static language list — endonyms are intentionally locale-invariant. */
  readonly languages: LanguageOption[] = [
    { code: 'en', endonym: 'English', ariaKey: 'HOME.NAVBAR.LANGUAGE_EN' },
    { code: 'th', endonym: 'ไทย', ariaKey: 'HOME.NAVBAR.LANGUAGE_TH' },
    { code: 'zh', endonym: '中文', ariaKey: 'HOME.NAVBAR.LANGUAGE_ZH' },
  ];

  @ViewChild('profileDropdown') profileDropdown!: ElementRef;
  @ViewChild('hamburgerBtn') hamburgerBtn!: ElementRef;

  isLogin: boolean = false;
  isAdmin: boolean = false;
  isSalesperson: boolean = false;
  isDriver: boolean = false;

  authSubscription$: Subscription;
  private unlistenProfileDropdown?: () => void;
  private unlistenLangDropdown?: () => void;
  private unlistenMobileMenu?: () => void;

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
    this.unlistenLangDropdown?.();
    this.unlistenMobileMenu?.();
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

  get currentEndonym(): string {
    return this.languages.find((l) => l.code === this.currentLanguage)?.endonym ?? this.currentLanguage;
  }

  switchLanguage(lang: string) {
    this.currentLanguage = lang;
    void this.languageService.switch(lang);
  }

  selectLanguage(lang: string) {
    this.switchLanguage(lang);
    this.closeLangDropdown();
    // Language selection does NOT close the mobile menu — the sub-dropdown
    // closes on its own; the user stays in the panel to see the updated label.
  }

  // ── Language dropdown ───────────────────────────────────────────────────────

  toggleLangDropdown() {
    this.isLangDropdownOpen = !this.isLangDropdownOpen;

    if (this.isLangDropdownOpen) {
      this.unlistenLangDropdown?.();
      this.unlistenLangDropdown = this.renderer.listen('document', 'click', (event: Event) =>
        this.handleLangDropdownOutsideClick(event)
      );
    } else {
      this.closeLangDropdown();
    }
  }

  closeLangDropdown() {
    this.isLangDropdownOpen = false;
    this.unlistenLangDropdown?.();
    this.unlistenLangDropdown = undefined;
  }

  handleLangDropdownOutsideClick(event: Event) {
    const targetElement = event.target as HTMLElement;
    // The language switcher template is rendered into BOTH the desktop bar and
    // the mobile panel, so a single @ViewChild ref cannot identify "the" trigger
    // (it would resolve to the first/hidden instance). Match by class instead so
    // a click on EITHER switcher instance counts as inside the trigger.
    const clickedTriggerButton = !!targetElement.closest('.navbar-lang-dropdown');

    if (clickedTriggerButton) {
      this.isLangDropdownOpen = true;
    } else {
      this.isLangDropdownOpen = false;
      this.unlistenLangDropdown?.();
      this.unlistenLangDropdown = undefined;
    }
  }

  // ── Mobile hamburger menu ───────────────────────────────────────────────────

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;

    if (this.isMobileMenuOpen) {
      this.unlistenMobileMenu?.();
      this.unlistenMobileMenu = this.renderer.listen('document', 'click', (event: Event) =>
        this.handleMobileMenuOutsideClick(event)
      );
    } else {
      this.closeMobileMenu();
    }
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
    this.unlistenMobileMenu?.();
    this.unlistenMobileMenu = undefined;
    // Also close the language sub-dropdown when the panel closes.
    this.closeLangDropdown();
  }

  handleMobileMenuOutsideClick(event: Event) {
    const targetElement = event.target as HTMLElement;
    const clickedInsideComponent = this.elementRef.nativeElement.contains(targetElement);

    if (!clickedInsideComponent) {
      this.closeMobileMenu();
    }
  }

  // ── Profile dropdown ────────────────────────────────────────────────────────

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

  // Mirror the admin topbar: Escape closes any open overlay.
  @HostListener('document:keydown.escape')
  closeDropdownsOnEscape() {
    if (this.isProfileDropdownOpen) {
      this.isProfileDropdownOpen = false;
      this.unlistenProfileDropdown?.();
      this.unlistenProfileDropdown = undefined;
    }
    if (this.isLangDropdownOpen) {
      this.closeLangDropdown();
    }
    if (this.isMobileMenuOpen) {
      this.closeMobileMenu();
    }
  }

  /** @deprecated Use closeDropdownsOnEscape — kept for test backward-compat. */
  closeProfileDropdownOnEscape() {
    this.closeDropdownsOnEscape();
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

  /** Close the mobile menu then scroll to the contact section. */
  mobileScrollToContact() {
    this.closeMobileMenu();
    this.scrollToContact();
  }

  async onLogout() {
    this.isProfileDropdownOpen = false;
    this.isMobileMenuOpen = false;

    this.authService.clearAuthData();
    this.alertService.success(
      this.translate.instant('HOME.NAVBAR.SIGNOUT_SUCCESS')
    );
    // Mirror the admin topbar: signing out navigates away rather than
    // leaving the user on the current (possibly auth-gated) page. The public
    // navbar lands on /home; the admin shell uses /login.
    await this.router.navigate(['/home']);
  }
}
