import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { PromoCodeFieldComponent } from './promo-code-field.component';
import { createTranslateStub } from '../../../testing/test-stubs';

function makeComponent(promotionService: Record<string, unknown>) {
  const translate = createTranslateStub();
  const component = new PromoCodeFieldComponent(promotionService as any, translate);
  return { component: component as any, translate };
}

describe('PromoCodeFieldComponent', () => {
  it('disables Apply when the input is empty', () => {
    const { component } = makeComponent({});
    component.code = '   ';

    expect(component.isApplyDisabled).toBeTrue();
  });

  it('enables Apply once a code is typed', () => {
    const { component } = makeComponent({});
    component.code = 'SAVE20';

    expect(component.isApplyDisabled).toBeFalse();
  });

  it('on Apply success: collapses to the applied chip and emits (applied)', () => {
    const validate = jasmine
      .createSpy('validate')
      .and.returnValue(of({ code: 200, message: 'OK', data: { code: 'SAVE20', discountAmount: 50, netAmount: 950 } }));
    const { component } = makeComponent({ validate });
    const appliedSpy = jasmine.createSpy('applied');
    component.applied.subscribe(appliedSpy);

    component.amount = 1000;
    component.code = 'save20';
    component.apply();

    expect(validate).toHaveBeenCalledWith('save20', 1000);
    expect(component.appliedResult).toEqual({ code: 'SAVE20', discountAmount: 50, netAmount: 950 });
    expect(appliedSpy).toHaveBeenCalledWith({ code: 'SAVE20', discountAmount: 50, netAmount: 950 });
    expect(component.isApplying).toBeFalse();
  });

  it('on Apply failure: maps a PROMO_CODE_* errorCode to the matching PROMO_CODE.ERROR.* key, never the raw message', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: { errorCode: 'PROMO_CODE_EXPIRED', message: 'some localized prose' },
    });
    const validate = jasmine.createSpy('validate').and.returnValue(throwError(() => error));
    const { component } = makeComponent({ validate });

    component.code = 'OLDCODE';
    component.apply();

    expect(component.errorMessage).toBe('PROMO_CODE.ERROR.EXPIRED');
    expect(component.appliedResult).toBeNull();
  });

  it('falls back to a generic error for an unrecognized errorCode', () => {
    const error = new HttpErrorResponse({ status: 500, error: { errorCode: 'SOMETHING_ELSE' } });
    const validate = jasmine.createSpy('validate').and.returnValue(throwError(() => error));
    const { component } = makeComponent({ validate });

    component.code = 'X';
    component.apply();

    expect(component.errorMessage).toBe('PROMO_CODE.APPLY_FAILED');
  });

  it('remove() reverts locally with no server call and emits (removed)', () => {
    const validate = jasmine.createSpy('validate');
    const { component } = makeComponent({ validate });
    const removedSpy = jasmine.createSpy('removed');
    component.removed.subscribe(removedSpy);
    component.appliedResult = { code: 'SAVE20', discountAmount: 50, netAmount: 950 };

    component.remove();

    expect(component.appliedResult).toBeNull();
    expect(component.code).toBe('');
    expect(removedSpy).toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });

  it('applyExternalError() reverts the chip, shows the mapped error, and emits (removed) — no re-validation call', () => {
    const validate = jasmine.createSpy('validate');
    const { component } = makeComponent({ validate });
    const removedSpy = jasmine.createSpy('removed');
    component.removed.subscribe(removedSpy);
    component.appliedResult = { code: 'SAVE20', discountAmount: 50, netAmount: 950 };
    component.code = 'SAVE20';

    component.applyExternalError('PROMO_CODE_USAGE_LIMIT_REACHED');

    expect(component.appliedResult).toBeNull();
    expect(component.errorMessage).toBe('PROMO_CODE.ERROR.USAGE_LIMIT_REACHED');
    expect(component.code).toBe('SAVE20');
    expect(removedSpy).toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });
});
