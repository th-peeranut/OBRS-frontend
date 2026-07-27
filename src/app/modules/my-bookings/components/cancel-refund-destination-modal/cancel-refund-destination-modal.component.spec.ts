import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { CancelRefundDestinationModalComponent } from './cancel-refund-destination-modal.component';
import { AppRefundDestinationFieldsComponent } from '../../../../shared/components/refund-destination-fields/refund-destination-fields.component';
import { CancellationPolicy, MyBookingView } from '../../../../shared/interfaces/my-booking.interface';

function buildBooking(): MyBookingView {
  return {
    id: 5,
    bookingNumber: 'B-5',
    statusCode: 'confirmed',
    bookingType: 'one_way',
    route: 'A -> B',
    departureLabel: '21/12/2026',
    passengerCount: 1,
    totalAmount: 500,
    totalAmountLabel: '฿500.00',
    createdLabel: '01/12/2026',
    cancellable: true,
    paid: true,
    rescheduleEligible: false,
    rescheduleReasonKey: null,
    changeSeatEligible: false,
    changeSeatReasonKey: null,
    changeStopEligible: false,
    changeStopReasonKey: null,
  };
}

function buildPolicy(): CancellationPolicy {
  return {
    originalAmount: 500,
    refundAmount: 400,
    penaltyAmount: 100,
    refundRatePercent: '80%',
    refundMethod: 'MANUAL_REFUND_REQUIRED',
    policyWindow: '24h',
  };
}

describe('CancelRefundDestinationModalComponent (OBRS-286)', () => {
  let fixture: ComponentFixture<CancelRefundDestinationModalComponent>;
  let component: CancelRefundDestinationModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [CancelRefundDestinationModalComponent, AppRefundDestinationFieldsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CancelRefundDestinationModalComponent);
    component = fixture.componentInstance;
    component.booking = buildBooking();
    component.policy = buildPolicy();
    fixture.detectChanges();
  });

  it('starts with no destination mode chosen and Confirm disabled (AC-1: no pre-selection)', () => {
    expect((component as any).form.get('mode').value).toBeNull();
    const confirmBtn = fixture.debugElement.query(By.css('.btn-primary'));
    expect(confirmBtn.nativeElement.disabled).toBeTrue();
  });

  it('enables Confirm once a valid promptpay destination is filled in', () => {
    const form = (component as any).form;
    form.get('mode').setValue('promptpay');
    form.get('promptpayPhone').setValue('0812345678');
    fixture.detectChanges();

    const confirmBtn = fixture.debugElement.query(By.css('.btn-primary'));
    expect(confirmBtn.nativeElement.disabled).toBeFalse();
  });

  it('emits confirmed with the mapped refundDestination payload and sets submitting', () => {
    const confirmed = jasmine.createSpy('confirmed');
    component.confirmed.subscribe(confirmed);

    const form = (component as any).form;
    form.get('mode').setValue('bank_account');
    form.get('accountName').setValue('Somchai');
    form.get('bank').setValue('KBank');
    form.get('accountNumber').setValue('1234567890');
    fixture.detectChanges();

    fixture.debugElement.query(By.css('.btn-primary')).nativeElement.click();

    expect(confirmed).toHaveBeenCalledWith({
      refundDestination: {
        type: 'bank_account',
        accountName: 'Somchai',
        bank: 'KBank',
        accountNumber: '1234567890',
      },
    });
    expect(component['submitting']).toBeTrue();
  });

  it('emits dismissed when the close button is clicked (not mid-submit)', () => {
    const dismissed = jasmine.createSpy('dismissed');
    component.dismissed.subscribe(dismissed);

    fixture.debugElement.query(By.css('.crdm-modal__close')).nativeElement.click();
    expect(dismissed).toHaveBeenCalled();
  });

  it('does not dismiss while a submit is in flight', () => {
    const dismissed = jasmine.createSpy('dismissed');
    component.dismissed.subscribe(dismissed);
    (component as any).submitting = true;

    fixture.debugElement.query(By.css('.crdm-modal__close')).nativeElement.click();
    expect(dismissed).not.toHaveBeenCalled();
  });

  it('Flow A1 step 5: an error input clears submitting but keeps the typed data and stays open', () => {
    const form = (component as any).form;
    form.get('mode').setValue('promptpay');
    form.get('promptpayPhone').setValue('0812345678');
    (component as any).submitting = true;

    component.error = 'Invalid destination';
    component.ngOnChanges({
      error: { currentValue: 'Invalid destination', previousValue: null, firstChange: false, isFirstChange: () => false },
    });
    fixture.detectChanges();

    expect(component['submitting']).toBeFalse();
    expect(form.get('promptpayPhone').value).toBe('0812345678');
    expect(fixture.debugElement.query(By.css('.crdm-error')).nativeElement.textContent).toContain(
      'Invalid destination'
    );
  });
});
