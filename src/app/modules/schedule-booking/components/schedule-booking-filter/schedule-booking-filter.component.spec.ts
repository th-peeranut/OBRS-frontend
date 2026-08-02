import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
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
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';

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
      createBookingPolicyServiceStub()
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
      createBookingPolicyServiceStub(configured)
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
      } as unknown as BookingPolicyService
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
