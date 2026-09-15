import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ExpenseApprovalLaneComponent } from './expense-approval-lane.component';
import { ExpenseApprovalGroupRow } from '../expenses-page.mappers';
import { PendingButtonDirective } from '../../../../../shared/directives/pending-button.directive';
import { LoadingStateComponent } from '../../../../../shared/components/loading-state/loading-state.component';

function singleRow(id: number): ExpenseApprovalGroupRow {
  return {
    groupType: 'SINGLE',
    actionKey: `exp:${id}`,
    settleId: null,
    expenseId: id,
    vehicleLabel: '1กข 1234',
    expenseDateDisplay: '14/08/2026',
    categoryDisplay: 'ค่าก๊าซ/น้ำมัน',
    totalAmount: 300,
    note: '',
    members: [],
  };
}

function billRow(
  settleId: number,
  members: { categoryDisplay: string; amount: number; note: string }[] = []
): ExpenseApprovalGroupRow {
  return {
    groupType: 'SETTLE_BILL',
    actionKey: `bill:${settleId}`,
    settleId,
    expenseId: null,
    vehicleLabel: '1กข 1234',
    expenseDateDisplay: '14/08/2026',
    categoryDisplay: 'ค่าบิลก๊าซ',
    totalAmount: 900,
    note: '',
    members,
  };
}

describe('ExpenseApprovalLaneComponent', () => {
  let fixture: ComponentFixture<ExpenseApprovalLaneComponent>;
  let component: ExpenseApprovalLaneComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, TranslateModule.forRoot()],
      declarations: [ExpenseApprovalLaneComponent, PendingButtonDirective, LoadingStateComponent],
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

  it('emits the row on approve for a SINGLE row', () => {
    const row = singleRow(5);
    component.rows = [row];
    fixture.detectChanges();
    const spy = spyOn(component.approve, 'emit');

    fixture.nativeElement.querySelector('[data-testid="expense-approve-exp:5"]').click();

    expect(spy).toHaveBeenCalledWith(row);
  });

  // The backend REQUIRES a reason, so the confirm button must stay dead until
  // there is one - otherwise the only feedback is a 400 after the click.
  it('cannot confirm a rejection with no reason, and emits the trimmed reason once given', () => {
    const row = singleRow(5);
    component.rows = [row];
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="expense-reject-exp:5"]').click();
    fixture.detectChanges();

    const confirm: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="expense-reject-confirm-exp:5"]'
    );
    expect(confirm.disabled).toBeTrue();

    component['rejectionReason'] = '  บิลไม่ตรงกับรถคันนี้  ';
    fixture.detectChanges();
    const spy = spyOn(component.reject, 'emit');
    confirm.click();

    expect(spy).toHaveBeenCalledWith({ row, rejectionReason: 'บิลไม่ตรงกับรถคันนี้' });
  });

  it('disables only the row being ruled on, keyed by the composite action key', () => {
    component.rows = [singleRow(5), singleRow(6)];
    component.busyId = 'exp:5';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="expense-approve-exp:5"]').disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-approve-exp:6"]').disabled).toBeFalse();
  });

  // OBRS-1891 AC-1/AC-2: a gas-bill settle shows as ONE row, its members are read-only behind
  // an expand toggle, and its action key never collides with an unrelated expense id in the
  // same table (settleId 9 vs expense id 9 here).
  it('expands a SETTLE_BILL row to show its members, with no per-member verdict buttons, and its own action key does not collide with a same-numbered expense id', () => {
    const bill = billRow(9, [
      { categoryDisplay: 'น้ำมัน', amount: 500, note: '' },
      { categoryDisplay: 'ค่าแรงคนขับ', amount: 400, note: 'รอบเช้า' },
    ]);
    component.rows = [bill, singleRow(9)];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="expense-approval-expand-bill:9"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.expense-approval-member-list')).toBeNull();

    fixture.nativeElement.querySelector('[data-testid="expense-approval-expand-bill:9"]').click();
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.expense-approval-member-chip');
    expect(chips.length).toBe(2);
    expect(chips[1].textContent).toContain('รอบเช้า');

    // Both the bill's own verdict buttons and the unrelated expense id 9's verdict buttons
    // exist independently — busyId on one must never read as busy on the other.
    expect(fixture.nativeElement.querySelector('[data-testid="expense-approve-bill:9"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-approve-exp:9"]')).toBeTruthy();
    component.busyId = 'bill:9';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-approve-bill:9"]').disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-approve-exp:9"]').disabled).toBeFalse();
  });
});
