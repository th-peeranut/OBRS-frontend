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
import { TITLE_OPTIONS } from '../../../../shared/constants/title-options';
import { combineLatest, Observable, of, Subject } from 'rxjs';
import { select, Store } from '@ngrx/store';
import {
  Schedule,
  ScheduleFilter,
  SeatMapRespDto,
} from '../../../../shared/interfaces/schedule.interface';
import { selectScheduleFilter } from '../../../../shared/stores/schedule-filter/schedule-filter.selector';
import {
  invokeGetPassengerInfo,
  invokeSetPassengerInfo,
} from '../../../../shared/stores/passenger-info/passenger-info.action';
import { selectPassengerInfo } from '../../../../shared/stores/passenger-info/passenger-info.selector';
import { PassengerInfo } from '../../../../shared/interfaces/passenger-info.interface';
import {
  catchError,
  debounceTime,
  filter,
  map,
  switchMap,
  takeUntil,
} from 'rxjs/operators';
import { selectScheduleBooking } from '../../../../shared/stores/schedule-booking/schedule-booking.selector';
import { ScheduleBooking } from '../../../../shared/interfaces/schedule-booking.interface';
import { shareReplay } from 'rxjs/operators';
import { MAX_PASSENGERS_PER_BOOKING, LOW_SEAT_THRESHOLD } from '../../../../shared/constants/passenger-limits';
import { isLowSeatCount } from '../../../../shared/lib/trip-format';
import { normalizeSeatNumber } from '../../../../shared/lib/seat-label';
import { ScheduleService } from '../../../../services/schedule/schedule.service';

/** Seat-attribute list, keyed by the backend's plain-numeric seat label
 *  (OBRS-362). Shared shape between the fetch pipelines and the template. */
export type SeatAttributeMap = Record<string, ('WHEELCHAIR' | 'EXTRA_LEGROOM')[]>;

@Component({
  selector: 'app-passenger-info-form',
  templateUrl: './passenger-info-form.component.html',
  styleUrl: './passenger-info-form.component.scss',
})
export class PassengerInfoFormComponent implements OnInit, OnDestroy {
  passengerForm: FormGroup;
  passengerInfo: Observable<PassengerInfo[] | null>;
  scheduleBooking$: Observable<ScheduleBooking | null>;
  isVanVehicle$: Observable<boolean>;
  availableSeatNumbers$: Observable<string[]>;
  isReturnTrip$: Observable<boolean>;
  isVanVehicleReturn$: Observable<boolean>;
  availableSeatNumbersReturn$: Observable<string[]>;

  /**
   * OPEN-seating (OBRS-323/318-c) — each leg's seating mode is INDEPENDENT, so a
   * round trip can mix an OPEN outbound with an ASSIGNED return (or vice versa).
   * The template hides only the OPEN leg's seat map and replaces it with an
   * inline passenger-count card; see `passenger-info-form.component.html`.
   */
  isOpenSeatingOutbound$: Observable<boolean>;
  isOpenSeatingReturn$: Observable<boolean>;
  openSeatAvailableOutbound$: Observable<number>;
  openSeatAvailableReturn$: Observable<number>;
  /** True only when every leg on this booking is OPEN (both legs on a round
   *  trip, or the single leg on a one-way) — the only case where the shared
   *  "Seat selection" card title/hint is dropped entirely (no leg has a map). */
  allLegsOpenSeating$: Observable<boolean>;
  /** min(availableSeats of each OPEN leg, MAX_PASSENGERS_PER_BOOKING) — the
   *  actual +/- ceiling for the OPEN-seating passenger-count card(s). */
  openSeatMaxCount$: Observable<number>;
  /** Seats remaining shown on the single shared count card when every leg is
   *  OPEN — the binding constraint across legs, i.e. the smaller of the two. */
  openSeatAvailableShared$: Observable<number>;

  /**
   * OBRS-361: per-leg context `showSeatPreferenceFields()` needs to decide
   * visibility — reuses the existing per-leg `isOpenSeatingOutbound$` /
   * `isOpenSeatingReturn$` / `isReturnTrip$` sources (never re-derives
   * `seatingMode` from scratch) combined into one object so the template
   * only subscribes once per passenger row.
   */
  passengerPrefsContext$: Observable<{
    outboundOpen: boolean;
    returnOpen: boolean;
    isReturn: boolean;
  }>;

  /**
   * OBRS-362: seat-attribute (wheelchair/extra-legroom) maps, fetched via
   * `GET /schedules/{id}/seats` — ASSIGNED legs only (an OPEN leg has no
   * fixed seats to badge). `shareReplay(1)` + `catchError(() => of({}))`:
   * non-blocking, best-effort — a failed/slow fetch never blocks booking,
   * it just renders zero badges.
   */
  seatAttributesOutbound$: Observable<SeatAttributeMap>;
  seatAttributesReturn$: Observable<SeatAttributeMap>;

  readonly maxPassengersPerBooking = MAX_PASSENGERS_PER_BOOKING;

  /** p-selectButton option lists (OBRS-361) — icon + i18n label KEY (the
   *  template applies `| translate`, so language switches update live). */
  readonly seatPreferenceOptions: { value: 'WINDOW' | 'AISLE'; icon: string; labelKey: string }[] = [
    { value: 'WINDOW', icon: 'window', labelKey: 'PASSENGER_INFO.FORM.SEAT_PREFERENCE_WINDOW' },
    { value: 'AISLE', icon: 'directions_walk', labelKey: 'PASSENGER_INFO.FORM.SEAT_PREFERENCE_AISLE' },
  ];
  readonly seatRequirementOptions: {
    value: 'WHEELCHAIR' | 'EXTRA_LEGROOM';
    icon: string;
    labelKey: string;
  }[] = [
    {
      value: 'WHEELCHAIR',
      icon: 'accessible',
      labelKey: 'PASSENGER_INFO.FORM.SEAT_REQUIREMENT_WHEELCHAIR',
    },
    {
      value: 'EXTRA_LEGROOM',
      icon: 'airline_seat_legroom_extra',
      labelKey: 'PASSENGER_INFO.FORM.SEAT_REQUIREMENT_EXTRA_LEGROOM',
    },
  ];

  /**
   * "เหลือ X ที่นั่ง" on the OPEN count card is a near-full scarcity signal only —
   * shown iff `available <= LOW_SEAT_THRESHOLD` (0 < available), matching the
   * search results list convention (`ScheduleBookingListComponent`). Above the
   * threshold the remaining count is hidden; the +/- cap still applies silently.
   */
  isLowSeat(available: number | null | undefined): boolean {
    return isLowSeatCount(available, LOW_SEAT_THRESHOLD);
  }

  private destroy$ = new Subject<void>();
  private isPatchingFromStore = false;
  @Output() validityChange = new EventEmitter<boolean>();
  @Output() useBookerAsPassenger = new EventEmitter<number>();

  /**
   * Index of the ACTIVE passenger for the shared outbound/return seat maps
   * (OBRS-242 — one seat map per leg, not one per passenger). Clicking an
   * available seat on the shared map assigns it to whichever passenger is
   * active here.
   */
  activeOutboundIndex = 0;
  activeReturnIndex = 0;

  titleOptions: Dropdown[] = [...TITLE_OPTIONS];

  scheduleFilter: Observable<ScheduleFilter>;

  constructor(
    private store: Store,
    private router: Router,
    private fb: FormBuilder,
    private translateService: TranslateService,
    private scheduleService: ScheduleService
  ) {
    this.scheduleFilter = this.store.pipe(select(selectScheduleFilter));
    this.passengerInfo = this.store.pipe(select(selectPassengerInfo));
    this.scheduleBooking$ = this.store.pipe(
      select(selectScheduleBooking)
    ) as Observable<ScheduleBooking | null>;
    this.isVanVehicle$ = this.scheduleBooking$.pipe(
      map((booking) => {
        const scheduleData = this.outboundSchedule(booking);
        const vehicleTypeName = scheduleData?.vehicleType ?? '';
        const normalized = vehicleTypeName.toLowerCase();
        return normalized === 'van' || normalized === 'minibus';
      }),
      shareReplay(1)
    );
    this.availableSeatNumbers$ = this.scheduleBooking$.pipe(
      map((booking) => this.outboundSchedule(booking)?.availableSeatNumbers ?? []),
      shareReplay(1)
    );

    // Return (inbound) leg — only present on round-trip bookings, where the
    // schedule-booking store holds an array of two schedules. The arrival
    // vehicle/availability is independent of the departure leg.
    this.isReturnTrip$ = this.scheduleBooking$.pipe(
      map((booking) => this.returnSchedule(booking) !== null),
      shareReplay(1)
    );
    this.isVanVehicleReturn$ = this.scheduleBooking$.pipe(
      map((booking) => {
        const normalized = (this.returnSchedule(booking)?.vehicleType ?? '').toLowerCase();
        return normalized === 'van' || normalized === 'minibus';
      }),
      shareReplay(1)
    );
    this.availableSeatNumbersReturn$ = this.scheduleBooking$.pipe(
      map((booking) => this.returnSchedule(booking)?.availableSeatNumbers ?? []),
      shareReplay(1)
    );

    // OPEN-seating (OBRS-323) — each leg checked independently off the same
    // schedule-booking snapshot, mirroring the isVanVehicle$/isVanVehicleReturn$
    // outbound/return pairing above.
    this.isOpenSeatingOutbound$ = this.scheduleBooking$.pipe(
      map((booking) => this.outboundSchedule(booking)?.seatingMode === 'OPEN'),
      shareReplay(1)
    );
    this.isOpenSeatingReturn$ = this.scheduleBooking$.pipe(
      map((booking) => this.returnSchedule(booking)?.seatingMode === 'OPEN'),
      shareReplay(1)
    );
    this.openSeatAvailableOutbound$ = this.scheduleBooking$.pipe(
      map((booking) => this.outboundSchedule(booking)?.availableSeats ?? 0),
      shareReplay(1)
    );
    this.openSeatAvailableReturn$ = this.scheduleBooking$.pipe(
      map((booking) => this.returnSchedule(booking)?.availableSeats ?? 0),
      shareReplay(1)
    );
    this.allLegsOpenSeating$ = combineLatest([
      this.isReturnTrip$,
      this.isOpenSeatingOutbound$,
      this.isOpenSeatingReturn$,
    ]).pipe(
      map(([isReturn, openOutbound, openReturn]) =>
        isReturn ? openOutbound && openReturn : openOutbound
      ),
      shareReplay(1)
    );
    this.openSeatMaxCount$ = combineLatest([
      this.isOpenSeatingOutbound$,
      this.isOpenSeatingReturn$,
      this.openSeatAvailableOutbound$,
      this.openSeatAvailableReturn$,
    ]).pipe(
      map(([openOutbound, openReturn, availOutbound, availReturn]) => {
        const caps = [MAX_PASSENGERS_PER_BOOKING];
        if (openOutbound) {
          caps.push(availOutbound);
        }
        if (openReturn) {
          caps.push(availReturn);
        }
        return Math.min(...caps);
      }),
      shareReplay(1)
    );
    this.openSeatAvailableShared$ = combineLatest([
      this.isReturnTrip$,
      this.openSeatAvailableOutbound$,
      this.openSeatAvailableReturn$,
    ]).pipe(
      map(([isReturn, availOutbound, availReturn]) =>
        isReturn ? Math.min(availOutbound, availReturn) : availOutbound
      ),
      shareReplay(1)
    );

    // OBRS-361: reuses the three source observables above (never re-derives
    // seatingMode) — combined once so `showSeatPreferenceFields()` in the
    // template gets a single object per passenger row instead of 3 separate
    // async pipes.
    this.passengerPrefsContext$ = combineLatest([
      this.isOpenSeatingOutbound$,
      this.isOpenSeatingReturn$,
      this.isReturnTrip$,
    ]).pipe(
      map(([outboundOpen, returnOpen, isReturn]) => ({ outboundOpen, returnOpen, isReturn })),
      shareReplay(1)
    );

    // OBRS-362: seat-attribute badges. Fetched only for an ASSIGNED leg (an
    // OPEN leg has no fixed seat map to badge) — non-blocking, best-effort.
    this.seatAttributesOutbound$ = combineLatest([
      this.scheduleBooking$,
      this.isOpenSeatingOutbound$,
    ]).pipe(
      switchMap(([booking, isOpen]) => this.fetchSeatAttributes(this.outboundSchedule(booking), isOpen)),
      shareReplay(1)
    );
    this.seatAttributesReturn$ = combineLatest([
      this.scheduleBooking$,
      this.isOpenSeatingReturn$,
    ]).pipe(
      switchMap(([booking, isOpen]) => this.fetchSeatAttributes(this.returnSchedule(booking), isOpen)),
      shareReplay(1)
    );

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

    // OBRS-361 scrutinize blocker #1 — live-sync the summary sidebar
    // (`selectPassengerInfo`) as the traveler types, so the "Passengers"
    // summary block reflects seat preference/requirement in the same
    // session. `filter(() => !this.isPatchingFromStore)` runs BEFORE
    // `debounceTime`, on every raw emission — critical ordering: the store
    // → `setPassengerData()` rebuild (~:536/:550, the exact guard the
    // `statusChanges` sub above already uses) sets/clears the flag
    // SYNCHRONOUSLY within the same rebuild, well under 300ms, so checking
    // the flag only AFTER the debounce window would already see it cleared
    // and dispatch again — a feedback loop
    // (sync → dispatch → store → setPassengerData → valueChanges → sync →
    // ...). Filtering pre-debounce discards every rebuild-driven emission at
    // the moment it fires, while the flag is still true, so only genuine
    // user edits ever reach the debounced dispatch below.
    this.passengerData.valueChanges
      .pipe(
        filter(() => !this.isPatchingFromStore),
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.syncPassengerInfoToStore();
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
    this.clampActiveIndices();
    this.emitValidity();
  }

  deletePassenger(index: number) {
    this.passengerData.removeAt(index);
    this.clampActiveIndices();
    this.emitValidity();
  }

  /** Which passenger is active on the shared outbound seat map. */
  setActiveOutbound(index: number): void {
    if (index >= 0 && index < this.passengerData.length) {
      this.activeOutboundIndex = index;
    }
  }

  /** Which passenger is active on the shared return seat map. */
  setActiveReturn(index: number): void {
    if (index >= 0 && index < this.passengerData.length) {
      this.activeReturnIndex = index;
    }
  }

  /**
   * Owner map for the shared OUTBOUND seat map (OBRS-242): every seat
   * already assigned to any passenger, keyed by seat label, with that
   * passenger's ordinal badge + gender. Built fresh on every call (never
   * mutates an `@Input`), so the shared `app-passenger-seat-van`/`-bus`
   * always renders every passenger's seat at once, not just the active one.
   */
  getSeatOwners(): Record<string, { label: string; gender: string }> {
    return this.buildSeatOwners('passengerSeat');
  }

  /** Same as `getSeatOwners`, for the independent RETURN leg pool. */
  getSeatOwnersReturn(): Record<string, { label: string; gender: string }> {
    return this.buildSeatOwners('passengerSeatReturn');
  }

  private buildSeatOwners(
    controlName: 'passengerSeat' | 'passengerSeatReturn'
  ): Record<string, { label: string; gender: string }> {
    const owners: Record<string, { label: string; gender: string }> = {};

    this.passengerData.controls.forEach((ctrl, idx) => {
      const seat = ctrl.get(controlName)?.value;
      if (!seat) {
        return;
      }

      owners[seat] = {
        label: String(idx + 1),
        gender: ctrl.get('gender')?.value || '',
      };
    });

    return owners;
  }

  /** Keeps activeOutboundIndex/activeReturnIndex in range after the passenger array changes. */
  // Clamps the active-passenger indices to the current range. NOTE: this keeps
  // the active INDEX valid, not the active passenger's IDENTITY — deleting a
  // passenger BEFORE the active one would shift the selection to a different
  // person. That's harmless today because passenger count here is fixed by the
  // search filter and `deletePassenger` is not wired to any UI (grep confirms
  // it's only exercised by its own spec; passengers are never removed/reordered
  // mid-screen). If a remove-passenger control is ever added to this screen,
  // remap the active index to follow the passenger there instead of clamping.
  private clampActiveIndices(): void {
    const maxIndex = Math.max(this.passengerData.length - 1, 0);
    this.activeOutboundIndex = Math.min(this.activeOutboundIndex, maxIndex);
    this.activeReturnIndex = Math.min(this.activeReturnIndex, maxIndex);
  }

  onUseBookerInfoChange(index: number, isChecked: boolean): void {
    if (!isChecked) {
      return;
    }

    this.useBookerAsPassenger.emit(index);
  }

  applyBookerToPassenger(index: number, booker: PassengerInfo): void {
    const group = this.passengerData.at(index);
    if (!group || !booker) {
      return;
    }

    group.patchValue({
      title: booker.title,
      firstName: booker.firstName ?? '',
      middleName: booker.middleName ?? '',
      lastName: booker.lastName ?? '',
      phoneNumber: booker.phoneNumber ?? '',
      gender: booker.gender ?? '',
    });
    group.markAllAsTouched();
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
    if (passengerSeat && this.isSeatAlreadyTaken(index, passengerSeat)) {
      return;
    }

    this.passengerData.at(index).get('passengerSeat')?.setValue(passengerSeat);
    this.emitValidity();
  }

  getTakenSeats(currentIndex: number): string[] {
    return this.passengerData.controls
      .map((ctrl, idx) => (idx === currentIndex ? null : ctrl.get('passengerSeat')?.value || null))
      .filter((seat): seat is string => !!seat);
  }

  private isSeatAlreadyTaken(currentIndex: number, seat: string): boolean {
    return this.passengerData.controls.some(
      (ctrl, idx) =>
        idx !== currentIndex && (ctrl.get('passengerSeat')?.value || '') === seat
    );
  }

  setPassengerSeatReturn(index: number, passengerSeat: string) {
    if (passengerSeat && this.isSeatAlreadyTakenReturn(index, passengerSeat)) {
      return;
    }

    this.passengerData
      .at(index)
      .get('passengerSeatReturn')
      ?.setValue(passengerSeat);
    this.emitValidity();
  }

  getTakenSeatsReturn(currentIndex: number): string[] {
    return this.passengerData.controls
      .map((ctrl, idx) =>
        idx === currentIndex ? null : ctrl.get('passengerSeatReturn')?.value || null
      )
      .filter((seat): seat is string => !!seat);
  }

  private isSeatAlreadyTakenReturn(currentIndex: number, seat: string): boolean {
    return this.passengerData.controls.some(
      (ctrl, idx) =>
        idx !== currentIndex &&
        (ctrl.get('passengerSeatReturn')?.value || '') === seat
    );
  }

  /** First (outbound) schedule — the store holds either a single `Schedule`
   *  (legacy shape) or a `Schedule[]` (one-way = length 1, round trip = length 2). */
  private outboundSchedule(booking: ScheduleBooking | null): Schedule | null {
    const schedule = booking?.schedule;
    if (!schedule) {
      return null;
    }
    return Array.isArray(schedule) ? schedule[0] ?? null : schedule;
  }

  /** Second (inbound) schedule on a round trip, or null for one-way. */
  private returnSchedule(booking: ScheduleBooking | null): Schedule | null {
    const schedule = booking?.schedule;
    if (!Array.isArray(schedule)) {
      return null;
    }
    return schedule[1] ?? null;
  }

  /**
   * OBRS-361: leg-aware visibility for the per-passenger seat-preference /
   * seat-requirement fields. Two rules, checked in order:
   * 1. Hide entirely once every leg on this booking is OPEN (mirrors
   *    `allLegsOpenSeating$` — same semantics, reuses the same 3 source
   *    booleans, never re-derives `seatingMode` itself).
   * 2. Otherwise hide once every ASSIGNED leg relevant to this passenger has
   *    a seat picked. A one-way booking only ever looks at the outbound
   *    seat (`passengerSeatReturn` is ignored — `returnNeedsSeat` is false
   *    whenever `isReturn` is false, regardless of `returnOpen`). On a mixed
   *    round trip, the OPEN leg's (always-empty) seat is never required —
   *    only the ASSIGNED leg(s) gate visibility.
   */
  showSeatPreferenceFields(
    index: number,
    outboundOpen: boolean,
    returnOpen: boolean,
    isReturn: boolean
  ): boolean {
    const allOpen = isReturn ? outboundOpen && returnOpen : outboundOpen;
    if (allOpen) {
      return false;
    }

    const outboundNeedsSeat = !outboundOpen;
    const returnNeedsSeat = isReturn && !returnOpen;

    const outboundSatisfied = !outboundNeedsSeat || !!this.getFormValue(index, 'passengerSeat');
    const returnSatisfied = !returnNeedsSeat || !!this.getFormValue(index, 'passengerSeatReturn');

    return !(outboundSatisfied && returnSatisfied);
  }

  /** Whether a leg's seat-attribute map has at least one badge to show —
   *  gates the legend block below that leg's seat map (OBRS-362). */
  hasSeatAttributes(attributes: SeatAttributeMap | null): boolean {
    return !!attributes && Object.keys(attributes).length > 0;
  }

  /**
   * OBRS-362: fetches `GET /schedules/{id}/seats` for an ASSIGNED leg only
   * (an OPEN leg sells with no fixed seat map, so there is nothing to
   * badge) and reduces the response to a `SeatAttributeMap`. Non-blocking —
   * any fetch failure degrades to no badges, never an alert, never blocks
   * booking.
   */
  private fetchSeatAttributes(
    schedule: Schedule | null,
    isOpenSeating: boolean
  ): Observable<SeatAttributeMap> {
    if (isOpenSeating || !schedule?.id) {
      return of({});
    }

    return this.scheduleService.getSeatMap(schedule.id).pipe(
      map((res) => this.buildSeatAttributes(res?.data ?? [])),
      catchError(() => of({}))
    );
  }

  private buildSeatAttributes(seats: SeatMapRespDto[]): SeatAttributeMap {
    const attributes: SeatAttributeMap = {};
    for (const seat of seats) {
      const key = normalizeSeatNumber(seat.seatNumber);
      if (!key) {
        continue;
      }
      const list: ('WHEELCHAIR' | 'EXTRA_LEGROOM')[] = [];
      if (seat.isWheelchairAccessible) {
        list.push('WHEELCHAIR');
      }
      if (seat.isExtraLegroom) {
        list.push('EXTRA_LEGROOM');
      }
      if (list.length) {
        attributes[key] = list;
      }
    }
    return attributes;
  }

  /**
   * OPEN-seating passenger-count stepper (OBRS-323). `maxCount` is the
   * caller-supplied `openSeatMaxCount$` snapshot — capped in the template so a
   * stale/slow-to-resolve observable can never let the count exceed it.
   */
  addOpenSeatPassenger(maxCount: number): void {
    if (this.passengerData.length >= maxCount) {
      return;
    }
    this.insertPassenger(true);
    this.syncPassengerInfoToStore();
  }

  removeOpenSeatPassenger(): void {
    if (this.passengerData.length <= 1) {
      return;
    }
    this.deletePassenger(this.passengerData.length - 1);
    this.syncPassengerInfoToStore();
  }

  /**
   * `setPassengerData()` wholesale-rebuilds `passengerData` from the
   * passenger-info store on every store emit (see the `passengerInfo`
   * subscription in `ngOnInit`, and its ngOnInit-empty-array-only seed guard).
   * A +/- click above is a local FormArray mutation via insertPassenger()/
   * deletePassenger() — NOT persisted to the store — so without this, a later
   * store re-emit would silently revert the user's adjusted count (OBRS-323).
   * Mirrors the same dispatch(invokeSetPassengerInfo(...)) call
   * `PassengerInfoComponent.onSubmitPassengerInfo()` already makes on submit.
   */
  private syncPassengerInfoToStore(): void {
    this.store.dispatch(
      invokeSetPassengerInfo({ passengerInfo: this.buildPassengerInfoPayload() })
    );
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
      useBookerInfo: [false],
      isAdult: [isAdult],
      title: [null, Validators.required],
      firstName: ['', Validators.required],
      middleName: [''],
      lastName: ['', Validators.required],
      phoneNumber: ['', [Validators.pattern(/^0\d{9}$/)]],
      gender: ['', Validators.required],
      isSelectSeat: [true],
      passengerSeat: [''],
      passengerSeatReturn: [''],
      // OBRS-361: optional, never pre-seeded (design-system §3.1) — starts
      // null so both p-selectButton groups render their unselected state.
      seatPreference: [null],
      seatRequirement: [null],
    });
  }

  /**
   * OBRS-361 defect fix (QA-reported, live-reproduced): this used to
   * unconditionally `removeAt(0)` EVERY existing group and `push()` brand
   * new `FormGroup`/`FormControl` instances for every store round trip —
   * including the new debounced live-sync round trip added for OBRS-361,
   * which now fires after ~every field edit (not just the rare initial-load
   * / OPEN-seating +/- cases this method originally handled). Angular's
   * `formControlName`/`formGroupName` directives bind to a control instance
   * once, at directive init, and do **not** re-bind just because the
   * `*ngFor` (with `trackBy: trackByIndex`) reuses the same DOM node for a
   * replaced control at the same index — so after a wholesale rebuild, a
   * `p-selectButton` the user is mid-interaction with stays wired to the
   * OLD, now-detached control. Its own visual `p-highlight` state still
   * looks right (driven by the CVA's locally-cached value), but the click's
   * `writeValue`/model update lands on a control `getRawValue()` never
   * reads again — so a 2nd field set shortly after a round trip silently
   * vanishes from the submit payload even though both buttons still look
   * selected. Fix: when the passenger COUNT is unchanged (the common case
   * for a live field edit — count only changes via `insertPassenger`/
   * `deletePassenger`, e.g. OPEN-seating +/-), patch the EXISTING groups in
   * place instead of destroying/recreating them, so a control the user is
   * actively bound to is never swapped out from under them. Only the
   * genuine count DELTA is added/removed.
   */
  private setPassengerData(passengers: PassengerInfo[]): void {
    this.isPatchingFromStore = true;

    while (this.passengerData.length > passengers.length) {
      this.passengerData.removeAt(this.passengerData.length - 1);
    }
    while (this.passengerData.length < passengers.length) {
      this.passengerData.push(this.createPassengerGroup());
    }

    passengers.forEach((passenger, index) => {
      this.passengerData.at(index).patchValue({
        ...passenger,
        title: passenger.title,
      });
    });

    this.clampActiveIndices();
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

  trackByIndex(index: number): number {
    return index;
  }

  private emitValidity(): void {
    const hasPassenger = this.passengerData?.length > 0;
    const isValid = (this.passengerForm?.valid ?? false) && hasPassenger;
    this.validityChange.emit(isValid);
  }
}
