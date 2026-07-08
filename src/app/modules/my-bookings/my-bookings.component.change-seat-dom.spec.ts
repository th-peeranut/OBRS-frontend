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
  selectMyBookings,
  selectRescheduleDialogBookingId,
} from './store/my-bookings.selector';
import { openChangeSeatDialog } from './store/my-bookings.action';

/**
 * Locks design-system §6/§11's "shown but disabled, never hidden" rule for
 * the Change seat action (OBRS-110), and the optimistic-open contract for
 * its dialog — mirrors `my-bookings.component.reschedule-dom.spec.ts` for
 * the sibling Reschedule action. See my-bookings.component.spec.ts for the
 * exhaustive eligibility-reason matrix at the logic level.
 */
describe('MyBookingsComponent (change seat action — action menu)', () => {
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
    store.overrideSelector(selectChangeSeatDialogBookingId, null);
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

  function changeSeatItem() {
    const item = fixture.componentInstance.actionMenuItems.find(
      (candidate) => candidate.label === 'MY_BOOKINGS.CHANGE_SEAT.ACTION'
    );
    if (!item) {
      throw new Error('Change seat item not found in actionMenuItems — it must never be omitted.');
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

  it('includes Change seat in the opened menu, disabled with its localized reason, for an ineligible booking', () => {
    render(buildBooking({ status: 'pending' }));

    openMenu();

    const item = changeSeatItem();
    expect(item.disabled)
      .withContext('disabled, never omitted — same contract as Reschedule')
      .toBeTrue();
    expect(item.reasonText).toBe('MY_BOOKINGS.CHANGE_SEAT.REASON.NOT_CONFIRMED');
  });

  it('includes Change seat enabled, with no reason text, for an eligible booking', () => {
    render(buildBooking());

    openMenu();

    const item = changeSeatItem();
    expect(item.disabled).toBeFalse();
    expect(item.reasonText).toBeUndefined();
  });

  it('dispatches openChangeSeatDialog when the enabled Change seat item is activated', () => {
    render(buildBooking());
    const dispatchSpy = spyOn(store, 'dispatch');

    openMenu();
    changeSeatItem().command?.({});

    expect(dispatchSpy).toHaveBeenCalledWith(openChangeSeatDialog({ bookingId: 42 }));
  });

  it('does nothing when the disabled Change seat item is activated', () => {
    render(buildBooking({ status: 'pending' }));
    const dispatchSpy = spyOn(store, 'dispatch');

    openMenu();
    changeSeatItem().command?.({});

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('lists View e-ticket, Reschedule, Change seat, Cancel booking in that order for a confirmed booking', () => {
    render(buildBooking());

    openMenu();

    expect(fixture.componentInstance.actionMenuItems.map((item) => item.label)).toEqual([
      'MY_BOOKINGS.VIEW_TICKET',
      'MY_BOOKINGS.RESCHEDULE.ACTION',
      'MY_BOOKINGS.CHANGE_SEAT.ACTION',
      'MY_BOOKINGS.CANCEL.ACTION',
    ]);
  });

  it('omits View e-ticket and Cancel booking (but still includes Change seat, disabled) for a non-confirmed booking', () => {
    render(buildBooking({ status: 'pending' }));

    openMenu();

    const labels = fixture.componentInstance.actionMenuItems.map((item) => item.label);
    expect(labels).not.toContain('MY_BOOKINGS.VIEW_TICKET');
    expect(labels).not.toContain('MY_BOOKINGS.CANCEL.ACTION');
    expect(labels).toContain('MY_BOOKINGS.CHANGE_SEAT.ACTION');
  });

  it('opens the change-seat dialog optimistically — it renders as soon as the store reflects the open, synchronously', () => {
    render(buildBooking());
    expect(fixture.debugElement.query(By.css('app-change-seat-dialog'))).toBeNull();

    store.overrideSelector(selectChangeSeatDialogBookingId, 42);
    store.refreshState();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-change-seat-dialog'))).not.toBeNull();
  });
});
