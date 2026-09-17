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
import { trimmedRequiredValidator } from '../../../../shared/validators/trimmed-required.validator';
import { trimmedLengthValidator } from '../../../../shared/validators/trimmed-length.validator';
import {
  formatThaiMobile,
  separatorTolerantPattern,
  stripPhoneSeparators,
  THAI_MOBILE_PATTERN,
} from '../../../../shared/constants/thai-msisdn';
import {
  isOptionalFieldShown,
  OptionalFieldDisclosure,
} from '../../../../shared/lib/optional-field-disclosure';

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

  // OBRS-1953: the booker's two optional fields sit behind a disclosure link so the
  // first view carries only what a booking actually requires. `undefined` = not yet
  // decided by the traveler; see isOptionalFieldShown() for why that is not `false`.
  private middleNameDisclosure: OptionalFieldDisclosure;
  private emailDisclosure: OptionalFieldDisclosure;

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
      title: [null],
      // OBRS-1952: the rule the server has always enforced. `ContactReqDto` carries
      // `@NotBlank @Size(min = 2, max = 50)` on these three, so a one-character surname
      // passed `Validators.required` here and came back as a 400 whose only visible trace
      // was the generic "ข้อมูลไม่ผ่านการตรวจสอบ" modal — no field named, nothing to fix.
      // Trim-aware on both halves because the payload builder trims before sending.
      // Same triple `account-page.component.ts` already uses for the profile's name fields.
      firstName: ['', [trimmedRequiredValidator, trimmedLengthValidator(2, 50)]],
      middleName: ['', [trimmedLengthValidator(2, 50)]],
      lastName: ['', [trimmedRequiredValidator, trimmedLengthValidator(2, 50)]],
      // OBRS-455: the booking's SMS destination (it becomes contact_phone_snapshot), so it must be
      // a real Thai mobile — a landline here is a reminder/confirmation we pay for and the
      // customer never gets. Was /^0\d{9}$/, which accepted 02...; ContactReqDto now agrees.
      phoneNumber: ['', [Validators.required, separatorTolerantPattern(THAI_MOBILE_PATTERN)]],
      // OBRS-1944: there is deliberately no `gender`/passengerType control on the BOOKER.
      // The booker's value reached no consumer - buildContactPayload sends 7 fields and
      // ContactReqDto has no column for it - so asking for it (monk/nun included, with no
      // consent box beside it) breached data minimisation. The PASSENGER radios are a
      // different field and are live; see passenger-info-form.component.ts.
      //
      // OBRS-858 (ADR-0123 Decision 5): OPTIONAL, but still format-checked when filled.
      // OBRS-238 made it required because emailing the e-ticket was the only way a
      // customer ever saw it again — no address meant no ticket. OBRS-857 made the ticket
      // RETRIEVABLE (/find-booking, booking number + the phone above), so the address is
      // now a convenience rather than the only copy, and requiring it would force a guest
      // with no mailbox to invent one. `Validators.required` is gone from here and from
      // BookingReqDtoValidator in the same card — a field the form lets through and the
      // server 400s is the worst of both.
      email: ['', [Validators.email]],
    });
  }

  getControl(controlName: string): FormControl {
    return this.bookerForm.get(controlName) as FormControl;
  }

  // OBRS-1953. Collapsing only hides — no control is ever cleared or re-validated
  // here, so `middleName` stays untouched and `email` keeps its OBRS-858 format
  // check whether it is on screen or not.
  isMiddleNameShown(): boolean {
    return isOptionalFieldShown(
      this.middleNameDisclosure,
      this.bookerForm.get('middleName')?.value
    );
  }

  toggleMiddleName(): void {
    this.middleNameDisclosure = !this.isMiddleNameShown();
  }

  isEmailShown(): boolean {
    return isOptionalFieldShown(
      this.emailDisclosure,
      this.bookerForm.get('email')?.value
    );
  }

  toggleEmail(): void {
    this.emailDisclosure = !this.isEmailShown();
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
      // OBRS-1944: the booker has no gender/status field any more. The shared
      // PassengerInfo shape still declares one for the passenger rows, so this
      // is a constant placeholder, not a value anyone reads.
      gender: '',
      isSelectSeat: false,
      passengerSeat: '',
      email: raw.email,
    };
  }

  private emitValidity(): void {
    this.validityChange.emit(this.bookerForm?.valid ?? false);
  }
}
