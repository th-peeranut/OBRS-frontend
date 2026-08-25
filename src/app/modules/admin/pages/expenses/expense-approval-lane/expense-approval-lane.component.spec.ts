import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ExpenseApprovalLaneComponent } from './expense-approval-lane.component';
import { ExpenseRow } from '../expenses-page.mappers';

function row(id: number): ExpenseRow {
  return {
    id,
    ownerId: 1,
    ownerLabel: '',
    vehicleId: 3,
    vehicleLabel: '1กข 1234',
    category: 'FUEL',
    categoryOtherLabel: '',
    categoryDisplay: 'ค่าก๊าซ/น้ำมัน',
    amount: 300,
    vatAmount: null,
    expenseDate: '2026-08-14',
    expenseDateDisplay: '14/08/2026',
    receiptNo: '',
    paidBy: '',
    payeeId: null,
    payeeName: '',
    note: '',
    source: 'FIELD',
    items: [],
  };
}

describe('ExpenseApprovalLaneComponent', () => {
  let fixture: ComponentFixture<ExpenseApprovalLaneComponent>;
  let component: ExpenseApprovalLaneComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, TranslateModule.forRoot()],
      declarations: [ExpenseApprovalLaneComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ExpenseApprovalLaneComponent);
    component = fixture.componentInstance;
  });

  // An owner with nothing to review must get the page they had before this
  // card — an empty card with a heading would be a permanent new obligation.
  it('renders nothing at all when there is nothing to review', () => {
    component.rows = [];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-approval-lane"]')).toBeNull();
  });

  it('emits the id on approve', () => {
    component.rows = [row(5)];
    fixture.detectChanges();
    const spy = spyOn(component.approve, 'emit');

    fixture.nativeElement.querySelector('[data-testid="expense-approve-5"]').click();

    expect(spy).toHaveBeenCalledWith(5);
  });

  // The backend REQUIRES a reason, so the confirm button must stay dead until
  // there is one - otherwise the only feedback is a 400 after the click.
  it('cannot confirm a rejection with no reason, and emits the trimmed reason once given', () => {
    component.rows = [row(5)];
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="expense-reject-5"]').click();
    fixture.detectChanges();

    const confirm: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="expense-reject-confirm-5"]'
    );
    expect(confirm.disabled).toBeTrue();

    component['rejectionReason'] = '  บิลไม่ตรงกับรถคันนี้  ';
    fixture.detectChanges();
    const spy = spyOn(component.reject, 'emit');
    confirm.click();

    expect(spy).toHaveBeenCalledWith({ id: 5, rejectionReason: 'บิลไม่ตรงกับรถคันนี้' });
  });

  it('disables only the row being ruled on', () => {
    component.rows = [row(5), row(6)];
    component.busyId = 5;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="expense-approve-5"]').disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-approve-6"]').disabled).toBeFalse();
  });
});
