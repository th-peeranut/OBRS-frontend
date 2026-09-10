import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { PromotionListTableComponent } from './promotion-list-table.component';
import { PromotionRow } from '../promotions-page.mappers';

function makeRow(overrides: Partial<PromotionRow> = {}): PromotionRow {
  return {
    id: 1,
    slug: 'summer-sale',
    code: 'SUMMER10',
    discountTypeCode: 'percentage',
    discountTypeLabel: 'Percentage',
    discountValue: 10,
    maxDiscountAmount: 100,
    minBookingAmount: 500,
    startDateTime: '2026-01-01T00:00:00+07:00',
    endDateTime: null,
    usageLimit: 100,
    currentUsage: 3,
    statusCode: 'active',
    statusLabel: 'Active',
    autoApply: false,
    isRoundTrip: false,
    ...overrides,
  };
}

describe('PromotionListTableComponent (logic)', () => {
  function makeComponent(): PromotionListTableComponent {
    return new PromotionListTableComponent();
  }

  it('trackById returns the row id', () => {
    const component = makeComponent();
    expect((component as any).trackById(0, makeRow({ id: 9 }))).toBe(9);
  });

  it('statusClass delegates to the shared mapper', () => {
    const component = makeComponent();
    expect((component as any).statusClass('active')).toBe('is-success');
    expect((component as any).statusClass('inactive')).toBe('is-danger');
  });
});

describe('PromotionListTableComponent (template)', () => {
  let fixture: ComponentFixture<PromotionListTableComponent>;
  let component: PromotionListTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [PromotionListTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PromotionListTableComponent);
    component = fixture.componentInstance;
  });

  it('renders skeleton rows while isLoading is true', () => {
    component.isLoading = true;
    component.rows = [];
    fixture.detectChanges();

    const skeletonRows = fixture.debugElement.queryAll(By.css('tr.admin-skeleton-row'));
    expect(skeletonRows.length).toBe(5);
  });

  it('renders one row per promotion', () => {
    component.isLoading = false;
    component.rows = [makeRow({ id: 1 }), makeRow({ id: 2, code: 'WINTER10' })];
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('tbody tr:not(.admin-empty-row)'));
    expect(rows.length).toBe(2);
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

  it('the round-trip row shows "Managed above" instead of edit/delete actions', () => {
    component.isLoading = false;
    component.rows = [makeRow({ id: 1, slug: 'round_trip', isRoundTrip: true })];
    fixture.detectChanges();

    const actions = fixture.debugElement.query(By.css('tbody .admin-inline-actions'));
    expect(actions).withContext('round-trip row must not render action buttons').toBeNull();
    const managedAbove = fixture.debugElement.query(By.css('tbody .admin-muted'));
    expect(managedAbove).withContext('round-trip row must show "Managed above"').toBeTruthy();
  });

  it('emits edit/deactivate with the promotion row on each action button click', () => {
    component.isLoading = false;
    const row = makeRow();
    component.rows = [row];
    fixture.detectChanges();

    const editSpy = jasmine.createSpy('edit');
    const deactivateSpy = jasmine.createSpy('deactivate');
    component.edit.subscribe(editSpy);
    component.deactivate.subscribe(deactivateSpy);

    const buttons = fixture.debugElement.queryAll(By.css('tbody .admin-icon-btn'));
    expect(buttons.length).toBe(2);
    buttons[0].nativeElement.click();
    buttons[1].nativeElement.click();

    expect(editSpy).toHaveBeenCalledWith(row);
    expect(deactivateSpy).toHaveBeenCalledWith(row);
  });
});


// OBRS-1495: the raw slug column is for platform admins; the parent hands the
// decision down. Both directions are asserted deliberately — a test that only
// proves the column disappears would pass just as happily on a column that
// never renders at all, which is the opposite defect.
describe('PromotionListTableComponent slug column (OBRS-1495)', () => {
  let fixture: ComponentFixture<PromotionListTableComponent>;
  let component: PromotionListTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [PromotionListTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PromotionListTableComponent);
    component = fixture.componentInstance;
    component.isLoading = false;
    component.rows = [makeRow({ slug: 'songkran-2026' })];
  });

  function headerCount(): number {
    return fixture.debugElement.queryAll(By.css('thead th')).length;
  }

  function bodyCellCount(): number {
    return fixture.debugElement.queryAll(By.css('tbody tr:not(.admin-empty-row) td')).length;
  }

  function emptyRowColspan(): string | null {
    return fixture.debugElement
      .query(By.css('tr.admin-empty-row td'))
      .nativeElement.getAttribute('colspan');
  }

  it('keeps the slug header and cell when showSlugColumn is true (admin)', () => {
    component.showSlugColumn = true;
    fixture.detectChanges();

    expect(headerCount()).toBe(7);
    expect(bodyCellCount()).toBe(7);
    expect(fixture.debugElement.nativeElement.textContent).toContain('songkran-2026');
  });

  it('drops the slug header and cell when showSlugColumn is false (owner)', () => {
    component.showSlugColumn = false;
    fixture.detectChanges();

    expect(headerCount()).toBe(6);
    expect(bodyCellCount()).toBe(6);
    expect(fixture.debugElement.nativeElement.textContent).not.toContain('songkran-2026');
  });

  it('narrows the empty-row colspan so the no-data message still spans the table', () => {
    component.rows = [];
    component.hasError = false;

    component.showSlugColumn = true;
    fixture.detectChanges();
    expect(emptyRowColspan()).toBe('7');

    component.showSlugColumn = false;
    fixture.detectChanges();
    expect(emptyRowColspan()).toBe('6');
  });
});
