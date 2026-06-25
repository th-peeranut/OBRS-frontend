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

  isShowPassword: boolean = false;

  currentLanguage: string = 'th';

  /** Static language list — endonyms are intentionally locale-invariant. */
  readonly languages: LanguageOption[] = [
    { code: 'en', endonym: 'English', ariaKey: 'HOME.NAVBAR.LANGUAGE_EN' },
    { code: 'th', endonym: 'ไทย', ariaKey: 'HOME.NAVBAR.LANGUAGE_TH' },
    { code: 'zh', endonym: '中文', ariaKey: 'HOME.NAVBAR.LANGUAGE_ZH' },
  ];

  @ViewChild('profileDropdown') profileDropdown!: ElementRef;
  @ViewChild('langDropdown') langDropdown!: ElementRef;

  isLogin: boolean = false;
  isAdmin: boolean = false;
  isSalesperson: boolean = false;
  isDriver: boolean = false;

  authSubscription$: Subscription;
  private unlistenProfileDropdown?: () => void;
  private unlistenLangDropdown?: () => void;

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
    const clickedInsideDropdown = this.elementRef.nativeElement.contains(targetElement);
    const clickedTriggerButton = this.langDropdown?.nativeElement.contains(targetElement);

    if (clickedInsideDropdown && clickedTriggerButton) {
      this.isLangDropdownOpen = true;
    } else {
      this.isLangDropdownOpen = false;
      this.unlistenLangDropdown?.();
      this.unlistenLangDropdown = undefined;
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

  // Mirror the admin topbar: Escape closes any open dropdown menu.
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

  async onLogout() {
    this.isProfileDropdownOpen = false;

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
