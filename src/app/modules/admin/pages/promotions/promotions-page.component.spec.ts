import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { PromotionsPageComponent } from './promotions-page.component';
import { PromotionRespDto } from '../../../../services/admin/admin-api.service';
import { createTranslateStub } from '../../../../testing/test-stubs';

const PROMOTION: PromotionRespDto = {
  id: 1,
  slug: 'round_trip',
  code: 'RT20',
  discountType: { slug: 'percentage', translations: { en: { label: 'Percentage' } } },
  status: { slug: 'active', translations: { en: { label: 'Active' } } },
  discountValue: 20,
  minBookingAmount: 200,
  startDateTime: '2026-01-01T00:00:00+07:00',
  endDateTime: '2026-12-31T23:59:59+07:00',
  usageLimit: 10000,
  currentUsage: 25,
};

function makeStoreStub() {
  const data$ = new BehaviorSubject<PromotionRespDto | null>(null);
  return {
    data$,
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    mutate: jasmine
      .createSpy('mutate')
      .and.callFake((transform: (current: PromotionRespDto) => PromotionRespDto) => {
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
    store as any,
    adminApi as any,
    new FormBuilder(),
    alert as any,
    createTranslateStub()
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { component: component as any, store, alert };
}

describe('PromotionsPageComponent', () => {
  it('subscribes to store.data$ and calls store.refresh() on init — no direct fetch', () => {
    const { component, store } = makeComponent({ getRoundTripPromotion: jasmine.createSpy() });

    component.ngOnInit();

    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('pre-fills the Status dropdown with the current value (design-system §3.1 documented exception)', () => {
    const { component, store } = makeComponent({});

    component.ngOnInit();
    store.data$.next({ ...PROMOTION });

    expect(component.promotionForm.get('status')?.value).toBe('active');
    expect(component.promotionForm.get('discountValue')?.value).toBe(20);
    expect(component.promotionForm.get('minBookingAmount')?.value).toBe(200);
  });

  it('marks all fields touched and warns when the form is invalid on save', async () => {
    const { component, alert } = makeComponent({ updateRoundTripPromotion: jasmine.createSpy() });

    component.ngOnInit();
    // discountValue is required and starts null -> invalid.
    await component.save();

    expect(alert.warning).toHaveBeenCalledWith('ADMIN.VALIDATION.FORM_INVALID');
    expect(component.promotionForm.get('discountValue')?.touched).toBeTrue();
  });

  it('flags an end date before the start date', () => {
    const { component } = makeComponent({});
    component.ngOnInit();
    component.promotionForm.patchValue({
      startDateTime: new Date('2026-06-10'),
      endDateTime: new Date('2026-06-01'),
    });

    expect(component.hasDateRangeError()).toBeTrue();
  });

  it('sends only the fields the admin actually changed (partial PATCH)', async () => {
    const updateSpy = jasmine
      .createSpy('updateRoundTripPromotion')
      .and.returnValue(of({ code: 200, message: 'OK', data: null }));
    const { component, store } = makeComponent({ updateRoundTripPromotion: updateSpy });

    component.ngOnInit();
    store.data$.next({ ...PROMOTION });

    // Only touch discountValue; status/dates/minBookingAmount stay pristine.
    component.promotionForm.get('discountValue')?.markAsDirty();
    component.promotionForm.get('discountValue')?.setValue(25);

    await component.save();

    expect(updateSpy).toHaveBeenCalledOnceWith({ discountValue: 25 });
  });

  it('toggling Status sends `{ active: boolean }` on the wire, matching RoundTripPromotionReqDto — NOT `status`', async () => {
    const updateSpy = jasmine
      .createSpy('updateRoundTripPromotion')
      .and.returnValue(of({ code: 200, message: 'OK', data: null }));
    const { component, store } = makeComponent({ updateRoundTripPromotion: updateSpy });

    component.ngOnInit();
    store.data$.next({ ...PROMOTION }); // status: 'active'

    component.promotionForm.get('status')?.markAsDirty();
    component.promotionForm.get('status')?.setValue('inactive');

    await component.save();

    expect(updateSpy).toHaveBeenCalledOnceWith({ active: false });

    // Reset and flip the other way.
    updateSpy.calls.reset();
    component.promotionForm.get('status')?.markAsDirty();
    component.promotionForm.get('status')?.setValue('active');
    await component.save();

    expect(updateSpy).toHaveBeenCalledOnceWith({ active: true });
  });

  it('optimistically writes the store status (string) even though the wire payload sent `active` (boolean)', async () => {
    const updateSpy = jasmine
      .createSpy('updateRoundTripPromotion')
      .and.returnValue(of({ code: 200, message: 'OK', data: null }));
    const { component, store } = makeComponent({ updateRoundTripPromotion: updateSpy });

    component.ngOnInit();
    store.data$.next({ ...PROMOTION }); // status: 'active'

    component.promotionForm.get('status')?.markAsDirty();
    component.promotionForm.get('status')?.setValue('inactive');

    await component.save();

    const optimisticValue = store.data$.value as PromotionRespDto;
    expect(optimisticValue.status).toBe('inactive');
    expect((optimisticValue as unknown as { active?: boolean }).active).toBeUndefined();
  });

  it('on save success: shows the success alert, marks the form pristine, and refreshes the store', async () => {
    const updateSpy = jasmine
      .createSpy('updateRoundTripPromotion')
      .and.returnValue(of({ code: 200, message: 'OK', data: null }));
    const { component, store, alert } = makeComponent({ updateRoundTripPromotion: updateSpy });

    component.ngOnInit();
    store.data$.next({ ...PROMOTION });
    component.promotionForm.get('discountValue')?.markAsDirty();
    component.promotionForm.get('discountValue')?.setValue(25);

    await component.save();

    expect(alert.success).toHaveBeenCalledWith('ADMIN.MESSAGES.UPDATED');
    expect(component.promotionForm.pristine).toBeTrue();
    expect(store.refresh).toHaveBeenCalled();
  });

  it('on save failure: shows the error alert and keeps the admin-entered value in the form', async () => {
    const updateSpy = jasmine
      .createSpy('updateRoundTripPromotion')
      .and.returnValue(throwError(() => new Error('boom')));
    const { component, store, alert } = makeComponent({ updateRoundTripPromotion: updateSpy });

    component.ngOnInit();
    store.data$.next({ ...PROMOTION });
    component.promotionForm.get('discountValue')?.markAsDirty();
    component.promotionForm.get('discountValue')?.setValue(25);

    await component.save();

    expect(alert.error).toHaveBeenCalled();
    // The admin's typed value must survive the failed save.
    expect(component.promotionForm.get('discountValue')?.value).toBe(25);
  });
});
