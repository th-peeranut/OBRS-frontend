import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DriverCashExpenseFormComponent } from './driver-cash-expense-form.component';
import { AdminDropdownComponent } from '../../../../admin/components/admin-dropdown/admin-dropdown.component';

describe('DriverCashExpenseFormComponent', () => {
  let fixture: ComponentFixture<DriverCashExpenseFormComponent>;
  let component: DriverCashExpenseFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, TranslateModule.forRoot()],
      declarations: [DriverCashExpenseFormComponent, AdminDropdownComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(DriverCashExpenseFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function submitBtn(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('[data-testid="driver-cash-expense-submit"]');
  }

  // Card: reuse ADMIN.EXPENSES.CATEGORIES.* — no STAFF.* duplicate keys.
  // OBRS-1356 CHANGED this expectation rather than adding a second one:
  // DRIVER_WAGE used to be excluded as "a cost a driver never pays roadside",
  // and the owner overturned exactly that on 2026-08-14. Leaving the old list
  // green beside a new one would keep both readings alive in the suite.
  it('builds category options from the existing ADMIN.EXPENSES.CATEGORIES i18n namespace', () => {
    const codes = component['categoryOptions'].map((o) => o.value);
    expect(codes).toEqual([
      'FUEL',
      'TOLL',
      'PERMIT_FEE',
      'DRIVER_WAGE',
      'REPAIR',
      'PARKING_FEE',
      'OTHER',
    ]);
  });

  // OBRS-1356 — the wage is priced server-side from the owner's rate per leg.
  it('submits DRIVER_WAGE with NO amount, and takes no amount from the user', () => {
    component['onCategoryChange']('DRIVER_WAGE');
    fixture.detectChanges();
    const spy = spyOn(component.submitExpense, 'emit');

    expect(fixture.nativeElement.querySelector('#dcp-expense-amount')).toBeNull();
    expect(submitBtn().disabled).toBeFalse();

    submitBtn().click();

    expect(spy).toHaveBeenCalledWith({ category: 'DRIVER_WAGE' });
  });

  it('drops an amount typed before DRIVER_WAGE was chosen', () => {
    component['onCategoryChange']('FUEL');
    component['amountInput'] = '250.00';
    component['onCategoryChange']('DRIVER_WAGE');
    fixture.detectChanges();
    const spy = spyOn(component.submitExpense, 'emit');

    submitBtn().click();

    expect(spy).toHaveBeenCalledWith({ category: 'DRIVER_WAGE' });
  });

  it('blocks submit with no category selected', () => {
    component['amountInput'] = '10.00';
    fixture.detectChanges();
    expect(submitBtn().disabled).toBeTrue();
  });

  it('blocks submit on an invalid amount', () => {
    component['onCategoryChange']('FUEL');
    component['amountInput'] = 'not a number';
    fixture.detectChanges();
    expect(submitBtn().disabled).toBeTrue();
  });

  it('emits submitExpense with category/amount and omits note when blank', () => {
    component['onCategoryChange']('FUEL');
    component['amountInput'] = '250.00';
    fixture.detectChanges();
    const spy = spyOn(component.submitExpense, 'emit');

    submitBtn().click();

    expect(spy).toHaveBeenCalledWith({ category: 'FUEL', amount: '250.00' });
  });

  it('includes a trimmed note when provided', () => {
    component['onCategoryChange']('TOLL');
    component['amountInput'] = '50.00';
    component['noteInput'] = '  receipt #123  ';
    fixture.detectChanges();
    const spy = spyOn(component.submitExpense, 'emit');

    submitBtn().click();

    expect(spy).toHaveBeenCalledWith({ category: 'TOLL', amount: '50.00', note: 'receipt #123' });
  });

  // OBRS-1363 — the four below are the whole of the card's FE half. The first is
  // the bug itself: OTHER was offered from day one and 400'd on every submit,
  // because the backend never accepted it and nothing on screen said so.
  it('blocks submit on OTHER until the free-text label is filled', () => {
    component['onCategoryChange']('OTHER');
    component['amountInput'] = '80.00';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="driver-cash-expense-other-label"]')).not.toBeNull();
    expect(submitBtn().disabled).toBeTrue();

    component['otherLabelInput'] = '  ค่าล้างรถ  ';
    fixture.detectChanges();
    expect(submitBtn().disabled).toBeFalse();
  });

  it('emits OTHER with a trimmed categoryOtherLabel', () => {
    component['onCategoryChange']('OTHER');
    component['amountInput'] = '80.00';
    component['otherLabelInput'] = '  ค่าล้างรถ  ';
    fixture.detectChanges();
    const spy = spyOn(component.submitExpense, 'emit');

    submitBtn().click();

    expect(spy).toHaveBeenCalledWith({
      category: 'OTHER',
      amount: '80.00',
      categoryOtherLabel: 'ค่าล้างรถ',
    });
  });

  // The backend refuses a label sent with a non-OTHER category, so a stale one
  // left behind after switching away would 400 a submit the user believes is fine.
  it('drops a label typed before the category was switched away from OTHER', () => {
    component['onCategoryChange']('OTHER');
    component['otherLabelInput'] = 'ค่าล้างรถ';
    component['onCategoryChange']('PARKING_FEE');
    component['amountInput'] = '50.00';
    fixture.detectChanges();
    const spy = spyOn(component.submitExpense, 'emit');

    expect(fixture.nativeElement.querySelector('[data-testid="driver-cash-expense-other-label"]')).toBeNull();
    submitBtn().click();

    expect(spy).toHaveBeenCalledWith({ category: 'PARKING_FEE', amount: '50.00' });
  });

  it('submits PARKING_FEE as an ordinary priced category, no label field', () => {
    component['onCategoryChange']('PARKING_FEE');
    component['amountInput'] = '50.00';
    fixture.detectChanges();
    const spy = spyOn(component.submitExpense, 'emit');

    expect(fixture.nativeElement.querySelector('#dcp-expense-amount')).not.toBeNull();
    submitBtn().click();

    expect(spy).toHaveBeenCalledWith({ category: 'PARKING_FEE', amount: '50.00' });
  });

  it('never resets the form on a submit failure', () => {
    component['onCategoryChange']('FUEL');
    component['amountInput'] = '250.00';
    component['noteInput'] = 'note';
    component.isSubmitting = true;
    fixture.detectChanges();

    component.isSubmitting = false;
    component.submitError = 'STAFF.DRIVER_CASH.ERROR.GENERIC';
    component.ngOnChanges({
      isSubmitting: { previousValue: true, currentValue: false, firstChange: false, isFirstChange: () => false },
    } as any);

    expect(component['selectedCategory']).toBe('FUEL');
    expect(component['amountInput']).toBe('250.00');
    expect(component['noteInput']).toBe('note');
  });
});
