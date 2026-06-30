import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
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
