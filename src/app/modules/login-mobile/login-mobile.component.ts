import { Component, ElementRef, Renderer2, ViewChild } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../auth/auth.service';
import { PhoneCodeService } from '../../services/phone-code/phone-code.service';
import { PhoneCode } from '../../interfaces/phone-code.interface';

@Component({
  selector: 'app-login-mobile',
  templateUrl: './login-mobile.component.html',
  styleUrl: './login-mobile.component.scss',
})
export class LoginMobileComponent {
  isDropdownOpen: boolean = false;
  isShowPassword: boolean = false;

  currentLanguage: string = 'th';

  loginForm: FormGroup;

  phoneCodeDropdown: PhoneCode[] = [];

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

  constructor(
    private translate: TranslateService,
    private renderer: Renderer2,
    private elementRef: ElementRef,
    private fb: FormBuilder,
    private service: AuthService,
    private toastr: ToastrService,
    private router: Router,
    private phoneCodeService: PhoneCodeService
  ) {
    this.translate.setDefaultLang('th');
    this.translate.use('th');

    this.getMasterData();

    this.creatForm();
  }

  async getMasterData() {
    this.phoneCodeDropdown = this.phoneCodeService.getPhoneCode();
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

  async login() {
    this.loginForm.markAllAsTouched();

    if (this.loginForm.valid) {
      const payload = this.loginForm.value;
      const res = await this.service.login(payload);

      if (res) {
        this.toastr.success('เข้าสู่ระบบสำเร็จ');
        this.router.navigateByUrl('/home');
      } else {
        this.toastr.error('พบข้อผิดพลาด เข้าสู่ระบบไม่สำเร็จ');
      }
    }
  }

  getFlagImage(phoneCode?: PhoneCode) {
    return phoneCode ? `https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/images/${phoneCode.code}.svg` : "";
  }

  selectPhoneCode(phoneCode: PhoneCode) {
    this.loginForm.patchValue({
      phoneCode: phoneCode.dialCode,
    });
  }

  getCurrentPhoneCode() {
    const formValue = this.loginForm.getRawValue();
    return this.phoneCodeDropdown.find(
      (item) => item.dialCode === formValue.phoneCode
    );
  }
}
