import {
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';
import { TITLE_OPTIONS } from '../../../../shared/constants/title-options';
import { PassengerInfo } from '../../../../shared/interfaces/passenger-info.interface';
import {
  formatThaiMobile,
  separatorTolerantPattern,
  stripPhoneSeparators,
  THAI_MOBILE_PATTERN,
} from '../../../../shared/constants/thai-msisdn';

@Component({
    selector: 'app-booker-info-form',
    templateUrl: './booker-info-form.component.html',
    styleUrl: './booker-info-form.component.scss',
    standalone: false
})
export class BookerInfoFormComponent implements OnInit, OnDestroy {
  bookerForm: FormGroup;
  private destroy$ = new Subject<void>();
  @Output() validityChange = new EventEmitter<boolean>();

  titleOptions: Dropdown[] = [...TITLE_OPTIONS];

  constructor(private fb: FormBuilder) {
    this.createForm();
  }

  ngOnInit(): void {
    this.bookerForm.statusChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.emitValidity());

    this.emitValidity();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  createForm() {
    this.bookerForm = this.fb.group({
      title: [null, Validators.required],
      firstName: ['', Validators.required],
      middleName: [''],
      lastName: ['', Validators.required],
      // OBRS-455: the booking's SMS destination (it becomes contact_phone_snapshot), so it must be
      // a real Thai mobile — a landline here is a reminder/confirmation we pay for and the
      // customer never gets. Was /^0\d{9}$/, which accepted 02...; ContactReqDto now agrees.
      phoneNumber: ['', [Validators.required, separatorTolerantPattern(THAI_MOBILE_PATTERN)]],
      // NOT a display-only field, despite the name. `gender` is this form's local
      // name for the wire's `passengerType`: PassengerInfoComponent renames it at
      // the payload boundary (normalizePassengerType) and the backend persists it
      // on ticket.passenger_type_id + passenger_type_snapshot, whence it reaches
      // the e-ticket and the confirmation email. An OBRS-628 audit grepped the
      // backend for "gender", found nothing, and concluded the radios were dead
      // and should be deleted under PDPA data minimisation - they are not.
      gender: ['', Validators.required],
      // OBRS-238: ONLINE bookings require a contact email (e-ticket delivery +
      // BookingReqDtoValidator 400s without one) — required + format-checked,
      // unlike the staff walk-in contact form where it stays optional (OBRS-197).
      email: ['', [Validators.required, Validators.email]],
    });
  }

  getControl(controlName: string): FormControl {
    return this.bookerForm.get(controlName) as FormControl;
  }

  // OBRS-691: same focus/blur regrouping idiom as account-page.component.ts.
  // buildBookerPayload() below always strips dashes before the value reaches
  // getCurrentBooker()/validateAndGetBooker() callers.
  onPhoneFocus(): void {
    const control = this.bookerForm.get('phoneNumber');
    control?.setValue(stripPhoneSeparators(control.value));
  }

  onPhoneBlur(): void {
    const control = this.bookerForm.get('phoneNumber');
    control?.setValue(formatThaiMobile(control.value));
  }

  getFormErrors(controlName: string, errorName: string): boolean {
    const errors = this.bookerForm.get(controlName)?.errors;
    return !!errors && !!errors[errorName];
  }

  getCurrentBooker(): PassengerInfo | null {
    if (!this.bookerForm) {
      return null;
    }

    return this.buildBookerPayload();
  }

  validateAndGetBooker(): PassengerInfo | null {
    if (!this.bookerForm) {
      return null;
    }

    this.bookerForm.markAllAsTouched();
    this.bookerForm.updateValueAndValidity({ emitEvent: false });
    this.emitValidity();

    if (!this.bookerForm.valid) {
      return null;
    }

    return this.buildBookerPayload();
  }

  private buildBookerPayload(): PassengerInfo {
    const raw = this.bookerForm.getRawValue();
    const title =
      typeof raw.title === 'object' && raw.title !== null
        ? raw.title.id
        : raw.title ?? null;

    return {
      isAdult: true,
      title,
      firstName: raw.firstName,
      middleName: raw.middleName,
      lastName: raw.lastName,
      // OBRS-691: the control may carry display dashes (regrouped on blur) —
      // every downstream consumer of this payload needs bare digits.
      phoneNumber: stripPhoneSeparators(raw.phoneNumber),
      gender: raw.gender,
      isSelectSeat: false,
      passengerSeat: '',
      email: raw.email,
    };
  }

  private emitValidity(): void {
    this.validityChange.emit(this.bookerForm?.valid ?? false);
  }
}
