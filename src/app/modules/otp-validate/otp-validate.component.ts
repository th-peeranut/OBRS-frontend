import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  Renderer2,
  ViewChild,
} from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';
import { interval, Subscription, takeWhile } from 'rxjs';
import { PrimeNGConfig } from 'primeng/api';
import { OtpService } from '../../services/otp/otp.service';
import {
  LoginOtpVerify,
  OtpRequest,
  OtpVerify,
} from '../../shared/interfaces/otp.interface';
import { AlertService } from '../../shared/services/alert.service';

@Component({
  selector: 'app-otp-validate',
  templateUrl: './otp-validate.component.html',
  styleUrl: './otp-validate.component.scss',
})
export class OtpValidateComponent implements OnInit, OnDestroy {
  isDropdownOpen: boolean = false;
  isShowPassword: boolean = false;

  currentLanguage: string = 'th';

  option: string | undefined = 'login';

  phoneNo: string | undefined = '';
  otpCode: string = '';
  token: string = '';

  private readonly otpCountdownSeconds = 5 * 60;
  remainingTime: number = this.otpCountdownSeconds;
  displayTime: string = '05:00';
  timerSubscription$: Subscription;

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

  languageOnChange$: Subscription;
  private unlistenDropdown?: () => void;

  constructor(
    private translate: TranslateService,
    private primengConfig: PrimeNGConfig,
    private renderer: Renderer2,
    private elementRef: ElementRef,
    private fb: FormBuilder,
    private alertService: AlertService,
    private router: Router,
    private route: ActivatedRoute,
    private otpService: OtpService,
    private authService: AuthService
  ) {
    const currentLanguage = this.translate.currentLang;
    this.switchLanguage(currentLanguage ? currentLanguage : 'th');
  }

  async ngOnInit(): Promise<void> {
    this.option = this.route.snapshot.paramMap.get('option')?.toString();
    this.phoneNo = this.route.snapshot.paramMap.get('phoneno')?.toString();

    if (this.validateRouteError()) {
      this.alertService.error(this.translate.instant('LOGIN_BY_PHONE_NO.ROUTE_ERROR'));
      this.router.navigateByUrl('/home');
    }

    this.sendOtp();
  }

  ngOnDestroy() {
    if (this.timerSubscription$) this.timerSubscription$.unsubscribe();
    if (this.languageOnChange$) this.languageOnChange$.unsubscribe();
    this.unlistenDropdown?.();
  }

  switchLanguage(lang: string) {
    this.isDropdownOpen = false;
    this.currentLanguage = lang;
    this.translate.use(lang);
    this.languageOnChange$ = this.translate
      .get('CALENDAR')
      .subscribe((res) => this.primengConfig.setTranslation(res));
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;

    if (this.isDropdownOpen) {
      this.unlistenDropdown?.();
      this.unlistenDropdown = this.renderer.listen('document', 'click', (event: Event) =>
        this.handleOutsideClick(event)
      );
    } else {
      this.unlistenDropdown?.();
      this.unlistenDropdown = undefined;
    }
  }

  handleOutsideClick(event: Event) {
    const targetElement = event.target as HTMLElement;
    const clickedInsideDropdown =
      this.elementRef.nativeElement.contains(targetElement);
    const clickedDropdownButton =
      this.dropdownButton.nativeElement.contains(targetElement);

    if (clickedInsideDropdown && clickedDropdownButton) {
      this.isDropdownOpen = true;
    } else {
      this.isDropdownOpen = false;
    }
  }

  toggleShowPassword() {
    this.isShowPassword = !this.isShowPassword;
  }

  startTimer(): void {
    if (this.timerSubscription$) this.timerSubscription$.unsubscribe();

    this.remainingTime = this.otpCountdownSeconds;
    this.displayTime = '05:00';

    this.timerSubscription$ = interval(1000)
      .pipe(takeWhile(() => this.remainingTime > 0))
      .subscribe(() => {
        this.remainingTime--;
        this.updateDisplayTime();
      });
  }

  updateDisplayTime(): void {
    const minutes = Math.floor(this.remainingTime / 60);
    const seconds = this.remainingTime % 60;
    this.displayTime = `${this.padZero(minutes)}:${this.padZero(seconds)}`;
  }

  padZero(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
  }

  setOTPCode(otpCode: string) {
    this.otpCode = otpCode;
  }

  async sendOtp() {
    this.token = '';

    const payload: OtpRequest = { msisdn: this.phoneNo ?? '' };

    try {
      const res = await this.otpService.requestOTP(payload);

      if (res?.code === 200) {
        this.startTimer();
        this.token = res.data?.token ?? '';
      } else if (typeof res?.code === 'number') {
        this.alertService.error(this.translate.instant('LOGIN_BY_PHONE_NO.OTP_REQUEST_FAILED'));
      }
    } catch {
      // Error alert is handled by the global interceptor.
    }
  }

  async verifyOtp() {
    if (this.otpCode) {
      const payload: OtpVerify = { pin: this.otpCode, token: this.token };

      let resVerify;

      try {
        if (this.option === 'login') {
          const loginPayload: LoginOtpVerify = {
            ...payload,
            phoneNumber: this.phoneNo ? this.phoneNo : '',
          };

          resVerify = await this.authService.loginWithOtp(loginPayload);
        } else {
          resVerify = await this.otpService.verifyOTP(payload);
        }

        if (resVerify?.code === 200) {
          if (this.option === 'register') {
            const registerValue = this.authService.getRegisterValue();
            if (registerValue) {
              const resRegister = await this.authService.register(registerValue);

              if (resRegister?.code === 201) {
                this.alertService.success(
                  this.translate.instant('REGISTER.REGISTER_SUCCESS')
                );
                this.authService.clearRegisterValue();
                this.router.navigateByUrl('/login');
              } else if (typeof resRegister?.code === 'number') {
                this.alertService.error(
                  this.translate.instant('REGISTER.REGISTER_FAIL')
                );
              }
            }
          } else if (this.option === 'login') {
            this.alertService.success(this.translate.instant('LOGIN_BY_PHONE_NO.LOGIN_SUCCESS'));
            await this.authService.navigateAfterLogin('/home');
          }
        } else if (typeof resVerify?.code === 'number') {
          this.alertService.error(this.translate.instant('LOGIN_BY_PHONE_NO.OTP_VERIFY_FAILED'));
        }
      } catch {
        // Error alert is handled by the global interceptor.
      }
    }
  }

  validateRouteError() {
    return (
      !this.phoneNo ||
      !this.option ||
      (this.option !== 'login' &&
        this.option !== 'forget-password' &&
        this.option !== 'register')
    );
  }
}
