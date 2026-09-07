import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { CancelBookingModalComponent } from './cancel-booking-modal.component';
import { AppRefundDestinationFieldsComponent } from '../../../../shared/components/refund-destination-fields/refund-destination-fields.component';
import { CancellationPolicy, MyBookingView } from '../../../../shared/interfaces/my-booking.interface';
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';
import { PendingButtonDirective } from '../../../../shared/directives/pending-button.directive';

function buildBooking(): MyBookingView {
  return {
    id: 5,
    bookingNumber: 'B-5',
    statusCode: 'confirmed',
    bookingType: 'one_way',
    route: 'A -> B',
    departureLabel: '21/12/2026',
    passengerCount: 1,
    totalAmount: 500,
    totalAmountLabel: '฿500.00',
    createdLabel: '01/12/2026',
    cancellable: true,
    paid: true,
    rescheduleEligible: false,
    rescheduleReasonKey: null,
    changeSeatEligible: false,
    changeSeatReasonKey: null,
    changeStopEligible: false,
    changeStopReasonKey: null,
  };
}

function buildPolicy(): CancellationPolicy {
  return {
    originalAmount: 500,
    refundAmount: 400,
    penaltyAmount: 100,
    refundRatePercent: '80%',
    refundMethod: 'MANUAL_REFUND_REQUIRED',
    policyWindow: '24h',
    // OBRS-699: the reschedule offer's horizon rides on the cancel quote, so
    // the operator selling this trip is the one who sets it.
    rescheduleMaxDaysAhead: 60,
  };
}

describe('CancelBookingModalComponent (OBRS-286, one screen since OBRS-942)', () => {
  let fixture: ComponentFixture<CancelBookingModalComponent>;
  let component: CancelBookingModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [
        CancelBookingModalComponent,
        AppRefundDestinationFieldsComponent,
        PendingButtonDirective,
        LoadingStateComponent,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CancelBookingModalComponent);
    component = fixture.componentInstance;
    component.booking = buildBooking();
    component.policy = buildPolicy();
    fixture.detectChanges();
  });

  it('starts with no destination mode chosen and Confirm disabled (AC-1: no pre-selection)', () => {
    expect((component as any).form.get('mode').value).toBeNull();
    const confirmBtn = fixture.debugElement.query(By.css('.btn-primary'));
    expect(confirmBtn.nativeElement.disabled).toBeTrue();
  });

  it('enables Confirm once a valid promptpay destination is filled in', () => {
    const form = (component as any).form;
    form.get('mode').setValue('promptpay');
    form.get('promptpayPhone').setValue('0812345678');
    fixture.detectChanges();

    const confirmBtn = fixture.debugElement.query(By.css('.btn-primary'));
    expect(confirmBtn.nativeElement.disabled).toBeFalse();
  });

  it('emits confirmed with the mapped refundDestination payload and sets submitting', () => {
    const confirmed = jasmine.createSpy('confirmed');
    component.confirmed.subscribe(confirmed);

    const form = (component as any).form;
    form.get('mode').setValue('bank_account');
    form.get('accountName').setValue('Somchai');
    form.get('bank').setValue('KBank');
    form.get('accountNumber').setValue('1234567890');
    fixture.detectChanges();

    fixture.debugElement.query(By.css('.btn-primary')).nativeElement.click();

    expect(confirmed).toHaveBeenCalledWith({
      refundDestination: {
        type: 'bank_account',
        accountName: 'Somchai',
        bank: 'KBank',
        accountNumber: '1234567890',
      },
    });
    expect(component['submitting']).toBeTrue();
  });

  it('emits dismissed when the close button is clicked (not mid-submit)', () => {
    const dismissed = jasmine.createSpy('dismissed');
    component.dismissed.subscribe(dismissed);

    fixture.debugElement.query(By.css('.crdm-modal__close')).nativeElement.click();
    expect(dismissed).toHaveBeenCalled();
  });

  it('does not dismiss while a submit is in flight', () => {
    const dismissed = jasmine.createSpy('dismissed');
    component.dismissed.subscribe(dismissed);
    (component as any).submitting = true;

    fixture.debugElement.query(By.css('.crdm-modal__close')).nativeElement.click();
    expect(dismissed).not.toHaveBeenCalled();
  });

  // OBRS-910: the Confirm button's hand-rolled `<span class="spinner">` was
  // replaced with `[appPending]="submitting"` — `disabled` stays bound to
  // `!canSubmit` (form validity), a SEPARATE flag from `submitting`, which is
  // exactly what proves AC-4's two polarities on one button.
  describe('OBRS-910 pending button state', () => {
    it('AC-4: disabled for an unrelated reason (invalid form, not submitting) shows neither a visible spinner nor aria-busy', () => {
      // default fixture: no destination chosen -> form invalid -> disabled,
      // and submitting is still false.
      const confirmBtn = fixture.debugElement.query(By.css('.btn-primary')).nativeElement as HTMLButtonElement;

      expect(confirmBtn.disabled).toBeTrue();
      expect(confirmBtn.getAttribute('aria-busy')).toBeNull();
      const ring = confirmBtn.querySelector('.loading-state-ring') as HTMLElement;
      expect(getComputedStyle(ring).visibility).toBe('hidden');
    });

    it('AC-4 / AC-2: submitting shows a visible spinner and aria-busy', () => {
      (component as any).submitting = true;
      fixture.detectChanges();

      const confirmBtn = fixture.debugElement.query(By.css('.btn-primary')).nativeElement as HTMLButtonElement;
      expect(confirmBtn.getAttribute('aria-busy')).toBe('true');
      const ring = confirmBtn.querySelector('.loading-state-ring') as HTMLElement;
      expect(getComputedStyle(ring).visibility).toBe('visible');
    });

    it('AC-3: keeps the Confirm button-s rendered width identical, and pins the ring to 16px, across the pending toggle', () => {
      const form = (component as any).form;
      form.get('mode').setValue('promptpay');
      form.get('promptpayPhone').setValue('0812345678');
      fixture.detectChanges();
      const confirmBtn = fixture.debugElement.query(By.css('.btn-primary')).nativeElement as HTMLButtonElement;
      const before = confirmBtn.getBoundingClientRect().width;

      (component as any).submitting = true;
      fixture.detectChanges();
      const ring = confirmBtn.querySelector('.loading-state-ring') as HTMLElement;
      expect(getComputedStyle(ring).width).toBe('16px');
      expect(confirmBtn.getBoundingClientRect().width).toBeCloseTo(before, 0);

      (component as any).submitting = false;
      fixture.detectChanges();
      expect(confirmBtn.getBoundingClientRect().width).toBeCloseTo(before, 0);
    });
  });

  // --- OBRS-813: the reschedule offer ---

  it('OBRS-813: no offer when the booking is not reschedule-eligible (the default fixture)', () => {
    expect(fixture.debugElement.query(By.css('.crdm-offer'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.crdm-subheading'))).toBeNull();
  });

  it('OBRS-813: an eligible booking is offered the reschedule door, quoting the SERVER originalAmount', () => {
    component.booking = { ...buildBooking(), rescheduleEligible: true };
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.crdm-offer'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.crdm-offer__cta'))).not.toBeNull();

    // The 100%-kept figure is `policy.originalAmount`, NOT a number the FE
    // derived — the card's AC-2. Asserted on the getter rather than the
    // rendered text because `TranslateModule.forRoot()` here has no catalogue:
    // it echoes the KEY and drops the interpolation params, so a DOM assertion
    // would be measuring ngx-translate's fallback, not this component.
    // The rendered path is covered in the gate lane
    // (e2e/tests/obrs-813-cancel-offers-reschedule.spec.ts).
    component.policy = { ...buildPolicy(), originalAmount: 777, refundAmount: 400 };
    expect(component['originalAmountLabel']).toContain('777');
    expect(component['refundLabel']).toContain('400');
  });

  // OBRS-699: the horizon in the offer is the operator's, off the cancel quote.
  // 90 is a value no constant in this repo ever held, so a re-introduced
  // literal cannot satisfy this.
  it('OBRS-699: the offer quotes the horizon the server put on the cancel quote', () => {
    component.booking = { ...buildBooking(), rescheduleEligible: true };
    component.policy = { ...buildPolicy(), rescheduleMaxDaysAhead: 90 };
    fixture.detectChanges();

    expect(component['rescheduleMaxDaysAhead']).toBe(90);
    expect(fixture.debugElement.queryAll(By.css('.crdm-offer__points li')).length)
      .withContext('all four bullets render while the horizon is known')
      .toBe(4);
  });

  it('OBRS-699: the within-days bullet is omitted when the server stated no horizon', () => {
    // A blank or "null" mid-sentence is worse than saying nothing: the rest of
    // the offer is still true and still worth showing.
    component.booking = { ...buildBooking(), rescheduleEligible: true };
    component.policy = { ...buildPolicy(), rescheduleMaxDaysAhead: undefined };
    fixture.detectChanges();

    expect(component['rescheduleMaxDaysAhead']).toBeNull();
    expect(fixture.debugElement.query(By.css('.crdm-offer')))
      .withContext('the offer itself survives — only the one unknown bullet drops')
      .not.toBeNull();
    expect(fixture.debugElement.queryAll(By.css('.crdm-offer__points li')).length).toBe(3);
  });

  it('OBRS-813: the offer emits rescheduleRequested and cancels nothing', () => {
    const rescheduleRequested = jasmine.createSpy('rescheduleRequested');
    const confirmed = jasmine.createSpy('confirmed');
    component.rescheduleRequested.subscribe(rescheduleRequested);
    component.confirmed.subscribe(confirmed);
    component.booking = { ...buildBooking(), rescheduleEligible: true };
    fixture.detectChanges();

    fixture.debugElement.query(By.css('.crdm-offer__cta')).nativeElement.click();

    expect(rescheduleRequested).toHaveBeenCalled();
    expect(confirmed).not.toHaveBeenCalled();
    expect(component['submitting']).toBeFalse();
  });

  it('OBRS-813: adding the offer does not move the cancel path — still one click on Confirm', () => {
    const confirmed = jasmine.createSpy('confirmed');
    component.confirmed.subscribe(confirmed);
    component.booking = { ...buildBooking(), rescheduleEligible: true };
    const form = (component as any).form;
    form.get('mode').setValue('promptpay');
    form.get('promptpayPhone').setValue('0812345678');
    fixture.detectChanges();

    const confirmBtn = fixture.debugElement.query(By.css('.btn-primary'));
    expect(confirmBtn.nativeElement.disabled).toBeFalse();
    confirmBtn.nativeElement.click();

    expect(confirmed).toHaveBeenCalledTimes(1);
  });

  it('Flow A1 step 5: an error input clears submitting but keeps the typed data and stays open', () => {
    const form = (component as any).form;
    form.get('mode').setValue('promptpay');
    form.get('promptpayPhone').setValue('0812345678');
    (component as any).submitting = true;

    component.error = 'Invalid destination';
    component.ngOnChanges({
      error: { currentValue: 'Invalid destination', previousValue: null, firstChange: false, isFirstChange: () => false },
    });
    fixture.detectChanges();

    expect(component['submitting']).toBeFalse();
    expect(form.get('promptpayPhone').value).toBe('0812345678');
    expect(fixture.debugElement.query(By.css('.crdm-error')).nativeElement.textContent).toContain(
      'Invalid destination'
    );
  });

  // --- OBRS-942: the non-manual lane (card/gateway/CASH) — same modal, no
  // destination form. Zero coverage before this card: both arms of the 813
  // e2e spec and every confirmCancelWithDestination$ unit test used
  // MANUAL_REFUND_REQUIRED with a populated destination. ---

  describe('non-manual refund method (e.g. card)', () => {
    function buildNonManualPolicy(): CancellationPolicy {
      return { ...buildPolicy(), refundMethod: 'card' };
    }

    /** Always creates a FRESH fixture so `ngOnInit` sees the non-manual policy
     * from the start — mirroring the real open sequence, where a new instance
     * is created every time (`@if (…$ | async; as …)` in the host template).
     * Reusing the outer `beforeEach`'s manual-initialized `component` here
     * would leave `mode` carrying the manual lane's `Validators.required`
     * forever, which is not the behaviour being tested. */
    function createNonManual(
      overrides: Partial<MyBookingView> = {}
    ): { fixture: ComponentFixture<CancelBookingModalComponent>; component: CancelBookingModalComponent } {
      const nonManualFixture = TestBed.createComponent(CancelBookingModalComponent);
      const nonManualComponent = nonManualFixture.componentInstance;
      nonManualComponent.booking = { ...buildBooking(), ...overrides };
      nonManualComponent.policy = buildNonManualPolicy();
      nonManualFixture.detectChanges();
      return { fixture: nonManualFixture, component: nonManualComponent };
    }

    it('does not render the destination fields or the manual-refund note', () => {
      const { fixture: f } = createNonManual();

      expect(f.debugElement.query(By.css('app-refund-destination-fields'))).toBeNull();
      expect(f.debugElement.query(By.css('.crdm-note'))).toBeNull();
    });

    it('renders CONFIRM_TITLE, not DESTINATION_DIALOG_TITLE', () => {
      const { fixture: f } = createNonManual();

      const title = f.debugElement.query(By.css('.crdm-modal__title')).nativeElement.textContent;
      expect(title).toContain('MY_BOOKINGS.CANCEL.CONFIRM_TITLE');
      expect(title).not.toContain('MY_BOOKINGS.CANCEL.DESTINATION_DIALOG_TITLE');
    });

    it('canSubmit is true the instant the modal opens (no destination to fill in)', () => {
      const { fixture: f, component: c } = createNonManual();

      expect(c['canSubmit']).toBeTrue();
      const confirmBtn = f.debugElement.query(By.css('.btn-primary'));
      expect(confirmBtn.nativeElement.disabled).toBeFalse();
    });

    it('Confirm emits with refundDestination undefined (never null) and does not early-return', () => {
      const { fixture: f, component: c } = createNonManual();

      const confirmed = jasmine.createSpy('confirmed');
      c.confirmed.subscribe(confirmed);

      f.debugElement.query(By.css('.btn-primary')).nativeElement.click();

      expect(confirmed).toHaveBeenCalledWith({ refundDestination: undefined });
      expect(c['submitting']).toBeTrue();
    });

    it('the reschedule offer still renders iff rescheduleEligible — same predicate as the manual lane', () => {
      const ineligible = createNonManual({ rescheduleEligible: false });
      expect(ineligible.fixture.debugElement.query(By.css('.crdm-offer'))).toBeNull();

      const eligible = createNonManual({ rescheduleEligible: true });
      expect(eligible.fixture.debugElement.query(By.css('.crdm-offer'))).not.toBeNull();
    });
  });

  // OBRS-1136 AC-3: the note under the refund lines now says WHEN a staff-processed refund
  // lands, with the number the /cancel-policy quote carried. Real translations here, not the
  // bare-key rendering the rest of this suite relies on, because the defect being guarded is a
  // sentence with a blank where the number should be — only interpolation can show that.
  describe('the manual-refund wait (OBRS-1136 AC-3)', () => {
    function renderWith(manualRefundDueDays?: number): ComponentFixture<CancelBookingModalComponent> {
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

      const f = TestBed.createComponent(CancelBookingModalComponent);
      f.componentInstance.booking = buildBooking();
      f.componentInstance.policy = { ...buildPolicy(), manualRefundDueDays };
      f.detectChanges();
      return f;
    }

    it('states the wait the server quoted — 11, never a number typed into i18n', () => {
      const note = renderWith(11).debugElement.query(By.css('.crdm-note'));

      expect(note.nativeElement.textContent).toContain('within 11 days');
      expect(note.nativeElement.textContent).not.toContain('{{');
    });

    it('falls back to the timing-free note when the backend did not send the number', () => {
      const note = renderWith(undefined).debugElement.query(By.css('.crdm-note'));

      expect(note.nativeElement.textContent.trim()).toBe('Our staff will transfer your refund.');
      expect(note.nativeElement.textContent).not.toContain('within');
    });
  });
});
