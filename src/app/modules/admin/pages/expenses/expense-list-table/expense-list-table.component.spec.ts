import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { ExpenseListTableComponent } from './expense-list-table.component';
import { ExpenseRow } from '../expenses-page.mappers';

function row(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: 1,
    ownerId: 7,
    ownerLabel: 'NJ Travel',
    vehicleId: 1,
    vehicleLabel: 'ABC-123',
    category: 'FUEL',
    categoryOtherLabel: '',
    categoryDisplay: 'Fuel',
    amount: 500,
    vatAmount: 35,
    expenseDate: '2026-07-24',
    expenseDateDisplay: '24 ก.ค. 2026',
    receiptNo: 'RC-1',
    paidBy: 'Somchai',
    payeeId: null,
    payeeName: '',
    note: 'note',
    source: 'MANUAL',
    items: [],
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

  // OBRS-1627 replaces the OBRS-808 block that stood here. That column was
  // admin-only; now there is no column for anyone, because with one operator on
  // prod it printed the same name on all 8,580 rows. Still asserts what is
  // RENDERED, not what is mounted - a template branch that never fires would
  // otherwise read as covered.
  describe('columns that left the table (OBRS-1627)', () => {
    function headers(): string[] {
      return fixture.debugElement.queryAll(By.css('thead th')).map((th) => th.nativeElement.textContent.trim());
    }

    it('renders NO operator cell and NO operator header, for an admin as much as an owner', () => {
      component.isLoading = false;
      component.rows = [row({ ownerLabel: 'Second Lines' })];
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('[data-testid="expense-owner-cell"]'))).toBeNull();
      expect(headers()).not.toContain('ADMIN.EXPENSES.OWNER');
    });

    it('renders no header for Source, VAT, receipt no. or paid-by', () => {
      component.isLoading = false;
      component.rows = [row()];
      fixture.detectChanges();

      for (const key of [
        'ADMIN.EXPENSES.SOURCE',
        'ADMIN.EXPENSES.VAT_AMOUNT',
        'ADMIN.EXPENSES.RECEIPT_NO',
        'ADMIN.EXPENSES.PAID_BY',
      ]) {
        expect(headers()).withContext(key).not.toContain(key);
      }
    });

    it('AC-2: the row still CARRIES what the table stopped printing', () => {
      // The columns went, the data did not - the edit form reads these off the
      // same row object. A test that only counted headers would stay green on a
      // mapper that had quietly stopped carrying them.
      component.isLoading = false;
      component.rows = [row({ vatAmount: 84, receiptNo: 'RC-9', paidBy: 'Somchai' })];
      fixture.detectChanges();

      const body = fixture.debugElement.query(By.css('tbody')).nativeElement.textContent;
      expect(body).not.toContain('RC-9');
      expect(body).not.toContain('Somchai');
      expect(component.rows[0].vatAmount).toBe(84);
      expect(component.rows[0].receiptNo).toBe('RC-9');
    });

    it('the no-match colspan tracks the real column count in both canWrite states', () => {
      // A colspan that undercounts leaves a ragged cell rather than failing, so
      // it is asserted against the header count actually rendered - never a
      // literal. Removing five columns is exactly the edit that used to break it.
      for (const canWrite of [false, true]) {
        component.isLoading = false;
        component.isEmpty = false;
        component.rows = [];
        component.canWrite = canWrite;
        fixture.detectChanges();

        const headerCount = fixture.debugElement.queryAll(By.css('thead th')).length;
        const colspan = fixture.debugElement
          .query(By.css('.admin-empty-row td'))
          .nativeElement.getAttribute('colspan');
        expect(Number(colspan)).withContext(`canWrite=${canWrite}`).toBe(headerCount);
      }
    });

    it('the skeleton row has one cell per header while loading', () => {
      // Same defect class as the colspan: a missing skeleton cell shifts every
      // column of the loading table one place left, which looks like a layout
      // glitch rather than a bug and so never gets reported.
      component.isLoading = true;
      component.canWrite = true;
      fixture.detectChanges();

      const headerCount = fixture.debugElement.queryAll(By.css('thead th')).length;
      const skeletonCells = fixture.debugElement.queryAll(By.css('.admin-skeleton-row:first-of-type td')).length;
      expect(skeletonCells).toBe(headerCount);
    });
  });

  // OBRS-960 — a FIELD row (backend auto-created from a driver's cash-panel
  // expense entry) renders the "ที่มา" chip and has BOTH edit/delete disabled
  // WITH a title (never absent, never erroring on click); a MANUAL row does
  // neither.
  describe('Source chip (OBRS-960, moved onto the date cell by OBRS-1627)', () => {
    function sourceCell(): HTMLElement {
      return fixture.debugElement.query(By.css('[data-testid="expense-date-cell"]')).nativeElement;
    }

    it('renders the FIELD chip for a source:FIELD row, beside the date', () => {
      component.isLoading = false;
      component.rows = [row({ source: 'FIELD' })];
      fixture.detectChanges();

      const cell = sourceCell();
      const chip = cell.querySelector('.admin-status.is-neutral');
      expect(chip).not.toBeNull();
      // OBRS-1627: the chip did not merely survive - it moved, and the cell it
      // moved into still shows the date it now shares.
      expect(cell.textContent).toContain('24 ก.ค. 2026');
    });

    it('renders NO chip for a source:MANUAL row', () => {
      component.isLoading = false;
      component.rows = [row({ source: 'MANUAL' })];
      fixture.detectChanges();

      expect(sourceCell().querySelector('.admin-status.is-neutral')).toBeNull();
    });

    it('disables edit/delete WITH a title reason on a FIELD row', () => {
      component.isLoading = false;
      component.canWrite = true;
      component.rows = [row({ source: 'FIELD' })];
      fixture.detectChanges();

      const buttons = fixture.debugElement.queryAll(By.css('.admin-inline-actions button'));
      expect(buttons.length).toBe(2);
      for (const btn of buttons) {
        expect(btn.nativeElement.disabled).toBeTrue();
        expect(btn.nativeElement.getAttribute('title')).toBeTruthy();
      }
    });

    it('a click on a disabled FIELD-row button does not emit edit/delete (no-op, not an error)', () => {
      component.isLoading = false;
      component.canWrite = true;
      component.rows = [row({ source: 'FIELD' })];
      fixture.detectChanges();

      const editSpy = jasmine.createSpy('edit');
      const deleteSpy = jasmine.createSpy('delete');
      component.edit.subscribe(editSpy);
      component.delete.subscribe(deleteSpy);

      const buttons = fixture.debugElement.queryAll(By.css('.admin-inline-actions button'));
      buttons[0].nativeElement.click();
      buttons[1].nativeElement.click();

      expect(editSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('leaves edit/delete enabled with NO title on a MANUAL row', () => {
      component.isLoading = false;
      component.canWrite = true;
      component.rows = [row({ source: 'MANUAL' })];
      fixture.detectChanges();

      const buttons = fixture.debugElement.queryAll(By.css('.admin-inline-actions button'));
      for (const btn of buttons) {
        expect(btn.nativeElement.disabled).toBeFalse();
        expect(btn.nativeElement.getAttribute('title')).toBeNull();
      }
    });
  });
});
