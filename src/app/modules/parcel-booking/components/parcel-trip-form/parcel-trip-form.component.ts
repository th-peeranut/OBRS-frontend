import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { StationApi } from '../../../../shared/interfaces/station.interface';

export interface ParcelScheduleOption {
  id: number;
  label: string;
}

export interface ParcelTripFormValue {
  fromStationId: number;
  toStationId: number;
  date: Date;
  scheduleId: number;
}

/** Mirrors the staff `parcel-consign-form`'s all-or-none-style custom
 * validator convention, applied here to "from must differ from to". */
function stationsDifferValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const from = group.get('fromStationId')?.value;
    const to = group.get('toStationId')?.value;
    if (from === null || from === undefined || from === '' || to === null || to === undefined || to === '') {
      return null;
    }
    return Number(from) === Number(to) ? { stationsSame: true } : null;
  };
}

/**
 * Dumb form: phase 1 (Trip) of the parcel booking wizard — UX-OBRS-415 §4.1.
 * Reuses the CUSTOMER-shell station pickers (`app-dropdown-group-obrs`) —
 * NOT `app-admin-dropdown` (scoped to admin-styled forms, design-system §3.1)
 * — exactly like `home-booking`'s From/To fields. `fromStationOptions`/
 * `toStationOptions` are `StationApi[]`, whose numeric `.id` IS the backend's
 * `stops.id` (verified against SIT — see the frontend implementation report).
 */
@Component({
  selector: 'app-parcel-trip-form',
  templateUrl: './parcel-trip-form.component.html',
  styleUrl: './parcel-trip-form.component.scss',
})
export class ParcelTripFormComponent implements OnInit, OnDestroy {
  @Input() fromStationOptions: StationApi[] = [];
  @Input() toStationOptions: StationApi[] = [];
  @Input() minDate: Date = new Date();
  @Input() scheduleOptions: ParcelScheduleOption[] = [];
  @Input() isLoadingSchedules = false;
  @Input() noSchedulesFound = false;

  @Output() fromStationChange = new EventEmitter<number>();
  @Output() toStationChange = new EventEmitter<number>();
  @Output() dateChange = new EventEmitter<Date>();
  @Output() scheduleChange = new EventEmitter<number>();
  @Output() next = new EventEmitter<ParcelTripFormValue>();

  protected readonly form: FormGroup;
  private readonly destroy$ = new Subject<void>();

  constructor(private readonly fb: FormBuilder) {
    this.form = this.fb.group(
      {
        fromStationId: ['', [Validators.required]],
        toStationId: ['', [Validators.required]],
        date: [new Date(), [Validators.required]],
        scheduleId: ['', [Validators.required]],
      },
      { validators: stationsDifferValidator() }
    );
  }

  ngOnInit(): void {
    this.form
      .get('fromStationId')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((value: number) => this.fromStationChange.emit(value));

    this.form
      .get('toStationId')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((value: number) => this.toStationChange.emit(value));

    this.form
      .get('date')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((value: Date) => this.dateChange.emit(value));

    this.form
      .get('scheduleId')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((value: number) => this.scheduleChange.emit(value));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected onFromStationSelect(station: StationApi): void {
    this.form.get('fromStationId')?.setValue(station.id);
  }

  protected onToStationSelect(station: StationApi): void {
    this.form.get('toStationId')?.setValue(station.id);
  }

  protected onScheduleSelect(option: ParcelScheduleOption): void {
    this.form.get('scheduleId')?.setValue(option.id);
  }

  protected get canGoNext(): boolean {
    return this.form.valid;
  }

  protected onNext(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.value as {
      fromStationId: number;
      toStationId: number;
      date: Date;
      scheduleId: number;
    };
    this.next.emit({
      fromStationId: Number(v.fromStationId),
      toStationId: Number(v.toStationId),
      date: v.date,
      scheduleId: Number(v.scheduleId),
    });
  }

  protected get stationsSame(): boolean {
    return !!this.form.errors?.['stationsSame'] && (this.form.dirty || this.form.touched);
  }
}
