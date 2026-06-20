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
