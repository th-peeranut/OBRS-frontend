import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';
import { interval, Subscription, takeWhile } from 'rxjs';
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
  isShowPassword: boolean = false;
  registrationEmailSent: boolean = false;

  option: string | undefined = 'login';

  phoneNo: string | undefined = '';
  otpCode: string = '';
  token: string = '';

  remainingTime: number = 5 * 60;
  displayTime: string = '05:00';
  timerSubscription$: Subscription;

  constructor(
    private translate: TranslateService,
    private fb: FormBuilder,
    private service: AuthService,
    private alertService: AlertService,
    private router: Router,
    private route: ActivatedRoute,
    private otpService: OtpService,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    this.option = this.route.snapshot.paramMap.get('option')?.toString();
    this.phoneNo = this.route.snapshot.paramMap.get('phoneno')?.toString();

    if (this.validateRouteError()) {
      this.alertService.error('พบข้อผิดพลาด');
      this.router.navigateByUrl('/');
    }

    this.sendOtp();
  }

  ngOnDestroy() {
    if (this.timerSubscription$) this.timerSubscription$.unsubscribe();
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

    const payload: OtpRequest = { msisdn: this.phoneNo ?? '' };

    try {
      const res = await this.otpService.requestOTP(payload);

      if (res?.code === 200) {
        this.startTimer();
        this.token = res.data?.token ?? '';
      } else if (typeof res?.code === 'number') {
        this.alertService.error('error');
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
          if (this.option === 'forget-password') {
            // const res = await this.service.forgetPassword(payload);
          } else if (this.option === 'register') {
            const registerValue = this.service.getRegisterValue();
            if (registerValue) {
              const resRegister = await this.service.register(registerValue);

              if (resRegister?.code === 201) {
                this.service.clearRegisterValue();
                this.registrationEmailSent = true;
              } else if (typeof resRegister?.code === 'number') {
                this.alertService.error(
                  this.translate.instant('REGISTER.REGISTER_FAIL')
                );
              }
            }
          } else if (this.option === 'login') {
            this.alertService.success('succ');
            await this.authService.navigateAfterLogin('/');
          }
        } else if (typeof resVerify?.code === 'number') {
          this.alertService.error('error');
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
