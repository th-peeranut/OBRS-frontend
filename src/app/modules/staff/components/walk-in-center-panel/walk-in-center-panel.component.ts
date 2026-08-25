import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import dayjs from 'dayjs';

import { WalkInTripDto, isOpenSeatingTrip } from '../../../../services/staff/staff-api.service';
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
import { formatDisplayDate } from '../../../../shared/lib/display-date-time';
import {
  TripDetailsEditFormComponent,
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
    standalone: false
})
export class WalkInCenterPanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedTrip: WalkInTripDto | null = null;
  @Input() selectedSeats: string[] = [];
  /** passenger_type lookup slug (male|female|monk|nun); drives the seat-map icon for the NEXT seat. */
  @Input() passengerGender = 'male';

  /** Per-seat passenger type map (seat label → passenger_type slug) for multi-select rendering. */
  @Input() seatPassengerTypes: Record<string, string> = {};

  // OBRS-324 (Epic OBRS-318 open seating, 318-d): OPEN-mode headcount, owned by
  // sell-page (mirrors `selectedSeats` for ASSIGNED). Only meaningful when
  // `isOpenSeating` is true.
  @Input() passengerCount = 1;
  @Output() passengerCountChange = new EventEmitter<number>();

  // OBRS-358: how many of the current sale's tickets spill into the jump
  // seat (walk-in-only, sold last) — owned/computed by sell-page
  // (`overflowUnits`), passed through for the inline warning hint below the
  // stepper. Null-default `0` means "no overflow" — every existing call site
  // that doesn't pass this binding renders no hint, byte-identical to before
  // this card.
  @Input() jumpSeatOverflowUnits = 0;

  // --- Stop selection inputs (lifted from checkout) ---
  @Input() pickupOptions: StopOption[] = [];
  @Input() dropoffOptions: StopOption[] = [];
  @Input() pickupSlug = '';
  @Input() dropoffSlug = '';
  @Input() isLoadingSegments = false;
  @Input() popularPickupStops: StopOption[] = [];
  @Input() popularDropoffStops: StopOption[] = [];

  @Output() seatToggled = new EventEmitter<string>();
  @Output() passengerTypeChange = new EventEmitter<string>();
  @Output() pickupChange = new EventEmitter<string>();
  @Output() dropoffChange = new EventEmitter<string>();

  /** Emitted after a successful save — parent should merge patch into selectedTrip and matching row. */
  @Output() tripDetailsUpdated = new EventEmitter<TripDetailsUpdatedEvent>();
  /** Emitted after a successful save — parent should reload trips for the selected date. */
  @Output() refreshTripsRequested = new EventEmitter<void>();
  /** OBRS-130 (product-owner follow-up): the active `p-tabView` tab index (0 =
   * Ticket Sales, 1 = Trip Details, 2 = Boarding). The parent uses this to hide
   * the checkout column and widen the center column on the non-Ticket-Sales
   * tabs. Emitted from `onTabChange()` on every user-driven switch, and once
   * on init so the parent starts in a known state (index 0). */
  @Output() activeTabChange = new EventEmitter<number>();

  @ViewChild(TripDetailsEditFormComponent) editFormRef?: TripDetailsEditFormComponent;

  // --- Stop filter state (client-side, non-destructive) ---
  protected pickupFilter = '';
  protected dropoffFilter = '';

  /** Popular pickup stops that exist on the current route (slug present in pickupOptions). */
  private get routeValidPopularPickup(): StopOption[] {
    const validSlugs = new Set(this.pickupOptions.map(o => o.slug));
    return this.popularPickupStops.filter(o => validSlugs.has(o.slug));
  }

  /** Popular drop-off stops that exist on the current route (slug present in dropoffOptions). */
  private get routeValidPopularDropoff(): StopOption[] {
    const validSlugs = new Set(this.dropoffOptions.map(o => o.slug));
    return this.popularDropoffStops.filter(o => validSlugs.has(o.slug));
  }

  protected get filteredPickupOptions(): StopOption[] {
    // Popular stops are surfaced in their own pinned section, so exclude them
    // here to avoid showing the same stop twice in one list.
    const pinned = new Set(this.routeValidPopularPickup.map(o => o.slug));
    const base = this.pickupOptions.filter(o => !pinned.has(o.slug));
    const q = this.pickupFilter.trim().toLowerCase();
    if (!q) return base;
    return base.filter(o => o.name.toLowerCase().includes(q));
  }

  protected get filteredDropoffOptions(): StopOption[] {
    const pinned = new Set(this.routeValidPopularDropoff.map(o => o.slug));
    const base = this.dropoffOptions.filter(o => !pinned.has(o.slug));
    const q = this.dropoffFilter.trim().toLowerCase();
    if (!q) return base;
    return base.filter(o => o.name.toLowerCase().includes(q));
  }

  protected get filteredPopularPickupOptions(): StopOption[] {
    const routeValid = this.routeValidPopularPickup;
    const q = this.pickupFilter.trim().toLowerCase();
    if (!q) return routeValid;
    return routeValid.filter(o => o.name.toLowerCase().includes(q));
  }

  protected get filteredPopularDropoffOptions(): StopOption[] {
    const routeValid = this.routeValidPopularDropoff;
    const q = this.dropoffFilter.trim().toLowerCase();
    if (!q) return routeValid;
    return routeValid.filter(o => o.name.toLowerCase().includes(q));
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

  // Cached route info from the detail response.
  private routeNameForForm = '';
  private routeDateForForm = '';
  // Slug of the route for the PUT body.
  private routeSlugForForm = '';
  // OBRS-508: this walk-in trip-edit form has no cargoCapacityKg control (out
  // of that card's scope) — cached from the fetched detail purely so onSave()
  // can carry the existing per-trip cargo override forward unchanged. Without
  // this, PUT /schedules/{id}'s full-replace body would silently wipe it to
  // null on every staff save (the exact "omitted field wiped" hazard).
  private cargoCapacityKgFromDetail: number | null = null;
  // OBRS-1477: false until the edit-open detail actually lands. Both capacity overrides
  // come from it and nothing else on this screen carries them — the trips row holds the
  // COALESCEd value, not the override — so a PUT built without it would invent two.
  private isDetailLoaded = false;

  private readonly destroy$ = new Subject<void>();

  protected readonly passengerTypeOptions: { value: string; labelKey: string; icon: string }[] = [
    { value: 'male',   labelKey: 'STAFF.SELL.PTYPE_MALE',   icon: 'icons/passenger-male.svg' },
    { value: 'female', labelKey: 'STAFF.SELL.PTYPE_FEMALE', icon: 'icons/passenger-female.svg' },
    { value: 'monk',   labelKey: 'STAFF.SELL.PTYPE_MONK',   icon: 'icons/passenger-monk.svg' },
    { value: 'nun',    labelKey: 'STAFF.SELL.PTYPE_NUN',    icon: 'icons/passenger-nun.svg' },
  ];

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  /** Zero-based index of the "Trip Details" tab in the p-tabView. */
  private static readonly TRIP_DETAILS_TAB_INDEX = 1;

  ngOnInit(): void {
    // Tell the parent the starting tab (Ticket Sales, index 0) so it never
    // renders a stale/undefined layout before the first user-driven tab
    // switch — see `activeTabChange`'s doc comment.
    this.activeTabChange.emit(0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If the selected trip changes while the Trip Details tab is open, reload the
    // editable form for the newly selected trip (it stays directly editable).
    const tripChange = changes['selectedTrip'];
    if (tripChange && !tripChange.firstChange && this.isEditMode) {
      if (this.selectedTrip) {
        this.openEditMode();
      } else {
        this.closeEditMode();
      }
    }
  }

  /**
   * Trip Details fields are directly editable — opening the tab loads the form
   * immediately (no read-only step / Edit button). Leaving the tab tears the
   * form state down so a stale in-flight load can't clobber the next open.
   */
  protected onTabChange(value: string | number | undefined): void {
    // The parameter is as wide as `Tabs.valueChange` can emit under PrimeNG 20
    // (`string | number | undefined`), NOT as wide as this component's own tab
    // values, which are still only 0/1/2. Narrowing happens here rather than in
    // the template so that a value the panel has no tab for is DROPPED instead
    // of coerced: `+undefined` is NaN, and NaN reaches neither branch below but
    // would still have been emitted to the parent as the new active tab.
    const index = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(index)) return;

    this.activeTabChange.emit(index);

    if (index === WalkInCenterPanelComponent.TRIP_DETAILS_TAB_INDEX) {
      this.openEditMode();
    } else if (this.isEditMode) {
      this.closeEditMode();
    }
  }

  /** Secondary button in the edit form: discard unsaved edits by reloading originals. */
  protected revertChanges(): void {
    if (this.selectedTrip) {
      this.openEditMode();
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

  // OBRS-324 (Epic OBRS-318 open seating, 318-d): OPEN schedules sell by
  // passenger count only — no seat map/picker. The endpoint returns
  // seatingMode since OBRS-360, so this reflects the real mode. Missing/unknown
  // (a cached row predating it) safely resolves to false/ASSIGNED.
  protected get isOpenSeating(): boolean {
    return isOpenSeatingTrip(this.selectedTrip);
  }

  /** Whole-trip availability (walk-in is whole-trip, never per-segment) caps the OPEN headcount. */
  protected get maxPassengerCount(): number {
    return Math.max(1, this.selectedTrip?.availableCount ?? 1);
  }

  protected incrementPassengerCount(): void {
    if (this.passengerCount < this.maxPassengerCount) {
      this.passengerCountChange.emit(this.passengerCount + 1);
    }
  }

  protected decrementPassengerCount(): void {
    if (this.passengerCount > 1) {
      this.passengerCountChange.emit(this.passengerCount - 1);
    }
  }

  protected get currentSeat(): string {
    return this.selectedSeats.length > 0 ? this.selectedSeats[0] : '';
  }

  // ---------------------------------------------------------------------------
  // Edit mode
  // ---------------------------------------------------------------------------

  protected openEditMode(): void {
    if (!this.selectedTrip) return;
    const trip = this.selectedTrip;

    this.isEditMode = true;
    this.capacityInlineError = '';
    this.isDetailLoaded = false;

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
            this.isDetailLoaded = true;
            this.cargoCapacityKgFromDetail = scheduleDetail.cargoCapacityKg ?? null;
            this.routeSlugForForm = scheduleDetail.route?.slug ?? '';
            this.routeNameForForm =
              getAdminLookupLabel(scheduleDetail.route, this.translate.currentLang) ??
              scheduleDetail.route?.slug ??
              '';
            this.routeDateForForm = scheduleDetail.departureDateTime
              ? formatDisplayDate(scheduleDetail.departureDateTime, this.translate.currentLang)
              : '';
          }

          // Wait for editFormRef to be available (it renders when isEditMode=true).
          // Use Promise.resolve to push to next microtask so ViewChild is initialised.
          void Promise.resolve().then(() => {
            if (!this.editFormRef) return;

            if (scheduleDetail) {
              const patch = this.buildDetailPatch(scheduleDetail);
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
    this.vehicleTypes = [];
    this.vehicles = [];
    this.drivers = [];
    this.routeNameForForm = '';
    this.routeDateForForm = '';
    this.routeSlugForForm = '';
    this.cargoCapacityKgFromDetail = null;
    this.isDetailLoaded = false;
  }

  protected get editFormRouteName(): string {
    return this.routeNameForForm;
  }

  protected get editFormRouteDate(): string {
    return this.routeDateForForm;
  }

  protected onSave(formValue: TripEditFormValue): void {
    if (!this.selectedTrip) return;
    const trip = this.selectedTrip;

    // OBRS-1477: the edit-open detail is the only source of the two capacity overrides, and
    // this PUT replaces the whole schedule (OBRS-512) — so without it, saving would write an
    // invented seatingCapacity and wipe cargoCapacityKg. Refusing is better than either; the
    // tab re-fetches when it is reopened.
    if (!this.isDetailLoaded) {
      void this.alertService.error(
        this.translate.instant('STAFF.SELL.TRIP_DETAIL_EDIT_LOAD_FAILED')
      );
      return;
    }

    this.capacityInlineError = '';

    if (!formValue.departureDateTime) return;

    const payload: UpdateSchedulePayload = {
      route: this.routeSlugForForm || trip.scheduleId.toString(),
      vehicleType: formValue.vehicleType,
      vehicleId: formValue.vehicleId,
      driverId: formValue.driverId,
      departureDateTime: formValue.departureDateTime,
      seatingCapacity: formValue.seatingCapacity,
      // OBRS-508: this form has no cargo-capacity control — carry the value
      // fetched on edit-open forward unchanged so this full-replace PUT
      // doesn't silently wipe it.
      cargoCapacityKg: this.cargoCapacityKgFromDetail,
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

          this.capacityInlineError = '';

          // Emitting the patch updates selectedTrip in the parent (new reference),
          // which flows back as an @Input and reloads the form with server truth
          // via ngOnChanges. The tab stays directly editable — no read-only step.
          this.tripDetailsUpdated.emit({ scheduleId: trip.scheduleId, patch });

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
  } {
    const depDate = dayjs(trip.departureDateTime).toDate();
    return {
      departureTime: depDate,
      vehicleType: trip.vehicleType ?? '',
      vehicleId: '',
      driverId: '',
      // OBRS-1477: trip.capacity is the RESOLVED cap — COALESCE(schedules.seating_capacity,
      // vehicle_types.total_seats) — never the stored override, so it cannot stand in for one.
      // Until the detail lands the override is simply unknown, and empty is the only honest
      // answer; buildDetailPatch() fills in the real one.
      seatingCapacity: null,
    };
  }

  private buildDetailPatch(
    detail: {
      departureDateTime?: string;
      vehicle?: AdminVehicleDto;
      vehicleType?: AdminVehicleTypeDto;
      driver?: { id?: number; fullName?: string };
      seatingCapacity?: number | null;
    }
  ): Partial<{
    departureTime: Date | null;
    vehicleType: string;
    vehicleId: string;
    driverId: string;
    seatingCapacity: number | null;
  }> {
    const patch: Partial<{
      departureTime: Date | null;
      vehicleType: string;
      vehicleId: string;
      driverId: string;
      seatingCapacity: number | null;
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
    // OBRS-1477: the STORED override only. Falling back to totalSeats here put the resolved
    // 21 into the control, so opening this tab and pressing Save without editing anything
    // turned "inherit from the vehicle type" (OBRS-512's null) into a hard-coded 21 — the
    // mirror image of OBRS-1471, which cleared a real value on the same keystroke.
    patch.seatingCapacity = detail.seatingCapacity ?? null;

    return patch;
  }

  private getEffectiveTotalSeats(vehicleTypeSlug: string): number | null {
    const vt = this.vehicleTypes.find((t) => t.slug === vehicleTypeSlug);
    return vt?.totalSeats ?? null;
  }
}
