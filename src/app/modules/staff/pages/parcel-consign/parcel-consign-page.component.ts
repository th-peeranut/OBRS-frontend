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
  ParcelConsignedReqDto,
  ParcelConsignedRespDto,
  ParcelQuoteRespDto,
} from '../../../../shared/interfaces/parcel.interface';
import {
  ParcelConsignFormComponent,
  ParcelConsignFormValue,
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

/** Smart page: `/staff/parcels/consign` (salesperson-only). Owns every HTTP
 * call for the consigned-intake form (design-system: dumb form component
 * emits, smart page fetches). Component-scoped `ParcelCargoAvailabilityStore`
 * (providers: [] — see that store's doc comment) drives the cargo-remaining
 * indicator; the live quote is a thin direct service call (no store, per the
 * locked UX spec). */
@Component({
  selector: 'app-parcel-consign-page',
  templateUrl: './parcel-consign-page.component.html',
  styleUrl: './parcel-consign-page.component.scss',
  providers: [ParcelCargoAvailabilityStore],
})
export class ParcelConsignPageComponent implements OnInit, OnDestroy {
  @ViewChild(ParcelConsignFormComponent) formRef?: ParcelConsignFormComponent;

  protected selectedDate: Date = new Date();
  protected scheduleOptions: ParcelDropdownOption[] = [];
  protected pickupOptions: ParcelDropdownOption[] = [];
  protected dropoffOptions: ParcelDropdownOption[] = [];
  protected isLoadingStops = false;

  protected quote: ParcelQuoteRespDto | null = null;
  protected isLoadingQuote = false;
  protected quoteErrorKey: string | null = null;

  protected isLoadingCargo = false;
  protected cargoErrorKey: string | null = null;
  protected cargoValue: CargoAvailabilityRespDto | null = null;

  protected isSubmitting = false;
  protected serverErrorKey: string | null = null;
  protected result: ParcelConsignedRespDto | null = null;

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
    this.loadStopsForRoute(routeSlug);
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
      .getParcelQuote({ parcelType: 'consigned', ...params })
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

  protected onSubmit(value: ParcelConsignFormValue): void {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.serverErrorKey = null;

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

  private mapErrorCode(err: unknown, map: Record<string, string>, fallbackKey: string): string {
    const errorCode = (err as HttpErrorResponse)?.error?.errorCode as string | undefined;
    return mapApiErrorCode(errorCode, map, fallbackKey);
  }
}
