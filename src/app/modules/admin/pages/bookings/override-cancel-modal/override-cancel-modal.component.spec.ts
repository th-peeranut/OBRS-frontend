import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { SimpleChange } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { Subject, of, throwError } from 'rxjs';
import { errorCodeFromMessageKey } from '../../../../../shared/lib/api-error-code';
import { OverrideCancelModalComponent } from './override-cancel-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { AdminApiService, AdminBookingDetailDto } from '../../../../../services/admin/admin-api.service';
import { AppRefundDestinationFieldsComponent } from '../../../../../shared/components/refund-destination-fields/refund-destination-fields.component';
import { AlertService } from '../../../../../shared/services/alert.service';
import { AA_NORMAL_TEXT, contrast, effectiveBg, fgOf } from '../../../../../testing/contrast';

// Far future → inside the cancellation window; far past → out-of-window. Using
// fixed sentinel dates keeps the window check deterministic without faking the
// clock.
function bookingWithDeparture(departure: string): AdminBookingDetailDto {
  return {
    id: 42,
    bookingNumber: '#BK-42',
    status: { code: 'confirmed', label: 'Confirmed' },
    journeys: [
      {
        fromStop: { code: 'a', label: 'A' },
        toStop: { code: 'b', label: 'B' },
        departureDateTime: departure,
      },
    ],
  };
}

const IN_WINDOW = bookingWithDeparture('2099-01-01T00:00:00Z');
const OUT_OF_WINDOW = bookingWithDeparture('2000-01-01T00:00:00Z');

// OBRS-839: the wire form, DERIVED from the messageKey exactly as
// `DomainException.getErrorCode()` does it — never hand-typed, and never the
// dotted messageKey this spec used to mock (which is what let the component's
// unmatchable comparison ship green).
const DESTINATION_REQUIRED_CODE = errorCodeFromMessageKey('cancel.error.refund-destination-required');

/** OBRS-843: the real success envelope — `message` is the reason phrase "OK",
 * and the outcome the dialog must report lives in `data`. */
function overrideCancelResponse(refundMethod: string, refundAmount: number | string = '400.00') {
  return of({
    code: 200,
    message: 'OK',
    data: {
      bookingId: 42,
      bookingNumber: '#BK-42',
      status: 'cancelled',
      refundAmount,
      refundMethod,
    },
  });
}

describe('OverrideCancelModalComponent (OBRS-690)', () => {
  let fixture: ComponentFixture<OverrideCancelModalComponent>;
  let component: OverrideCancelModalComponent;
  let api: jasmine.SpyObj<AdminApiService>;
  let alert: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<AdminApiService>('AdminApiService', [
      'adminOverrideCancelBooking',
      'getBookingRefundMethod',
    ]);
    // Default every spec to an already-resolved, non-required destination —
    // the pre-existing tests below assert the AC1/AC2 reason behaviour and
    // don't care about the destination fields at all; the OBRS-286-specific
    // `describe` blocks override this per-case.
    api.getBookingRefundMethod.and.returnValue(
      of({ code: 200, message: 'ok', data: { refundMethod: 'card', destinationRequired: false } })
    );
    alert = jasmine.createSpyObj<AlertService>('AlertService', ['success', 'error']);
    alert.success.and.resolveTo(undefined as any);
    alert.error.and.resolveTo(undefined as any);

    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [
        OverrideCancelModalComponent,
        AdminModalBackdropDirective,
        AppRefundDestinationFieldsComponent,
      ],
      providers: [
        { provide: AdminApiService, useValue: api },
        { provide: AlertService, useValue: alert },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OverrideCancelModalComponent);
    component = fixture.componentInstance;
  });

  // Open the dialog the way the parent's template binding would: set inputs,
  // then let Angular's ngOnChanges reset the form + validators.
  function open(booking: AdminBookingDetailDto): void {
    component.booking = booking;
    component.isOpen = true;
    component.ngOnChanges({ isOpen: new SimpleChange(false, true, true) });
    fixture.detectChanges();
  }

  const reasonField = () =>
    fixture.debugElement.query(By.css('textarea[formControlName="reason"]'));

  it('does not render when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.admin-modal-backdrop'))).toBeNull();
  });

  it('AC2: hides the reason field for an in-window POLICY cancel', () => {
    open(IN_WINDOW);
    expect((component as any).reasonRequired).toBeFalse();
    expect(reasonField()).toBeNull();
    expect((component as any).canSubmit).toBeTrue();
  });

  it('AC1: renders two rate buttons, never a numeric input', () => {
    open(IN_WINDOW);
    const rateButtons = fixture.debugElement.queryAll(By.css('.override-rate-btn'));
    expect(rateButtons.length).toBe(2);
    expect(fixture.debugElement.query(By.css('input[type="number"]'))).toBeNull();
  });

  it('AC2: choosing FULL reveals the reason field and blocks submit until it is filled', () => {
    open(IN_WINDOW);
    (component as any).selectRate('FULL');
    fixture.detectChanges();

    expect((component as any).reasonRequired).toBeTrue();
    expect(reasonField()).not.toBeNull();
    expect((component as any).canSubmit).toBeFalse();

    (component as any).form.get('reason').setValue('full refund authorised by owner');
    fixture.detectChanges();
    expect((component as any).canSubmit).toBeTrue();
  });

  it('AC2: an out-of-window POLICY cancel still requires a reason (window is a rule-break)', () => {
    open(OUT_OF_WINDOW);
    expect((component as any).rateChoice).toBe('POLICY');
    expect((component as any).outsideWindow).toBeTrue();
    expect((component as any).reasonRequired).toBeTrue();
    expect(reasonField()).not.toBeNull();
    expect((component as any).canSubmit).toBeFalse();
  });

  it('submits POLICY with no reason for an in-window cancel and emits cancelled + closed', async () => {
    api.adminOverrideCancelBooking.and.returnValue(overrideCancelResponse('MANUAL_REFUND_REQUIRED'));
    const cancelled = jasmine.createSpy('cancelled');
    const closed = jasmine.createSpy('closed');
    component.cancelled.subscribe(cancelled);
    component.closed.subscribe(closed);

    open(IN_WINDOW);
    await (component as any).submit();

    expect(api.adminOverrideCancelBooking).toHaveBeenCalledWith(42, {
      rateChoice: 'POLICY',
      reason: undefined,
      refundDestination: undefined,
    });
    expect(cancelled).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
    expect(alert.success).toHaveBeenCalled();
  });

  // OBRS-843: the confirmation the OWNER reads, asserted by VALUE. Before this
  // card it was `response.message` — `HttpStatus.OK.getReasonPhrase()` — so the
  // dialog said "OK" and this suite's `toHaveBeenCalled()` could not tell.
  describe('success message (OBRS-843)', () => {
    beforeEach(() => {
      // Mirrors public/i18n/en.json; the parity gate keeps en/th/zh in step.
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation(
        'en',
        {
          ADMIN: {
            BOOKINGS: {
              CANCEL_OVERRIDE: {
                SUCCESS: 'Booking cancelled.',
                SUCCESS_CASH: 'Booking cancelled. {{refund}} must be handed back to the customer in cash.',
                SUCCESS_MANUAL:
                  'Booking cancelled. The {{refund}} refund has not been paid yet — you need to transfer it to the customer.',
                SUCCESS_AUTO:
                  'Booking cancelled. {{refund}} is being refunded to the method the customer paid with.',
              },
            },
          },
        },
        true
      );
      translate.use('en');
    });

    it('MANUAL: names the amount the owner still owes and says it is unpaid', async () => {
      api.adminOverrideCancelBooking.and.returnValue(overrideCancelResponse('MANUAL_REFUND_REQUIRED'));
      open(IN_WINDOW);

      await (component as any).submit();

      const message = alert.success.calls.mostRecent().args[0] as string;
      expect(message).toContain('400.00');
      expect(message).toContain('has not been paid yet');
      expect(message).not.toContain('OK');
    });

    it('AUTO: says the gateway is refunding, and names the amount', async () => {
      api.adminOverrideCancelBooking.and.returnValue(overrideCancelResponse('CREDIT_CARD', '212.50'));
      open(IN_WINDOW);

      await (component as any).submit();

      const message = alert.success.calls.mostRecent().args[0] as string;
      expect(message).toContain('212.50');
      expect(message).toContain('refunded to the method the customer paid with');
    });

    it('falls back to the bare confirmation when the body carries no data', async () => {
      api.adminOverrideCancelBooking.and.returnValue(of({ code: 200, message: 'OK' } as any));
      open(IN_WINDOW);

      await (component as any).submit();

      expect(alert.success.calls.mostRecent().args[0]).toBe('Booking cancelled.');
    });
  });

  it('submits FULL with the trimmed reason', async () => {
    api.adminOverrideCancelBooking.and.returnValue(overrideCancelResponse('MANUAL_REFUND_REQUIRED'));
    open(IN_WINDOW);
    (component as any).selectRate('FULL');
    (component as any).form.get('reason').setValue('  goodwill full refund  ');
    fixture.detectChanges();

    await (component as any).submit();

    expect(api.adminOverrideCancelBooking).toHaveBeenCalledWith(42, {
      rateChoice: 'FULL',
      reason: 'goodwill full refund',
      refundDestination: undefined,
    });
  });

  it('keeps the dialog open and shows an inline error when the API fails', async () => {
    api.adminOverrideCancelBooking.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: 'Booking is not confirmed' },
          })
      )
    );
    const closed = jasmine.createSpy('closed');
    component.closed.subscribe(closed);

    open(IN_WINDOW);
    await (component as any).submit();

    expect((component as any).errorMessage).toBe('Booking is not confirmed');
    expect(closed).not.toHaveBeenCalled();
  });

  // ── OBRS-286 Flow A3: refund-destination requirement ───────────────────────
  describe('refund-destination requirement (OBRS-286)', () => {
    it('blocks Confirm while the refund-method check is loading, without mounting a form', () => {
      const pending = new Subject<any>();
      api.getBookingRefundMethod.and.returnValue(pending as any);

      open(IN_WINDOW);

      expect((component as any).refundMethodState).toBe('loading');
      expect((component as any).canSubmit).toBeFalse();
      expect(fixture.debugElement.query(By.css('app-refund-destination-fields'))).toBeNull();
    });

    it('mounts the destination fields, required, once resolved destinationRequired=true', () => {
      api.getBookingRefundMethod.and.returnValue(
        of({ code: 200, message: 'ok', data: { refundMethod: 'qr_promptpay', destinationRequired: true } })
      );

      open(IN_WINDOW);

      expect((component as any).refundMethodState).toBe('resolved');
      expect(fixture.debugElement.query(By.css('app-refund-destination-fields'))).not.toBeNull();
      expect((component as any).canSubmit).toBeFalse(); // no destination filled in yet
    });

    it('does not mount the destination fields when resolved destinationRequired=false', () => {
      api.getBookingRefundMethod.and.returnValue(
        of({ code: 200, message: 'ok', data: { refundMethod: 'card', destinationRequired: false } })
      );

      open(IN_WINDOW);

      expect(fixture.debugElement.query(By.css('app-refund-destination-fields'))).toBeNull();
      expect((component as any).canSubmit).toBeTrue();
    });

    it('on a failed check, renders the fields as OPTIONAL with a retry affordance, and does not block Confirm', () => {
      api.getBookingRefundMethod.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

      open(IN_WINDOW);

      expect((component as any).refundMethodState).toBe('error');
      expect(fixture.debugElement.query(By.css('app-refund-destination-fields'))).not.toBeNull();
      // Optional: a fresh (untouched) form is still valid, so Confirm is not
      // blocked by this state alone.
      expect((component as any).canSubmit).toBeTrue();
      expect(fixture.debugElement.query(By.css('.override-cancel-destination-advisory'))).not.toBeNull();
    });

    it('retryCheck() re-issues the GET without touching anything already typed', () => {
      api.getBookingRefundMethod.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      open(IN_WINDOW);
      (component as any).form.get('reason').setValue('kept');

      api.getBookingRefundMethod.and.returnValue(
        of({ code: 200, message: 'ok', data: { refundMethod: 'card', destinationRequired: false } })
      );
      (component as any).retryCheck();
      fixture.detectChanges();

      expect((component as any).refundMethodState).toBe('resolved');
      expect((component as any).form.get('reason').value).toBe('kept');
    });

    it('belt-and-braces: a submit-time destination-error 400 mounts the fields as required and shows a dedicated inline message, modal stays open', async () => {
      api.getBookingRefundMethod.and.returnValue(
        of({ code: 200, message: 'ok', data: { refundMethod: 'card', destinationRequired: false } })
      );
      api.adminOverrideCancelBooking.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errorCode: DESTINATION_REQUIRED_CODE, message: 'A destination is required' },
            })
        )
      );
      const closed = jasmine.createSpy('closed');
      component.closed.subscribe(closed);

      open(IN_WINDOW);
      await (component as any).submit();
      fixture.detectChanges();

      expect((component as any).destinationRequired).toBeTrue();
      expect((component as any).destinationErrorMessage).toBe('A destination is required');
      expect((component as any).errorMessage).toBe(''); // never the generic banner
      expect(fixture.debugElement.query(By.css('app-refund-destination-fields'))).not.toBeNull();
      expect(closed).not.toHaveBeenCalled();

      // OBRS-839: assert the message the OWNER can actually READ, not just the
      // field it was assigned to. This test passed for the entire life of the
      // defect because it mocked the dotted `messageKey` the component compared
      // against — test and code agreed with each other and both disagreed with
      // the backend, so `destinationErrorMessage` was set from a code no real
      // response carries. With the wire code above, a regression to the dotted
      // form leaves this element unrendered.
      const inlineError = fixture.debugElement.query(By.css('.admin-error'));
      expect(inlineError).not.toBeNull();
      expect(inlineError.nativeElement.textContent.trim()).toBe('A destination is required');
    });

    it('OBRS-839 (must-NOT-match): a DOTTED messageKey is not treated as a destination error', async () => {
      // The mirror image of the test above, and the reason it is worth having:
      // a green suite is only evidence if the assertion can fail. The dotted
      // form is what the wire NEVER carries, so it must fall through to the
      // generic banner. If someone reverts the comparison to the dotted form,
      // the test above keeps passing (it would match again) — this one is what
      // turns red.
      api.getBookingRefundMethod.and.returnValue(
        of({ code: 200, message: 'ok', data: { refundMethod: 'card', destinationRequired: false } })
      );
      api.adminOverrideCancelBooking.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: {
                errorCode: 'cancel.error.refund-destination-required',
                message: 'A destination is required',
              },
            })
        )
      );

      open(IN_WINDOW);
      await (component as any).submit();
      fixture.detectChanges();

      expect((component as any).destinationErrorMessage).toBe('');
      expect((component as any).errorMessage).toBe('A destination is required');
    });
  });

  // ── OBRS-721: dark-mode contrast, measured ─────────────────────────────────
  //
  // Why a spec and not the token gate: `check-admin-theme-tokens.mjs` can only ask
  // "is this token declared?". All three defects it missed here were about the
  // token being WRONG, not absent:
  //   * --admin-muted-bg / --admin-text-muted were never declared, so the panel
  //     fell through to a hard-coded light-mode wash and the dt silently inherited
  //     body text (measured on SIT: panel #1c2024, DARKER than the #1d2226 card it
  //     sits on, and dt identical to dd);
  //   * --admin-danger-text IS declared and passes the gate, but it is DARK_EXEMPT
  //     on purpose -- it is the dark half of a pastel chip pair, not a standalone
  //     text colour. Used bare on .is-violation it rendered 1.71:1 on the dark
  //     card: the exact ratio .admin-btn-danger shipped at in OBRS-520.
  // A ratio the browser computes cannot be argued with, so measure it here. These
  // run in ChromeHeadless with src/styles.scss (which @imports admin-theme.scss)
  // loaded by the karma `styles` array, so the var() chain resolves exactly as
  // production does. Related: OBRS-726 (same misuse at 3 other call sites).
  //
  // OBRS-726: the three helpers below (`rgba`, `effectiveBg`, `contrast`) were
  // written inline here and now live in `src/app/testing/contrast.ts`, because
  // three more component specs needed exactly this measurement. One
  // implementation means a fix to the compositing walk cannot be right in one
  // spec and stale in another — and this block, whose numbers were verified
  // against a real SIT screen, is the regression test for that shared code.
  describe('dark-mode contrast of the muted + danger text (OBRS-721)', () => {
    let shell: HTMLElement | null = null;

    /** Move the component host inside a real .admin-shell so --admin-* resolves. */
    function mountInShell(dark: boolean): void {
      shell = document.createElement('div');
      shell.className = dark ? 'admin-shell theme-admin is-dark' : 'admin-shell theme-admin';
      document.body.appendChild(shell);
      shell.appendChild(fixture.nativeElement);
      fixture.detectChanges();
    }

    afterEach(() => {
      shell?.remove();
      shell = null;
    });

    const el = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;
    const fg = fgOf;

    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light';

      it(`${mode}: the summary label is muted, not inherited body text`, () => {
        open(IN_WINDOW);
        mountInShell(dark);
        // An undeclared token with no fallback resolves to nothing and the label
        // inherits -- visually identical to its own value, which is the bug.
        expect(getComputedStyle(el('.override-cancel-summary dt')).color).not.toBe(
          getComputedStyle(el('.override-cancel-summary dd')).color
        );
      });

      it(`${mode}: summary label meets AA on the summary panel`, () => {
        open(IN_WINDOW);
        mountInShell(dark);
        const ratio = contrast(
          fg(el('.override-cancel-summary dt')),
          effectiveBg(el('.override-cancel-summary'))
        );
        expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });

      it(`${mode}: the out-of-window violation banner meets AA on the modal card`, () => {
        open(OUT_OF_WINDOW);
        mountInShell(dark);
        const banner = el('.override-cancel-window');
        expect(banner.classList).toContain('is-violation'); // guard: the state under test is really on
        expect(contrast(fg(banner), effectiveBg(banner))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });
    }
  });
});
