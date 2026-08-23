import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, Subject, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap, takeUntil } from 'rxjs/operators';
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
import { ParcelShareConfigStore } from './parcel-share-config.store';
import { mapApiErrorCode } from '../../../../shared/lib/api-error-code';
import { generateIdempotencyKey } from '../../../../shared/lib/idempotency-key';

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

/** OBRS-341 (card AC follow-up) — `POST /payments/walk-in` error codes that
 * are actually reachable from this call (`../OBRS-backend/docs/api/payment.md`
 * §POST /payments/walk-in — same prerequisite checks as the main payment
 * endpoint). `PAYMENT_METHOD_UNSUPPORTED`/`IDEMPOTENCY_MISMATCH` are not
 * mapped — this call always sends `cash` and always reuses one key per
 * booking, so either would indicate a client bug rather than something the
 * salesperson can act on; both fall through to the GENERIC fallback. */
const CARRY_ON_PAY_ERROR_KEYS: Record<string, string> = {
  BOOKING_ALREADY_PAID: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.PAY_BOOKING_ALREADY_PAID',
  PAYMENT_IN_PROGRESS: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.PAY_IN_PROGRESS',
  BOOKING_EXPIRED: 'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.PAY_BOOKING_EXPIRED',
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
    standalone: false
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

  /**
   * OBRS-960 — fail-SAFE default: `true` (banner SHOWN) until a fetch
   * proves `configured: true`. Any fetch error (including one with a
   * previously-cached `configured: true` value now stale) is read as
   * "treat unknown as unconfigured" per the card — never silently hidden.
   * See `parcel-consign-page.component.spec.ts`'s fail-safe assertion.
   */
  protected shareNotConfigured = true;

  protected isSubmitting = false;
  protected serverErrorKey: string | null = null;
  protected result: ParcelConsignedRespDto | null = null;
  /** OBRS-341 — set on a successful carry-on-on-seat submit. Mutually
   * exclusive with `result` above (only one branch's result is ever
   * populated at a time — switching modes clears both, see
   * `onModeChange()`). */
  protected carryOnResult: ParcelCarryOnRespDto | null = null;

  /** OBRS-341 (card AC follow-up) — the ON-SEAT branch mints a `pending`
   * booking that still needs the existing walk-in cash payment call; these
   * three drive the "เก็บเงินสด" button's three states (idle → paying →
   * paid) plus its own error line. Never set for a free-aisle result (that
   * branch shows no pay action at all — its 0.00 booking needs no payment). */
  protected carryOnPaid = false;
  protected isPayingCarryOn = false;
  protected carryOnPayErrorKey: string | null = null;

  /** Scrutinize (OBRS-341) — bumped by every mode switch. `onModeChange()`
   * clearing the fields is NOT enough on its own: a quote or submit request
   * issued under the OLD mode is still in flight, and its `next` handler
   * writes `quote`/`result`/`carryOnResult` AFTER the clear, re-displaying
   * the old branch's price or success panel under the new branch. Each
   * request captures the epoch at issue time and drops its own response if
   * the epoch has moved. (The pre-existing same-mode quote race — two
   * overlapping requests resolving out of order after a schedule/stop change
   * — is a DIFFERENT race and is closed separately by `quoteParams$` below,
   * OBRS-616.) */
  private modeEpoch = 0;

  /** OBRS-616 — every quote request is issued through this subject so
   * `switchMap` drops the previous one. Two requests overlap whenever a field
   * changes faster than the API answers (the form's 400ms debounce shortens
   * that window, it does not close it), and with a plain `.subscribe()` the
   * price on screen was decided by whichever response the network delivered
   * LAST — so a slower EARLIER request overwrote the newer price with a stale
   * one. `null` (params no longer complete) cancels whatever is in flight;
   * `onQuoteParamsChange()` still clears the displayed state itself. */
  private readonly quoteParams$ = new Subject<ParcelQuoteParams | null>();

  /** OBRS-341 (card AC follow-up) — bumped by `clearSubmissionState()`
   * (i.e. by BOTH `onModeChange()` and `onNextItem()`). Guards
   * `payWalkIn()` the same way `modeEpoch` guards the quote/submit calls: a
   * pay request issued for one item must not write its `paid`/error state
   * onto whatever the page shows after the salesperson has already moved on
   * (a mode switch, or "รับชิ้นต่อไป" on the SAME mode — the latter never
   * bumps `modeEpoch`, which is why this is a separate counter, not a reuse
   * of that one). See AGENT_MEMORY.md's OBRS-341 note on enumerating every
   * writer of the state a reset clears. */
  private resultEpoch = 0;
  /** Minted ONCE per carry-on booking, on the FIRST pay attempt, and reused
   * on every retry of that SAME booking — never regenerated per click, or a
   * double-click / retry-after-error becomes a double charge. Cleared only
   * by `clearSubmissionState()` (a new booking needs a new key). */
  private carryOnIdempotencyKey: string | null = null;

  private routeGroups: WalkInRouteGroupDto[] = [];
  private scheduleRouteSlug = new Map<number, string>();
  private orderedStops: OrderedStop[] = [];
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly staffApiService: StaffApiService,
    private readonly cargoStore: ParcelCargoAvailabilityStore,
    private readonly shareConfigStore: ParcelShareConfigStore
  ) {}

  ngOnInit(): void {
    this.loadSchedules(this.selectedDate);

    // OBRS-616 — the only place this page asks for a quote (both modes come
    // through here; `parcelType` is read per request). `switchMap` unsubscribes
    // the previous request, so an earlier response can no longer land at all;
    // the `modeEpoch` capture stays because a mode switch does not necessarily
    // emit new params (it clears the form), so the in-flight request of the
    // OLD mode must still be dropped on arrival. `catchError` is INSIDE the
    // inner observable on purpose: an error left to reach the outer pipeline
    // would kill this subscription and the page would silently stop quoting.
    this.quoteParams$
      .pipe(
        switchMap((params) => {
          if (!params) return EMPTY;
          const epoch = this.modeEpoch;
          return this.staffApiService.getParcelQuote({ parcelType: this.mode, ...params }).pipe(
            map((resp) => ({ epoch, quote: resp?.data ?? null, errorKey: null as string | null })),
            catchError((err: unknown) =>
              of({
                epoch,
                quote: null,
                errorKey: this.mapErrorCode(err, QUOTE_ERROR_KEYS, 'STAFF.PARCEL_CONSIGN.ERROR.QUOTE_FAILED'),
              })
            )
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(({ epoch, quote, errorKey }) => {
        if (epoch !== this.modeEpoch) return;
        this.quote = quote;
        this.quoteErrorKey = errorKey;
        this.isLoadingQuote = false;
      });

    this.cargoStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.cargoValue = data;
    });
    this.cargoStore.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((refreshing) => {
      this.isLoadingCargo = refreshing;
    });
    this.cargoStore.error$.pipe(takeUntil(this.destroy$)).subscribe((hasError) => {
      this.cargoErrorKey = hasError ? 'STAFF.PARCEL_CONSIGN.ERROR.CARGO_FAILED' : null;
    });

    // OBRS-960 — fail-safe: a successful fetch is the ONLY thing allowed to
    // clear the warning; an error (even over a previously-good cached value)
    // re-asserts it. Order matters: error$ is subscribed AFTER data$ so a
    // failure emitted after a success still wins (last subscription writes
    // last is not guaranteed by RxJS ordering alone, but each handler here
    // only ever WRITES its own outcome, so the most-recently-EMITTED event
    // — not subscription order — decides the value, which is what "fail
    // safe on the LATEST fetch's outcome" requires).
    this.shareConfigStore.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      if (data) {
        this.shareNotConfigured = !data.configured;
      } else {
        // OBRS-506: honor a null emission (AdminCollectionStore.clear(), e.g.
        // logout) — and here that's not just gate compliance, it's the SAME
        // fail-safe rule as the error$ branch below: no known-good config
        // means "treat unknown as unconfigured", never silently keep
        // whatever the warning happened to say before the clear.
        this.shareNotConfigured = true;
      }
    });
    this.shareConfigStore.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      if (failed) {
        this.shareNotConfigured = true;
      }
    });
    void this.shareConfigStore.refresh();
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
    this.modeEpoch++;
    this.clearSubmissionState();
  }

  /** OBRS-341 (card AC follow-up) — every field this page owns that belongs
   * to ONE submission attempt: the live quote, the create-parcel result
   * (either branch), and the carry-on payment sub-state. Factored out of
   * `onModeChange()` so `onNextItem()` below shares the EXACT same clear
   * rather than a hand-kept second list that can silently drift from it —
   * the AGENT_MEMORY.md OBRS-341 note is precisely about a reset missing a
   * field a sibling reset remembers. Always bumps `resultEpoch`; the caller
   * additionally bumps `modeEpoch` and changes `this.mode` when the trigger
   * is an actual mode switch (`onModeChange()` only). */
  private clearSubmissionState(): void {
    this.resultEpoch++;

    this.isSubmitting = false;
    this.quote = null;
    this.quoteErrorKey = null;
    this.isLoadingQuote = false;
    this.serverErrorKey = null;
    this.result = null;
    this.carryOnResult = null;
    this.carryOnPaid = false;
    this.isPayingCarryOn = false;
    this.carryOnPayErrorKey = null;
    this.carryOnIdempotencyKey = null;
    this.pickupOptions = [];
    this.dropoffOptions = [];
    this.carryOnAvailableSeatNumbers = [];
    this.orderedStops = [];
    this.cargoStore.setScheduleId(null);
  }

  /** OBRS-341 (card AC follow-up) — "รับชิ้นต่อไป": resets the page to an
   * empty form of the SAME mode (both branches) so the salesperson can take
   * the next parcel without re-selecting the tab. Does NOT touch
   * `this.mode`/`modeEpoch` — only `clearSubmissionState()`'s per-item
   * fields, plus the form's own full reset for the current mode. */
  protected onNextItem(): void {
    this.clearSubmissionState();
    this.formRef?.resetForNextItem();
  }

  /**
   * OBRS-341 (card AC follow-up) — "เก็บเงินสด": settles the just-minted
   * on-seat carry-on booking via the EXISTING walk-in cash payment call
   * (`StaffApiService.payWalkIn`, the SAME endpoint the passenger walk-in
   * sell flow already uses — see `sell-page.component.ts#submitWalkInBooking`
   * for the precedent this mirrors), never a new payment endpoint. Free-
   * aisle never reaches this method — the result panel does not render the
   * button for that branch at all (its 0.00 booking needs no payment).
   *
   * The idempotency key is minted ONCE per booking, on the first attempt,
   * and held across retries (`carryOnIdempotencyKey`) — regenerating it per
   * click would let a double-click, or a resubmit after a network error,
   * double-charge the same booking. `resultEpoch` guards the async response
   * the same way `modeEpoch` guards quote/submit above: a response for THIS
   * booking must not write `paid`/error state onto whatever the page shows
   * after the salesperson has already moved on (mode switch or next item).
   */
  protected onPayCash(): void {
    if (this.isPayingCarryOn || this.carryOnPaid) return;
    // Defense-in-depth: the result panel's template never renders the pay
    // button for a free-aisle result (design-system's "extend, don't fork"
    // component), but this guard means a future template refactor can't
    // silently make free-aisle payable by accident — that item genuinely
    // has a 0.00 booking that needs no payment step at all.
    if (this.carryOnResult?.freeAisle) return;
    const bookingId = this.carryOnResult?.bookingId;
    if (!bookingId) return;

    if (!this.carryOnIdempotencyKey) {
      this.carryOnIdempotencyKey = generateIdempotencyKey();
    }
    const key = this.carryOnIdempotencyKey;
    const epoch = this.resultEpoch;

    this.isPayingCarryOn = true;
    this.carryOnPayErrorKey = null;
    this.staffApiService
      .payWalkIn(bookingId, key)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (epoch !== this.resultEpoch) return;
          this.isPayingCarryOn = false;
          this.carryOnPaid = true;
        },
        error: (err: unknown) => {
          if (epoch !== this.resultEpoch) return;
          this.isPayingCarryOn = false;
          this.carryOnPayErrorKey = this.mapErrorCode(
            err,
            CARRY_ON_PAY_ERROR_KEYS,
            'STAFF.PARCEL_CONSIGN.CARRY_ON.ERROR.PAY_FAILED'
          );
        },
      });
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
      this.quoteParams$.next(null);
      return;
    }

    this.isLoadingQuote = true;
    this.quoteErrorKey = null;
    this.quoteParams$.next(params);
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

    const epoch = this.modeEpoch;
    this.staffApiService
      .createConsignedParcel(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          if (epoch !== this.modeEpoch) return;
          this.isSubmitting = false;
          this.result = resp?.data ?? null;
        },
        error: (err: unknown) => {
          if (epoch !== this.modeEpoch) return;
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

    const epoch = this.modeEpoch;
    this.staffApiService
      .createCarryOnParcel(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          if (epoch !== this.modeEpoch) return;
          this.isSubmitting = false;
          this.carryOnResult = resp?.data ?? null;
        },
        error: (err: unknown) => {
          if (epoch !== this.modeEpoch) return;
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
