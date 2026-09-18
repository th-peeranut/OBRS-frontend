import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { DriverCashDaysListComponent } from './driver-cash-days-list.component';
import { DriverCashDaySummaryRespDto } from '../../../../../shared/interfaces/driver-cash.interface';

// OBRS-960 — CORRECTED (2026-08-02, backend reconciliation): the real,
// flat DriverCashDaySummaryRespDto. The first version of this spec used
// `scheduleId`/`routeLabel`/`departureDateTime`/`netCash`/`currency` and
// `status: 'PENDING'` — none of that exists on the real list-row DTO
// (the real open status is `'OPEN'`).
function makeRow(overrides: Partial<DriverCashDaySummaryRespDto> = {}): DriverCashDaySummaryRespDto {
  return {
    dayId: 1,
    driverId: 5,
    driverName: 'Somchai',
    holderRole: 'DRIVER',
    businessDate: '2026-08-01',
    vehicleId: 10,
    vehiclePlate: 'AB-1234',
    status: 'OPEN',
    expectedReturnAmount: '500.00',
    returnedAmount: null,
    discrepancy: null,
    overdueOpen: false,
    hasUnmappedSalesPointRemit: false,
    ...overrides,
  };
}

describe('DriverCashDaysListComponent', () => {
  let fixture: ComponentFixture<DriverCashDaysListComponent>;
  let component: DriverCashDaysListComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [DriverCashDaysListComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(DriverCashDaysListComponent);
    component = fixture.componentInstance;
  });

  it('invalid/error state replaces the table entirely', () => {
    component.contentState = 'error';
    component.message = 'load failed';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('load failed');
  });

  it('shows the unmapped-remit warning icon on a flagged row', () => {
    component.contentState = 'data';
    component.items = [makeRow({ hasUnmappedSalesPointRemit: true })];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="driver-cash-day-unmapped-icon"]')).not.toBeNull();
  });

  it('does not render the warning icon on a clean row', () => {
    component.contentState = 'data';
    component.items = [makeRow({ hasUnmappedSalesPointRemit: false })];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="driver-cash-day-unmapped-icon"]')).toBeNull();
  });

  it('renders the OPEN status chip for an unreturned day', () => {
    component.contentState = 'data';
    component.items = [makeRow({ status: 'OPEN' })];
    fixture.detectChanges();
    const chip = fixture.nativeElement.querySelector('.admin-status.is-warning');
    expect(chip).not.toBeNull();
  });

  it('renders the RETURNED status chip for a returned day', () => {
    component.contentState = 'data';
    component.items = [makeRow({ status: 'RETURNED' })];
    fixture.detectChanges();
    const chip = fixture.nativeElement.querySelector('.admin-status.is-success');
    expect(chip).not.toBeNull();
  });

  // OBRS-1149 — the discrepancy column. `discrepancy` reached this row DTO
  // from the day it existed and nothing rendered it, so a day the owner signed
  // off as short looked exactly like a day that balanced.
  it('renders the signed-off shortfall, and which side it is on, for a RETURNED row', () => {
    component.contentState = 'data';
    component.items = [makeRow({ status: 'RETURNED', returnedAmount: '380.00', discrepancy: '-120.00' })];
    fixture.detectChanges();
    const cell = fixture.nativeElement.querySelector('[data-testid="driver-cash-day-discrepancy-cell"]');
    expect(cell.textContent).toContain('120');
    expect(cell.textContent).toContain('DISCREPANCY_SHORT');
    expect(cell.querySelector('.settlement-nt-negative')).not.toBeNull();
  });

  it('reads a surplus as OVER, not as a bare number', () => {
    component.contentState = 'data';
    component.items = [makeRow({ status: 'RETURNED', returnedAmount: '550.00', discrepancy: '50.00' })];
    fixture.detectChanges();
    const cell = fixture.nativeElement.querySelector('[data-testid="driver-cash-day-discrepancy-cell"]');
    expect(cell.textContent).toContain('DISCREPANCY_OVER');
    expect(cell.querySelector('.settlement-nt-negative')).toBeNull();
  });

  it('leaves the cell empty on a day that balanced', () => {
    component.contentState = 'data';
    component.items = [makeRow({ status: 'RETURNED', returnedAmount: '500.00', discrepancy: '0.00' })];
    fixture.detectChanges();
    const cell = fixture.nativeElement.querySelector('[data-testid="driver-cash-day-discrepancy-cell"]');
    expect(cell.textContent.trim()).toBe('');
  });

  it('leaves the cell empty on a day that is still OPEN', () => {
    component.contentState = 'data';
    component.items = [makeRow({ status: 'OPEN', discrepancy: null })];
    fixture.detectChanges();
    const cell = fixture.nativeElement.querySelector('[data-testid="driver-cash-day-discrepancy-cell"]');
    expect(cell.textContent.trim()).toBe('');
  });

  it('emits rowClick with the dayId on the View button', () => {
    component.contentState = 'data';
    component.items = [makeRow({ dayId: 7, status: 'RETURNED' })];
    fixture.detectChanges();
    const spy = jasmine.createSpy('rowClick');
    component.rowClick.subscribe(spy);

    fixture.nativeElement.querySelector('.admin-btn-small').click();

    expect(spy).toHaveBeenCalledWith(7);
  });
});
