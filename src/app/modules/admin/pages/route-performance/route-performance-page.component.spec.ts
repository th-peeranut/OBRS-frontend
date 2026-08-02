import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DatePickerModule } from 'primeng/datepicker';
import { RoutePerformancePageComponent } from './route-performance-page.component';
import { RoutePerformanceStore } from './route-performance.store';
import { RoutePerformanceDto } from '../../../../shared/interfaces/route-performance.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminSharedModule } from '../../admin-shared.module';

function makeData(overrides: Partial<RoutePerformanceDto> = {}): RoutePerformanceDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    routes: [
      { routeId: 3, routeSlug: 'bkk-cnx', departures: 2, ticketsSold: 5, netRevenue: '500.00', currency: 'THB', revenueSharePct: 62.5 },
      { routeId: 7, routeSlug: 'bkk-hdy', departures: 1, ticketsSold: 2, netRevenue: '300.00', currency: 'THB', revenueSharePct: 37.5 },
    ],
    totals: { departures: 3, ticketsSold: 7, netRevenue: '800.00', currency: 'THB' },
    ...overrides,
  };
}

function makeStoreStub(data: RoutePerformanceDto | null, range = { from: '2026-07-01', to: '2026-07-07' }) {
  return {
    data$: new BehaviorSubject<RoutePerformanceDto | null>(data),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    range,
    lastErrorCode: null as string | null,
    hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setRange: jasmine.createSpy('setRange'),
  };
}

describe('RoutePerformancePageComponent', () => {
  it('creates, seeds pickers, refreshes, and exposes routes/totals', () => {
    const store = makeStoreStub(makeData(), { from: '2026-06-01', to: '2026-06-07' });
    const component = new RoutePerformancePageComponent(store as unknown as RoutePerformanceStore, createTranslateStub());
    component.ngOnInit();
    expect(component['fromDate']).toEqual(new Date(2026, 5, 1));
    expect(store.refresh).toHaveBeenCalled();
    expect(component['routes'].length).toBe(2);
    expect(component['totals']?.ticketsSold).toBe(7);
  });

  it('clamps the revenue-share bar width to the server pct', () => {
    const store = makeStoreStub(makeData());
    const component = new RoutePerformancePageComponent(store as unknown as RoutePerformanceStore, createTranslateStub());
    expect(component['shareBarPct']({ revenueSharePct: 62.5 } as never)).toBe(62.5);
    expect(component['shareBarPct']({ revenueSharePct: 140 } as never)).toBe(100);
    expect(component['shareBarPct']({ revenueSharePct: -3 } as never)).toBe(0);
    expect(component['sharePctDisplay'](62.5)).toBe('62.5%');
  });

  it('guards an invalid range and dispatches a valid one', () => {
    const store = makeStoreStub(makeData());
    const component = new RoutePerformancePageComponent(store as unknown as RoutePerformanceStore, createTranslateStub());
    component.ngOnInit();
    store.setRange.calls.reset();
    component['fromDate'] = new Date(2026, 6, 10);
    component['toDate'] = new Date(2026, 6, 1);
    component['onFromDateChange'](component['fromDate']);
    expect(component['rangeError']).toBeTruthy();
    expect(store.setRange).not.toHaveBeenCalled();
    component['rangeError'] = '';
    component['fromDate'] = new Date(2026, 6, 1);
    component['toDate'] = new Date(2026, 6, 5);
    component['onToDateChange'](component['toDate']);
    expect(store.setRange).toHaveBeenCalledOnceWith('2026-07-01', '2026-07-05');
  });

  describe('DOM render', () => {
    let fixture: ComponentFixture<RoutePerformancePageComponent>;
    beforeEach(async () => {
      const store = makeStoreStub(makeData());
      await TestBed.configureTestingModule({
        declarations: [RoutePerformancePageComponent],
        imports: [CommonModule, FormsModule, DatePickerModule, AdminSharedModule, TranslateModule.forRoot()],
        providers: [{ provide: RoutePerformanceStore, useValue: store }],
      }).compileComponents();
      fixture = TestBed.createComponent(RoutePerformancePageComponent);
      fixture.detectChanges();
    });

    it('renders one table row per route with a revenue-share bar sized from the server pct', () => {
      const rows: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('tr.zebra, tbody tr:not(.admin-skeleton-row):not(.admin-empty-row)'));
      const bars: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.rp-share-bar'));
      expect(bars.length).toBe(2);
      expect(bars[0].style.width).toBe('62.5%');
      expect(bars[1].style.width).toBe('37.5%');
      expect(fixture.nativeElement.querySelectorAll('.admin-kpi').length).toBe(3);
    });
  });
});
