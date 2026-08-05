import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { RoleListTableComponent } from './role-list-table.component';
import { RoleRow } from '../role-management.mappers';
import { captureDuplicateTrackKeyWarnings } from '../../../../../testing/track-key-warnings';

function makeRow(overrides: Partial<RoleRow> = {}): RoleRow {
  return {
    id: 1,
    slug: 'owner',
    label: 'Owner',
    description: '-',
    enLabel: 'Owner',
    enDescription: '-',
    thLabel: 'เจ้าของ',
    thDescription: '-',
    status: 'Active',
    statusCode: 'active',
    updatedAt: '-',
    ...overrides,
  };
}

describe('RoleListTableComponent (logic)', () => {
  function makeComponent(): RoleListTableComponent {
    return new RoleListTableComponent();
  }

  // Carried over verbatim from RoleManagementPageComponent, including the
  // pre-existing quirk that the original *ngFor never actually wired trackBy
  // in — preserved as dead code, not "fixed", per the split's
  // behavior-preservation invariant.
  it('trackById returns the row id', () => {
    const component = makeComponent();
    expect((component as any).trackById(0, makeRow({ id: 9 }))).toBe(9);
  });

  it('statusClass delegates to the shared mapper', () => {
    const component = makeComponent();
    expect((component as any).statusClass('active')).toBe('is-success');
    expect((component as any).statusClass('PENDING')).toBe('is-warning');
    expect((component as any).statusClass('suspended')).toBe('is-danger');
  });
});

describe('RoleListTableComponent (template)', () => {
  let fixture: ComponentFixture<RoleListTableComponent>;
  let component: RoleListTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [RoleListTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RoleListTableComponent);
    component = fixture.componentInstance;
  });

  it('renders skeleton rows while isLoading is true', () => {
    component.isLoading = true;
    component.rows = [];
    fixture.detectChanges();

    const skeletonRows = fixture.debugElement.queryAll(By.css('tr.admin-skeleton-row'));
    expect(skeletonRows.length).toBe(5);
  });

  // OBRS-967 must-catch, standing in for all 39 placeholder loops swept in that
  // card. `skeletonRows` is `Array.from({ length: 5 })` -- five copies of
  // `undefined` -- so the previous `track row` gave @for the same key five times
  // and Angular logged NG0955 on every skeleton render. Reverting the template to
  // `track row` turns this spec red; the row COUNT above stays green either way,
  // which is exactly why it never caught this.
  it('renders the skeleton without a duplicate track key (NG0955)', () => {
    const readWarnings = captureDuplicateTrackKeyWarnings();
    component.isLoading = true;
    component.rows = [];
    fixture.detectChanges();

    expect(readWarnings())
      .withContext('the placeholder loop must track by $index, not by the undefined row object')
      .toEqual([]);
  });

  it('renders one row per role, with the EN/TH labels', () => {
    component.isLoading = false;
    component.rows = [makeRow({ id: 1 }), makeRow({ id: 2, slug: 'driver' })];
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('tbody tr:not(.admin-empty-row)'));
    expect(rows.length).toBe(2);
    expect(rows[0].nativeElement.textContent).toContain('EN: Owner');
    expect(rows[0].nativeElement.textContent).toContain('TH: เจ้าของ');
  });

  it('renders the empty row when rows is empty and there is no error', () => {
    component.isLoading = false;
    component.rows = [];
    component.hasError = false;
    fixture.detectChanges();

    const emptyRow = fixture.debugElement.query(By.css('tr.admin-empty-row'));
    expect(emptyRow).withContext('empty row should render').toBeTruthy();
  });

  it('does not render the empty row when rows is empty but hasError is true', () => {
    component.isLoading = false;
    component.rows = [];
    component.hasError = true;
    fixture.detectChanges();

    const emptyRow = fixture.debugElement.query(By.css('tr.admin-empty-row'));
    expect(emptyRow).withContext('empty row should not render on error').toBeNull();
  });

  it('shows "Showing X-Y of totalCount" using the unfiltered total, not rows.length', () => {
    component.isLoading = false;
    component.rows = [makeRow({ id: 1 })];
    component.totalCount = 5;
    fixture.detectChanges();

    const footer = fixture.debugElement.query(By.css('.admin-table-footer span'));
    expect(footer.nativeElement.textContent).toContain('5');
  });

  it('emits edit/delete with the role row on each action button click', () => {
    component.isLoading = false;
    const row = makeRow();
    component.rows = [row];
    fixture.detectChanges();

    const editSpy = jasmine.createSpy('edit');
    const deleteSpy = jasmine.createSpy('delete');
    component.edit.subscribe(editSpy);
    component.delete.subscribe(deleteSpy);

    const buttons = fixture.debugElement.queryAll(By.css('tbody .admin-icon-btn'));
    expect(buttons.length).toBe(2);
    buttons[0].nativeElement.click(); // edit
    buttons[1].nativeElement.click(); // delete

    expect(editSpy).toHaveBeenCalledWith(row);
    expect(deleteSpy).toHaveBeenCalledWith(row);
  });
});
