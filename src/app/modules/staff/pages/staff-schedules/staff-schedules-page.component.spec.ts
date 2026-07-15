import { FormBuilder } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { StaffSchedulesPageComponent } from './staff-schedules-page.component';
import { createRouterStub, createTranslateStub } from '../../../../testing/test-stubs';
import { ScheduleRow } from './staff-schedules-page.mappers';

// OBRS-283: smart delete/cancel branch driven by the row's `deletable` +
// `confirmedBookingCount` fields, mirroring the admin schedules page's
// SchedulesPageComponent coverage.

const ROW: ScheduleRow = {
  id: 2,
  tripId: '#SCH-2',
  departure: '2026-07-01T08:00:00',
  route: 'A-B',
  routeSlug: 'a-b',
  vehicle: 'Van',
  vehicleId: 1,
  vehicleTypeSlug: 'van',
  driver: 'John',
  driverId: 1,
  status: 'Scheduled',
  statusCode: 'scheduled',
  updatedAt: '-',
};

function makeAlertStub() {
  return {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
  };
}

/** Store stub with a working mutate spy (closes over data$), mirroring the
 * admin schedules page spec's makeStoreStubWithMutate(). */
function makeStoreStub() {
  const data$ = new BehaviorSubject<{ schedules: ScheduleRow[] } | null>(null);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    mutate: jasmine.createSpy('mutate').and.callFake(
      (transform: (current: { schedules: ScheduleRow[] }) => { schedules: ScheduleRow[] }) => {
        if (data$.value !== null) {
          data$.next(transform(data$.value));
        }
      }
    ),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeComponent(adminApi: Record<string, unknown>, alert = makeAlertStub()) {
  const store = makeStoreStub();
  const component = new StaffSchedulesPageComponent(
    createRouterStub(),
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub(),
    store as any
  );
  return { component, store, alert };
}

describe('StaffSchedulesPageComponent — OBRS-283 smart cancel branch', () => {
  it('deletable===false + confirmedBookingCount>0 resolves the "cancel-refund" dialog mode', () => {
    const { component } = makeComponent({});
    (component as any).selectedRow = { ...ROW, deletable: false, confirmedBookingCount: 4 };
    expect((component as any).deleteModalMode).toBe('cancel-refund');
  });

  it('deletable===false + confirmedBookingCount===0 resolves the "cancel-no-refund" dialog mode', () => {
    const { component } = makeComponent({});
    (component as any).selectedRow = { ...ROW, deletable: false, confirmedBookingCount: 0 };
    expect((component as any).deleteModalMode).toBe('cancel-no-refund');
  });

  it('a cached row missing `deletable` (undefined) falls through to "delete" (strict === false)', () => {
    const { component } = makeComponent({});
    (component as any).selectedRow = { ...ROW, deletable: undefined };
    expect((component as any).deleteModalMode).toBe('delete');
  });

  it('cancel-refund mode calls cancelSchedule() (not deleteSchedule()) and shows the success toast with the response affectedBookingCount', async () => {
    const cancelSpy = jasmine.createSpy('cancelSchedule').and.returnValue(
      new BehaviorSubject({
        code: 200,
        message: 'OK',
        data: { scheduleId: 2, status: 'cancelled', affectedBookingCount: 5 },
      })
    );
    const deleteSpy = jasmine.createSpy('deleteSchedule');
    const { component, store, alert } = makeComponent({
      cancelSchedule: cancelSpy,
      deleteSchedule: deleteSpy,
    });

    (component as any).selectedRow = { ...ROW, deletable: false, confirmedBookingCount: 5 };
    (component as any).isDeleteModalOpen = true;

    await (component as any).confirmDelete();

    expect(cancelSpy).toHaveBeenCalledWith(2);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(alert.success).toHaveBeenCalledWith('ADMIN.MESSAGES.SCHEDULE_CANCELLED');
    expect(store.mutate).not.toHaveBeenCalled();
    expect((component as any).isDeleteModalOpen).toBeFalse();
  });

  it('deletable===true still calls deleteSchedule() (unchanged) and optimistically removes the row', async () => {
    const cancelSpy = jasmine.createSpy('cancelSchedule');
    const deleteSpy = jasmine
      .createSpy('deleteSchedule')
      .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null }));
    const { component, store, alert } = makeComponent({
      cancelSchedule: cancelSpy,
      deleteSchedule: deleteSpy,
    });

    store.data$.next({ schedules: [ROW] });
    (component as any).selectedRow = { ...ROW, deletable: true };
    (component as any).isDeleteModalOpen = true;

    await (component as any).confirmDelete();

    expect(deleteSpy).toHaveBeenCalledWith(2);
    expect(cancelSpy).not.toHaveBeenCalled();
    expect(alert.success).toHaveBeenCalledWith('ADMIN.MESSAGES.DELETED');
    expect(store.mutate).toHaveBeenCalled();
  });
});
