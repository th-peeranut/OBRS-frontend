import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { SimpleChange } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { Subject, of, throwError } from 'rxjs';
import { CounterCancelModalComponent } from './counter-cancel-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { AppRefundDestinationFieldsComponent } from '../../../../../shared/components/refund-destination-fields/refund-destination-fields.component';
import { StaffApiService, CounterBookingSearchResultDto } from '../../../../../services/staff/staff-api.service';
import { AlertService } from '../../../../../shared/services/alert.service';
import { AuthService } from '../../../../../auth/auth.service';
import { CancellationPolicy } from '../../../../../shared/interfaces/my-booking.interface';
import { AA_NORMAL_TEXT, contrast, effectiveBg, fgOf } from '../../../../../testing/contrast';
import { errorCodeFromMessageKey } from '../../../../../shared/lib/api-error-code';

// OBRS-766 (QA-caught): the wire `errorCode` field is derived from its
// dotted messageKey (see `api-error-code.ts`'s `errorCodeFromMessageKey`
// doc comment for the full incident). Every mocked `HttpErrorResponse`
// below must carry the DERIVED wire form, not the messageKey — mocking the
// dotted form tests only the component's own (formerly wrong) comparison,
// which is exactly how the original bug shipped with a green suite.
const WINDOW_CLOSED_CODE = errorCodeFromMessageKey('cancel.error.window-closed');
const APPROVER_INVALID_CODE = errorCodeFromMessageKey('cancel.error.approver-invalid');
const APPROVER_SELF_CODE = errorCodeFromMessageKey('cancel.error.approver-self');
const REFUND_DESTINATION_INVALID_CODE = errorCodeFromMessageKey('cancel.error.refund-destination-invalid');

const BOOKING: CounterBookingSearchResultDto = {
  bookingId: 42,
  bookingNumber: 'B-000042',
  contactName: 'Somchai Jaidee',
  contactPhoneMasked: '••••5678',
  status: 'confirmed',
  netAmount: 500,
  journeys: [],
};

function policyWith(refundMethod: string): CancellationPolicy {
  return {
    originalAmount: 500,
    refundAmount: 450,
    penaltyAmount: 50,
    refundRatePercent: '90%',
    refundMethod,
    policyWindow: '24h',
  };
}

describe('CounterCancelModalComponent (OBRS-766)', () => {
  let fixture: ComponentFixture<CounterCancelModalComponent>;
  let component: CounterCancelModalComponent;
  let api: jasmine.SpyObj<StaffApiService>;
  let alert: jasmine.SpyObj<AlertService>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<StaffApiService>('StaffApiService', [
      'getCancelPolicy',
      'cancelCounterBooking',
    ]);
    alert = jasmine.createSpyObj<AlertService>('AlertService', ['success', 'error']);
    alert.success.and.resolveTo(undefined as any);
    alert.error.and.resolveTo(undefined as any);
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['getUsername']);
    auth.getUsername.and.returnValue('salesperson@obrs.test');

    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [
        CounterCancelModalComponent,
        AdminModalBackdropDirective,
        AppRefundDestinationFieldsComponent,
      ],
      providers: [
        { provide: StaffApiService, useValue: api },
        { provide: AlertService, useValue: alert },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CounterCancelModalComponent);
    component = fixture.componentInstance;
  });

  function open(): void {
    component.booking = BOOKING;
    component.isOpen = true;
    component.ngOnChanges({ isOpen: new SimpleChange(false, true, true) });
    fixture.detectChanges();
  }

  it('does not render when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.admin-modal-backdrop'))).toBeNull();
  });

  it('opens optimistically: the booking summary renders before the policy fetch resolves', () => {
    api.getCancelPolicy.and.returnValue(new Subject<any>().asObservable());
    open();

    expect(fixture.debugElement.query(By.css('.ccm-summary'))).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain(BOOKING.bookingNumber);
    expect((component as any).previewState).toBe('loading');
    expect((component as any).canSubmit).toBeFalse();
  });

  it('blocked: CANCEL_ERROR_WINDOW_CLOSED is terminal — no retry, Confirm stays disabled', () => {
    api.getCancelPolicy.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({ status: 400, error: { errorCode: WINDOW_CLOSED_CODE } })
      )
    );
    open();

    expect((component as any).previewState).toBe('blocked');
    expect(fixture.debugElement.query(By.css('.ccm-preview.is-blocked button'))).toBeNull();
    expect((component as any).canSubmit).toBeFalse();
  });

  it('error: any other fetch failure shows Retry and blocks Confirm', () => {
    api.getCancelPolicy.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    open();

    expect((component as any).previewState).toBe('error');
    expect(fixture.debugElement.query(By.css('.ccm-preview.is-error button'))).not.toBeNull();
    expect((component as any).canSubmit).toBeFalse();
  });

  it('retryCheck() re-fires the fetch', () => {
    api.getCancelPolicy.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    open();
    expect((component as any).previewState).toBe('error');

    api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('card') }));
    (component as any).retryCheck();

    expect((component as any).previewState).toBe('resolved');
  });

  it('resolved (neither cash nor manual): shows the refund/penalty preview, no extra sections, Confirm enabled', () => {
    api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('card') }));
    open();

    expect(fixture.debugElement.query(By.css('.ccm-policy'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.ccm-cash-approval'))).toBeNull();
    expect(fixture.debugElement.query(By.css('app-refund-destination-fields'))).toBeNull();
    expect((component as any).canSubmit).toBeTrue();
  });

  // ── FE-5: approver-is-self soft check ─────────────────────────────────────
  describe('cash approver-is-self soft check (FE-5)', () => {
    beforeEach(() => {
      api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('CASH') }));
      open();
    });

    it('renders the cash-approval section for a CASH refund', () => {
      expect(fixture.debugElement.query(By.css('.ccm-cash-approval'))).not.toBeNull();
    });

    it('does NOT pre-fill the approver fields', () => {
      expect((component as any).form.get('approverEmail').value).toBe('');
      expect((component as any).form.get('approverPassword').value).toBe('');
    });

    it('disables Confirm and shows the inline hint when the email matches the logged-in user (case-insensitive)', () => {
      (component as any).form.get('approverEmail').setValue('SalesPerson@OBRS.test');
      (component as any).form.get('approverPassword').setValue('whatever');
      fixture.detectChanges();

      expect((component as any).isApproverSelf).toBeTrue();
      expect((component as any).canSubmit).toBeFalse();
      expect(fixture.debugElement.query(By.css('.ccm-self-hint'))).not.toBeNull();
    });

    it('a different approver email passes the soft check', () => {
      (component as any).form.get('approverEmail').setValue('owner@obrs.test');
      (component as any).form.get('approverPassword').setValue('whatever');
      fixture.detectChanges();

      expect((component as any).isApproverSelf).toBeFalse();
      expect((component as any).canSubmit).toBeTrue();
    });
  });

  // ── Server-side error-code branching ──────────────────────────────────────
  describe('submit error handling', () => {
    it('CANCEL_ERROR_APPROVER_INVALID clears the password and shows the message by the approver fields', () => {
      api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('CASH') }));
      api.cancelCounterBooking.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errorCode: APPROVER_INVALID_CODE, message: 'Wrong password' },
            })
        )
      );
      open();
      (component as any).form.get('approverEmail').setValue('owner@obrs.test');
      (component as any).form.get('approverPassword').setValue('wrong');
      fixture.detectChanges();

      (component as any).submit();

      expect((component as any).approverErrorMessage).toBe('Wrong password');
      expect((component as any).form.get('approverPassword').value).toBe('');
      expect((component as any).errorMessage).toBe('');
    });

    it('CANCEL_ERROR_APPROVER_SELF uses the SAME copy as the client-side hint, never the backend message, and clears the password', () => {
      api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('CASH') }));
      api.cancelCounterBooking.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errorCode: APPROVER_SELF_CODE, message: 'a different backend wording' },
            })
        )
      );
      open();
      // Two-accounts scenario: passes the client-side soft check (different
      // email from getUsername()) but the backend still rejects it.
      (component as any).form.get('approverEmail').setValue('second-account@obrs.test');
      (component as any).form.get('approverPassword').setValue('whatever');
      fixture.detectChanges();
      expect((component as any).isApproverSelf).toBeFalse();

      (component as any).submit();

      expect((component as any).approverErrorMessage).toBe('STAFF.CANCEL_BOOKING.MODAL.APPROVER_SELF');
      expect((component as any).form.get('approverPassword').value).toBe('');
    });

    it('refund-destination error codes surface by the destination fields, never the generic banner', () => {
      api.getCancelPolicy.and.returnValue(
        of({ code: 200, message: 'ok', data: policyWith('MANUAL_REFUND_REQUIRED') })
      );
      api.cancelCounterBooking.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errorCode: REFUND_DESTINATION_INVALID_CODE, message: 'Bad account' },
            })
        )
      );
      open();
      (component as any).destinationForm.get('mode').setValue('promptpay');
      (component as any).destinationForm.get('promptpayPhone').setValue('0812345678');
      fixture.detectChanges();

      (component as any).submit();

      expect((component as any).destinationErrorMessage).toBe('Bad account');
      expect((component as any).errorMessage).toBe('');
    });

    it('any other error falls back to the generic FAILED banner, modal stays open', () => {
      api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('card') }));
      api.cancelCounterBooking.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      const closed = jasmine.createSpy('closed');
      component.closed.subscribe(closed);
      open();

      (component as any).submit();

      expect((component as any).errorMessage).toBe('STAFF.CANCEL_BOOKING.MODAL.FAILED');
      expect(closed).not.toHaveBeenCalled();
    });
  });

  it('success: emits cancelled + closed and shows the success alert, then re-runs the search (parent responsibility)', () => {
    api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('card') }));
    api.cancelCounterBooking.and.returnValue(of({ code: 200, message: 'Cancelled' }));
    const cancelled = jasmine.createSpy('cancelled');
    const closed = jasmine.createSpy('closed');
    component.cancelled.subscribe(cancelled);
    component.closed.subscribe(closed);
    open();

    (component as any).submit();

    expect(cancelled).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
    expect(alert.success).toHaveBeenCalled();
  });

  // ── Dark-mode contrast of the new cash-approval section (FE-6) ────────────
  // Copies the working `override-cancel-modal.component.spec.ts` harness
  // verbatim (FRONTEND-GOTCHAS: "copy it, do not rebuild it") rather than
  // reinventing the mount/measure steps.
  describe('dark-mode contrast of the cash-approval section (OBRS-766, FE-6)', () => {
    let shell: HTMLElement | null = null;

    function mountInShell(dark: boolean): void {
      shell = document.createElement('div');
      shell.className = dark ? 'admin-shell theme-staff is-dark' : 'admin-shell theme-staff';
      document.body.appendChild(shell);
      shell.appendChild(fixture.nativeElement);
      fixture.detectChanges();
    }

    afterEach(() => {
      shell?.remove();
      shell = null;
    });

    const el = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;

    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';

      it(`${mode}: the cash-approval title meets AA on its own section`, () => {
        api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('CASH') }));
        open();
        mountInShell(dark);

        const ratio = contrast(fgOf(el('.ccm-cash-approval-title')), effectiveBg(el('.ccm-cash-approval')));
        expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the cash-approval body copy meets AA on its own section`, () => {
        api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('CASH') }));
        open();
        mountInShell(dark);

        const ratio = contrast(fgOf(el('.ccm-cash-approval-body')), effectiveBg(el('.ccm-cash-approval')));
        expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the summary label is muted, not inherited body text`, () => {
        api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('CASH') }));
        open();
        mountInShell(dark);

        expect(getComputedStyle(el('.ccm-summary dt')).color).not.toBe(
          getComputedStyle(el('.ccm-summary dd')).color
        );
      });
    }
  });
});

// ── FE-1/2/3: request-body byte-identity, asserted at the HTTP layer ───────
//
// A spy-based `toHaveBeenCalledWith(id, {})` cannot discriminate an
// accidental `{approverEmail: undefined}` from a genuinely empty body under
// some Jasmine matcher configurations (FE-1's own load-bearing note). This
// block uses the REAL StaffApiService against HttpClientTestingModule so the
// assertion runs on `JSON.stringify(req.request.body)`, the actual wire
// bytes — not a matcher's opinion of object equality.
describe('CounterCancelModalComponent — cancel body byte-identity (OBRS-766 FE-1/2/3)', () => {
  let fixture: ComponentFixture<CounterCancelModalComponent>;
  let component: CounterCancelModalComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    const alert = jasmine.createSpyObj<AlertService>('AlertService', ['success', 'error']);
    alert.success.and.resolveTo(undefined as any);
    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['getUsername']);
    auth.getUsername.and.returnValue('salesperson@obrs.test');

    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot(), HttpClientTestingModule],
      declarations: [
        CounterCancelModalComponent,
        AdminModalBackdropDirective,
        AppRefundDestinationFieldsComponent,
      ],
      providers: [
        { provide: AlertService, useValue: alert },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CounterCancelModalComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpMock.verify();
  });

  function openAndResolvePolicy(refundMethod: string): void {
    component.booking = BOOKING;
    component.isOpen = true;
    component.ngOnChanges({ isOpen: new SimpleChange(false, true, true) });
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url.includes('/cancel-policy'));
    req.flush({ code: 200, message: 'ok', data: policyWith(refundMethod) });
    fixture.detectChanges();
  }

  it('FE-1: a non-cash, non-manual cancel posts a byte-identical {} body — no key at all, not even undefined-valued', () => {
    openAndResolvePolicy('card');

    (component as any).submit();

    const req = httpMock.expectOne((r) => r.url.endsWith('/cancel'));
    expect(req.request.method).toBe('POST');
    expect(JSON.stringify(req.request.body)).toBe('{}');
    expect(Object.keys(req.request.body as object).length).toBe(0);
    req.flush({ code: 200, message: 'ok' });
  });

  it('FE-2: cash posts approverEmail/approverPassword and nothing else', () => {
    openAndResolvePolicy('CASH');
    (component as any).form.get('approverEmail').setValue('owner@obrs.test');
    (component as any).form.get('approverPassword').setValue('secret123');
    fixture.detectChanges();

    (component as any).submit();

    const req = httpMock.expectOne((r) => r.url.endsWith('/cancel'));
    expect(req.request.body).toEqual({
      approverEmail: 'owner@obrs.test',
      approverPassword: 'secret123',
    });
    req.flush({ code: 200, message: 'ok' });
  });

  it('FE-3: manual refund mounts app-refund-destination-fields and posts refundDestination', () => {
    openAndResolvePolicy('MANUAL_REFUND_REQUIRED');
    expect(fixture.debugElement.query(By.css('app-refund-destination-fields'))).not.toBeNull();

    (component as any).destinationForm.get('mode').setValue('promptpay');
    (component as any).destinationForm.get('promptpayPhone').setValue('0812345678');
    fixture.detectChanges();

    (component as any).submit();

    const req = httpMock.expectOne((r) => r.url.endsWith('/cancel'));
    expect(req.request.body).toEqual({
      refundDestination: { type: 'promptpay', promptpayPhone: '0812345678' },
    });
    req.flush({ code: 200, message: 'ok' });
  });
});
