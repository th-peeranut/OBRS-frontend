import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { BehaviorSubject, throwError } from 'rxjs';
import { StaffSchedulesPageComponent } from './staff-schedules-page.component';
import { createAuthServiceStub, createRouterStub, createTranslateStub } from '../../../../testing/test-stubs';
import { AuthService } from '../../../../auth/auth.service';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { StaffSchedulesStore } from './staff-schedules.store';
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

function makeComponent(
  adminApi: Record<string, unknown>,
  alert = makeAlertStub(),
  // OBRS-667: defaults to an owner stub so every pre-existing test here (none
  // of which exercise the permission gate) keeps testing what it was written
  // for; the negative case gets its own stub explicitly (see the DOM suite
  // below).
  authStub = createAuthServiceStub(false, true)
) {
  const store = makeStoreStub();
  const component = new StaffSchedulesPageComponent(
    createRouterStub(),
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub(),
    store as any,
    authStub as any
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

  // OBRS-506: a null emission (clear(), e.g. on logout) must reset the
  // cached rows, not leave a previous session's rows on screen — same shape
  // as the already-fixed usability-reports-page.component.ts (OBRS-467).
  it('clears rows when the store emits null (OBRS-506)', () => {
    const { component, store } = makeComponent({});
    component.ngOnInit();

    store.data$.next({
      schedules: [{ id: 2, status: 'scheduled' }],
      routes: [],
      vehicles: [],
      vehicleTypes: [],
      drivers: [],
      lookups: [],
    } as any);
    expect((component as any).rows.length).toBe(1);

    store.data$.next(null);

    expect((component as any).rows)
      .withContext('a null emission must not leave the previous session\'s rows on screen')
      .toEqual([]);
  });
});

// OBRS-1471: PUT /api/private/schedules/{id} is a full replace, so anything
// this form has no control for has to be sent back at its current value.
// Nothing here changes a single control — opening the modal and pressing
// confirm is by itself enough to null a seating cap, because seatingCapacity
// is in the backend's CHANGE_DETECTED_FIELDS.
describe('StaffSchedulesPageComponent — OBRS-1471 capacity carry-forward', () => {
  const DETAIL = {
    code: 200,
    message: 'OK',
    data: {
      id: 2,
      departureDateTime: '2026-07-01T08:00:00',
      route: { id: 1, slug: 'a-b' },
      vehicleType: { id: 1, slug: 'van' },
      vehicle: { id: 1, vehicleNumber: 'Van' },
      driver: { id: 1, fullName: 'John' },
      seatingCapacity: 20,
      cargoCapacityKg: 500,
    },
  };

  it('opening the edit modal and confirming without touching anything sends both capacities back unchanged', async () => {
    const updateSpy = jasmine
      .createSpy('updateSchedule')
      .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null }));
    const getSpy = jasmine
      .createSpy('getScheduleById')
      .and.returnValue(new BehaviorSubject(DETAIL));
    const { component } = makeComponent({ getScheduleById: getSpy, updateSchedule: updateSpy });
    component.ngOnInit();

    await (component as any).openEditModal(ROW);
    await (component as any).submitSchedule();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [id, payload] = updateSpy.calls.mostRecent().args;
    expect(id).toBe(2);
    expect(payload.seatingCapacity).toBe(20);
    expect(payload.cargoCapacityKg).toBe(500);
  });

  it('re-reads the capacities when the edit-open detail fetch failed, instead of PUTting nulls', async () => {
    const updateSpy = jasmine
      .createSpy('updateSchedule')
      .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null }));
    let call = 0;
    const getSpy = jasmine.createSpy('getScheduleById').and.callFake(() => {
      call += 1;
      return call === 1 ? throwError(() => new Error('boom')) : new BehaviorSubject(DETAIL);
    });
    const { component } = makeComponent({ getScheduleById: getSpy, updateSchedule: updateSpy });
    component.ngOnInit();

    await (component as any).openEditModal(ROW);
    expect((component as any).editCapacity).toBeNull();

    await (component as any).submitSchedule();

    expect(getSpy).toHaveBeenCalledTimes(2);
    const [, payload] = updateSpy.calls.mostRecent().args;
    expect(payload.seatingCapacity).toBe(20);
    expect(payload.cargoCapacityKg).toBe(500);
  });

  it('creating a schedule still goes through createSchedule() with no capacity keys invented', async () => {
    const createSpy = jasmine
      .createSpy('createSchedule')
      .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null }));
    const updateSpy = jasmine.createSpy('updateSchedule');
    const { component } = makeComponent({ createSchedule: createSpy, updateSchedule: updateSpy });
    component.ngOnInit();

    (component as any).openCreateModal();
    // openCreateModal() picks route from routeOptions, which this stub has none of.
    (component as any).scheduleItemForm.patchValue({ route: 'a-b', vehicleType: 'van' });

    await (component as any).submitSchedule();

    expect(updateSpy).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledTimes(1);
    const [payload] = createSpy.calls.mostRecent().args;
    expect('seatingCapacity' in payload).toBeFalse();
  });
});

// OBRS-667: backend now restricts POST .../cancel to hasRole('OWNER') (a
// whole-trip cancel one-click-refunds every confirmed booking on the
// schedule). This suite renders the REAL template via TestBed — the two
// tests above only assert `deleteModalMode`/`confirmDelete()` in isolation,
// which cannot prove the confirm BUTTON is actually absent from the DOM.
describe('StaffSchedulesPageComponent — OBRS-667 owner-only cancel gate (DOM)', () => {
  const CANCEL_ROW: ScheduleRow = { ...ROW, deletable: false, confirmedBookingCount: 5 };
  const HARD_DELETE_ROW: ScheduleRow = { ...ROW, deletable: true };

  function setupFixture(hasAnyRole: boolean): {
    fixture: ComponentFixture<StaffSchedulesPageComponent>;
    component: StaffSchedulesPageComponent;
    cancelSpy: jasmine.Spy;
    deleteSpy: jasmine.Spy;
  } {
    const cancelSpy = jasmine.createSpy('cancelSchedule').and.returnValue(
      new BehaviorSubject({
        code: 200,
        message: 'OK',
        data: { scheduleId: 2, status: 'cancelled', affectedBookingCount: 5 },
      })
    );
    const deleteSpy = jasmine
      .createSpy('deleteSchedule')
      .and.returnValue(new BehaviorSubject({ code: 200, message: 'OK', data: null }));

    TestBed.configureTestingModule({
      // OBRS-33: FormsModule + DatePickerModule for the header date filter
      // ([ngModel] on a real p-datePicker) — the same pair the analytics page
      // specs use; the real StaffModule gets both from SharedModule/StaffModule.
      imports: [CommonModule, FormsModule, ReactiveFormsModule, DatePickerModule, TranslateModule.forRoot()],
      declarations: [StaffSchedulesPageComponent],
      providers: [
        { provide: Router, useValue: createRouterStub() },
        {
          provide: AdminApiService,
          useValue: { cancelSchedule: cancelSpy, deleteSchedule: deleteSpy },
        },
        { provide: AlertService, useValue: makeAlertStub() },
        { provide: StaffSchedulesStore, useValue: makeStoreStub() },
        { provide: AuthService, useValue: createAuthServiceStub(false, hasAnyRole) },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    const fixture = TestBed.createComponent(StaffSchedulesPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges(); // ngOnInit

    return { fixture, component, cancelSpy, deleteSpy };
  }

  it('owner: the confirm button IS rendered in cancel-mode and clicking it calls cancelSchedule()', async () => {
    const { fixture, component, cancelSpy, deleteSpy } = setupFixture(true);
    (component as any).openDeleteModal(CANCEL_ROW);
    fixture.detectChanges();

    const confirmBtn: HTMLButtonElement | null =
      fixture.nativeElement.querySelector('.modal-footer .btn-danger');
    expect(confirmBtn).withContext('owner must see the cancel confirm button').not.toBeNull();
    expect(fixture.nativeElement.querySelector('.modal-footer .text-muted')).toBeNull();

    confirmBtn!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cancelSpy).toHaveBeenCalledWith(2);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('salesperson: the confirm button is ABSENT in cancel-mode, the permission line renders, and a forced call is a no-op', async () => {
    const { fixture, component, cancelSpy, deleteSpy } = setupFixture(false);
    (component as any).openDeleteModal(CANCEL_ROW);
    fixture.detectChanges();

    const confirmBtn = fixture.nativeElement.querySelector('.modal-footer .btn-danger');
    expect(confirmBtn).withContext('salesperson must NOT see the cancel confirm button').toBeNull();

    const permissionLine: HTMLElement | null =
      fixture.nativeElement.querySelector('.modal-footer .text-muted');
    expect(permissionLine).withContext('the permission line must render in its place').not.toBeNull();
    expect(permissionLine!.textContent).toContain('ADMIN.MESSAGES.CANCEL_TRIP_OWNER_ONLY');

    // Defence in depth: a DOM-forced click on the handler (no button to click) must no-op.
    await (component as any).confirmDelete();
    fixture.detectChanges();

    expect(cancelSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('salesperson, hard-delete row (deletable:true): the confirm button IS rendered and clicking it calls deleteSchedule() — the gate is scoped to cancel-mode only', async () => {
    const { fixture, component, cancelSpy, deleteSpy } = setupFixture(false);
    (component as any).openDeleteModal(HARD_DELETE_ROW);
    fixture.detectChanges();

    expect((component as any).deleteModalMode).toBe('delete');
    const confirmBtn: HTMLButtonElement | null =
      fixture.nativeElement.querySelector('.modal-footer .btn-danger');
    expect(confirmBtn)
      .withContext('hard-delete must remain available to counter staff regardless of the owner-only cancel gate')
      .not.toBeNull();

    confirmBtn!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(deleteSpy).toHaveBeenCalledWith(2);
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  // OBRS-1584, through the real p-datePicker rather than the handler: emptying
  // the field must not lift the day window, and a date typed key by key must
  // still land. Those two pull against each other — PrimeNG reports every
  // unparseable prefix as `null`, so a fix that reacts to `null` by writing a
  // new date back into the model would repaint the input mid-word and make
  // keyboard entry impossible.
  it('emptying the date input keeps the day window, and a typed date still filters', () => {
    const { fixture, component } = setupFixture(true);
    (component as any).rows = [
      { ...ROW, id: 1, tripId: '#SCH-1', departure: '2026-08-04T07:00:00+07:00' },
      { ...ROW, id: 2, tripId: '#SCH-2', departure: '2026-08-23T18:00:00+07:00' },
      { ...ROW, id: 3, tripId: '#SCH-3', departure: '2026-08-23T06:30:00+07:00' },
    ];
    (component as any).onDateChange(new Date(2026, 7, 23));
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('.p-datepicker input');
    expect(input).withContext('the header date input must render').not.toBeNull();
    expect(input.readOnly).withContext('keyboard date entry must stay available').toBe(false);

    typeInto(input, '');
    fixture.detectChanges();
    expect((component as any).filteredRows.map((r: ScheduleRow) => r.id))
      .withContext('an emptied field must not fall back to every trip')
      .toEqual([3, 2]);

    for (let i = 1; i <= '04/08/2026'.length; i++) typeInto(input, '04/08/2026'.slice(0, i));
    fixture.detectChanges();
    expect((component as any).filteredRows.map((r: ScheduleRow) => r.id))
      .withContext('the typed day must be the one filtered on')
      .toEqual([1]);
  });
});

// PrimeNG only reads the input when it saw a keydown first (its IE11 guard).
function typeInto(input: HTMLInputElement, value: string): void {
  input.dispatchEvent(new KeyboardEvent('keydown'));
  input.value = value;
  input.dispatchEvent(new Event('input'));
}


// OBRS-33: the list used to render every schedule the API returned, in id
// order, so the first row on prod was a trip 19 days in the past.
describe('StaffSchedulesPageComponent - OBRS-33 one day at a time, soonest first', () => {
  const TRIPS: ScheduleRow[] = [
    { ...ROW, id: 1, tripId: '#SCH-1', departure: '2026-08-04T07:00:00+07:00' },
    { ...ROW, id: 2, tripId: '#SCH-2', departure: '2026-08-23T18:00:00+07:00' },
    { ...ROW, id: 3, tripId: '#SCH-3', departure: '2026-08-23T06:30:00+07:00' },
  ];

  function componentWithTrips(): any {
    const { component } = makeComponent({});
    (component as any).rows = [...TRIPS];
    return component;
  }

  it('keeps only the selected day and puts the soonest departure on top', () => {
    const component = componentWithTrips();
    component.onDateChange(new Date(2026, 7, 23));
    expect(component.filteredRows.map((r: ScheduleRow) => r.id)).toEqual([3, 2]);
  });

  it('a day with no trips filters everything out', () => {
    const component = componentWithTrips();
    component.onDateChange(new Date(2026, 7, 22));
    expect(component.filteredRows.length).toBe(0);
  });

  // OBRS-1584: this spec used to assert the opposite — clearing the field
  // rendered every trip the API returned, which is the OBRS-33 symptom one
  // keystroke away. The day already in effect survives instead.
  it('clearing the date keeps the day already in effect, never every trip', () => {
    const component = componentWithTrips();
    component.onDateChange(new Date(2026, 7, 23));
    component.onDateChange(null);
    expect(component.filteredRows.map((r: ScheduleRow) => r.id)).toEqual([3, 2]);
  });

  it('the date filter composes with the existing route filter', () => {
    const component = componentWithTrips();
    component.rows = [...TRIPS, { ...ROW, id: 4, tripId: '#SCH-4', departure: '2026-08-23T09:00:00+07:00', routeSlug: 'c-d' }];
    component.onDateChange(new Date(2026, 7, 23));
    component.onRouteFilterChange('c-d');
    expect(component.filteredRows.map((r: ScheduleRow) => r.id)).toEqual([4]);
  });

  it('defaults to today', () => {
    const { component } = makeComponent({});
    expect((component as any).selectedDate.toDateString()).toBe(new Date().toDateString());
  });
});
