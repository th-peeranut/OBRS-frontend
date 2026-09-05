import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { SimpleChange } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { Observable, of, throwError } from 'rxjs';
import { MarkRefundedModalComponent } from './mark-refunded-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { PendingButtonDirective } from '../../../../../shared/directives/pending-button.directive';
import { AdminApiService } from '../../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { PendingRefund } from '../../../../../shared/interfaces/payment.interface';

function buildRow(overrides: Partial<PendingRefund> = {}): PendingRefund {
  return {
    paymentId: 42,
    bookingId: 10,
    bookingNumber: 'B-10',
    amount: 500,
    amountOwed: 400,
    paymentMethod: 'qr_promptpay',
    ...overrides,
  };
}

describe('MarkRefundedModalComponent (OBRS-286 Flow C)', () => {
  let fixture: ComponentFixture<MarkRefundedModalComponent>;
  let component: MarkRefundedModalComponent;
  let api: jasmine.SpyObj<AdminApiService>;
  let alert: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<AdminApiService>('AdminApiService', ['markPaymentManuallyRefunded']);
    alert = jasmine.createSpyObj<AlertService>('AlertService', ['success', 'error']);
    alert.success.and.resolveTo(undefined as any);
    alert.error.and.resolveTo(undefined as any);

    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [MarkRefundedModalComponent, AdminModalBackdropDirective, PendingButtonDirective],
      providers: [
        { provide: AdminApiService, useValue: api },
        { provide: AlertService, useValue: alert },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MarkRefundedModalComponent);
    component = fixture.componentInstance;
  });

  function open(row: PendingRefund): void {
    component.row = row;
    component.ngOnChanges({ row: new SimpleChange(undefined, row, true) });
    fixture.detectChanges();
  }

  it('pre-fills amountTransferred from amountOwed, editable, and starts with an empty required transferReference', () => {
    open(buildRow());
    expect((component as any).form.get('amountTransferred').value).toBe(400);
    expect((component as any).form.get('transferReference').value).toBe('');
    expect((component as any).form.valid).toBeFalse();
  });

  it('Confirm is disabled until transferReference is filled', () => {
    open(buildRow());
    const confirmBtn = fixture.debugElement.query(By.css('.admin-btn-primary'));
    expect(confirmBtn.nativeElement.disabled).toBeTrue();

    (component as any).form.get('transferReference').setValue('TXN-1');
    fixture.detectChanges();
    expect(confirmBtn.nativeElement.disabled).toBeFalse();
  });

  it('submits transferReference + amountTransferred and emits completed on 200 (first call)', async () => {
    api.markPaymentManuallyRefunded.and.returnValue(of({ code: 200, message: 'ok', data: {} }));
    const completed = jasmine.createSpy('completed');
    component.completed.subscribe(completed);

    open(buildRow());
    (component as any).form.get('transferReference').setValue('TXN-1');
    await (component as any).submit();

    expect(api.markPaymentManuallyRefunded).toHaveBeenCalledWith(42, {
      transferReference: 'TXN-1',
      amountTransferred: 400,
    });
    expect(completed).toHaveBeenCalled();
    expect(alert.success).toHaveBeenCalled();
  });

  it('a 200 idempotent replay renders exactly like a first-time success — no error branch fires', async () => {
    // Same call twice; the SECOND is the "replay" from the backend's own
    // idempotency guarantee, but the FE code path is identical either way.
    api.markPaymentManuallyRefunded.and.returnValue(of({ code: 200, message: 'ok', data: {} }));
    const completed = jasmine.createSpy('completed');
    component.completed.subscribe(completed);

    open(buildRow());
    (component as any).form.get('transferReference').setValue('TXN-1');
    await (component as any).submit();
    await (component as any).submit();

    expect(completed).toHaveBeenCalledTimes(2);
    expect((component as any).errorMessage).toBe('');
  });

  it('409 PAYMENT_MANUAL_REFUND_INVALID_STATUS shows a specific message and still emits completed (row now gone elsewhere)', async () => {
    api.markPaymentManuallyRefunded.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'PAYMENT_MANUAL_REFUND_INVALID_STATUS' },
          })
      )
    );
    const completed = jasmine.createSpy('completed');
    component.completed.subscribe(completed);

    open(buildRow());
    (component as any).form.get('transferReference').setValue('TXN-1');
    await (component as any).submit();

    expect(alert.error).toHaveBeenCalled();
    expect(completed).toHaveBeenCalled();
  });

  it('400 AMOUNT_MISMATCH shows an inline error under the amount field; modal stays open', async () => {
    api.markPaymentManuallyRefunded.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { errorCode: 'PAYMENT_MANUAL_REFUND_AMOUNT_MISMATCH' },
          })
      )
    );
    const closed = jasmine.createSpy('closed');
    component.closed.subscribe(closed);

    open(buildRow());
    (component as any).form.get('transferReference').setValue('TXN-1');
    await (component as any).submit();

    expect((component as any).amountErrorMessage).toBeTruthy();
    expect(closed).not.toHaveBeenCalled();
    expect(alert.error).not.toHaveBeenCalled();
  });

  it('disables Confirm immediately on click to guard a double-click/retry', async () => {
    let resolveCall!: (v: unknown) => void;
    api.markPaymentManuallyRefunded.and.returnValue(
      new Observable((subscriber) => {
        resolveCall = (v) => {
          subscriber.next(v as any);
          subscriber.complete();
        };
      }) as any
    );

    open(buildRow());
    (component as any).form.get('transferReference').setValue('TXN-1');
    const submitPromise = (component as any).submit();
    fixture.detectChanges();

    expect((component as any).isSubmitting).toBeTrue();
    resolveCall({ code: 200, message: 'ok', data: {} });
    await submitPromise;
  });

  it('does not dismiss while a submit is in flight', () => {
    const closed = jasmine.createSpy('closed');
    component.closed.subscribe(closed);
    open(buildRow());
    (component as any).isSubmitting = true;

    (component as any).requestClose();
    expect(closed).not.toHaveBeenCalled();
  });
});
