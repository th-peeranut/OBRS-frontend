import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { CashRefundApprovalsPageComponent } from './cash-refund-approvals-page.component';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { CashRefundApprovalRequest } from '../../../../shared/interfaces/my-booking.interface';
import { PendingButtonDirective } from '../../../../shared/directives/pending-button.directive';

const PENDING: CashRefundApprovalRequest = {
  id: 7,
  bookingId: 42,
  bookingNumber: 'BK-000042',
  refundAmount: 400,
  requestedBy: 'sales@obrs.test',
  status: 'PENDING',
  requestedAt: '2026-07-29T10:00:00+07:00',
  codeExpiresAt: null,
};

describe('CashRefundApprovalsPageComponent (OBRS-844)', () => {
  let fixture: ComponentFixture<CashRefundApprovalsPageComponent>;
  let component: CashRefundApprovalsPageComponent;
  let api: jasmine.SpyObj<AdminApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<AdminApiService>('AdminApiService', [
      'getPendingCashRefundApprovals',
      'approveCashRefund',
    ]);

    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [CashRefundApprovalsPageComponent, PendingButtonDirective],
      providers: [{ provide: AdminApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(CashRefundApprovalsPageComponent);
    component = fixture.componentInstance;
  });

  function load(rows: CashRefundApprovalRequest[]): void {
    api.getPendingCashRefundApprovals.and.returnValue(
      of({ code: 200, message: 'ok', data: rows }) as never
    );
    fixture.detectChanges();
  }

  it('shows the three facts the owner needs before deciding: booking, amount, who is asking', () => {
    load([PENDING]);

    // AC3. An approval prompt that omits any of these trains the owner to tap
    // yes, which is the control failing without anyone noticing.
    const row = fixture.debugElement.query(By.css('tbody tr')).nativeElement.textContent;
    expect(row).toContain('BK-000042');
    expect(row).toContain('400');
    expect(row).toContain('sales@obrs.test');
  });

  it('reads as reassurance, not an error, when nothing is waiting', () => {
    load([]);

    expect((component as never as { contentState: string }).contentState).toBe('empty');
    expect(fixture.debugElement.query(By.css('.cra-empty'))).not.toBeNull();
  });

  it('reveals the issued code inline and replaces the button — there is no second read of it', () => {
    load([PENDING]);
    api.approveCashRefund.and.returnValue(
      of({
        code: 200,
        message: 'ok',
        data: { requestId: 7, code: '246813', expiresAt: '2026-07-29T10:02:00+07:00', ttlMinutes: 2 },
      }) as never
    );

    (component as never as { approve(r: CashRefundApprovalRequest): void }).approve(PENDING);
    fixture.detectChanges();

    expect(api.approveCashRefund).toHaveBeenCalledWith(7);
    const code = fixture.debugElement.query(By.css('.cra-code-value'));
    expect(code).not.toBeNull();
    expect(code.nativeElement.textContent.trim()).toBe('246813');
    // The button is gone: pressing it again could only fail, because the request
    // is no longer PENDING and the server keeps only a hash of what it issued.
    expect(fixture.debugElement.query(By.css('.cra-action button'))).toBeNull();
  });

  it('re-reads the list when an approval is refused — the request may have expired while the page sat open', () => {
    load([PENDING]);
    api.approveCashRefund.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })) as never
    );

    (component as never as { approve(r: CashRefundApprovalRequest): void }).approve(PENDING);
    fixture.detectChanges();

    expect((component as never as { approveErrorMessage: string }).approveErrorMessage).toBeTruthy();
    expect(api.getPendingCashRefundApprovals).toHaveBeenCalledTimes(2);
    expect(fixture.debugElement.query(By.css('.cra-code-value'))).toBeNull();
  });
});
