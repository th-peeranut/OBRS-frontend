import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  AdminVehicleDto,
  AdminVehicleTypeDto,
  DriverDto,
} from '../../../../../services/admin/admin-api.service';
import { WalkInTripDto } from '../../../../../services/staff/staff-api.service';
import dayjs from 'dayjs';

export interface Option {
  code: string;
  label: string;
}

export interface TripEditFormValue {
  /** ISO departure datetime string, combining original date + edited time. */
  departureDateTime: string;
  vehicleType: string;
  vehicleId: number | null;
  driverId: number | null;
  seatingCapacity: number | null;
  route: string;
}

/** Validator factory: value must be <= maxValue when present. */
function maxCapacityValidator(getMax: () => number | null): ValidatorFn {
  return (control: AbstractControl) => {
    const val = control.value as number | null;
    if (val == null) return null;
    const max = getMax();
    if (max != null && val > max) {
      return { capacityMax: { max } };
    }
    return null;
  };
}

@Component({
    selector: 'app-trip-details-edit-form',
    templateUrl: './trip-details-edit-form.component.html',
    styleUrl: './trip-details-edit-form.component.scss',
    standalone: false
})
export class TripDetailsEditFormComponent implements OnInit, OnChanges, OnDestroy {
  // --- Inputs: data for dropdowns ---
  @Input() trip: WalkInTripDto | null = null;
  @Input() routeName = '';
  @Input() routeDate = '';
  @Input() isLoading = false;
  @Input() isSaving = false;
  @Input() vehicleTypes: AdminVehicleTypeDto[] = [];
  @Input() vehicles: AdminVehicleDto[] = [];
  @Input() drivers: DriverDto[] = [];
  @Input() capacityInlineError = '';

  // --- Outputs ---
  @Output() save = new EventEmitter<TripEditFormValue>();
  @Output() cancel = new EventEmitter<void>();

  protected readonly form: FormGroup;
  private readonly destroy$ = new Subject<void>();

  constructor(private readonly fb: FormBuilder) {
    this.form = this.fb.group({
      departureTime: [null, [Validators.required]],
      vehicleType: ['', [Validators.required]],
      vehicleId: [''],
      seatingCapacity: [null, [Validators.min(1), maxCapacityValidator(() => this.effectiveTotalSeats)]],
      driverId: [''],
    });
  }

  ngOnInit(): void {
    this.form.get('vehicleType')!
      .valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // If the current vehicleId isn't available for the new type, clear it.
        const currentVehicleId = this.form.get('vehicleId')!.value as string;
        const still = this.filteredVehicleOptions.some((o) => o.code === currentVehicleId);
        if (!still) {
          this.form.get('vehicleId')!.setValue('', { emitEvent: false });
        }
        // Also re-run capacity validation when type changes.
        this.form.get('seatingCapacity')!.updateValueAndValidity({ emitEvent: false });
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Re-run capacity validation when vehicle types change (effectiveTotalSeats may change).
    if (changes['vehicleTypes']) {
      this.form.get('seatingCapacity')!.updateValueAndValidity({ emitEvent: false });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Patch form fields that are still untouched (SWR open pattern). */
  applyUntouchedPatch(values: Partial<{
    departureTime: Date | null;
    vehicleType: string;
    vehicleId: string;
    driverId: string;
    seatingCapacity: number | null;
  }>): void {
    for (const key of Object.keys(values) as Array<keyof typeof values>) {
      const ctrl = this.form.get(key);
      if (ctrl && ctrl.untouched) {
        ctrl.setValue(values[key], { emitEvent: false });
      }
    }
  }

  /** Reset form to fallback values (called when edit opens). */
  resetToFallback(values: {
    departureTime: Date | null;
    vehicleType: string;
    vehicleId: string;
    driverId: string;
    seatingCapacity: number | null;
  }): void {
    this.form.reset(values);
  }

  /** effectiveTotalSeats = selected vehicleType.totalSeats */
  protected get effectiveTotalSeats(): number | null {
    const slug = this.form.get('vehicleType')!.value as string;
    const vt = this.vehicleTypes.find((t) => t.slug === slug);
    return vt?.totalSeats ?? null;
  }

  /** OBRS-1477: empty control = no per-trip override, i.e. inherit effectiveTotalSeats. */
  protected get isCapacityInherited(): boolean {
    return this.form.get('seatingCapacity')!.value == null;
  }

  protected get selectedVehicleTypeLabel(): string {
    const slug = this.form.get('vehicleType')!.value as string;
    const vt = this.vehicleTypes.find((t) => t.slug === slug);
    return vt?.slug ?? '';
  }

  /** Vehicles filtered client-side by selected vehicle type slug. */
  protected get filteredVehicleOptions(): Option[] {
    const slug = this.form.get('vehicleType')!.value as string;
    if (!slug) return this.vehicleOptions;
    return this.vehicleOptions.filter((opt) => {
      const v = this.vehicles.find((veh) => String(veh.id) === opt.code);
      return v?.vehicleType?.slug === slug;
    });
  }

  protected get vehicleTypeOptions(): Option[] {
    return this.vehicleTypes.map((vt) => ({
      code: vt.slug,
      label: vt.slug,
    }));
  }

  protected get vehicleOptions(): Option[] {
    return this.vehicles.map((v) => ({
      code: String(v.id),
      label: v.numberPlate ?? v.vehicleNumber ?? String(v.id),
    }));
  }

  protected get driverOptions(): Option[] {
    return this.drivers.map((d) => ({
      code: String(d.id),
      label: d.name,
    }));
  }

  protected isFieldInvalid(name: string): boolean {
    const ctrl = this.form.get(name);
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  protected get capacityMaxFromControl(): number | null {
    return this.effectiveTotalSeats;
  }

  protected onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue() as {
      departureTime: Date | null;
      vehicleType: string;
      vehicleId: string;
      driverId: string;
      seatingCapacity: number | null;
    };

    if (!raw.departureTime || !this.trip) {
      return;
    }

    // Combine original calendar date with the edited time.
    const originalDate = dayjs(this.trip.departureDateTime).format('YYYY-MM-DD');
    const editedTime = dayjs(raw.departureTime).format('HH:mm');
    const departureDateTime = `${originalDate}T${editedTime}:00+07:00`;

    const value: TripEditFormValue = {
      departureDateTime,
      vehicleType: raw.vehicleType,
      vehicleId: raw.vehicleId ? Number(raw.vehicleId) : null,
      driverId: raw.driverId ? Number(raw.driverId) : null,
      seatingCapacity: raw.seatingCapacity ?? null,
      route: '', // filled by parent from selectedTrip's route slug
    };

    this.save.emit(value);
  }

  protected onCancel(): void {
    this.cancel.emit();
  }
}
