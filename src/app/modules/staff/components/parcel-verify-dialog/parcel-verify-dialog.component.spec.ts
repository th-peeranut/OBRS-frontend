import { FormBuilder } from '@angular/forms';
import { ParcelVerifyDialogComponent } from './parcel-verify-dialog.component';
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
    deliveryStatus: 'created',
    bookingStatus: 'confirmed',
    lengthCm: 30,
    widthCm: 20,
    heightCm: 15,
    amount: 350,
    ...overrides,
  };
}

function makeComponent(): ParcelVerifyDialogComponent {
  return new ParcelVerifyDialogComponent(new FormBuilder());
}

function openWith(component: ParcelVerifyDialogComponent, parcel: ParcelDeliveryListItemDto): void {
  component.parcel = parcel;
  component.isOpen = true;
  component.ngOnChanges({
    isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true },
  });
}

describe('ParcelVerifyDialogComponent', () => {
  it('should be created', () => {
    expect(makeComponent()).toBeTruthy();
  });

  it('resets the form and clears outcome whenever isOpen flips to true (no pre-seeded outcome)', () => {
    const component = makeComponent();
    component['form'].get('actualWeightKg')?.setValue(99);
    component['outcome'] = 'reject';

    openWith(component, makeParcel());

    expect(component['form'].get('actualWeightKg')?.value).toBeNull();
    expect(component['outcome']).toBeNull();
  });

  it('cannot submit until an outcome is selected, even with valid measurements', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component['form'].patchValue({
      actualWeightKg: 5,
      actualLengthCm: 30,
      actualWidthCm: 20,
      actualHeightCm: 15,
    });
    expect(component['canSubmit']).toBeFalse();
  });

  it('a tap on the already-selected segment is a no-op', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component['selectOutcome']('accept');
    const control = component['form'].get('rejectReason')!;
    spyOn(control, 'updateValueAndValidity');
    component['selectOutcome']('accept');
    expect(control.updateValueAndValidity).not.toHaveBeenCalled();
  });

  it('selecting reject makes rejectReason required; canSubmit is false until it is filled', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component['form'].patchValue({
      actualWeightKg: 5,
      actualLengthCm: 30,
      actualWidthCm: 20,
      actualHeightCm: 15,
    });
    component['selectOutcome']('reject');
    expect(component['canSubmit']).toBeFalse();

    component['form'].get('rejectReason')?.setValue('Box was empty');
    expect(component['canSubmit']).toBeTrue();
  });

  it('switching outcome away from reject clears the rejectReason VALUE, not just hides it', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component['selectOutcome']('reject');
    component['form'].get('rejectReason')?.setValue('stale reason');

    component['selectOutcome']('accept');

    expect(component['form'].get('rejectReason')?.value).toBe('');
  });

  it('emits confirmAccept with the numeric form value on submit when outcome is accept', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component['form'].patchValue({
      actualWeightKg: '5.2',
      actualLengthCm: '31',
      actualWidthCm: '21',
      actualHeightCm: '16',
    });
    component['selectOutcome']('accept');
    const spy = spyOn(component.confirmAccept, 'emit');

    component['onSubmit']();

    expect(spy).toHaveBeenCalledWith({
      actualWeightKg: 5.2,
      actualLengthCm: 31,
      actualWidthCm: 21,
      actualHeightCm: 16,
    });
  });

  it('emits confirmReject with the trimmed reject reason on submit when outcome is reject', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component['form'].patchValue({
      actualWeightKg: 5,
      actualLengthCm: 30,
      actualWidthCm: 20,
      actualHeightCm: 15,
    });
    component['selectOutcome']('reject');
    component['form'].get('rejectReason')?.setValue('  Damaged in transit  ');
    const spy = spyOn(component.confirmReject, 'emit');

    component['onSubmit']();

    expect(spy).toHaveBeenCalledWith(
      jasmine.objectContaining({ rejectReason: 'Damaged in transit' })
    );
  });

  it('does not emit anything when submit is clicked while invalid', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    const acceptSpy = spyOn(component.confirmAccept, 'emit');
    const rejectSpy = spyOn(component.confirmReject, 'emit');

    component['onSubmit']();

    expect(acceptSpy).not.toHaveBeenCalled();
    expect(rejectSpy).not.toHaveBeenCalled();
  });

  describe('isMismatch()', () => {
    it('flags a measured weight that differs from declared beyond tolerance', () => {
      const component = makeComponent();
      openWith(component, makeParcel({ weightKg: 5 }));
      component['form'].get('actualWeightKg')?.setValue(7);
      expect(component['isMismatch']('actualWeightKg')).toBeTrue();
    });

    it('does not flag a measured weight within tolerance of declared', () => {
      const component = makeComponent();
      openWith(component, makeParcel({ weightKg: 5 }));
      component['form'].get('actualWeightKg')?.setValue(5.02);
      expect(component['isMismatch']('actualWeightKg')).toBeFalse();
    });

    it('flags a dimension mismatch beyond the 1cm tolerance', () => {
      const component = makeComponent();
      openWith(component, makeParcel({ lengthCm: 30 }));
      component['form'].get('actualLengthCm')?.setValue(35);
      expect(component['isMismatch']('actualLengthCm')).toBeTrue();
    });

    it('never flags a mismatch before anything has been entered', () => {
      const component = makeComponent();
      openWith(component, makeParcel());
      expect(component['isMismatch']('actualWeightKg')).toBeFalse();
    });

    it('never flags a mismatch when the parcel never declared that dimension', () => {
      const component = makeComponent();
      openWith(component, makeParcel({ lengthCm: null }));
      component['form'].get('actualLengthCm')?.setValue(999);
      expect(component['isMismatch']('actualLengthCm')).toBeFalse();
    });
  });

  it('does not dismiss while submitting', () => {
    const component = makeComponent();
    component.isSubmitting = true;
    const spy = spyOn(component.dismiss, 'emit');
    component['onDismiss']();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits dismiss when not submitting', () => {
    const component = makeComponent();
    const spy = spyOn(component.dismiss, 'emit');
    component['onDismiss']();
    expect(spy).toHaveBeenCalled();
  });

  it('cannot select an outcome while submitting', () => {
    const component = makeComponent();
    openWith(component, makeParcel());
    component.isSubmitting = true;
    component['selectOutcome']('accept');
    expect(component['outcome']).toBeNull();
  });
});
