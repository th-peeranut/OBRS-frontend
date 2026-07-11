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
