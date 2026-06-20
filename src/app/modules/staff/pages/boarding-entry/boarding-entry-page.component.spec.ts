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
  return {
    hasAnyRole: (required: string[]) => required.some((r) => roles.includes(r)),
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
