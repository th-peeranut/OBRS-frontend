import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DriverCashPerHeadFormComponent } from './driver-cash-per-head-form.component';
import { AdminDropdownComponent } from '../../../../admin/components/admin-dropdown/admin-dropdown.component';

const RATES = [
  { stopId: 1, stopName: 'Origin', ratePerHead: '20.00', configured: true },
  { stopId: 2, stopName: 'Midway', ratePerHead: '0.00', configured: false },
];

describe('DriverCashPerHeadFormComponent', () => {
  let fixture: ComponentFixture<DriverCashPerHeadFormComponent>;
  let component: DriverCashPerHeadFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, TranslateModule.forRoot()],
      declarations: [DriverCashPerHeadFormComponent, AdminDropdownComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(DriverCashPerHeadFormComponent);
    component = fixture.componentInstance;
    component.rates = RATES;
    fixture.detectChanges();
  });

  function submitBtn(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('[data-testid="driver-cash-per-head-submit"]');
  }

  function warning(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[data-testid="driver-cash-rate-not-configured"]');
  }

  // OBRS-960: the card's central requirement — "rate not configured" shown
  // PRE-EMPTIVELY, before submit, driven by the day response's own
  // perHeadRates[].configured flag.
  it('shows no warning before a stop is selected', () => {
    expect(warning()).toBeNull();
  });

  it('shows the warning when the selected stop is NOT configured', () => {
    component['onStopChange']('2');
    fixture.detectChanges();
    expect(warning()).not.toBeNull();
  });

  it('shows no warning when the selected stop IS configured', () => {
    component['onStopChange']('1');
    fixture.detectChanges();
    expect(warning()).toBeNull();
  });

  it('blocks submit without a stop and head count', () => {
    expect(submitBtn().disabled).toBeTrue();
  });

  it('blocks submit on a non-integer head count', () => {
    component['onStopChange']('1');
    component['headCountInput'] = 2.5;
    fixture.detectChanges();
    expect(submitBtn().disabled).toBeTrue();
  });

  it('emits submitPerHead with numeric stopId/headCount on valid input, even for an unconfigured stop', () => {
    component['onStopChange']('2');
    component['headCountInput'] = 4;
    fixture.detectChanges();
    const spy = spyOn(component.submitPerHead, 'emit');

    submitBtn().click();

    expect(spy).toHaveBeenCalledWith({ stopId: 2, headCount: 4 });
  });

  it('does not reset the selection when isSubmitting flips to false with a submitError', () => {
    component['onStopChange']('1');
    component['headCountInput'] = 3;
    component.isSubmitting = true;
    fixture.detectChanges();

    component.isSubmitting = false;
    component.submitError = 'STAFF.DRIVER_CASH.ERROR.GENERIC';
    component.ngOnChanges({
      isSubmitting: { previousValue: true, currentValue: false, firstChange: false, isFirstChange: () => false },
    } as any);

    expect(component['selectedStopId']).toBe('1');
    expect(component['headCountInput']).toBe(3);
  });
});
