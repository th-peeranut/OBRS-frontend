import { BehaviorSubject } from 'rxjs';
import { BoardingEntryPageComponent } from './boarding-entry-page.component';
import { createRouterStub, createTranslateStub } from '../../../../testing/test-stubs';

function createDriverStoreStub(data: unknown[] = []): any {
  return {
    data$: new BehaviorSubject<unknown[]>(data),
    refreshing$: new BehaviorSubject<boolean>(false),
    value: data,
    refresh: () => Promise.resolve(),
  };
}

function createStaffStoreStub(schedules: unknown[] = []): any {
  return {
    data$: new BehaviorSubject<{ schedules: unknown[] } | null>({ schedules }),
    refreshing$: new BehaviorSubject<boolean>(false),
    value: { schedules },
    refresh: () => Promise.resolve(),
  };
}

function createAuthStub(roles: string[]): any {
  const normalized = roles.map((r) => r.toLowerCase());
  return {
    // Mirror the real AuthService: admin is a role superset for hasAnyRole,
    // but getRoles() reports only the literal roles held.
    getRoles: () => normalized,
    hasAnyRole: (required: string[]) =>
      normalized.includes('admin') ||
      required.some((r) => normalized.includes(r.toLowerCase())),
  };
}

describe('BoardingEntryPageComponent', () => {
  it('should create for a driver user', () => {
    const component = new BoardingEntryPageComponent(
      createRouterStub(),
      createTranslateStub(),
      createAuthStub(['driver']),
      createDriverStoreStub(),
      createStaffStoreStub()
    );
    expect(component).toBeTruthy();
  });

  it('should create for a salesperson user', () => {
    const component = new BoardingEntryPageComponent(
      createRouterStub(),
      createTranslateStub(),
      createAuthStub(['salesperson']),
      createDriverStoreStub(),
      createStaffStoreStub()
    );
    expect(component).toBeTruthy();
  });

  it('uses the full staff schedule view (not the driver view) for an admin', () => {
    const driverStore = createDriverStoreStub();
    const staffStore = createStaffStoreStub();
    const driverRefresh = spyOn(driverStore, 'refresh').and.callThrough();
    const staffRefresh = spyOn(staffStore, 'refresh').and.callThrough();
    const component = new BoardingEntryPageComponent(
      createRouterStub(),
      createTranslateStub(),
      createAuthStub(['admin']),
      driverStore,
      staffStore
    );
    component.ngOnInit();
    expect(staffRefresh).toHaveBeenCalled();
    expect(driverRefresh).not.toHaveBeenCalled();
  });

  it('shows empty state when no schedules', () => {
    const component = new BoardingEntryPageComponent(
      createRouterStub(),
      createTranslateStub(),
      createAuthStub(['driver']),
      createDriverStoreStub([]),
      createStaffStoreStub()
    );
    component.ngOnInit();
    // isEmpty is protected — access via type cast for the test
    expect((component as any).isEmpty).toBe(true);
  });

  it('navigates to boarding list on viewBoarding', () => {
    const router = createRouterStub();
    const navigateSpy = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    const component = new BoardingEntryPageComponent(
      router,
      createTranslateStub(),
      createAuthStub(['driver']),
      createDriverStoreStub(),
      createStaffStoreStub()
    );
    // Access protected method for testing via type assertion
    (component as any).viewBoarding({ id: 42, tripId: '#SCH-42', departure: '', route: '', vehicle: '', status: '', statusCode: '' });
    expect(navigateSpy).toHaveBeenCalledWith(['/staff/boarding', 42]);
  });

  // OBRS-33: the list used to render every schedule the store held, in id
  // order, so the first row on prod was a trip 19 days in the past.
  describe('OBRS-33 one day at a time, soonest first', () => {
    const TRIPS = [
      { id: 1, departureDateTime: '2026-08-04T07:00:00+07:00', status: 'scheduled' },
      { id: 2, departureDateTime: '2026-08-23T18:00:00+07:00', status: 'scheduled' },
      { id: 3, departureDateTime: '2026-08-23T06:30:00+07:00', status: 'scheduled' },
    ];

    function componentWith(trips: unknown[]): any {
      const component = new BoardingEntryPageComponent(
        createRouterStub(),
        createTranslateStub(),
        createAuthStub(['driver']),
        createDriverStoreStub(trips),
        createStaffStoreStub()
      );
      component.ngOnInit();
      return component;
    }

    it('keeps only the selected day and puts the soonest departure on top', () => {
      const component = componentWith(TRIPS);
      component.onDateChange(new Date(2026, 7, 23));
      expect(component.filteredRows.map((r: { id: number }) => r.id)).toEqual([3, 2]);
    });

    it('a day with no trips is empty (the picker above it stays on screen)', () => {
      const component = componentWith(TRIPS);
      component.onDateChange(new Date(2026, 7, 22));
      expect(component.filteredRows.length).toBe(0);
      expect(component.isEmpty).toBe(true);
    });

    it('clearing the date shows every trip, still soonest first', () => {
      const component = componentWith(TRIPS);
      component.onDateChange(null);
      expect(component.filteredRows.map((r: { id: number }) => r.id)).toEqual([1, 3, 2]);
    });

    it('defaults to today', () => {
      const component = componentWith(TRIPS);
      const today = new Date();
      expect(component.selectedDate.toDateString()).toBe(today.toDateString());
    });
  });

  it('cleans up subscriptions on destroy', () => {
    const component = new BoardingEntryPageComponent(
      createRouterStub(),
      createTranslateStub(),
      createAuthStub(['driver']),
      createDriverStoreStub(),
      createStaffStoreStub()
    );
    component.ngOnInit();
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
