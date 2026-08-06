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
import { apiErrorCode, resolveApiAlertMessage } from '../../shared/lib/api-error';

@Component({
    selector: 'app-otp-validate',
    templateUrl: './otp-validate.component.html',
    styleUrl: './otp-validate.component.scss',
    standalone: false
})
export class OtpValidateComponent implements OnInit, OnDestroy {
  isShowPassword: boolean = false;

  option: string | undefined = 'login';

  phoneNo: string | undefined = '';
  otpCode: string = '';
  token: string = '';

  /**
   * OBRS-1072: the backend refused to text this number because no account uses
   * it. Swaps the PIN form for the two exits this screen never had — sign up, or
   * fix the number — instead of leaving the passenger on a code entry for a code
   * that was deliberately never sent.
   */
  phoneNotRegistered: boolean = false;

  remainingTime: number = 5 * 60;
  displayTime: string = '05:00';
  timerSubscription$: Subscription;

  // OBRS-613: `service` (a second AuthService injection alongside `authService`) went
  // with the empty 'forget-password' branch that was its only reader.
  constructor(
    private translate: TranslateService,
    private fb: FormBuilder,
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
      this.alertService.error(
        this.translate.instant('LOGIN_BY_PHONE_NO.ROUTE_ERROR')
      );
      this.router.navigateByUrl('/');
      // OBRS-605: the redirect used to fall through to sendOtp(), so a rejected route still
      // billed an SMS. Now that /otp/register/<phone> is a rejected route, that mattered.
      return;
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
    this.phoneNotRegistered = false;

    const payload: OtpRequest = { msisdn: this.phoneNo ?? '' };

    try {
      const res = await this.otpService.requestOTP(payload);

      if (res?.code === 200) {
        this.startTimer();
        this.token = res.data?.token ?? '';
      } else if (typeof res?.code === 'number') {
        this.alertService.error(
          this.translate.instant('LOGIN_BY_PHONE_NO.OTP_REQUEST_FAILED')
        );
      }
    } catch (error: unknown) {
      // OBRS-1072: this one request opts out of the global error toast (see
      // OtpService.requestOTP), so the two arms below are what the user sees.
      if (apiErrorCode(error) === 'OTP_SEND_PHONE_NOT_REGISTERED') {
        this.phoneNotRegistered = true;
        return;
      }
      // Every other failure keeps the interceptor's exact wording, resolved by
      // the interceptor's own helper rather than a second copy of the rule.
      this.alertService.error(
        resolveApiAlertMessage(error, (key) => this.translate.instant(key))
      );
    }
  }

  /** OBRS-1072 exit 1: the number has no account, so offer the thing that creates one. */
  goToRegister() {
    this.router.navigateByUrl('/register');
  }

  /**
   * OBRS-1072 exit 2: back to the number entry. Deliberately NOT history.back() —
   * this screen is routinely arrived at by a fresh URL (and the rejection replaces
   * a page that already navigated), so "back" is not reliably the phone form.
   */
  goToEditPhoneNumber() {
    this.router.navigateByUrl('/login-mobile');
  }

  async verifyOtp() {
    if (this.otpCode) {
      const payload: OtpVerify = { pin: this.otpCode, token: this.token };

      let resVerify;

      try {
        // OBRS-613: 'login' is the only option left, so this is no longer a branch. The
        // other arm called OtpService.verifyOTP, whose result nothing read - the
        // 'forget-password' case below it was an empty block, so verifying a PIN there
        // did nothing at all - and password reset is an emailed-token flow, not an OTP one.
        const loginPayload: LoginOtpVerify = {
          ...payload,
          phoneNumber: this.phoneNo ? this.phoneNo : '',
        };

        resVerify = await this.authService.loginWithOtp(loginPayload);

        if (resVerify?.code === 200) {
          this.alertService.success(
            this.translate.instant('LOGIN_BY_PHONE_NO.LOGIN_SUCCESS')
          );
          await this.authService.navigateAfterLogin();
        } else if (typeof resVerify?.code === 'number') {
          this.alertService.error(
            this.translate.instant('LOGIN_BY_PHONE_NO.OTP_VERIFY_FAILED')
          );
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
      // This screen serves phone LOGIN and nothing else. 'register' went in OBRS-605
      // (signup never needed an OTP) and 'forget-password' in OBRS-613 (reset is an
      // emailed-token flow). Both now fail this check and redirect to '/'.
      this.option !== 'login'
    );
  }
}
