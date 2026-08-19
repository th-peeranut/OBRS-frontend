import { FormBuilder } from '@angular/forms';
import { ParcelClaimDialogComponent } from './parcel-claim-dialog.component';
import { ParcelDeliveryListItemDto } from '../../../../shared/interfaces/parcel.interface';
import { ParcelClaimRespDto } from '../../../../shared/interfaces/parcel-claim.interface';

function makeComponent(): ParcelClaimDialogComponent {
  return new ParcelClaimDialogComponent(new FormBuilder());
}

const PARCEL: ParcelDeliveryListItemDto = {
  parcelId: 45,
  trackingNumber: 'PCL-45',
  senderName: 'Somchai',
  senderPhone: '0812345678',
  recipientName: 'Somsri',
  recipientPhone: '0898765432',
  pickupStop: 'A',
  dropoffStop: 'B',
  weightKg: 3,
  deliveryStatus: 'collected',
};

const FILED_CLAIM: ParcelClaimRespDto = {
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

describe('ParcelClaimDialogComponent', () => {
  it('should be created', () => {
    expect(makeComponent()).toBeTruthy();
  });

  it('phase is "form" with no filedClaim and "filed" once the server confirms one', () => {
    const component = makeComponent();
    expect(component['phase']).toBe('form');
    component.filedClaim = FILED_CLAIM;
    expect(component['phase']).toBe('filed');
  });

  it('resets both forms and the reject-form toggle whenever isOpen flips to true', () => {
    const component = makeComponent();
    component['form'].get('claimReason')?.setValue('stale');
    component['rejectForm'].get('decisionNote')?.setValue('stale');
    component['showRejectForm'] = true;
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: { currentValue: true, previousValue: false, firstChange: false, isFirstChange: () => false },
    });
    expect(component['form'].get('claimReason')?.value).toBe('');
    expect(component['rejectForm'].get('decisionNote')?.value).toBe('');
    expect(component['showRejectForm']).toBeFalse();
  });

  it('does not emit fileClaim with a blank reason', () => {
    const component = makeComponent();
    component.parcel = PARCEL;
    const spy = spyOn(component.fileClaim, 'emit');
    component['onFile']();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits fileClaim with the parcelId and trimmed reason', () => {
    const component = makeComponent();
    component.parcel = PARCEL;
    component['form'].get('claimReason')?.setValue('  กล่องเปิด  ');
    const spy = spyOn(component.fileClaim, 'emit');
    component['onFile']();
    expect(spy).toHaveBeenCalledWith({ parcelId: 45, claimReason: 'กล่องเปิด' });
  });

  it('does not emit rejectClaim before a claim has been filed', () => {
    const component = makeComponent();
    component['rejectForm'].get('decisionNote')?.setValue('พ้นเงื่อนไข');
    const spy = spyOn(component.rejectClaim, 'emit');
    component['onReject']();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits rejectClaim with the filed claim id and trimmed note once revealed', () => {
    const component = makeComponent();
    component.filedClaim = FILED_CLAIM;
    component['openRejectForm']();
    component['rejectForm'].get('decisionNote')?.setValue('  พ้นเงื่อนไข  ');
    const spy = spyOn(component.rejectClaim, 'emit');
    component['onReject']();
    expect(spy).toHaveBeenCalledWith({ claimId: 7, decisionNote: 'พ้นเงื่อนไข' });
  });

  it('does not dismiss while filing or rejecting', () => {
    const component = makeComponent();
    const spy = spyOn(component.dismiss, 'emit');
    component.isFiling = true;
    component['onDismiss']();
    component.isFiling = false;
    component.isRejecting = true;
    component['onDismiss']();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits done only when not rejecting', () => {
    const component = makeComponent();
    const spy = spyOn(component.done, 'emit');
    component.isRejecting = true;
    component['onDone']();
    expect(spy).not.toHaveBeenCalled();
    component.isRejecting = false;
    component['onDone']();
    expect(spy).toHaveBeenCalled();
  });

  it('emits retryHistory on request', () => {
    const component = makeComponent();
    const spy = spyOn(component.retryHistory, 'emit');
    component['onRetryHistory']();
    expect(spy).toHaveBeenCalled();
  });
});
