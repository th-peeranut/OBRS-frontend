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
    source: 'MANUAL',
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

  // OBRS-808. Asserts what is RENDERED, not what is mounted: an *ngIf that
  // never fires still counts as covered, so every case here reads the DOM.
  describe('operator column (OBRS-808)', () => {
    it('renders the operator cell for an admin', () => {
      component.isLoading = false;
      component.showOwnerColumn = true;
      component.rows = [row({ ownerLabel: 'Second Lines' })];
      fixture.detectChanges();

      const cell = fixture.debugElement.query(By.css('[data-testid="expense-owner-cell"]'));
      expect(cell).toBeTruthy();
      expect(cell.nativeElement.textContent.trim()).toBe('Second Lines');
    });

    it('AC2: renders NO operator cell and NO header for an owner', () => {
      component.isLoading = false;
      component.showOwnerColumn = false;
      component.rows = [row({ ownerLabel: 'NJ Travel' })];
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('[data-testid="expense-owner-cell"]'))).toBeNull();
      const headers = fixture.debugElement
        .queryAll(By.css('thead th'))
        .map((th) => th.nativeElement.textContent.trim());
      expect(headers).not.toContain('ADMIN.EXPENSES.OWNER');
    });

    it('the no-match colspan tracks the real column count in every combination', () => {
      // A colspan that undercounts leaves a ragged cell rather than failing, so
      // it is asserted for each of the four (showOwnerColumn x canWrite) states
      // against the header count actually rendered - not against a literal.
      for (const showOwnerColumn of [false, true]) {
        for (const canWrite of [false, true]) {
          component.isLoading = false;
          component.isEmpty = false;
          component.rows = [];
          component.showOwnerColumn = showOwnerColumn;
          component.canWrite = canWrite;
          fixture.detectChanges();

          const headerCount = fixture.debugElement.queryAll(By.css('thead th')).length;
          const colspan = fixture.debugElement
            .query(By.css('.admin-empty-row td'))
            .nativeElement.getAttribute('colspan');
          expect(Number(colspan))
            .withContext(`showOwnerColumn=${showOwnerColumn} canWrite=${canWrite}`)
            .toBe(headerCount);
        }
      }
    });

    it('the skeleton row has one cell per header while loading', () => {
      // Same defect class as the colspan: a missing skeleton cell shifts every
      // column of the loading table one place left, which looks like a layout
      // glitch rather than a bug and so never gets reported.
      component.isLoading = true;
      component.showOwnerColumn = true;
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
  describe('Source column (OBRS-960)', () => {
    function sourceCell(): HTMLElement {
      return fixture.debugElement.query(By.css('[data-testid="expense-source-cell"]')).nativeElement;
    }

    it('renders the FIELD chip for a source:FIELD row', () => {
      component.isLoading = false;
      component.rows = [row({ source: 'FIELD' })];
      fixture.detectChanges();

      const chip = sourceCell().querySelector('.admin-status.is-neutral');
      expect(chip).not.toBeNull();
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
