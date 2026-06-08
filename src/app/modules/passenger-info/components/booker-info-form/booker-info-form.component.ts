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
import { PassengerInfo } from '../../../../shared/interfaces/passenger-info.interface';

@Component({
  selector: 'app-booker-info-form',
  templateUrl: './booker-info-form.component.html',
  styleUrl: './booker-info-form.component.scss',
})
export class BookerInfoFormComponent implements OnInit, OnDestroy {
  bookerForm: FormGroup;
  private destroy$ = new Subject<void>();
  @Output() validityChange = new EventEmitter<boolean>();

  titleOptions: Dropdown[] = [
    {
      id: 1,
      nameThai: 'นาย',
      nameEnglish: 'Mr.',
      isDefault: true,
    },
    {
      id: 2,
      nameThai: 'นางสาว',
      nameEnglish: 'Miss',
    },
    {
      id: 3,
      nameThai: 'นาง',
      nameEnglish: 'Mrs.',
    },
    {
      id: 4,
      nameThai: 'เด็กชาย',
      nameEnglish: 'Master',
    },
    {
      id: 5,
      nameThai: 'เด็กหญิง',
      nameEnglish: 'Miss (Child)',
    },
    {
      id: 6,
      nameThai: 'ดร.',
      nameEnglish: 'Dr.',
    },
    {
      id: 7,
      nameThai: 'ศ.',
      nameEnglish: 'Professor',
    },
    {
      id: 8,
      nameThai: 'รศ.',
      nameEnglish: 'Associate Professor',
    },
    {
      id: 9,
      nameThai: 'ผศ.',
      nameEnglish: 'Assistant Professor',
    },
  ];

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
      phoneNumber: ['', [Validators.required, Validators.pattern(/^0\d{9}$/)]],
      gender: ['', Validators.required],
    });
  }

  getControl(controlName: string): FormControl {
    return this.bookerForm.get(controlName) as FormControl;
  }

  getFormErrors(controlName: string, errorName: string): boolean {
    const errors = this.bookerForm.get(controlName)?.errors;
    return !!errors && !!errors[errorName];
  }

  patchBooker(data: PassengerInfo): void {
    if (!this.bookerForm || !data) {
      return;
    }

    this.bookerForm.patchValue({
      title: data.title,
      firstName: data.firstName ?? '',
      middleName: data.middleName ?? '',
      lastName: data.lastName ?? '',
      phoneNumber: data.phoneNumber ?? '',
      gender: data.gender ?? '',
    });
    this.bookerForm.markAllAsTouched();
    this.emitValidity();
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
      phoneNumber: raw.phoneNumber,
      gender: raw.gender,
      isSelectSeat: false,
      passengerSeat: '',
    };
  }

  private emitValidity(): void {
    this.validityChange.emit(this.bookerForm?.valid ?? false);
  }
}
