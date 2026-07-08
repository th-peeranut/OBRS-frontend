import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import dayjs from 'dayjs';

import { MyBookingsComponent } from './my-bookings.component';
import { MyBookingDto } from '../../shared/interfaces/my-booking.interface';
import { initialMyBookingsState } from './store/my-bookings.model';
import {
  selectMyBookings,
  selectRescheduleDialogBookingId,
} from './store/my-bookings.selector';
import { openRescheduleDialog } from './store/my-bookings.action';

/**
 * Locks design-system §6/§11's "shown but disabled, never hidden" rule for
 * the Reschedule action, and the optimistic-open contract for its dialog —
 * both assert against the real, compiled DOM rather than just the view-model
 * (see my-bookings.component.spec.ts for the exhaustive eligibility-reason
 * matrix at the logic level).
 */
describe('MyBookingsComponent (reschedule action — DOM)', () => {
  let fixture: ComponentFixture<MyBookingsComponent>;
  let store: MockStore;

  function buildBooking(overrides: Partial<MyBookingDto> = {}): MyBookingDto {
    return {
      id: 42,
      bookingNumber: 'B-DOM1',
      totalAmount: '100',
      status: 'confirmed',
      bookingType: 'one_way',
      rescheduleCount: 0,
      createdAt: dayjs().toISOString(),
      bookingSchedules: [
        {
          id: 1,
          departureDateTime: dayjs().add(10, 'day').toISOString(),
          fromStop: { code: 'a', display: { en: { label: 'A' } } },
          toStop: { code: 'b', display: { en: { label: 'B' } } },
          tickets: [{ id: 1, seatNumber: '1' }],
        },
      ],
      ...overrides,
    };
  }

  function render(booking: MyBookingDto): void {
    store.overrideSelector(selectMyBookings, {
      ...initialMyBookingsState,
      bookings: [booking],
      loaded: true,
    });
    store.overrideSelector(selectRescheduleDialogBookingId, null);
    fixture = TestBed.createComponent(MyBookingsComponent);
    fixture.detectChanges();
  }

  function rescheduleButton(): HTMLButtonElement {
    return fixture.debugElement.query(By.css('.btn-reschedule')).nativeElement as HTMLButtonElement;
  }

  function tooltipText(): string | null {
    const el = fixture.debugElement.query(By.css('.tooltip-box'));
    return el ? (el.nativeElement.textContent || '').trim() : null;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MyBookingsComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [provideMockStore()],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    // `overrideSelector` pins the shared, module-singleton selector's
    // memoized result (`resultSelector.setResult(value)`) — without
    // releasing it here, that pin leaks into unrelated spec files sharing
    // the same Karma bundle (e.g. reschedule-dialog.component.spec.ts, which
    // exercises these same selectors against a plain, non-mock store).
    store.resetSelectors();
  });

  it('renders Reschedule disabled, but still present in the DOM, for an ineligible booking', () => {
    render(buildBooking({ status: 'pending' }));

    const button = rescheduleButton();
    expect(button).withContext('the button must never be *ngIf-removed').not.toBeNull();
    expect(button.disabled).toBeTrue();
    expect(tooltipText()).toBe('MY_BOOKINGS.RESCHEDULE.REASON.NOT_CONFIRMED');
  });

  it('renders Reschedule enabled for an eligible booking, with no tooltip', () => {
    render(buildBooking());

    const button = rescheduleButton();
    expect(button.disabled).toBeFalse();
    expect(tooltipText()).toBeNull();
  });

  it('dispatches openRescheduleDialog when the enabled action is clicked', () => {
    render(buildBooking());
    const dispatchSpy = spyOn(store, 'dispatch');

    rescheduleButton().click();

    expect(dispatchSpy).toHaveBeenCalledWith(openRescheduleDialog({ bookingId: 42 }));
  });

  it('does nothing when a disabled Reschedule button is clicked', () => {
    render(buildBooking({ status: 'pending' }));
    const dispatchSpy = spyOn(store, 'dispatch');

    // Disabled native buttons don't fire click handlers via a real click, but
    // the host binding also guards defensively — assert the guard directly.
    rescheduleButton().click();

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('opens the dialog optimistically — it renders as soon as the store reflects the open, synchronously', () => {
    render(buildBooking());
    expect(fixture.debugElement.query(By.css('app-reschedule-dialog'))).toBeNull();

    store.overrideSelector(selectRescheduleDialogBookingId, 42);
    store.refreshState();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-reschedule-dialog'))).not.toBeNull();
  });
});
