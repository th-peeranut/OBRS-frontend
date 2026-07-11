import { SimpleChange } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { PromotionFormModalComponent } from './promotion-form-modal.component';
import { PromotionRespDto } from '../../../../../services/admin/admin-api.service';
import { PromotionRow } from '../promotions-page.mappers';
import { ResponseAPI } from '../../../../../shared/interfaces/response.interface';
import { createTranslateStub } from '../../../../../testing/test-stubs';

const SUMMER_SALE_ROW: PromotionRow = {
  id: 2,
  slug: 'summer-sale',
  code: 'SUMMER10',
  discountTypeCode: 'percentage',
  discountTypeLabel: 'Percentage',
  discountValue: 10,
  maxDiscountAmount: 100,
  minBookingAmount: 500,
  startDateTime: '2026-01-01T00:00:00+07:00',
  endDateTime: null,
  usageLimit: 100,
  currentUsage: 3,
  statusCode: 'active',
  statusLabel: 'Active',
  autoApply: false,
  isRoundTrip: false,
  translations: [{ locale: 'en', label: 'Summer Sale', description: '10% off' }],
};

function detailResponse(overrides: Partial<PromotionRespDto> = {}): ResponseAPI<PromotionRespDto> {
  return {
    code: 200,
    message: 'OK',
    data: {
      id: 2,
      slug: 'summer-sale',
      code: 'SUMMER10',
      discountType: 'percentage',
      status: 'active',
      discountValue: 15,
      autoApply: false,
      usageLimit: 100,
      currentUsage: 3,
      startDateTime: '2026-01-01T00:00:00+07:00',
      translations: [
        { locale: 'en', label: 'Server EN', description: 'Server EN desc' },
        { locale: 'th', label: 'TH label', description: 'TH desc' },
      ],
      ...overrides,
    },
  };
}

function makeComponent(getPromotionById$: Subject<ResponseAPI<PromotionRespDto>>) {
  const adminApi = {
    getPromotionById: jasmine
      .createSpy('getPromotionById')
      .and.returnValue(getPromotionById$.asObservable()),
    createPromotion: jasmine
      .createSpy('createPromotion')
      .and.returnValue(of({ code: 201, message: 'Created', data: null })),
    updatePromotion: jasmine
      .createSpy('updatePromotion')
      .and.returnValue(of({ code: 200, message: 'OK', data: null })),
  };
  const alert = {
    success: jasmine.createSpy('success').and.resolveTo(undefined),
    error: jasmine.createSpy('error').and.resolveTo(undefined),
    warning: jasmine.createSpy('warning').and.resolveTo(undefined),
  };
  const component = new PromotionFormModalComponent(
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  component.discountTypeOptions = [
    { value: 'percentage', label: 'Percentage' },
    { value: 'fixed_amount', label: 'Fixed Amount' },
  ];
  component.statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];
  component.autoApplyOptions = [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
  ];
  component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
  return { component, adminApi, alert };
}

function openCreate(component: PromotionFormModalComponent): void {
  (component as any).isOpen = true;
  (component as any).mode = 'create';
  (component as any).selectedPromotion = null;
  component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
}

function openEdit(component: PromotionFormModalComponent, row: PromotionRow): void {
  (component as any).isOpen = true;
  (component as any).mode = 'edit';
  (component as any).selectedPromotion = row;
  component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
}

// initEditForm is the private async method ngOnChanges fires (without
// awaiting, like a template-driven callback would). Tests that need to await
// the detail fetch call it directly — same idiom as RouteFormModalComponent's
// spec awaiting the public, directly-returned `openEdit()` promise — after
// setting isOpen/selectedPromotion the same way ngOnChanges's caller would.
function openEditAwait(component: PromotionFormModalComponent, row: PromotionRow): Promise<void> {
  (component as any).isOpen = true;
  (component as any).mode = 'edit';
  (component as any).selectedPromotion = row;
  return (component as any).initEditForm(row);
}

function fillValidForm(component: PromotionFormModalComponent): void {
  const form = (component as any).promotionForm;
  form.patchValue({
    slug: 'winter-sale',
    code: 'WINTER10',
    discountType: 'percentage',
    discountValue: 10,
    startDateTime: new Date('2026-06-01'),
    status: 'active',
    autoApply: 'false',
    enLabel: 'Winter Sale',
  });
}

describe('PromotionFormModalComponent', () => {
  describe('create mode', () => {
    it('opens with every select reset to empty — no pre-seeded default (design-system §3.1)', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<PromotionRespDto>>());

      openCreate(component);

      const form = (component as any).promotionForm;
      expect(form.get('discountType').value).toBe('');
      expect(form.get('status').value).toBe('');
      expect(form.get('autoApply').value).toBe('');
      expect(form.get('slug').value).toBe('');
    });

    it('ignores unrelated input changes (e.g. option-list refresh) while the modal stays closed', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<PromotionRespDto>>());

      component.discountTypeOptions = [{ value: 'percentage', label: 'Percentage' }];
      component.ngOnChanges({
        discountTypeOptions: new SimpleChange([], component.discountTypeOptions, false),
      });

      expect((component as any).isOpen).toBeFalse();
    });
  });

  describe('edit mode', () => {
    it('opens immediately with the row data, before the detail fetch resolves', () => {
      const getPromotionById$ = new Subject<ResponseAPI<PromotionRespDto>>();
      const { component } = makeComponent(getPromotionById$);

      openEdit(component, { ...SUMMER_SALE_ROW });

      expect((component as any).isEditDetailLoading).toBeTrue();
      const form = (component as any).promotionForm;
      expect(form.get('discountValue').value).toBe(10);
    });

    it('patches server detail into untouched fields without clobbering user input', async () => {
      const getPromotionById$ = new Subject<ResponseAPI<PromotionRespDto>>();
      const { component } = makeComponent(getPromotionById$);

      const promise = openEditAwait(component, { ...SUMMER_SALE_ROW });
      const form = (component as any).promotionForm;

      // The admin starts editing before the detail arrives.
      form.get('discountValue').setValue(999);
      form.get('discountValue').markAsDirty();

      getPromotionById$.next(detailResponse());
      getPromotionById$.complete();
      await promise;

      expect(form.get('discountValue').value).toBe(999);
      // The untouched Thai label is filled from the server detail.
      expect(form.get('thLabel').value).toBe('TH label');
      expect((component as any).isEditDetailLoading).toBeFalse();
    });

    it('ignores a stale detail response once the modal has been closed', async () => {
      const getPromotionById$ = new Subject<ResponseAPI<PromotionRespDto>>();
      const { component } = makeComponent(getPromotionById$);

      const promise = openEditAwait(component, { ...SUMMER_SALE_ROW });
      (component as any).isOpen = false;
      component.ngOnChanges({ isOpen: new SimpleChange(true, false, false) });

      getPromotionById$.next(detailResponse());
      getPromotionById$.complete();
      await promise;

      expect((component as any).isOpen).toBeFalse();
      expect((component as any).isEditDetailLoading).toBeFalse();
    });
  });

  describe('isFieldInvalid', () => {
    it('is false until the field is touched/dirty', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<PromotionRespDto>>());
      openCreate(component);

      expect((component as any).isFieldInvalid('enLabel')).toBeFalse();

      (component as any).promotionForm.get('enLabel').markAsTouched();
      expect((component as any).isFieldInvalid('enLabel')).toBeTrue();
    });
  });

  describe('requestClose', () => {
    it('does not emit closed while submitting', () => {
      const { component } = makeComponent(new Subject<ResponseAPI<PromotionRespDto>>());
      openCreate(component);
      (component as any).isSubmitting = true;

      const closedSpy = jasmine.createSpy('closed');
      component.closed.subscribe(closedSpy);

      (component as any).requestClose();
      expect(closedSpy).not.toHaveBeenCalled();

      (component as any).isSubmitting = false;
      (component as any).requestClose();
      expect(closedSpy).toHaveBeenCalled();
    });
  });
  describe('submitPromotion', () => {
    // Byte-for-byte parity with the pre-split PromotionsPageComponent.submitPromotion
    // on dev (post-OBRS-241): API call -> close -> await success alert -> THEN
    // reloadStructure()/refresh LAST. The modal does not stay open during the
    // refresh, and the list is not required to be current before the alert shows.
    it('creates a promotion, closes immediately, awaits the success alert, then reloadStructure() last', async () => {
      const order: string[] = [];
      const { component, adminApi, alert } = makeComponent(new Subject<ResponseAPI<PromotionRespDto>>());
      adminApi.createPromotion.and.callFake(() => {
        order.push('create');
        return of({ code: 201, message: 'Created', data: null });
      });
      (component.reloadStructure as jasmine.Spy).and.callFake(async () => {
        order.push('reload');
      });
      alert.success.and.callFake(async () => {
        order.push('alert');
      });
      openCreate(component);
      fillValidForm(component);

      const closedSpy = jasmine.createSpy('closed');
      component.closed.subscribe(() => {
        order.push('closed');
        closedSpy();
      });

      await (component as any).submitPromotion();

      expect(order).toEqual(['create', 'closed', 'alert', 'reload']);
      expect(closedSpy).toHaveBeenCalled();
    });

    it('updates a promotion by id when in edit mode', async () => {
      const { component, adminApi } = makeComponent(new Subject<ResponseAPI<PromotionRespDto>>());
      openEdit(component, { ...SUMMER_SALE_ROW });
      fillValidForm(component);

      await (component as any).submitPromotion();

      expect(adminApi.updatePromotion).toHaveBeenCalledWith(2, jasmine.any(Object));
      expect(component.reloadStructure).toHaveBeenCalled();
    });

    it('marks all fields touched and warns without submitting when the form is invalid', async () => {
      const { component, adminApi, alert } = makeComponent(new Subject<ResponseAPI<PromotionRespDto>>());
      openCreate(component);

      await (component as any).submitPromotion();

      expect(adminApi.createPromotion).not.toHaveBeenCalled();
      expect(alert.warning).toHaveBeenCalled();
      expect((component as any).promotionForm.get('slug').touched).toBeTrue();
    });

    it('warns and does not call the API when startDateTime is blank (backend @NotNull)', async () => {
      const { component, adminApi, alert } = makeComponent(new Subject<ResponseAPI<PromotionRespDto>>());
      openCreate(component);
      fillValidForm(component);
      (component as any).promotionForm.get('startDateTime').setValue(null);

      await (component as any).submitPromotion();

      expect(adminApi.createPromotion).not.toHaveBeenCalled();
      expect(alert.warning).toHaveBeenCalled();
    });

    it('alerts an error and emits closed, without calling reloadStructure, on API failure', async () => {
      const getPromotionById$ = new Subject<ResponseAPI<PromotionRespDto>>();
      const adminApi = {
        getPromotionById: jasmine.createSpy('getPromotionById').and.returnValue(getPromotionById$.asObservable()),
        createPromotion: jasmine.createSpy('createPromotion').and.returnValue(throwError(() => new Error('boom'))),
        updatePromotion: jasmine.createSpy('updatePromotion'),
      };
      const alert = {
        success: jasmine.createSpy('success').and.resolveTo(undefined),
        error: jasmine.createSpy('error').and.resolveTo(undefined),
        warning: jasmine.createSpy('warning').and.resolveTo(undefined),
      };
      const component = new PromotionFormModalComponent(
        adminApi as any,
        new FormBuilder(),
        alert as any,
        createTranslateStub()
      );
      component.discountTypeOptions = [{ value: 'percentage', label: 'Percentage' }];
      component.statusOptions = [{ value: 'active', label: 'Active' }];
      component.autoApplyOptions = [{ value: 'false', label: 'No' }];
      component.reloadStructure = jasmine.createSpy('reloadStructure').and.resolveTo(undefined);
      openCreate(component);
      fillValidForm(component);

      const closedSpy = jasmine.createSpy('closed');
      component.closed.subscribe(closedSpy);

      await (component as any).submitPromotion();

      expect(alert.error).toHaveBeenCalledWith('boom');
      expect(closedSpy).toHaveBeenCalled();
      expect(component.reloadStructure).not.toHaveBeenCalled();
    });
  });
});
