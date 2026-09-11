import { FormBuilder } from '@angular/forms';
import { SimpleChange } from '@angular/core';
import { ParcelResendNotificationDialogComponent } from './parcel-resend-notification-dialog.component';
import { ParcelDeliveryListItemDto } from '../../../../shared/interfaces/parcel.interface';

function makeParcel(overrides: Partial<ParcelDeliveryListItemDto> = {}): ParcelDeliveryListItemDto {
  return {
    parcelId: 1,
    trackingNumber: 'PCL-1',
    senderName: 'Somchai',
    senderPhone: '0812345678',
    recipientName: 'Somsri',
    recipientPhone: '0898765432',
    pickupStop: { name: 'Bangkok' },
    dropoffStop: { name: 'Chiang Mai' },
    weightKg: 5,
    deliveryStatus: 'arrived_notified',
    bookingStatus: 'confirmed',
    ...overrides,
  };
}

function open(component: ParcelResendNotificationDialogComponent): void {
  component.isOpen = true;
  component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
}

describe('ParcelResendNotificationDialogComponent (OBRS-1811)', () => {
  function make(parcel: ParcelDeliveryListItemDto | null = makeParcel()) {
    const component = new ParcelResendNotificationDialogComponent(new FormBuilder());
    component.parcel = parcel;
    return component;
  }

  it('pre-fills the parcel’s current number on open — the common case is a right number and a phone that was off, and retyping it invites a second typo', () => {
    const component = make();
    open(component);
    expect(component['form'].value.recipientPhone).toBe('0898765432');
    expect(component['isCorrection']).toBeFalse();
  });

  it('re-opening on a DIFFERENT parcel refills from that parcel, never leaving the previous recipient’s number in the box', () => {
    const component = make();
    open(component);

    component.parcel = makeParcel({ parcelId: 2, recipientPhone: '0811111111' });
    component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });

    expect(component['form'].value.recipientPhone).toBe('0811111111');
  });

  it('flags a changed number as a correction, so the screen can warn before the press that the carriage contract is being amended', () => {
    const component = make();
    open(component);

    component['form'].patchValue({ recipientPhone: '0866666666' });

    expect(component['isCorrection']).toBeTrue();
  });

  it('accepts BOTH spellings the backend accepts (0… and 66…) — validating narrower here would refuse a value the server canonicalises', () => {
    const component = make();
    open(component);

    component['form'].patchValue({ recipientPhone: '0866666666' });
    expect(component['form'].valid).toBeTrue();

    component['form'].patchValue({ recipientPhone: '66866666666' });
    expect(component['form'].valid).toBeTrue();
  });

  it('refuses a malformed number and emits nothing', () => {
    const component = make();
    const emitted: string[] = [];
    component.confirm.subscribe((v) => emitted.push(v));
    open(component);

    component['form'].patchValue({ recipientPhone: '12345' });
    component['onConfirm']();

    expect(component['form'].valid).toBeFalse();
    expect(emitted).toEqual([]);
  });

  it('emits the number on confirm, and emits NOTHING while a submit is already in flight', () => {
    const component = make();
    const emitted: string[] = [];
    component.confirm.subscribe((v) => emitted.push(v));
    open(component);

    component['form'].patchValue({ recipientPhone: '0866666666' });
    component['onConfirm']();
    expect(emitted).toEqual(['0866666666']);

    component.isSubmitting = true;
    component['onConfirm']();
    expect(emitted).toEqual(['0866666666']);
  });

  it('cannot be dismissed mid-submit — the SMS may already have left', () => {
    const component = make();
    let dismissed = 0;
    component.dismiss.subscribe(() => (dismissed += 1));
    open(component);

    component.isSubmitting = true;
    component['onDismiss']();
    expect(dismissed).toBe(0);

    component.isSubmitting = false;
    component['onDismiss']();
    expect(dismissed).toBe(1);
  });

  it('AC-8: exposes no collection code — the component has no input, field or output that could carry one', () => {
    const component = make();
    open(component);

    const surface = Object.keys(component).concat(Object.keys(component['form'].controls));
    expect(surface.filter((k) => /collection|code/i.test(k)))
      .withContext('option kho was rejected: the handoff secret is re-sent, never read back')
      .toEqual([]);
  });
});
