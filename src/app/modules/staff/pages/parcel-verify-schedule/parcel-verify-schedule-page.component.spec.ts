import { BehaviorSubject } from 'rxjs';
import { ParcelVerifyEntryPageComponent } from './parcel-verify-schedule-page.component';
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
    getRoles: () => normalized,
    hasAnyRole: (required: string[]) =>
      normalized.includes('admin') ||
      required.some((r) => normalized.includes(r.toLowerCase())),
  };
}

describe('ParcelVerifyEntryPageComponent', () => {
  it('should create for a driver user', () => {
    const component = new ParcelVerifyEntryPageComponent(
      createRouterStub(),
      createTranslateStub(),
      createAuthStub(['driver']),
      createDriverStoreStub(),
      createStaffStoreStub()
    );
    expect(component).toBeTruthy();
  });

  it('shows empty state when no schedules', () => {
    const component = new ParcelVerifyEntryPageComponent(
      createRouterStub(),
      createTranslateStub(),
      createAuthStub(['driver']),
      createDriverStoreStub([]),
      createStaffStoreStub()
    );
    component.ngOnInit();
    expect((component as any).isEmpty).toBe(true);
  });

  it('navigates to the parcel verify list on viewVerify', () => {
    const router = createRouterStub();
    const navigateSpy = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    const component = new ParcelVerifyEntryPageComponent(
      router,
      createTranslateStub(),
      createAuthStub(['driver']),
      createDriverStoreStub(),
      createStaffStoreStub()
    );
    (component as any).viewVerify({ id: 42, tripId: '#SCH-42', departure: '', route: '', vehicle: '', status: '', statusCode: '' });
    expect(navigateSpy).toHaveBeenCalledWith(['/staff/parcels/verify', 42]);
  });

  it('cleans up subscriptions on destroy', () => {
    const component = new ParcelVerifyEntryPageComponent(
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
