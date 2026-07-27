import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { CalendarModule } from 'primeng/calendar';
import { OpsEfficiencyPageComponent } from './ops-efficiency-page.component';
import { OpsEfficiencyStore } from './ops-efficiency.store';
import { OpsEfficiencyDto } from '../../../../shared/interfaces/ops-efficiency.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminSharedModule } from '../../admin-shared.module';

function makeData(overrides: Partial<OpsEfficiencyDto> = {}): OpsEfficiencyDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    departures: { scheduled: 4, completed: 3, cancelled: 1, completionRatePct: 75.0 },
    seatUtilization: { seatsSold: 48, seatCapacity: 70, fillRatePct: 68.6 },
    byVehicleType: [
      { vehicleType: 'van', departures: 3, seatsSold: 18, seatCapacity: 30, fillRatePct: 60.0, departuresSharePct: 75.0 },
      { vehicleType: 'bus', departures: 1, seatsSold: 30, seatCapacity: 40, fillRatePct: 75.0, departuresSharePct: 25.0 },
    ],
    ...overrides,
  };
}
function makeStoreStub(data: OpsEfficiencyDto | null, range = { from: '2026-07-01', to: '2026-07-07' }) {
  return {
    data$: new BehaviorSubject<OpsEfficiencyDto | null>(data),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    range, lastErrorCode: null as string | null, hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setRange: jasmine.createSpy('setRange'),
  };
}

describe('OpsEfficiencyPageComponent', () => {
  it('creates, refreshes, exposes departures/seat/rows', () => {
    const store = makeStoreStub(makeData());
    const c = new OpsEfficiencyPageComponent(store as unknown as OpsEfficiencyStore, createTranslateStub());
    c.ngOnInit();
    expect(store.refresh).toHaveBeenCalled();
    expect(c['departures']?.completionRatePct).toBe(75);
    expect(c['seat']?.fillRatePct).toBe(68.6);
    expect(c['rows'].length).toBe(2);
  });

  it('clamps the fill bar and formats pct', () => {
    const store = makeStoreStub(makeData());
    const c = new OpsEfficiencyPageComponent(store as unknown as OpsEfficiencyStore, createTranslateStub());
    expect(c['barPct'](60)).toBe(60);
    expect(c['barPct'](180)).toBe(100);
    expect(c['barPct'](-4)).toBe(0);
    expect(c['pctDisplay'](75)).toBe('75.0%');
  });

  it('guards an invalid range and dispatches a valid one', () => {
    const store = makeStoreStub(makeData());
    const c = new OpsEfficiencyPageComponent(store as unknown as OpsEfficiencyStore, createTranslateStub());
    c.ngOnInit(); store.setRange.calls.reset();
    c['fromDate'] = new Date(2026, 6, 10); c['toDate'] = new Date(2026, 6, 1);
    c['onFromDateChange'](c['fromDate']);
    expect(c['rangeError']).toBeTruthy();
    expect(store.setRange).not.toHaveBeenCalled();
    c['rangeError'] = ''; c['fromDate'] = new Date(2026, 6, 1); c['toDate'] = new Date(2026, 6, 5);
    c['onToDateChange'](c['toDate']);
    expect(store.setRange).toHaveBeenCalledOnceWith('2026-07-01', '2026-07-05');
  });

  describe('DOM render', () => {
    let fixture: ComponentFixture<OpsEfficiencyPageComponent>;
    beforeEach(async () => {
      const store = makeStoreStub(makeData());
      await TestBed.configureTestingModule({
        declarations: [OpsEfficiencyPageComponent],
        imports: [CommonModule, FormsModule, CalendarModule, AdminSharedModule, TranslateModule.forRoot()],
        providers: [{ provide: OpsEfficiencyStore, useValue: store }],
      }).compileComponents();
      fixture = TestBed.createComponent(OpsEfficiencyPageComponent);
      fixture.detectChanges();
    });
    it('renders 4 tiles + one fill bar per vehicle type', () => {
      expect(fixture.nativeElement.querySelectorAll('.admin-kpi').length).toBe(4);
      const bars: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.oe-bar'));
      expect(bars.length).toBe(2);
      expect(bars[0].style.width).toBe('60%');
      expect(bars[1].style.width).toBe('75%');
    });
  });
});
