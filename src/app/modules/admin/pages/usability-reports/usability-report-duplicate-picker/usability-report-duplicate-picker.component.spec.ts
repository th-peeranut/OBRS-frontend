import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SimpleChange } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { UsabilityReportDuplicatePickerComponent } from './usability-report-duplicate-picker.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { UsabilityReportSummary } from '../../../../../shared/interfaces/usability-report.interface';

const CANDIDATES: UsabilityReportSummary[] = [
  {
    id: 'rep-2',
    category: 'bug',
    status: 'in_review',
    userId: 1,
    descriptionPreview: 'Cannot submit the booking form on Safari',
    imageCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    duplicateOfId: null,
    duplicateCount: 0,
  },
  {
    id: 'rep-5',
    category: 'suggestion',
    status: 'new',
    userId: 2,
    descriptionPreview: 'Add a dark-mode toggle',
    imageCount: 0,
    createdAt: '2026-01-02T00:00:00Z',
    duplicateOfId: null,
    duplicateCount: 0,
  },
];

describe('UsabilityReportDuplicatePickerComponent', () => {
  let fixture: ComponentFixture<UsabilityReportDuplicatePickerComponent>;
  let component: UsabilityReportDuplicatePickerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot()],
      declarations: [UsabilityReportDuplicatePickerComponent, AdminModalBackdropDirective],
    }).compileComponents();

    fixture = TestBed.createComponent(UsabilityReportDuplicatePickerComponent);
    component = fixture.componentInstance;
  });

  it('renders every candidate row when there is no search term', () => {
    component.candidates = CANDIDATES;
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('.ur-duplicate-picker-row'));
    expect(rows.length).toBe(2);
  });

  it('shows the empty-state message and no table when candidates is empty', () => {
    component.candidates = [];
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.ur-duplicate-picker-row'))).toBeNull();
    expect(fixture.debugElement.query(By.css('table'))).toBeNull();
    const empty = fixture.debugElement.query(By.css('.admin-empty-row-text'));
    expect(empty).not.toBeNull();
  });

  it('filters candidates by id substring', () => {
    component.candidates = CANDIDATES;
    fixture.detectChanges();

    component['onSearchTermChange']('rep-5');
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('.ur-duplicate-picker-row'));
    expect(rows.length).toBe(1);
    expect(rows[0].nativeElement.textContent).toContain('rep-5');
  });

  it('filters candidates by descriptionPreview substring, case-insensitively', () => {
    component.candidates = CANDIDATES;
    fixture.detectChanges();

    component['onSearchTermChange']('DARK-MODE');
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('.ur-duplicate-picker-row'));
    expect(rows.length).toBe(1);
    expect(rows[0].nativeElement.textContent).toContain('rep-5');
  });

  it('Confirm is disabled with no row selected, and enabled after a row is clicked (single-select)', () => {
    component.candidates = CANDIDATES;
    fixture.detectChanges();

    let confirmBtn: HTMLButtonElement = fixture.debugElement.query(
      By.css('.admin-modal-actions .admin-btn-primary')
    ).nativeElement;
    expect(confirmBtn.disabled).withContext('no selection yet').toBeTrue();

    const rows = fixture.debugElement.queryAll(By.css('.ur-duplicate-picker-row'));
    rows[0].nativeElement.click();
    fixture.detectChanges();

    confirmBtn = fixture.debugElement.query(By.css('.admin-modal-actions .admin-btn-primary')).nativeElement;
    expect(confirmBtn.disabled).withContext('Confirm enables once a row is selected').toBeFalse();
    expect(rows[0].nativeElement.classList).toContain('is-selected');

    // Selecting a second row replaces the selection (single-select, not multi).
    rows[1].nativeElement.click();
    fixture.detectChanges();
    expect(rows[0].nativeElement.classList).not.toContain('is-selected');
    expect(rows[1].nativeElement.classList).toContain('is-selected');
  });

  it('emits confirm with the selected candidate id', () => {
    component.candidates = CANDIDATES;
    fixture.detectChanges();
    const confirmSpy = jasmine.createSpy('confirm');
    component.confirm.subscribe(confirmSpy);

    const rows = fixture.debugElement.queryAll(By.css('.ur-duplicate-picker-row'));
    rows[1].nativeElement.click();
    fixture.detectChanges();

    const confirmBtn: HTMLButtonElement = fixture.debugElement.query(
      By.css('.admin-modal-actions .admin-btn-primary')
    ).nativeElement;
    confirmBtn.click();

    expect(confirmSpy).toHaveBeenCalledOnceWith('rep-5');
  });

  it('emits cancel on the Cancel button and on backdrop dismiss', () => {
    component.candidates = CANDIDATES;
    fixture.detectChanges();
    const cancelSpy = jasmine.createSpy('cancel');
    component.cancel.subscribe(cancelSpy);

    const cancelBtn: HTMLButtonElement = fixture.debugElement.query(
      By.css('.admin-modal-actions .admin-btn:not(.admin-btn-primary)')
    ).nativeElement;
    cancelBtn.click();

    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while isSaving, and Confirm stays disabled even with a selection', () => {
    component.candidates = CANDIDATES;
    fixture.detectChanges();
    component['selectCandidate']('rep-2');
    component.isSaving = true;
    fixture.detectChanges();

    const [cancelBtn, confirmBtn]: HTMLButtonElement[] = fixture.debugElement
      .queryAll(By.css('.admin-modal-actions button'))
      .map((el) => el.nativeElement);

    expect(cancelBtn.disabled).toBeTrue();
    expect(confirmBtn.disabled).toBeTrue();
  });

  it('resets searchTerm/selectedId when a new candidates array arrives (fresh open)', () => {
    component.candidates = CANDIDATES;
    // Directly assigning @Input()s in a test does not run Angular's own change
    // detection dispatch of ngOnChanges (that only fires for template
    // bindings), so the lifecycle hook is invoked explicitly here to simulate
    // what the parent's *ngIf="isPickerOpen" + [candidates] binding does on a
    // real (re-)open.
    component.ngOnChanges({ candidates: new SimpleChange(undefined, CANDIDATES, true) });
    fixture.detectChanges();

    component['onSearchTermChange']('rep-5');
    component['selectCandidate']('rep-5');
    expect(component['selectedId']).toBe('rep-5');

    const nextCandidates = [...CANDIDATES]; // a new array reference — simulates a fresh picker open
    component.candidates = nextCandidates;
    component.ngOnChanges({ candidates: new SimpleChange(CANDIDATES, nextCandidates, false) });
    fixture.detectChanges();

    expect(component['searchTerm']).toBe('');
    expect(component['selectedId']).toBeNull();
  });
});
