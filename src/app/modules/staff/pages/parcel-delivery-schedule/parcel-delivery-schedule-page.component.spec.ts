import { BehaviorSubject } from 'rxjs';
import { ParcelDeliveryEntryPageComponent } from './parcel-delivery-schedule-page.component';
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

describe('ParcelDeliveryEntryPageComponent', () => {
  it('should create for a driver user', () => {
    const component = new ParcelDeliveryEntryPageComponent(
      createRouterStub(),
      createTranslateStub(),
      createAuthStub(['driver']),
      createDriverStoreStub(),
      createStaffStoreStub()
    );
    expect(component).toBeTruthy();
  });

  it('shows empty state when no schedules', () => {
    const component = new ParcelDeliveryEntryPageComponent(
      createRouterStub(),
      createTranslateStub(),
      createAuthStub(['driver']),
      createDriverStoreStub([]),
      createStaffStoreStub()
    );
    component.ngOnInit();
    expect((component as any).isEmpty).toBe(true);
  });

  it('navigates to the parcel deliveries list on viewDeliveries', () => {
    const router = createRouterStub();
    const navigateSpy = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    const component = new ParcelDeliveryEntryPageComponent(
      router,
      createTranslateStub(),
      createAuthStub(['driver']),
      createDriverStoreStub(),
      createStaffStoreStub()
    );
    (component as any).viewDeliveries({ id: 42, tripId: '#SCH-42', departure: '', route: '', vehicle: '', status: '', statusCode: '' });
    expect(navigateSpy).toHaveBeenCalledWith(['/staff/parcels/deliveries', 42]);
  });

  it('cleans up subscriptions on destroy', () => {
    const component = new ParcelDeliveryEntryPageComponent(
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
