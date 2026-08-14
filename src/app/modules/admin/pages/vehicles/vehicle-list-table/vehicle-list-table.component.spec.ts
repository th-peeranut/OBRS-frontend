import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { VehicleListTableComponent } from './vehicle-list-table.component';
import { VehicleRow } from '../vehicles-page.mappers';

function makeRow(overrides: Partial<VehicleRow> = {}): VehicleRow {
  return {
    id: 1,
    vehicleTypeSlug: 'van',
    statusCode: 'active',
    vehicleNumber: 'V1',
    plate: 'ABC-123',
    rawVehicleNumber: 'V1',
    rawPlate: 'ABC-123',
    vehicleType: 'Van',
    route: '-',
    status: 'Active',
    ...overrides,
  };
}

describe('VehicleListTableComponent (logic)', () => {
  function makeComponent(): VehicleListTableComponent {
    return new VehicleListTableComponent();
  }

  it('trackById returns the row id', () => {
    const component = makeComponent();
    expect((component as any).trackById(0, makeRow({ id: 9 }))).toBe(9);
  });

  it('statusClass delegates to the shared mapper', () => {
    const component = makeComponent();
    expect((component as any).statusClass('active')).toBe('is-success');
    expect((component as any).statusClass('pending')).toBe('is-warning');
  });
});

describe('VehicleListTableComponent (template)', () => {
  let fixture: ComponentFixture<VehicleListTableComponent>;
  let component: VehicleListTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [VehicleListTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VehicleListTableComponent);
    component = fixture.componentInstance;
  });

  it('renders skeleton rows while isLoading is true', () => {
    component.isLoading = true;
    component.rows = [];
    fixture.detectChanges();

    const skeletonRows = fixture.debugElement.queryAll(By.css('tr.admin-skeleton-row'));
    expect(skeletonRows.length).toBe(5);
  });

  it('renders one row per vehicle', () => {
    component.isLoading = false;
    component.rows = [makeRow({ id: 1 }), makeRow({ id: 2, vehicleNumber: 'V2' })];
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

  it('shows "Showing X-Y of totalCount" using the unfiltered total, not rows.length', () => {
    component.isLoading = false;
    component.rows = [makeRow({ id: 1 })];
    component.totalCount = 5;
    fixture.detectChanges();

    const footer = fixture.debugElement.query(By.css('.admin-table-footer span'));
    expect(footer.nativeElement.textContent).toContain('5');
  });

  it('emits edit/delete/manageMaintenance/managePlans/viewInspections with the vehicle row on each action button click', () => {
    component.isLoading = false;
    const row = makeRow();
    component.rows = [row];
    fixture.detectChanges();

    const manageMaintenanceSpy = jasmine.createSpy('manageMaintenance');
    const managePlansSpy = jasmine.createSpy('managePlans');
    const viewInspectionsSpy = jasmine.createSpy('viewInspections');
    const editSpy = jasmine.createSpy('edit');
    const deleteSpy = jasmine.createSpy('delete');
    component.manageMaintenance.subscribe(manageMaintenanceSpy);
    component.managePlans.subscribe(managePlansSpy);
    component.viewInspections.subscribe(viewInspectionsSpy);
    component.edit.subscribe(editSpy);
    component.delete.subscribe(deleteSpy);

    const buttons = fixture.debugElement.queryAll(By.css('tbody .admin-icon-btn'));
    expect(buttons.length).toBe(5);
    buttons[0].nativeElement.click(); // manage maintenance
    buttons[1].nativeElement.click(); // manage plans
    buttons[2].nativeElement.click(); // view inspections
    buttons[3].nativeElement.click(); // edit
    buttons[4].nativeElement.click(); // delete

    expect(manageMaintenanceSpy).toHaveBeenCalledWith(row);
    expect(managePlansSpy).toHaveBeenCalledWith(row);
    expect(viewInspectionsSpy).toHaveBeenCalledWith(row);
    expect(editSpy).toHaveBeenCalledWith(row);
    expect(deleteSpy).toHaveBeenCalledWith(row);
  });
});
