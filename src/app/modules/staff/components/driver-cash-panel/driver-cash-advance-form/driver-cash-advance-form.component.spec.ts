import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DriverCashAdvanceFormComponent } from './driver-cash-advance-form.component';

describe('DriverCashAdvanceFormComponent', () => {
  let fixture: ComponentFixture<DriverCashAdvanceFormComponent>;
  let component: DriverCashAdvanceFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, TranslateModule.forRoot()],
      declarations: [DriverCashAdvanceFormComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(DriverCashAdvanceFormComponent);
    component = fixture.componentInstance;
  });

  function submitBtn(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('[data-testid="driver-cash-advance-submit"]');
  }

  it('blocks submit on an invalid amount', () => {
    component['amountInput'] = 'abc';
    fixture.detectChanges();
    expect(submitBtn().disabled).toBeTrue();
  });

  it('blocks submit on a zero amount', () => {
    component['amountInput'] = '0.00';
    fixture.detectChanges();
    expect(submitBtn().disabled).toBeTrue();
  });

  it('emits submitAdvance with the raw decimal string on a valid amount', () => {
    component['amountInput'] = '150.00';
    fixture.detectChanges();
    const spy = spyOn(component.submitAdvance, 'emit');

    submitBtn().click();

    expect(spy).toHaveBeenCalledWith({ amount: '150.00' });
  });

  // Card: "On a POST failure, never reset the form — keep it populated."
  it('does NOT clear the input when isSubmitting flips to false WITH a submitError', () => {
    component['amountInput'] = '150.00';
    component.isSubmitting = true;
    fixture.detectChanges();

    component.isSubmitting = false;
    component.submitError = 'STAFF.DRIVER_CASH.ERROR.GENERIC';
    fixture.detectChanges();
    component.ngOnChanges({
      isSubmitting: { previousValue: true, currentValue: false, firstChange: false, isFirstChange: () => false },
    } as any);

    expect(component['amountInput']).toBe('150.00');
  });

  it('clears the input when isSubmitting flips to false with NO submitError (success)', () => {
    component['amountInput'] = '150.00';
    component.isSubmitting = true;
    component.submitError = null;
    fixture.detectChanges();

    component.isSubmitting = false;
    component.ngOnChanges({
      isSubmitting: { previousValue: true, currentValue: false, firstChange: false, isFirstChange: () => false },
    } as any);

    expect(component['amountInput']).toBe('');
  });
});
