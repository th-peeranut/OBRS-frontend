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

  // --- OBRS-813: the reschedule offer ---

  it('OBRS-813: no offer when the booking is not reschedule-eligible (the default fixture)', () => {
    expect(fixture.debugElement.query(By.css('.crdm-offer'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.crdm-subheading'))).toBeNull();
  });

  it('OBRS-813: an eligible booking is offered the reschedule door, quoting the SERVER originalAmount', () => {
    component.booking = { ...buildBooking(), rescheduleEligible: true };
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.crdm-offer'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.crdm-offer__cta'))).not.toBeNull();

    // The 100%-kept figure is `policy.originalAmount`, NOT a number the FE
    // derived — the card's AC-2. Asserted on the getter rather than the
    // rendered text because `TranslateModule.forRoot()` here has no catalogue:
    // it echoes the KEY and drops the interpolation params, so a DOM assertion
    // would be measuring ngx-translate's fallback, not this component.
    // The rendered path is covered in the gate lane
    // (e2e/tests/obrs-813-cancel-offers-reschedule.spec.ts).
    component.policy = { ...buildPolicy(), originalAmount: 777, refundAmount: 400 };
    expect(component['originalAmountLabel']).toContain('777');
    expect(component['refundLabel']).toContain('400');
  });

  it('OBRS-813: the offer emits rescheduleRequested and cancels nothing', () => {
    const rescheduleRequested = jasmine.createSpy('rescheduleRequested');
    const confirmed = jasmine.createSpy('confirmed');
    component.rescheduleRequested.subscribe(rescheduleRequested);
    component.confirmed.subscribe(confirmed);
    component.booking = { ...buildBooking(), rescheduleEligible: true };
    fixture.detectChanges();

    fixture.debugElement.query(By.css('.crdm-offer__cta')).nativeElement.click();

    expect(rescheduleRequested).toHaveBeenCalled();
    expect(confirmed).not.toHaveBeenCalled();
    expect(component['submitting']).toBeFalse();
  });

  it('OBRS-813: adding the offer does not move the cancel path — still one click on Confirm', () => {
    const confirmed = jasmine.createSpy('confirmed');
    component.confirmed.subscribe(confirmed);
    component.booking = { ...buildBooking(), rescheduleEligible: true };
    const form = (component as any).form;
    form.get('mode').setValue('promptpay');
    form.get('promptpayPhone').setValue('0812345678');
    fixture.detectChanges();

    const confirmBtn = fixture.debugElement.query(By.css('.btn-primary'));
    expect(confirmBtn.nativeElement.disabled).toBeFalse();
    confirmBtn.nativeElement.click();

    expect(confirmed).toHaveBeenCalledTimes(1);
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
