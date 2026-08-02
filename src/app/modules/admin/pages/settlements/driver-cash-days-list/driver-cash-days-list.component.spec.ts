import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { DriverCashDaysListComponent } from './driver-cash-days-list.component';

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
    component.items = [
      {
        dayId: 1,
        scheduleId: 10,
        routeLabel: 'BKK-CNX',
        departureDateTime: '2026-08-01T08:00:00',
        netCash: '500.00',
        currency: 'THB',
        status: 'PENDING',
        hasUnmappedSalesPointRemit: true,
      },
    ];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="driver-cash-day-unmapped-icon"]')).not.toBeNull();
  });

  it('does not render the warning icon on a clean row', () => {
    component.contentState = 'data';
    component.items = [
      {
        dayId: 1,
        scheduleId: 10,
        routeLabel: 'BKK-CNX',
        departureDateTime: '2026-08-01T08:00:00',
        netCash: '500.00',
        currency: 'THB',
        status: 'PENDING',
        hasUnmappedSalesPointRemit: false,
      },
    ];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="driver-cash-day-unmapped-icon"]')).toBeNull();
  });

  it('emits rowClick with the dayId on the View button', () => {
    component.contentState = 'data';
    component.items = [
      {
        dayId: 7,
        scheduleId: 10,
        routeLabel: 'BKK-CNX',
        departureDateTime: '2026-08-01T08:00:00',
        netCash: '500.00',
        currency: 'THB',
        status: 'RETURNED',
        hasUnmappedSalesPointRemit: false,
      },
    ];
    fixture.detectChanges();
    const spy = jasmine.createSpy('rowClick');
    component.rowClick.subscribe(spy);

    fixture.nativeElement.querySelector('.admin-btn-small').click();

    expect(spy).toHaveBeenCalledWith(7);
  });
});
