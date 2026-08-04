import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
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

  // OBRS-1015 AC3. Asserts the RENDERED, TRANSLATED string — mounting the
  // component proves nothing here, and a `translate` pipe with no loaded
  // translation happily emits the raw key, which is exactly the user-visible
  // defect this hint exists to avoid. So the test loads a translation and
  // then requires the key itself to be absent from the DOM.
  it('renders the ADVANCE hint as translated text, not as the raw key', () => {
    const hintText =
      'เงินที่ให้คนขับถือไปจ่ายค่าน้ำมัน/ทางด่วนระหว่างทาง — ตอนปิดยอดสิ้นวันระบบจะเรียกคืนส่วนที่เหลือ';
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('th', {
      STAFF: { DRIVER_CASH: { ADVANCE: { HINT: hintText } } },
    });
    translate.use('th');

    fixture.detectChanges();

    const hint: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="driver-cash-advance-hint"]',
    );
    expect(hint).withContext('the hint element is not in the DOM at all').toBeTruthy();
    expect(hint.textContent?.trim()).toBe(hintText);
    expect(fixture.nativeElement.textContent).not.toContain('STAFF.DRIVER_CASH.ADVANCE.HINT');
  });

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
