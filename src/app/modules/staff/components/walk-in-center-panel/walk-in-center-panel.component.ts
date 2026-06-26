import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import dayjs from 'dayjs';

import { WalkInTripDto } from '../../../../services/staff/staff-api.service';
import { StopOption } from '../../pages/sell/sell-page.component';
import {
  AdminVehicleDto,
  AdminVehicleTypeDto,
  DriverDto,
  UpdateSchedulePayload,
  getAdminLookupLabel,
} from '../../../../services/admin/admin-api.service';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import {
  TripDetailsEditFormComponent,
  Option,
  TripEditFormValue,
} from '../trip-details-edit/trip-details-edit-form/trip-details-edit-form.component';

export interface TripDetailsUpdatedEvent {
  scheduleId: number;
  patch: Partial<WalkInTripDto>;
}

@Component({
  selector: 'app-walk-in-center-panel',
  templateUrl: './walk-in-center-panel.component.html',
  styleUrl: './walk-in-center-panel.component.scss',
})
export class WalkInCenterPanelComponent implements OnChanges, OnDestroy {
  @Input() selectedTrip: WalkInTripDto | null = null;
  @Input() selectedSeats: string[] = [];
  /** passenger_type lookup slug (male|female|monk|nun); drives the seat-map icon for the NEXT seat. */
  @Input() passengerGender = 'male';

  /** Per-seat passenger type map (seat label → passenger_type slug) for multi-select rendering. */
  @Input() seatPassengerTypes: Record<string, string> = {};

  // --- Stop selection inputs (lifted from checkout) ---
  @Input() pickupOptions: StopOption[] = [];
  @Input() dropoffOptions: StopOption[] = [];
  @Input() pickupSlug = '';
  @Input() dropoffSlug = '';
  @Input() isLoadingSegments = false;

  @Output() seatToggled = new EventEmitter<string>();
  @Output() passengerTypeChange = new EventEmitter<string>();
  @Output() pickupChange = new EventEmitter<string>();
  @Output() dropoffChange = new EventEmitter<string>();

  /** Emitted after a successful save — parent should merge patch into selectedTrip and matching row. */
  @Output() tripDetailsUpdated = new EventEmitter<TripDetailsUpdatedEvent>();
  /** Emitted after a successful save — parent should reload trips for the selected date. */
  @Output() refreshTripsRequested = new EventEmitter<void>();

  @ViewChild(TripDetailsEditFormComponent) editFormRef?: TripDetailsEditFormComponent;

  // --- Stop filter state (client-side, non-destructive) ---
  protected pickupFilter = '';
  protected dropoffFilter = '';

  protected get filteredPickupOptions(): StopOption[] {
    const q = this.pickupFilter.trim().toLowerCase();
    if (!q) return this.pickupOptions;
    return this.pickupOptions.filter(o => o.name.toLowerCase().includes(q));
  }

  protected get filteredDropoffOptions(): StopOption[] {
    const q = this.dropoffFilter.trim().toLowerCase();
    if (!q) return this.dropoffOptions;
    return this.dropoffOptions.filter(o => o.name.toLowerCase().includes(q));
  }

  // --- Edit-mode state ---
  protected isEditMode = false;
  protected isEditLoading = false;
  protected isSaving = false;
  protected capacityInlineError = '';

  // --- Form data ---
  protected vehicleTypes: AdminVehicleTypeDto[] = [];
  protected vehicles: AdminVehicleDto[] = [];
  protected drivers: DriverDto[] = [];
  protected seatMapOptions: Option[] = [];

  // Cached route info from the detail response.
  private routeNameForForm = '';
  private routeDateForForm = '';
  // Slug of the route for the PUT body.
  private routeSlugForForm = '';

  private readonly destroy$ = new Subject<void>();

  protected readonly passengerTypeOptions: { value: string; labelKey: string; icon: string }[] = [
    { value: 'male',   labelKey: 'STAFF.SELL.PTYPE_MALE',   icon: 'icons/passenger-male.svg' },
    { value: 'female', labelKey: 'STAFF.SELL.PTYPE_FEMALE', icon: 'icons/passenger-female.svg' },
    { value: 'monk',   labelKey: 'STAFF.SELL.PTYPE_MONK',   icon: 'icons/passenger-monk.svg' },
    { value: 'nun',    labelKey: 'STAFF.SELL.PTYPE_NUN',    icon: '' },
  ];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    // If the selected trip changes while editing, close edit mode.
    if (changes['selectedTrip'] && this.isEditMode) {
      this.closeEditMode();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected onSelectPassengerType(v: string): void {
    this.passengerTypeChange.emit(v);
  }

  /** Seat components expect an upper-case gender token (MALE|FEMALE|MONK). */
  protected get seatGender(): string {
    return (this.passengerGender || 'male').toUpperCase();
  }

  /**
   * Per-seat gender map with UPPER-CASE tokens for the seat components.
   * Returns null when no seats are selected (falls back to single-select in seat components).
   */
  protected get seatGendersUpper(): Record<string, string> | null {
    const entries = Object.entries(this.seatPassengerTypes);
    if (entries.length === 0) return null;
    const result: Record<string, string> = {};
    for (const [seat, type] of entries) {
      result[seat] = type.toUpperCase();
    }
    return result;
  }

  // Fixed seat universe for the BUS layout (B1..B21).
  private readonly busSeatLabels: string[] = Array.from(
    { length: 21 },
    (_, i) => `B${i + 1}`
  );

  protected get takenSeats(): string[] {
    if (!this.selectedTrip) return [];
    const available = (this.selectedTrip.availableSeatNumbers ?? []).map((s) =>
      String(s).replace(/\D/g, '')
    );
    if (available.length === 0) return [];
    return this.busSeatLabels.filter(
      (label) => !available.includes(label.replace(/\D/g, ''))
    );
  }

  protected get isVan(): boolean {
    return this.selectedTrip?.vehicleType === 'van';
  }

  protected get currentSeat(): string {
    return this.selectedSeats.length > 0 ? this.selectedSeats[0] : '';
  }

  protected formatDateTime(dateTime: string): string {
    return dayjs(dateTime).format('D MMM YYYY HH:mm');
  }

  // ---------------------------------------------------------------------------
  // Edit mode
  // ---------------------------------------------------------------------------

  protected openEditMode(): void {
    if (!this.selectedTrip) return;
    const trip = this.selectedTrip;

    this.isEditMode = true;
    this.capacityInlineError = '';

    // Build fallback form values synchronously from the trip row data.
    const fallback = this.buildFallbackValues(trip);

    // Reset the form to fallback values (makes everything pristine + untouched).
    // We do this BEFORE the async fetch so the form is always in a known state.
    // applyUntouchedPatch will be called when the detail arrives.
    if (this.editFormRef) {
      this.editFormRef.resetToFallback(fallback);
    }

    this.isEditLoading = true;

    // Fire all parallel data fetches.
    forkJoin({
      detail: this.adminApiService.getScheduleById(trip.scheduleId),
      vehicleTypes: this.adminApiService.getVehicleTypes(),
      vehicles: this.adminApiService.getVehicles(),
      drivers: this.staffApiService.getDrivers(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ detail, vehicleTypes, vehicles, drivers }) => {
          if (!this.isEditMode) return; // edit was cancelled while loading

          this.vehicleTypes = vehicleTypes?.data ?? [];
          this.vehicles = vehicles?.data ?? [];
          this.drivers = drivers?.data ?? [];

          const scheduleDetail = detail?.data ?? null;

          // Store route info for the form display and PUT payload.
          if (scheduleDetail) {
            this.routeSlugForForm = scheduleDetail.route?.slug ?? '';
            this.routeNameForForm = getAdminLookupLabel(scheduleDetail.route) ?? scheduleDetail.route?.slug ?? '';
            this.routeDateForForm = scheduleDetail.departureDateTime
              ? dayjs(scheduleDetail.departureDateTime).format('D MMM YYYY')
              : '';

            // If a vehicle type is known, load the seat-plan options.
            const vtId = scheduleDetail.vehicleType?.id;
            if (vtId) {
              this.loadSeatMaps(vtId);
            }
          }

          // Wait for editFormRef to be available (it renders when isEditMode=true).
          // Use Promise.resolve to push to next microtask so ViewChild is initialised.
          void Promise.resolve().then(() => {
            if (!this.editFormRef) return;

            if (scheduleDetail) {
              const patch = this.buildDetailPatch(scheduleDetail, trip);
              this.editFormRef.applyUntouchedPatch(patch);
            }
          });

          this.isEditLoading = false;
        },
        error: () => {
          this.isEditLoading = false;
          void this.alertService.error(
            this.translate.instant('STAFF.SELL.TRIP_DETAIL_EDIT_LOAD_FAILED')
          );
        },
      });
  }

  protected closeEditMode(): void {
    this.isEditMode = false;
    this.isEditLoading = false;
    this.isSaving = false;
    this.capacityInlineError = '';
    this.seatMapOptions = [];
    this.vehicleTypes = [];
    this.vehicles = [];
    this.drivers = [];
    this.routeNameForForm = '';
    this.routeDateForForm = '';
    this.routeSlugForForm = '';
  }

  protected get editFormRouteName(): string {
    return this.routeNameForForm;
  }

  protected get editFormRouteDate(): string {
    return this.routeDateForForm;
  }

  protected onVehicleTypeChanged(slug: string): void {
    // When user changes vehicle type in the form, reload seat maps for the new type.
    const vt = this.vehicleTypes.find((t) => t.slug === slug);
    if (vt?.id) {
      this.loadSeatMaps(vt.id);
    } else {
      this.seatMapOptions = [];
    }
  }

  protected onSave(formValue: TripEditFormValue): void {
    if (!this.selectedTrip) return;
    const trip = this.selectedTrip;

    this.capacityInlineError = '';

    if (!formValue.departureDateTime) return;

    const payload: UpdateSchedulePayload = {
      route: this.routeSlugForForm || trip.scheduleId.toString(),
      vehicleType: formValue.vehicleType,
      vehicleId: formValue.vehicleId,
      driverId: formValue.driverId,
      departureDateTime: formValue.departureDateTime,
      seatingCapacity: formValue.seatingCapacity,
    };

    this.isSaving = true;

    this.adminApiService
      .updateSchedule(trip.scheduleId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSaving = false;

          // Optimistic patch to the local trip object.
          const patch: Partial<WalkInTripDto> = {};
          if (formValue.vehicleType) {
            patch.vehicleType = formValue.vehicleType as 'bus' | 'van';
          }
          if (formValue.seatingCapacity != null) {
            patch.capacity = formValue.seatingCapacity;
          }

          this.tripDetailsUpdated.emit({ scheduleId: trip.scheduleId, patch });

          this.closeEditMode();

          void this.alertService.success(
            this.translate.instant('STAFF.SELL.TRIP_DETAIL_SAVE_SUCCESS')
          );

          // Ask the parent to refresh the trips list.
          this.refreshTripsRequested.emit();
        },
        error: (err: unknown) => {
          this.isSaving = false;
          const msg = extractApiErrorMessage(err);
          const errorCode: string =
            (err as HttpErrorResponse)?.error?.errorCode ?? '';

          // Map backend capacity errorCode values to inline messages.
          if (errorCode === 'SCHEDULE_ERROR_CAPACITY_EXCEEDS_TYPE_MAX') {
            const max = this.getEffectiveTotalSeats(formValue.vehicleType);
            this.capacityInlineError = this.translate.instant(
              'STAFF.SELL.TRIP_DETAIL_ERR_CAPACITY_MAX',
              { max: max ?? '?' }
            );
            return;
          }
          if (errorCode === 'SCHEDULE_ERROR_CAPACITY_BELOW_OCCUPIED') {
            const occupied = trip.soldPaidCount + trip.reservedUnpaidCount;
            this.capacityInlineError = this.translate.instant(
              'STAFF.SELL.TRIP_DETAIL_ERR_CAPACITY_BELOW_OCCUPIED',
              { occupied }
            );
            return;
          }

          void this.alertService.error(
            msg || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED')
          );
        },
      });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildFallbackValues(trip: WalkInTripDto): {
    departureTime: Date | null;
    vehicleType: string;
    vehicleId: string;
    driverId: string;
    seatingCapacity: number | null;
    seatMapId: string;
  } {
    const depDate = dayjs(trip.departureDateTime).toDate();
    return {
      departureTime: depDate,
      vehicleType: trip.vehicleType ?? '',
      vehicleId: '',
      driverId: '',
      seatingCapacity: trip.capacity ?? null,
      seatMapId: '',
    };
  }

  private buildDetailPatch(
    detail: {
      departureDateTime?: string;
      vehicle?: AdminVehicleDto;
      vehicleType?: AdminVehicleTypeDto;
      driver?: { id?: number; fullName?: string };
      seatingCapacity?: number | null;
    },
    trip: WalkInTripDto
  ): Partial<{
    departureTime: Date | null;
    vehicleType: string;
    vehicleId: string;
    driverId: string;
    seatingCapacity: number | null;
    seatMapId: string;
  }> {
    const patch: Partial<{
      departureTime: Date | null;
      vehicleType: string;
      vehicleId: string;
      driverId: string;
      seatingCapacity: number | null;
      seatMapId: string;
    }> = {};

    if (detail.departureDateTime) {
      patch.departureTime = dayjs(detail.departureDateTime).toDate();
    }
    if (detail.vehicleType?.slug) {
      patch.vehicleType = detail.vehicleType.slug;
    }
    if (detail.vehicle?.id) {
      patch.vehicleId = String(detail.vehicle.id);
    }
    if (detail.driver?.id) {
      patch.driverId = String(detail.driver.id);
    }
    const effectiveCap = detail.seatingCapacity ?? detail.vehicleType?.totalSeats ?? trip.capacity;
    if (effectiveCap != null) {
      patch.seatingCapacity = effectiveCap;
    }

    return patch;
  }

  private loadSeatMaps(vehicleTypeId: number): void {
    this.adminApiService
      .getVehicleTypeById(vehicleTypeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          const maps = resp?.data?.seatMaps ?? [];
          this.seatMapOptions = maps.map((m) => ({
            code: String(m.id),
            label: m.name ?? m.label ?? String(m.id),
          }));
        },
        error: () => {
          this.seatMapOptions = [];
        },
      });
  }

  private getEffectiveTotalSeats(vehicleTypeSlug: string): number | null {
    const vt = this.vehicleTypes.find((t) => t.slug === vehicleTypeSlug);
    return vt?.totalSeats ?? null;
  }
}
