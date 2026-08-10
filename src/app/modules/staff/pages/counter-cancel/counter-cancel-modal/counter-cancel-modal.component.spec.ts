import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { SimpleChange } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
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

/**
 * A REAL success envelope (OBRS-843). Two details matter and both were absent
 * from the fixture this suite used before:
 *
 *  - `message` is `"OK"`. `ApiSuccessRespDto` builds it from
 *    `HttpStatus.OK.getReasonPhrase()`, so it is that literal on every 2xx.
 *    The old fixture said `'Cancelled'`, a plausible sentence no endpoint has
 *    ever returned, which made `response.message ||` look harmless.
 *  - `data` carries `refundAmount`/`refundMethod` — the numbers the counter
 *    actually needs. The old fixture omitted `data` entirely.
 */
function cancelResponse(refundMethod: string, refundAmount: number | string = '450.00') {
  return of({
    code: 200,
    message: 'OK',
    data: {
      bookingId: 42,
      bookingNumber: 'B-000042',
      status: 'cancelled',
      refundAmount,
      refundMethod,
    },
  });
}

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
      'requestCashRefundApproval',
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

  // ── OBRS-844: the cash step-up is a code, not a password ──────────────────
  describe('cash approval code', () => {
    beforeEach(() => {
      api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('CASH') }));
      open();
    });

    it('renders the cash-approval section for a CASH refund', () => {
      expect(fixture.debugElement.query(By.css('.ccm-cash-approval'))).not.toBeNull();
    });

    // The load-bearing assertion of this whole card: there is no longer ANY
    // control on this screen into which a password could be typed. A test that
    // only checked the new field would still pass if the old ones came back.
    it('has no password control at all — the owner authorizes from their own device', () => {
      expect((component as any).form.get('approverEmail')).toBeNull();
      expect((component as any).form.get('approverPassword')).toBeNull();
      expect(fixture.debugElement.query(By.css('input[type=password]'))).toBeNull();
    });

    it('does NOT pre-fill the code field', () => {
      expect((component as any).form.get('approvalCode').value).toBe('');
    });

    it('blocks Confirm until six digits are entered', () => {
      expect((component as any).canSubmit).toBeFalse();

      (component as any).form.get('approvalCode').setValue('1234');
      fixture.detectChanges();
      expect((component as any).canSubmit).toBeFalse();

      // Letters are refused too — the server generates digits only, so anything
      // else is a mistyping worth catching before it burns an attempt.
      (component as any).form.get('approvalCode').setValue('12345a');
      fixture.detectChanges();
      expect((component as any).canSubmit).toBeFalse();

      (component as any).form.get('approvalCode').setValue('246813');
      fixture.detectChanges();
      expect((component as any).canSubmit).toBeTrue();
    });

    it('asks the owner and reports that the request went out', () => {
      api.requestCashRefundApproval.and.returnValue(
        of({
          code: 200,
          message: 'ok',
          data: {
            id: 7,
            bookingId: 42,
            bookingNumber: 'BK-000042',
            refundAmount: 400,
            requestedBy: 'salesperson@obrs.test',
            status: 'PENDING' as const,
            requestedAt: '2026-07-29T10:00:00+07:00',
            codeExpiresAt: null,
          },
        })
      );

      (component as any).requestApproval();
      fixture.detectChanges();

      expect(api.requestCashRefundApproval).toHaveBeenCalledWith(42);
      expect((component as any).approvalState).toBe('requested');
    });

    it('a failed ask re-arms the button rather than leaving it stuck on "sending"', () => {
      api.requestCashRefundApproval.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 500 }))
      );

      (component as any).requestApproval();
      fixture.detectChanges();

      expect((component as any).approvalState).toBe('failed');
      expect((component as any).approverErrorMessage).toBeTruthy();
    });

    it('sends the typed code as approvalCode, and nothing else', () => {
      api.cancelCounterBooking.and.returnValue(cancelResponse('CASH'));
      (component as any).form.get('approvalCode').setValue('246813');
      fixture.detectChanges();

      (component as any).submit();

      expect(api.cancelCounterBooking).toHaveBeenCalledWith(42, { approvalCode: '246813' });
    });
  });

  // ── Server-side error-code branching ──────────────────────────────────────
  describe('submit error handling', () => {
    it('CANCEL_ERROR_APPROVER_INVALID clears the dead code and sends the counter back to asking', () => {
      api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('CASH') }));
      api.cancelCounterBooking.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errorCode: APPROVER_INVALID_CODE, message: 'That code is not valid' },
            })
        )
      );
      open();
      (component as any).approvalState = 'requested';
      (component as any).form.get('approvalCode').setValue('000000');
      fixture.detectChanges();

      (component as any).submit();

      expect((component as any).approverErrorMessage).toBe('That code is not valid');
      // Every case behind this error leaves the code dead — expired, used, wrong
      // booking, burned. Leaving it in the field would invite a retry that can
      // only fail, and each retry counts against the request's attempt limit.
      expect((component as any).form.get('approvalCode').value).toBe('');
      expect((component as any).approvalState).toBe('idle');
      expect((component as any).errorMessage).toBe('');
    });

    it('CANCEL_ERROR_APPROVER_SELF uses the modal\'s own copy, never the backend wording', () => {
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
      (component as any).form.get('approvalCode').setValue('246813');
      fixture.detectChanges();

      (component as any).submit();

      expect((component as any).approverErrorMessage).toBe('STAFF.CANCEL_BOOKING.MODAL.APPROVER_SELF');
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
    api.cancelCounterBooking.and.returnValue(cancelResponse('card'));
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

  // ── The success message itself (OBRS-843) ─────────────────────────────────
  //
  // The test above is the one that was here before, and it passed for the whole
  // life of the defect: `toHaveBeenCalled()` does not look at the argument, so
  // the dialog could have said anything -- and it said "OK", because
  // `response.message` is `HttpStatus.OK.getReasonPhrase()` and won the `||`.
  // Every test below asserts the VALUE.
  //
  // Translations are loaded from real fixtures rather than left as bare keys
  // (the default in this suite) for two reasons: the message is only correct if
  // the refund amount is interpolated INTO it, and a key the component names but
  // the bundle does not have would return the raw key and fail these
  // assertions -- which is what makes them a check on the shipped copy and not
  // just on the component's branching. Values mirror public/i18n/en.json; the
  // i18n parity gate keeps en/th/zh carrying the same keys.
  describe('success message (OBRS-843)', () => {
    beforeEach(() => {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation(
        'en',
        {
          STAFF: {
            CANCEL_BOOKING: {
              MODAL: {
                SUCCESS: 'The booking has been cancelled.',
                SUCCESS_CASH: 'Booking cancelled — hand {{refund}} back to the customer in cash.',
                SUCCESS_MANUAL:
                  'Booking cancelled. The {{refund}} refund will be transferred by the owner later — do not pay cash at the counter.',
                SUCCESS_AUTO:
                  'Booking cancelled. {{refund}} is being refunded to the method the customer paid with — do not pay cash at the counter.',
              },
            },
          },
        },
        true
      );
      translate.use('en');
    });

    function submitCash(): void {
      api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('CASH') }));
      api.cancelCounterBooking.and.returnValue(cancelResponse('CASH'));
      open();
      (component as any).form.get('approvalCode').setValue('246813');
      fixture.detectChanges();
      (component as any).submit();
    }

    it('CASH: tells the salesperson exactly how much cash to hand back', () => {
      submitCash();

      const message = alert.success.calls.mostRecent().args[0] as string;
      expect(message).toContain('450.00');
      expect(message).toContain('in cash');
    });

    it('CASH: does NOT say "OK" — the defect the owner photographed', () => {
      submitCash();

      const message = alert.success.calls.mostRecent().args[0] as string;
      expect(message).not.toBe('OK');
      expect(message).not.toContain('OK');
      // and it is not the untranslated key either
      expect(message).not.toContain('STAFF.CANCEL_BOOKING.MODAL');
    });

    it('MANUAL: names the amount and tells the counter NOT to pay cash', () => {
      api.getCancelPolicy.and.returnValue(
        of({ code: 200, message: 'ok', data: policyWith('MANUAL_REFUND_REQUIRED') })
      );
      api.cancelCounterBooking.and.returnValue(cancelResponse('MANUAL_REFUND_REQUIRED'));
      open();
      (component as any).destinationForm.get('mode').setValue('promptpay');
      (component as any).destinationForm.get('promptpayPhone').setValue('0812345678');
      fixture.detectChanges();

      (component as any).submit();

      const message = alert.success.calls.mostRecent().args[0] as string;
      expect(message).toContain('450.00');
      expect(message).toContain('transferred by the owner');
      expect(message).toContain('do not pay cash');
    });

    it('AUTO (card): says the gateway is refunding, and still names the amount', () => {
      api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('card') }));
      api.cancelCounterBooking.and.returnValue(cancelResponse('CREDIT_CARD'));
      open();

      (component as any).submit();

      const message = alert.success.calls.mostRecent().args[0] as string;
      expect(message).toContain('450.00');
      expect(message).toContain('refunded to the method the customer paid with');
    });

    it('reads the lane from the RESPONSE, not from the policy preview', () => {
      // Preview said card; by the time the cancel ran, the backend resolved the
      // booking to cash. The confirmation must follow the response, because that
      // is the one that describes money that actually moved.
      api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('card') }));
      api.cancelCounterBooking.and.returnValue(cancelResponse('CASH', '125.50'));
      open();

      (component as any).submit();

      const message = alert.success.calls.mostRecent().args[0] as string;
      expect(message).toContain('in cash');
      expect(message).toContain('125.50');
    });

    it('falls back to the bare confirmation when the body carries no data', () => {
      api.getCancelPolicy.and.returnValue(of({ code: 200, message: 'ok', data: policyWith('card') }));
      api.cancelCounterBooking.and.returnValue(of({ code: 200, message: 'OK' } as any));
      open();

      (component as any).submit();

      expect(alert.success.calls.mostRecent().args[0]).toBe('The booking has been cancelled.');
    });
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

  // ── OBRS-1136 AC-3, staff side ────────────────────────────────────────────
  //
  // The customer's own cancel dialog got this pinned when the card shipped; this
  // screen got the code and no assertion, so `policyWith()` never carried
  // `manualRefundDueDays` and every one of the cases above rendered the
  // timing-FREE fallback while passing. A green suite therefore said nothing
  // about the branch the card exists for.
  //
  // Real translations here rather than the bare-key rendering the rest of this
  // file relies on, for the same reason the customer suite does it: the defect
  // being guarded is a sentence with a HOLE where the number should be, and only
  // interpolation can show that.
  describe('the manual-refund wait (OBRS-1136 AC-3)', () => {
    function renderWith(refundMethod: string, manualRefundDueDays?: number): void {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation(
        'en',
        {
          MY_BOOKINGS: {
            CANCEL: {
              MANUAL_REFUND_NOTE: 'Our staff will transfer your refund.',
              MANUAL_REFUND_NOTE_DUE: 'Our staff will transfer your refund within {{days}} days.',
            },
          },
        },
        true
      );
      translate.use('en');

      api.getCancelPolicy.and.returnValue(
        of({ code: 200, message: 'ok', data: { ...policyWith(refundMethod), manualRefundDueDays } })
      );
      open();
    }

    const note = () => fixture.debugElement.query(By.css('.ccm-policy .admin-hint'));

    // 11, never 7: 7 is the shipped default of MANUAL_REFUND_DUE_DAYS, so a screen that
    // had gone back to typing the wait into i18n would still read 7 and this test could
    // not tell the difference.
    it('states the wait the /cancel-policy quote carried — 11, not a number typed into i18n', () => {
      renderWith('MANUAL_REFUND_REQUIRED', 11);

      expect(note().nativeElement.textContent).toContain('within 11 days');
      expect(note().nativeElement.textContent).not.toContain('{{');
    });

    // Netlify and Koyeb deploy separately, so for minutes on every release this build is
    // live against a backend that does not send the field. The salesperson must then read
    // the honest timing-free sentence out loud, never "within  days".
    it('falls back to the timing-free note when the backend did not send the number', () => {
      renderWith('MANUAL_REFUND_REQUIRED', undefined);

      expect(note().nativeElement.textContent.trim()).toBe('Our staff will transfer your refund.');
      expect(note().nativeElement.textContent).not.toContain('within');
    });

    // The lane semantics the backend pins on the notification side: this key measures the
    // wait on money still OWED. Cash handed across the counter is already settled, so a
    // wait quoted here would be a promise about money the customer is walking out with.
    it('says nothing about a wait on the CASH lane, even when the quote carries the number', () => {
      renderWith('CASH', 11);

      expect(note()).toBeNull();
    });
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

  it('FE-2/OBRS-844: cash posts approvalCode and nothing else — no credential key survives', () => {
    openAndResolvePolicy('CASH');
    (component as any).form.get('approvalCode').setValue('246813');
    fixture.detectChanges();

    (component as any).submit();

    const req = httpMock.expectOne((r) => r.url.endsWith('/cancel'));
    // Asserted on the wire bytes, not a matcher's opinion: the point of this
    // block is that no `approverEmail`/`approverPassword` key can survive as an
    // undefined-valued property, and toEqual would not see one.
    expect(JSON.stringify(req.request.body)).toBe('{"approvalCode":"246813"}');
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
