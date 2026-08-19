import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Menu } from 'primeng/menu';
import dayjs from 'dayjs';

import { MyBookingsComponent } from './my-bookings.component';
import { MyBookingDto } from '../../shared/interfaces/my-booking.interface';
import { initialMyBookingsState } from './store/my-bookings.model';
import {
  selectChangeSeatDialogBookingId,
  selectChangeStopDialogBookingId,
  selectMyBookings,
  selectRescheduleDialogBookingId,
} from './store/my-bookings.selector';
import { openChangeStopDialog } from './store/my-bookings.action';

/**
 * Locks design-system §6/§11's "shown but disabled, never hidden" rule for
 * the Change stop action (OBRS-110 wave 2), and the optimistic-open contract
 * for its dialog — mirrors `my-bookings.component.change-seat-dom.spec.ts`
 * for the sibling Change seat action. See my-bookings.component.spec.ts for
 * the exhaustive eligibility-reason matrix at the logic level.
 */
describe('MyBookingsComponent (change stop action — action menu)', () => {
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
      seatChangeCount: 0,
      stopChangeCount: 0,
      // OBRS-699: change-stop is gated on the operator's
      // `reschedule_window_hours`, wire-supplied per row.
      rescheduleWindowHours: 2,
      createdAt: dayjs().toISOString(),
      bookingSchedules: [
        {
          id: 1,
          departureDateTime: dayjs().add(10, 'day').toISOString(),
          fromStop: { code: 'a', display: { en: { label: 'A' } } },
          toStop: { code: 'b', display: { en: { label: 'B' } } },
          tickets: [{ id: 1, seatNumber: '1' }],
          routeSlug: 'bkk-cnx',
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
    store.overrideSelector(selectChangeSeatDialogBookingId, null);
    store.overrideSelector(selectChangeStopDialogBookingId, null);
    fixture = TestBed.createComponent(MyBookingsComponent);
    fixture.detectChanges();
    // ViewChild p-menu is an unknown element under NO_ERRORS_SCHEMA — stub
    // toggle AFTER the first detectChanges (same workaround as
    // walk-in-trip-browser.component.spec.ts / reschedule-dom.spec.ts).
    fixture.componentInstance.actionMenu = { toggle: jasmine.createSpy('toggle') } as unknown as Menu;
  }

  function actionsMenuButton(): HTMLButtonElement {
    return fixture.debugElement.query(By.css('.actions-menu-btn')).nativeElement as HTMLButtonElement;
  }

  function openMenu(): void {
    actionsMenuButton().click();
  }

  function changeStopItem() {
    const item = fixture.componentInstance.actionMenuItems.find(
      (candidate) => candidate.label === 'MY_BOOKINGS.CHANGE_STOP.ACTION'
    );
    if (!item) {
      throw new Error('Change stop item not found in actionMenuItems — it must never be omitted.');
    }
    return item;
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
    // See the matching comment in reschedule-dom.spec.ts — `overrideSelector`
    // pins the shared selector singleton's memoized result and leaks into
    // other spec files in the same Karma bundle unless released.
    store.resetSelectors();
  });

  it('includes Change stop in the opened menu, disabled with its localized reason, for an ineligible booking', () => {
    render(buildBooking({ status: 'pending' }));

    openMenu();

    const item = changeStopItem();
    expect(item.disabled)
      .withContext('disabled, never omitted — same contract as Reschedule/Change seat')
      .toBeTrue();
    expect(item.reasonText).toBe('MY_BOOKINGS.CHANGE_STOP.REASON.NOT_CONFIRMED');
  });

  // OBRS-699: same story as change-seat — the FE's hardcoded 4h is gone and
  // the gate is the operator's `reschedule_window_hours` off the row.
  it('OBRS-699: Change stop is refused at 3h out when the operator window on the row is 4h', () => {
    render(
      buildBooking({
        rescheduleWindowHours: 4,
        bookingSchedules: [
          {
            id: 1,
            departureDateTime: dayjs().add(3, 'hour').toISOString(),
            fromStop: { code: 'a', display: { en: { label: 'A' } } },
            toStop: { code: 'b', display: { en: { label: 'B' } } },
            tickets: [{ id: 1, seatNumber: '1' }],
            routeSlug: 'bkk-cnx',
          },
        ],
      })
    );

    openMenu();

    const item = changeStopItem();
    expect(item.disabled).toBeTrue();
    expect(item.reasonText).toBe('MY_BOOKINGS.CHANGE_STOP.REASON.NO_WINDOW');
  });

  it('OBRS-699: the SAME 3h departure is offered when the operator window on the row is 2h', () => {
    render(
      buildBooking({
        rescheduleWindowHours: 2,
        bookingSchedules: [
          {
            id: 1,
            departureDateTime: dayjs().add(3, 'hour').toISOString(),
            fromStop: { code: 'a', display: { en: { label: 'A' } } },
            toStop: { code: 'b', display: { en: { label: 'B' } } },
            tickets: [{ id: 1, seatNumber: '1' }],
            routeSlug: 'bkk-cnx',
          },
        ],
      })
    );

    openMenu();

    expect(changeStopItem().disabled)
      .withContext('the 4h FE cutoff hid a stop change the backend would have accepted')
      .toBeFalse();
  });

  it('OBRS-699: Change stop is refused when the backend could not resolve a window (absent)', () => {
    render(buildBooking({ rescheduleWindowHours: undefined }));

    openMenu();

    const item = changeStopItem();
    expect(item.disabled)
      .withContext('absent means no governing operator — under-offer, never a default')
      .toBeTrue();
    expect(item.reasonText).toBe('MY_BOOKINGS.CHANGE_STOP.REASON.NO_WINDOW');
  });

  it('is disabled with NOT_ONE_WAY when the booking is not one-way/single-leg', () => {
    render(buildBooking({ bookingType: 'return' }));

    openMenu();

    expect(changeStopItem().reasonText).toBe('MY_BOOKINGS.CHANGE_STOP.REASON.NOT_ONE_WAY');
  });

  it('stays ENABLED, no reason text, when the schedule is OPEN-seating (OBRS-483 — change-stop is the headline feature this card ships for OPEN, unlike change-seat which has no seat to change there)', () => {
    render(
      buildBooking({
        bookingSchedules: [
          {
            id: 1,
            departureDateTime: dayjs().add(10, 'day').toISOString(),
            fromStop: { code: 'a', display: { en: { label: 'A' } } },
            toStop: { code: 'b', display: { en: { label: 'B' } } },
            tickets: [{ id: 1, seatNumber: null }],
            routeSlug: 'bkk-cnx',
            seatingMode: 'OPEN',
          },
        ],
      })
    );

    openMenu();

    const item = changeStopItem();
    expect(item.disabled).toBeFalse();
    expect(item.reasonText).toBeUndefined();
  });

  it('is disabled with ALREADY_USED when stopChangeCount is already 1', () => {
    render(buildBooking({ stopChangeCount: 1 }));

    openMenu();

    expect(changeStopItem().reasonText).toBe('MY_BOOKINGS.CHANGE_STOP.REASON.ALREADY_USED');
  });

  it('is disabled with NO_WINDOW when departure is inside the 4h window', () => {
    render(
      buildBooking({
        bookingSchedules: [
          {
            id: 1,
            departureDateTime: dayjs().add(1, 'hour').toISOString(),
            fromStop: { code: 'a' },
            toStop: { code: 'b' },
            tickets: [{ id: 1, seatNumber: '1' }],
            routeSlug: 'bkk-cnx',
          },
        ],
      })
    );

    openMenu();

    expect(changeStopItem().reasonText).toBe('MY_BOOKINGS.CHANGE_STOP.REASON.NO_WINDOW');
  });

  it('includes Change stop enabled, with no reason text, for an eligible booking', () => {
    render(buildBooking());

    openMenu();

    const item = changeStopItem();
    expect(item.disabled).toBeFalse();
    expect(item.reasonText).toBeUndefined();
  });

  it('dispatches openChangeStopDialog when the enabled Change stop item is activated', () => {
    render(buildBooking());
    const dispatchSpy = spyOn(store, 'dispatch');

    openMenu();
    changeStopItem().command?.({});

    expect(dispatchSpy).toHaveBeenCalledWith(openChangeStopDialog({ bookingId: 42 }));
  });

  it('does nothing when the disabled Change stop item is activated', () => {
    render(buildBooking({ status: 'pending' }));
    const dispatchSpy = spyOn(store, 'dispatch');

    openMenu();
    changeStopItem().command?.({});

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('opens the change-stop dialog optimistically — it renders as soon as the store reflects the open, synchronously', () => {
    render(buildBooking());
    expect(fixture.debugElement.query(By.css('app-change-stop-dialog'))).toBeNull();

    store.overrideSelector(selectChangeStopDialogBookingId, 42);
    store.refreshState();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-change-stop-dialog'))).not.toBeNull();
  });
});
