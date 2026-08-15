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
    expect(codes).toEqual(['FUEL', 'TOLL', 'PERMIT_FEE', 'DRIVER_WAGE', 'REPAIR', 'OTHER']);
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
