import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import { ExpenseBillCardComponent, buildBillGroup, buildItemGroup } from './expense-bill-card.component';
import { EXPENSE_ITEM_PART_NONE_SENTINEL } from '../expenses-page.mappers';
import { createTranslateStub } from '../../../../../testing/test-stubs';

function makeComponent(): { component: ExpenseBillCardComponent; bill: FormGroup; fb: FormBuilder } {
  const fb = new FormBuilder();
  const component = new ExpenseBillCardComponent(createTranslateStub(), fb);
  const bill = buildBillGroup(fb);
  component.billForm = bill;
  component.vehicleOptions = [
    { code: '1', label: '16-8747' },
    { code: '2', label: '16-2733' },
  ];
  component.categoryOptions = [
    { code: 'REPAIR', label: 'Repair' },
    { code: 'OTHER', label: 'Other' },
  ];
  component.payees = [{ id: 5, name: 'อู่ช่างปุ้น (รถตู้บ้านบึง) 1', type: 'GARAGE', active: true }];
  return { component, bill, fb };
}

function itemsOf(bill: FormGroup): FormArray {
  return bill.get('items') as FormArray;
}

describe('ExpenseBillCardComponent', () => {
  it('should create', () => {
    expect(makeComponent().component).toBeTruthy();
  });

  // AC1: a bill card opens ready to type into. Opening with zero lines would make the owner's first
  // action on every single bill a click on "add a line".
  it('starts with exactly one blank line', () => {
    const { bill } = makeComponent();

    expect(itemsOf(bill).length).toBe(1);
    expect(itemsOf(bill).at(0).get('part')!.value).toBe(EXPENSE_ITEM_PART_NONE_SENTINEL);
  });

  it('adds and removes lines', () => {
    const { component, bill } = makeComponent();

    component['addItem']();
    component['addItem']();
    expect(itemsOf(bill).length).toBe(3);

    component['removeItem'](1);
    expect(itemsOf(bill).length).toBe(2);
  });

  // The bill total is READ off the lines, never typed. This is what removes the whole
  // "lines add up to 3,150 but the bill says 3,100" class of error the single-bill modal has.
  it('totals the lines, and there is no amount control to disagree with them', () => {
    const { component, bill } = makeComponent();
    component['addItem']();
    itemsOf(bill).at(0).get('amount')!.setValue(1730);
    itemsOf(bill).at(1).get('amount')!.setValue(700.5);

    expect(component['billTotal']).toBe(2430.5);
    expect(bill.get('amount')).toBeNull();
  });

  // OBRS-1576/V122. Measured on the owner's own bill (OBRS-1578, 2026-08-24): bill 2 line 4 has no
  // money against it. Under `> 0` that whole bill could not be typed in at all.
  it('accepts a line worth 0.00', () => {
    const { bill } = makeComponent();
    const line = itemsOf(bill).at(0);
    line.get('description')!.setValue('เปลี่ยนหลอดไฟ (ไม่คิดเงิน)');
    line.get('amount')!.setValue(0);

    expect(line.get('amount')!.valid)
      .withContext('a free line on a charged bill is a real line')
      .toBeTrue();
  });

  // Measured on the owner's own bill: 2 of its 4 lines carry neither. A required field there would
  // be answered with an invented number, which is the thing OBRS-1613's price comparison must not
  // be fed.
  it('does not require quantity or unit price', () => {
    const { bill } = makeComponent();
    const line = itemsOf(bill).at(0);
    line.get('description')!.setValue('ถ่ายน้ำมันเครื่อง + กรองเครื่อง');
    line.get('amount')!.setValue(1730);

    expect(line.valid).toBeTrue();
  });

  // AC2/AC3: the header facts a bill cannot be saved without. `payeeId` is required HERE and
  // optional on the general bill form — this screen exists to make "how much did I pay this garage"
  // answerable, and a blank garage on a repair bill is the gap that question falls into.
  it('requires date, vehicle, garage and category', () => {
    const { bill } = makeComponent();
    itemsOf(bill).at(0).get('description')!.setValue('x');
    itemsOf(bill).at(0).get('amount')!.setValue(10);
    expect(bill.valid).toBeFalse();

    bill.get('expenseDate')!.setValue(new Date(2026, 7, 14));
    bill.get('vehicleSelection')!.setValue('1');
    bill.get('payeeId')!.setValue(5);
    bill.get('category')!.setValue('REPAIR');

    expect(bill.valid).toBeTrue();
  });

  it('resolves the folded summary from the codes on the form', () => {
    const { component, bill } = makeComponent();
    bill.get('vehicleSelection')!.setValue('2');
    bill.get('category')!.setValue('REPAIR');
    bill.get('payeeId')!.setValue(5);

    expect(component['summaryVehicleLabel']).toBe('16-2733');
    expect(component['summaryCategoryLabel']).toBe('Repair');
    expect(component['summaryPayeeName']).toBe('อู่ช่างปุ้น (รถตู้บ้านบึง) 1');
  });

  // A payee that no longer resolves must render as blank, never as a bare id — an id means nothing
  // to the owner and reads as data corruption.
  it('renders an unresolvable payee as blank', () => {
    const { component, bill } = makeComponent();
    bill.get('payeeId')!.setValue(999);

    expect(component['summaryPayeeName']).toBe('');
  });

  it('buildItemGroup requires a description and an amount', () => {
    const line = buildItemGroup(new FormBuilder());

    expect(line.get('description')!.valid).toBeFalse();
    expect(line.get('amount')!.valid).toBeFalse();
  });
});
