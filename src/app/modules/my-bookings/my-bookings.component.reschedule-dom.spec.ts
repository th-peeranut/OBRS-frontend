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
  selectMyBookings,
  selectRescheduleDialogBookingId,
} from './store/my-bookings.selector';
import { openRescheduleDialog } from './store/my-bookings.action';

/**
 * Locks design-system §6/§11's "shown but disabled, never hidden" rule for
 * the Reschedule action (now a menu item, not an inline button — see the
 * OBRS-83 action-menu consolidation), and the optimistic-open contract for
 * its dialog. See my-bookings.component.spec.ts for the exhaustive
 * eligibility-reason matrix at the logic level.
 *
 * `<p-menu>` is an unknown element under `NO_ERRORS_SCHEMA` (its content is
 * also asynchronously overlaid via `appendTo="body"`), so — following the
 * exact same pattern already established for
 * `WalkInTripBrowserComponent`/`walk-in-trip-browser.component.spec.ts`
 * (staff module, the only other `p-menu` consumer in this codebase) — these
 * tests stub `actionMenu.toggle` and assert against the built
 * `actionMenuItems` array (what the menu's custom item template renders)
 * rather than the rendered popup DOM.
 */
describe('MyBookingsComponent (reschedule action — action menu)', () => {
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
      // OBRS-699: the window is wire-supplied now, so every fixture must state
      // it — a booking without it is INELIGIBLE by design, not "defaults to 2".
      rescheduleWindowHours: 2,
      // OBRS-1447: the cap joined that contract. 0 = UNLIMITED, the shipped default.
      rescheduleMaxCount: 0,
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
    // ViewChild p-menu is an unknown element under NO_ERRORS_SCHEMA, so it
    // resolves to undefined; stub toggle AFTER the first detectChanges (same
    // workaround as walk-in-trip-browser.component.spec.ts) — assigning
    // before detectChanges gets clobbered by Angular's own view-query
    // resolution pass.
    fixture.componentInstance.actionMenu = { toggle: jasmine.createSpy('toggle') } as unknown as Menu;
  }

  function actionsMenuButton(): HTMLButtonElement {
    return fixture.debugElement.query(By.css('.actions-menu-btn')).nativeElement as HTMLButtonElement;
  }

  function openMenu(): void {
    actionsMenuButton().click();
  }

  function rescheduleItem() {
    const item = fixture.componentInstance.actionMenuItems.find(
      (candidate) => candidate.label === 'MY_BOOKINGS.RESCHEDULE.ACTION'
    );
    if (!item) {
      throw new Error('Reschedule item not found in actionMenuItems — it must never be omitted.');
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
    // `overrideSelector` pins the shared, module-singleton selector's
    // memoized result (`resultSelector.setResult(value)`) — without
    // releasing it here, that pin leaks into unrelated spec files sharing
    // the same Karma bundle (e.g. reschedule-dialog.component.spec.ts, which
    // exercises these same selectors against a plain, non-mock store).
    store.resetSelectors();
  });

  it('the action menu trigger is a real, always-present button with an aria-label', () => {
    render(buildBooking({ status: 'pending' }));

    const button = actionsMenuButton();
    expect(button).withContext('the trigger must never be *ngIf-removed').not.toBeNull();
    expect(button.getAttribute('aria-label')).toBe('MY_BOOKINGS.ACTIONS_MENU.LABEL');
    expect(button.getAttribute('aria-haspopup')).toBe('true');
  });

  it('includes Reschedule in the opened menu, disabled with its localized reason, for an ineligible booking', () => {
    render(buildBooking({ status: 'pending' }));

    openMenu();

    const item = rescheduleItem();
    expect(item.disabled)
      .withContext('disabled, never omitted — this is the whole point of OBRS-83')
      .toBeTrue();
    expect(item.reasonText).toBe('MY_BOOKINGS.RESCHEDULE.REASON.NOT_CONFIRMED');
  });

  it('includes Reschedule enabled, with no reason text, for an eligible booking', () => {
    render(buildBooking());

    openMenu();

    const item = rescheduleItem();
    expect(item.disabled).toBeFalse();
    expect(item.reasonText).toBeUndefined();
  });

  /** A departure 3h out — the one band where a 2h and a 4h window disagree. */
  function threeHoursOut(): Pick<MyBookingDto, 'bookingSchedules'> {
    return {
      bookingSchedules: [
        {
          id: 1,
          departureDateTime: dayjs().add(3, 'hour').toISOString(),
          fromStop: { code: 'a', display: { en: { label: 'A' } } },
          toStop: { code: 'b', display: { en: { label: 'B' } } },
          tickets: [{ id: 1, seatNumber: '1' }],
        },
      ],
    };
  }

  // OBRS-699: these two are a matched pair and only mean something together.
  // The guard is `hoursUntilDeparture <= rescheduleWindowHours` -> INELIGIBLE,
  // so at 3h out a wire value of 2 offers the action and 4 blocks it. Running
  // the SAME departure through both values is what proves the component reads
  // the operator's number off the row instead of any constant: a component
  // that ignored the wire could not satisfy both.
  it('OBRS-699: Reschedule is offered at 3h out when the operator window on the row is 2h', () => {
    render(buildBooking({ ...threeHoursOut(), rescheduleWindowHours: 2 }));

    openMenu();

    const item = rescheduleItem();
    expect(item.disabled)
      .withContext('3h out is outside a 2h window — the traveller must still be able to move it')
      .toBeFalse();
    expect(item.reasonText).toBeUndefined();
  });

  it('OBRS-699: the SAME 3h departure is refused when the operator window on the row is 4h', () => {
    render(buildBooking({ ...threeHoursOut(), rescheduleWindowHours: 4 }));

    openMenu();

    const item = rescheduleItem();
    expect(item.disabled)
      .withContext('3h out is inside a 4h window — this arm is what makes the pair above non-vacuous')
      .toBeTrue();
    expect(item.reasonText).toBe('MY_BOOKINGS.RESCHEDULE.REASON.NO_WINDOW');
  });

  it('OBRS-699: Reschedule is refused when the backend could not resolve a window (absent)', () => {
    // Absent means "no governing operator", never "use the default" — an
    // under-offer. Without this arm the no-fallback decision is untested.
    render(buildBooking({ rescheduleWindowHours: undefined }));

    openMenu();

    const item = rescheduleItem();
    expect(item.disabled)
      .withContext('a booking whose policy the backend cannot state must not advertise the action')
      .toBeTrue();
    expect(item.reasonText).toBe('MY_BOOKINGS.RESCHEDULE.REASON.NO_WINDOW');
  });

  it('dispatches openRescheduleDialog when the enabled Reschedule item is activated', () => {
    render(buildBooking());
    const dispatchSpy = spyOn(store, 'dispatch');

    openMenu();
    rescheduleItem().command?.({});

    expect(dispatchSpy).toHaveBeenCalledWith(openRescheduleDialog({ bookingId: 42 }));
  });

  it('does nothing when the disabled Reschedule item is activated', () => {
    render(buildBooking({ status: 'pending' }));
    const dispatchSpy = spyOn(store, 'dispatch');

    openMenu();
    // PrimeNG's own Menu.itemClick() short-circuits on item.disabled before
    // ever invoking command() — component.onReschedule() also guards
    // defensively, asserted directly here.
    rescheduleItem().command?.({});

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('opens the popup via actionMenu.toggle when the trigger is clicked', () => {
    render(buildBooking());

    openMenu();

    expect(fixture.componentInstance.actionMenu.toggle).toHaveBeenCalled();
  });

  it('opens the dialog optimistically — it renders as soon as the store reflects the open, synchronously', () => {
    render(buildBooking());
    expect(fixture.debugElement.query(By.css('app-reschedule-dialog'))).toBeNull();

    store.overrideSelector(selectRescheduleDialogBookingId, 42);
    store.refreshState();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('app-reschedule-dialog'))).not.toBeNull();
  });

  describe('View e-ticket / Cancel booking items (menu consolidation)', () => {
    it('lists View e-ticket, Reschedule, Change seat, Change stop, Cancel booking in that order for a confirmed booking', () => {
      // Change seat (OBRS-110 wave 1) and Change stop (OBRS-110 wave 2) were
      // added as the menu's 4th and 5th items, between Reschedule and Cancel
      // booking — see my-bookings.component.change-seat-dom.spec.ts /
      // my-bookings.component.change-stop-dom.spec.ts for their own
      // dedicated eligibility/dispatch coverage.
      render(buildBooking());

      openMenu();

      expect(fixture.componentInstance.actionMenuItems.map((item) => item.label)).toEqual([
        'MY_BOOKINGS.VIEW_TICKET',
        'MY_BOOKINGS.RESCHEDULE.ACTION',
        'MY_BOOKINGS.CHANGE_SEAT.ACTION',
        'MY_BOOKINGS.CHANGE_STOP.ACTION',
        'MY_BOOKINGS.CANCEL.ACTION',
      ]);
    });

    it('omits View e-ticket and Cancel booking (but still includes Reschedule, disabled) for a non-confirmed booking', () => {
      render(buildBooking({ status: 'pending' }));

      openMenu();

      const labels = fixture.componentInstance.actionMenuItems.map((item) => item.label);
      expect(labels).not.toContain('MY_BOOKINGS.VIEW_TICKET');
      expect(labels).not.toContain('MY_BOOKINGS.CANCEL.ACTION');
      expect(labels).toContain('MY_BOOKINGS.RESCHEDULE.ACTION');
    });

    it('styles Cancel booking as the destructive item and reuses the existing cancel handler', () => {
      render(buildBooking());
      const dispatchSpy = spyOn(store, 'dispatch');

      openMenu();
      const cancelItem = fixture.componentInstance.actionMenuItems.find(
        (item) => item.label === 'MY_BOOKINGS.CANCEL.ACTION'
      );

      expect(cancelItem?.danger).toBeTrue();
      cancelItem?.command?.({});
      expect(dispatchSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ booking: jasmine.objectContaining({ id: 42 }) })
      );
    });

    it('reuses the existing ticket-modal handler for View e-ticket', () => {
      render(buildBooking());

      openMenu();
      const ticketItem = fixture.componentInstance.actionMenuItems.find(
        (item) => item.label === 'MY_BOOKINGS.VIEW_TICKET'
      );
      ticketItem?.command?.({});

      expect(fixture.componentInstance.activeTicketBookingId).toBe(42);
    });
  });
});
