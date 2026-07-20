import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { CalendarModule } from 'primeng/calendar';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import dayjs from 'dayjs';

import { HomeBookingComponent } from './home-booking.component';
import { DropdownObrsComponent } from '../../../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownGroupObrsComponent } from '../../../../shared/components/dropdown-group-obrs/dropdown-group-obrs.component';
import { DropdownObrsPassengerComponent } from '../dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import { BookingPolicyService } from '../../../../services/booking-policy/booking-policy.service';
import { createRouterStub, createStoreStub } from '../../../../testing/test-stubs';

describe('HomeBookingComponent', () => {
  let component: HomeBookingComponent;

  beforeEach(() => {
    component = new HomeBookingComponent(
      new FormBuilder(),
      createRouterStub(),
      createStoreStub(),
      createStoreStub(),
      { getBookingPolicy: () => of({ code: 200, message: 'OK' }) } as unknown as BookingPolicyService
    );
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

  it('seeds maxDate synchronously with the today+30-day fallback (before the API resolves)', () => {
    const expected = dayjs().add(30, 'day');
    expect(dayjs(component.maxDate).isSame(expected, 'day')).toBeTrue();
  });
});

// OBRS-564: DOM-level regression guard for the actual bug this card
// describes — binding maxDate only on the departure calendar lets a user
// pick a return date past the real cap and eat a 400 from the server. A
// unit-level construction test (above) can't see a missing template
// binding, only a compiled-template render can, so this block renders the
// real component via TestBed (same CalendarModule/ReactiveFormsModule/
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
        CalendarModule,
        DropdownObrsComponent,
        DropdownGroupObrsComponent,
        DropdownObrsPassengerComponent,
      ],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        { provide: Store, useValue: createStoreStub() },
        { provide: BookingPolicyService, useValue: bookingPolicyServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeBookingComponent);
    component = fixture.componentInstance;
  });

  it('applies the resolved maxDate to BOTH the departure and return p-calendar controls', () => {
    // Reveal the return-trip calendar too, so both p-calendar instances exist.
    component.isRoundTripReturn = true;

    fixture.detectChanges(); // ngOnInit -> bookingPolicyServiceStub resolves synchronously

    const expected = dayjs().add(CONFIGURED_MAX_ADVANCE_DAYS, 'day');
    expect(dayjs(component.maxDate).isSame(expected, 'day')).toBeTrue();

    const calendars = fixture.debugElement.queryAll(By.css('p-calendar'));
    expect(calendars.length).toBe(2);

    for (const calendarDe of calendars) {
      const boundMaxDate = calendarDe.componentInstance.maxDate as Date;
      expect(dayjs(boundMaxDate).isSame(expected, 'day')).toBeTrue();
    }
  });
});
