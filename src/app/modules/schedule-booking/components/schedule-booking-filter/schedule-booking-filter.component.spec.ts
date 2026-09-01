import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import dayjs from 'dayjs';

import { ScheduleBookingFilterComponent } from './schedule-booking-filter.component';
import { DropdownObrsComponent } from '../../../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownGroupObrsComponent } from '../../../../shared/components/dropdown-group-obrs/dropdown-group-obrs.component';
import { StationSwapButtonComponent } from '../../../../shared/components/station-swap-button/station-swap-button.component';
import { TripTypeToggleComponent } from '../../../../shared/components/trip-type-toggle/trip-type-toggle.component';
import { DropdownObrsPassengerComponent } from '../../../home/components/dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK,
  BookingPolicyService,
} from '../../../../services/booking-policy/booking-policy.service';
import {
  createLanguageServiceStub,
  createRouteMapServiceStub,
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';
import { StationApi } from '../../../../shared/interfaces/station.interface';
import { RouteMapService } from '../../../../services/route-map/route-map.service';
import { StationService } from '../../../../services/station/station.service';
import { LanguageService } from '../../../../shared/services/language.service';
// OBRS-1501: asserted on by type, so a renamed action breaks the test instead
// of silently making it pass against an action nobody dispatches any more.
import { invokeSetScheduleFilterApi } from '../../../../shared/stores/schedule-filter/schedule-filter.action';
import { invokeGetScheduleListApi } from '../../../../shared/stores/schedule-list/schedule-list.action';
// OBRS-1222: this template now renders `app-station-load-error`. Declared here
// rather than schema-suppressed so the slices keep failing on a REAL unknown
// element. With `createStoreStub()` its two selectors both read null, so it
// renders nothing and no assertion in this file changes.
import { StationLoadErrorComponent } from '../../../../shared/components/station-load-error/station-load-error.component';

/** OBRS-698: resolves the real, owner-editable advance-sale cap. */
function createBookingPolicyServiceStub(
  maxAdvanceDays?: number
): BookingPolicyService {
  return {
    getBookingPolicy: () =>
      of(
        maxAdvanceDays === undefined
          ? { code: 200, message: 'OK' }
          : {
              code: 200,
              message: 'OK',
              data: { maxAdvanceDays, cutoffMinutes: 20 },
            }
      ),
  } as unknown as BookingPolicyService;
}

/** OBRS-1701: `StationService` answering with NO province data — the ungrouped
 *  path. It is the default so that every pre-existing spec in this file keeps
 *  asserting the flat shape it was written against; a spec that wants headings
 *  passes `createStationServiceStub(PROVINCES)` explicitly. Same helper, same
 *  reasoning as the twin in home-booking.component.spec.ts. */
function createStationServiceStub(provinces: unknown[] | null = null): any {
  return {
    getProvincesWithStops: () => of({ code: 200, message: 'OK', data: provinces }),
  };
}

/**
 * OBRS-1701: the selectable stations of a dropdown binding, whichever shape it
 * is in.
 *
 * The two lists hold `StationApi[]` when there is no province data and
 * `StationGroup[]` when there is. Assertions about WHICH stations are offered
 * are true of both, so they go through here rather than being duplicated per
 * shape — and a spec written before grouping reached this screen keeps meaning
 * what it meant.
 */
function offeredStations(list: readonly any[]): any[] {
  return list.flatMap((entry) => (Array.isArray(entry?.stations) ? entry.stations : [entry]));
}

describe('ScheduleBookingFilterComponent', () => {
  let component: ScheduleBookingFilterComponent;
  let store: any;
  let alertService: any;

  beforeEach(() => {
    store = createStoreStub();
    alertService = { warning: () => {}, error: () => {}, success: () => {} };
    component = new ScheduleBookingFilterComponent(
      new FormBuilder(),
      createRouterStub(),
      store,
      createStoreStub(),
      createTranslateStub(),
      alertService,
      createBookingPolicyServiceStub(),
      createRouteMapServiceStub(),
      createStationServiceStub(),
      createLanguageServiceStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('warns and does not search when origin/destination/passengers are missing', () => {
    // Regression for #22: clicking Search with only a departure date used to
    // fire the request and surface the backend's generic "validation failed"
    // modal. It should instead show a clear, localized message and not search.
    const dispatchSpy = spyOn(store, 'dispatch');
    const warnSpy = spyOn(alertService, 'warning');

    component.onSearch();

    expect(warnSpy).toHaveBeenCalledWith('HOME.HOME_BOOKING.SEARCH_VALIDATION');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('dispatches the search when origin, destination and a passenger are set', () => {
    (component as any).allProvinceStationList = [
      { id: 1, slug: 'station-a' },
      { id: 2, slug: 'station-b' },
    ];
    component.bookingForm.patchValue({
      startStationId: 1,
      stopStationId: 2,
      passengerInfo: [
        { type: 'ADULT', count: 2 },
        { type: 'KIDS', count: 0 },
      ],
      departureDate: new Date(),
    });

    const dispatchSpy = spyOn(store, 'dispatch');
    const warnSpy = spyOn(alertService, 'warning');

    component.onSearch();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalled();
  });

  // OBRS-698: the cap must come from the API, never from a constant repeated
  // in this component — a second copy of the policy number is what let the
  // home page and this screen disagree in the first place.
  it('replaces the seeded fallback with the cap the API returns', () => {
    const configured = 45;
    component = new ScheduleBookingFilterComponent(
      new FormBuilder(),
      createRouterStub(),
      createStoreStub(),
      createStoreStub(),
      createTranslateStub(),
      alertService,
      createBookingPolicyServiceStub(configured),
      createRouteMapServiceStub(),
      createStationServiceStub(),
      createLanguageServiceStub()
    );

    // Distinct from the fallback, so a component that ignored the response
    // entirely would still fail this.
    expect(configured).not.toBe(BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK);

    component.ngOnInit();

    expect(
      dayjs(component.maxDate).isSame(dayjs().add(configured, 'day'), 'day')
    ).toBeTrue();
  });

  it('keeps the seeded fallback when the policy fetch fails', () => {
    component = new ScheduleBookingFilterComponent(
      new FormBuilder(),
      createRouterStub(),
      createStoreStub(),
      createStoreStub(),
      createTranslateStub(),
      alertService,
      {
        getBookingPolicy: () => throwError(() => new Error('offline')),
      } as unknown as BookingPolicyService,
      createRouteMapServiceStub(),
      createStationServiceStub(),
      createLanguageServiceStub()
    );

    expect(() => component.ngOnInit()).not.toThrow();

    expect(
      dayjs(component.maxDate).isSame(
        dayjs().add(BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK, 'day'),
        'day'
      )
    ).toBeTrue();
  });
});

// OBRS-698: DOM-level guard for the actual defect — the component field can
// hold a perfectly correct maxDate while the template binds nothing, which is
// exactly the state this card found (OBRS-564 set the field's counterpart on
// the home page and this screen's calendars bound only [minDate]). Only a
// compiled-template render can see that, so this block builds the real
// component, using the same DatePickerModule/ReactiveFormsModule recipe already
// proven in home-booking.component.spec.ts.
describe('ScheduleBookingFilterComponent — maxDate bound to BOTH calendars (OBRS-698)', () => {
  let fixture: ComponentFixture<ScheduleBookingFilterComponent>;
  let component: ScheduleBookingFilterComponent;

  const CONFIGURED_MAX_ADVANCE_DAYS = 45;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingFilterComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        // OBRS-1701: both pull HttpClient transitively, exactly as the twin
        // providers in home-booking.component.spec.ts do. Stubbed here so the
        // slices below keep testing this component, not the network.
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: StationService, useValue: createStationServiceStub() },
        { provide: Store, useValue: createStoreStub() },
        { provide: AlertService, useValue: { warning: () => {} } },
        {
          provide: BookingPolicyService,
          useValue: createBookingPolicyServiceStub(CONFIGURED_MAX_ADVANCE_DAYS),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleBookingFilterComponent);
    component = fixture.componentInstance;
  });

  it('applies the resolved maxDate to BOTH the departure and return p-datePicker controls', () => {
    fixture.detectChanges(); // ngOnInit -> the policy stub resolves synchronously

    // Reveal the return-trip calendar too, so both p-datePicker instances exist.
    // Set AFTER the first change detection on purpose: ngOnInit's saved-filter
    // subscription re-derives this flag from the store, so a value set before
    // it runs is overwritten and only the departure calendar ever renders.
    component.isRoundTripReturn = true;
    fixture.detectChanges();

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
 * OBRS-1021, second render site. This filter bar is a copy of the Home search
 * form, so it inherited the copy that caused the bug: the return-date block
 * carried the departure block's `<label>`, and round-trip mode showed the same
 * words twice.
 *
 * It gets its own test rather than trusting the Home one because a shared
 * defect fixed at one site is only fixed at that site — the two templates share
 * i18n keys, not markup, and nothing would turn red here if a later edit
 * reverted this file alone.
 */
describe('ScheduleBookingFilterComponent — date labels distinguish outbound from return (OBRS-1021)', () => {
  let fixture: ComponentFixture<ScheduleBookingFilterComponent>;
  let component: ScheduleBookingFilterComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingFilterComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        // OBRS-1701: both pull HttpClient transitively, exactly as the twin
        // providers in home-booking.component.spec.ts do. Stubbed here so the
        // slices below keep testing this component, not the network.
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: StationService, useValue: createStationServiceStub() },
        { provide: Store, useValue: createStoreStub() },
        { provide: AlertService, useValue: { warning: () => {} } },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub(45) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleBookingFilterComponent);
    component = fixture.componentInstance;
  });

  /** Each date field's OWN label — reached from its `p-datePicker` outward, not
   *  by class: `.form-group-obrs` is also the internal root of the station
   *  dropdowns rendered in this same slice. `TranslateModule.forRoot()` has no
   *  loader here, so `| translate` echoes the key, which is what we pin. */
  function dateFieldLabels(): string[] {
    return fixture.debugElement
      .queryAll(By.css('p-datePicker'))
      .map((picker) => picker.parent?.query(By.css('label')))
      .map((label) => (label?.nativeElement.textContent ?? '').replace(/\s|:/g, ''));
  }

  it('labels the two round-trip date fields with DIFFERENT keys — outbound then return', () => {
    fixture.detectChanges();

    // AFTER the first change detection, for the same reason the maxDate test
    // above documents: ngOnInit's saved-filter subscription re-derives this
    // flag, so a value set earlier is overwritten and the return calendar never
    // renders — the test would then pass on a one-element array.
    component.isRoundTripReturn = true;
    fixture.detectChanges();

    expect(dateFieldLabels()).toEqual([
      'HOME.HOME_BOOKING.ROUND_DEPARTURE',
      'HOME.HOME_BOOKING.ROUND_RETURN',
    ]);
  });

  it('keeps the plain DEPARTURE_DATE label in one-way mode, where there is no return to contrast with', () => {
    fixture.detectChanges();

    component.isRoundTripReturn = false;
    fixture.detectChanges();

    expect(dateFieldLabels()).toEqual(['HOME.HOME_BOOKING.DEPARTURE_DATE']);
  });
});

/**
 * OBRS-1028, second render site — see the long note on the matching block in
 * home-booking.component.spec.ts for what the defect is.
 *
 * It gets its own tests for the reason OBRS-1021 proved the hard way: these two
 * forms are copies of each other in markup, so the ONE thing that will not
 * propagate a fix between them is markup. Nothing here would turn red if a
 * later edit restored `inputId="templatedisplay"` in this file alone.
 */
describe('ScheduleBookingFilterComponent — each date field owns a unique input id its label points at (OBRS-1028)', () => {
  let fixture: ComponentFixture<ScheduleBookingFilterComponent>;
  let component: ScheduleBookingFilterComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingFilterComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        // OBRS-1701: both pull HttpClient transitively, exactly as the twin
        // providers in home-booking.component.spec.ts do. Stubbed here so the
        // slices below keep testing this component, not the network.
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: StationService, useValue: createStationServiceStub() },
        { provide: Store, useValue: createStoreStub() },
        { provide: AlertService, useValue: { warning: () => {} } },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub(45) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleBookingFilterComponent);
    component = fixture.componentInstance;
  });

  /** See the twin helper in home-booking.component.spec.ts: label and input are
   *  read from the SAME `p-datePicker`, so a pair can never be mismatched the
   *  way two separately-gathered lists can. */
  function dateFieldWiring(): { labelFor: string | null; inputId: string | null }[] {
    return fixture.debugElement.queryAll(By.css('p-datePicker')).map((picker) => ({
      labelFor:
        picker.parent?.query(By.css('label'))?.nativeElement.getAttribute('for') ?? null,
      inputId: picker.query(By.css('input'))?.nativeElement.getAttribute('id') ?? null,
    }));
  }

  it('gives the two round-trip calendars DIFFERENT input ids — they share a document', () => {
    fixture.detectChanges();

    // AFTER the first change detection: ngOnInit's saved-filter subscription
    // re-derives this flag (the same trap the maxDate block above documents).
    component.isRoundTripReturn = true;
    fixture.detectChanges();

    const ids = dateFieldWiring().map((w) => w.inputId);

    expect(ids.length).toBe(2);
    expect(ids).not.toContain(null);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points each label at the id of its own input, so the label names that field', () => {
    fixture.detectChanges();

    component.isRoundTripReturn = true;
    fixture.detectChanges();

    const wiring = dateFieldWiring();

    // Guards the vacuous pass: an empty list satisfies any per-item assertion.
    expect(wiring.length).toBe(2);
    for (const { labelFor, inputId } of wiring) {
      expect(labelFor).not.toBeNull();
      expect(labelFor).toBe(inputId);
    }
  });

  it('still wires the single calendar in one-way mode', () => {
    fixture.detectChanges();

    component.isRoundTripReturn = false;
    fixture.detectChanges();

    const wiring = dateFieldWiring();

    expect(wiring.length).toBe(1);
    expect(wiring[0].labelFor).not.toBeNull();
    expect(wiring[0].labelFor).toBe(wiring[0].inputId);
  });
});

/**
 * OBRS-1023, second render site — see the long note on the matching block in
 * home-booking.component.spec.ts for what the defect is and why the assertions
 * read the rendered input rather than the bound property alone.
 *
 * Duplicated here for the reason OBRS-1021 and OBRS-1028 both proved: these two
 * forms are markup copies of each other, so markup is precisely what does NOT
 * propagate a fix between them. Nothing in the home-page block would turn red
 * if a later edit put `dateFormat="dd/mm/yy"` back in this file alone.
 */
describe('ScheduleBookingFilterComponent — date format follows the chosen language (OBRS-1023)', () => {
  let fixture: ComponentFixture<ScheduleBookingFilterComponent>;
  let component: ScheduleBookingFilterComponent;
  let languageService: LanguageService;

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

  /** The next Monday after today, inside the picker's [minDate, maxDate].
   *  See the twin note in home-booking.component.spec.ts: PrimeNG blanks the
   *  input for a date outside that window, which reads like a formatting bug. */
  const MONDAY = (() => {
    let d = dayjs().add(1, 'day').startOf('day');
    while (d.day() !== 1) {
      d = d.add(1, 'day');
    }
    return d;
  })();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingFilterComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        // OBRS-1701: both pull HttpClient transitively, exactly as the twin
        // providers in home-booking.component.spec.ts do. Stubbed here so the
        // slices below keep testing this component, not the network.
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: StationService, useValue: createStationServiceStub() },
        { provide: Store, useValue: createStoreStub() },
        { provide: AlertService, useValue: { warning: () => {} } },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub(45) },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    Object.entries(CALENDARS).forEach(([lang, calendar]) =>
      translate.setTranslation(lang, { CALENDAR: calendar })
    );
    languageService = TestBed.inject(LanguageService);

    fixture = TestBed.createComponent(ScheduleBookingFilterComponent);
    component = fixture.componentInstance;
  });

  function boundFormats(): (string | undefined)[] {
    return fixture.debugElement
      .queryAll(By.css('p-datePicker'))
      .map((picker) => picker.componentInstance.dateFormat);
  }

  function renderedInputValues(): string[] {
    return fixture.debugElement
      .queryAll(By.css('p-datePicker input'))
      .map((input) => input.nativeElement.value as string);
  }

  it('binds BOTH round-trip calendars to the format of the chosen language, not a literal', async () => {
    fixture.detectChanges();

    // AFTER the first change detection: ngOnInit's saved-filter subscription
    // re-derives this flag, so a value set earlier never reaches the template.
    component.isRoundTripReturn = true;
    await languageService.switch('en');
    fixture.detectChanges();

    const formats = boundFormats();

    // Vacuous-pass guard — an empty list satisfies every assertion below.
    expect(formats.length).toBe(2);
    for (const format of formats) {
      expect(format).not.toBe('dd/mm/yy');
      expect(format).toContain('D');
      expect(format).toBe('D, mm/dd/yy');
    }
  });

  it('repaints a date already in the box when the language changes mid-page (AC#3)', async () => {
    fixture.detectChanges();
    // OBRS-1185: AFTER the first change detection — ngOnInit's saved-filter
    // subscription re-derives this flag (the same trap the maxDate block
    // above documents), and this test is about ONE calendar's rendered
    // format, not round-trip, so force one-way.
    component.isRoundTripReturn = false;
    await languageService.switch('en');
    component.bookingForm.get('departureDate')?.setValue(MONDAY.toDate());
    fixture.detectChanges();
    expect(renderedInputValues()).toEqual([`Mon, ${MONDAY.format('MM/DD/YYYY')}`]);

    await languageService.switch('th');
    fixture.detectChanges();

    // Field order AND day name must both move. PrimeNG's own translation
    // subscription moves neither for text already rendered.
    expect(renderedInputValues()).toEqual([`จ., ${MONDAY.format('DD/MM/YYYY')}`]);
    expect(boundFormats()).toEqual(['D, dd/mm/yy']);
  });
});

/**
 * OBRS-1036, second render site — see the long note on the matching block in
 * home-booking.component.spec.ts for the mechanism and for what these
 * assertions can and cannot prove.
 *
 * Duplicated here for the fourth time on these same four lines, and for the
 * same reason each time (OBRS-1021, OBRS-1028, OBRS-1023): the two forms are
 * markup copies, so markup is precisely what does NOT carry a fix between
 * them. Nothing in the Home block would turn red if a later edit dropped
 * `[readonlyInput]` from this file alone.
 */
describe('ScheduleBookingFilterComponent — a date can only be chosen from the calendar (OBRS-1036)', () => {
  let fixture: ComponentFixture<ScheduleBookingFilterComponent>;
  let component: ScheduleBookingFilterComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingFilterComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        // OBRS-1701: both pull HttpClient transitively, exactly as the twin
        // providers in home-booking.component.spec.ts do. Stubbed here so the
        // slices below keep testing this component, not the network.
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: StationService, useValue: createStationServiceStub() },
        { provide: Store, useValue: createStoreStub() },
        { provide: AlertService, useValue: { warning: () => {} } },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub(45) },
        {
          provide: LanguageService,
          useValue: createLanguageServiceStub('D, dd/mm/yy'),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleBookingFilterComponent);
    component = fixture.componentInstance;
  });

  /** Both round-trip calendars rendered, as native `<input>` elements.
   *  `isRoundTripReturn` is set AFTER the first change detection — ngOnInit's
   *  saved-filter subscription re-derives it, so a value set earlier never
   *  reaches the template (the same trap the OBRS-1023 block above documents). */
  function dateInputs(): HTMLInputElement[] {
    fixture.detectChanges();
    component.isRoundTripReturn = true;
    fixture.detectChanges();
    return fixture.debugElement
      .queryAll(By.css('p-datePicker input'))
      .map((input) => input.nativeElement as HTMLInputElement);
  }

  it('marks BOTH date inputs readonly, so the browser never raises the input event that wipes them', () => {
    const inputs = dateInputs();

    // Vacuous-pass guard — an empty list satisfies every assertion below.
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
      expect(input.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('still opens the calendar from the keyboard alone', () => {
    const inputs = dateInputs();
    const picker = fixture.debugElement.query(By.css('p-datePicker')).componentInstance;

    expect(picker.overlayVisible).toBeFalsy();
    inputs[0].dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    expect(picker.overlayVisible).toBeTrue();
  });

  it('positive control: the wipe this guards against is real and one attribute away', () => {
    // A dispatched event reaches the handler regardless of `readonly` — that is
    // the point. If this stops clearing, the assertions above have become
    // decoration and the guard needs re-deriving rather than trusting.
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
 * OBRS-1035. Same dead swap icon as `home-booking` — this filter bar is a copy
 * of that form, which is how OBRS-1021 / OBRS-1023 / OBRS-1028 all landed on
 * both files. Fixing only Home would have left the bug live on the results
 * page, so this suite is the propagation gate: it fails if the second call site
 * is ever reverted to the decorative `<img>`.
 *
 * The must-NOT here is stronger than on Home. This bar sits above a rendered
 * result list, so a swap that auto-searched would throw away what the customer
 * is reading.
 */
describe('ScheduleBookingFilterComponent — origin/destination swap (OBRS-1035)', () => {
  let fixture: ComponentFixture<ScheduleBookingFilterComponent>;
  let component: ScheduleBookingFilterComponent;
  let store: any;

  const STATION_A: any = { id: 1, slug: 'station-a', status: 'active', stopType: 'station' };
  const STATION_B: any = { id: 2, slug: 'station-b', status: 'active', stopType: 'station' };
  const STATION_C: any = { id: 3, slug: 'station-c', status: 'active', stopType: 'station' };

  beforeEach(async () => {
    // One stub serves both `select()` calls in the constructor — the station
    // roster AND the saved schedule filter. An array is a legitimate "no saved
    // filter" shape for the latter (every field reads `undefined`), so this
    // renders the station block without also seeding a filter that would
    // auto-search on init.
    store = {
      pipe: () => of([STATION_A, STATION_B, STATION_C]),
      select: () => of([STATION_A, STATION_B, STATION_C]),
      dispatch: () => {},
    };

    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingFilterComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        // OBRS-1701: both pull HttpClient transitively, exactly as the twin
        // providers in home-booking.component.spec.ts do. Stubbed here so the
        // slices below keep testing this component, not the network.
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: StationService, useValue: createStationServiceStub() },
        { provide: Store, useValue: store },
        // Deliberately NOT overriding TranslateService here: the stub's `get()`
        // resolves to an object, so `| translate` renders "[object Object]" and
        // the aria-label assertion below would be measuring the stub rather than
        // the template. The real service from TranslateModule.forRoot() echoes
        // the key back, which is what AC#1 needs proven.
        { provide: AlertService, useValue: { warning: () => {}, error: () => {}, success: () => {} } },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
        { provide: LanguageService, useValue: createLanguageServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleBookingFilterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function swapButton(): HTMLButtonElement | null {
    const de = fixture.debugElement.query(By.css('app-station-swap-button button'));
    return de ? (de.nativeElement as HTMLButtonElement) : null;
  }

  it('renders a real <button> with a translated accessible name', () => {
    const button = swapButton();

    expect(button).not.toBeNull();
    expect(button!.getAttribute('type')).toBe('button');
    expect(button!.getAttribute('aria-label')).toBe('COMMON.SWAP_STATIONS');
  });

  it('AC#2/#3: clicking swaps the two ids and re-syncs both option lists', () => {
    component.onStartStationChange(STATION_A);
    component.onEndStationChange(STATION_B);
    fixture.detectChanges();

    swapButton()!.click();
    fixture.detectChanges();

    expect(component.getFormValue('startStationId')).toBe(STATION_B.id);
    expect(component.getFormValue('stopStationId')).toBe(STATION_A.id);
    expect(offeredStations(component.startProvinceStationList).map((s) => s.id)).not.toContain(
      STATION_A.id
    );
    expect(offeredStations(component.endProvinceStationList).map((s) => s.id)).not.toContain(
      STATION_B.id
    );
  });

  it('AC#7 must-NOT: disabled while both fields are empty', () => {
    expect(component.canSwapStations).toBeFalse();
    expect(swapButton()!.disabled).toBeTrue();
  });

  it('AC#6 must-NOT: swapping never dispatches a search — the visible results stay', () => {
    component.onStartStationChange(STATION_A);
    component.onEndStationChange(STATION_B);
    fixture.detectChanges();

    const dispatch = spyOn(store, 'dispatch');

    swapButton()!.click();
    fixture.detectChanges();

    expect(dispatch).not.toHaveBeenCalled();
  });

  // See the twin in home-booking.component.spec.ts. This filter bar imports
  // home-booking's stylesheet wholesale, so it inherited the same one-breakpoint
  // `margin-top: 30px` and needs the same pin.
  // OBRS-1038 rewrote both twins the same way — see home-booking's copy for why
  // branching on the viewport is not optional here.
  it('centres on the join between the two fields, level with the fields themselves', () => {
    const root = fixture.nativeElement as HTMLElement;
    root.style.display = 'block';
    root.style.width = '1200px';
    fixture.detectChanges();

    const host = fixture.debugElement.query(By.css('app-station-swap-button'))
      .nativeElement as HTMLElement;
    const fields = Array.from(
      root.querySelectorAll('app-dropdown-group-obrs .dropdown-btn')
    ).slice(0, 2) as HTMLElement[];
    expect(fields.length).toBe(2);

    const box = (el: HTMLElement) => el.getBoundingClientRect();
    const centreX = (el: HTMLElement) => box(el).left + box(el).width / 2;
    const centreY = (el: HTMLElement) => box(el).top + box(el).height / 2;

    if (window.matchMedia('(max-width: 992px)').matches) {
      // AC#4 of OBRS-1189: there IS a seam here now. While the labels sat ABOVE
      // their fields the lower one's label filled the gap between the two boxes
      // (measured 2026-08-05: its midpoint 15px below the upper field, inside
      // that label's own text row), so the button could only straddle the upper
      // field's bottom edge. The boxes TOUCH now -- they overlap by the 1px that
      // collapses their two borders into one line -- and that is the assertion
      // this card added: it is red against every build before it, which is what
      // makes it a proof of AC#4 rather than a restatement of the old layout.
      // It still hangs at the right end, where the reference sites put it.
      expect(box(fields[0]).left).toBe(box(fields[1]).left);
      expect(Math.abs(box(fields[1]).top - box(fields[0]).bottom)).toBeLessThanOrEqual(1);

      expect(Math.abs(centreY(host) - box(fields[0]).bottom)).toBeLessThanOrEqual(1);
      expect(centreX(host)).toBeGreaterThan(centreX(fields[0]));
      expect(box(host).right).toBeLessThanOrEqual(box(fields[0]).right);
    } else {
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
 * OBRS-1185 + OBRS-1025, second render site — see the long note on the
 * matching block in home-booking.component.spec.ts. Unit-level assertions
 * here use a PLAIN construction (no TestBed, no `ngOnInit()`) so they pin
 * what `createForm()`'s own literal seeds guarantee on their own — the same
 * reasoning as the home-booking twin.
 */
describe('ScheduleBookingFilterComponent — round-trip is the default, and the return date is defensible (OBRS-1185)', () => {
  let filterComponent: ScheduleBookingFilterComponent;

  beforeEach(() => {
    const alertServiceStub: any = { warning: () => {}, error: () => {}, success: () => {} };
    filterComponent = new ScheduleBookingFilterComponent(
      new FormBuilder(),
      createRouterStub(),
      createStoreStub(),
      createStoreStub(),
      createTranslateStub(),
      alertServiceStub,
      createBookingPolicyServiceStub(),
      createRouteMapServiceStub(),
      createStationServiceStub(),
      createLanguageServiceStub()
    );
  });

  it('AC#1/AC#8: defaults the search form to round-trip', () => {
    const roundTrip = filterComponent.bookingForm.get('roundTrip')?.value;
    const roundTripId = typeof roundTrip === 'object' ? roundTrip?.id : roundTrip;

    expect(roundTripId).toBe(2);
    expect(filterComponent.isRoundTripReturn).toBeTrue();
  });

  it('AC#2: defaults returnDate to a day AFTER departureDate, never the same day', () => {
    const departureDate = filterComponent.getFormValue('departureDate');
    const returnDate = filterComponent.getFormValue('returnDate');

    expect(dayjs(returnDate).isSame(dayjs(departureDate), 'day')).toBeFalse();
    expect(dayjs(returnDate).isBefore(dayjs(departureDate), 'day')).toBeFalse();
  });

  it('AC#4/AC#8: moving departureDate past returnDate carries returnDate forward with it', () => {
    const originalReturn = filterComponent.getFormValue('returnDate');
    const newDeparture = dayjs(originalReturn).add(5, 'day').toDate();

    filterComponent.bookingForm.get('departureDate')?.setValue(newDeparture);

    const carriedReturn = filterComponent.getFormValue('returnDate');
    expect(dayjs(carriedReturn).isBefore(dayjs(newDeparture), 'day')).toBeFalse();
    expect(dayjs(carriedReturn).isSame(dayjs(originalReturn), 'day')).toBeFalse();
  });

  it('AC#6/AC#8: getPayload() drops returnDate when switching to one-way', () => {
    (filterComponent as any).allProvinceStationList = [
      { id: 1, slug: 'station-a' },
      { id: 2, slug: 'station-b' },
    ];
    filterComponent.bookingForm.patchValue({
      startStationId: 1,
      stopStationId: 2,
      roundTrip: 1,
    });

    const payload = filterComponent.getPayload();

    expect(payload.bookingType).toBe('one_way');
    expect(payload.returnDate).toBeUndefined();
  });

  it('AC#6/AC#8 must-NOT: getPayload() KEEPS returnDate for the default round-trip state', () => {
    (filterComponent as any).allProvinceStationList = [
      { id: 1, slug: 'station-a' },
      { id: 2, slug: 'station-b' },
    ];
    filterComponent.bookingForm.patchValue({
      startStationId: 1,
      stopStationId: 2,
    });

    const payload = filterComponent.getPayload();

    expect(payload.bookingType).toBe('return');
    expect(payload.returnDate).toBeTruthy();
    expect(payload.returnDate).not.toBe(payload.departureDate);
  });

  it('AC#6: switching the roundTrip control to one-way flips isRoundTripReturn off, and back to round-trip flips it back on', () => {
    filterComponent.bookingForm.get('roundTrip')?.setValue(1);
    expect(filterComponent.isRoundTripReturn).toBeFalse();

    filterComponent.bookingForm.get('roundTrip')?.setValue(2);
    expect(filterComponent.isRoundTripReturn).toBeTrue();
  });
});

/**
 * DOM-level half — renders the real template (real `app-trip-type-toggle`,
 * real `p-datePicker`s, real `ngOnInit()` with no saved filter to restore),
 * same reasoning as the OBRS-698 maxDate block earlier in this file.
 */
describe('ScheduleBookingFilterComponent — trip-type pills and the return date field render correctly (OBRS-1025/OBRS-1185)', () => {
  let fixture: ComponentFixture<ScheduleBookingFilterComponent>;
  let component: ScheduleBookingFilterComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingFilterComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        // OBRS-1701: both pull HttpClient transitively, exactly as the twin
        // providers in home-booking.component.spec.ts do. Stubbed here so the
        // slices below keep testing this component, not the network.
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: StationService, useValue: createStationServiceStub() },
        // No saved filter to restore — `select()` resolves `null`, exactly the
        // "direct visit to this route" case OBRS-1185's fix to the
        // `scheduleFilter` subscription's `?? 2` fallback covers.
        { provide: Store, useValue: createStoreStub() },
        { provide: AlertService, useValue: { warning: () => {} } },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleBookingFilterComponent);
    component = fixture.componentInstance;
  });

  it('AC#1 (1185) + AC#1 (1025): both trip-type pills AND the return date field are in the DOM on first render — no manual flag flip, no saved filter needed', () => {
    fixture.detectChanges(); // ngOnInit -> scheduleFilter resolves null -> the `?? 2` fallback applies

    const pills = fixture.debugElement.queryAll(By.css('app-trip-type-toggle button'));
    expect(pills.length).toBe(2);

    const calendars = fixture.debugElement.queryAll(By.css('p-datePicker'));
    expect(calendars.length).toBe(2);
  });

  it("AC#3 (1185): the return calendar's minDate is the CURRENT departureDate, not the shared minDate", () => {
    fixture.detectChanges();

    const newDeparture = dayjs(component.minDate).add(10, 'day').toDate();
    component.bookingForm.get('departureDate')?.setValue(newDeparture);
    fixture.detectChanges();

    const calendars = fixture.debugElement.queryAll(By.css('p-datePicker'));
    expect(calendars.length).toBe(2);

    const returnPickerMinDate = calendars[1].componentInstance.minDate as Date;
    expect(dayjs(returnPickerMinDate).isSame(dayjs(newDeparture), 'day')).toBeTrue();
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

/**
 * OBRS-1185 — the case the default flip is most likely to break, and the one the block
 * above CANNOT reach: a returning customer whose saved filter says ONE-WAY.
 *
 * Every other spec here runs with no saved filter, where `roundTripId ?? 2` and the
 * `isRoundTripReturn = true` field initializer agree by construction. They only disagree
 * when a real one-way filter arrives, and then the question is one of ORDERING: the
 * initializer runs at construction, the store correction runs in ngOnInit. If the store
 * emission were ever async, the field initializer would win the first frame and a one-way
 * customer would be shown a return-date field for a trip they did not ask for.
 *
 * Scrutinize traced that ordering by hand and found it safe. Hand-tracing is not a gate —
 * this is. It goes red if `(roundTripId ?? 2) === 2` is written back as `roundTripId === 2`
 * (the pre-OBRS-1185 shape), or if the correction ever moves off the synchronous path.
 */
describe('ScheduleBookingFilterComponent — a saved ONE-WAY filter survives the round-trip default (OBRS-1185)', () => {
  let fixture: ComponentFixture<ScheduleBookingFilterComponent>;
  let component: ScheduleBookingFilterComponent;

  const STATIONS: any = [
    { id: 1, slug: 'station-a', status: 'active', stopType: 'station' },
    { id: 2, slug: 'station-b', status: 'active', stopType: 'station' },
  ];

  /**
   * `this.store.pipe(...)` is called exactly twice in the constructor, in this order:
   * line 120 `rawProvinceStationList`, then line 123 `scheduleFilter`. Keying the stub on
   * call order is what lets ONE `Store` provider hand back two different shapes — passing
   * the filter object to both would feed a non-array to the station subscription.
   */
  function createOrderedStoreStub(savedFilter: any): any {
    let call = 0;
    const next = () => (++call === 1 ? of(STATIONS) : of(savedFilter));
    return { pipe: () => next(), select: () => next(), dispatch: () => {} };
  }

  async function renderWith(savedFilter: any) {
    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingFilterComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        // OBRS-1701: both pull HttpClient transitively, exactly as the twin
        // providers in home-booking.component.spec.ts do. Stubbed here so the
        // slices below keep testing this component, not the network.
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: StationService, useValue: createStationServiceStub() },
        { provide: Store, useValue: createOrderedStoreStub(savedFilter) },
        { provide: AlertService, useValue: { warning: () => {}, error: () => {}, success: () => {} } },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub(45) },
        { provide: LanguageService, useValue: createLanguageServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleBookingFilterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // FIRST change detection - no second pass, no manual nudge
  }

  afterEach(() => TestBed.resetTestingModule());

  it('renders ONE calendar, not two, on the very first change detection', async () => {
    await renderWith({ roundTrip: { id: 1, nameThai: 'เที่ยวเดียว', nameEnglish: 'One-way' } });

    expect(component.isRoundTripReturn).toBeFalse();
    expect(fixture.debugElement.queryAll(By.css('p-datePicker')).length).toBe(1);
  });

  it('also honours the bare-number shape the store can hold', async () => {
    await renderWith({ roundTrip: 1 });

    expect(component.isRoundTripReturn).toBeFalse();
    expect(fixture.debugElement.queryAll(By.css('p-datePicker')).length).toBe(1);
  });

  it('must-NOT-catch: a saved ROUND-TRIP filter still shows both calendars', async () => {
    await renderWith({ roundTrip: { id: 2, nameThai: 'ไป-กลับ', nameEnglish: 'Round-trip' } });

    expect(component.isRoundTripReturn).toBeTrue();
    expect(fixture.debugElement.queryAll(By.css('p-datePicker')).length).toBe(2);
  });

  it('no saved filter at all falls back to round-trip, not to one-way', async () => {
    await renderWith(null);

    expect(component.isRoundTripReturn).toBeTrue();
    expect(fixture.debugElement.queryAll(By.css('p-datePicker')).length).toBe(2);
  });
});

/**
 * OBRS-1501 — the trip-type pills on the RESULTS page must move the booking,
 * not just the form.
 *
 * AC#5 wants both arms, and the first one is the arm no spec in this file
 * walked before this card: flip the pill and DO NOT press ค้นหา. That is
 * exactly what the customer in usability report #1 did (OBRS-1409) — the
 * return date field vanished, so the screen said "one-way", while every
 * downstream reader (`review-schedule-booking-summary`, `passenger-info`)
 * kept reading `scheduleFilter` in the STORE, which still said round-trip.
 * They were asked for a return leg, checked out as `bookingType: 'return'`
 * and were priced "ราคาตั๋วไป-กลับ".
 */
describe('ScheduleBookingFilterComponent — the trip-type toggle applies without a second ค้นหา (OBRS-1501)', () => {
  const ONE_WAY = { id: 1, nameThai: 'เที่ยวเดียว', nameEnglish: 'One-way' };
  const ROUND_TRIP = { id: 2, nameThai: 'ไป-กลับ', nameEnglish: 'Round-trip' };
  const STATIONS: any = [
    { id: 1, slug: 'station-a', status: 'active', stopType: 'station' },
    { id: 2, slug: 'station-b', status: 'active', stopType: 'station' },
  ];

  let component: ScheduleBookingFilterComponent;
  let alertService: any;
  let dispatched: any[];

  function build(store: any) {
    return new ScheduleBookingFilterComponent(
      new FormBuilder(),
      createRouterStub(),
      store,
      createStoreStub(),
      createTranslateStub(),
      alertService,
      createBookingPolicyServiceStub(),
      createRouteMapServiceStub(),
      createStationServiceStub(),
      createLanguageServiceStub()
    );
  }

  const typed = (type: string) => dispatched.filter((action) => action.type === type);

  beforeEach(() => {
    dispatched = [];
    alertService = { warning: () => {}, error: () => {}, success: () => {} };

    const store = createStoreStub();
    spyOn(store, 'dispatch').and.callFake((action: any) => dispatched.push(action));
    component = build(store);

    // The state the customer is in while the results are on screen: a search
    // that already ran, so nothing here is what makes the toggle searchable.
    (component as any).allProvinceStationList = STATIONS;
    component.bookingForm.patchValue({
      startStationId: 1,
      stopStationId: 2,
      passengerInfo: [
        { type: 'ADULT', count: 1 },
        { type: 'KIDS', count: 0 },
      ],
    });
    dispatched.length = 0;
  });

  it('AC#2: flipping to one-way writes the trip type to the STORE, not just to the form', () => {
    component.bookingForm.patchValue({ roundTrip: ONE_WAY });

    const written = typed(invokeSetScheduleFilterApi.type);
    expect(written.length).toBe(1);
    expect(written[0].schedule_filter.roundTrip).toEqual(ONE_WAY);
  });

  it('AC#3: flipping back to round-trip writes id 2 back — the return path still works', () => {
    component.bookingForm.patchValue({ roundTrip: ONE_WAY });
    dispatched.length = 0;

    component.bookingForm.patchValue({ roundTrip: ROUND_TRIP });

    const written = typed(invokeSetScheduleFilterApi.type);
    expect(written.length).toBe(1);
    expect(written[0].schedule_filter.roundTrip).toEqual(ROUND_TRIP);
  });

  it('must-NOT: never warns SEARCH_VALIDATION — the customer pressed a pill, not a search button', () => {
    const warnSpy = spyOn(alertService, 'warning');
    (component as any).allProvinceStationList = [];
    component.bookingForm.patchValue({ startStationId: '', stopStationId: '' });

    component.bookingForm.patchValue({ roundTrip: ONE_WAY });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('must-NOT: the toggle does not fire the list search itself — that would search twice', () => {
    // The `scheduleFilter` subscription in ngOnInit re-searches off the value
    // written above (pinned by the next test). A second dispatch from here
    // would put two identical POST /schedules/search on the wire per tap.
    component.bookingForm.patchValue({ roundTrip: ONE_WAY });

    expect(typed(invokeGetScheduleListApi.type).length).toBe(0);
  });

  it('AC#2: the filter the toggle writes is what re-runs the search, as one_way', () => {
    // The load-bearing half of the fix: without this chain the toggle would
    // relabel the booking while leaving the round-trip RESULT list on screen.
    const filter$ = new BehaviorSubject<any>(null);
    let call = 0;
    const chainStore: any = {
      pipe: () => (++call === 1 ? of(STATIONS) : filter$.asObservable()),
      select: () => of(null),
      dispatch: (action: any) => dispatched.push(action),
    };
    component = build(chainStore);
    component.ngOnInit();
    dispatched.length = 0;

    filter$.next({
      roundTrip: ONE_WAY,
      startStationId: 1,
      stopStationId: 2,
      passengerInfo: [
        { type: 'ADULT', count: 1 },
        { type: 'KIDS', count: 0 },
      ],
      departureDate: dayjs().add(1, 'day').toDate(),
    });

    const searches = typed(invokeGetScheduleListApi.type);
    expect(searches.length).toBe(1);
    expect(searches[0].schedule_filter.bookingType).toBe('one_way');
    expect(searches[0].schedule_filter.returnDate).toBeUndefined();
  });
});

/**
 * OBRS-1503 — one press of ค้นหา on the results page is ONE
 * POST /schedules/search.
 *
 * `onSearch()` used to dispatch both halves: it wrote `scheduleFilter` AND
 * fired `invokeGetScheduleListApi` itself. But writing the filter is already
 * enough — the `scheduleFilter` subscription in ngOnInit searches off the new
 * store value behind its own `isSearchable()` guard (the chain OBRS-1501 made
 * load-bearing) — so every press put two identical requests on the wire.
 * Measured on `origin/main` 0cb7bd3c: home → ค้นหา → results → ค้นหา again
 * gave 3 `POST /api/schedules/search`, #2 and #3 byte-identical.
 */
describe('ScheduleBookingFilterComponent — one press of ค้นหา is one search (OBRS-1503)', () => {
  const STATIONS: any = [
    { id: 1, slug: 'station-a', status: 'active', stopType: 'station' },
    { id: 2, slug: 'station-b', status: 'active', stopType: 'station' },
  ];

  let component: ScheduleBookingFilterComponent;
  let dispatched: any[];
  let filter$: BehaviorSubject<any>;

  const typed = (type: string) => dispatched.filter((action) => action.type === type);

  beforeEach(() => {
    dispatched = [];
    filter$ = new BehaviorSubject<any>(null);

    // Same two-observable stand-in OBRS-1501 uses: the first `pipe()` in
    // ngOnInit is the station list, everything after it is `scheduleFilter`.
    // It has to be the REAL subscription here — the duplicate this card
    // removes is only visible once both halves of the press are counted.
    let call = 0;
    const chainStore: any = {
      pipe: () => (++call === 1 ? of(STATIONS) : filter$.asObservable()),
      select: () => of(null),
      dispatch: (action: any) => dispatched.push(action),
    };

    component = new ScheduleBookingFilterComponent(
      new FormBuilder(),
      createRouterStub(),
      chainStore,
      createStoreStub(),
      createTranslateStub(),
      { warning: () => {}, error: () => {}, success: () => {} } as any,
      createBookingPolicyServiceStub(),
      createRouteMapServiceStub(),
      createStationServiceStub(),
      createLanguageServiceStub()
    );
    component.ngOnInit();

    component.bookingForm.patchValue({
      startStationId: 1,
      stopStationId: 2,
      passengerInfo: [
        { type: 'ADULT', count: 1 },
        { type: 'KIDS', count: 0 },
      ],
      departureDate: dayjs().add(1, 'day').toDate(),
    });
    dispatched.length = 0;
  });

  it('AC#4: onSearch() writes the filter and does not fire the list search itself', () => {
    component.onSearch();

    expect(typed(invokeSetScheduleFilterApi.type).length).toBe(1);
    expect(typed(invokeGetScheduleListApi.type).length).toBe(0);
  });

  it('AC#1/AC#2: the press still ends in exactly one search, carrying what the form holds', () => {
    component.onSearch();

    // The reducer stores the action payload verbatim, so replaying it into the
    // filter stream is what the store does one tick later.
    filter$.next(typed(invokeSetScheduleFilterApi.type)[0].schedule_filter);

    const searches = typed(invokeGetScheduleListApi.type);
    expect(searches.length).toBe(1);
    expect(searches[0].schedule_filter.fromStop).toBe('station-a');
    expect(searches[0].schedule_filter.toStop).toBe('station-b');
    expect(searches[0].schedule_filter.numberOfPassengers).toBe(1);
  });
});

// The twin of home-booking's "search bar actions" describe. Scrutinize caught
// that only home had it: both screens got the same structural move, but if
// someone re-nests THIS button the stylesheet it shares by `@import` goes on
// claiming a bar it no longer builds, and nothing goes red. Karma's window is
// 800px so the >=993px `order`/width branch is E2E-only either way -- what is
// testable here, and what the whole desktop branch rests on, is that the button
// is a DIRECT child of the bar.
describe('ScheduleBookingFilterComponent — the search button is a segment of the bar (OBRS-1189 AC#3)', () => {
  let fixture: ComponentFixture<ScheduleBookingFilterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ScheduleBookingFilterComponent, StationLoadErrorComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        StationSwapButtonComponent,
        TripTypeToggleComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        // OBRS-1701: both pull HttpClient transitively, exactly as the twin
        // providers in home-booking.component.spec.ts do. Stubbed here so the
        // slices below keep testing this component, not the network.
        { provide: RouteMapService, useValue: createRouteMapServiceStub() },
        { provide: StationService, useValue: createStationServiceStub() },
        { provide: Store, useValue: createStoreStub() },
        { provide: AlertService, useValue: { warning: () => {} } },
        { provide: BookingPolicyService, useValue: createBookingPolicyServiceStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleBookingFilterComponent);
    fixture.detectChanges();
  });

  it('renders the button inside .station-section, not in a row wrapper of its own', () => {
    const bar = fixture.debugElement.query(By.css('.station-section'));
    expect(bar).withContext('the search bar must exist').not.toBeNull();

    const button = bar.query(By.css('.btn-search'));
    expect(button)
      .withContext('AC#3: the search button is a segment of the bar')
      .not.toBeNull();

    // Direct child, not merely a descendant: the `d-flex justify-content-end
    // w-100` wrapper this card deleted was INSIDE `.station-section` too, and a
    // 100%-wide row is exactly what put the button on a line of its own.
    expect((button.nativeElement as HTMLElement).parentElement)
      .toBe(bar.nativeElement as HTMLElement);
  });

  it('keeps the accessible name when the label is hidden between 993 and 1199', () => {
    const button = fixture.debugElement.query(By.css('.station-section .btn-search'))
      .nativeElement as HTMLElement;

    // The label is what the stylesheet hides in that band; the aria-label is
    // unconditional, which is the only reason hiding it is allowed.
    expect(button.querySelector('.btn-search__label')).not.toBeNull();
    expect(button.getAttribute('aria-label')).toBe('HOME.HOME_BOOKING.SEARCH');
  });
});

/**
 * OBRS-1597 — landing on /schedule-booking is ONE search, and the roster
 * arriving afterwards is not a second one.
 *
 * The reported symptom was a second `POST /api/schedules/search` on arrival
 * from the home form, carrying the roster's FIRST stop as origin instead of the
 * chosen one, coming back with zero rounds and wiping the rows already
 * rendered. It did not reproduce (34 walks, see the card), and the reason it
 * cannot is structural: `ngOnInit` subscribes to two independent store streams
 * — the station roster and `scheduleFilter` — and only the second one is
 * allowed to search. `syncStationOptions()` rebuilds the option lists and
 * dispatches nothing.
 *
 * That "only one of the two may search" is the property worth pinning, because
 * nothing else states it: `ScheduleBookingComponent.ngOnInit` dispatches
 * `invokeGetAllProvinceWithStationApi()` on every arrival, so the roster stream
 * genuinely can emit again after the list has rendered. A future edit that
 * moves a dispatch into the station subscription re-creates exactly the
 * reported defect, and the origin it would carry is whatever the form holds at
 * that moment.
 */
describe('ScheduleBookingFilterComponent — arriving with a filter searches once (OBRS-1597)', () => {
  const STATIONS: any = [
    // Deliberately NOT the chosen origin: the reported payload named the
    // roster's first stop, so the first entry has to be a stop the filter does
    // not ask for, or the assertion cannot tell the two apart.
    { id: 9, slug: 'roster-first', status: 'active', stopType: 'station' },
    { id: 1, slug: 'station-a', status: 'active', stopType: 'station' },
    { id: 2, slug: 'station-b', status: 'active', stopType: 'station' },
  ];

  const SAVED_FILTER = {
    roundTrip: 1,
    startStationId: 1,
    stopStationId: 2,
    departureDate: dayjs().add(1, 'day').toDate(),
    passengerInfo: [
      { type: 'ADULT', count: 1 },
      { type: 'KIDS', count: 0 },
    ],
  };

  let component: ScheduleBookingFilterComponent;
  let dispatched: any[];
  let stations$: BehaviorSubject<any>;
  let filter$: BehaviorSubject<any>;

  const searches = () =>
    dispatched.filter((action) => action.type === invokeGetScheduleListApi.type);

  beforeEach(() => {
    dispatched = [];
    stations$ = new BehaviorSubject<any>(STATIONS);
    filter$ = new BehaviorSubject<any>(null);

    // Same two-observable stand-in as the OBRS-1503 block above: the first
    // `pipe()` in the constructor is the station roster, the second is
    // `scheduleFilter`. Here BOTH are subjects, because this card is about what
    // the roster stream is allowed to do after the list has already rendered.
    let call = 0;
    const chainStore: any = {
      pipe: () => (++call === 1 ? stations$.asObservable() : filter$.asObservable()),
      select: () => of(null),
      dispatch: (action: any) => dispatched.push(action),
    };

    component = new ScheduleBookingFilterComponent(
      new FormBuilder(),
      createRouterStub(),
      chainStore,
      createStoreStub(),
      createTranslateStub(),
      { warning: () => {}, error: () => {}, success: () => {} } as any,
      createBookingPolicyServiceStub(),
      createRouteMapServiceStub(),
      createStationServiceStub(),
      createLanguageServiceStub()
    );
    component.ngOnInit();
  });

  it('AC#3: the arrival search carries the origin the customer chose', () => {
    filter$.next(SAVED_FILTER);

    expect(searches().length).toBe(1);
    expect(searches()[0].schedule_filter.fromStop).toBe('station-a');
    expect(searches()[0].schedule_filter.toStop).toBe('station-b');
  });

  it('must-NOT: the roster arriving after the results does not fire a second search', () => {
    filter$.next(SAVED_FILTER);
    expect(searches().length).toBe(1);

    // What `ScheduleBookingComponent.ngOnInit`'s own
    // `invokeGetAllProvinceWithStationApi()` produces: the same roster, a new
    // array reference, after the list has rendered.
    stations$.next([...STATIONS]);

    expect(searches().length).toBe(1);
  });

  it('positive control: the guard is real — a filter with no origin searches not at all', () => {
    filter$.next({ ...SAVED_FILTER, startStationId: '' });

    expect(searches().length).toBe(0);
  });
});

/**
 * OBRS-1701 — the results-page filter bar offers the SAME stops the home form
 * does.
 *
 * The owner reported it from prod on 2026-09-01: origin หนองชาก, and the home
 * page offered 6 destinations while this bar offered 27. This bar carried its
 * own `syncStationOptions()` that only removed the mirror stop, so neither
 * OBRS-1213's narrowing nor OBRS-1212's ordering/grouping ever reached it. The
 * fixture is the same corridor-in-miniature the home spec uses, so a rule that
 * drifts on one screen reddens the other.
 */
describe('ScheduleBookingFilterComponent — the dropdowns offer only stops that can produce a trip (OBRS-1701)', () => {
  const ROUTES = [
    {
      slug: 'outbound',
      segments: {
        pickup: [routeStop(1, 'station-1'), routeStop(5, 'station-2')],
        dropoff: [routeStop(3, 'station-3'), routeStop(7, 'station-4')],
      },
    },
    {
      slug: 'inbound',
      segments: {
        pickup: [routeStop(1, 'station-3')],
        dropoff: [routeStop(9, 'station-1')],
      },
    },
  ];
  const ROSTER = [station(1), station(2), station(3), station(4), station(5)];
  /** Two provinces, enough to prove the headings are built here too without
   *  restating OBRS-1212's own grouping spec. Same shape as `ProvinceStopsApi`
   *  (`slug` + `translations`) — the twin fixture in
   *  home-booking.component.spec.ts, not the `id`/`nameThai`/`nameEnglish`
   *  shape `toStationGroup()` does not read, which let a prior version of this
   *  fixture produce blank headings unnoticed. */
  const PROVINCES = [
    {
      slug: 'chonburi',
      translations: { th: { label: 'ชลบุรี' }, en: { label: 'Chonburi' } },
      stops: [{ code: 'station-1' }, { code: 'station-2' }, { code: 'station-3' }],
    },
    {
      slug: 'bangkok',
      translations: { th: { label: 'กรุงเทพมหานคร' }, en: { label: 'Bangkok' } },
      stops: [{ code: 'station-4' }, { code: 'station-5' }],
    },
  ];

  /** OBRS-1503's two-observable stand-in: the constructor's FIRST `pipe()` is
   *  the station roster, the second is `scheduleFilter`. */
  function createRosterStore(): any {
    let call = 0;
    return {
      pipe: () => (++call === 1 ? of(ROSTER) : of(null)),
      select: () => of(null),
      dispatch: () => {},
    };
  }

  function build(routeMap: unknown, stationSvc?: unknown): ScheduleBookingFilterComponent {
    const component = new ScheduleBookingFilterComponent(
      new FormBuilder(),
      createRouterStub(),
      createRosterStore(),
      createStoreStub(),
      createTranslateStub(),
      { warning: () => {}, error: () => {}, success: () => {} } as any,
      createBookingPolicyServiceStub(),
      routeMap as any,
      (stationSvc ?? createStationServiceStub()) as any,
      createLanguageServiceStub()
    );
    component.ngOnInit();
    return component;
  }

  const originIds = (c: ScheduleBookingFilterComponent) =>
    offeredStations(c.startProvinceStationList).map((s) => s.id);
  const destinationIds = (c: ScheduleBookingFilterComponent) =>
    offeredStations(c.endProvinceStationList).map((s) => s.id);

  it('AC1: choosing an origin narrows the destinations to what is downstream of it', () => {
    const component = build(createRouteMapServiceStubWithRoutes(ROUTES));

    component.onStartStationChange(station(2));

    // The bug the owner reported: before this card every stop on the roster
    // stayed in the list, so `station-3` (behind the van by order 5) and
    // `station-5` (on no route at all) were both still offered.
    expect(destinationIds(component)).toEqual(jasmine.arrayWithExactContents([4]));
  });

  it('AC2: the origin dropdown drops every stop that is no route pickup', () => {
    const component = build(createRouteMapServiceStubWithRoutes(ROUTES));

    expect(originIds(component)).toEqual(jasmine.arrayWithExactContents([1, 2, 3]));
    expect(originIds(component)).not.toContain(4);
    expect(originIds(component)).not.toContain(5);
  });

  it('AC3: a destination the new origin has just invalidated is CLEARED, not left selected', () => {
    const component = build(createRouteMapServiceStubWithRoutes(ROUTES));

    component.onEndStationChange(station(3));
    expect(component.getFormValue('stopStationId')).toBe(3);

    component.onStartStationChange(station(2));

    expect(component.getFormValue('stopStationId')).toBe('');
    expect(destinationIds(component)).not.toContain(3);
  });

  it('AC3: the swap button re-narrows through the same rule, not just re-labels the fields', () => {
    const component = build(createRouteMapServiceStubWithRoutes(ROUTES));

    // station-1 to station-3 is a real outbound trip. Swapped, the origin is
    // station-3, which is a pickup on the INBOUND route only — so the
    // destinations must become that route's, not the outbound ones the fields
    // were showing a moment ago. Before this card the swap left all five stops
    // in the list.
    component.onStartStationChange(station(1));
    component.onEndStationChange(station(3));

    component.onSwapStations();

    expect(component.getFormValue('startStationId')).toBe(3);
    expect(component.getFormValue('stopStationId')).toBe(1);
    expect(destinationIds(component)).toEqual(jasmine.arrayWithExactContents([1]));
  });

  it('AC3: swapping onto a stop that is nobody\'s pickup clears the far side too', () => {
    const component = build(createRouteMapServiceStubWithRoutes(ROUTES));

    // station-2 to station-4 is a real outbound trip. Swapped, the new
    // "origin" is station-4 — a dropoff-only stop, not a pickup on ANY
    // route — so narrowing falls back to "offer every reachable stop"
    // (the `narrowFrom` rule), and station-2 (now the stop) is not a
    // dropoff on any route either, so it must be released, not left
    // selected pointing at an impossible trip.
    component.onStartStationChange(station(2));
    component.onEndStationChange(station(4));

    component.onSwapStations();

    expect(component.getFormValue('startStationId')).toBe(4);
    expect(component.getFormValue('stopStationId')).toBe('');
    expect(destinationIds(component)).not.toContain(2);
  });

  it('AC4: a failed /api/routes degrades to offering every stop, never to an empty dropdown', () => {
    const component = build({
      getActiveRoutes: () => throwError(() => new Error('network down')),
      getPickupDropoffCached: () => of(null),
      getPickupDropoff: () => of(null),
      getFirstActiveRouteSlug: () => of(null),
    });

    expect(originIds(component)).toEqual(jasmine.arrayWithExactContents([1, 2, 3, 4, 5]));
    expect(destinationIds(component)).toEqual(
      jasmine.arrayWithExactContents([1, 2, 3, 4, 5])
    );
  });

  it('AC4: an empty active-route list degrades the same way — it is not a claim that nothing is bookable', () => {
    const component = build(createRouteMapServiceStubWithRoutes([]));

    expect(originIds(component)).toEqual(jasmine.arrayWithExactContents([1, 2, 3, 4, 5]));
  });

  it('AC5: the options carry province headings, in route order, once province data resolves', () => {
    const component = build(
      createRouteMapServiceStubWithRoutes(ROUTES),
      createStationServiceStub(PROVINCES)
    );

    component.onStartStationChange(station(1));

    const groups = component.endProvinceStationList as any[];
    expect(groups.every((g) => Array.isArray(g?.stations))).toBeTrue();
    // The headings themselves — not just that grouping happened.
    expect(groups.map((g) => g.nameEnglish)).toEqual(['Chonburi', 'Bangkok']);
    // Ordered by the route's `order` (3 then 7), not by the roster's id order.
    expect(offeredStations(groups).map((s) => s.slug)).toEqual([
      'station-3',
      'station-4',
    ]);
  });

  it('AC5: no province data leaves the list flat and still ordered — headings are a refinement, not a gate', () => {
    const component = build(createRouteMapServiceStubWithRoutes(ROUTES));

    component.onStartStationChange(station(1));

    expect(
      (component.endProvinceStationList as any[]).every((e) => !Array.isArray(e?.stations))
    ).toBeTrue();
    expect(destinationIds(component)).toEqual([3, 4]);
  });
});

/** OBRS-1701: a `RouteMapService` stub answering with real route segments —
 *  same shape as the twin in home-booking.component.spec.ts. */
function createRouteMapServiceStubWithRoutes(routes: unknown[]): any {
  const bySlug = new Map<string, unknown>(routes.map((r: any) => [r.slug, r.segments]));
  return {
    getActiveRoutes: () => of(routes.map((r: any) => ({ slug: r.slug }))),
    getPickupDropoffCached: (slug: string) => of(bySlug.get(slug) ?? null),
    getPickupDropoff: () => of(null),
    getFirstActiveRouteSlug: () => of(null),
  };
}

/** A `RouteStop` with only the fields the OBRS-1213 derivation reads. */
function routeStop(order: number, slug: string): any {
  return { order, slug, name: slug, address: '', approxTime: '' };
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
