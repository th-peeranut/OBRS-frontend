import {
  Component,
  ElementRef,
  OnDestroy,
  Renderer2,
  ViewChild,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../auth/auth.service';
import { Router } from '@angular/router';
import { PrimeNGConfig } from 'primeng/api';
import {
  debounceTime,
  distinctUntilChanged,
  Subscription,
  switchMap,
} from 'rxjs';
import { UserService } from '../../services/user/user.service';
import { REGISTER_OPTION } from '../../shared/enum/register-option.enum';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements OnDestroy {
  isDropdownOpen: boolean = false;
  isShowPassword: boolean = false;
  isShowConfirmPassword: boolean = false;

  currentLanguage: string = 'th';

  registerForm: FormGroup;

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

  languageOnChange$: Subscription;

  usernameSubscription$?: Subscription;
  emailSubscription$?: Subscription;
  phoneNumberSubscription$?: Subscription;

  usernameIsExist: boolean = false;
  emailIsExist: boolean = false;
  phoneNumberIsExist: boolean = false;

  constructor(
    private translate: TranslateService,
    private primengConfig: PrimeNGConfig,
    private renderer: Renderer2,
    private elementRef: ElementRef,
    private fb: FormBuilder,
    private service: AuthService,
    private toastr: ToastrService,
    private usersService: UserService,
    private router: Router
  ) {
    const currentLanguage = this.translate.currentLang;
    this.switchLanguage(currentLanguage ? currentLanguage : 'th');

    this.createForm();
  }

  ngOnDestroy(): void {
    if (this.languageOnChange$) this.languageOnChange$.unsubscribe();

    if (this.usernameSubscription$) this.usernameSubscription$.unsubscribe();
    if (this.emailSubscription$) this.emailSubscription$.unsubscribe();
    if (this.phoneNumberSubscription$)
      this.phoneNumberSubscription$.unsubscribe();
  }

  createForm() {
    this.registerForm = this.fb.group({
      firstName: ['', Validators.required],
      middleName: [''],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', [Validators.required]],
      username: ['', Validators.required],
      password: ['', Validators.required],
      confirmPassword: ['', Validators.required],
      isPhoneNumberVerify: false,
    });

    this.emailSubscription$ = this.registerForm.get('email')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(value => this.checkDuplicateData(value, REGISTER_OPTION.EMAIL))
      )
      .subscribe();

    this.phoneNumberSubscription$ = this.registerForm.get('phoneNumber')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(value => this.checkDuplicateData(value, REGISTER_OPTION.PHONENUMBER))
      )
      .subscribe();

    this.usernameSubscription$ = this.registerForm.get('username')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(value => this.checkDuplicateData(value, REGISTER_OPTION.USERNAME))
      )
      .subscribe();
  }

  getForm(controlName: string) {
    return this.registerForm.get(controlName);
  }

  getFormValue(controlName: string) {
    return this.registerForm.getRawValue()[controlName];
  }

  getFormErrors(controlName: string, errorName: string): boolean {
    const errors = this.registerForm.get(controlName)?.errors;

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

  toggleShowConfirmPassword() {
    this.isShowConfirmPassword = !this.isShowConfirmPassword;
  }

  checkSamePassword() {
    const formValue = this.registerForm.getRawValue();
    const password = formValue.password;
    const confirmPassword = formValue.confirmPassword;

    return password && confirmPassword && password === confirmPassword;
  }

  async register() {
    this.registerForm.markAllAsTouched();

    if (!this.checkSamePassword()) {
      this.toastr.error('พบข้อผิดพลาด กรุณากรอกรหัสผ่านให้เหมือนกัน');
    }

    if (
      this.registerForm.valid &&
      this.checkSamePassword() &&
      !this.usernameIsExist &&
      !this.emailIsExist &&
      !this.phoneNumberIsExist
    ) {
      const formValue = this.registerForm.getRawValue();

      this.service.setRegisterValue(formValue);

      this.router.navigate(['/otp', 'register', formValue.phoneNumber]);
    }
  }

  async checkDuplicateData(value: string, option: number) {
    if (!value) return;

    let res: any = null;

    if (option === REGISTER_OPTION.USERNAME) {
      res = await this.usersService.checkExistUsername(value);
    } else if (option === REGISTER_OPTION.EMAIL) {
      res = await this.usersService.checkExistEmail(value);
    } else if (option === REGISTER_OPTION.PHONENUMBER) {
      res = await this.usersService.checkExistPhoneNumber(value);
    }

    if (res?.code === 200) {
      if (option === REGISTER_OPTION.USERNAME) {
        this.usernameIsExist = res?.data;
      } else if (option === REGISTER_OPTION.EMAIL) {
        this.emailIsExist = res?.data;
      } else if (option === REGISTER_OPTION.PHONENUMBER) {
        this.phoneNumberIsExist = res?.data;
      }
    }
  }
}
