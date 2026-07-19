import { FormBuilder } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { InspectionItemsPageComponent } from './inspection-items-page.component';
import { AdminApiService, AdminInspectionItemDto } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { AdminModalBackdropDirective } from '../../../../shared/directives/admin-modal-backdrop.directive';
import { InspectionItemsStore } from './inspection-items.store';
import { createTranslateStub } from '../../../../testing/test-stubs';

function item(overrides: Partial<AdminInspectionItemDto> = {}): AdminInspectionItemDto {
  return {
    id: 1,
    code: 'engine_oil',
    displayOrder: 1,
    active: true,
    translations: [
      { locale: 'en', label: 'Engine oil' },
      { locale: 'th', label: 'น้ำมันเครื่อง' },
      { locale: 'zh', label: '机油' },
    ],
    ...overrides,
  };
}

function ok<T>(data: T) {
  return { code: 200, message: 'OK', data };
}

function makeStoreStub() {
  const data$ = new BehaviorSubject<AdminInspectionItemDto[] | null>(null);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    mutate: jasmine
      .createSpy('mutate')
      .and.callFake((transform: (current: AdminInspectionItemDto[]) => AdminInspectionItemDto[]) => {
        if (data$.value !== null) {
          data$.next(transform(data$.value));
        }
      }),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeComponent(adminApi: Record<string, unknown> = {}, store = makeStoreStub()) {
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
    confirm: jasmine.createSpy('confirm').and.resolveTo(true),
  };
  const component = new InspectionItemsPageComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub(),
    store as any
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, store, alert };
}

describe('InspectionItemsPageComponent — store cycle', () => {
  it('subscribes to store.data$ and calls store.refresh() on init — no direct fetch', () => {
    const { component, store } = makeComponent();
    component.ngOnInit();
    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('maps the store data into sorted rows with all three locale labels resolved', () => {
    const { component, store } = makeComponent();
    component.ngOnInit();
    store.data$.next([item({ id: 2, displayOrder: 2, code: 'wheel_nuts' }), item({ id: 1, displayOrder: 1 })]);

    expect(component.rows.map((r: any) => r.id)).toEqual([1, 2]);
    expect(component.rows[0].labelEn).toBe('Engine oil');
    expect(component.rows[0].labelTh).toBe('น้ำมันเครื่อง');
    expect(component.rows[0].labelZh).toBe('机油');
  });
});

describe('InspectionItemsPageComponent — create/edit modal', () => {
  it('openCreateModal resets the form empty and re-enables the code field', () => {
    const { component } = makeComponent();
    component.openEditModal({ id: 1, code: 'x', displayOrder: 1, active: true, labelEn: 'a', labelTh: 'b', labelZh: 'c' });
    expect(component.itemForm.get('code').disabled).toBeTrue();

    component.openCreateModal();

    expect(component.itemForm.get('code').enabled).toBeTrue();
    expect(component.itemForm.get('code').value).toBe('');
    expect(component.translationsFormArray.length).toBe(3);
    expect(component.translationsFormArray.at(0).get('label').value).toBe('');
  });

  it('openEditModal disables the code field and pre-fills all three labels', () => {
    const { component } = makeComponent();
    const row = { id: 5, code: 'brake_fluid', displayOrder: 3, active: true, labelEn: 'Brake fluid', labelTh: 'TH', labelZh: 'ZH' };

    component.openEditModal(row);

    expect(component.itemForm.get('code').disabled).toBeTrue();
    expect(component.itemForm.get('code').value).toBe('brake_fluid');
    expect(component.translationsFormArray.at(0).get('label').value).toBe('Brake fluid');
    expect(component.translationsFormArray.at(1).get('label').value).toBe('TH');
    expect(component.translationsFormArray.at(2).get('label').value).toBe('ZH');
  });

  it('warns and skips the API when the form is invalid', async () => {
    const createInspectionItem = jasmine.createSpy('createInspectionItem');
    const { component, alert } = makeComponent({ createInspectionItem });
    component.openCreateModal();

    await component.submitItem();

    expect(alert.warning).toHaveBeenCalled();
    expect(createInspectionItem).not.toHaveBeenCalled();
  });

  it('create sends active:true by default and appends the response via store.mutate', async () => {
    const created = item({ id: 24, code: 'wheel_nuts', displayOrder: 24 });
    const createInspectionItem = jasmine.createSpy('createInspectionItem').and.returnValue(of(ok(created)));
    const { component, store, alert } = makeComponent({ createInspectionItem });
    component.ngOnInit();
    store.data$.next([item()]);
    component.openCreateModal();
    component.itemForm.get('code')?.setValue('wheel_nuts');
    component.translationsFormArray.at(0).get('label')?.setValue('Wheel nuts');
    component.translationsFormArray.at(1).get('label')?.setValue('น็อตล้อ');
    component.translationsFormArray.at(2).get('label')?.setValue('轮毂螺母');

    await component.submitItem();

    expect(createInspectionItem).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ code: 'wheel_nuts', active: true })
    );
    expect(store.mutate).toHaveBeenCalled();
    expect(component.rows.some((r: any) => r.id === 24)).toBeTrue();
    expect(alert.success).toHaveBeenCalledWith('ADMIN.MESSAGES.CREATED');
    expect(store.refresh).toHaveBeenCalledTimes(2); // initial load + trailing background refresh
    expect(component.isFormModalOpen).toBeFalse();
  });

  it('edit carries forward the row\'s current `active` value (an edit never silently un-retires)', async () => {
    const retiredRow = item({ id: 1, active: false });
    const updateInspectionItem = jasmine
      .createSpy('updateInspectionItem')
      .and.returnValue(of(ok({ ...retiredRow, translations: retiredRow.translations })));
    const { component, store } = makeComponent({ updateInspectionItem });
    component.ngOnInit();
    store.data$.next([retiredRow]);
    component.openEditModal(component.rows[0]);
    component.translationsFormArray.at(1).get('label')?.setValue('Updated TH label');

    await component.submitItem();

    expect(updateInspectionItem).toHaveBeenCalledOnceWith(
      1,
      jasmine.objectContaining({ active: false })
    );
  });

  it('edit re-reads `active` from the CURRENT rows, so a mid-modal retire is not silently undone', async () => {
    const updateInspectionItem = jasmine
      .createSpy('updateInspectionItem')
      .and.returnValue(of(ok(item({ active: false }))));
    const { component, store } = makeComponent({ updateInspectionItem });
    component.ngOnInit();
    store.data$.next([item({ id: 1, active: true })]);
    component.openEditModal(component.rows[0]); // snapshot says active: true

    // The row is retired elsewhere (another owner, or this page's own trailing
    // refresh()) WHILE the modal is open. `rows` updates; the snapshot does not.
    store.data$.next([item({ id: 1, active: false })]);
    component.translationsFormArray.at(1).get('label')?.setValue('Updated TH');

    await component.submitItem();

    // Without the re-read this sends `active: true` and un-retires the item.
    expect(updateInspectionItem).toHaveBeenCalledOnceWith(
      1,
      jasmine.objectContaining({ active: false })
    );
  });
});

describe('InspectionItemsPageComponent — retire/restore (AC#4)', () => {
  it('retiring an ACTIVE row is confirm-gated; declining the confirm sends no request', async () => {
    const updateInspectionItem = jasmine.createSpy('updateInspectionItem');
    const { component, store, alert } = makeComponent({ updateInspectionItem });
    alert.confirm.and.resolveTo(false);
    component.ngOnInit();
    store.data$.next([item({ active: true })]);

    await component.toggleActive(component.rows[0]);

    expect(alert.confirm).toHaveBeenCalled();
    expect(updateInspectionItem).not.toHaveBeenCalled();
  });

  it('confirming retirement sends active:false with the row\'s current code+translations', async () => {
    const updateInspectionItem = jasmine
      .createSpy('updateInspectionItem')
      .and.returnValue(of(ok(item({ active: false }))));
    const { component, store, alert } = makeComponent({ updateInspectionItem });
    alert.confirm.and.resolveTo(true);
    component.ngOnInit();
    store.data$.next([item({ active: true })]);

    await component.toggleActive(component.rows[0]);

    expect(updateInspectionItem).toHaveBeenCalledOnceWith(
      1,
      jasmine.objectContaining({ code: 'engine_oil', active: false })
    );
  });

  it('restoring a RETIRED row sends no confirm dialog', async () => {
    const updateInspectionItem = jasmine
      .createSpy('updateInspectionItem')
      .and.returnValue(of(ok(item({ active: true }))));
    const { component, store, alert } = makeComponent({ updateInspectionItem });
    component.ngOnInit();
    store.data$.next([item({ active: false })]);

    await component.toggleActive(component.rows[0]);

    expect(alert.confirm).not.toHaveBeenCalled();
    expect(updateInspectionItem).toHaveBeenCalledOnceWith(1, jasmine.objectContaining({ active: true }));
  });
});

describe('InspectionItemsPageComponent — reorder (§3.2.2)', () => {
  it('fires PUT /reorder IMMEDIATELY on a move click — no debounce, no button disabling', () => {
    const reorderInspectionItems = jasmine.createSpy('reorderInspectionItems').and.returnValue(new Subject());
    const { component, store } = makeComponent({ reorderInspectionItems });
    component.ngOnInit();
    store.data$.next([item({ id: 1, displayOrder: 1 }), item({ id: 2, displayOrder: 2 })]);

    component.moveDown(0);

    expect(reorderInspectionItems).toHaveBeenCalledTimes(1);
    expect(reorderInspectionItems).toHaveBeenCalledWith({
      items: [
        { id: 2, displayOrder: 1 },
        { id: 1, displayOrder: 2 },
      ],
    });
    expect(component.rows.map((r: any) => r.id)).toEqual([2, 1]); // applied locally, immediately
    expect(component.reorderPending).toBeTrue();
  });

  it('the winning success applies store.mutate + a trailing background refresh, and clears reorderPending', async () => {
    const response$ = new Subject<any>();
    const reorderInspectionItems = jasmine.createSpy('reorderInspectionItems').and.returnValue(response$);
    const { component, store } = makeComponent({ reorderInspectionItems });
    component.ngOnInit();
    store.data$.next([item({ id: 1, displayOrder: 1 }), item({ id: 2, displayOrder: 2 })]);

    component.moveDown(0);
    const serverOrder = [item({ id: 2, displayOrder: 1 }), item({ id: 1, displayOrder: 2 })];
    response$.next(ok(serverOrder));

    expect(component.reorderPending).toBeFalse();
    expect(store.mutate).toHaveBeenCalled();
    expect(store.refresh).toHaveBeenCalledTimes(2); // initial load + trailing background refresh
  });

  it('the winning error snaps back to server truth via refresh() and shows a mapped error alert', () => {
    const reorderInspectionItems = jasmine
      .createSpy('reorderInspectionItems')
      .and.returnValue(throwError(() => ({ error: { errorCode: 'INSPECTION_ITEM_REORDER_INVALID_SEQUENCE' } })));
    const { component, store, alert } = makeComponent({ reorderInspectionItems });
    component.ngOnInit();
    store.data$.next([item({ id: 1, displayOrder: 1 }), item({ id: 2, displayOrder: 2 })]);

    component.moveDown(0);

    expect(component.reorderPending).toBeFalse();
    expect(store.refresh).toHaveBeenCalledTimes(2); // initial load + reconcile-to-server-truth
    expect(alert.error).toHaveBeenCalled();
  });

  it('a superseded response (by issue order) is dropped — only the LATEST-issued click\'s response wins', () => {
    const firstResponse$ = new Subject<any>();
    const secondResponse$ = new Subject<any>();
    const reorderInspectionItems = jasmine
      .createSpy('reorderInspectionItems')
      .and.returnValues(firstResponse$, secondResponse$);
    const { component, store } = makeComponent({ reorderInspectionItems });
    component.ngOnInit();
    store.data$.next([item({ id: 1, displayOrder: 1 }), item({ id: 2, displayOrder: 2 }), item({ id: 3, displayOrder: 3 })]);

    component.moveDown(0); // seq 1 — [2,1,3]
    component.moveDown(0); // seq 2 — [1,2,3] (row now at index 0 is id=2)

    const mutateCallsBefore = store.mutate.calls.count();

    // Resolve the LATER-issued request (seq 2) first.
    const seq2Data = [item({ id: 9, displayOrder: 1 }), item({ id: 8, displayOrder: 2 }), item({ id: 7, displayOrder: 3 })];
    secondResponse$.next(ok(seq2Data));
    expect(store.mutate.calls.count()).toBe(mutateCallsBefore + 1);
    expect(component.rows.map((r: any) => r.id)).toEqual([9, 8, 7]);

    // The EARLIER-issued request (seq 1) resolving AFTER must be dropped unread.
    const seq1Data = [item({ id: 99, displayOrder: 1 })];
    firstResponse$.next(ok(seq1Data));

    expect(store.mutate.calls.count()).toBe(mutateCallsBefore + 1); // unchanged — seq 1 dropped
    expect(component.rows.map((r: any) => r.id)).toEqual([9, 8, 7]); // still seq 2's data
  });

  it('§3.2.2a: while a reorder is outstanding, an unrelated store.data$ emission must NOT replace rows', () => {
    const reorderInspectionItems = jasmine.createSpy('reorderInspectionItems').and.returnValue(new Subject());
    const { component, store } = makeComponent({ reorderInspectionItems });
    component.ngOnInit();
    store.data$.next([item({ id: 1, displayOrder: 1 }), item({ id: 2, displayOrder: 2 })]);

    component.moveDown(0); // reorderPending = true, local order = [2, 1]
    expect(component.reorderPending).toBeTrue();

    // Simulate the tail of an UNRELATED background refresh (e.g. another
    // create/edit save's trailing refresh()) landing mid-reorder.
    component['store'].data$.next([item({ id: 1, displayOrder: 1 }), item({ id: 2, displayOrder: 2 })]);

    // The stale pre-reorder order must NOT have clobbered the just-clicked
    // local order.
    expect(component.rows.map((r: any) => r.id)).toEqual([2, 1]);
  });
});

describe('InspectionItemsPageComponent — DOM-level (TestBed)', () => {
  let fixture: ComponentFixture<InspectionItemsPageComponent>;
  let store: ReturnType<typeof makeStoreStub>;
  let adminApi: {
    updateInspectionItem: jasmine.Spy;
    createInspectionItem: jasmine.Spy;
    reorderInspectionItems: jasmine.Spy;
  };

  const ROW = item();

  beforeEach(async () => {
    store = makeStoreStub();
    adminApi = {
      updateInspectionItem: jasmine
        .createSpy('updateInspectionItem')
        .and.returnValue(of(ok(ROW))),
      createInspectionItem: jasmine.createSpy('createInspectionItem'),
      reorderInspectionItems: jasmine.createSpy('reorderInspectionItems'),
    };
    const alert = {
      success: jasmine.createSpy('success').and.resolveTo(undefined),
      error: jasmine.createSpy('error').and.resolveTo(undefined),
      warning: jasmine.createSpy('warning').and.resolveTo(undefined),
      confirm: jasmine.createSpy('confirm').and.resolveTo(true),
    };

    await TestBed.configureTestingModule({
      declarations: [InspectionItemsPageComponent, AdminModalBackdropDirective],
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: InspectionItemsStore, useValue: store },
        { provide: AdminApiService, useValue: adminApi },
        { provide: AlertService, useValue: alert },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InspectionItemsPageComponent);
    fixture.detectChanges(); // ngOnInit
    store.data$.next([ROW]);
    fixture.detectChanges();
  });

  it('AC#4: renders exactly Edit + Retire (or Restore) per row — no delete control anywhere', () => {
    const actionButtons = fixture.nativeElement.querySelectorAll('td.text-right .admin-icon-btn');
    expect(actionButtons.length).toBe(2);

    const icons = Array.from(fixture.nativeElement.querySelectorAll('.material-symbols-outlined')).map(
      (el: any) => el.textContent.trim()
    );
    expect(icons).not.toContain('delete');
    // The lookup-settings delete-confirm modal's own class — must not exist here.
    expect(fixture.nativeElement.querySelector('.admin-modal-confirm')).toBeFalsy();
  });

  it('renders no <h2>/<h3> of its own — the shell topbar is the sole heading surface', () => {
    expect(fixture.nativeElement.querySelector('h2')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('h3')).toBeFalsy();
  });

  it('the label FormArray survives a background store emit mid-edit — BOTH edited fields reach the PUT payload', async () => {
    const editButton: HTMLButtonElement = fixture.nativeElement.querySelector('td.text-right .admin-icon-btn');
    editButton.click();
    fixture.detectChanges();

    const inputs: NodeListOf<HTMLInputElement> = fixture.nativeElement.querySelectorAll(
      '.admin-modal input.admin-field'
    );
    // inputs[0] = code (disabled), [1] = EN label, [2] = TH label, [3] = ZH label.
    const enInput = inputs[1];
    const thInput = inputs[2];

    enInput.value = 'Engine oil level';
    enInput.dispatchEvent(new Event('input'));
    thInput.value = 'ระดับน้ำมันเครื่อง';
    thInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // An UNRELATED background emission (e.g. another admin's edit landing via
    // a trailing refresh()) arrives WHILE this modal is still open.
    store.data$.next([
      item({
        translations: [
          { locale: 'en', label: 'SOMEONE ELSE EN' },
          { locale: 'th', label: 'SOMEONE ELSE TH' },
          { locale: 'zh', label: '机油' },
        ],
      }),
    ]);
    fixture.detectChanges();

    const saveButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.admin-modal-actions .admin-btn-primary'
    );
    saveButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(adminApi.updateInspectionItem).toHaveBeenCalledTimes(1);
    const payload = adminApi.updateInspectionItem.calls.argsFor(0)[1];
    const enTranslation = payload.translations.find((t: any) => t.locale === 'en');
    const thTranslation = payload.translations.find((t: any) => t.locale === 'th');
    expect(enTranslation.label).toBe('Engine oil level');
    expect(thTranslation.label).toBe('ระดับน้ำมันเครื่อง');
  });
});
