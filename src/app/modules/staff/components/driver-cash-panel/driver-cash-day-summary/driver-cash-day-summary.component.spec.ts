import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { DriverCashDaySummaryComponent } from './driver-cash-day-summary.component';

describe('DriverCashDaySummaryComponent', () => {
  let fixture: ComponentFixture<DriverCashDaySummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [DriverCashDaySummaryComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(DriverCashDaySummaryComponent);
  });

  it('renders a skeleton while loading with no summary yet', () => {
    fixture.componentInstance.isLoading = true;
    fixture.componentInstance.summary = null;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.dcp-summary-skeleton')).not.toBeNull();
  });

  it('renders the running totals, including net cash', () => {
    fixture.componentInstance.summary = {
      advanceTotal: '100.00',
      perHeadTotal: '200.00',
      expenseTotal: '50.00',
      netCash: '250.00',
    };
    fixture.detectChanges();

    const net = fixture.nativeElement.querySelector('[data-testid="driver-cash-net"]');
    expect(net.textContent).toContain('250.00');
  });
});
