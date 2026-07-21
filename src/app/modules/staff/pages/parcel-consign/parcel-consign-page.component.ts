import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import dayjs from 'dayjs';
import {
  RouteSegmentsDto,
  RouteStopsDto,
  StaffApiService,
  WalkInRouteGroupDto,
} from '../../../../services/staff/staff-api.service';
import {
  CargoAvailabilityRespDto,
  ParcelCarryOnReqDto,
  ParcelCarryOnRespDto,
  ParcelConsignedReqDto,
  ParcelConsignedRespDto,
  ParcelQuoteRespDto,
} from '../../../../shared/interfaces/parcel.interface';
import {
  ParcelCarryOnFormValue,
  ParcelConsignFormComponent,
  ParcelConsignFormValue,
  ParcelConsignMode,
  ParcelDropdownOption,
  ParcelQuoteParams,
} from '../../components/parcel-consign-form/parcel-consign-form.component';
import { ParcelCargoAvailabilityStore } from './parcel-cargo-availability.store';
import { mapApiErrorCode } from '../../../../shared/lib/api-error-code';

interface OrderedStop {
  id: number;
  slug: string;
  name: string;
  stopOrder: number;
}

const QUOTE_ERROR_KEYS: Record<string, string> = {
  PARCEL_STOP_PAIR_NOT_PRICEABLE: 'STAFF.PARCEL_CONSIGN.ERROR.STOP_PAIR_NOT_PRICEABLE',
};

const SUBMIT_ERROR_KEYS: Record<string, string> = {
  PARCEL_PROHIBITED_CATEGORY: 'STAFF.PARCEL_CONSIGN.ERROR.PROHIBITED_CATEGORY',
  PARCEL_CARGO_CAPACITY_EXCEEDED: 'STAFF.PARCEL_CONSIGN.ERROR.CARGO_CAPACITY_EXCEEDED',
  PARCEL_CARGO_CAPACITY_NOT_CONFIGURED: 'STAFF.PARCEL_CONSIGN.ERROR.CARGO_CAPACITY_NOT_CONFIGURED',
  PARCEL_STOP_PAIR_NOT_PRICEABLE: 'STAFF.PARCEL_CONSIGN.ERROR.STOP_PAIR_NOT_PRICEABLE',
};

/** OBRS-341 — carry-on-on-seat submit-time error codes, straight off
 * `../OBRS-backend/docs/api/parcels.md`'s error table. Kept as its own map
 * (rather than merged into `SUBMIT_ERROR_KEYS`) because several codes only
 * make sense for this branch (seat-related) and the two branches' i18n
 * namespaces are deliberately separate (`ERROR.*` vs `CARRY_ON.ERROR.*`). */
const CARRY_ON_SUBMIT_ERROR_KEYS: Record<string, string> = {
  PARCEL_TYPE_NOT_SUPPORTED: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.TYPE_NOT_SUPPORTED',
  PARCEL_PROHIBITED_NOT_ACKNOWLEDGED: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.PROHIBITED_NOT_ACKNOWLEDGED',
  PARCEL_PAYMENT_METHOD_NOT_SUPPORTED: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.PAYMENT_METHOD_NOT_SUPPORTED',
  PARCEL_WEIGHT_EXCEEDS_MAX: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.WEIGHT_EXCEEDS_MAX',
  PARCEL_SEAT_COUNT_REQUIRED: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.SEAT_COUNT_REQUIRED',
  PARCEL_SEAT_COUNT_NOT_ALLOWED: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.SEAT_COUNT_NOT_ALLOWED',
  PARCEL_SEAT_NUMBERS_MISMATCH: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.SEAT_NUMBERS_MISMATCH',
  PARCEL_SEATS_DUPLICATE: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.SEATS_DUPLICATE',
  PARCEL_SEATS_NOT_FOUND: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.SEATS_NOT_FOUND',
  PARCEL_STOP_PAIR_NOT_PRICEABLE: 'STAFF.PARCEL_CONSIGN.ERROR.STOP_PAIR_NOT_PRICEABLE',
  PARCEL_SEATS_UNAVAILABLE: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.SEATS_UNAVAILABLE',
  PARCEL_SEATS_INSUFFICIENT: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.SEATS_INSUFFICIENT',
  PARCEL_FREE_AISLE_CAP_EXCEEDED: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.FREE_AISLE_CAP_EXCEEDED',
};

/** Smart page: `/staff/parcels/consign` (salesperson-only). Owns every HTTP
 * call for the consigned-intake form (design-system: dumb form component
 * emits, smart page fetches). Component-scoped `ParcelCargoAvailabilityStore`
 * (providers: [] — see that store's doc comment) drives the cargo-remaining
 * indicator; the live quote is a thin direct service call (no store, per the
 * locked UX spec).
 *
 * OBRS-341: a mode toggle at the top switches between the CONSIGNED branch
 * (unchanged) and the CARRY-ON-ON-SEAT branch, both against
 * `POST /parcels/walk-in` — reusing this same page/form pair rather than a
 * new route (locked decision, OBRS-341 brief). Consigned stays the default
 * so existing behaviour is unchanged on load. */
@Component({
  selector: 'app-parcel-consign-page',
  templateUrl: './parcel-consign-page.component.html',
  styleUrl: './parcel-consign-page.component.scss',
  providers: [ParcelCargoAvailabilityStore],
})
export class ParcelConsignPageComponent implements OnInit, OnDestroy {
  @ViewChild(ParcelConsignFormComponent) formRef?: ParcelConsignFormComponent;

  protected mode: ParcelConsignMode = 'consigned';

  protected selectedDate: Date = new Date();
  protected scheduleOptions: ParcelDropdownOption[] = [];
  protected pickupOptions: ParcelDropdownOption[] = [];
  protected dropoffOptions: ParcelDropdownOption[] = [];
  protected isLoadingStops = false;

  /** OBRS-341 — the selected trip's whole-trip seat numbers, passed through
   * to the form's optional explicit-seat-selection checklist. */
  protected carryOnAvailableSeatNumbers: string[] = [];

  protected quote: ParcelQuoteRespDto | null = null;
  protected isLoadingQuote = false;
  protected quoteErrorKey: string | null = null;

  protected isLoadingCargo = false;
  protected cargoErrorKey: string | null = null;
  protected cargoValue: CargoAvailabilityRespDto | null = null;

  protected isSubmitting = false;
  protected serverErrorKey: string | null = null;
  protected result: ParcelConsignedRespDto | null = null;
  /** OBRS-341 — set on a successful carry-on-on-seat submit. Mutually
   * exclusive with `result` above (only one branch's result is ever
   * populated at a time — switching modes clears both, see
   * `onModeChange()`). */
  protected carryOnResult: ParcelCarryOnRespDto | null = null;

  private routeGroups: WalkInRouteGroupDto[] = [];
  private scheduleRouteSlug = new Map<number, string>();
  private orderedStops: OrderedStop[] = [];
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly staffApiService: StaffApiService,
    private readonly cargoStore: ParcelCargoAvailabilityStore
  ) {}

  ngOnInit(): void {
    this.loadSchedules(this.selectedDate);

    this.cargoStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.cargoValue = data;
    });
    this.cargoStore.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isLoadingCargo = refreshing;
    });
    this.cargoStore.error$.pipe(takeUntil(this.destroy$)).subscribe((hasError) => {
      this.cargoErrorKey = hasError ? 'STAFF.PARCEL_CONSIGN.ERROR.CARGO_FAILED' : null;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** OBRS-341 — switching modes clears every piece of per-submission state
   * (quote, result, server error) AND the schedule/stop selection, in
   * lockstep with the form's own full reset (`ParcelConsignFormComponent
   * .resetForMode()`) — see that method's doc comment for why a full reset,
   * rather than a hand-enumerated per-field clear, is the deliberate choice
   * here. This is what guarantees "mode switching does not leak state
   * between branches": nothing carried over from the old mode survives a
   * switch on EITHER side of the page/form boundary. */
  protected onModeChange(mode: ParcelConsignMode): void {
    if (this.mode === mode) return;
    this.mode = mode;

    this.quote = null;
    this.quoteErrorKey = null;
    this.isLoadingQuote = false;
    this.serverErrorKey = null;
    this.result = null;
    this.carryOnResult = null;
    this.pickupOptions = [];
    this.dropoffOptions = [];
    this.carryOnAvailableSeatNumbers = [];
    this.orderedStops = [];
    this.cargoStore.setScheduleId(null);
  }

  protected onDateChange(date: Date): void {
    this.selectedDate = date;
    this.loadSchedules(date);
  }

  private loadSchedules(date: Date): void {
    const dateStr = dayjs(date).format('YYYY-MM-DD');
    this.staffApiService
      .getWalkInSchedules(dateStr)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.routeGroups = resp?.data ?? [];
          this.scheduleRouteSlug.clear();
          this.scheduleOptions = [];
          for (const group of this.routeGroups) {
            for (const trip of group.trips) {
              this.scheduleRouteSlug.set(trip.scheduleId, group.routeSlug);
              this.scheduleOptions.push({
                value: String(trip.scheduleId),
                label: `${group.routeLabel} · ${dayjs(trip.departureDateTime).format('HH:mm')} · ${trip.vehicleType}`,
              });
            }
          }
        },
        error: () => {
          this.routeGroups = [];
          this.scheduleOptions = [];
        },
      });
  }

  protected onScheduleChange(value: string): void {
    this.pickupOptions = [];
    this.dropoffOptions = [];
    this.orderedStops = [];
    this.carryOnAvailableSeatNumbers = [];
    this.formRef?.clearStopSelections();
    this.quote = null;
    this.quoteErrorKey = null;

    const scheduleId = Number(value);
    const routeSlug = this.scheduleRouteSlug.get(scheduleId);
    if (!routeSlug) {
      this.cargoStore.setScheduleId(null);
      return;
    }

    this.cargoStore.setScheduleId(scheduleId);
    void this.cargoStore.refresh();
    this.carryOnAvailableSeatNumbers = this.findTripSeatNumbers(scheduleId);
    this.loadStopsForRoute(routeSlug);
  }

  /** OBRS-341 — `WalkInTripDto.availableSeatNumbers` for the chosen trip, the
   * same source `getWalkInSchedules()` already populated for the schedule
   * dropdown above (no extra HTTP call). */
  private findTripSeatNumbers(scheduleId: number): string[] {
    for (const group of this.routeGroups) {
      const trip = group.trips.find((t) => t.scheduleId === scheduleId);
      if (trip) return trip.availableSeatNumbers ?? [];
    }
    return [];
  }

  private loadStopsForRoute(routeSlug: string): void {
    this.isLoadingStops = true;
    forkJoin({
      segments: this.staffApiService.getRouteSegments(routeSlug),
      stops: this.staffApiService.getRouteStops(routeSlug),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ segments, stops }) => {
          this.orderedStops = this.buildOrderedStops(segments?.data, stops?.data);
          this.pickupOptions = this.orderedStops.map((s) => ({ value: String(s.id), label: s.name }));
          this.dropoffOptions = [];
          this.isLoadingStops = false;
        },
        error: () => {
          this.orderedStops = [];
          this.pickupOptions = [];
          this.dropoffOptions = [];
          this.isLoadingStops = false;
        },
      });
  }

  /**
   * OBRS-305 (QA-flagged blocker, 2026-07-14): a stop with no numeric `id`
   * (`s.stop?.id`) is skipped rather than pushed with a placeholder — a
   * `pickupStopId`/`dropoffStopId` the backend can't resolve is worse than a
   * missing dropdown option. This is exactly what caused the reported bug:
   * at QA time, `GET /private/route-stops/{slug}` didn't return `id` at all
   * (`LookupResponse` had no `id` field yet), so EVERY stop was skipped and
   * both dropdowns rendered empty. Verified end-to-end against the backend
   * fix (`OBRS-backend-wt-obrs-305-parcel-consigned-delivery`'s
   * `LookupResponse`/`StopDtoService.toLookupResponse` diff): the field
   * lands at exactly `stops[].stop.id`, matching what's read here — no
   * mapping change needed once that backend change ships. `id` stays
   * optional (`RouteStopTimeDto.stop.id?: number`, staff-api.service.ts) so
   * a stop from a not-yet-upgraded backend degrades to "skipped" again
   * rather than a runtime error, but every stop should carry it once the
   * fix is deployed — see `parcel-consign-page.component.spec.ts` for both
   * the "id present -> populated" and "id absent -> skipped" cases.
   */
  private buildOrderedStops(
    segments: RouteSegmentsDto | undefined,
    stops: RouteStopsDto | undefined
  ): OrderedStop[] {
    const nameBySlug = new Map<string, string>();
    for (const pair of segments?.stopPairs ?? []) {
      nameBySlug.set(pair.fromStop.slug, pair.fromStop.name);
      nameBySlug.set(pair.toStop.slug, pair.toStop.name);
    }

    const ordered: OrderedStop[] = [];
    for (const s of stops?.stops ?? []) {
      const slug = s.stop?.code;
      const id = s.stop?.id;
      if (!slug || id == null) continue;
      ordered.push({ id, slug, name: nameBySlug.get(slug) ?? slug, stopOrder: s.stopOrder });
    }
    return ordered.sort((a, b) => a.stopOrder - b.stopOrder);
  }

  /** Client pre-check (design spec): dropoff options are restricted to stops
   * strictly after the chosen pickup's stop_order, so the salesperson
   * physically cannot pick an invalid pair — the backend still re-validates. */
  protected onPickupChange(value: string): void {
    this.formRef?.clearDropoffSelection();
    const pickupId = Number(value);
    const pickup = this.orderedStops.find((s) => s.id === pickupId);
    if (!pickup) {
      this.dropoffOptions = [];
      return;
    }
    this.dropoffOptions = this.orderedStops
      .filter((s) => s.stopOrder > pickup.stopOrder)
      .map((s) => ({ value: String(s.id), label: s.name }));
  }

  protected onQuoteParamsChange(params: ParcelQuoteParams | null): void {
    if (!params) {
      this.quote = null;
      this.quoteErrorKey = null;
      this.isLoadingQuote = false;
      return;
    }

    this.isLoadingQuote = true;
    this.quoteErrorKey = null;
    this.staffApiService
      .getParcelQuote({ parcelType: this.mode, ...params })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.quote = resp?.data ?? null;
          this.isLoadingQuote = false;
        },
        error: (err: unknown) => {
          this.quote = null;
          this.isLoadingQuote = false;
          this.quoteErrorKey = this.mapErrorCode(err, QUOTE_ERROR_KEYS, 'STAFF.PARCEL_CONSIGN.ERROR.QUOTE_FAILED');
        },
      });
  }

  protected onSubmit(value: ParcelConsignFormValue | ParcelCarryOnFormValue): void {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.serverErrorKey = null;

    if (value.mode === 'carry_on_seat') {
      this.submitCarryOn(value);
      return;
    }
    this.submitConsigned(value);
  }

  private submitConsigned(value: ParcelConsignFormValue): void {
    const payload: ParcelConsignedReqDto = {
      parcelType: 'consigned',
      scheduleId: value.scheduleId,
      pickupStopId: value.pickupStopId,
      dropoffStopId: value.dropoffStopId,
      weightKg: value.weightKg,
      description: value.description,
      prohibitedAcknowledged: value.prohibitedAcknowledged,
      sender: value.sender,
      recipient: value.recipient,
      paymentMethod: 'cash',
      seatCount: null,
      ...(value.dimensions ? { dimensions: value.dimensions } : {}),
    };

    this.staffApiService
      .createConsignedParcel(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.isSubmitting = false;
          this.result = resp?.data ?? null;
        },
        error: (err: unknown) => {
          this.isSubmitting = false;
          this.serverErrorKey = this.mapErrorCode(err, SUBMIT_ERROR_KEYS, 'STAFF.PARCEL_CONSIGN.ERROR.GENERIC');
        },
      });
  }

  private submitCarryOn(value: ParcelCarryOnFormValue): void {
    const payload: ParcelCarryOnReqDto = {
      parcelType: 'carry_on_seat',
      scheduleId: value.scheduleId,
      pickupStopId: value.pickupStopId,
      dropoffStopId: value.dropoffStopId,
      weightKg: value.weightKg,
      dimensions: value.dimensions,
      description: value.description,
      prohibitedAcknowledged: value.prohibitedAcknowledged,
      sender: value.sender,
      paymentMethod: 'cash',
      // MUST BE ABSENT (not null) for a free-aisle item — the form only
      // sets these on its emitted value when the classification is on-seat.
      ...(value.seatCount != null ? { seatCount: value.seatCount } : {}),
      ...(value.seatNumbers ? { seatNumbers: value.seatNumbers } : {}),
    };

    this.staffApiService
      .createCarryOnParcel(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.isSubmitting = false;
          this.carryOnResult = resp?.data ?? null;
        },
        error: (err: unknown) => {
          this.isSubmitting = false;
          this.serverErrorKey = this.mapErrorCode(
            err,
            CARRY_ON_SUBMIT_ERROR_KEYS,
            'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.GENERIC'
          );
        },
      });
  }

  private mapErrorCode(err: unknown, map: Record<string, string>, fallbackKey: string): string {
    const errorCode = (err as HttpErrorResponse)?.error?.errorCode as string | undefined;
    return mapApiErrorCode(errorCode, map, fallbackKey);
  }
}
