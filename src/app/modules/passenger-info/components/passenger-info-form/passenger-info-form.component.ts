import { Component } from '@angular/core';
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
import { Observable } from 'rxjs';
import { select, Store } from '@ngrx/store';
import { ScheduleFilter } from '../../../../shared/interfaces/schedule.interface';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';

@Component({
  selector: 'app-passenger-info-form',
  templateUrl: './passenger-info-form.component.html',
  styleUrl: './passenger-info-form.component.scss',
})
export class PassengerInfoFormComponent {
  passengerForm: FormGroup;

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

    this.createForm();

    this.scheduleFilter.subscribe((filter) => {
      for (const { type, count } of filter?.passengerInfo) {
        const n = Math.max(0, Number(count) || 0);
        const isAdult = String(type).toUpperCase() === 'ADULT';

        for (let i = 0; i < n; i++) {
          this.insertPassenger(isAdult);
        }
      }
    });
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
    const passengerForm = this.fb.group({
      isUseAddressInfo: [false],
      isAdult: [isAdult],
      title: ['', Validators.required],
      firstName: ['', Validators.required],
      middleName: [''],
      lastName: ['', Validators.required],
      phoneNumber: ['', [Validators.required]],
      gender: ['', Validators.required],
      isSelectSeat: [false],
      passengerSeat: [''],
    });

    this.passengerData.push(passengerForm);
  }

  deletePassenger(index: number) {
    this.passengerData.removeAt(index);
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
  }
}
