import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { DriverCashDaySummaryComponent } from './driver-cash-day-summary.component';
import { DriverCashDayRespDto } from '../../../../../shared/interfaces/driver-cash.interface';

// OBRS-960 — the real, flat DriverCashDayRespDto (corrected 2026-08-02).
function makeDay(overrides: Partial<DriverCashDayRespDto> = {}): DriverCashDayRespDto {
  return {
    dayId: 1,
    driverId: 5,
    driverName: 'Somchai',
    businessDate: '2026-08-01',
    vehicleId: 10,
    status: 'OPEN',
    entries: [],
    advanceTotal: '100.00',
    perHeadTotal: '200.00',
    expensePaidTotal: '50.00',
    parcelRemitTotal: '30.00',
    expectedReturnAmount: '250.00',
    returnedAmount: null,
    returnedAt: null,
    returnedByUserId: null,
    returnedByName: null,
    discrepancy: null,
    discrepancyReason: null,
    perHeadRates: [],
    hasUnmappedSalesPointRemit: false,
    ...overrides,
  };
}

describe('DriverCashDaySummaryComponent', () => {
  let fixture: ComponentFixture<DriverCashDaySummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [DriverCashDaySummaryComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(DriverCashDaySummaryComponent);
  });

  it('renders a skeleton while loading with no day yet', () => {
    fixture.componentInstance.isLoading = true;
    fixture.componentInstance.day = null;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.dcp-summary-skeleton')).not.toBeNull();
  });

  it('renders the running totals directly off the flat day DTO, including expected-return as "net"', () => {
    fixture.componentInstance.day = makeDay();
    fixture.detectChanges();

    const net = fixture.nativeElement.querySelector('[data-testid="driver-cash-net"]');
    expect(net.textContent).toContain('250.00');
  });

  it('renders parcelRemitTotal (the field the first version of this component never showed)', () => {
    fixture.componentInstance.day = makeDay({ parcelRemitTotal: '30.00' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('30.00');
  });
});
