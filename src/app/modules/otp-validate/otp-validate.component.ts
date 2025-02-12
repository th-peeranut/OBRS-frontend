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

@Component({
  selector: 'app-otp-validate',
  templateUrl: './otp-validate.component.html',
  styleUrl: './otp-validate.component.scss',
})
export class OtpValidateComponent implements OnInit, OnDestroy {
  isDropdownOpen: boolean = false;
  isShowPassword: boolean = false;

  currentLanguage: string = 'th';

  loginForm: FormGroup;

  option: string | undefined = 'login';
  phoneNo: string | undefined = '';
  otpCode: string = '';
  otpRef: string = '';

  remainingTime: number = 5 * 60; // 5 minutes in seconds
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
    private route: ActivatedRoute
  ) {
    const currentLanguage = this.translate.currentLang;
    this.switchLanguage(currentLanguage ? currentLanguage : 'th');
    
    this.creatForm();
  }

  ngOnInit() {
    this.option = this.route.snapshot.paramMap.get('option')?.toString();
    this.phoneNo = this.route.snapshot.paramMap.get('phoneno')?.toString();
    
    if (this.validateRouteError()) {
      this.toastr.error('พบข้อผิดพลาด');
      this.router.navigateByUrl('/home');
    }

    this.startTimer();
  }

  ngOnDestroy() {
    if (this.timerSubscription$) this.timerSubscription$.unsubscribe();
    if (this.languageOnChange$) this.languageOnChange$.unsubscribe();
  }

  creatForm() {
    this.loginForm = this.fb.group({
      phoneCode: ['', Validators.required],
      phoneNo: ['', Validators.required],
    });
  }

  getForm(controlName: string) {
    return this.loginForm.get(controlName);
  }

  getFormValue(controlName: string) {
    return this.loginForm.getRawValue()[controlName];
  }

  getFormErrors(controlName: string, errorName: string): boolean {
    const errors = this.loginForm.get(controlName)?.errors;

    if (!errors) {
      return false;
    }

    if (errorName === 'maxLength' && errors['maxlength']) {
      const maxLength = errors['maxlength'].requiredLength;
      const actualLength = errors['maxlength'].actualLength;
      return actualLength > maxLength;
    }

    return !!errors[errorName];
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

  async login() {
    this.loginForm.markAllAsTouched();

    if (this.loginForm.valid) {
      const payload = this.loginForm.value;
      
      if(this.option === "login"){
        const res = await this.service.loginByPhoneNo(payload);
      }else{
        const res = await this.service.forgetPassword(payload);
      }

      // if (res?.code === "200") {
      //   this.toastr.success('เข้าสู่ระบบสำเร็จ');
      //   this.router.navigateByUrl('/home');
      // } else {
      //   this.toastr.error('พบข้อผิดพลาด เข้าสู่ระบบไม่สำเร็จ');
      // }
    }
  }

  async resendOTP() {
    if (this.timerSubscription$) this.timerSubscription$.unsubscribe();

    this.remainingTime = 5 * 60;
    this.displayTime = '05:00';
    this.startTimer();

    const payload = this.loginForm.value;
    const res = await this.service.resendOTP(payload);
  }

  validateRouteError() {
    return !this.phoneNo || !this.option || (this.option !== "login" && this.option !== "forget-password")
  }
}
