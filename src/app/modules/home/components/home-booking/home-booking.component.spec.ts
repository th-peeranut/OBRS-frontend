import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import dayjs from 'dayjs';

import { HomeBookingComponent } from './home-booking.component';
import { DropdownObrsComponent } from '../../../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownGroupObrsComponent } from '../../../../shared/components/dropdown-group-obrs/dropdown-group-obrs.component';
import { StationSwapButtonComponent } from '../../../../shared/components/station-swap-button/station-swap-button.component';
import { TripTypeToggleComponent } from '../../../../shared/components/trip-type-toggle/trip-type-toggle.component';
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
  createLanguageServiceStub,
  createRouterStub,
  createStoreStub,
} from '../../../../testing/test-stubs';
import { LanguageService } from '../../../../shared/services/language.service';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import { RECENT_ROUTES_CACHE_KEY, saveRecentRoute } from '../../../../shared/lib/recent-routes';
// OBRS-1222: this template now renders `app-station-load-error`. Declared here
// rather than schema-suppressed so the slices keep failing on a REAL unknown
// element. With `createStoreStub()` its two selectors both read null, so it
// renders nothing and no assertion in this file changes.
import { StationLoadErrorComponent } from '../../../../shared/components/station-load-error/station-load-error.component';

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
    (overrides.policy ?? createBookingPolicyServiceStub()) as never,
    createLanguageServiceStub() as never
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
      declarations: [HomeBookingComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
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
      declarations: [HomeBookingComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
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
      declarations: [HomeBookingComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
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

/**
 * OBRS-1023, the third defect on these same four lines.
 *
 * `dateFormat="dd/mm/yy"` was hardcoded in the template. PrimeNG resolves the
 * format as `this.dateFormat || getTranslation('dateFormat')`, so the literal
 * did not merely *duplicate* the translated value — it SHADOWED it, and
 * `CALENDAR.dateFormat` (translated three ways since the calendars shipped)
 * had never once reached a picker. An English visitor read `03/08/2026` in
 * Thai field order on the screen where they commit to a ticket, and that
 * string is equally readable as 8 March.
 *
 * These tests run the REAL LanguageService against a REAL TranslateService
 * seeded with the shipped CALENDAR blocks. A stubbed service would test that
 * the component forwards whatever it is handed — the defect was upstream of
 * that, in whether anything was handed over at all.
 *
 * They also assert the rendered `<input>` value, not only the bound property.
 * That distinction is the whole of AC#3: PrimeNG's translation subscription
 * reacts to `setTranslation` by re-running `createWeekDays()` alone, so the
 * text already in the box does NOT follow a language switch on its own. Only
 * re-binding `dateFormat` repaints it, and only an assertion on the input can
 * tell those two apart.
 */
describe('HomeBookingComponent — date format follows the chosen language (OBRS-1023)', () => {
  let fixture: ComponentFixture<HomeBookingComponent>;
  let component: HomeBookingComponent;
  let languageService: LanguageService;

  /** The three shipped `CALENDAR` blocks, trimmed to what a date format needs.
   *  `dateFormat` values are the ones in `public/i18n/*.json`; `dayNamesShort`
   *  is what PrimeNG's `D` token resolves against. Indices are day-of-week
   *  starting Sunday, matching `Date.getDay()`. */
  const CALENDARS: Record<string, { dateFormat: string; dayNamesShort: string[] }> = {
    th: {
      dateFormat: 'dd/mm/yy',
      dayNamesShort: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
    },
    en: {
      dateFormat: 'mm/dd/yy',
      dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    },
  };

  /** The next Monday strictly after today — a weekday the assertions can name,
   *  inside the picker's own [minDate, maxDate] window.
   *
   *  Computed, not a calendar literal: `formatDateTime` blanks the input
   *  entirely for a date outside that window (`formattedValue = isDateValid ?
   *  formattedValue : ''`), and `minDate` is `new Date()` — i.e. NOW, not
   *  midnight. A hardcoded date therefore renders as `''`, which reads exactly
   *  like a formatting bug and would have sent the next reader hunting in the
   *  wrong file. */
  const MONDAY = (() => {
    let d = dayjs().add(1, 'day').startOf('day');
    while (d.day() !== 1) {
      d = d.add(1, 'day');
    }
    return d;
  })();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HomeBookingComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
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

    const translate = TestBed.inject(TranslateService);
    Object.entries(CALENDARS).forEach(([lang, calendar]) =>
      translate.setTranslation(lang, { CALENDAR: calendar })
    );
    languageService = TestBed.inject(LanguageService);

    fixture = TestBed.createComponent(HomeBookingComponent);
    component = fixture.componentInstance;
  });

  /** The format each rendered calendar is actually running on — read off the
   *  DatePicker instance, not the template source. A source grep would go green
   *  the moment the literal moved into a constant. */
  function boundFormats(): (string | undefined)[] {
    return fixture.debugElement
      .queryAll(By.css('p-datePicker'))
      .map((picker) => picker.componentInstance.dateFormat);
  }

  /** What the customer can actually read in the box. */
  function renderedInputValues(): string[] {
    return fixture.debugElement
      .queryAll(By.css('p-datePicker input'))
      .map((input) => input.nativeElement.value as string);
  }

  it('binds BOTH round-trip calendars to the format of the chosen language, not a literal', async () => {
    component.isRoundTripReturn = true;
    await languageService.switch('en');
    fixture.detectChanges();

    const formats = boundFormats();

    // Vacuous-pass guard: an empty list satisfies every per-item assertion
    // below, and that is exactly what a broken slice leaves behind.
    expect(formats.length).toBe(2);
    for (const format of formats) {
      // The bug, stated directly: the Thai field order reaching an en visitor.
      expect(format).not.toBe('dd/mm/yy');
      // AC#2 — the weekday is the part of a bus date a passenger decides on.
      expect(format).toContain('D');
      expect(format).toBe('D, mm/dd/yy');
    }
  });

  it('renders a date the customer can read unambiguously — weekday first, en field order', async () => {
    // OBRS-1185: this test is about ONE calendar's rendered format, not about
    // round-trip — force one-way so only the departure p-datePicker renders,
    // same reasoning as every other single-calendar assertion in this file.
    component.isRoundTripReturn = false;
    await languageService.switch('en');
    fixture.detectChanges();
    component.bookingForm.get('departureDate')?.setValue(MONDAY.toDate());
    fixture.detectChanges();

    // `D` resolves through dayNamesShort, which setTranslation pushed into the
    // same PrimeNG config — asserting the text proves that path is live, not
    // just that a format string was assigned. The digits come from dayjs, an
    // independent formatter, so this pins the ORDER without re-implementing
    // PrimeNG's jQuery-derived one.
    expect(renderedInputValues()).toEqual([`Mon, ${MONDAY.format('MM/DD/YYYY')}`]);
  });

  it('repaints a date already in the box when the language changes mid-page (AC#3)', async () => {
    // OBRS-1185: same reasoning as the previous test — force one-way so this
    // stays a single-calendar assertion.
    component.isRoundTripReturn = false;
    await languageService.switch('en');
    fixture.detectChanges();
    component.bookingForm.get('departureDate')?.setValue(MONDAY.toDate());
    fixture.detectChanges();
    expect(renderedInputValues()).toEqual([`Mon, ${MONDAY.format('MM/DD/YYYY')}`]);

    await languageService.switch('th');
    fixture.detectChanges();

    // Both halves must move: the FIELD ORDER (from CALENDAR.dateFormat) and the
    // DAY NAME (from dayNamesShort). PrimeNG's own translation subscription
    // moves neither for text already rendered, so a fix that only re-pushed
    // translations would leave the English rendering sitting here.
    expect(renderedInputValues()).toEqual([`จ., ${MONDAY.format('DD/MM/YYYY')}`]);
    expect(boundFormats()).toEqual(['D, dd/mm/yy']);
  });

  it('can still PARSE back exactly what it displays — the day name does not break the round trip', async () => {
    // The one real cost of AC#2, pinned rather than left to be discovered in
    // production. PrimeNG parses with the SAME format it renders with
    // (`getDateFormat()` serves both), where `D` is not decorative: `parseDate`
    // resolves it via `getName`, which THROWS on a string with no day name, and
    // `onUserInput` answers a throw by clearing the field.
    //
    // So: what the box shows still round-trips (asserted here), but bare digits
    // in the old `dd/mm/yy` shape no longer do.
    //
    // This comment used to end "these inputs are not `readonlyInput`, so a
    // customer can type" and called that trade self-consistent. It was not —
    // a customer typing digits watched the field empty itself, and OBRS-1036
    // closed the typing route entirely. The assertion below is unchanged and
    // still the right one: it pins that PARSING agrees with RENDERING, which is
    // what keeps a value the calendar wrote from being destroyed on blur.
    await languageService.switch('en');
    fixture.detectChanges();
    component.bookingForm.get('departureDate')?.setValue(MONDAY.toDate());
    fixture.detectChanges();

    const picker = fixture.debugElement.query(By.css('p-datePicker')).componentInstance;
    const displayed = fixture.debugElement.query(By.css('p-datePicker input'))
      .nativeElement.value as string;

    // Guards the vacuous pass: an empty box round-trips through nothing.
    expect(displayed).toContain('Mon');

    let parsed: Date | undefined;
    expect(() => (parsed = picker.parseValueFromString(displayed))).not.toThrow();
    expect(dayjs(parsed).isSame(MONDAY, 'day')).toBeTrue();
  });

  it('leaves the picker on PrimeNG\'s own fallback before any language resolves', () => {
    // Not a nicety: publishing a placeholder format here would shadow
    // `getTranslation('dateFormat')` exactly the way the hardcoded literal did.
    // OBRS-1185: force one-way so only the departure p-datePicker renders —
    // this test is about ONE calendar's fallback format, not round-trip.
    component.isRoundTripReturn = false;
    fixture.detectChanges();

    expect(component.calendarDateFormat()).toBeUndefined();
    expect(boundFormats()).toEqual([undefined]);
  });
});

/**
 * OBRS-1036 — the cost OBRS-1023's AC#2 asked for, paid explicitly.
 *
 * `D` is not decorative in a PrimeNG format string. `getDateFormat()` serves
 * BOTH render and parse, so the token that prints `Mon, ` is also the token
 * `parseDate` walks on the way back in — `case 'D'` calls `getName`, which
 * THROWS on text with no day name, and `onUserInput` answers a throw by
 * writing `null` into the model (measured in primeng 21.1.9,
 * `primeng-datepicker.mjs`: `parseDate` `getName` → `throw`, `onUserInput`
 * `catch` → `updateModel(this.keepInvalid ? val : null)`).
 *
 * A customer typing `03/08/2026` therefore watched the box empty itself on the
 * screen where they commit to a ticket. The chosen fix is `readonlyInput` —
 * the calendar becomes the only way in, which is what every reference site the
 * owner cited does (Traveloka / Skyscanner / Airpaz / Thai Airways).
 *
 * What these tests can and cannot prove, stated plainly so nobody strengthens
 * the wrong one later: `readonly` stops the BROWSER from raising `input`, it
 * does not unbind the handler. `dispatchEvent` still reaches `onUserInput` and
 * still clears — so "type and assert the value survives" would go red WITH the
 * fix, not without it. The assertion that actually tracks the fix is the
 * attribute itself; the destructive path is pinned separately as a positive
 * control, so a future reader can see the guard is guarding something real.
 */
describe('HomeBookingComponent — a date can only be chosen from the calendar (OBRS-1036)', () => {
  let fixture: ComponentFixture<HomeBookingComponent>;
  let component: HomeBookingComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HomeBookingComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
        DropdownObrsPassengerComponent,
        RecentRoutesQuickPickComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        { provide: Store, useValue: createStoreStub() },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
        { provide: AuthService, useValue: createAuthServiceStub(false) },
        { provide: BookingService, useValue: createBookingServiceStub() },
        {
          provide: LanguageService,
          useValue: createLanguageServiceStub('D, dd/mm/yy'),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeBookingComponent);
    component = fixture.componentInstance;
  });

  /** Both round-trip calendars rendered, as native `<input>` elements. */
  function dateInputs(): HTMLInputElement[] {
    component.isRoundTripReturn = true;
    fixture.detectChanges();
    return fixture.debugElement
      .queryAll(By.css('p-datePicker input'))
      .map((input) => input.nativeElement as HTMLInputElement);
  }

  it('marks BOTH date inputs readonly, so the browser never raises the input event that wipes them', () => {
    const inputs = dateInputs();

    // Vacuous-pass guard: zero inputs satisfies every per-item assertion below,
    // and that is exactly what a broken template slice leaves behind.
    expect(inputs.length).toBe(2);
    for (const input of inputs) {
      expect(input.readOnly).toBeTrue();
      expect(input.hasAttribute('readonly')).toBeTrue();
    }
  });

  it('must-NOT go disabled — a disabled input cannot open the calendar it is now the only way into', () => {
    const inputs = dateInputs();

    expect(inputs.length).toBe(2);
    for (const input of inputs) {
      expect(input.disabled).toBeFalse();
      expect(input.hasAttribute('disabled')).toBeFalse();
      // Still in the tab order. `readonly` leaves focusability alone;
      // `disabled` would not, and the two are one attribute apart.
      expect(input.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('still opens the calendar from the keyboard alone', () => {
    const inputs = dateInputs();
    const picker = fixture.debugElement.query(By.css('p-datePicker')).componentInstance;

    expect(picker.overlayVisible).toBeFalsy();
    inputs[0].dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    // `showOnFocus` defaults to true and `onInputFocus` does not consult
    // `readonlyInput` (primeng 21.1.9) — so focus is a complete route in.
    expect(picker.overlayVisible).toBeTrue();
  });

  it('positive control: the wipe this guards against is real and one attribute away', () => {
    // Deliberately bypasses the browser the way `readonly` cannot: a dispatched
    // event reaches the handler regardless. If this ever stops clearing, the
    // readonly assertions above have become decoration and should be re-derived
    // rather than trusted.
    const inputs = dateInputs();
    const control = component.bookingForm.get('departureDate');
    control?.setValue(new Date());
    fixture.detectChanges();
    expect(control?.value).toBeTruthy();

    inputs[0].value = '03/08/2026';
    inputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: '6' }));
    inputs[0].dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(control?.value).toBeNull();
  });
});

/**
 * OBRS-1035. The circular icon between the two station pickers was a bare
 * `<img>` — no role, no tabindex, `cursor: auto` — and no swap feature existed
 * anywhere in the codebase. The owner reported it as "I press the swap button
 * and nothing happens", which is exactly right: it looked like a control and
 * was not one.
 *
 * These tests drive the RENDERED button and read the form controls afterwards.
 * A `queryAll('app-station-swap-button').length === 1` would pass against a
 * button wired to nothing, and asserting on `onSwapStations()` alone would pass
 * against a template that still ships the old `<img>` — both were live failure
 * modes on this exact block (OBRS-1021 / OBRS-1023 / OBRS-1028).
 */
describe('HomeBookingComponent — origin/destination swap (OBRS-1035)', () => {
  let fixture: ComponentFixture<HomeBookingComponent>;
  let component: HomeBookingComponent;
  let store: any;

  beforeEach(async () => {
    store = createStoreStubWithValue([STATION_1, STATION_2, STATION_3]);

    await TestBed.configureTestingModule({
      declarations: [HomeBookingComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
        DropdownObrsPassengerComponent,
        RecentRoutesQuickPickComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        { provide: Store, useValue: store },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
        { provide: AuthService, useValue: createAuthServiceStub(false) },
        { provide: BookingService, useValue: createBookingServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeBookingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /** The rendered control, not the component instance. Returns null when the
   *  template still ships a non-interactive element — which is the bug. */
  function swapButton(): HTMLButtonElement | null {
    const de = fixture.debugElement.query(By.css('app-station-swap-button button'));
    return de ? (de.nativeElement as HTMLButtonElement) : null;
  }

  it('renders a real <button>, not a decorative <img>', () => {
    const button = swapButton();

    expect(button).not.toBeNull();
    expect(button!.tagName).toBe('BUTTON');
    // `type` must be explicit: a bare <button> inside a form submits it.
    expect(button!.getAttribute('type')).toBe('button');
    // The accessible name is a translated KEY, never a literal in the template.
    expect(button!.getAttribute('aria-label')).toBe('COMMON.SWAP_STATIONS');
  });

  it('AC#2: clicking it swaps startStationId and stopStationId', () => {
    component.onStartStationChange(STATION_1);
    component.onEndStationChange(STATION_2);
    fixture.detectChanges();

    swapButton()!.click();
    fixture.detectChanges();

    expect(component.getFormValue('startStationId')).toBe(STATION_2.id);
    expect(component.getFormValue('stopStationId')).toBe(STATION_1.id);
  });

  it('AC#3: the option lists follow the swap — each side drops the other side', () => {
    component.onStartStationChange(STATION_1);
    component.onEndStationChange(STATION_2);
    fixture.detectChanges();

    swapButton()!.click();
    fixture.detectChanges();

    expect(component.startProvinceStationList.map((s) => s.id)).not.toContain(STATION_1.id);
    expect(component.startProvinceStationList.map((s) => s.id)).toContain(STATION_2.id);
    expect(component.endProvinceStationList.map((s) => s.id)).not.toContain(STATION_2.id);
    expect(component.endProvinceStationList.map((s) => s.id)).toContain(STATION_1.id);
  });

  it('AC#2: the pickers render the swapped station, not just the model', () => {
    component.onStartStationChange(STATION_1);
    component.onEndStationChange(STATION_2);
    fixture.detectChanges();

    swapButton()!.click();
    fixture.detectChanges();

    const pickers = fixture.debugElement.queryAll(By.css('app-dropdown-group-obrs'));
    // [0] = origin, [1] = destination — the two inside `.station-group`.
    expect(pickers[0].componentInstance.value).toBe(STATION_2.id);
    expect(pickers[1].componentInstance.value).toBe(STATION_1.id);
  });

  it('AC#7 must-NOT: disabled while BOTH fields are empty', () => {
    expect(component.getFormValue('startStationId')).toBe('');
    expect(component.getFormValue('stopStationId')).toBe('');

    expect(component.canSwapStations).toBeFalse();
    expect(swapButton()!.disabled).toBeTrue();
  });

  it('one side filled is still swappable — it moves that station across', () => {
    component.onStartStationChange(STATION_1);
    fixture.detectChanges();

    expect(swapButton()!.disabled).toBeFalse();

    swapButton()!.click();
    fixture.detectChanges();

    expect(component.getFormValue('startStationId')).toBe('');
    expect(component.getFormValue('stopStationId')).toBe(STATION_1.id);
  });

  it('AC#6 must-NOT: swapping does not fire a search', () => {
    component.onStartStationChange(STATION_1);
    component.onEndStationChange(STATION_2);
    fixture.detectChanges();

    const dispatch = spyOn(store, 'dispatch');
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    swapButton()!.click();
    fixture.detectChanges();

    expect(dispatch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  // Reported on review, 2026-08-05: the button reads as floating above the two
  // fields. `.station-group` is `align-items: center`, and its flex items are
  // the label+field GROUPS — so an unpositioned button centres on the group,
  // well above the field's own centre line. Home used to hide that with
  // `margin-top: 30px`, correct at exactly one breakpoint. The rule now lives in
  // `app-station-swap-button`; this pins the observable consequence, so a call
  // site that re-adds a vertical nudge fails here rather than on someone's eye.
  //
  // OBRS-1038 REWROTE IT, and why is worth stating because it decides what the
  // test can prove. The bar now stacks below 992px, and that is a VIEWPORT
  // query: Karma's headless window is 800px wide, so setting the fixture to
  // 1200px does not put this test in the row branch. The original assertion
  // (`fields[0].top === fields[1].top`) started failing here for exactly that
  // reason, on a layout that is correct.
  //
  // So it now asserts the invariant in whichever mode the runner is really in.
  // The two modes are NOT the same claim, because the layouts are not: in a row
  // the button's centre is on the SEAM of the merged bar and level with the
  // FIELDS (never with the taller label+field group — that was the OBRS-1035
  // defect); stacked, there is no seam to sit on, because the lower field's
  // label sits between the two boxes, so it straddles the upper field's bottom
  // edge at the right end. Both are checked against the field boxes, which is
  // what makes either of them fail when a call site re-adds a nudge.
  //
  // The row branch therefore does not run in CI. Its coverage is
  // e2e/tests/obrs-1038-station-seam.spec.ts, which sets a real 1280px viewport.
  // This keeps both branches anyway: a local `ng test` on a wide window takes
  // the row one, and the column one is all the parcel screen can ever have (no
  // e2e lane reaches it — `features.onlineParcelBooking` is off everywhere).
  it('centres on the join between the two fields, level with the fields themselves', () => {
    // Fixed container width so the row cannot wrap — "same centre line" is
    // meaningless once the button is on a flex line of its own.
    const root = fixture.nativeElement as HTMLElement;
    root.style.display = 'block';
    root.style.width = '1200px';
    fixture.detectChanges();

    const host = fixture.debugElement.query(By.css('app-station-swap-button'))
      .nativeElement as HTMLElement;
    const fields = Array.from(
      root.querySelectorAll('app-dropdown-group-obrs button.dropdown-btn')
    ).slice(0, 2) as HTMLElement[];
    // A typo'd selector must fail here, not sail through an empty loop.
    expect(fields.length).toBe(2);

    const box = (el: HTMLElement) => el.getBoundingClientRect();
    const centreX = (el: HTMLElement) => box(el).left + box(el).width / 2;
    const centreY = (el: HTMLElement) => box(el).top + box(el).height / 2;

    if (window.matchMedia('(max-width: 992px)').matches) {
      // Stacked: one column, the seam is horizontal.
      // No seam exists here: the lower field's LABEL sits between the two
      // boxes. The button straddles the upper field's bottom edge instead, at
      // the right end, where that left-aligned label has no text.
      expect(box(fields[0]).left).toBe(box(fields[1]).left);

      expect(Math.abs(centreY(host) - box(fields[0]).bottom)).toBeLessThanOrEqual(1);
      expect(centreX(host)).toBeGreaterThan(centreX(fields[0]));
      expect(box(host).right).toBeLessThanOrEqual(box(fields[0]).right);
    } else {
      // Row: one bar, the seam is vertical.
      expect(box(fields[0]).top).toBe(box(fields[1]).top);
      const seamX = (box(fields[0]).right + box(fields[1]).left) / 2;

      expect(Math.abs(centreX(host) - seamX)).toBeLessThanOrEqual(1);
      for (const field of fields) {
        expect(Math.abs(centreY(host) - centreY(field))).toBeLessThanOrEqual(1);
      }
    }
  });
});

/**
 * OBRS-1185 + OBRS-1025, done together per the owner's own sequencing note on
 * both cards: shipping the default flip alone would hide the one-way route
 * back behind the very dropdown OBRS-1025 replaces.
 *
 * Unit-level assertions (no TestBed) pin what a plain `new HomeBookingComponent`
 * has to be true on its own, WITHOUT `app-trip-type-toggle` ever rendering to
 * correct it — the same reasoning `createForm()`'s own comment gives for why
 * `roundTrip`, `roundTripDropdowns.isDefault` and `isRoundTripReturn`'s literal
 * default all have to agree independently.
 */
describe('HomeBookingComponent — round-trip is the default, and the return date is defensible (OBRS-1185)', () => {
  let component: HomeBookingComponent;

  beforeEach(() => {
    component = makeHomeBooking();
  });

  it('AC#1/AC#8: defaults the search form to round-trip', () => {
    const roundTrip = component.bookingForm.get('roundTrip')?.value;
    const roundTripId = typeof roundTrip === 'object' ? roundTrip?.id : roundTrip;

    expect(roundTripId).toBe(2);
    expect(component.isRoundTripReturn).toBeTrue();
  });

  it('AC#2: defaults returnDate to a day AFTER departureDate, never the same day', () => {
    const departureDate = component.getFormValue('departureDate');
    const returnDate = component.getFormValue('returnDate');

    expect(dayjs(returnDate).isSame(dayjs(departureDate), 'day')).toBeFalse();
    expect(dayjs(returnDate).isBefore(dayjs(departureDate), 'day')).toBeFalse();
  });

  it('AC#4/AC#8: moving departureDate past returnDate carries returnDate forward with it', () => {
    const originalReturn = component.getFormValue('returnDate');
    const newDeparture = dayjs(originalReturn).add(5, 'day').toDate();

    component.bookingForm.get('departureDate')?.setValue(newDeparture);

    const carriedReturn = component.getFormValue('returnDate');
    expect(dayjs(carriedReturn).isBefore(dayjs(newDeparture), 'day')).toBeFalse();
    expect(dayjs(carriedReturn).isSame(dayjs(originalReturn), 'day')).toBeFalse();
  });

  it('AC#6/AC#8: moving departureDate EARLIER, still before the old returnDate, leaves returnDate untouched', () => {
    const originalReturn = component.getFormValue('returnDate');
    const earlierDeparture = component.getFormValue('departureDate'); // unchanged is a valid "earlier than return" case too

    component.bookingForm.get('departureDate')?.setValue(earlierDeparture);

    expect(component.getFormValue('returnDate')).toBe(originalReturn);
  });

  it('AC#6: switching the roundTrip control to one-way flips isRoundTripReturn off, and back to round-trip flips it back on', () => {
    component.bookingForm.get('roundTrip')?.setValue({ id: 1, nameThai: 'เที่ยวเดียว', nameEnglish: 'One-way' });
    expect(component.isRoundTripReturn).toBeFalse();

    component.bookingForm.get('roundTrip')?.setValue({ id: 2, nameThai: 'ไป-กลับ', nameEnglish: 'Round-trip' });
    expect(component.isRoundTripReturn).toBeTrue();
  });
});

/**
 * DOM-level half of OBRS-1185/OBRS-1025: renders the real template (real
 * `app-trip-type-toggle`, real `p-datePicker`s) — the class-level assertions
 * above cannot see a missing template binding, only a compiled-template
 * render can, same reasoning as the OBRS-564 maxDate block earlier in this
 * file.
 */
describe('HomeBookingComponent — trip-type pills and the return date field render correctly (OBRS-1025/OBRS-1185)', () => {
  let fixture: ComponentFixture<HomeBookingComponent>;
  let component: HomeBookingComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HomeBookingComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
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

  it('AC#1 (1185) + AC#1 (1025): both trip-type pills AND the return date field are in the DOM on first render — no manual flag flip', () => {
    fixture.detectChanges();

    const pills = fixture.debugElement.queryAll(By.css('app-trip-type-toggle button'));
    expect(pills.length).toBe(2);

    const calendars = fixture.debugElement.queryAll(By.css('p-datePicker'));
    expect(calendars.length).toBe(2);
  });

  it('AC#3 (1185): the return calendar\'s minDate is the CURRENT departureDate, not the shared minDate', () => {
    fixture.detectChanges();

    const newDeparture = dayjs(component.minDate).add(10, 'day').toDate();
    component.bookingForm.get('departureDate')?.setValue(newDeparture);
    fixture.detectChanges();

    const calendars = fixture.debugElement.queryAll(By.css('p-datePicker'));
    expect(calendars.length).toBe(2);

    const returnPickerMinDate = calendars[1].componentInstance.minDate as Date;
    expect(dayjs(returnPickerMinDate).isSame(dayjs(newDeparture), 'day')).toBeTrue();
    // The departure calendar's own minDate must stay pinned to "today" — only
    // the RETURN calendar tracks departureDate.
    const departurePickerMinDate = calendars[0].componentInstance.minDate as Date;
    expect(dayjs(departurePickerMinDate).isSame(dayjs(component.minDate), 'day')).toBeTrue();
  });

  it('AC#6 (1185) + AC#1 (1025): tapping the one-way pill removes the return date field; tapping back restores it', () => {
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.css('p-datePicker')).length).toBe(2);

    const pills = fixture.debugElement.queryAll(By.css('app-trip-type-toggle button'));
    pills[0].nativeElement.click(); // "one-way" is rendered first (id 1)
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(By.css('p-datePicker')).length).toBe(1);
    expect(component.isRoundTripReturn).toBeFalse();

    const pillsAfter = fixture.debugElement.queryAll(By.css('app-trip-type-toggle button'));
    pillsAfter[1].nativeElement.click(); // "round-trip" is rendered second (id 2)
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(By.css('p-datePicker')).length).toBe(2);
    expect(component.isRoundTripReturn).toBeTrue();
  });

  it('AC#2 (1025): each pill exposes aria-pressed matching the selected state', () => {
    fixture.detectChanges();

    const pills = fixture.debugElement.queryAll(By.css('app-trip-type-toggle button'));
    expect(pills[0].nativeElement.getAttribute('aria-pressed')).toBe('false'); // one-way
    expect(pills[1].nativeElement.getAttribute('aria-pressed')).toBe('true'); // round-trip (default)
  });
});
