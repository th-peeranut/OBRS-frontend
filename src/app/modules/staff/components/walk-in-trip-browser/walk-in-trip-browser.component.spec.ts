import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { WalkInTripBrowserComponent } from './walk-in-trip-browser.component';
import { WalkInTripDto, WalkInRouteGroupDto } from '../../../../services/staff/staff-api.service';
import { createTranslateStub } from '../../../../testing/test-stubs';

function makeTrip(overrides: Partial<WalkInTripDto> = {}): WalkInTripDto {
  return {
    scheduleId: 1,
    vehicleType: 'bus',
    licensePlate: 'AB-1234',
    driverName: 'John',
    departureDateTime: '2026-07-01T08:00:00',
    arrivalDateTime: '2026-07-01T12:00:00',
    pricePerSeat: '300',
    capacity: 21,
    availableCount: 15,
    reservedUnpaidCount: 3,
    soldPaidCount: 3,
    availableSeatNumbers: ['1', '2', '3', '4', '5'],
    ...overrides,
  };
}

function makeGroup(routeSlug: string, trips: WalkInTripDto[]): WalkInRouteGroupDto {
  return { routeSlug, routeLabel: `Route ${routeSlug}`, trips };
}

function mockEvent(): { stopPropagation: jasmine.Spy; currentTarget: HTMLButtonElement } {
  return {
    stopPropagation: jasmine.createSpy('stopPropagation'),
    currentTarget: document.createElement('button'),
  };
}

function makeComponent(): WalkInTripBrowserComponent {
  return new WalkInTripBrowserComponent(createTranslateStub());
}

describe('WalkInTripBrowserComponent', () => {
  it('should create', () => {
    const comp = makeComponent();
    expect(comp).toBeTruthy();
  });

  describe('sortedGroups — no mutation', () => {
    it('does not mutate the routeGroups input array when canManageSchedules=true', () => {
      const comp = makeComponent();
      const trip1 = makeTrip({ scheduleId: 1 });
      const originalTrips = [trip1];
      const originalGroup = makeGroup('r1', originalTrips);
      const originalGroups = [originalGroup];

      (comp as any).routeGroups = originalGroups;
      (comp as any).canManageSchedules = true;

      // Access sortedGroups to trigger the mapping
      const sorted = (comp as any).sortedGroups as WalkInRouteGroupDto[];

      // Original references must be unchanged
      expect((comp as any).routeGroups).toBe(originalGroups);
      expect(originalGroup.trips).toBe(originalTrips);

      // sortedGroups produces a new outer array
      expect(sorted).not.toBe(originalGroups);
    });

    it('returns a sorted copy — trips sorted by departureDateTime', () => {
      const comp = makeComponent();
      const tripLater = makeTrip({ scheduleId: 1, departureDateTime: '2026-07-01T10:00:00' });
      const tripEarlier = makeTrip({ scheduleId: 2, departureDateTime: '2026-07-01T08:00:00' });
      (comp as any).routeGroups = [makeGroup('r1', [tripLater, tripEarlier])];

      const sorted = (comp as any).sortedGroups as WalkInRouteGroupDto[];
      expect(sorted[0].trips[0].scheduleId).toBe(2); // earlier first
      expect(sorted[0].trips[1].scheduleId).toBe(1);
    });
  });

  describe('onAddSchedule', () => {
    it('emits addScheduleClicked and stops propagation', () => {
      const comp = makeComponent();
      let emitCount = 0;
      comp.addScheduleClicked.subscribe(() => { emitCount++; });

      const e = mockEvent() as any;
      (comp as any).onAddSchedule(e);

      expect(emitCount).toBe(1);
      expect(e.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('onAddForRoute', () => {
    it('emits the correct routeSlug and current selectedDate, and stops propagation', () => {
      const comp = makeComponent();
      const testDate = new Date('2026-07-15');
      (comp as any).selectedDate = testDate;

      const emitted: { routeSlug: string; date: Date }[] = [];
      comp.addScheduleForRouteClicked.subscribe((ev: { routeSlug: string; date: Date }) => emitted.push(ev));

      const e = mockEvent() as any;
      (comp as any).onAddForRoute(e, 'r1');

      expect(emitted.length).toBe(1);
      expect(emitted[0].routeSlug).toBe('r1');
      expect(emitted[0].date).toBe(testDate);
      expect(e.stopPropagation).toHaveBeenCalled();
    });
  });

  describe('openTripMenu', () => {
    it('stops propagation and populates two menu items', () => {
      const comp = makeComponent();
      (comp as any).tripActionMenu = { toggle: jasmine.createSpy('toggle') };

      const trip = makeTrip({ scheduleId: 5 });
      const e = mockEvent() as any;

      (comp as any).openTripMenu(e, trip, 'r1');

      expect(e.stopPropagation).toHaveBeenCalled();
      const items: any[] = (comp as any).tripActionMenuItems;
      expect(items.length).toBe(2);
    });

    it('calls tripActionMenu.toggle with the event', () => {
      const comp = makeComponent();
      const toggleSpy = jasmine.createSpy('toggle');
      (comp as any).tripActionMenu = { toggle: toggleSpy };

      const e = mockEvent() as any;
      (comp as any).openTripMenu(e, makeTrip(), 'r1');

      expect(toggleSpy).toHaveBeenCalledWith(e);
    });

    it('Edit item command emits editScheduleClicked with trip and routeSlug', () => {
      const comp = makeComponent();
      (comp as any).tripActionMenu = { toggle: jasmine.createSpy() };

      const trip = makeTrip({ scheduleId: 7 });
      const emitted: { trip: WalkInTripDto; routeSlug: string }[] = [];
      comp.editScheduleClicked.subscribe((ev: { trip: WalkInTripDto; routeSlug: string }) => emitted.push(ev));

      (comp as any).openTripMenu(mockEvent() as any, trip, 'route-abc');
      const items: any[] = (comp as any).tripActionMenuItems;
      items[0].command?.({});

      expect(emitted.length).toBe(1);
      expect(emitted[0].trip).toBe(trip);
      expect(emitted[0].routeSlug).toBe('route-abc');
    });

    it('Delete item command emits deleteScheduleClicked with trip and routeSlug', () => {
      const comp = makeComponent();
      (comp as any).tripActionMenu = { toggle: jasmine.createSpy() };

      const trip = makeTrip({ scheduleId: 8 });
      const emitted: { trip: WalkInTripDto; routeSlug: string }[] = [];
      comp.deleteScheduleClicked.subscribe((ev: { trip: WalkInTripDto; routeSlug: string }) => emitted.push(ev));

      (comp as any).openTripMenu(mockEvent() as any, trip, 'route-xyz');
      const items: any[] = (comp as any).tripActionMenuItems;
      items[1].command?.({});

      expect(emitted.length).toBe(1);
      expect(emitted[0].trip).toBe(trip);
      expect(emitted[0].routeSlug).toBe('route-xyz');
    });
  });

  describe('onTripMenuHide', () => {
    it('restores focus to the last trigger and clears it', () => {
      const comp = makeComponent();
      const btn = document.createElement('button');
      document.body.appendChild(btn);
      const focusSpy = spyOn(btn, 'focus');

      (comp as any).lastTripMenuTrigger = btn;
      (comp as any).onTripMenuHide();

      expect(focusSpy).toHaveBeenCalled();
      expect((comp as any).lastTripMenuTrigger).toBeNull();

      document.body.removeChild(btn);
    });
  });

  describe('formatTime', () => {
    it('formats an ISO datetime to HH:mm', () => {
      const comp = makeComponent();
      expect((comp as any).formatTime('2026-07-01T08:30:00')).toBe('08:30');
    });
  });

  // Regression: AC-3 keyboard a11y — pressing Enter on the "..." button must NOT
  // also select the trip row.  The root cause was that Enter on a <button> fires
  // both a synthetic click (→ openTripMenu, which stops propagation on the click
  // event) AND a keydown event that was bubbling up to the row div's
  // (keydown.enter)="selectTrip(...)".  Fix: added
  // (keydown.enter)="$event.stopPropagation()" on the "..." button in the HTML.
  describe('keyboard a11y — Enter on trip-actions button (regression AC-3)', () => {
    it('openTripMenu does NOT emit tripSelected (menu open must not also select the row)', () => {
      const comp = makeComponent();
      (comp as any).tripActionMenu = { toggle: jasmine.createSpy('toggle') };

      const trip = makeTrip({ scheduleId: 5 });
      const tripSelectedEmitted: unknown[] = [];
      comp.tripSelected.subscribe((ev: unknown) => tripSelectedEmitted.push(ev));

      // Enter on a <button> fires a click → openTripMenu is called. That path
      // must NOT emit tripSelected (which would select the trip for selling).
      (comp as any).openTripMenu(mockEvent() as any, trip, 'r1');

      expect(tripSelectedEmitted.length).toBe(0);
    });

    it('openTripMenu stops propagation on the event so keydown cannot bubble to the row', () => {
      // Without stopPropagation on the click event inside openTripMenu the click
      // would bubble to the row's (click)="selectTrip(...)" — verify it is stopped.
      const comp = makeComponent();
      (comp as any).tripActionMenu = { toggle: jasmine.createSpy('toggle') };

      const e = mockEvent() as any;
      (comp as any).openTripMenu(e, makeTrip(), 'r1');

      expect(e.stopPropagation).toHaveBeenCalled();
    });

    it('selectTrip IS still emitted when the row itself handles keydown.enter', () => {
      // Guard against over-blocking: the row's own keydown.enter path must still work.
      const comp = makeComponent();
      const trip = makeTrip({ scheduleId: 99 });
      const emitted: unknown[] = [];
      comp.tripSelected.subscribe((ev: unknown) => emitted.push(ev));

      (comp as any).selectTrip(trip, 'r1');

      expect(emitted.length).toBe(1);
    });
  });

  // Regression: live SIT verification revealed the "..." menu did NOT open via the
  // keyboard. The earlier fix only wired (keydown.enter)="$event.stopPropagation()",
  // relying on the native button-click to open the menu — which did not hold, so
  // Enter became a no-op. The unit tests above call openTripMenu() directly, so they
  // never exercised the TEMPLATE BINDING where the bug lived. This DOM-level test
  // dispatches a real Enter keydown on the rendered "..." button and asserts the
  // binding invokes openTripMenu (i.e. the menu opens). Space is covered the same way.
  describe('keyboard a11y — Enter/Space on "..." button OPENS the menu (template binding)', () => {
    let fixture: ComponentFixture<WalkInTripBrowserComponent>;
    let comp: WalkInTripBrowserComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        declarations: [WalkInTripBrowserComponent],
        imports: [CommonModule, TranslateModule.forRoot()],
        providers: [TranslateService],
        schemas: [NO_ERRORS_SCHEMA],
      }).compileComponents();

      fixture = TestBed.createComponent(WalkInTripBrowserComponent);
      comp = fixture.componentInstance;
      (comp as any).isLoading = false;
      (comp as any).canManageSchedules = true;
      (comp as any).routeGroups = [makeGroup('r1', [makeTrip({ scheduleId: 7 })])];
      // ViewChild p-menu is an unknown element under NO_ERRORS_SCHEMA; stub toggle.
      (comp as any).tripActionMenu = { toggle: jasmine.createSpy('toggle') };
      fixture.detectChanges();
      // Re-stub after view init in case the ViewChild resolved to undefined.
      (comp as any).tripActionMenu = { toggle: jasmine.createSpy('toggle') };
    });

    function dispatchKey(key: string): void {
      const btn = fixture.nativeElement.querySelector('.trip-actions-btn') as HTMLButtonElement;
      expect(btn).withContext('"..." button should render').toBeTruthy();
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      btn.dispatchEvent(ev);
      fixture.detectChanges();
      return;
    }

    // openTripMenu → tripActionMenu.toggle is covered by the direct unit test above;
    // here we only assert the TEMPLATE BINDING invokes openTripMenu (the part that
    // was broken — Enter previously only did stopPropagation and never opened it).
    it('Enter on the "..." button invokes openTripMenu (menu opens)', () => {
      const spy = spyOn(comp as any, 'openTripMenu').and.callThrough();
      dispatchKey('Enter');
      expect(spy).toHaveBeenCalled();
    });

    it('Space on the "..." button invokes openTripMenu (menu opens)', () => {
      const spy = spyOn(comp as any, 'openTripMenu').and.callThrough();
      dispatchKey(' ');
      expect(spy).toHaveBeenCalled();
    });

    it('Enter on the "..." button does NOT select the row for selling', () => {
      const selected: unknown[] = [];
      comp.tripSelected.subscribe((ev: unknown) => selected.push(ev));
      dispatchKey('Enter');
      expect(selected.length).toBe(0);
    });
  });
});
