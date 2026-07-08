import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { PromotionsPageComponent } from './promotions-page.component';
import { PromotionRespDto } from '../../../../services/admin/admin-api.service';
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

function makeComponent(adminApi: Record<string, unknown>, store = makeStoreStub()) {
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
  };
  const component = new PromotionsPageComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub(),
    store as any
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

  it('openCreateModal() resets every select to empty — no pre-seeded default (design-system §3.1)', () => {
    const { component } = makeComponent({});
    component.ngOnInit();

    component.openCreateModal();

    expect(component.promotionForm.get('discountType')?.value).toBe('');
    expect(component.promotionForm.get('status')?.value).toBe('');
    expect(component.promotionForm.get('autoApply')?.value).toBe('');
    expect(component.isEditMode).toBeFalse();
  });

  it('openEditModal() opens optimistically from the row, then patches pristine controls from the detail fetch', async () => {
    const getByIdSpy = jasmine.createSpy('getPromotionById').and.returnValue(
      of({
        code: 200,
        message: 'OK',
        data: { ...SUMMER_SALE, discountValue: 15 },
      })
    );
    const { component, store } = makeComponent({ getPromotionById: getByIdSpy });
    component.ngOnInit();
    store.data$.next([SUMMER_SALE]);

    const promise = component.openEditModal(component.rows[0]);
    // Optimistic open: modal is already visible before the detail resolves.
    expect(component.isFormModalOpen).toBeTrue();
    expect(component.promotionForm.get('discountValue')?.value).toBe(10);

    await promise;

    expect(getByIdSpy).toHaveBeenCalledWith(2);
    expect(component.promotionForm.get('discountValue')?.value).toBe(15);
  });

  it('openEditModal() does not clobber a field the admin already started editing before the detail arrives', async () => {
    const getByIdSpy = jasmine.createSpy('getPromotionById').and.returnValue(
      of({ code: 200, message: 'OK', data: { ...SUMMER_SALE, discountValue: 15 } })
    );
    const { component, store } = makeComponent({ getPromotionById: getByIdSpy });
    component.ngOnInit();
    store.data$.next([SUMMER_SALE]);

    const promise = component.openEditModal(component.rows[0]);
    component.promotionForm.get('discountValue')?.markAsDirty();
    component.promotionForm.get('discountValue')?.setValue(999);

    await promise;

    expect(component.promotionForm.get('discountValue')?.value).toBe(999);
  });

  it('submitPromotion() creates via POST when not in edit mode, sending translations built from the form', async () => {
    const createSpy = jasmine
      .createSpy('createPromotion')
      .and.returnValue(of({ code: 201, message: 'Created', data: null }));
    const { component, store, alert } = makeComponent({ createPromotion: createSpy });
    component.ngOnInit();

    component.openCreateModal();
    component.promotionForm.patchValue({
      slug: 'winter-sale',
      code: 'WINTER10',
      discountType: 'percentage',
      discountValue: 10,
      startDateTime: new Date('2026-06-01'),
      status: 'active',
      autoApply: 'false',
      enLabel: 'Winter Sale',
    });

    await component.submitPromotion();

    expect(createSpy).toHaveBeenCalledTimes(1);
    const payload = createSpy.calls.mostRecent().args[0];
    expect(payload.slug).toBe('winter-sale');
    expect(payload.autoApply).toBeFalse();
    expect(payload.translations).toEqual([{ locale: 'en', label: 'Winter Sale', description: undefined }]);
    // Backend @NotNull on minBookingAmount/usageLimit: blank -> 0 (their
    // natural "no minimum"/"unlimited" value), never null.
    expect(payload.minBookingAmount).toBe(0);
    expect(payload.usageLimit).toBe(0);
    expect(alert.success).toHaveBeenCalled();
    expect(store.refresh).toHaveBeenCalled();
  });

  it('submitPromotion() warns and does not call the API when startDateTime is blank (backend @NotNull)', async () => {
    const createSpy = jasmine.createSpy('createPromotion');
    const { component, alert } = makeComponent({ createPromotion: createSpy });
    component.ngOnInit();

    component.openCreateModal();
    component.promotionForm.patchValue({
      slug: 'winter-sale',
      code: 'WINTER10',
      discountType: 'percentage',
      discountValue: 10,
      status: 'active',
      autoApply: 'false',
      enLabel: 'Winter Sale',
      // startDateTime deliberately left blank.
    });

    await component.submitPromotion();

    expect(createSpy).not.toHaveBeenCalled();
    expect(alert.warning).toHaveBeenCalled();
    expect(component.promotionForm.get('startDateTime')?.touched).toBeTrue();
  });

  it('submitPromotion() updates via PUT (full-replace) when in edit mode', async () => {
    const updateSpy = jasmine
      .createSpy('updatePromotion')
      .and.returnValue(of({ code: 200, message: 'OK', data: null }));
    const getByIdSpy = jasmine.createSpy('getPromotionById').and.returnValue(of({ code: 200, message: 'OK', data: SUMMER_SALE }));
    const { component, store } = makeComponent({ updatePromotion: updateSpy, getPromotionById: getByIdSpy });
    component.ngOnInit();
    store.data$.next([SUMMER_SALE]);

    await component.openEditModal(component.rows[0]);
    await component.submitPromotion();

    expect(updateSpy).toHaveBeenCalledWith(2, jasmine.any(Object));
  });

  it('submitPromotion() warns and does not call the API when the form is invalid', async () => {
    const createSpy = jasmine.createSpy('createPromotion');
    const { component, alert } = makeComponent({ createPromotion: createSpy });
    component.ngOnInit();
    component.openCreateModal();

    await component.submitPromotion();

    expect(createSpy).not.toHaveBeenCalled();
    expect(alert.warning).toHaveBeenCalled();
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
