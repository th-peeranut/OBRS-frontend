import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ParcelClaimsPageComponent } from './parcel-claims-page.component';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { ParcelClaimRespDto } from '../../../../shared/interfaces/parcel-claim.interface';
import { createTranslateStub } from '../../../../testing/test-stubs';

function claim(overrides: Partial<ParcelClaimRespDto> = {}): ParcelClaimRespDto {
  return {
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
    ...overrides,
  };
}

describe('ParcelClaimsPageComponent (OBRS-1388)', () => {
  let api: jasmine.SpyObj<AdminApiService>;
  let alert: jasmine.SpyObj<AlertService>;
  let component: ParcelClaimsPageComponent;

  beforeEach(() => {
    api = jasmine.createSpyObj<AdminApiService>('AdminApiService', [
      'getPendingParcelClaims',
      'getParcelClaimHistory',
      'approveParcelClaim',
    ]);
    alert = jasmine.createSpyObj<AlertService>('AlertService', ['confirm', 'toast']);
    alert.confirm.and.resolveTo(true);
    component = new ParcelClaimsPageComponent(api, alert, createTranslateStub());
  });

  it('loads the queue on init', () => {
    api.getPendingParcelClaims.and.returnValue(of({ code: 200, message: 'ok', data: [claim()] }) as never);
    component.ngOnInit();
    expect((component as any).rows.length).toBe(1);
    expect((component as any).contentState).toBe('data');
  });

  it('reads as reassurance, not an error, when nothing is pending', () => {
    api.getPendingParcelClaims.and.returnValue(of({ code: 200, message: 'ok', data: [] }) as never);
    component.ngOnInit();
    expect((component as any).contentState).toBe('empty');
  });

  it('opens the approve modal optimistically on the row already in hand, then fetches history in the background', () => {
    api.getParcelClaimHistory.and.returnValue(of({ code: 200, message: 'ok', data: [] }) as never);
    const row = claim();

    (component as any).openApproveModal(row);

    expect((component as any).isApproveModalOpen).toBeTrue();
    expect((component as any).selectedClaim).toBe(row);
    expect(api.getParcelClaimHistory).toHaveBeenCalledWith(45);
  });

  it('confirms via AlertService BEFORE posting the approval', async () => {
    api.approveParcelClaim.and.returnValue(of({ code: 200, message: 'ok', data: claim({ status: 'APPROVED' }) }) as never);

    await (component as any).confirmAndApprove({ claimId: 7, approvedAmount: 300 });

    expect(alert.confirm).toHaveBeenCalled();
    expect(api.approveParcelClaim).toHaveBeenCalledWith(7, { approvedAmount: 300, decisionNote: undefined });
  });

  it('does not call the API when the owner cancels the confirm dialog', async () => {
    alert.confirm.and.resolveTo(false);

    await (component as any).confirmAndApprove({ claimId: 7, approvedAmount: 300 });

    expect(api.approveParcelClaim).not.toHaveBeenCalled();
  });

  it('on success: closes the modal, removes the row, and toasts', async () => {
    (component as any).rows = [claim()];
    (component as any).selectedClaim = claim();
    (component as any).isApproveModalOpen = true;
    api.approveParcelClaim.and.returnValue(of({ code: 200, message: 'ok', data: claim({ status: 'APPROVED' }) }) as never);

    await (component as any).confirmAndApprove({ claimId: 7, approvedAmount: 300 });

    expect((component as any).rows.length).toBe(0);
    expect((component as any).isApproveModalOpen).toBeFalse();
    expect(alert.toast).toHaveBeenCalled();
  });

  it('on PARCEL_CLAIM_ALREADY_DECIDED: closes the modal, shows an inline note, and reloads the queue', async () => {
    (component as any).selectedClaim = claim();
    (component as any).isApproveModalOpen = true;
    api.approveParcelClaim.and.returnValue(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { errorCode: 'PARCEL_CLAIM_ALREADY_DECIDED' } })
      ) as never
    );
    api.getPendingParcelClaims.and.returnValue(of({ code: 200, message: 'ok', data: [] }) as never);

    await (component as any).confirmAndApprove({ claimId: 7, approvedAmount: 300 });

    expect((component as any).isApproveModalOpen).toBeFalse();
    expect((component as any).queueNoteKey).toBe('ADMIN.PARCEL_CLAIM.ERROR.ALREADY_DECIDED');
    expect(api.getPendingParcelClaims).toHaveBeenCalled();
  });

  it('on DRIVER_CASH_DAY_ALREADY_RETURNED: keeps the modal open with an inline error', async () => {
    (component as any).selectedClaim = claim();
    (component as any).isApproveModalOpen = true;
    api.approveParcelClaim.and.returnValue(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { errorCode: 'DRIVER_CASH_DAY_ALREADY_RETURNED' } })
      ) as never
    );

    await (component as any).confirmAndApprove({ claimId: 7, approvedAmount: 300 });

    expect((component as any).isApproveModalOpen).toBeTrue();
    expect((component as any).approveSubmitErrorKey).toBe('ADMIN.PARCEL_CLAIM.ERROR.DAY_ALREADY_RETURNED');
  });
});
