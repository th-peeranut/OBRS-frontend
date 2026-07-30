import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { RevenueAnalyticsPageComponent } from './revenue-analytics-page.component';
import { RevenueAnalyticsStore } from './revenue-analytics.store';
import { RevenueAnalyticsDto } from '../../../../shared/interfaces/revenue-analytics.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminSharedModule } from '../../admin-shared.module';

function makeAnalytics(overrides: Partial<RevenueAnalyticsDto> = {}): RevenueAnalyticsDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-03', timezone: 'Asia/Bangkok' },
    totals: { net: '300.00', paid: '400.00', refunded: '100.00', currency: 'THB' },
    previousPeriod: {
      range: { from: '2026-06-28', to: '2026-06-30', timezone: 'Asia/Bangkok' },
      totals: { net: '200.00', paid: '200.00', refunded: '0.00', currency: 'THB' },
      netChangePct: 50.0,
    },
    dailyTrend: [
      { date: '2026-07-01', net: '100.00', paid: '100.00', refunded: '0.00', currency: 'THB', netBarPct: 50 },
      { date: '2026-07-02', net: '0.00', paid: '0.00', refunded: '0.00', currency: 'THB', netBarPct: 0 },
      { date: '2026-07-03', net: '200.00', paid: '300.00', refunded: '100.00', currency: 'THB', netBarPct: 100 },
    ],
    ...overrides,
  };
}

function makeStoreStub(data: RevenueAnalyticsDto | null, range = { from: '2026-07-01', to: '2026-07-03' }) {
  return {
    data$: new BehaviorSubject<RevenueAnalyticsDto | null>(data),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    range,
    lastErrorCode: null as string | null,
    hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setRange: jasmine.createSpy('setRange'),
  };
}

describe('RevenueAnalyticsPageComponent', () => {
  it('should create and seed the date pickers from the store range', () => {
    const store = makeStoreStub(null, { from: '2026-06-01', to: '2026-06-07' });
    const component = new RevenueAnalyticsPageComponent(store as unknown as RevenueAnalyticsStore, createTranslateStub());
    component.ngOnInit();

    expect(component).toBeTruthy();
    expect(component['fromDate']).toEqual(new Date(2026, 5, 1));
    expect(component['toDate']).toEqual(new Date(2026, 5, 7));
    expect(store.refresh).toHaveBeenCalled();
  });

  it('exposes totals / previousPeriod / trend from the store data', () => {
    const store = makeStoreStub(makeAnalytics());
    const component = new RevenueAnalyticsPageComponent(store as unknown as RevenueAnalyticsStore, createTranslateStub());
    component.ngOnInit();

    expect(component['totals']?.net).toBe('300.00');
    expect(component['previousPeriod']?.netChangePct).toBe(50);
    expect(component['trend'].length).toBe(3);
  });

  describe('period-over-period delta', () => {
    function componentWith(pct: number | null): RevenueAnalyticsPageComponent {
      const store = makeStoreStub(makeAnalytics({
        previousPeriod: {
          range: { from: '2026-06-28', to: '2026-06-30', timezone: 'Asia/Bangkok' },
          totals: { net: '0.00', paid: '0.00', refunded: '0.00', currency: 'THB' },
          netChangePct: pct,
        },
      }));
      const component = new RevenueAnalyticsPageComponent(store as unknown as RevenueAnalyticsStore, createTranslateStub());
      component.ngOnInit();
      return component;
    }

    it('is "up" and prefixes + for a positive change', () => {
      const component = componentWith(12.4);
      expect(component['changeDirection']).toBe('up');
      expect(component['changePctDisplay'](12.4)).toBe('+12.4%');
    });

    it('is "down" for a negative change', () => {
      const component = componentWith(-8);
      expect(component['changeDirection']).toBe('down');
      expect(component['changePctDisplay'](-8)).toBe('-8.0%');
    });

    it('is "flat" when the change is null (no previous-period revenue)', () => {
      const component = componentWith(null);
      expect(component['changeDirection']).toBe('flat');
      expect(component['changePct']).toBeNull();
    });
  });

  it('sizes the trend bar straight from the server netBarPct, clamped to 0–100', () => {
    const store = makeStoreStub(makeAnalytics());
    const component = new RevenueAnalyticsPageComponent(store as unknown as RevenueAnalyticsStore, createTranslateStub());
    expect(component['barHeightPct']({ netBarPct: 50 } as never)).toBe(50);
    expect(component['barHeightPct']({ netBarPct: 140 } as never)).toBe(100);
    expect(component['barHeightPct']({ netBarPct: -5 } as never)).toBe(0);
  });

  describe('range guard (never dispatches an invalid range to the store)', () => {
    it('from after to sets rangeError and does not call setRange', () => {
      const store = makeStoreStub(makeAnalytics());
      const component = new RevenueAnalyticsPageComponent(store as unknown as RevenueAnalyticsStore, createTranslateStub());
      component.ngOnInit();
      store.setRange.calls.reset();

      component['fromDate'] = new Date(2026, 6, 10);
      component['toDate'] = new Date(2026, 6, 1);
      component['onFromDateChange'](component['fromDate']);

      expect(component['rangeError']).toBeTruthy();
      expect(store.setRange).not.toHaveBeenCalled();
      expect(component['contentState']).toBe('invalid');
    });

    it('a valid range dispatches setRange with yyyy-MM-dd strings', () => {
      const store = makeStoreStub(makeAnalytics());
      const component = new RevenueAnalyticsPageComponent(store as unknown as RevenueAnalyticsStore, createTranslateStub());
      component.ngOnInit();
      store.setRange.calls.reset();

      component['fromDate'] = new Date(2026, 6, 1);
      component['toDate'] = new Date(2026, 6, 5);
      component['onToDateChange'](component['toDate']);

      expect(component['rangeError']).toBe('');
      expect(store.setRange).toHaveBeenCalledOnceWith('2026-07-01', '2026-07-05');
    });
  });

  describe('DOM render', () => {
    let fixture: ComponentFixture<RevenueAnalyticsPageComponent>;
    let store: ReturnType<typeof makeStoreStub>;

    beforeEach(async () => {
      store = makeStoreStub(makeAnalytics());
      await TestBed.configureTestingModule({
        declarations: [RevenueAnalyticsPageComponent],
        imports: [CommonModule, FormsModule, DatePickerModule, AdminSharedModule, TranslateModule.forRoot()],
        providers: [{ provide: RevenueAnalyticsStore, useValue: store }],
      }).compileComponents();
      fixture = TestBed.createComponent(RevenueAnalyticsPageComponent);
      fixture.detectChanges();
    });

    it('renders one trend bar per day, sized from netBarPct', () => {
      const bars: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.ra-bar'));
      expect(bars.length).toBe(3);
      expect(bars[0].style.height).toBe('50%');
      expect(bars[1].style.height).toBe('0%');
      expect(bars[2].style.height).toBe('100%');
    });

    it('renders the three revenue KPI tiles and an up delta chip', () => {
      expect(fixture.nativeElement.querySelectorAll('.admin-kpi').length).toBe(3);
      const delta: HTMLElement = fixture.nativeElement.querySelector('.ra-delta');
      expect(delta).not.toBeNull();
      expect(delta.classList).toContain('is-up');
      expect(delta.textContent).toContain('+50.0%');
    });
  });
});
