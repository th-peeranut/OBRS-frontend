import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { CalendarModule } from 'primeng/calendar';
import { BookingTrendPageComponent } from './booking-trend-page.component';
import { BookingTrendStore } from './booking-trend.store';
import { BookingTrendDto } from '../../../../shared/interfaces/booking-trend.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminSharedModule } from '../../admin-shared.module';

function dow(d: number, bookingCount: number, sharePct: number) {
  return { dow: d, bookingCount, sharePct };
}

function makeTrend(overrides: Partial<BookingTrendDto> = {}): BookingTrendDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-03', timezone: 'Asia/Bangkok' },
    series: [
      { date: '2026-07-01', bookingCount: 4, ticketsSold: 5, movingAvg7: 4, barPct: 50 },
      { date: '2026-07-02', bookingCount: 0, ticketsSold: 0, movingAvg7: 2, barPct: 0 },
      { date: '2026-07-03', bookingCount: 8, ticketsSold: 10, movingAvg7: 4, barPct: 100 },
    ],
    previousPeriod: {
      range: { from: '2026-06-28', to: '2026-06-30', timezone: 'Asia/Bangkok' },
      totalBookings: 6,
      changePct: 100,
    },
    byDayOfWeek: [dow(1, 0, 0), dow(2, 0, 0), dow(3, 4, 33.3), dow(4, 0, 0), dow(5, 8, 66.7), dow(6, 0, 0), dow(7, 0, 0)],
    peak: { date: '2026-07-03', bookingCount: 8 },
    ...overrides,
  };
}

function makeStoreStub(data: BookingTrendDto | null, range = { from: '2026-07-01', to: '2026-07-03' }) {
  return {
    data$: new BehaviorSubject<BookingTrendDto | null>(data),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    range,
    lastErrorCode: null as string | null,
    hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setRange: jasmine.createSpy('setRange'),
  };
}

describe('BookingTrendPageComponent', () => {
  it('creates, seeds the date pickers, and refreshes', () => {
    const store = makeStoreStub(null, { from: '2026-06-01', to: '2026-06-07' });
    const component = new BookingTrendPageComponent(store as unknown as BookingTrendStore, createTranslateStub());
    component.ngOnInit();
    expect(component['fromDate']).toEqual(new Date(2026, 5, 1));
    expect(store.refresh).toHaveBeenCalled();
  });

  it('derives the range total from the integer series and exposes peak/previousPeriod', () => {
    const store = makeStoreStub(makeTrend());
    const component = new BookingTrendPageComponent(store as unknown as BookingTrendStore, createTranslateStub());
    component.ngOnInit();
    expect(component['totalBookings']).toBe(12);
    expect(component['peak']?.bookingCount).toBe(8);
    expect(component['previousPeriod']?.totalBookings).toBe(6);
  });

  it('reports the period-over-period direction and formats the change', () => {
    const store = makeStoreStub(makeTrend());
    const component = new BookingTrendPageComponent(store as unknown as BookingTrendStore, createTranslateStub());
    component.ngOnInit();
    expect(component['changeDirection']).toBe('up');
    expect(component['changePctDisplay'](100)).toBe('+100.0%');
    expect(component['changePctDisplay'](-5)).toBe('-5.0%');
  });

  it('sizes daily bars from server barPct and day-of-week bars relative to the busiest weekday', () => {
    const store = makeStoreStub(makeTrend());
    const component = new BookingTrendPageComponent(store as unknown as BookingTrendStore, createTranslateStub());
    component.ngOnInit();
    expect(component['barHeightPct']({ barPct: 100 } as never)).toBe(100);
    expect(component['barHeightPct']({ barPct: 200 } as never)).toBe(100);
    // busiest weekday share is 66.7 → its bar is 100%, the 33.3 weekday ≈ 50%.
    expect(component['dowBarHeightPct'](dow(5, 8, 66.7))).toBe(100);
    expect(Math.round(component['dowBarHeightPct'](dow(3, 4, 33.3)))).toBe(50);
  });

  it('guards an invalid range and dispatches a valid one', () => {
    const store = makeStoreStub(makeTrend());
    const component = new BookingTrendPageComponent(store as unknown as BookingTrendStore, createTranslateStub());
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
    let fixture: ComponentFixture<BookingTrendPageComponent>;

    beforeEach(async () => {
      const store = makeStoreStub(makeTrend());
      await TestBed.configureTestingModule({
        declarations: [BookingTrendPageComponent],
        imports: [CommonModule, FormsModule, CalendarModule, AdminSharedModule, TranslateModule.forRoot()],
        providers: [{ provide: BookingTrendStore, useValue: store }],
      }).compileComponents();
      fixture = TestBed.createComponent(BookingTrendPageComponent);
      fixture.detectChanges();
    });

    it('renders one daily bar per series point, seven day-of-week bars, and an up delta chip', () => {
      const daily: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.bt-bar:not(.bt-bar--dow)'));
      const dowBars: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.bt-bar--dow'));
      expect(daily.length).toBe(3);
      expect(daily[0].style.height).toBe('50%');
      expect(daily[2].style.height).toBe('100%');
      expect(dowBars.length).toBe(7);
      const delta: HTMLElement = fixture.nativeElement.querySelector('.bt-delta');
      expect(delta.classList).toContain('is-up');
      expect(delta.textContent).toContain('+100.0%');
    });
  });
});
