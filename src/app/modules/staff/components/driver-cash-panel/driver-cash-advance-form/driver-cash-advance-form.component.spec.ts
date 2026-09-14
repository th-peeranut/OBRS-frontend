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

// ── OBRS-1755: the two additive inputs/outputs the ส่งยอด tab needs ──────────
// Both exist so the SAME form serves two hosts. The point of each test below is
// that the EXISTING host (driver-cash-panel) is unaffected: `showSubmit`
// defaults true, and nothing there binds `amountChange`.
describe('DriverCashAdvanceFormComponent — OBRS-1755 additive contract', () => {
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

  function submitBtn(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('[data-testid="driver-cash-advance-submit"]');
  }

  it('renders its own submit button by DEFAULT (driver-cash-panel is unchanged)', () => {
    fixture.detectChanges();
    expect(component.showSubmit).withContext('default must be true').toBeTrue();
    expect(submitBtn()).toBeTruthy();
  });

  it('renders NO submit button when the host owns the single primary action', () => {
    component.showSubmit = false;
    fixture.detectChanges();
    expect(submitBtn()).toBeNull();
    // The field itself must survive — hiding the button is the whole change.
    expect(
      fixture.nativeElement.querySelector('#dcp-advance-amount'),
    ).withContext('the amount field must still render').toBeTruthy();
  });

  it('emits amountChange with the raw text on every keystroke', () => {
    fixture.detectChanges();
    const emitted: string[] = [];
    component.amountChange.subscribe((value: string) => emitted.push(value));

    component['onAmountInput']('5');
    component['onAmountInput']('50');

    expect(emitted).toEqual(['5', '50']);
    // ...and the local value the existing submit path reads is still written.
    expect(component['amountInput']).toBe('50');
  });

  // The clear-on-success contract is what the ส่งยอด tab drives too, so it must
  // still hold with the button hidden — the tab has no other way to empty it.
  it('still clears the input on a successful submit when showSubmit is false', () => {
    component.showSubmit = false;
    component['amountInput'] = '500';
    component.isSubmitting = true;
    fixture.detectChanges();

    component.isSubmitting = false;
    component.submitError = null;
    component.ngOnChanges({
      isSubmitting: {
        previousValue: true,
        currentValue: false,
        firstChange: false,
        isFirstChange: () => false,
      },
    });

    expect(component['amountInput']).toBe('');
  });
});
