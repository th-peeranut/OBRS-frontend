import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { PromotionsPageComponent } from './promotions-page.component';
import { AdminApiService, PromotionRespDto } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { AuthService } from '../../../../auth/auth.service';
import { PromotionsListStore } from './promotions-list.store';
import { createTranslateStub } from '../../../../testing/test-stubs';

const ROUND_TRIP: PromotionRespDto = {
  id: 1,
  slug: 'round_trip',
  code: 'RTRIP',
  discountType: 'fixed_amount',
  status: 'active',
  discountValue: 50,
  autoApply: true,
  usageLimit: 0,
  currentUsage: 12,
};

const SUMMER_SALE: PromotionRespDto = {
  id: 2,
  slug: 'summer-sale',
  code: 'SUMMER10',
  discountType: 'percentage',
  status: 'active',
  discountValue: 10,
  maxDiscountAmount: 100,
  minBookingAmount: 500,
  startDateTime: '2026-01-01T00:00:00+07:00',
  autoApply: false,
  usageLimit: 100,
  currentUsage: 3,
  translations: [{ locale: 'en', label: 'Summer Sale', description: '10% off' }],
};

function makeStoreStub() {
  const data$ = new BehaviorSubject<PromotionRespDto[] | null>(null);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    mutate: jasmine
      .createSpy('mutate')
      .and.callFake((transform: (current: PromotionRespDto[]) => PromotionRespDto[]) => {
        if (data$.value !== null) {
          data$.next(transform(data$.value));
        }
      }),
    get hasValue() {
      return data$.value !== null;
    },
  };
}

function makeComponent(adminApi: Record<string, unknown>, store = makeStoreStub(), roles: string[] = ['admin']) {
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
  };
  const component = new PromotionsPageComponent(
    adminApi as any,
    alert as any,
    createTranslateStub(),
    store as any,
    { getRoles: () => roles } as any
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, store, alert };
}

describe('PromotionsPageComponent', () => {
  it('subscribes to store.data$ and calls store.refresh() on init — no direct fetch', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();

    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('maps every promotion into a row and flags the round-trip slug as isRoundTrip', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();
    store.data$.next([ROUND_TRIP, SUMMER_SALE]);

    expect(component.rows.length).toBe(2);
    expect(component.rows[0].isRoundTrip).toBeTrue();
    expect(component.rows[1].isRoundTrip).toBeFalse();
    expect(component.rows[1].code).toBe('SUMMER10');
  });

  // OBRS-506: a null emission (clear(), e.g. on logout) must reset the
  // cached rows, not leave a previous session's rows on screen — same shape
  // as the already-fixed usability-reports-page.component.ts (OBRS-467).
  it('clears rows when the store emits null (OBRS-506)', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();
    store.data$.next([ROUND_TRIP, SUMMER_SALE]);
    expect(component.rows.length).toBe(2);

    store.data$.next(null);

    expect(component.rows)
      .withContext('a null emission must not leave the previous session\'s rows on screen')
      .toEqual([]);
  });

  // OBRS-251: the form/table/confirm markup and their FormGroup/API calls
  // moved into child components (PromotionFormModalComponent /
  // PromotionListTableComponent / PromotionDeactivateModalComponent) — the
  // page now only sets the modal-orchestration state those children are
  // bound to. Coverage for form validation/submit/edit-fetch lives in
  // promotion-form-modal.component.spec.ts.
  describe('modal orchestration', () => {
    it('openCreateModal() opens the form modal in create mode with no selection', () => {
      const { component } = makeComponent({});
      component.ngOnInit();

      component.openCreateModal();

      expect(component.mode).toBe('create');
      expect(component.selectedPromotion).toBeNull();
      expect(component.isFormModalOpen).toBeTrue();
    });

    it('openEditModal() opens the form modal in edit mode with the given row', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next([SUMMER_SALE]);

      component.openEditModal(component.rows[0]);

      expect(component.mode).toBe('edit');
      expect(component.selectedPromotion).toBe(component.rows[0]);
      expect(component.isFormModalOpen).toBeTrue();
    });

    it('onFormModalClosed() closes the form modal and clears the selection', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next([SUMMER_SALE]);
      component.openEditModal(component.rows[0]);

      component.onFormModalClosed();

      expect(component.isFormModalOpen).toBeFalse();
      expect(component.selectedPromotion).toBeNull();
    });

    it('reloadStructureBound() delegates to store.refresh()', () => {
      const { component, store } = makeComponent({});

      component.reloadStructureBound();

      expect(store.refresh).toHaveBeenCalled();
    });
  });

  describe('deactivate modal', () => {
    it('openDeactivateModal opens the confirm dialog for the given row', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next([SUMMER_SALE]);

      component.openDeactivateModal(component.rows[0]);

      expect(component.isDeactivateModalOpen).toBeTrue();
      expect(component.selectedPromotion).toBe(component.rows[0]);
    });

    it('closeDeactivateModal does not close while deactivating unless forced', () => {
      const { component, store } = makeComponent({});
      component.ngOnInit();
      store.data$.next([SUMMER_SALE]);
      component.openDeactivateModal(component.rows[0]);
      component.isDeactivating = true;

      component.closeDeactivateModal();
      expect(component.isDeactivateModalOpen).toBeTrue();

      component.closeDeactivateModal(true);
      expect(component.isDeactivateModalOpen).toBeFalse();
    });

    it('confirmDeactivate() calls DELETE and flips the row to inactive locally without removing it', async () => {
      const deleteSpy = jasmine
        .createSpy('deletePromotion')
        .and.returnValue(of({ code: 200, message: 'OK', data: null }));
      const { component, store, alert } = makeComponent({ deletePromotion: deleteSpy });
      component.ngOnInit();
      store.data$.next([SUMMER_SALE]);

      component.openDeactivateModal(component.rows[0]);
      await component.confirmDeactivate();

      expect(deleteSpy).toHaveBeenCalledWith(2);
      const updatedList = store.data$.value as PromotionRespDto[];
      expect(updatedList.length).toBe(1);
      expect(updatedList[0].status).toBe('inactive');
      expect(alert.success).toHaveBeenCalled();
    });

    it('confirmDeactivate() shows an error alert and does not mutate the list on failure', async () => {
      const deleteSpy = jasmine.createSpy('deletePromotion').and.returnValue(throwError(() => new Error('boom')));
      const { component, store, alert } = makeComponent({ deletePromotion: deleteSpy });
      component.ngOnInit();
      store.data$.next([SUMMER_SALE]);

      component.openDeactivateModal(component.rows[0]);
      await component.confirmDeactivate();

      expect(alert.error).toHaveBeenCalled();
      const updatedList = store.data$.value as PromotionRespDto[];
      expect(updatedList[0].status).toBe('active');
    });
  });
});

// ── OBRS-251: child extraction — verify the page wires the right inputs to
// app-promotion-list-table / app-promotion-form-modal /
// app-promotion-deactivate-modal and delegates their outputs to the existing
// handlers. Uses NO_ERRORS_SCHEMA (established pattern in this codebase,
// e.g. routes-page.component.spec.ts) so the child selectors don't need to
// be declared.
describe('PromotionsPageComponent template wiring to child components', () => {
  let fixture: ComponentFixture<PromotionsPageComponent>;
  let component: PromotionsPageComponent;

  beforeEach(async () => {
    const store = makeStoreStub();
    const adminApi = { deletePromotion: jasmine.createSpy('deletePromotion') };
    const alert = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };

    await TestBed.configureTestingModule({
      declarations: [PromotionsPageComponent],
      imports: [CommonModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: PromotionsListStore, useValue: store },
        { provide: AdminApiService, useValue: adminApi },
        { provide: AlertService, useValue: alert },
        // OBRS-1495: PromotionsPageComponent reads the held role in its constructor.
        { provide: AuthService, useValue: { getRoles: () => ['admin'] } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PromotionsPageComponent);
    component = fixture.componentInstance;
  });

  it('app-promotion-list-table receives rows/isLoading/skeletonRows/hasError', () => {
    fixture.detectChanges(); // run ngOnInit first
    (component as any).rows = [{ id: 1, isRoundTrip: false }];
    (component as any).errorMessage = 'boom';
    fixture.detectChanges();

    const table = fixture.debugElement.query(By.css('app-promotion-list-table'));
    expect(table.properties['rows']).toBe((component as any).rows);
    expect(table.properties['skeletonRows']).toBe((component as any).skeletonRows);
    expect(table.properties['hasError']).toBeTrue();
  });

  it('app-promotion-form-modal receives isOpen/mode/selectedPromotion/option lists/reloadStructure', () => {
    fixture.detectChanges();
    (component as any).openEditModal({ id: 2, code: 'SUMMER10' });
    fixture.detectChanges();

    const modal = fixture.debugElement.query(By.css('app-promotion-form-modal'));
    expect(modal.properties['isOpen']).toBeTrue();
    expect(modal.properties['mode']).toBe('edit');
    expect(modal.properties['selectedPromotion']).toEqual({ id: 2, code: 'SUMMER10' });
    expect(modal.properties['reloadStructure']).toBe((component as any).reloadStructureBound);
  });

  it('delegates (edit)/(deactivate) from the list table to openEditModal/openDeactivateModal', () => {
    fixture.detectChanges();
    spyOn(component as any, 'openEditModal');
    spyOn(component as any, 'openDeactivateModal');

    const table = fixture.debugElement.query(By.css('app-promotion-list-table'));
    const row = { id: 2, code: 'SUMMER10' };
    table.triggerEventHandler('edit', row);
    table.triggerEventHandler('deactivate', row);

    expect((component as any).openEditModal).toHaveBeenCalledWith(row);
    expect((component as any).openDeactivateModal).toHaveBeenCalledWith(row);
  });

  it('delegates (closed) from the form modal to onFormModalClosed', () => {
    fixture.detectChanges();
    spyOn(component as any, 'onFormModalClosed');

    const modal = fixture.debugElement.query(By.css('app-promotion-form-modal'));
    modal.triggerEventHandler('closed', undefined);

    expect((component as any).onFormModalClosed).toHaveBeenCalled();
  });

  it('delegates (confirm)/(cancel) from the deactivate modal to confirmDeactivate/closeDeactivateModal', () => {
    fixture.detectChanges();
    spyOn(component as any, 'confirmDeactivate');
    spyOn(component as any, 'closeDeactivateModal');

    const modal = fixture.debugElement.query(By.css('app-promotion-deactivate-modal'));
    modal.triggerEventHandler('confirm', undefined);
    modal.triggerEventHandler('cancel', undefined);

    expect((component as any).confirmDeactivate).toHaveBeenCalled();
    expect((component as any).closeDeactivateModal).toHaveBeenCalled();
  });
});


// OBRS-1495 AC-6: the role rule itself, in BOTH directions. The held-role test
// must stay `getRoles().includes('admin')` — `hasAnyRole(['admin'])` answers
// true for an owner through `AuthService.ROLE_GRANTS`, so the column would
// never hide for the one role it was meant to hide from (the OBRS-869 trap).
describe('PromotionsPageComponent slug column rule (OBRS-1495)', () => {
  const OWNER_ROLES = ['owner', 'salesperson', 'driver', 'customer'];

  it('shows the slug column when the held role is admin', () => {
    const { component } = makeComponent({}, makeStoreStub(), ['admin']);
    expect((component as any).showSlugColumn).toBeTrue();
  });

  it('hides the slug column from an owner', () => {
    const { component } = makeComponent({}, makeStoreStub(), OWNER_ROLES);
    expect((component as any).showSlugColumn).toBeFalse();
  });
});
