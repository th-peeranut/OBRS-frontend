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
import { AuthService } from '../../../../auth/auth.service';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

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
  userName: string | null = '';

  languageOnChange$: Subscription;
  authSubscription$: Subscription;

  constructor(
    private translate: TranslateService,
    private primengConfig: PrimeNGConfig,
    private renderer: Renderer2,
    private elementRef: ElementRef,
    private authService: AuthService,
    private router: Router,
    private toastr: ToastrService
  ) {
    const currentLanguage = this.translate.currentLang;
    this.switchLanguage(currentLanguage ? currentLanguage : 'th');
  }

  ngOnInit(): void {
    this.authSubscription$ = this.authService.authStatus$.subscribe(
      (status) => {
        this.isLogin = status;
        this.userName = this.authService.getUsername();
      }
    );
  }

  ngOnDestroy(): void {
    if (this.languageOnChange$) this.languageOnChange$.unsubscribe();
    if (this.authSubscription$) this.authSubscription$.unsubscribe();
  }

  switchLanguage(lang: string) {
    this.isLanguageDropdownOpen = false;
    this.currentLanguage = lang;
    this.translate.use(lang);
    this.languageOnChange$ = this.translate
      .get('CALENDAR')
      .subscribe((res) => this.primengConfig.setTranslation(res));
  }

  toggleDropdown() {
    this.isLanguageDropdownOpen = !this.isLanguageDropdownOpen;

    if (this.isLanguageDropdownOpen) {
      this.renderer.listen('document', 'click', (event: Event) =>
        this.handleLanguageDropdownOutsideClick(event)
      );
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
      this.renderer.listen('document', 'click', (event: Event) =>
        this.handleProfileDropdownOutsideClick(event)
      );
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

  async onLogout() {
    // const res = await this.authService.logout(payload);

    // if (res?.code === 200) {
    //   this.toastr.success(this.translate.instant('HOME.SIGNOUT_SUCCESS'));
    // } else {
    //   this.toastr.error(this.translate.instant('HOME.SIGNOUT_FAIL'));
    // }

    this.isProfileDropdownOpen = false;

    this.authService.clearAuthData();
    this.toastr.success(this.translate.instant('HOME.NAVBAR.SIGNOUT_SUCCESS'));
  }
}
