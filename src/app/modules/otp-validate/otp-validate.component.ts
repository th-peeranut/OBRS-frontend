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
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../auth/auth.service';
import { interval, Subscription, takeWhile } from 'rxjs';
import { PrimeNGConfig } from 'primeng/api';
import { OtpService } from '../../services/otp/otp.service';
import {
  LoginOtpVerify,
  OtpRequest,
  OtpVerify,
} from '../../interfaces/otp.interface';

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

  remainingTime: number = 5 * 60;
  displayTime: string = '05:00';
  timerSubscription$: Subscription;

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

  languageOnChange$: Subscription;

  constructor(
    private translate: TranslateService,
    private primengConfig: PrimeNGConfig,
    private renderer: Renderer2,
    private elementRef: ElementRef,
    private fb: FormBuilder,
    private service: AuthService,
    private toastr: ToastrService,
    private router: Router,
    private route: ActivatedRoute,
    private otpService: OtpService,
    private authService: AuthService
  ) {
    const currentLanguage = this.translate.currentLang;
    this.switchLanguage(currentLanguage ? currentLanguage : 'th');
  }

  async ngOnInit() {
    this.option = this.route.snapshot.paramMap.get('option')?.toString();
    this.phoneNo = this.route.snapshot.paramMap.get('phoneno')?.toString();

    if (this.validateRouteError()) {
      this.toastr.error('พบข้อผิดพลาด');
      this.router.navigateByUrl('/home');
    }

    this.sendOtp();
  }

  ngOnDestroy() {
    if (this.timerSubscription$) this.timerSubscription$.unsubscribe();
    if (this.languageOnChange$) this.languageOnChange$.unsubscribe();
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
      this.renderer.listen('document', 'click', (event: Event) =>
        this.handleOutsideClick(event)
      );
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

    this.remainingTime = 5 * 60;
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

    let payload: OtpRequest = { msisdn: this.phoneNo };

    const res = await this.otpService.requestOTP(payload);

    if (res?.code === 200) {
      this.startTimer();
      this.token = res?.data?.token;
    } else {
      this.toastr.error('error');
    }
  }

  async verifyOtp() {
    if (this.otpCode) {
      let payload: OtpVerify = { pin: this.otpCode, token: this.token };

      let resVerify;

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
        if (this.option === 'forget-password') {
          // const res = await this.service.forgetPassword(payload);
        } else if (this.option === 'register') {
          const registerValue = this.service.getRegisterValue();

          console.log(registerValue);
          
          if (registerValue) {
            const resRegister = await this.service.register(registerValue);

            if (resRegister.code === 201) {
              this.toastr.success(
                this.translate.instant('REGISTER.REGISTER_SUCCESS')
              );
              this.router.navigateByUrl('/login');
            } else {
              this.toastr.error(
                this.translate.instant('REGISTER.REGISTER_FAIL')
              );
            }
          }
        } else if (this.option === 'login') {
          this.toastr.success('succ');
          this.router.navigateByUrl('/home');
        }
      } else {
        this.toastr.error('error');
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
