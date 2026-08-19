import { FormBuilder } from '@angular/forms';
import { ParcelClaimApproveModalComponent } from './parcel-claim-approve-modal.component';
import { ParcelClaimRespDto } from '../../../../../shared/interfaces/parcel-claim.interface';

function makeComponent(): ParcelClaimApproveModalComponent {
  return new ParcelClaimApproveModalComponent(new FormBuilder());
}

const CLAIM: ParcelClaimRespDto = {
  id: 7,
  parcelId: 45,
  trackingNumber: 'PCL-45',
  claimantName: 'Somchai',
  claimantContactPhone: '0812345678',
  claimReason: 'กล่องเปิด',
  salesPointId: null,
  status: 'PENDING',
  filedByUserId: 1,
  filedAt: '2026-08-19T10:00:00Z',
  approvedAmount: null,
  decisionNote: null,
  expenseId: null,
  decidedByUserId: null,
  decidedAt: null,
};

describe('ParcelClaimApproveModalComponent', () => {
  it('should be created', () => {
    expect(makeComponent()).toBeTruthy();
  });

  it('resets the form whenever isOpen flips to true', () => {
    const component = makeComponent();
    component['form'].get('approvedAmount')?.setValue(999);
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: { currentValue: true, previousValue: false, firstChange: false, isFirstChange: () => false },
    });
    expect(component['form'].get('approvedAmount')?.value).toBeNull();
  });

  it('does not emit approveRequested with no claim in hand', () => {
    const component = makeComponent();
    component['form'].get('approvedAmount')?.setValue(200);
    const spy = spyOn(component.approveRequested, 'emit');
    component['onSubmit']();
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not emit approveRequested with an amount over the ฿500 ceiling', () => {
    const component = makeComponent();
    component.claim = CLAIM;
    component['form'].get('approvedAmount')?.setValue(501);
    const spy = spyOn(component.approveRequested, 'emit');
    component['onSubmit']();
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not emit approveRequested with a zero/negative amount', () => {
    const component = makeComponent();
    component.claim = CLAIM;
    component['form'].get('approvedAmount')?.setValue(0);
    const spy = spyOn(component.approveRequested, 'emit');
    component['onSubmit']();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits approveRequested with the claim id, amount and trimmed note', () => {
    const component = makeComponent();
    component.claim = CLAIM;
    component['form'].get('approvedAmount')?.setValue(300);
    component['form'].get('decisionNote')?.setValue('  liability tier: total loss  ');
    const spy = spyOn(component.approveRequested, 'emit');
    component['onSubmit']();
    expect(spy).toHaveBeenCalledWith({
      claimId: 7,
      approvedAmount: 300,
      decisionNote: 'liability tier: total loss',
    });
  });

  it('omits decisionNote when left blank', () => {
    const component = makeComponent();
    component.claim = CLAIM;
    component['form'].get('approvedAmount')?.setValue(300);
    const spy = spyOn(component.approveRequested, 'emit');
    component['onSubmit']();
    expect(spy).toHaveBeenCalledWith({ claimId: 7, approvedAmount: 300, decisionNote: undefined });
  });

  it('the range hint is inert until the amount field is touched', () => {
    const component = makeComponent();
    component.claim = CLAIM;
    component['form'].get('approvedAmount')?.setValue(501);
    expect(component['amountOutOfRange']).toBeFalse();
    component['form'].get('approvedAmount')?.markAsTouched();
    expect(component['amountOutOfRange']).toBeTrue();
  });

  it('does not close while submitting', () => {
    const component = makeComponent();
    component.isSubmitting = true;
    const spy = spyOn(component.closed, 'emit');
    component['onClose']();
    expect(spy).not.toHaveBeenCalled();
  });
});
