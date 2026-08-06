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
import { environment } from '../../../../environments/environment';

@Component({
    selector: 'app-navbar',
    templateUrl: './navbar.component.html',
    styleUrl: './navbar.component.scss',
    standalone: false
})
export class NavbarComponent implements OnInit, OnDestroy {
  isProfileDropdownOpen: boolean = false;
  isMobileMenuOpen: boolean = false;

  isShowPassword: boolean = false;

  @ViewChild('profileDropdown') profileDropdown!: ElementRef;
  @ViewChild('hamburgerBtn') hamburgerBtn!: ElementRef;

  isLogin: boolean = false;
  isAdmin: boolean = false;
  isSalesperson: boolean = false;
  isDriver: boolean = false;

  // OBRS-622 go-live scope cut: hides both My Parcels links (desktop profile
  // dropdown + mobile menu) while online consigned-parcel booking is gated
  // off. Single source of truth is environment.features.onlineParcelBooking
  // (environment.base.ts) — flip that one value to re-enable.
  isOnlineParcelBookingEnabled = environment.features.onlineParcelBooking;

  authSubscription$: Subscription;
  private unlistenProfileDropdown?: () => void;
  private unlistenMobileMenu?: () => void;

  constructor(
    private translate: TranslateService,
    private renderer: Renderer2,
    private elementRef: ElementRef,
    private authService: AuthService,
    private router: Router,
    private alertService: AlertService
  ) {}

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
    this.unlistenMobileMenu?.();
  }

  // OBRS-1069: below 992px the whole `.button-container.navbar-desktop-only`
  // block is display:none, which takes the avatar — the only thing on the
  // public navbar that said which account you were on — with it. The mobile
  // panel shows this in full rather than as initials: two accounts whose
  // initials collide (`th.peeranut` / `tanya.pong` → both `TP`) are otherwise
  // indistinguishable. `getUsername()` is the email today (account-page
  // renders it as one); showing a real display name would need a new API call
  // and is a separate card.
  get userEmail(): string {
    return this.authService.getUsername() ?? '';
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
    // The mobile language switcher lives inside the *ngIf panel, so it is
    // destroyed (and cleans up its own listener) when the panel closes.
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
    if (this.isMobileMenuOpen) {
      this.closeMobileMenu();
    }
    // The language switcher closes itself on Escape (own @HostListener).
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
    // navbar lands on the home page (/); the admin shell uses /login.
    await this.router.navigate(['/']);
  }
}
