import {
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Dropdown } from '../../../../shared/interfaces/dropdown.interface';
import { Observable, Subject } from 'rxjs';
import { select, Store } from '@ngrx/store';
import { ScheduleFilter } from '../../../../shared/interfaces/schedule.interface';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import { invokeGetPassengerInfo } from '../../../../shared/stores/passenger-info/passenger-info.action';
import { selectPassengerInfo } from '../../../../shared/stores/passenger-info/passenger-info.selector';
import { PassengerInfo } from '../../../../shared/interfaces/passenger-info.interface';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-passenger-info-form',
  templateUrl: './passenger-info-form.component.html',
  styleUrl: './passenger-info-form.component.scss',
})
export class PassengerInfoFormComponent implements OnInit, OnDestroy {
  passengerForm: FormGroup;
  passengerInfo: Observable<PassengerInfo[] | null>;
  private destroy$ = new Subject<void>();
  private isPatchingFromStore = false;
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

  scheduleFilter: Observable<ScheduleFilter>;

  constructor(
    private store: Store,
    private router: Router,
    private fb: FormBuilder,
    private translateService: TranslateService
  ) {
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));
    this.passengerInfo = this.store.pipe(select(selectPassengerInfo));

    this.createForm();
  }

  ngOnInit(): void {
    this.store.dispatch(invokeGetPassengerInfo());

    this.passengerInfo.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      if (data && data.length) {
        this.setPassengerData(data);
        this.emitValidity();
      }
    });

    this.scheduleFilter.pipe(takeUntil(this.destroy$)).subscribe((filter) => {
      if (!filter || this.passengerData.length > 0) {
        return;
      }

      for (const { type, count } of filter?.passengerInfo || []) {
        const n = Math.max(0, Number(count) || 0);
        const isAdult = String(type).toUpperCase() === 'ADULT';

        for (let i = 0; i < n; i++) {
          this.insertPassenger(isAdult);
        }
      }

      this.emitValidity();
    });

    this.passengerForm.statusChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.isPatchingFromStore) {
          return;
        }
        this.emitValidity();
      });

    this.emitValidity();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  createForm() {
    this.passengerForm = this.fb.group({
      passengerData: this.fb.array([]),
    });
  }

  get passengerData() {
    return this.passengerForm.get('passengerData') as FormArray;
  }

  getPassengerControl(index: number, controlName: string) {
    return this.passengerData.at(index).get(controlName) as FormControl;
  }

  insertPassenger(isAdult: boolean = false) {
    const passengerForm = this.createPassengerGroup(isAdult);
    this.passengerData.push(passengerForm);
    this.emitValidity();
  }

  deletePassenger(index: number) {
    this.passengerData.removeAt(index);
    this.emitValidity();
  }

  getFormErrors(
    index: number,
    controlName: string,
    errorName: string
  ): boolean {
    const errors = this.passengerData.at(index).get(controlName)?.errors;

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

  getForm(index: number, controlName: string) {
    return this.passengerData.at(index).get(controlName);
  }

  getFormValue(index: number, controlName: string) {
    return this.passengerData.at(index).get(controlName)?.value;
  }

  setPassengerSeat(index: number, passengerSeat: string) {
    this.passengerData.at(index).get('passengerSeat')?.setValue(passengerSeat);
    this.emitValidity();
  }

  validateAndGetPassengerInfo(): PassengerInfo[] | null {
    if (!this.passengerForm) {
      return null;
    }

    this.passengerForm.markAllAsTouched();
    this.passengerForm.updateValueAndValidity({ emitEvent: false });
    this.emitValidity();

    if (!this.passengerForm.valid || this.passengerData.length === 0) {
      return null;
    }

    return this.buildPassengerInfoPayload();
  }

  private createPassengerGroup(isAdult: boolean = false): FormGroup {
    return this.fb.group({
      isUseAddressInfo: [false],
      isAdult: [isAdult],
      title: [null, Validators.required],
      firstName: ['', Validators.required],
      middleName: [''],
      lastName: ['', Validators.required],
      phoneNumber: ['', [Validators.required]],
      gender: ['', Validators.required],
      isSelectSeat: [false],
      passengerSeat: [''],
    });
  }

  private setPassengerData(passengers: PassengerInfo[]): void {
    this.isPatchingFromStore = true;
    while (this.passengerData.length) {
      this.passengerData.removeAt(0);
    }

    passengers.forEach((passenger) => {
      const group = this.createPassengerGroup(passenger.isAdult);
      group.patchValue({
        ...passenger,
        title: passenger.title,
      });
      this.passengerData.push(group);
    });
    this.isPatchingFromStore = false;
    this.emitValidity();
  }

  private buildPassengerInfoPayload(): PassengerInfo[] {
    return (this.passengerData.getRawValue() || []).map((p) => ({
      ...p,
      title:
        typeof p.title === 'object' && p.title !== null
          ? p.title.id
          : p.title ?? null,
    })) as PassengerInfo[];
  }

  private emitValidity(): void {
    const hasPassenger = this.passengerData?.length > 0;
    const isValid = (this.passengerForm?.valid ?? false) && hasPassenger;
    this.validityChange.emit(isValid);
  }
}
