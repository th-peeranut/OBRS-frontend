import { BehaviorSubject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { CalendarModule } from 'primeng/calendar';
import { CustomerBehaviorPageComponent } from './customer-behavior-page.component';
import { CustomerBehaviorStore } from './customer-behavior.store';
import { CustomerBehaviorDto } from '../../../../shared/interfaces/customer-behavior.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';
import { AdminSharedModule } from '../../admin-shared.module';

function makeData(overrides: Partial<CustomerBehaviorDto> = {}): CustomerBehaviorDto {
  return {
    range: { from: '2026-07-01', to: '2026-07-07', timezone: 'Asia/Bangkok' },
    totalBookings: 6, distinctCustomers: 3, returningCustomers: 2, returningRatePct: 66.7, avgBookingsPerCustomer: 2.0,
    bookingsByChannel: [
      { channel: 'online', bookingCount: 4, sharePct: 66.7 },
      { channel: 'walk_in', bookingCount: 2, sharePct: 33.3 },
    ],
    repeatDistribution: [
      { bookings: 1, customers: 1, sharePct: 33.3 },
      { bookings: 2, customers: 1, sharePct: 33.3 },
      { bookings: 3, customers: 1, sharePct: 33.3 },
    ],
    ...overrides,
  };
}
function makeStoreStub(data: CustomerBehaviorDto | null, range = { from: '2026-07-01', to: '2026-07-07' }) {
  return {
    data$: new BehaviorSubject<CustomerBehaviorDto | null>(data),
    refreshing$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<boolean>(false),
    range, lastErrorCode: null as string | null, hasValue: data !== null,
    refresh: jasmine.createSpy('refresh').and.resolveTo(undefined),
    setRange: jasmine.createSpy('setRange'),
  };
}

describe('CustomerBehaviorPageComponent', () => {
  it('creates, seeds pickers, refreshes, exposes channels/repeat', () => {
    const store = makeStoreStub(makeData(), { from: '2026-06-01', to: '2026-06-07' });
    const c = new CustomerBehaviorPageComponent(store as unknown as CustomerBehaviorStore, createTranslateStub());
    c.ngOnInit();
    expect(store.refresh).toHaveBeenCalled();
    expect(c['channels'].length).toBe(2);
    expect(c['repeat'].length).toBe(3);
  });

  it('normalizes repeat bars to the busiest bucket and clamps channel bars', () => {
    const store = makeStoreStub(makeData({ repeatDistribution: [
      { bookings: 1, customers: 4, sharePct: 80 },
      { bookings: 2, customers: 1, sharePct: 20 },
    ] }));
    const c = new CustomerBehaviorPageComponent(store as unknown as CustomerBehaviorStore, createTranslateStub());
    c.ngOnInit();
    expect(c['barPct'](140)).toBe(100);
    expect(c['repeatBarPct']({ bookings: 1, customers: 4, sharePct: 80 } as never)).toBe(100);
    expect(c['repeatBarPct']({ bookings: 2, customers: 1, sharePct: 20 } as never)).toBe(25);
    expect(c['pctDisplay'](66.7)).toBe('66.7%');
    expect(c['formatAvg'](2)).toBe('2.0');
  });

  it('guards an invalid range and dispatches a valid one', () => {
    const store = makeStoreStub(makeData());
    const c = new CustomerBehaviorPageComponent(store as unknown as CustomerBehaviorStore, createTranslateStub());
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
    let fixture: ComponentFixture<CustomerBehaviorPageComponent>;
    beforeEach(async () => {
      const store = makeStoreStub(makeData());
      await TestBed.configureTestingModule({
        declarations: [CustomerBehaviorPageComponent],
        imports: [CommonModule, FormsModule, CalendarModule, AdminSharedModule, TranslateModule.forRoot()],
        providers: [{ provide: CustomerBehaviorStore, useValue: store }],
      }).compileComponents();
      fixture = TestBed.createComponent(CustomerBehaviorPageComponent);
      fixture.detectChanges();
    });
    it('renders 4 tiles + a channel bar per channel + a repeat bar per bucket', () => {
      expect(fixture.nativeElement.querySelectorAll('.admin-kpi').length).toBe(4);
      expect(fixture.nativeElement.querySelectorAll('.cb-bar:not(.cb-bar--repeat)').length).toBe(2);
      expect(fixture.nativeElement.querySelectorAll('.cb-bar--repeat').length).toBe(3);
    });
  });
});
