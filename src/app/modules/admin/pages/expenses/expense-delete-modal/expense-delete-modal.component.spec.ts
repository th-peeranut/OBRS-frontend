import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { ExpenseDeleteModalComponent } from './expense-delete-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { ExpenseRow } from '../expenses-page.mappers';

const ROW: ExpenseRow = {
  id: 1,
  ownerId: 7,
  ownerLabel: 'NJ Travel',
  vehicleId: 1,
  vehicleLabel: 'V1 / ABC-123',
  category: 'FUEL',
  categoryOtherLabel: '',
  categoryDisplay: 'Fuel',
  amount: 500,
  vatAmount: null,
  expenseDate: '2026-07-24',
  expenseDateDisplay: '24 ก.ค. 2026',
  receiptNo: '',
  paidBy: '',
  payeeId: null,
  payeeName: '',
  note: '',
  source: 'MANUAL',
  items: [],
};

describe('ExpenseDeleteModalComponent', () => {
  let fixture: ComponentFixture<ExpenseDeleteModalComponent>;
  let component: ExpenseDeleteModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [ExpenseDeleteModalComponent, AdminModalBackdropDirective],
    }).compileComponents();

    fixture = TestBed.createComponent(ExpenseDeleteModalComponent);
    component = fixture.componentInstance;
  });

  it('does not render when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.admin-modal-backdrop'))).toBeNull();
  });

  it('renders the expense summary when isOpen is true', () => {
    component.isOpen = true;
    component.expense = ROW;
    fixture.detectChanges();

    const strong = fixture.debugElement.query(By.css('.admin-modal-subtitle strong'));
    expect(strong.nativeElement.textContent).toContain('Fuel');
  });

  it('disables the confirm button and shows the deleting label while isDeleting', () => {
    component.isOpen = true;
    component.expense = ROW;
    component.isDeleting = true;
    fixture.detectChanges();

    const confirmButton = fixture.debugElement.query(By.css('.admin-btn-primary'));
    expect(confirmButton.nativeElement.disabled).toBeTrue();
  });

  it('emits confirm/cancel on button clicks', () => {
    component.isOpen = true;
    component.expense = ROW;
    fixture.detectChanges();

    const confirmSpy = jasmine.createSpy('confirm');
    const cancelSpy = jasmine.createSpy('cancel');
    component.confirm.subscribe(confirmSpy);
    component.cancel.subscribe(cancelSpy);

    const buttons = fixture.debugElement.queryAll(By.css('.admin-modal-actions button'));
    buttons[0].nativeElement.click(); // Cancel
    buttons[1].nativeElement.click(); // Confirm

    expect(cancelSpy).toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalled();
  });
});
