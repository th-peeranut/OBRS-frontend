import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Subject, firstValueFrom, take } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import dayjs from 'dayjs';
import { AlertService } from '../../../../shared/services/alert.service';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { combineBangkokDateTime } from '../../../../shared/lib/api-date-time';
import {
  PopularStopDto,
  SegmentStopPairDto,
  SegmentStopRefDto,
  StaffApiService,
  WalkInRouteGroupDto,
  WalkInTripDto,
} from '../../../../services/staff/staff-api.service';
import {
  AdminApiService,
  AdminScheduleDto,
  CreateSchedulePayload,
  getAdminLookupLabel,
  getAdminTranslationLabel,
} from '../../../../services/admin/admin-api.service';
import { invokeSetBookingApi } from '../../../../shared/stores/booking/booking.action';
import { generateIdempotencyKey } from '../../../../shared/lib/idempotency-key';
import { WalkInCheckoutPayload } from '../../components/walk-in-checkout/walk-in-checkout.component';
import { WalkInTripSelection } from '../../components/walk-in-trip-browser/walk-in-trip-browser.component';
import { TripDetailsUpdatedEvent } from '../../components/walk-in-center-panel/walk-in-center-panel.component';
import { StaffSchedulesStore, StaffSchedulesData } from '../staff-schedules/staff-schedules.store';

/** Stop option enriched with a computed departure time string. */
export interface StopOption extends SegmentStopRefDto {
  /** Computed time string, e.g. "07:00". May be '' when duration data is missing. */
  time: string;
}

@Component({
  selector: 'app-sell-page',
  templateUrl: './sell-page.component.html',
  styleUrl: './sell-page.component.scss',
})
export class SellPageComponent implements OnInit, OnDestroy {
  protected today: Date = new Date();
  protected selectedDate: Date = new Date();
  protected isLoadingTrips = false;
  protected routeGroups: WalkInRouteGroupDto[] = [];
  protected selectedTrip: WalkInTripDto | null = null;
  protected selectedRouteSlug: string | null = null;
  protected selectedSeats: string[] = [];
  /** passenger_type lookup slug chosen by staff via the center-panel tiles. */
  protected selectedPassengerType = 'male';
  /** Per-seat passenger type map — seat label → passenger_type slug. */
  protected seatPassengerTypes: Record<string, string> = {};
  protected isSelling = false;
  protected bookingId: number | null = null;
  protected bookingNumber: string | null = null;

  // --- Segment / stop state lifted from WalkInCheckoutComponent ---
  protected orderedStops: SegmentStopRefDto[] = [];
  protected pickupSlug = '';
  protected dropoffSlug = '';
  protected isLoadingSegments = false;
  protected popularPickupStops: StopOption[] = [];
  protected popularDropoffStops: StopOption[] = [];
  private fareMap = new Map<string, number>();

  private idempotencyKey: string | null = null;
  private readonly destroy$ = new Subject<void>();

  // --- Schedule management state ---
  protected readonly scheduleItemForm: FormGroup;
  protected isScheduleFormOpen = false;
  protected isScheduleDeleteOpen = false;
  protected isScheduleEditMode = false;
  protected isScheduleSubmitting = false;
  protected isScheduleDeleting = false;
  protected isScheduleDetailLoading = false;
  protected editingScheduleId: number | null = null;
  protected deletingTrip: WalkInTripDto | null = null;

  // Option arrays for schedule form (populated from StaffSchedulesStore)
  protected scheduleRouteOptions: { code: string; label: string }[] = [];
  protected scheduleVehicleTypeOptions: { code: string; label: string }[] = [];
  protected scheduleVehicleOptions: { code: string; label: string }[] = [];
  protected scheduleDriverOptions: { code: string; label: string }[] = [];

  constructor(
    private readonly router: Router,
    private readonly store: Store,
    private readonly staffApiService: StaffApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly formBuilder: FormBuilder,
    private readonly adminApiService: AdminApiService,
    readonly scheduleStore: StaffSchedulesStore
  ) {
    this.scheduleItemForm = this.formBuilder.group({
      departureDate: [null, [Validators.required]],
      departureTime: [null, [Validators.required]],
      route: ['', [Validators.required]],
      vehicleType: ['', [Validators.required]],
      vehicleId: [''],
      driverId: [''],
    });
  }

  ngOnInit(): void {
    this.loadTrips(this.selectedDate);
    // Stop/route names are server-localized (resolved from the Accept-Language
    // header) and cached in component state on fetch. The `| translate` pipes
    // re-render on a language switch, but this cached server data does not — so
    // re-fetch it, preserving the current selection (slugs are locale-invariant).
    this.translate.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.reloadLocalizedData());

    // Populate schedule form option arrays from StaffSchedulesStore (lazy — no upfront fetch)
    this.scheduleStore.data$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data) { this.applyScheduleLocalization(data); }
      });

    // Re-map labels on language change (store data$ won't re-emit on its own)
    this.translate.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.scheduleStore.data$
          .pipe(take(1))
          .subscribe((d) => { if (d) { this.applyScheduleLocalization(d); } });
      });
  }

  /** Re-fetch server-localized data (trips + segments) after a language switch. */
  private reloadLocalizedData(): void {
    this.loadTrips(this.selectedDate);
    if (this.selectedRouteSlug && this.selectedTrip) {
      this.loadSegments(this.selectedRouteSlug, this.selectedTrip, {
        pickup: this.pickupSlug,
        dropoff: this.dropoffSlug,
      });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected onDateChanged(date: Date): void {
    this.selectedDate = date;
    this.selectedTrip = null;
    this.selectedRouteSlug = null;
    this.selectedSeats = [];
    this.seatPassengerTypes = {};
    this.idempotencyKey = null;
    this._resetSegments();
    this.loadTrips(date);
  }

  protected onTripSelected(selection: WalkInTripSelection): void {
    this.selectedTrip = selection.trip;
    this.selectedRouteSlug = selection.routeSlug;
    this.selectedSeats = [];
    this.seatPassengerTypes = {};
    this.idempotencyKey = null;
    this.loadSegments(selection.routeSlug, selection.trip);
  }

  protected onPassengerTypeChanged(passengerType: string): void {
    // Only update the active type for FUTURE seat clicks — never re-colour
    // already-selected seats.
    this.selectedPassengerType = passengerType;
  }

  protected onSeatToggled(seat: string): void {
    if (!seat) { return; }
    const idx = this.selectedSeats.indexOf(seat);
    if (idx >= 0) {
      // Removing seat: delete its type from the map.
      this.selectedSeats = this.selectedSeats.filter((s) => s !== seat);
      const next = { ...this.seatPassengerTypes };
      delete next[seat];
      this.seatPassengerTypes = next;
    } else {
      // Adding seat: capture currently-active type.
      this.selectedSeats = [...this.selectedSeats, seat];
      this.seatPassengerTypes = { ...this.seatPassengerTypes, [seat]: this.selectedPassengerType };
    }
  }

  protected onPickupChanged(slug: string): void {
    this.pickupSlug = slug;
    this.onPickupChange();
  }

  protected onDropoffChanged(slug: string): void {
    this.dropoffSlug = slug;
  }

  /**
   * Handles an optimistic patch from WalkInCenterPanelComponent after a successful schedule update.
   * Merges the patch into selectedTrip and the matching row in routeGroups.
   */
  protected onTripDetailsUpdated(event: TripDetailsUpdatedEvent): void {
    if (this.selectedTrip && this.selectedTrip.scheduleId === event.scheduleId) {
      this.selectedTrip = { ...this.selectedTrip, ...event.patch };
    }
    this.routeGroups = this.routeGroups.map((group) => ({
      ...group,
      trips: group.trips.map((trip) =>
        trip.scheduleId === event.scheduleId ? { ...trip, ...event.patch } : trip
      ),
    }));
  }

  /**
   * Called by WalkInCenterPanelComponent after a successful save to reload the trips list.
   */
  protected onRefreshTripsRequested(): void {
    this.loadTrips(this.selectedDate);
  }

  /** Stops eligible as a pickup: every stop except the final destination. */
  protected get pickupOptions(): StopOption[] {
    const base = this.orderedStops.slice(0, Math.max(0, this.orderedStops.length - 1));
    return base.map((s) => ({ ...s, time: this.stopTime(s.slug) }));
  }

  /** Stops downstream of the chosen pickup that have a fare. */
  protected get dropoffOptions(): StopOption[] {
    const fromIdx = this.orderedStops.findIndex((s) => s.slug === this.pickupSlug);
    if (fromIdx < 0) return [];
    return this.orderedStops
      .slice(fromIdx + 1)
      .filter((s) => this.fareMap.has(`${this.pickupSlug}|${s.slug}`))
      .map((s) => ({ ...s, time: this.stopTime(s.slug) }));
  }

  /** Per-seat fare for the current pickup→drop-off pair, or null if invalid. */
  protected get segmentFare(): number | null {
    if (!this.pickupSlug || !this.dropoffSlug) return null;
    const fare = this.fareMap.get(`${this.pickupSlug}|${this.dropoffSlug}`);
    return fare === undefined ? null : fare;
  }

  protected get pricePerSeat(): number {
    return this.segmentFare ?? 0;
  }

  protected onSell(payload: WalkInCheckoutPayload): void {
    if (!this.selectedTrip) return;

    if (!this.idempotencyKey) {
      this.idempotencyKey = generateIdempotencyKey();
    }

    const trip = this.selectedTrip;
    this.isSelling = true;

    const passengers = this.selectedSeats.map((seat) => {
      const p: {
        passengerType: string;
        seatNumber: string;
        title: string;
        firstName: string;
        lastName: string;
        phoneNumber: string;
        identityCardNumber?: string;
      } = {
        // Use the per-seat type captured at click time; fall back to the current
        // global type if somehow the seat isn't in the map.
        passengerType: this.seatPassengerTypes[seat] ?? this.selectedPassengerType,
        seatNumber: seat,
        title: payload.contact.title,
        firstName: payload.contact.firstName,
        lastName: payload.contact.lastName,
        phoneNumber: payload.contact.phoneNumber,
      };
      if (payload.contact.identityCardNumber) {
        p.identityCardNumber = payload.contact.identityCardNumber;
      }
      return p;
    });

    // Segment fare is owned by sell-page; use it directly.
    const fare = this.segmentFare ?? 0;
    const totalAmount = fare * this.selectedSeats.length;

    const bookingPayload: {
      bookingType: 'one_way';
      totalAmount: number;
      bookingChannel: 'walk_in';
      departureSchedule: {
        scheduleId: number;
        fromStop: string;
        toStop: string;
        departureDateTime: string;
        arrivalDateTime: string;
        passengers: typeof passengers;
      };
      contact: {
        title: string;
        firstName: string;
        lastName: string;
        phoneNumber: string;
        preferredLocale: string;
        identityCardNumber?: string;
        email?: string;
      };
    } = {
      bookingType: 'one_way',
      totalAmount,
      bookingChannel: 'walk_in',
      departureSchedule: {
        scheduleId: trip.scheduleId,
        fromStop: this.pickupSlug,
        toStop: this.dropoffSlug,
        departureDateTime: trip.departureDateTime,
        arrivalDateTime: trip.arrivalDateTime,
        passengers,
      },
      contact: {
        title: payload.contact.title,
        firstName: payload.contact.firstName,
        lastName: payload.contact.lastName,
        phoneNumber: payload.contact.phoneNumber,
        preferredLocale: 'th',
      },
    };

    if (payload.contact.identityCardNumber) {
      bookingPayload.contact.identityCardNumber = payload.contact.identityCardNumber;
    }
    if (payload.contact.email) {
      bookingPayload.contact.email = payload.contact.email;
    }

    const key = this.idempotencyKey;

    this.staffApiService
      .createWalkInBooking(bookingPayload as Parameters<typeof this.staffApiService.createWalkInBooking>[0])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (bookingResp) => {
          const bId = bookingResp?.data?.bookingId ?? null;
          const bNum = bookingResp?.data?.bookingNumber ?? null;
          this.bookingId = bId;
          this.bookingNumber = bNum;

          if (!bId || !key) {
            this.isSelling = false;
            return;
          }

          this.staffApiService
            .payWalkIn(bId, key)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.isSelling = false;
                this.idempotencyKey = null;
                this.selectedSeats = [];
                this.seatPassengerTypes = {};
                // Silently refresh trips list
                this.loadTrips(this.selectedDate);
                // Navigate to e-ticket
                this.store.dispatch(
                  invokeSetBookingApi({
                    booking: { bookingId: bId, bookingNumber: bNum ?? '' },
                  })
                );
                void this.router.navigate(['/e-ticket']);
              },
              error: (err: unknown) => {
                this.isSelling = false;
                const message =
                  extractApiErrorMessage(err) ||
                  this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
                void this.alertService.error(message);
              },
            });
        },
        error: (err: unknown) => {
          this.isSelling = false;
          const message =
            extractApiErrorMessage(err) ||
            this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
          void this.alertService.error(message);
        },
      });
  }

  // ─── Schedule management ───────────────────────────────────────────────────

  private get currentScheduleLocale(): string {
    const raw = String(this.translate.currentLang || this.translate.getDefaultLang() || 'th').toLowerCase();
    return raw.startsWith('en') ? 'en' : 'th';
  }

  private applyScheduleLocalization(data: StaffSchedulesData): void {
    const locale = this.currentScheduleLocale;
    this.scheduleRouteOptions = data.routes.map((r) => ({
      code: r.slug,
      label: getAdminLookupLabel(r, locale) ?? getAdminTranslationLabel(r.translations, locale) ?? r.slug,
    }));
    this.scheduleVehicleTypeOptions = data.vehicleTypes.map((vt) => ({
      code: vt.slug,
      label: getAdminLookupLabel(vt, locale) ?? getAdminTranslationLabel(vt.translations, locale) ?? vt.slug,
    }));
    this.scheduleVehicleOptions = data.vehicles.map((v) => ({
      code: String(v.id),
      label: v.vehicleNumber ?? v.numberPlate ?? `#${v.id}`,
    }));
    this.scheduleDriverOptions = data.users
      .filter((u) =>
        (u.roles ?? []).some((role) => {
          const slug = typeof role === 'string' ? role : role.slug;
          return String(slug ?? '').trim().toLowerCase() === 'driver';
        })
      )
      .map((u) => ({
        code: String(u.id),
        label: u.fullName?.trim() || u.email?.trim() || `#${u.id}`,
      }));

    // Cold-open fix: if the create form is open and route is still blank+pristine
    // (store wasn't loaded yet when the modal opened), apply the first-option default
    // now — but never overwrite a user's manual pick. vehicleType is intentionally
    // NOT defaulted: per design-system §3.1 a form select starts on its placeholder
    // and the user picks explicitly (like Vehicle/Driver). Validators.required blocks
    // Confirm until they do.
    if (this.isScheduleFormOpen && !this.isScheduleEditMode) {
      const routeCtrl = this.scheduleItemForm.get('route');
      if (routeCtrl?.pristine && !routeCtrl.value && this.scheduleRouteOptions[0]?.code) {
        routeCtrl.setValue(this.scheduleRouteOptions[0].code);
      }
    }
  }

  protected isScheduleFieldInvalid(fieldName: string): boolean {
    const field = this.scheduleItemForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  /** Lazy-refresh store on first modal open. */
  private ensureScheduleStoreLoaded(): void {
    if (!this.scheduleStore.hasValue) {
      void this.scheduleStore.refresh();
    }
  }

  protected onAddScheduleClicked(): void {
    this.ensureScheduleStoreLoaded();
    this.isScheduleEditMode = false;
    this.editingScheduleId = null;
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    this.scheduleItemForm.reset({
      departureDate: this.selectedDate,
      departureTime: now,
      route: this.scheduleRouteOptions[0]?.code ?? '',
      vehicleType: '', // design-system §3.1: start on placeholder, user picks explicitly
      vehicleId: '',
      driverId: '',
    });
    this.isScheduleFormOpen = true;
  }

  protected onAddScheduleForRoute(event: { routeSlug: string; date: Date }): void {
    this.ensureScheduleStoreLoaded();
    this.isScheduleEditMode = false;
    this.editingScheduleId = null;
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    this.scheduleItemForm.reset({
      departureDate: event.date,
      departureTime: now,
      route: event.routeSlug,
      vehicleType: '', // design-system §3.1: start on placeholder, user picks explicitly
      vehicleId: '',
      driverId: '',
    });
    this.isScheduleFormOpen = true;
  }

  protected onEditScheduleClicked(event: { trip: WalkInTripDto; routeSlug: string }): void {
    this.ensureScheduleStoreLoaded();
    const { trip, routeSlug } = event;
    this.isScheduleEditMode = true;
    this.editingScheduleId = trip.scheduleId;

    // Build fallback synchronously from trip row data
    const fallbackDto: AdminScheduleDto = {
      id: trip.scheduleId,
      departureDateTime: trip.departureDateTime,
      status: '',
      route: { id: 0, slug: routeSlug },
      vehicleType: trip.vehicleType ? { id: 0, slug: trip.vehicleType } : undefined,
      vehicle: undefined,
      driver: undefined,
    };
    this.applyScheduleFormValues(fallbackDto);

    // Open modal immediately (optimistic)
    this.isScheduleFormOpen = true;
    this.isScheduleDetailLoading = true;

    // Fetch full detail and patch pristine-only controls
    this.adminApiService
      .getScheduleById(trip.scheduleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          const detail = resp?.data ?? null;
          if (detail && this.isScheduleFormOpen && this.editingScheduleId === trip.scheduleId) {
            this.applyScheduleFormValues(detail, true);
          }
          if (this.isScheduleFormOpen && this.editingScheduleId === trip.scheduleId) {
            this.isScheduleDetailLoading = false;
          }
        },
        error: () => {
          // Keep fallback values silently — do not close modal
          if (this.isScheduleFormOpen && this.editingScheduleId === trip.scheduleId) {
            this.isScheduleDetailLoading = false;
          }
        },
      });
  }

  protected closeScheduleForm(force = false): void {
    if (this.isScheduleSubmitting && !force) { return; }
    this.isScheduleFormOpen = false;
    this.isScheduleDetailLoading = false;
    this.editingScheduleId = null;
    this.scheduleItemForm.reset();
  }

  protected async submitSchedule(): Promise<void> {
    if (this.scheduleItemForm.invalid) {
      this.scheduleItemForm.markAllAsTouched();
      await this.alertService.warning(this.translate.instant('STAFF.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isScheduleSubmitting = true;
    try {
      const payload = this.toSchedulePayload();
      if (this.isScheduleEditMode && this.editingScheduleId != null) {
        await firstValueFrom(this.adminApiService.updateSchedule(this.editingScheduleId, payload));
        this.closeScheduleForm(true);
        this.loadTrips(this.selectedDate);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createSchedule(payload));
        this.closeScheduleForm(true);
        this.loadTrips(this.selectedDate);
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }
    } catch (error) {
      this.closeScheduleForm(true);
      const message = extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isScheduleSubmitting = false;
    }
  }

  protected onDeleteScheduleClicked(event: { trip: WalkInTripDto; routeSlug: string }): void {
    this.deletingTrip = event.trip;
    this.isScheduleDeleteOpen = true;
  }

  protected closeScheduleDelete(force = false): void {
    if (this.isScheduleDeleting && !force) { return; }
    this.isScheduleDeleteOpen = false;
    this.deletingTrip = null;
  }

  protected async confirmDeleteSchedule(): Promise<void> {
    if (!this.deletingTrip) { return; }
    const trip = this.deletingTrip;
    const scheduleId = trip.scheduleId;

    // OPTIMISTIC: remove from routeGroups immediately (new arrays — parent-owned)
    this.routeGroups = this.routeGroups
      .map((group) => ({
        ...group,
        trips: group.trips.filter((t) => t.scheduleId !== scheduleId),
      }))
      .filter((group) => group.trips.length > 0);

    // If the deleted trip was the selected trip, reset the selection
    // so checkout can't POST against a deleted schedule.
    if (this.selectedTrip?.scheduleId === scheduleId) {
      this.selectedTrip = null;
      this.selectedRouteSlug = null;
      this.selectedSeats = [];
      this.seatPassengerTypes = {};
      this.idempotencyKey = null;
      this._resetSegments();
    }

    // Close modal immediately
    this.isScheduleDeleting = true;
    this.closeScheduleDelete(true);

    try {
      await firstValueFrom(this.adminApiService.deleteSchedule(scheduleId));
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      this.loadTrips(this.selectedDate); // reconcile
    } catch (error) {
      const message = extractApiErrorMessage(error) || this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED');
      await this.alertService.error(message);
      this.loadTrips(this.selectedDate); // restore
    } finally {
      this.isScheduleDeleting = false;
    }
  }

  // ─── Schedule form helpers (mirroring staff-schedules-page patterns) ───────

  private splitScheduleDateTime(value: string | null | undefined): { date: string; time: string } {
    const v = String(value ?? '').trim();
    if (!v) return { date: '', time: '' };
    const [date, rawTime = ''] = v.includes('T') ? v.split('T') : v.split(/\s+/);
    return { date, time: rawTime.slice(0, 5) };
  }

  private toScheduleDateControlValue(dateStr: string | null | undefined): Date | null {
    const s = String(dateStr ?? '').trim();
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  private toScheduleTimeControlValue(timeStr: string | null | undefined): Date | null {
    const s = String(timeStr ?? '').trim().slice(0, 5);
    const [h, min] = s.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
    const date = new Date();
    date.setHours(h, min, 0, 0);
    return date;
  }

  private toScheduleDateInputValue(value: Date | null): string {
    if (!value || !Number.isFinite(value.getTime())) return '';
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private toScheduleTimeInputValue(value: Date | null): string {
    if (!value || !Number.isFinite(value.getTime())) return '';
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }

  private toScheduleDateValue(value: unknown): Date | null {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    const s = String(value ?? '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return this.toScheduleDateControlValue(s);
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return this.toScheduleTimeControlValue(s);
    const p = new Date(s);
    return Number.isFinite(p.getTime()) ? p : null;
  }

  private toScheduleOptionalNumber(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  private toSchedulePayload(): CreateSchedulePayload {
    const raw = this.scheduleItemForm.getRawValue();
    const departureDate = this.toScheduleDateInputValue(this.toScheduleDateValue(raw.departureDate));
    const departureTime = this.toScheduleTimeInputValue(this.toScheduleDateValue(raw.departureTime));
    const vehicleId = this.toScheduleOptionalNumber(raw.vehicleId);
    const driverId = this.toScheduleOptionalNumber(raw.driverId);
    return {
      departureDateTime: combineBangkokDateTime(departureDate, departureTime),
      route: String(raw.route ?? '').trim(),
      vehicleType: String(raw.vehicleType ?? '').trim(),
      ...(vehicleId !== undefined ? { vehicleId } : {}),
      ...(driverId !== undefined ? { driverId } : {}),
    };
  }

  private applyScheduleFormValues(dto: AdminScheduleDto, onlyPristine = false): void {
    const dep = this.splitScheduleDateTime(dto.departureDateTime);
    const values = {
      departureDate: this.toScheduleDateControlValue(dep.date),
      departureTime: this.toScheduleTimeControlValue(dep.time),
      route: dto.route?.slug ?? '',
      vehicleType: dto.vehicleType?.slug ?? '',
      vehicleId: dto.vehicle?.id ? String(dto.vehicle.id) : '',
      driverId: dto.driver?.id ? String(dto.driver.id) : '',
    };
    if (!onlyPristine) {
      this.scheduleItemForm.reset(values);
      return;
    }
    for (const [name, value] of Object.entries(values)) {
      const ctrl = this.scheduleItemForm.get(name);
      if (ctrl?.pristine) { ctrl.setValue(value); }
    }
  }

  // ─── Trip loading / segment logic (unchanged) ─────────────────────────────

  private loadTrips(date: Date): void {
    const dateStr = dayjs(date).format('YYYY-MM-DD');
    this.isLoadingTrips = true;

    this.staffApiService
      .getWalkInSchedules(dateStr)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.routeGroups = resp?.data ?? [];
          this.isLoadingTrips = false;
        },
        error: () => {
          this.routeGroups = [];
          this.isLoadingTrips = false;
        },
      });
  }

  private loadSegments(
    routeSlug: string,
    trip: WalkInTripDto,
    preserve?: { pickup: string; dropoff: string }
  ): void {
    this._resetSegments();
    if (!routeSlug) return;

    this.isLoadingSegments = true;
    const vehicleType = trip.vehicleType ?? null;

    this.staffApiService
      .getRouteSegments(routeSlug)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          if (this.selectedRouteSlug !== routeSlug) return;
          const allPairs = resp?.data?.stopPairs ?? [];
          const typed = vehicleType
            ? allPairs.filter((p) => p.vehicleType?.slug === vehicleType)
            : allPairs;
          const pairs = typed.length > 0 ? typed : allPairs;

          this.fareMap = new Map<string, number>();
          for (const p of pairs) {
            const fare = parseFloat(p.fare ?? '0');
            this.fareMap.set(
              `${p.fromStop.slug}|${p.toStop.slug}`,
              Number.isFinite(fare) ? fare : 0
            );
          }
          this._buildStopTimes(pairs, trip);
          this.orderedStops = this._buildOrderedStops(pairs);
          this._applyDefaultStops(preserve);

          const rawPopularPickup: PopularStopDto[] = resp?.data?.popularPickupStops ?? [];
          const rawPopularDropoff: PopularStopDto[] = resp?.data?.popularDropoffStops ?? [];
          this.popularPickupStops = rawPopularPickup.map(s => ({ slug: s.slug, name: s.name, time: this.stopTime(s.slug) }));
          this.popularDropoffStops = rawPopularDropoff.map(s => ({ slug: s.slug, name: s.name, time: this.stopTime(s.slug) }));

          this.isLoadingSegments = false;
        },
        error: () => {
          if (this.selectedRouteSlug !== routeSlug) return;
          this.isLoadingSegments = false;
        },
      });
  }

  // Map of stop slug → computed HH:mm time string (derived from departure + cumulative durations).
  private stopTimeMap = new Map<string, string>();

  private _buildStopTimes(
    pairs: SegmentStopPairDto[],
    trip: WalkInTripDto
  ): void {
    this.stopTimeMap = new Map<string, string>();
    const ordered = this._buildOrderedStops(pairs);
    if (ordered.length === 0) return;

    const departure = dayjs(trip.departureDateTime);
    let cumulativeMinutes = 0;
    // Once a leg's duration is missing, every downstream time becomes unreliable
    // (we'd under-count by the skipped leg), so blank the rest of the chain.
    let chainBroken = false;
    this.stopTimeMap.set(ordered[0].slug, departure.format('HH:mm'));

    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const curr = ordered[i];
      // Find a direct consecutive pair.
      const pair = pairs.find(
        (p) => p.fromStop.slug === prev.slug && p.toStop.slug === curr.slug
      );
      if (!chainBroken && pair && typeof pair.estimatedDurationMinutes === 'number' && pair.estimatedDurationMinutes > 0) {
        cumulativeMinutes += pair.estimatedDurationMinutes;
        this.stopTimeMap.set(curr.slug, departure.add(cumulativeMinutes, 'minute').format('HH:mm'));
      } else {
        // Can't determine this leg's duration → drop this stop's time and all
        // downstream ones rather than showing a too-early (under-counted) time.
        chainBroken = true;
        this.stopTimeMap.set(curr.slug, '');
      }
    }
  }

  /** Returns the computed HH:mm time for a stop slug, or '' if unknown. */
  private stopTime(slug: string): string {
    return this.stopTimeMap.get(slug) ?? '';
  }

  /** Order stops by in-degree (count of distinct upstream pickups). */
  private _buildOrderedStops(
    pairs: { fromStop: SegmentStopRefDto; toStop: SegmentStopRefDto }[]
  ): SegmentStopRefDto[] {
    const stops = new Map<string, SegmentStopRefDto>();
    const upstream = new Map<string, Set<string>>();
    for (const p of pairs) {
      stops.set(p.fromStop.slug, p.fromStop);
      stops.set(p.toStop.slug, p.toStop);
      const set = upstream.get(p.toStop.slug) ?? new Set<string>();
      set.add(p.fromStop.slug);
      upstream.set(p.toStop.slug, set);
    }
    return Array.from(stops.values()).sort(
      (a, b) => (upstream.get(a.slug)?.size ?? 0) - (upstream.get(b.slug)?.size ?? 0)
    );
  }

  /**
   * Default to the full route: origin (first) → destination (last). When
   * `preserve` is given (e.g. a language-switch reload) and its slugs are still
   * valid for the freshly-fetched stops, keep that selection instead — slugs are
   * locale-invariant, so only the displayed names should change.
   */
  private _applyDefaultStops(preserve?: { pickup: string; dropoff: string }): void {
    if (this.orderedStops.length < 2) return;
    if (preserve && this.orderedStops.some((s) => s.slug === preserve.pickup)) {
      this.pickupSlug = preserve.pickup;
      // dropoffOptions depends on pickupSlug, so it's valid to read now.
      this.dropoffSlug = this.dropoffOptions.some((s) => s.slug === preserve.dropoff)
        ? preserve.dropoff
        : this.dropoffOptions[0]?.slug ?? '';
      return;
    }
    this.pickupSlug = this.orderedStops[0].slug;
    const dest = this.orderedStops[this.orderedStops.length - 1].slug;
    this.dropoffSlug = this.fareMap.has(`${this.pickupSlug}|${dest}`)
      ? dest
      : this.dropoffOptions[0]?.slug ?? '';
  }

  /** Keep drop-off valid after a pickup change. */
  private onPickupChange(): void {
    if (!this.dropoffOptions.some((s) => s.slug === this.dropoffSlug)) {
      this.dropoffSlug = this.dropoffOptions[0]?.slug ?? '';
    }
  }

  private _resetSegments(): void {
    this.orderedStops = [];
    this.fareMap = new Map<string, number>();
    this.pickupSlug = '';
    this.dropoffSlug = '';
    this.stopTimeMap = new Map<string, string>();
    this.popularPickupStops = [];
    this.popularDropoffStops = [];
  }
}
