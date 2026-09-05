import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { RouteListTableComponent } from './route-list-table.component';
import { AdminSharedModule } from '../../../admin-shared.module';
import { RouteRow } from '../routes.mappers';

function makeRoute(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id: 1,
    slug: 'a-b',
    label: 'A to B',
    description: 'Route A to B',
    status: 'ACTIVE',
    statusCode: 'active',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('RouteListTableComponent (logic)', () => {
  function makeComponent(): RouteListTableComponent {
    return new RouteListTableComponent();
  }

  it('trackByRouteId returns the route id', () => {
    const component = makeComponent();
    expect((component as any).trackByRouteId(0, makeRoute({ id: 9 }))).toBe(9);
  });

  it('skeletonRows has 5 placeholder entries', () => {
    const component = makeComponent();
    expect((component as any).skeletonRows.length).toBe(5);
  });

  it('statusClass delegates to the shared mapper', () => {
    const component = makeComponent();
    expect((component as any).statusClass('ACTIVE')).toBe('is-success');
    expect((component as any).statusClass('SUSPENDED')).toBe('is-warning');
    expect((component as any).statusClass('DECOMMISSIONED')).toBe('is-danger');
  });
});

describe('RouteListTableComponent (template)', () => {
  let fixture: ComponentFixture<RouteListTableComponent>;
  let component: RouteListTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), AdminSharedModule],
      declarations: [RouteListTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RouteListTableComponent);
    component = fixture.componentInstance;
  });

  it('renders skeleton rows while isLoading is true', () => {
    component.isLoading = true;
    component.routes = [];
    fixture.detectChanges();

    const skeletonRows = fixture.debugElement.queryAll(By.css('tr.admin-skeleton-row'));
    expect(skeletonRows.length).toBe(5);
  });

  it('renders one row per route, with the selected route highlighted', () => {
    component.isLoading = false;
    component.routes = [makeRoute({ id: 1, slug: 'a-b' }), makeRoute({ id: 2, slug: 'c-d' })];
    component.selectedRouteSlug = 'c-d';
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('tbody tr:not(.admin-empty-row)'));
    expect(rows.length).toBe(2);
    expect(rows[1].nativeElement.classList.contains('is-selected')).toBeTrue();
    expect(rows[0].nativeElement.classList.contains('is-selected')).toBeFalse();
  });

  it('renders the empty row when routes is empty and there is no error', () => {
    component.isLoading = false;
    component.routes = [];
    component.hasError = false;
    fixture.detectChanges();

    const emptyRow = fixture.debugElement.query(By.css('tr.admin-empty-row'));
    expect(emptyRow).withContext('empty row should render').toBeTruthy();
  });

  it('does not render the empty row when routes is empty but hasError is true', () => {
    component.isLoading = false;
    component.routes = [];
    component.hasError = true;
    fixture.detectChanges();

    const emptyRow = fixture.debugElement.query(By.css('tr.admin-empty-row'));
    expect(emptyRow).withContext('empty row should not render on error').toBeNull();
  });

  it('emits view/edit/delete with the route row on each action button click', () => {
    component.isLoading = false;
    const route = makeRoute();
    component.routes = [route];
    fixture.detectChanges();

    const viewSpy = jasmine.createSpy('view');
    const editSpy = jasmine.createSpy('edit');
    const deleteSpy = jasmine.createSpy('delete');
    component.view.subscribe(viewSpy);
    component.edit.subscribe(editSpy);
    component.delete.subscribe(deleteSpy);

    const buttons = fixture.debugElement.queryAll(By.css('tbody .admin-icon-btn'));
    expect(buttons.length).toBe(3);
    buttons[0].nativeElement.click();
    buttons[1].nativeElement.click();
    buttons[2].nativeElement.click();

    expect(viewSpy).toHaveBeenCalledWith(route);
    expect(editSpy).toHaveBeenCalledWith(route);
    expect(deleteSpy).toHaveBeenCalledWith(route);
  });

  // OBRS-891 whole-row click. The guard cases matter more than the happy path:
  // the row handler sits on the same element the action buttons bubble through,
  // so a broken guard means an Edit click also fires `view`, and a text
  // selection inside a row silently switches the detail panels.
  describe('whole-row click (OBRS-891)', () => {
    function setUpRows(selection = ''): { route: RouteRow; viewSpy: jasmine.Spy } {
      spyOn(window, 'getSelection').and.returnValue({
        toString: () => selection,
      } as unknown as Selection);

      component.isLoading = false;
      const route = makeRoute({ id: 7, slug: 'e-f', label: 'E to F' });
      component.routes = [route];
      fixture.detectChanges();

      const viewSpy = jasmine.createSpy('view');
      component.view.subscribe(viewSpy);
      return { route, viewSpy };
    }

    // AC 1
    it('emits view with the row when a non-interactive cell is clicked', () => {
      const { route, viewSpy } = setUpRows();

      const cell = fixture.debugElement.query(By.css('tbody tr.route-row td'));
      cell.nativeElement.click();

      expect(viewSpy).toHaveBeenCalledOnceWith(route);
    });

    // AC 2 — the View button and the row handler share one bubble path, so a
    // missing guard shows up as a DOUBLE emit rather than as no emit at all.
    it('emits view exactly once when the View icon itself is clicked', () => {
      const { route, viewSpy } = setUpRows();

      const buttons = fixture.debugElement.queryAll(By.css('tbody .admin-icon-btn'));
      buttons[0].nativeElement.click();

      expect(viewSpy).toHaveBeenCalledOnceWith(route);
    });

    // AC 2 — clicking the icon glyph, not the button box: `event.target` is the
    // inner <span>, which only `closest('button')` catches.
    it('does not emit view when the Edit or Delete glyph inside the button is clicked', () => {
      const { viewSpy } = setUpRows();
      const editSpy = jasmine.createSpy('edit');
      const deleteSpy = jasmine.createSpy('delete');
      component.edit.subscribe(editSpy);
      component.delete.subscribe(deleteSpy);

      const glyphs = fixture.debugElement.queryAll(
        By.css('tbody .admin-icon-btn .material-symbols-outlined'),
      );
      glyphs[1].nativeElement.click();
      glyphs[2].nativeElement.click();

      expect(editSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(viewSpy).not.toHaveBeenCalled();
    });

    // AC 3
    it('does not emit view when the click ends a text selection in the row', () => {
      const { viewSpy } = setUpRows('E to F');

      const cell = fixture.debugElement.query(By.css('tbody tr.route-row td'));
      cell.nativeElement.click();

      expect(viewSpy).not.toHaveBeenCalled();
    });

    // AC 4 — the row is mouse-only (no role/tabindex/keydown), so the button
    // must stay: it is the keyboard and screen-reader entry point.
    it('keeps the View button as a focusable button with an accessible label', () => {
      setUpRows();

      const viewButton = fixture.debugElement.queryAll(By.css('tbody .admin-icon-btn'))[0]
        .nativeElement as HTMLButtonElement;
      expect(viewButton.tagName).toBe('BUTTON');
      expect(viewButton.disabled).toBeFalse();
      expect(viewButton.getAttribute('aria-label')).toBeTruthy();
    });

    it('puts the clickable row class on data rows only, not the skeleton or empty row', () => {
      component.isLoading = true;
      component.routes = [];
      fixture.detectChanges();
      expect(fixture.debugElement.queryAll(By.css('tbody tr.route-row')).length).toBe(0);

      component.isLoading = false;
      component.hasError = false;
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('tr.admin-empty-row')).nativeElement.classList)
        .not.toContain('route-row');
    });
  });

  it('footer shows "0 - N" when totalCount is 0, otherwise "1 - N" of totalCount', () => {
    component.isLoading = false;
    component.routes = [];
    component.totalCount = 0;
    fixture.detectChanges();

    let footer = fixture.debugElement.query(By.css('.admin-table-footer span'));
    expect(footer.nativeElement.textContent).toContain('0');

    component.routes = [makeRoute({ id: 1 }), makeRoute({ id: 2 })];
    component.totalCount = 5;
    fixture.detectChanges();

    footer = fixture.debugElement.query(By.css('.admin-table-footer span'));
    const text: string = footer.nativeElement.textContent;
    expect(text).toContain('1');
    expect(text).toContain('2');
    expect(text).toContain('5');
  });
});


// OBRS-1495: the raw slug column is for platform admins; the parent hands the
// decision down. Both directions are asserted deliberately — a test that only
// proves the column disappears would pass just as happily on a column that
// never renders at all, which is the opposite defect.
describe('RouteListTableComponent slug column (OBRS-1495)', () => {
  let fixture: ComponentFixture<RouteListTableComponent>;
  let component: RouteListTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), AdminSharedModule],
      declarations: [RouteListTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RouteListTableComponent);
    component = fixture.componentInstance;
    component.isLoading = false;
    component.routes = [makeRoute({ slug: 'nongchak-bangkok' })];
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

    expect(headerCount()).toBe(5);
    expect(bodyCellCount()).toBe(5);
    expect(fixture.debugElement.nativeElement.textContent).toContain('nongchak-bangkok');
  });

  it('drops the slug header and cell when showSlugColumn is false (owner)', () => {
    component.showSlugColumn = false;
    fixture.detectChanges();

    expect(headerCount()).toBe(4);
    expect(bodyCellCount()).toBe(4);
    expect(fixture.debugElement.nativeElement.textContent).not.toContain('nongchak-bangkok');
  });

  it('narrows the empty-row colspan so the no-data message still spans the table', () => {
    component.routes = [];
    component.hasError = false;

    component.showSlugColumn = true;
    fixture.detectChanges();
    expect(emptyRowColspan()).toBe('5');

    component.showSlugColumn = false;
    fixture.detectChanges();
    expect(emptyRowColspan()).toBe('4');
  });
});
