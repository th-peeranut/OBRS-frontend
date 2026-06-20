import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
import { SchedulesPageComponent } from './schedules-page.component';
import {
  AdminScheduleDto,
  AdminScheduleSetDto,
} from '../../../../services/admin/admin-api.service';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

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
