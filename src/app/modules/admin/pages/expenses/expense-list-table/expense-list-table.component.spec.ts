import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { ExpenseListTableComponent } from './expense-list-table.component';
import { ExpenseRow } from '../expenses-page.mappers';

function row(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: 1,
    vehicleId: 1,
    vehicleLabel: 'V1 / ABC-123',
    category: 'FUEL',
    categoryOtherLabel: '',
    categoryDisplay: 'Fuel',
    amount: 500,
    vatAmount: 35,
    expenseDate: '2026-07-24',
    expenseDateDisplay: '24 ก.ค. 2026',
    receiptNo: 'RC-1',
    paidBy: 'Somchai',
    note: 'note',
    ...overrides,
  };
}

describe('ExpenseListTableComponent', () => {
  let fixture: ComponentFixture<ExpenseListTableComponent>;
  let component: ExpenseListTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [ExpenseListTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ExpenseListTableComponent);
    component = fixture.componentInstance;
  });

  it('shows skeleton rows while loading', () => {
    component.isLoading = true;
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(By.css('.admin-skeleton-row')).length).toBe(5);
  });

  it('shows the full-section empty state on true empty (no filters)', () => {
    component.isLoading = false;
    component.isEmpty = true;
    component.rows = [];
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.expense-empty-title'))).toBeTruthy();
  });

  it('shows a lighter no-match row when filters narrow a populated list to zero — never the true-empty copy', () => {
    component.isLoading = false;
    component.isEmpty = false;
    component.rows = [];
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.expense-empty'))).toBeNull();
    const emptyRow = fixture.debugElement.query(By.css('.admin-empty-row'));
    expect(emptyRow).toBeTruthy();
  });

  it('renders the vehicle label muted when vehicleId is null (central)', () => {
    component.isLoading = false;
    component.rows = [row({ vehicleId: null, vehicleLabel: 'Central / Not linked' })];
    fixture.detectChanges();

    const mutedCell = fixture.debugElement.query(By.css('.admin-muted'));
    expect(mutedCell.nativeElement.textContent.trim()).toBe('Central / Not linked');
  });

  it('emits edit/delete with the clicked row', () => {
    component.isLoading = false;
    component.canWrite = true;
    component.rows = [row()];
    fixture.detectChanges();

    const editSpy = jasmine.createSpy('edit');
    const deleteSpy = jasmine.createSpy('delete');
    component.edit.subscribe(editSpy);
    component.delete.subscribe(deleteSpy);

    const buttons = fixture.debugElement.queryAll(By.css('.admin-inline-actions button'));
    buttons[0].nativeElement.click();
    buttons[1].nativeElement.click();

    expect(editSpy).toHaveBeenCalledWith(jasmine.objectContaining({ id: 1 }));
    expect(deleteSpy).toHaveBeenCalledWith(jasmine.objectContaining({ id: 1 }));
  });

  it('hides the actions column when canWrite is false', () => {
    component.isLoading = false;
    component.canWrite = false;
    component.rows = [row()];
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.admin-inline-actions'))).toBeNull();
  });
});
