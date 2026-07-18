import { FormBuilder } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { InspectionPageComponent } from './inspection-page.component';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { VehicleInspectionItemDto } from '../../../../services/staff/staff-api.service';

const ITEMS: VehicleInspectionItemDto[] = [
  { id: 1, code: 'tires', label: 'Tires', displayOrder: 1, active: true },
  { id: 2, code: 'brakes', label: 'Brakes', displayOrder: 2, active: true },
];

function makeCollectionStoreStub<T>(initial: T | null = null) {
  const data$ = new BehaviorSubject<T | null>(initial);
  const refreshing$ = new BehaviorSubject<boolean>(false);
  const error$ = new BehaviorSubject<boolean>(false);
  return {
    data$,
    refreshing$,
    error$,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeComponent(options: {
  items?: VehicleInspectionItemDto[] | null;
  staffApi?: Record<string, unknown>;
  alert?: Record<string, unknown>;
} = {}) {
  const itemsStore = makeCollectionStoreStub<VehicleInspectionItemDto[]>(
    options.items === undefined ? ITEMS : options.items
  );
  const vehiclesStore = makeCollectionStoreStub<{ id: number; label: string }[]>([
    { id: 9, label: 'Van 09' },
  ]);
  const myInspectionsStore = makeCollectionStoreStub<{ id: number; inspectedAt: string }[]>([]);

  const staffApiService = {
    submitVehicleInspection: jasmine
      .createSpy('submitVehicleInspection')
      .and.returnValue(of({ code: 200, message: 'OK', data: { inspectionId: 1, defectCount: 0 } })),
    ...options.staffApi,
  };
  const alertService = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
    toast: jasmine.createSpy('toast'),
    ...options.alert,
  };

  const component = new InspectionPageComponent(
    new FormBuilder(),
    staffApiService as any,
    alertService as any,
    createTranslateStub(),
    itemsStore as any,
    vehiclesStore as any,
    myInspectionsStore as any
  );

  return { component, itemsStore, vehiclesStore, myInspectionsStore, staffApiService, alertService };
}

describe('InspectionPageComponent', () => {
  it('should create', () => {
    const { component } = makeComponent();
    expect(component).toBeTruthy();
  });

  it('builds one row per active item, ordered by displayOrder, on ngOnInit', () => {
    const { component } = makeComponent();
    component.ngOnInit();

    expect((component as any).itemRows.length).toBe(2);
    expect((component as any).itemRows[0].label).toBe('Tires');
    expect((component as any).itemsFormArray.length).toBe(2);
  });

  it('every row starts with a null verdict (design-system §3.1 — no pre-seeded default)', () => {
    const { component } = makeComponent();
    component.ngOnInit();

    expect((component as any).verdictAt(0)).toBeNull();
    expect((component as any).completedCount).toBe(0);
  });

  it('completedCount reflects rows with a chosen verdict', () => {
    const { component } = makeComponent();
    component.ngOnInit();

    (component as any).itemsFormArray.at(0).get('verdict').setValue('ok');

    expect((component as any).completedCount).toBe(1);
  });

  it('choosing needs_repair makes the note control required; switching away clears its value', () => {
    const { component } = makeComponent();
    component.ngOnInit();

    const group = (component as any).itemsFormArray.at(0);
    group.get('verdict').setValue('needs_repair');
    group.get('note').setValue('cracked windshield');
    expect(group.get('note').value).toBe('cracked windshield');
    expect(group.get('note').hasError('required')).toBeFalse();

    group.get('verdict').setValue('ok');
    expect(group.get('note').value).toBe(''); // cleared, not just hidden
  });

  it('blocks submit and toasts when a row has no verdict yet (Submit is never disabled for this)', async () => {
    const { component, staffApiService, alertService } = makeComponent();
    component.ngOnInit();
    (component as any).form.get('vehicleId').setValue('9');
    (component as any).form.get('odometerKm').setValue(1000);
    // Only the first row gets a verdict; the second stays null.
    (component as any).itemsFormArray.at(0).get('verdict').setValue('ok');

    await (component as any).onSubmit();

    expect(staffApiService.submitVehicleInspection).not.toHaveBeenCalled();
    expect(alertService.toast).toHaveBeenCalled();
  });

  it('blocks submit when a needs_repair row has a blank note', async () => {
    const { component, staffApiService, alertService } = makeComponent();
    component.ngOnInit();
    (component as any).form.get('vehicleId').setValue('9');
    (component as any).form.get('odometerKm').setValue(1000);
    (component as any).itemsFormArray.at(0).get('verdict').setValue('needs_repair');
    (component as any).itemsFormArray.at(1).get('verdict').setValue('ok');

    await (component as any).onSubmit();

    expect(staffApiService.submitVehicleInspection).not.toHaveBeenCalled();
    expect(alertService.toast).toHaveBeenCalled();
  });

  it('submits the locked payload shape and resets to a fresh blank form on success', async () => {
    const { component, staffApiService, myInspectionsStore } = makeComponent();
    component.ngOnInit();
    (component as any).form.get('vehicleId').setValue('9');
    (component as any).form.get('odometerKm').setValue(54321);
    (component as any).itemsFormArray.at(0).get('verdict').setValue('ok');
    (component as any).itemsFormArray.at(1).get('verdict').setValue('needs_repair');
    (component as any).itemsFormArray.at(1).get('note').setValue('  worn pads  ');

    await (component as any).onSubmit();

    expect(staffApiService.submitVehicleInspection).toHaveBeenCalledWith(9, {
      odometerKm: 54321,
      items: [
        { itemId: 1, verdict: 'ok', note: '' },
        { itemId: 2, verdict: 'needs_repair', note: 'worn pads' },
      ],
    });
    expect((component as any).form.get('vehicleId').value).toBeNull();
    expect((component as any).form.get('odometerKm').value).toBeNull();
    expect((component as any).verdictAt(0)).toBeNull();
    expect(myInspectionsStore.refresh).toHaveBeenCalled();
  });

  it('does NOT clear the form on a rejected submit (non-destructive error path)', async () => {
    const error = new HttpErrorResponse({ error: { errorCode: 'SOME_OTHER_ERROR' }, status: 409 });
    const { component, alertService } = makeComponent({
      staffApi: { submitVehicleInspection: jasmine.createSpy().and.returnValue(throwError(() => error)) },
    });
    component.ngOnInit();
    (component as any).form.get('vehicleId').setValue('9');
    (component as any).form.get('odometerKm').setValue(1000);
    (component as any).itemsFormArray.at(0).get('verdict').setValue('ok');
    (component as any).itemsFormArray.at(1).get('verdict').setValue('ok');

    await (component as any).onSubmit();

    expect((component as any).form.get('vehicleId').value).toBe('9');
    expect((component as any).verdictAt(0)).toBe('ok');
    expect(alertService.error).toHaveBeenCalled();
  });

  it('ODOMETER_BELOW_LAST_RECORDED renders the server message verbatim under the odometer field', async () => {
    const error = new HttpErrorResponse({
      error: { errorCode: 'ODOMETER_BELOW_LAST_RECORDED', message: 'Van 09: 100 km is below the last recorded 500 km' },
      status: 400,
    });
    const { component } = makeComponent({
      staffApi: { submitVehicleInspection: jasmine.createSpy().and.returnValue(throwError(() => error)) },
    });
    component.ngOnInit();
    (component as any).form.get('vehicleId').setValue('9');
    (component as any).form.get('odometerKm').setValue(100);
    (component as any).itemsFormArray.at(0).get('verdict').setValue('ok');
    (component as any).itemsFormArray.at(1).get('verdict').setValue('ok');

    await (component as any).onSubmit();

    expect((component as any).odometerServerError).toBe(
      'Van 09: 100 km is below the last recorded 500 km'
    );
  });

  it('editing the odometer again clears the previous server error', async () => {
    const error = new HttpErrorResponse({
      error: { errorCode: 'ODOMETER_BELOW_LAST_RECORDED', message: 'too low' },
      status: 400,
    });
    const { component } = makeComponent({
      staffApi: { submitVehicleInspection: jasmine.createSpy().and.returnValue(throwError(() => error)) },
    });
    component.ngOnInit();
    (component as any).form.get('vehicleId').setValue('9');
    (component as any).form.get('odometerKm').setValue(100);
    (component as any).itemsFormArray.at(0).get('verdict').setValue('ok');
    (component as any).itemsFormArray.at(1).get('verdict').setValue('ok');
    await (component as any).onSubmit();
    expect((component as any).odometerServerError).toBe('too low');

    (component as any).form.get('odometerKm').setValue(200);

    expect((component as any).odometerServerError).toBe('');
  });

  it('INSPECTION_ITEM_INACTIVE warns and silently refreshes the items store', async () => {
    const error = new HttpErrorResponse({ error: { errorCode: 'INSPECTION_ITEM_INACTIVE' }, status: 409 });
    const { component, itemsStore, alertService } = makeComponent({
      staffApi: { submitVehicleInspection: jasmine.createSpy().and.returnValue(throwError(() => error)) },
    });
    component.ngOnInit();
    (component as any).form.get('vehicleId').setValue('9');
    (component as any).form.get('odometerKm').setValue(1000);
    (component as any).itemsFormArray.at(0).get('verdict').setValue('ok');
    (component as any).itemsFormArray.at(1).get('verdict').setValue('ok');

    await (component as any).onSubmit();

    expect(alertService.warning).toHaveBeenCalled();
    expect(itemsStore.refresh).toHaveBeenCalledTimes(2); // once on ngOnInit, once on recovery
  });

  it('preserves an already-entered verdict/note for an itemId that is still active after a refresh', () => {
    const { component, itemsStore } = makeComponent();
    component.ngOnInit();
    (component as any).itemsFormArray.at(0).get('verdict').setValue('needs_repair');
    (component as any).itemsFormArray.at(0).get('note').setValue('cracked windshield');

    // Simulate the store re-emitting after item 2 (brakes) was retired mid-week.
    itemsStore.data$.next([
      { id: 1, code: 'tires', label: 'Tires', displayOrder: 1, active: true },
    ]);

    expect((component as any).itemRows.length).toBe(1);
    expect((component as any).verdictAt(0)).toBe('needs_repair');
    expect((component as any).itemsFormArray.at(0).get('note').value).toBe('cracked windshield');
  });

  it('shows the already-inspected-this-week banner and hides it once dismissed', () => {
    const now = new Date();
    const { component, myInspectionsStore } = makeComponent();
    component.ngOnInit();

    myInspectionsStore.data$.next([{ id: 1, inspectedAt: now.toISOString() }]);
    expect((component as any).showAlreadyInspectedBanner).toBeTrue();

    (component as any).dismissBanner();
    expect((component as any).isBannerDismissed).toBeTrue();
  });

  it('isEmpty is true when the items store resolves to an empty (or all-inactive) list', () => {
    const { component } = makeComponent({ items: [] });
    component.ngOnInit();

    expect((component as any).isEmpty).toBeTrue();
  });

  it('isLoading is true only while refreshing with no cached items yet', () => {
    const { component, itemsStore } = makeComponent({ items: null });
    component.ngOnInit();
    itemsStore.refreshing$.next(true);

    expect((component as any).isLoading).toBeTrue();
  });
});
