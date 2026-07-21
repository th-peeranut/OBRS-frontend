import { FormBuilder } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject, throwError } from 'rxjs';
import { SchedulesPageComponent } from './schedules-page.component';
import {
  AdminScheduleDto,
  AdminScheduleSetDto,
} from '../../../../services/admin/admin-api.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { SchedulesData } from './schedules.store';

const SET_ROW = {
  kind: 'set' as const,
  id: 1,
  scheduleSetId: null,
  tripId: '#SET-1',
  dateRange: '20/06/2026 to 25/06/2026',
  startDate: '2026-06-20',
  endDate: '2026-06-25',
  departureTimes: '08:00, 09:00',
  routeSlug: 'a-b',
  route: 'A-B',
  vehicleTypeSlug: 'van',
  vehicleId: null,
  driverId: null,
  vehicle: 'Van',
  driver: '-',
  frequency: 'Daily',
  status: 'Scheduled',
  statusCode: 'scheduled',
  updatedAt: '-',
};

const TRIP_ROW = {
  ...SET_ROW,
  kind: 'schedule' as const,
  id: 2,
  scheduleSetId: 1,
  tripId: '#SCH-2',
  departureTimes: '08:00',
};

function makeStoreStub() {
  return {
    data$: new BehaviorSubject<unknown>(null),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return false;
    },
  };
}

/** Store stub that includes a working mutate spy (closes over data$). */
function makeStoreStubWithMutate() {
  const data$ = new BehaviorSubject<SchedulesData | null>(null);
  const store = {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    mutate: jasmine.createSpy('mutate').and.callFake(
      (transform: (current: SchedulesData) => SchedulesData) => {
        const current = data$.value;
        if (current !== null) {
          data$.next(transform(current));
        }
      }
    ),
    get hasValue() {
      return data$.value !== null;
    },
  };
  return store;
}

/** Flush all pending microtasks so async callbacks run before the next assertion. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeComponent(adminApi: Record<string, unknown>) {
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
  };
  return new SchedulesPageComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub(),
    makeStoreStub() as any
  );
}

describe('SchedulesPageComponent edit modals', () => {
  // Regression: the schedule-set modal must open immediately on Edit, not after
  // the detail fetch resolves — otherwise a slow SIT response leaves a blank wait.
  it('opens the schedule-set edit modal before the detail fetch resolves', () => {
    const getScheduleSetById$ = new Subject<ResponseAPI<AdminScheduleSetDto>>();
    const component = makeComponent({
      getScheduleSetById: jasmine
        .createSpy('getScheduleSetById')
        .and.returnValue(getScheduleSetById$.asObservable()),
    });

    void (component as any).openEditModal({ ...SET_ROW });

    expect((component as any).isFormModalOpen).toBeTrue();
    expect((component as any).isEditMode).toBeTrue();
    expect((component as any).isEditDetailLoading).toBeTrue();
    expect((component as any).scheduleForm.get('route').value).toBe('a-b');
  });

  it('patches schedule-set server detail without clobbering user input', async () => {
    const getScheduleSetById$ = new Subject<ResponseAPI<AdminScheduleSetDto>>();
    const component = makeComponent({
      getScheduleSetById: jasmine
        .createSpy('getScheduleSetById')
        .and.returnValue(getScheduleSetById$.asObservable()),
    });

    const promise = (component as any).openEditModal({ ...SET_ROW });

    const form = (component as any).scheduleForm;
    form.get('route').setValue('user-route');
    form.get('route').markAsDirty();

    getScheduleSetById$.next({
      code: 200,
      message: 'OK',
      data: {
        id: 1,
        startDate: '2026-07-01',
        endDate: '2026-07-10',
        departureTimes: ['10:00'],
        frequency: 'Weekly',
        status: 'scheduled',
        route: { id: 1, slug: 'server-route' },
        vehicleType: { id: 1, slug: 'bus' },
      },
    });
    getScheduleSetById$.complete();
    await promise;

    // Untouched field patched from server...
    expect(form.get('vehicleType').value).toBe('bus');
    // ...edited field preserved.
    expect(form.get('route').value).toBe('user-route');
    expect((component as any).isEditDetailLoading).toBeFalse();
  });

  // Regression: same optimistic-open contract for the per-trip schedule modal.
  it('opens the trip edit modal before the detail fetch resolves', () => {
    const getScheduleById$ = new Subject<ResponseAPI<AdminScheduleDto>>();
    const component = makeComponent({
      getScheduleById: jasmine
        .createSpy('getScheduleById')
        .and.returnValue(getScheduleById$.asObservable()),
    });

    void (component as any).openScheduleEditModal({ ...TRIP_ROW });

    expect((component as any).isScheduleFormModalOpen).toBeTrue();
    expect((component as any).isScheduleItemEditMode).toBeTrue();
    expect((component as any).isScheduleEditDetailLoading).toBeTrue();
    expect((component as any).scheduleItemForm.get('route').value).toBe('a-b');
  });

  // OBRS-508: the trip edit modal's cargoCapacityKg control seeds from the
  // row fallback immediately, then patches to the server detail's real value
  // once it lands — same optimistic-open + pristine-patch contract as every
  // other field on this form.
  it('seeds cargoCapacityKg empty from the row fallback, then patches the server value', async () => {
    const getScheduleById$ = new Subject<ResponseAPI<AdminScheduleDto>>();
    const component = makeComponent({
      getScheduleById: jasmine
        .createSpy('getScheduleById')
        .and.returnValue(getScheduleById$.asObservable()),
    });

    const promise = (component as any).openScheduleEditModal({ ...TRIP_ROW });
    expect((component as any).scheduleItemForm.get('cargoCapacityKg').value).toBe('');

    getScheduleById$.next({
      code: 200,
      message: 'OK',
      data: {
        id: 2,
        departureDateTime: '2026-06-20T08:00:00',
        status: 'scheduled',
        route: { id: 1, slug: 'a-b' },
        vehicleType: { id: 1, slug: 'van' },
        cargoCapacityKg: 250,
      },
    });
    getScheduleById$.complete();
    await promise;

    expect((component as any).scheduleItemForm.get('cargoCapacityKg').value).toBe('250');
  });
});

describe('SchedulesPageComponent confirmDelete — optimistic removal by kind branch', () => {
  // Regression for SIT issue #14: confirmDelete() must remove from the correct
  // collection (generatedSchedules vs scheduleSets) depending on selectedSchedule.kind.
  // A swapped-branch bug (filtering scheduleSets when kind==='schedule') must fail these tests.

  function makeDeleteComponent(apiSpyName: string) {
    const store = makeStoreStubWithMutate();
    const apiSpy = jasmine
      .createSpy(apiSpyName)
      .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null }));
    const adminApi: Record<string, unknown> = { [apiSpyName]: apiSpy };
    const alert = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
    };
    const component = new SchedulesPageComponent(
      adminApi as any,
      new FormBuilder(),
      alert as any,
      createTranslateStub(),
      store as any
    );
    return { component, store, alert, apiSpy };
  }

  function seedAndBind(
    component: SchedulesPageComponent,
    store: ReturnType<typeof makeStoreStubWithMutate>,
    seedData: SchedulesData
  ): void {
    // Manually drive the subscription that ngOnInit wires up.
    store.data$.subscribe((data) => {
      if (data) {
        (component as any).rawScheduleSets = data.scheduleSets;
        (component as any).rawGeneratedSchedules = data.generatedSchedules;
        (component as any).rawRoutes = data.routes;
        (component as any).rawVehicles = data.vehicles;
        (component as any).rawVehicleTypes = data.vehicleTypes;
        (component as any).rawUsers = data.users;
        (component as any).rawLookups = data.lookups;
        (component as any).applyLocalization();
      }
    });
    store.data$.next(seedData);
  }

  it(
    'kind=schedule: removes the deleted trip from tripRows and leaves scheduleSets intact (before refresh resolves)',
    async () => {
      const { component, store, alert } = makeDeleteComponent('deleteSchedule');

      const seedData: SchedulesData = {
        scheduleSets: [
          { id: 10, departureTimes: ['08:00'], status: 'scheduled' },
        ],
        generatedSchedules: [
          { id: 2, scheduleSetId: 10, departureDateTime: '2026-06-20T08:00:00', status: 'scheduled' },
          { id: 3, scheduleSetId: 10, departureDateTime: '2026-06-21T08:00:00', status: 'scheduled' },
        ],
        routes: [],
        vehicles: [],
        vehicleTypes: [],
        users: [],
        lookups: [],
      };
      seedAndBind(component, store, seedData);

      // Keep refresh pending so we can assert before reconcile.
      let resolveRefresh!: () => void;
      store.refresh.and.returnValue(new Promise<void>((r) => { resolveRefresh = r; }));
      alert.success.and.resolveTo(undefined);

      // Select the trip with id=2 (kind='schedule').
      (component as any).selectedSchedule = { ...TRIP_ROW, id: 2, kind: 'schedule' };
      (component as any).isDeleteModalOpen = true;

      const done = (component as any).confirmDelete();
      await flush();

      // Trip id=2 must be gone from the schedule (trip) rows.
      const tripRows: Array<{ id: number }> = (component as any).tripRows;
      expect(tripRows.every((r) => r.id !== 2))
        .withContext('deleted trip id=2 must be absent from tripRows')
        .toBeTrue();
      // Trip id=3 must still be present.
      expect(tripRows.some((r) => r.id === 3))
        .withContext('surviving trip id=3 must remain in tripRows')
        .toBeTrue();
      // Schedule-set id=10 must be untouched.
      const setRows: Array<{ id: number }> = (component as any).scheduleSetRows;
      expect(setRows.some((r) => r.id === 10))
        .withContext('schedule-set id=10 must not be removed by a schedule-kind delete')
        .toBeTrue();

      resolveRefresh();
      await done;
    }
  );

  it(
    'kind=set: removes the deleted schedule-set from scheduleSetRows and leaves generatedSchedules intact (before refresh resolves)',
    async () => {
      const { component, store, alert } = makeDeleteComponent('deleteScheduleSet');

      const seedData: SchedulesData = {
        scheduleSets: [
          { id: 1, departureTimes: ['08:00'], status: 'scheduled' },
          { id: 5, departureTimes: ['09:00'], status: 'scheduled' },
        ],
        generatedSchedules: [
          { id: 20, scheduleSetId: 1, departureDateTime: '2026-06-20T08:00:00', status: 'scheduled' },
        ],
        routes: [],
        vehicles: [],
        vehicleTypes: [],
        users: [],
        lookups: [],
      };
      seedAndBind(component, store, seedData);

      let resolveRefresh!: () => void;
      store.refresh.and.returnValue(new Promise<void>((r) => { resolveRefresh = r; }));
      alert.success.and.resolveTo(undefined);

      // Select the schedule-set with id=1 (kind='set').
      (component as any).selectedSchedule = { ...SET_ROW, id: 1, kind: 'set' };
      (component as any).isDeleteModalOpen = true;

      const done = (component as any).confirmDelete();
      await flush();

      // Schedule-set id=1 must be gone from setRows.
      const setRows: Array<{ id: number }> = (component as any).scheduleSetRows;
      expect(setRows.every((r) => r.id !== 1))
        .withContext('deleted schedule-set id=1 must be absent from scheduleSetRows')
        .toBeTrue();
      // Schedule-set id=5 must still be present.
      expect(setRows.some((r) => r.id === 5))
        .withContext('surviving schedule-set id=5 must remain in scheduleSetRows')
        .toBeTrue();
      // Generated schedule id=20 must be untouched.
      const tripRows: Array<{ id: number }> = (component as any).tripRows;
      expect(tripRows.some((r) => r.id === 20))
        .withContext('generated schedule id=20 must not be removed by a set-kind delete')
        .toBeTrue();

      resolveRefresh();
      await done;
    }
  );
});

// OBRS-283: smart delete/cancel branch driven by the row's `deletable` +
// `confirmedBookingCount` fields. Set rows (kind:'set') never carry these
// fields and must always keep the unconditional hard-delete path.
describe('SchedulesPageComponent confirmDelete — OBRS-283 smart cancel branch', () => {
  function makeCancelComponent(apiSpies: Record<string, unknown>) {
    const store = makeStoreStubWithMutate();
    const alert = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
    };
    const component = new SchedulesPageComponent(
      apiSpies as any,
      new FormBuilder(),
      alert as any,
      createTranslateStub(),
      store as any
    );
    return { component, store, alert };
  }

  it('deletable===false + confirmedBookingCount>0 resolves the "cancel-refund" dialog mode', () => {
    const { component } = makeCancelComponent({});
    (component as any).selectedSchedule = {
      ...TRIP_ROW,
      deletable: false,
      confirmedBookingCount: 4,
    };
    expect((component as any).deleteModalMode).toBe('cancel-refund');
  });

  it('deletable===false + confirmedBookingCount===0 resolves the "cancel-no-refund" dialog mode', () => {
    const { component } = makeCancelComponent({});
    (component as any).selectedSchedule = {
      ...TRIP_ROW,
      deletable: false,
      confirmedBookingCount: 0,
    };
    expect((component as any).deleteModalMode).toBe('cancel-no-refund');
  });

  it('deletable===true resolves "delete" (unchanged hard-delete path)', () => {
    const { component } = makeCancelComponent({});
    (component as any).selectedSchedule = { ...TRIP_ROW, deletable: true, confirmedBookingCount: 2 };
    expect((component as any).deleteModalMode).toBe('delete');
  });

  it('a cached row missing `deletable` (undefined) falls through to "delete" (strict === false)', () => {
    const { component } = makeCancelComponent({});
    (component as any).selectedSchedule = { ...TRIP_ROW, deletable: undefined };
    expect((component as any).deleteModalMode).toBe('delete');
  });

  it('a Schedule SET row (kind:"set") always resolves "delete" even if deletable/confirmedBookingCount were somehow present', () => {
    const { component } = makeCancelComponent({});
    (component as any).selectedSchedule = {
      ...SET_ROW,
      kind: 'set',
      deletable: false,
      confirmedBookingCount: 5,
    };
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
    const { component, store, alert } = makeCancelComponent({
      cancelSchedule: cancelSpy,
      deleteSchedule: deleteSpy,
    });

    (component as any).selectedSchedule = {
      ...TRIP_ROW,
      id: 2,
      kind: 'schedule',
      deletable: false,
      confirmedBookingCount: 5,
    };
    (component as any).isDeleteModalOpen = true;
    store.refresh.and.resolveTo(undefined);

    await (component as any).confirmDelete();

    expect(cancelSpy).toHaveBeenCalledWith(2);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(alert.success).toHaveBeenCalledWith('ADMIN.MESSAGES.SCHEDULE_CANCELLED');
    expect((component as any).isDeleteModalOpen).toBeFalse();
  });

  it('a Trip row with deletable===true still calls deleteSchedule() (unchanged)', async () => {
    const cancelSpy = jasmine.createSpy('cancelSchedule');
    const deleteSpy = jasmine
      .createSpy('deleteSchedule')
      .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null }));
    const { component, store, alert } = makeCancelComponent({
      cancelSchedule: cancelSpy,
      deleteSchedule: deleteSpy,
    });

    (component as any).selectedSchedule = {
      ...TRIP_ROW,
      id: 2,
      kind: 'schedule',
      deletable: true,
    };
    (component as any).isDeleteModalOpen = true;
    store.refresh.and.resolveTo(undefined);

    await (component as any).confirmDelete();

    expect(deleteSpy).toHaveBeenCalledWith(2);
    expect(cancelSpy).not.toHaveBeenCalled();
    expect(alert.success).toHaveBeenCalledWith('ADMIN.MESSAGES.DELETED');
  });
});

// design-system §3.1: a form select starts on its placeholder; the create modals must
// NOT pre-seed vehicleType with the first option (the Figure 2 "Van by default" bug).
// route still defaults (it's a sensible first-option default), proving the lock is
// scoped to vehicleType, not a blanket "no defaults".
describe('SchedulesPageComponent create modals — vehicleType starts blank (design-system §3.1)', () => {
  function makeReady() {
    const component = makeComponent({});
    (component as any).routeOptions = [{ code: 'bkk-cm', label: 'BKK-CM' }];
    (component as any).vehicleTypeOptions = [
      { code: 'bus', label: 'Bus' },
      { code: 'van', label: 'Van' },
    ];
    return component;
  }

  it('schedule-set create modal leaves vehicleType empty and still defaults route', () => {
    const component = makeReady();
    (component as any).openCreateModal();
    expect((component as any).scheduleForm.get('vehicleType')?.value).toBe('');
    expect((component as any).scheduleForm.get('route')?.value).toBe('bkk-cm');
  });

  it('per-trip create modal leaves vehicleType empty and still defaults route', () => {
    const component = makeReady();
    (component as any).openCreateScheduleModal();
    expect((component as any).scheduleItemForm.get('vehicleType')?.value).toBe('');
    expect((component as any).scheduleItemForm.get('route')?.value).toBe('bkk-cm');
  });
});

// OBRS-209 AC10: a schedule create/update rejected with errorCode
// VEHICLE_UNDER_MAINTENANCE surfaces as an inline field message under
// vehicleId, never a second AlertService.error() toast.
describe('SchedulesPageComponent submitSchedule — VEHICLE_UNDER_MAINTENANCE (OBRS-209 AC10)', () => {
  function makeSubmitReady(adminApi: Record<string, unknown>) {
    const alert = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
    };
    const component = new SchedulesPageComponent(
      adminApi as any,
      new FormBuilder(),
      alert as any,
      createTranslateStub(),
      makeStoreStub() as any
    );
    (component as any).routeOptions = [{ code: 'bkk-cm', label: 'BKK-CM' }];
    (component as any).vehicleTypeOptions = [{ code: 'van', label: 'Van' }];
    component['openCreateScheduleModal']();
    const form = (component as any).scheduleItemForm;
    form.patchValue({
      departureDate: new Date(2026, 6, 10),
      departureTime: new Date(2026, 6, 10, 8, 0),
      route: 'bkk-cm',
      vehicleType: 'van',
      vehicleId: '3',
    });
    return { component, alert };
  }

  it('sets the inline message and does NOT call AlertService.error (no double surface)', async () => {
    const adminApi = {
      createSchedule: jasmine.createSpy('createSchedule').and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errorCode: 'VEHICLE_UNDER_MAINTENANCE', message: 'ignored localized message' },
            })
        )
      ),
    };
    const { component, alert } = makeSubmitReady(adminApi);

    await component['submitSchedule']();

    expect((component as any).vehicleUnderMaintenanceMessage).toBe(
      'ADMIN.SCHEDULES.VEHICLE_UNDER_MAINTENANCE'
    );
    expect(alert.error).not.toHaveBeenCalled();
  });

  it('any other errorCode keeps the existing generic AlertService.error() fallback', async () => {
    const adminApi = {
      createSchedule: jasmine.createSpy('createSchedule').and.returnValue(
        throwError(
          () => new HttpErrorResponse({ status: 400, error: { errorCode: 'SOME_OTHER_ERROR' } })
        )
      ),
    };
    const { component, alert } = makeSubmitReady(adminApi);

    await component['submitSchedule']();

    expect((component as any).vehicleUnderMaintenanceMessage).toBe('');
    expect(alert.error).toHaveBeenCalled();
  });
});

// OBRS-508: per-trip cargo-capacity override on the same trip form exercised
// by the VEHICLE_UNDER_MAINTENANCE suite above.
describe('SchedulesPageComponent submitSchedule — cargoCapacityKg override (OBRS-508)', () => {
  function makeSubmitReady(adminApi: Record<string, unknown>) {
    const alert = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
    };
    const component = new SchedulesPageComponent(
      adminApi as any,
      new FormBuilder(),
      alert as any,
      createTranslateStub(),
      makeStoreStub() as any
    );
    (component as any).routeOptions = [{ code: 'bkk-cm', label: 'BKK-CM' }];
    (component as any).vehicleTypeOptions = [{ code: 'van', label: 'Van' }];
    component['openCreateScheduleModal']();
    const form = (component as any).scheduleItemForm;
    form.patchValue({
      departureDate: new Date(2026, 6, 10),
      departureTime: new Date(2026, 6, 10, 8, 0),
      route: 'bkk-cm',
      vehicleType: 'van',
    });
    return { component, alert, form };
  }

  it('rejects a malformed cargoCapacityKg without calling the API, and shows the inline error', async () => {
    const createSpy = jasmine.createSpy('createSchedule');
    const { component, form } = makeSubmitReady({ createSchedule: createSpy });
    form.get('cargoCapacityKg').setValue('abc');

    await component['submitSchedule']();

    expect(createSpy).not.toHaveBeenCalled();
    expect((component as any).cargoCapacityKgErrorCode).toBe('INVALID_NUMBER');
    expect((component as any).cargoCapacityKgErrorKey()).toBe(
      'ADMIN.VALIDATION.CARGO_CAPACITY_INVALID'
    );
  });

  it('sends the parsed cargoCapacityKg on create', async () => {
    const createSpy = jasmine
      .createSpy('createSchedule')
      .and.returnValue(new BehaviorSubject({ code: 201, message: 'OK', data: null }));
    const { component, form } = makeSubmitReady({ createSchedule: createSpy });
    form.get('cargoCapacityKg').setValue('300');

    await component['submitSchedule']();

    expect(createSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ cargoCapacityKg: 300 }));
  });

  it('sends cargoCapacityKg as null when the field is left empty (inherit from vehicle type)', async () => {
    const createSpy = jasmine
      .createSpy('createSchedule')
      .and.returnValue(new BehaviorSubject({ code: 201, message: 'OK', data: null }));
    const { component } = makeSubmitReady({ createSchedule: createSpy });

    await component['submitSchedule']();

    expect(createSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ cargoCapacityKg: null }));
  });

  // OBRS-508: same clear-on-change/clear-on-close contract as
  // vehicleUnderMaintenanceMessage above, applied to the new field.
  it('clears the cargoCapacityKg inline error when the field changes', () => {
    const { component, form } = makeSubmitReady({});
    (component as any).cargoCapacityKgErrorCode = 'INVALID_NUMBER';

    form.get('cargoCapacityKg')?.setValue('123');

    expect((component as any).cargoCapacityKgErrorCode).toBeNull();
  });

  it('clears the cargoCapacityKg inline error on modal close', () => {
    const { component } = makeSubmitReady({});
    (component as any).cargoCapacityKgErrorCode = 'INVALID_NUMBER';

    component['closeScheduleFormModal'](true);

    expect((component as any).cargoCapacityKgErrorCode).toBeNull();
  });
});

describe('SchedulesPageComponent submitSchedule — inline message clearing', () => {
  function makeSubmitReady(adminApi: Record<string, unknown>) {
    const alert = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
    };
    const component = new SchedulesPageComponent(
      adminApi as any,
      new FormBuilder(),
      alert as any,
      createTranslateStub(),
      makeStoreStub() as any
    );
    (component as any).routeOptions = [{ code: 'bkk-cm', label: 'BKK-CM' }];
    (component as any).vehicleTypeOptions = [{ code: 'van', label: 'Van' }];
    component['openCreateScheduleModal']();
    const form = (component as any).scheduleItemForm;
    form.patchValue({
      departureDate: new Date(2026, 6, 10),
      departureTime: new Date(2026, 6, 10, 8, 0),
      route: 'bkk-cm',
      vehicleType: 'van',
      vehicleId: '3',
    });
    return { component, alert };
  }

  it('clears the inline message when the vehicle selection changes', () => {
    const { component } = makeSubmitReady({});
    (component as any).vehicleUnderMaintenanceMessage = 'stale message';

    (component as any).scheduleItemForm.get('vehicleId')?.setValue('9');

    expect((component as any).vehicleUnderMaintenanceMessage).toBe('');
  });

  it('clears the inline message when the departure date changes', () => {
    const { component } = makeSubmitReady({});
    (component as any).vehicleUnderMaintenanceMessage = 'stale message';

    (component as any).scheduleItemForm.get('departureDate')?.setValue(new Date(2026, 6, 11));

    expect((component as any).vehicleUnderMaintenanceMessage).toBe('');
  });

  it('clears the inline message on modal close', () => {
    const { component } = makeSubmitReady({});
    (component as any).vehicleUnderMaintenanceMessage = 'stale message';

    component['closeScheduleFormModal'](true);

    expect((component as any).vehicleUnderMaintenanceMessage).toBe('');
  });
});

// OBRS-506: a null emission (clear(), e.g. on logout) must reset every raw
// array this subscription populates, not leave a previous session's rows on
// screen — same shape as the already-fixed usability-reports-page.component.ts
// (OBRS-467).
describe('SchedulesPageComponent null-handling (OBRS-506)', () => {
  it('clears schedules when the store emits null', () => {
    const store = makeStoreStubWithMutate();
    const alert = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
    };
    const component = new SchedulesPageComponent(
      {} as any,
      new FormBuilder(),
      alert as any,
      createTranslateStub(),
      store as any
    );
    component.ngOnInit();

    store.data$.next({
      scheduleSets: [{ id: 10, departureTimes: ['08:00'], status: 'scheduled' }],
      generatedSchedules: [],
      routes: [],
      vehicles: [],
      vehicleTypes: [],
      users: [],
      lookups: [],
    } as unknown as SchedulesData);
    expect((component as any).schedules.length).toBe(1);

    store.data$.next(null);

    expect((component as any).schedules)
      .withContext('a null emission must not leave the previous session\'s rows on screen')
      .toEqual([]);
  });
});
