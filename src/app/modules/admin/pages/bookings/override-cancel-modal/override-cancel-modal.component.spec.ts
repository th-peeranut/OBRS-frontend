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
// OBRS-1152: the SHIPPED bundle, not a hand-typed mirror of it — see the
// success-message describe block below for why the mirror had to go.
import enI18n from '../../../../../../../public/i18n/en.json';

// OBRS-699: the WINDOW VERDICT no longer comes from these dates — it comes from
// `cancellationDeadline` on the refund-method response (see
// `refundMethodInfo()` below), because `cancel_window_hours` became
// owner-scoped and this file may not hold a copy of it. The departure still
// drives the summary's DEPARTURE row, and the two sentinels are kept so a
// booking's departure and its deadline can be set to disagree — which is what
// proves the verdict is read off the wire.
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

// OBRS-699: deliberately NOT `departure - 2h`. Both sentinels are hours the
// platform default could never produce from these departures, so a re-introduced
// `CANCEL_WINDOW_HOURS = 2` cannot satisfy any spec below.
const DEADLINE_FUTURE = '2098-12-04T09:17:00Z';
const DEADLINE_PAST = '2001-03-09T13:42:00Z';

/** The refund-method read — since OBRS-699 it is also where the window verdict
 * comes from. `cancellationDeadline: null` = the backend could not resolve a
 * governing operator for this booking. */
function refundMethodInfo(
  cancellationDeadline: string | null,
  overrides: Partial<{
    refundMethod: string;
    destinationRequired: boolean;
    policyRefundRateEarly: number;
    policyRefundRateLate: number;
  }> = {}
) {
  return of({
    code: 200,
    message: 'ok',
    data: {
      refundMethod: 'card',
      destinationRequired: false,
      cancellationDeadline,
      // OBRS-699: never null on the wire (an unresolved operator degrades to the platform
      // read), and deliberately NOT the 80/50 pair the i18n bundle used to hardcode.
      policyRefundRateEarly: 0.9,
      policyRefundRateLate: 0.4,
      ...overrides,
    },
  });
}

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
    api.getBookingRefundMethod.and.returnValue(refundMethodInfo(DEADLINE_FUTURE) as any);
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
    api.getBookingRefundMethod.and.returnValue(refundMethodInfo(DEADLINE_PAST) as any);
    open(OUT_OF_WINDOW);
    expect((component as any).rateChoice).toBe('POLICY');
    expect((component as any).outsideWindow).toBeTrue();
    expect((component as any).reasonRequired).toBeTrue();
    expect(reasonField()).not.toBeNull();
    expect((component as any).canSubmit).toBeFalse();
  });

  // OBRS-699 — the window is the OPERATOR's, read off the refund-method
  // response. Every case here uses a deadline that `departure - 2h` could not
  // produce, so a re-introduced CANCEL_WINDOW_HOURS constant fails them.
  describe('OBRS-699: the cancellation window comes from the wire, not a constant', () => {
    const windowBanner = () => fixture.debugElement.query(By.css('.override-cancel-window'));

    it('is IN-window for a PAST departure when the operator says the deadline has not passed', () => {
      // The pair that a `departure - 2h` derivation cannot satisfy: the trip
      // left in 2000, yet the operator's deadline is in 2098. Only a value read
      // off the response gives "within".
      api.getBookingRefundMethod.and.returnValue(refundMethodInfo(DEADLINE_FUTURE) as any);
      open(OUT_OF_WINDOW);

      expect((component as any).outsideWindow).toBeFalse();
      expect((component as any).reasonRequired).toBeFalse();
      expect(windowBanner().nativeElement.classList).not.toContain('is-violation');
    });

    it('is OUT-of-window for a FUTURE departure when the operator says the deadline has passed', () => {
      // The mirror image: departure in 2099, deadline in 2001.
      api.getBookingRefundMethod.and.returnValue(refundMethodInfo(DEADLINE_PAST) as any);
      open(IN_WINDOW);

      expect((component as any).outsideWindow).toBeTrue();
      expect((component as any).reasonRequired).toBeTrue();
      expect(reasonField()).not.toBeNull();
      expect(windowBanner().nativeElement.classList).toContain('is-violation');
    });

    it('renders the operator deadline in the banner, never a fixed number of hours', () => {
      // The SHIPPED bundle, not a hand-typed mirror (OBRS-1152, same reason as
      // the success-message block below): this has to fail if the key loses its
      // {{deadline}} placeholder, which a stub translation could never notice.
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation(
        'en',
        { ADMIN: { BOOKINGS: { CANCEL_OVERRIDE: (enI18n as any).ADMIN.BOOKINGS.CANCEL_OVERRIDE } } },
        true
      );
      translate.use('en');

      api.getBookingRefundMethod.and.returnValue(refundMethodInfo(DEADLINE_PAST) as any);
      open(IN_WINDOW);

      const label = (component as any).cancellationDeadlineLabel as string;
      expect(label).withContext('a real formatted instant, not the placeholder').not.toBe('-');

      const text = windowBanner().nativeElement.textContent as string;
      expect(text).toContain(label);
      expect(text)
        .withContext('the sentence must not state a fixed window length any more')
        .not.toContain('2-hour');
    });

    it('states NO window at all when the backend could not resolve an operator', () => {
      api.getBookingRefundMethod.and.returnValue(refundMethodInfo(null) as any);
      open(IN_WINDOW);

      expect((component as any).hasCancellationDeadline).toBeFalse();
      expect(windowBanner())
        .withContext('null is "unknown", and "Within the cancellation window" would be an unbacked claim')
        .toBeNull();
      // The modal still works: unknown is not a violation, and FULL still
      // forces the reason on its own.
      expect((component as any).outsideWindow).toBeFalse();
      expect((component as any).canSubmit).toBeTrue();
      (component as any).selectRate('FULL');
      fixture.detectChanges();
      expect((component as any).reasonRequired).toBeTrue();
    });

    it('does not carry one booking’s deadline into the next open', () => {
      api.getBookingRefundMethod.and.returnValue(refundMethodInfo(DEADLINE_PAST) as any);
      open(IN_WINDOW);
      expect((component as any).outsideWindow).toBeTrue();

      // Second booking: the read never resolves, so nothing new arrives.
      api.getBookingRefundMethod.and.returnValue(new Subject<any>() as any);
      open(OUT_OF_WINDOW);

      expect((component as any).hasCancellationDeadline)
        .withContext('the previous booking’s window must not describe this one')
        .toBeFalse();
    });

    // The rates were the OTHER half of this constant, and they were never in TypeScript at all:
    // RATE_POLICY_HINT read "(80% / 50%)" in every bundle, which is the PLATFORM pair. The tab
    // this card ships lets an owner set 90/40, so the sentence was wrong for them on a screen
    // that decides how much money goes back.
    describe('the POLICY rates are the operator’s too', () => {
      const rateHint = () => fixture.debugElement.query(By.css('.admin-hint'));

      function useShippedBundle(): void {
        const translate = TestBed.inject(TranslateService);
        translate.setTranslation(
          'en',
          { ADMIN: { BOOKINGS: { CANCEL_OVERRIDE: (enI18n as any).ADMIN.BOOKINGS.CANCEL_OVERRIDE } } },
          true
        );
        translate.use('en');
      }

      it('states the wire’s pair, and states NEITHER platform number', () => {
        useShippedBundle();
        api.getBookingRefundMethod.and.returnValue(refundMethodInfo(DEADLINE_FUTURE) as any);
        open(IN_WINDOW);

        const text = rateHint().nativeElement.textContent as string;
        expect(text).toContain('90');
        expect(text).toContain('40');
        // The whole defect in one assertion: the wire said 90/40, so 80 and 50 must be nowhere
        // on this line. A literal left behind in any of the three bundles fails here.
        expect(text).withContext(`hint still leaks a platform rate: "${text}"`).not.toMatch(/80|50/);
      });

      it('converts the rate to whole percent at the boundary, not 0.9', () => {
        api.getBookingRefundMethod.and.returnValue(
          refundMethodInfo(DEADLINE_FUTURE, {
            policyRefundRateEarly: 0.75,
            policyRefundRateLate: 0.25,
          }) as any
        );
        open(IN_WINDOW);

        expect((component as any).policyRateEarlyPct).toBe(75);
        expect((component as any).policyRateLatePct).toBe(25);
      });

      it('waits rather than stating half a pair it does not have yet', () => {
        const late = new Subject<any>();
        api.getBookingRefundMethod.and.returnValue(late as any);
        open(IN_WINDOW);

        expect((component as any).hasPolicyRates).toBeFalse();
        expect(rateHint().nativeElement.textContent.trim())
          .withContext('an empty hint beats one quoting a pair nobody set')
          .toBe('');

        late.next({
          code: 200,
          message: 'ok',
          data: {
            refundMethod: 'card',
            destinationRequired: false,
            cancellationDeadline: DEADLINE_FUTURE,
            policyRefundRateEarly: 0.9,
            policyRefundRateLate: 0.4,
          },
        });
        fixture.detectChanges();

        expect((component as any).hasPolicyRates).toBeTrue();
      });

      it('still states 100% for FULL — that one is what FULL MEANS, not a config', () => {
        useShippedBundle();
        const late = new Subject<any>();
        api.getBookingRefundMethod.and.returnValue(late as any);
        open(IN_WINDOW);
        (component as any).selectRate('FULL');
        fixture.detectChanges();

        // No response has landed, so the POLICY hint would be blank — the FULL hint must not be,
        // because it depends on nothing the operator can change.
        expect(rateHint().nativeElement.textContent).toContain('100%');
      });
    });

    it('flips the reason requirement when the deadline lands AFTER open', () => {
      // Production is async: at open the verdict is unknown, so the reason is
      // optional. Without a re-run of applyReasonValidators() in the response
      // handler it would STAY optional over an out-of-window cancel — the AC2
      // gate silently off.
      const late = new Subject<any>();
      api.getBookingRefundMethod.and.returnValue(late as any);
      open(IN_WINDOW);
      expect((component as any).reasonRequired).toBeFalse();

      late.next({
        code: 200,
        message: 'ok',
        data: { refundMethod: 'card', destinationRequired: false, cancellationDeadline: DEADLINE_PAST },
      });
      fixture.detectChanges();

      expect((component as any).reasonRequired).toBeTrue();
      expect((component as any).form.get('reason').valid)
        .withContext('an empty reason must now block submit')
        .toBeFalse();
    });
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
      /**
       * OBRS-1152: loads the REAL `public/i18n/en.json` subtree. It used to be
       * a hand-typed object commented "Mirrors public/i18n/en.json" — and a
       * mirror is not the thing. The parity gate keeps en/th/zh carrying the
       * same KEYS; nothing was checking that the copy this suite asserts on
       * was the copy the owner reads. So the CASH lane could be reworded (or
       * reverted) in the bundle with every assertion below still green, which
       * is the same shape of hole OBRS-1136 shipped through.
       *
       * Pointing at the bundle makes these assertions a gate on the shipped
       * string. Interpolation still has to happen for them to pass, so the
       * `{{refund}}` placeholder is covered too.
       */
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation(
        'en',
        { ADMIN: { BOOKINGS: { CANCEL_OVERRIDE: (enI18n as any).ADMIN.BOOKINGS.CANCEL_OVERRIDE } } },
        true
      );
      translate.use('en');
    });

    /**
     * OBRS-1152 (item 1). This lane had NO test before this card — MANUAL and
     * AUTO below were covered, CASH was not, and that is how the screen shipped
     * saying the opposite of what the door does. `resolveRefundMethod` returns
     * the same literal "CASH" for both cancel doors
     * (`CancellationService.java:271` and `:427`); the ONLY thing separating
     * them is `cashHandedOverNow`, which this door passes as FALSE. So a cash
     * share here is money the owner still OWES — no drawer opens, the row sits
     * in the manual-refund worklist with a NULL destination, and the customer's
     * cancellation email (OBRS-1125 `cash_owed`) has told them since
     * 2026-08-09 that staff will phone for a bank account or PromptPay number.
     *
     * The two assertions that must not be relaxed:
     *  - it does NOT tell the owner to hand cash over (the shipped defect), and
     *  - it names the destination the email promises to ask for, so the owner
     *    and the customer are reading the same instruction.
     *
     * The counter door's own SUCCESS_CASH (`STAFF.CANCEL_BOOKING.MODAL`) is the
     * opposite case and deliberately still says "hand it back in cash" — see
     * counter-cancel-modal.component.spec.ts. Do not "fix" the two to match.
     */
    it('CASH: says the money is NOT handed over and to collect a transfer destination', async () => {
      api.adminOverrideCancelBooking.and.returnValue(overrideCancelResponse('CASH'));
      open(IN_WINDOW);

      await (component as any).submit();

      const message = alert.success.calls.mostRecent().args[0] as string;
      expect(message).toContain('400.00');
      expect(message).toContain('NOT been handed over');
      expect(message).toContain('PromptPay');
      expect(message).not.toContain('in cash');
      expect(message).not.toContain('OK');
      // and not the untranslated key either
      expect(message).not.toContain('ADMIN.BOOKINGS.CANCEL_OVERRIDE');
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
        // OBRS-699: the banner only renders with a deadline, so the state under
        // test has to be armed from the wire — see the guard two lines down.
        api.getBookingRefundMethod.and.returnValue(refundMethodInfo(DEADLINE_PAST) as any);
        open(OUT_OF_WINDOW);
        mountInShell(dark);
        const banner = el('.override-cancel-window');
        expect(banner.classList).toContain('is-violation'); // guard: the state under test is really on
        expect(contrast(fg(banner), effectiveBg(banner))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });
    }
  });
});
