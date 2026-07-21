import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { InputNumberModule } from 'primeng/inputnumber';
import { AdminDropdownComponent } from '../../../admin/components/admin-dropdown/admin-dropdown.component';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { InspectionPageComponent } from './inspection-page.component';
import { createElementRefStub, createTranslateStub } from '../../../../testing/test-stubs';
import { StaffApiService, VehicleInspectionItemDto } from '../../../../services/staff/staff-api.service';
import { VehicleInspectionItemsStore } from './vehicle-inspection-items.store';
import { InspectableVehiclesStore } from './inspectable-vehicles.store';
import { MyInspectionsStore } from './my-inspections.store';
import { AlertService } from '../../../../shared/services/alert.service';

const ITEMS: VehicleInspectionItemDto[] = [
  { id: 1, code: 'tires', label: 'Tires', displayOrder: 1, active: true, category: 'TIRES', categoryOrder: 1 },
  { id: 2, code: 'brakes', label: 'Brakes', displayOrder: 2, active: true, category: 'DRIVING', categoryOrder: 2 },
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
    createElementRefStub(),
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

  // FE-T1 (OBRS-530, highest risk on this card): a filter()-per-category
  // groupRowsByCategory implementation would still pass the test above (each
  // group gets the right rows) while silently resetting flatIndex per group,
  // misaligning every verdict tap after the first group. This test exercises
  // the REAL wiring end to end: itemGroups is built from the SAME itemRows
  // array applyRowsToFormArray iterates, so a correct flatIndex must always
  // resolve to the FormGroup for that exact itemId.
  it('FE-T1: itemGroups partitions itemRows into per-category runs whose flatIndex always resolves to the matching FormGroup', () => {
    const { component } = makeComponent();
    component.ngOnInit();

    const groups = (component as any).itemGroups;
    expect(groups.length).toBe(2); // TIRES, then DRIVING (categoryOrder 1, 2)
    expect(groups[0].category).toBe('TIRES');
    expect(groups[1].category).toBe('DRIVING');

    const flattened = groups.flatMap((g: any) => g.rows);
    expect(flattened.map((r: any) => r.flatIndex)).toEqual([0, 1]);

    for (const entry of flattened) {
      const formGroupItemId = (component as any).itemRows[entry.flatIndex].itemId;
      expect(formGroupItemId).toBe(entry.row.itemId);
    }
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

  it('flipping BACK to needs_repair does not resurrect the cleared note (no stale resubmit)', () => {
    const { component } = makeComponent();
    component.ngOnInit();

    const group = (component as any).itemsFormArray.at(0);
    group.get('verdict').setValue('needs_repair');
    group.get('note').setValue('cracked windshield');
    group.get('verdict').setValue('ok');
    group.get('verdict').setValue('needs_repair'); // flip BACK

    expect(group.get('note').value).toBe('');
    expect(group.get('note').hasError('required')).toBeTrue();
  });

  it('a needs_repair row rebuilt by an items refresh keeps its mandatory-note validator', () => {
    const { component, itemsStore } = makeComponent();
    component.ngOnInit();
    (component as any).itemsFormArray.at(0).get('verdict').setValue('needs_repair');
    (component as any).itemsFormArray.at(0).get('note').setValue('cracked windshield');

    // INSPECTION_ITEM_INACTIVE recovery: the store re-emits and the FormArray
    // is rebuilt. The carried-forward needs_repair row must still validate.
    itemsStore.data$.next([
      { id: 1, code: 'tires', label: 'Tires', displayOrder: 1, active: true, category: 'TIRES', categoryOrder: 1 },
    ]);
    (component as any).itemsFormArray.at(0).get('note').setValue('');

    expect((component as any).itemsFormArray.at(0).get('note').hasError('required')).toBeTrue();
  });

  // OBRS-506: a null emission (clear(), e.g. on logout) must clear the
  // checklist and tear down the verdict FormArray, not leave a previous
  // session's items on screen — same shape as the already-fixed
  // usability-reports-page.component.ts (OBRS-467).
  it('clears the checklist and FormArray when the items store emits null (OBRS-506)', () => {
    const { component, itemsStore } = makeComponent();
    component.ngOnInit();
    expect((component as any).itemRows.length).toBe(2);
    expect((component as any).itemsFormArray.length).toBe(2);

    itemsStore.data$.next(null);

    expect((component as any).rawItems)
      .withContext('a null emission must not leave the previous session\'s checklist on screen')
      .toEqual([]);
    expect((component as any).itemRows).toEqual([]);
    expect((component as any).itemGroups).toEqual([]);
    expect((component as any).itemsFormArray.length).toBe(0);
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
      { id: 1, code: 'tires', label: 'Tires', displayOrder: 1, active: true, category: 'TIRES', categoryOrder: 1 },
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

// Real-template regression for the verdict toggle. QA/owner review found the
// original PrimeNG `p-selectButton` rendered UNSELECTED segments as solid
// white blocks in dark mode (PrimeNG's `.p-button` has no dark-aware
// background) — fixed by dropping raw PrimeNG entirely for two plain
// `.admin-btn`-based buttons (see the component/SCSS doc comments). A tap on
// the ALREADY-selected segment must still be a no-op (selectVerdict()'s
// same-value guard, replacing PrimeNG's old `[allowEmpty]="false"` job) —
// deselecting would fire the "switching away from needs_repair" branch that
// clears the note control's value, silently destroying a defect note the
// driver just typed. This needs a REAL click on a REAL rendered button — the
// direct-instantiation specs above only exercise the component's reaction to
// a value already sitting in the FormControl, not the click wiring itself.
describe('InspectionPageComponent — verdict toggle (real click, plain admin-btn)', () => {
  let fixture: ComponentFixture<InspectionPageComponent>;
  let component: InspectionPageComponent;
  let itemsStore: ReturnType<typeof makeCollectionStoreStub<VehicleInspectionItemDto[]>>;

  beforeEach(async () => {
    itemsStore = makeCollectionStoreStub<VehicleInspectionItemDto[]>(ITEMS);
    const vehiclesStore = makeCollectionStoreStub<{ id: number; label: string }[]>([
      { id: 9, label: 'Van 09' },
    ]);
    const myInspectionsStore = makeCollectionStoreStub<{ id: number; inspectedAt: string }[]>([]);
    const staffApiStub = {
      submitVehicleInspection: jasmine
        .createSpy('submitVehicleInspection')
        .and.returnValue(of({ code: 200, message: 'OK', data: { inspectionId: 1, defectCount: 0 } })),
    };
    const alertStub = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
      warning: jasmine.createSpy('warning').and.resolveTo(undefined),
      toast: jasmine.createSpy('toast'),
    };

    await TestBed.configureTestingModule({
      // AdminDropdownComponent (vehicleId) and InputNumberModule (odometerKm)
      // are the REAL components — a formControlName needs SOME
      // ControlValueAccessor on its host element (NG01203) even when that
      // control is irrelevant to this test.
      declarations: [InspectionPageComponent, AdminDropdownComponent],
      imports: [CommonModule, ReactiveFormsModule, InputNumberModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        FormBuilder,
        { provide: StaffApiService, useValue: staffApiStub },
        { provide: AlertService, useValue: alertStub },
        { provide: VehicleInspectionItemsStore, useValue: itemsStore },
        { provide: InspectableVehiclesStore, useValue: vehiclesStore },
        { provide: MyInspectionsStore, useValue: myInspectionsStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InspectionPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // runs ngOnInit — itemsStore's BehaviorSubject already holds ITEMS
  });

  function verdictButtons(rowIndex: number) {
    const rows = fixture.debugElement.queryAll(By.css('.inspection-row'));
    return rows[rowIndex].queryAll(By.css('.inspection-verdict-btn'));
  }

  it('renders two plain admin-btn segments per row — no PrimeNG p-selectButton', () => {
    expect(fixture.debugElement.queryAll(By.css('p-selectbutton')).length).toBe(0);
    const buttons = verdictButtons(0);
    expect(buttons.length).toBe(2);
    expect(buttons[0].nativeElement.classList.contains('admin-btn')).toBeTrue();
    expect(buttons[1].nativeElement.classList.contains('admin-btn')).toBeTrue();
  });

  it('clicking a segment selects it and applies the is-selected class', () => {
    const buttons = verdictButtons(0);
    buttons[1].nativeElement.click(); // needs_repair
    fixture.detectChanges();

    expect((component as any).verdictAt(0)).toBe('needs_repair');
    expect(buttons[1].nativeElement.classList.contains('is-selected')).toBeTrue();
    expect(buttons[0].nativeElement.classList.contains('is-selected')).toBeFalse();
  });

  it('a repeated tap on the already-selected needs_repair segment is a no-op — the note survives', () => {
    const rowIndex = 1; // second item row ("Brakes")
    const buttons = verdictButtons(rowIndex);
    expect(buttons.length).toBe(2);

    buttons[1].nativeElement.click(); // select "needs_repair"
    fixture.detectChanges();
    expect((component as any).verdictAt(rowIndex)).toBe('needs_repair');

    const noteControl = (component as any).itemsFormArray.at(rowIndex).get('note');
    noteControl.setValue('worn brake pad');
    fixture.detectChanges();

    // Re-click the SAME (already-selected) segment.
    buttons[1].nativeElement.click();
    fixture.detectChanges();

    expect((component as any).verdictAt(rowIndex))
      .withContext('a tap on the already-selected segment must not change the verdict')
      .toBe('needs_repair');
    expect(noteControl.value)
      .withContext('a mis-tap on the selected segment must never wipe the note')
      .toBe('worn brake pad');
  });

  it('switching needs_repair -> ok (a genuinely DIFFERENT segment) still legitimately clears the note', () => {
    const rowIndex = 1;
    const buttons = verdictButtons(rowIndex);

    buttons[1].nativeElement.click(); // needs_repair
    fixture.detectChanges();
    const noteControl = (component as any).itemsFormArray.at(rowIndex).get('note');
    noteControl.setValue('worn brake pad');
    fixture.detectChanges();

    buttons[0].nativeElement.click(); // ok — a real transition, not a re-tap
    fixture.detectChanges();

    expect((component as any).verdictAt(rowIndex)).toBe('ok');
    expect(noteControl.value).toBe('');
  });
});

// Real-template regression for the sticky top-strip / shell-topbar stacking
// fix (QA/owner review, phone-375 keyboard-open screenshot): the shared
// staff-shell topbar is ALSO `position: sticky; top: 0` with a higher
// z-index, so without an offset this strip renders exactly underneath it,
// invisible. `measureTopOffset()` reads the topbar's live height and binds it
// as this strip's `top` — this needs a REAL `.admin-topbar` element in the
// DOM (unlike the direct-instantiation specs above) to prove the measurement
// actually reaches across the component boundary.
describe('InspectionPageComponent — sticky top-strip offset (real DOM measurement)', () => {
  let fixture: ComponentFixture<InspectionPageComponent>;

  beforeEach(async () => {
    const itemsStore = makeCollectionStoreStub<VehicleInspectionItemDto[]>(ITEMS);
    const vehiclesStore = makeCollectionStoreStub<{ id: number; label: string }[]>([]);
    const myInspectionsStore = makeCollectionStoreStub<{ id: number; inspectedAt: string }[]>([]);

    await TestBed.configureTestingModule({
      declarations: [InspectionPageComponent, AdminDropdownComponent],
      imports: [CommonModule, ReactiveFormsModule, InputNumberModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        FormBuilder,
        { provide: StaffApiService, useValue: {} },
        { provide: AlertService, useValue: {} },
        { provide: VehicleInspectionItemsStore, useValue: itemsStore },
        { provide: InspectableVehiclesStore, useValue: vehiclesStore },
        { provide: MyInspectionsStore, useValue: myInspectionsStore },
      ],
    }).compileComponents();

    // A stand-in for the shared shell's sticky topbar, appended to the
    // document so `document.querySelector('.admin-topbar')` (which reaches
    // OUTSIDE this component's own template on purpose — the real topbar is
    // a sibling in the shared shell, not an ancestor within this component)
    // finds something with a real, measurable height.
    const fakeTopbar = document.createElement('header');
    fakeTopbar.className = 'admin-topbar';
    fakeTopbar.style.height = '123px';
    document.body.appendChild(fakeTopbar);

    fixture = TestBed.createComponent(InspectionPageComponent);
    fixture.detectChanges(); // ngOnInit
    fixture.componentInstance.ngAfterViewInit();
    await new Promise((resolve) => setTimeout(resolve, 0)); // flush measureTopOffset()'s setTimeout(0)
    fixture.detectChanges();
  });

  afterEach(() => {
    document.querySelectorAll('.admin-topbar').forEach((el) => el.remove());
  });

  it('binds the top strip\'s `top` to the measured topbar height, not the CSS top:0 fallback', () => {
    const strip = fixture.debugElement.query(By.css('.inspection-top-strip'));
    expect((strip.nativeElement as HTMLElement).style.top).toBe('123px');
  });

  it('re-measures on window resize (debounced)', async () => {
    // 200px, comfortably above admin-theme.scss's real `.admin-topbar { min-height: 80px }`
    // (loaded globally even in this test run) — otherwise a smaller height
    // gets floor-clamped by that unrelated rule and this assertion would be
    // measuring the CSS floor, not the resize recompute.
    const fakeTopbar = document.querySelector('.admin-topbar') as HTMLElement;
    fakeTopbar.style.height = '200px';

    (fixture.componentInstance as any).onWindowResize();
    await new Promise((resolve) => setTimeout(resolve, 150)); // clears the 100ms debounce
    fixture.detectChanges();

    const strip = fixture.debugElement.query(By.css('.inspection-top-strip'));
    expect((strip.nativeElement as HTMLElement).style.top).toBe('200px');
  });
});
