import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import dayjs from 'dayjs';

import { HomeBookingComponent } from './home-booking.component';
import { DropdownObrsComponent } from '../../../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownGroupObrsComponent } from '../../../../shared/components/dropdown-group-obrs/dropdown-group-obrs.component';
import { DropdownObrsPassengerComponent } from '../dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import {
  BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK,
  BookingPolicyService,
} from '../../../../services/booking-policy/booking-policy.service';
import { AuthService } from '../../../../auth/auth.service';
import { BookingService } from '../../../../services/booking/booking.service';
import { RecentRoutesQuickPickComponent } from '../recent-routes-quick-pick/recent-routes-quick-pick.component';
import {
  createAuthServiceStub,
  createBookingServiceStub,
  createRouterStub,
  createStoreStub,
} from '../../../../testing/test-stubs';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import { RECENT_ROUTES_CACHE_KEY, saveRecentRoute } from '../../../../shared/lib/recent-routes';

/** OBRS-564's `BookingPolicyService` resolves the real date-picker cap. */
function createBookingPolicyServiceStub(): BookingPolicyService {
  return {
    getBookingPolicy: () => of({ code: 200, message: 'OK' }),
  } as unknown as BookingPolicyService;
}

/**
 * Single construction point for the component under test.
 *
 * Merging OBRS-564 into OBRS-575 added a 7th constructor dependency and broke
 * all ten `new HomeBookingComponent(...)` call sites at once — the "adding a
 * dep to a bean breaks every test that constructs it" trap. Routing every
 * construction through here makes the NEXT dependency a one-line change, and
 * lets each test name only the collaborators it actually cares about.
 */
function makeHomeBooking(
  overrides: {
    store?: unknown;
    appStore?: unknown;
    auth?: unknown;
    booking?: unknown;
    policy?: unknown;
  } = {}
): HomeBookingComponent {
  return new HomeBookingComponent(
    new FormBuilder(),
    createRouterStub(),
    (overrides.store ?? createStoreStub()) as never,
    (overrides.appStore ?? createStoreStub()) as never,
    (overrides.auth ?? createAuthServiceStub(false)) as never,
    (overrides.booking ?? createBookingServiceStub()) as never,
    (overrides.policy ?? createBookingPolicyServiceStub()) as never
  );
}

function station(id: number): StationApi {
  return {
    id,
    slug: `station-${id}`,
    status: 'active',
    stopType: 'station',
    createdAt: '',
    updatedAt: '',
  };
}

/** A Store stub whose `pipe()`/`select()` both resolve synchronously to
 *  `value` — matches `createStoreStub()`'s shape but lets a test control what
 *  the station-list selector (and, incidentally, `selectScheduleList` in
 *  `onSearch()`) emits. */
function createStoreStubWithValue(value: unknown): any {
  return {
    pipe: () => of(value),
    select: () => of(value),
    dispatch: () => {},
  };
}

/** Same shape as `createStoreStubWithValue`, but the caller keeps the subject —
 *  the only way to make the station-list selector emit a SECOND time, which is
 *  what re-runs `recomputeRecentRouteCandidates()` (OBRS-928's one-shot guard
 *  is untestable without it). */
function createStoreStubWithSubject(subject: BehaviorSubject<unknown>): any {
  return {
    pipe: () => subject,
    select: () => subject,
    dispatch: () => {},
  };
}

const STATION_1 = station(1);
const STATION_2 = station(2);
const STATION_3 = station(3);

describe('HomeBookingComponent', () => {
  let component: HomeBookingComponent;

  beforeEach(() => {
    component = makeHomeBooking();
  });

  afterEach(() => {
    localStorage.removeItem(RECENT_ROUTES_CACHE_KEY);
  });

  describe('smoke', () => {
    beforeEach(() => {
      component = makeHomeBooking();
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('defaults the passenger selection to 1 adult and 0 kids', () => {
      expect(component.bookingForm.get('passengerInfo')?.value).toEqual([
        { type: 'ADULT', count: 1 },
        { type: 'KIDS', count: 0 },
      ]);
    });
  });

  describe('recent-route quick pick (OBRS-575)', () => {
    it('anonymous visitor: derives candidates from localStorage, never calls getMyBookings', () => {
      saveRecentRoute(1, 2);
      const bookingServiceStub = createBookingServiceStub();
      spyOn(bookingServiceStub, 'getMyBookings').and.callThrough();

      component = makeHomeBooking({ store: createStoreStubWithValue([STATION_1, STATION_2]), booking: bookingServiceStub });
      component.ngOnInit();

      expect(bookingServiceStub.getMyBookings).not.toHaveBeenCalled();
      expect(component.recentRouteCandidates.length).toBe(1);
      expect(component.recentRouteCandidates[0].originStation.id).toBe(1);
      expect(component.recentRouteCandidates[0].destinationStation.id).toBe(2);
    });

    it('logged-in user: calls getMyBookings with skipAuthLogout=true (AC#8 — must not force-logout on a background fetch)', () => {
      const bookingServiceStub = createBookingServiceStub();
      spyOn(bookingServiceStub, 'getMyBookings').and.callThrough();

      component = makeHomeBooking({ store: createStoreStubWithValue([STATION_1, STATION_2]), auth: createAuthServiceStub(true), booking: bookingServiceStub });
      component.ngOnInit();

      // OBRS-577: getMyBookings moved to a single options object (AC2); this
      // call site still pins size:100 explicitly (see the component's own
      // comment) so the OBRS-923 frequency-ranked sample doesn't shrink.
      expect(bookingServiceStub.getMyBookings).toHaveBeenCalledWith({
        showLoadingDialog: false,
        skipAuthLogout: true,
        size: 100,
      });
    });

    it('logged-in user: derives candidates from bookingSchedules[0].fromStop/toStop.id', () => {
      const bookingServiceStub = createBookingServiceStub();
      bookingServiceStub.getMyBookings = () =>
        of({
          data: {
            content: [
              {
                id: 1,
                createdAt: '2026-06-01T00:00:00',
                bookingSchedules: [{ fromStop: { id: 1 }, toStop: { id: 2 } }],
              },
            ],
          },
        });

      component = makeHomeBooking({ store: createStoreStubWithValue([STATION_1, STATION_2]), auth: createAuthServiceStub(true), booking: bookingServiceStub });
      component.ngOnInit();

      expect(component.recentRouteCandidates.length).toBe(1);
      expect(component.recentRouteCandidates[0].originStation.id).toBe(1);
    });

    it('AC#8: a failing getMyBookings degrades to zero candidates without throwing (no AlertService call)', () => {
      const bookingServiceStub = createBookingServiceStub();
      bookingServiceStub.getMyBookings = () => throwError(() => new Error('500'));

      expect(() => {
        component = makeHomeBooking({ store: createStoreStubWithValue([STATION_1, STATION_2]), auth: createAuthServiceStub(true), booking: bookingServiceStub });
        component.ngOnInit();
      }).not.toThrow();

      expect(component.recentRouteCandidates).toEqual([]);
    });

    it('AC#6: drops a route whose station is missing from the current active roster', () => {
      saveRecentRoute(1, 99); // 99 never resolves against the seeded station list

      component = makeHomeBooking({ store: createStoreStubWithValue([STATION_1, STATION_2]) });
      component.ngOnInit();

      expect(component.recentRouteCandidates).toEqual([]);
    });

    it('clicking a route patches both form controls and runs the existing syncStationOptions behavior', () => {
      component = makeHomeBooking({ store: createStoreStubWithValue([STATION_1, STATION_2, STATION_3]) });
      component.ngOnInit();

      component.onRecentRouteSelected({ originStation: STATION_1, destinationStation: STATION_2 });

      expect(component.getFormValue('startStationId')).toBe(1);
      expect(component.getFormValue('stopStationId')).toBe(2);
      // syncStationOptions() ran: the chosen destination is excluded from the
      // origin picker's own options and vice versa.
      expect(component.startProvinceStationList.some((s) => s.id === 2)).toBeFalse();
      expect(component.endProvinceStationList.some((s) => s.id === 1)).toBeFalse();
    });

    it('onSearch(): writes the searched route to localStorage only when both stations resolve', () => {
      component = makeHomeBooking({ store: createStoreStubWithValue([STATION_1, STATION_2]) });
      component.ngOnInit();
      component.bookingForm.patchValue({ startStationId: 1, stopStationId: 2 });

      component.onSearch();

      const stored = JSON.parse(localStorage.getItem(RECENT_ROUTES_CACHE_KEY) as string);
      expect(stored.routes[0]).toEqual(
        jasmine.objectContaining({ originId: 1, destinationId: 2 })
      );
    });

    it('onSearch(): does NOT write when the form is empty/unresolved (no validation gate exists on this call)', () => {
      component = makeHomeBooking({ store: createStoreStubWithValue([STATION_1, STATION_2]) });
      component.ngOnInit();
      // startStationId/stopStationId default to '' per createForm().

      component.onSearch();

      expect(localStorage.getItem(RECENT_ROUTES_CACHE_KEY)).toBeNull();
    });
  });

  describe('top-route prefill (OBRS-928)', () => {
    it('AC#4: prefills both station fields with the top-ranked route on load', () => {
      saveRecentRoute(1, 2);

      component = makeHomeBooking({ store: createStoreStubWithValue([STATION_1, STATION_2]) });
      component.ngOnInit();

      expect(component.getFormValue('startStationId')).toBe(1);
      expect(component.getFormValue('stopStationId')).toBe(2);
    });

    it('prefills the route the ranking put FIRST, not the one stored first', () => {
      // 3->2 is the most recent, so OBRS-923 reserves slot 1 for it even though
      // 1->2 was searched more often.
      saveRecentRoute(1, 2);
      saveRecentRoute(1, 2);
      saveRecentRoute(3, 2);

      component = makeHomeBooking({
        store: createStoreStubWithValue([STATION_1, STATION_2, STATION_3]),
      });
      component.ngOnInit();

      expect(component.getFormValue('startStationId')).toBe(3);
    });

    // must-NOT #1 (AC#6): no history, nothing to prefill — the fields stay
    // exactly as createForm() seeded them.
    it('does NOT prefill when there is no route history', () => {
      component = makeHomeBooking({ store: createStoreStubWithValue([STATION_1, STATION_2]) });
      component.ngOnInit();

      expect(component.getFormValue('startStationId')).toBe('');
      expect(component.getFormValue('stopStationId')).toBe('');
      expect(component.recentRouteCandidates).toEqual([]);
    });

    // must-NOT #2 (AC#5): a station the user picked before the candidates
    // resolved outranks the prefill. Without this, a slow station list would let
    // the prefill stomp a deliberate choice.
    it('does NOT overwrite a station the user has already chosen', () => {
      saveRecentRoute(1, 2);

      component = makeHomeBooking({
        store: createStoreStubWithValue([STATION_1, STATION_2, STATION_3]),
      });
      component.bookingForm.patchValue({ startStationId: 3 });
      component.ngOnInit();

      expect(component.getFormValue('startStationId')).toBe(3);
      expect(component.getFormValue('stopStationId')).toBe('');
    });

    // must-NOT #3 (AC#7): both the station-list and auth-status subscriptions
    // call recompute, and the station list emits again on any store change. A
    // second prefill would silently revert the user's switch.
    it('prefills at most once per page load — a later recompute does not revert the user', () => {
      saveRecentRoute(1, 2);
      const stations$ = new BehaviorSubject<unknown>([STATION_1, STATION_2, STATION_3]);

      component = makeHomeBooking({ store: createStoreStubWithSubject(stations$) });
      component.ngOnInit();
      expect(component.getFormValue('startStationId')).toBe(1);

      component.onRecentRouteSelected({
        originStation: STATION_3,
        destinationStation: STATION_2,
      });
      stations$.next([STATION_1, STATION_2, STATION_3]);

      expect(component.getFormValue('startStationId')).toBe(3);
      expect(component.getFormValue('stopStationId')).toBe(2);
    });

    it('the prefilled route is the one the strip renders as active', () => {
      saveRecentRoute(1, 2);

      component = makeHomeBooking({ store: createStoreStubWithValue([STATION_1, STATION_2]) });
      component.ngOnInit();

      const top = component.recentRouteCandidates[0];
      expect(component.getFormValue('startStationId')).toBe(top.originStation.id);
      expect(component.getFormValue('stopStationId')).toBe(top.destinationStation.id);
    });
  });

  // OBRS-698 raised the fallback 30 → 60 and moved it beside the service
  // call. Asserted against the exported constant, not a repeated literal:
  // a second copy of the number in the test is the same drift this card is
  // closing, and the point of the test is "the seed IS the shared fallback",
  // not "the seed happens to be 60".
  it('seeds maxDate synchronously with the shared fallback (before the API resolves)', () => {
    const expected = dayjs().add(BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK, 'day');
    expect(dayjs(component.maxDate).isSame(expected, 'day')).toBeTrue();
  });
});

// OBRS-564: DOM-level regression guard for the actual bug this card
// describes — binding maxDate only on the departure calendar lets a user
// pick a return date past the real cap and eat a 400 from the server. A
// unit-level construction test (above) can't see a missing template
// binding, only a compiled-template render can, so this block renders the
// real component via TestBed (same DatePickerModule/ReactiveFormsModule/
// standalone-dropdown-component recipe already proven for a PrimeNG
// calendar form in parcel-trip-form.component.spec.ts).
describe('HomeBookingComponent — maxDate bound to BOTH calendars (OBRS-564)', () => {
  let fixture: ComponentFixture<HomeBookingComponent>;
  let component: HomeBookingComponent;

  const CONFIGURED_MAX_ADVANCE_DAYS = 45;

  beforeEach(async () => {
    const bookingPolicyServiceStub: Partial<BookingPolicyService> = {
      getBookingPolicy: () =>
        of({
          code: 200,
          message: 'OK',
          data: { maxAdvanceDays: CONFIGURED_MAX_ADVANCE_DAYS, cutoffMinutes: 20 },
        }),
    };

    await TestBed.configureTestingModule({
      declarations: [HomeBookingComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        DropdownObrsPassengerComponent,
        // OBRS-575's standalone child now appears in this template; without it
        // the slice fails with NG0304 'not a known element'.
        RecentRoutesQuickPickComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        { provide: Store, useValue: createStoreStub() },
        { provide: BookingPolicyService, useValue: bookingPolicyServiceStub },
        // OBRS-575 gave HomeBookingComponent two new collaborators. AuthService
        // pulls HttpClient transitively, so without these this slice dies with
        // "No provider for HttpClient!" before it ever reaches the calendars —
        // a dependency added to a component breaks every slice that builds it.
        // Anonymous (false) keeps the quick-pick off the network entirely, so
        // this test stays about maxDate and nothing else.
        { provide: AuthService, useValue: createAuthServiceStub(false) },
        { provide: BookingService, useValue: createBookingServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeBookingComponent);
    component = fixture.componentInstance;
  });

  it('applies the resolved maxDate to BOTH the departure and return p-datePicker controls', () => {
    // Reveal the return-trip calendar too, so both p-datePicker instances exist.
    component.isRoundTripReturn = true;

    fixture.detectChanges(); // ngOnInit -> bookingPolicyServiceStub resolves synchronously

    const expected = dayjs().add(CONFIGURED_MAX_ADVANCE_DAYS, 'day');
    expect(dayjs(component.maxDate).isSame(expected, 'day')).toBeTrue();

    const calendars = fixture.debugElement.queryAll(By.css('p-datePicker'));
    expect(calendars.length).toBe(2);

    for (const calendarDe of calendars) {
      const boundMaxDate = calendarDe.componentInstance.maxDate as Date;
      expect(dayjs(boundMaxDate).isSame(expected, 'day')).toBeTrue();
    }
  });
});

/**
 * OBRS-1021. The return-date block was copied from the departure block with its
 * `<label>` intact, so round-trip mode rendered the SAME words twice and only
 * field order told a customer which date was which.
 *
 * These tests read the RENDERED label text, not the template source: a
 * `queryAll('label').length === 2` would have passed against the bug, and so
 * would asserting on `formControlName` — the controls were always correct, it
 * was only ever the words above them that lied.
 *
 * `TranslateModule.forRoot()` here has no loader, so `| translate` echoes the
 * key back. That is deliberately what we assert against: it pins WHICH key each
 * field reaches for and cannot drift the way a copy of the Thai string would
 * (a test carrying its own copy of "รอบวันกลับ" stays green after somebody
 * rewords the real one).
 */
describe('HomeBookingComponent — date labels distinguish outbound from return (OBRS-1021)', () => {
  let fixture: ComponentFixture<HomeBookingComponent>;
  let component: HomeBookingComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HomeBookingComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        DropdownObrsPassengerComponent,
        RecentRoutesQuickPickComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        { provide: Store, useValue: createStoreStub() },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
        { provide: AuthService, useValue: createAuthServiceStub(false) },
        { provide: BookingService, useValue: createBookingServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeBookingComponent);
    component = fixture.componentInstance;
  });

  /** Each date field's OWN label, in DOM order, whitespace- and colon-stripped
   *  (the template renders `{{ ... }} :`).
   *
   *  Walks out from every `p-datePicker` to its wrapper rather than querying
   *  `.form-group-obrs label` directly: that class is also the internal root of
   *  `dropdown-obrs` and `dropdown-group-obrs`, both of which are real
   *  components in this slice and render labels of their own (ต้นทาง /
   *  ปลายทาง). Selecting by class would have silently mixed the station labels
   *  into the assertion, and the pairing we care about — THIS label belongs to
   *  THAT calendar — would not have been tested at all. */
  function dateFieldLabels(): string[] {
    return fixture.debugElement
      .queryAll(By.css('p-datePicker'))
      .map((picker) => picker.parent?.query(By.css('label')))
      .map((label) => (label?.nativeElement.textContent ?? '').replace(/\s|:/g, ''));
  }

  it('labels the two round-trip date fields with DIFFERENT keys — outbound then return', () => {
    component.isRoundTripReturn = true;
    fixture.detectChanges();

    expect(dateFieldLabels()).toEqual([
      'HOME.HOME_BOOKING.ROUND_DEPARTURE',
      'HOME.HOME_BOOKING.ROUND_RETURN',
    ]);
  });

  it('keeps the plain DEPARTURE_DATE label in one-way mode, where there is no return to contrast with', () => {
    component.isRoundTripReturn = false;
    fixture.detectChanges();

    expect(dateFieldLabels()).toEqual(['HOME.HOME_BOOKING.DEPARTURE_DATE']);
  });
});

/**
 * OBRS-1028, the defect sitting on the same lines OBRS-1021 just edited.
 *
 * Every date field in this form carried `inputId="templatedisplay"` — the same
 * literal at all four date fields in the app (measured: it is the ONLY repeated
 * `inputId` value in `src/`; the other three are unique) — and no `<label>`
 * named the input it sat above. Two consequences, and the tests below are split
 * to match them because a fix for one does not imply the other:
 *
 *  1. round-trip mode renders both calendars at once, so two `<input>` elements
 *     claim `id="templatedisplay"` in one document. Invalid HTML, and
 *     `getElementById` silently resolves to whichever came first.
 *  2. the label was never associated, so a screen reader announces an unnamed
 *     text field and a click on the words does nothing — which OBRS-1021 makes
 *     *more* visible, not less: the two labels now differ in wording, and a
 *     listener still cannot tell the fields apart.
 *
 * Both assertions read the RENDERED DOM. A template-source grep, or a check
 * that `<label>` merely exists, passes against the bug — the elements were all
 * present, only the wiring between them was missing.
 */
describe('HomeBookingComponent — each date field owns a unique input id its label points at (OBRS-1028)', () => {
  let fixture: ComponentFixture<HomeBookingComponent>;
  let component: HomeBookingComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HomeBookingComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        DropdownObrsPassengerComponent,
        RecentRoutesQuickPickComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        { provide: Store, useValue: createStoreStub() },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
        { provide: AuthService, useValue: createAuthServiceStub(false) },
        { provide: BookingService, useValue: createBookingServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeBookingComponent);
    component = fixture.componentInstance;
  });

  /** For each date field in DOM order: what its label points at, and what its
   *  input actually calls itself. Read from the same `p-datePicker` so the pair
   *  is guaranteed to belong together — comparing a list of `for=` values
   *  against a list of `id=` values gathered separately would go green on two
   *  labels that both point at the FIRST input. */
  function dateFieldWiring(): { labelFor: string | null; inputId: string | null }[] {
    return fixture.debugElement.queryAll(By.css('p-datePicker')).map((picker) => ({
      labelFor:
        picker.parent?.query(By.css('label'))?.nativeElement.getAttribute('for') ?? null,
      inputId: picker.query(By.css('input'))?.nativeElement.getAttribute('id') ?? null,
    }));
  }

  it('gives the two round-trip calendars DIFFERENT input ids — they share a document', () => {
    component.isRoundTripReturn = true;
    fixture.detectChanges();

    const ids = dateFieldWiring().map((w) => w.inputId);

    expect(ids.length).toBe(2);
    expect(ids).not.toContain(null);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points each label at the id of its own input, so the label names that field', () => {
    component.isRoundTripReturn = true;
    fixture.detectChanges();

    const wiring = dateFieldWiring();

    // Guards the vacuous pass: an empty list satisfies any per-item assertion,
    // and that is exactly the state a broken slice (NG0304, a swallowed throw)
    // leaves behind.
    expect(wiring.length).toBe(2);
    for (const { labelFor, inputId } of wiring) {
      expect(labelFor).not.toBeNull();
      expect(labelFor).toBe(inputId);
    }
  });

  it('still wires the single calendar in one-way mode', () => {
    component.isRoundTripReturn = false;
    fixture.detectChanges();

    const wiring = dateFieldWiring();

    expect(wiring.length).toBe(1);
    expect(wiring[0].labelFor).not.toBeNull();
    expect(wiring[0].labelFor).toBe(wiring[0].inputId);
  });
});
