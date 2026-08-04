import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import dayjs from 'dayjs';

import { ScheduleBookingFilterComponent } from './schedule-booking-filter.component';
import { DropdownObrsComponent } from '../../../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownGroupObrsComponent } from '../../../../shared/components/dropdown-group-obrs/dropdown-group-obrs.component';
import { DropdownObrsPassengerComponent } from '../../../home/components/dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import { AlertService } from '../../../../shared/services/alert.service';
import {
  BOOKING_POLICY_MAX_ADVANCE_DAYS_FALLBACK,
  BookingPolicyService,
} from '../../../../services/booking-policy/booking-policy.service';
import {
  createLanguageServiceStub,
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';
import { LanguageService } from '../../../../shared/services/language.service';

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
      declarations: [ScheduleBookingFilterComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
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
      declarations: [ScheduleBookingFilterComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
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
      declarations: [ScheduleBookingFilterComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
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
      declarations: [ScheduleBookingFilterComponent],
      imports: [
        ReactiveFormsModule,
        TranslateModule.forRoot(),
        DatePickerModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
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
