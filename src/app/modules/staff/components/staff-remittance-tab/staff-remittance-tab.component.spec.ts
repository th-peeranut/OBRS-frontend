import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { SimpleChange } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';

import { StaffRemittanceTabComponent } from './staff-remittance-tab.component';
import { DriverCashAdvanceFormComponent } from '../driver-cash-panel/driver-cash-advance-form/driver-cash-advance-form.component';
import { StaffApiService } from '../../../../services/staff/staff-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { StaffRemittanceDto } from '../../../../shared/interfaces/staff-remittance.interface';
import { ResponseAPI } from '../../../../shared/interfaces/response.interface';

/**
 * A ROUND-cadence round (หนองชาก shape): an advance box, no per-head line.
 * Every money field is a decimal string, as the wire carries it.
 */
function roundPayload(overrides: Partial<StaffRemittanceDto> = {}): StaffRemittanceDto {
  return {
    scheduleId: 42,
    originStopId: 7,
    originStopSlug: 'nong-chak',
    // An explicit offset: a bare literal is read in the RUNNER's timezone, and
    // this value is rendered through a Bangkok formatter.
    departureDateTime: '2026-09-13T06:30:00+07:00',
    routeSlug: 'nong-chak-bangkok',
    currency: 'THB',
    departed: true,
    status: 'PENDING',
    remitCadence: 'ROUND',
    sellerUserId: 3,
    sellerName: 'Somchai K.',
    roundSellerCount: 1,
    myTickets: {
      ticketCount: 12,
      totalAmount: '2180.00',
      cashAmount: '2180.00',
      byFare: [
        {
          netPrice: '200.00',
          occupantType: 'person',
          fareCategory: 'adult',
          ticketCount: 4,
          amount: '800.00',
        },
      ],
      byMethod: [{ method: 'cash', ticketCount: 12, amount: '2180.00' }],
    },
    returnLeg: { cashAmount: '0.00', lines: [] },
    advance: { allowed: true, recordedCount: 1, recordedAmount: '500.00', blockedReason: null },
    perHeadLines: [],
    hasPerHead: false,
    perHeadOtherCountersAmount: '0.00',
    deductions: { perHeadDeducted: '0.00', advancePaidOut: '500.00', deferredTicketCash: '0.00' },
    myExpectedCash: '1680.00',
    roundExpectedCash: '1680.00',
    submission: null,
    ...overrides,
  };
}

/** A DAY-cadence round (บ้านบึง / หมอชิต shape): a per-head line, no advance box. */
function dayPayload(overrides: Partial<StaffRemittanceDto> = {}): StaffRemittanceDto {
  return roundPayload({
    remitCadence: 'DAY',
    advance: { allowed: false, recordedCount: 0, recordedAmount: '0.00', blockedReason: null },
    hasPerHead: true,
    perHeadLines: [
      {
        stopId: 11,
        stopName: 'บ้านบึง',
        salesPointId: 2,
        ratePerHead: '20.00',
        configured: true,
        systemHeadCount: 12,
        recordedHeadCount: 12,
        recordedAmount: '240.00',
      },
    ],
    // INVARIANT (asserted below): perHeadDeducted == sum(recordedAmount) + other.
    perHeadOtherCountersAmount: '0.00',
    deductions: { perHeadDeducted: '240.00', advancePaidOut: '0.00', deferredTicketCash: '0.00' },
    // 2180.00 cash in - 240.00 per head.
    myExpectedCash: '1940.00',
    roundExpectedCash: '1940.00',
    ...overrides,
  });
}

/**
 * OBRS-1755 F1 - the same DAY counter, on a round where ANOTHER counter has
 * also recorded ค่าหัว. This is the shape QA hit: `perHeadDeducted` is the whole
 * round's (360.00) while `perHeadLines` shows only this counter's (240.00), and
 * the 120.00 difference is reachable ONLY through `perHeadOtherCountersAmount`.
 *
 * บ้านบึง / หมอชิต are the counters this can happen at - they are the ones with
 * a per-head box on screen at all (BR-6).
 */
function dayPayloadWithOtherCounter(
  overrides: Partial<StaffRemittanceDto> = {},
): StaffRemittanceDto {
  return dayPayload({
    perHeadOtherCountersAmount: '120.00',
    deductions: { perHeadDeducted: '360.00', advancePaidOut: '0.00', deferredTicketCash: '0.00' },
    // 2180.00 cash in - 360.00 whole-round per head.
    myExpectedCash: '1820.00',
    roundExpectedCash: '1820.00',
    ...overrides,
  });
}

/**
 * What the SERVER will compute after it writes `headCounts`, derived from the
 * fixture by BR-4 - an independent oracle, not a restatement of the component.
 * The client's `expectedCashAmount` has to equal this or the submit is refused
 * as stale (the server recomputes AFTER writing, spec BR-15).
 */
function serverExpectedAfterWrite(
  payload: StaffRemittanceDto,
  headCounts: Record<number, number>,
  newAdvance = 0,
): string {
  const money = (value: string) => Math.round(Number(value) * 100);
  const perHeadWritten = payload.perHeadLines
    .filter((line) => line.configured)
    .reduce((sum, line) => sum + headCounts[line.stopId] * money(line.ratePerHead), 0);
  const perHeadDeducted = perHeadWritten + money(payload.perHeadOtherCountersAmount);
  const cents =
    money(payload.myTickets.cashAmount) +
    money(payload.returnLeg.cashAmount) -
    perHeadDeducted -
    (money(payload.deductions.advancePaidOut) + Math.round(newAdvance * 100)) -
    money(payload.deductions.deferredTicketCash);
  return (cents / 100).toFixed(2);
}

/** The envelope both endpoints answer in — not the bare DTO (a stub shaped as the
 *  ELEMENT type instead of the ENVELOPE type draws an empty screen and no error). */
function resp(payload: StaffRemittanceDto): Observable<ResponseAPI<StaffRemittanceDto>> {
  return of({ code: 200, message: 'OK', data: payload });
}

function apiError(errorCode: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 409, error: { errorCode } });
}

describe('StaffRemittanceTabComponent', () => {
  let fixture: ComponentFixture<StaffRemittanceTabComponent>;
  let component: StaffRemittanceTabComponent;
  let api: jasmine.SpyObj<StaffApiService>;
  let alert: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<StaffApiService>('StaffApiService', [
      'getMyRemittance',
      'postRemittanceSubmit',
    ]);
    alert = jasmine.createSpyObj<AlertService>('AlertService', ['confirm']);

    await TestBed.configureTestingModule({
      imports: [FormsModule, TranslateModule.forRoot()],
      declarations: [StaffRemittanceTabComponent, DriverCashAdvanceFormComponent],
      providers: [
        { provide: StaffApiService, useValue: api },
        { provide: AlertService, useValue: alert },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StaffRemittanceTabComponent);
    component = fixture.componentInstance;
  });

  /** Mount with `payload` already loaded, as if the clerk had opened the tab. */
  function open(payload: StaffRemittanceDto): void {
    api.getMyRemittance.and.returnValue(resp(payload));
    component.scheduleId = payload.scheduleId;
    component.active = true;
    component.ngOnChanges({
      scheduleId: new SimpleChange(null, payload.scheduleId, true),
      active: new SimpleChange(false, true, true),
    });
    fixture.detectChanges();
  }

  function text(testId: string): string {
    const el: HTMLElement | null = fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`,
    );
    return el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
  }

  function present(testId: string): boolean {
    return !!fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  // ── Fetch gating ────────────────────────────────────────────────────────
  // `p-tabpanel` is eager, so this component exists from the moment a trip is
  // selected. Fetching then would put one request per clicked round on the wire.

  it('does NOT fetch while the tab is not the active one', () => {
    api.getMyRemittance.and.returnValue(resp(roundPayload()));
    component.scheduleId = 42;
    component.active = false;
    component.ngOnChanges({ scheduleId: new SimpleChange(null, 42, true) });

    expect(api.getMyRemittance).not.toHaveBeenCalled();
  });

  it('fetches once the tab becomes active, for the selected round', () => {
    open(roundPayload());
    expect(api.getMyRemittance).toHaveBeenCalledOnceWith(42);
  });

  it('re-fetches when the clerk selects a different round', () => {
    open(roundPayload());
    api.getMyRemittance.and.returnValue(resp(roundPayload({ scheduleId: 43 })));

    component.scheduleId = 43;
    component.ngOnChanges({ scheduleId: new SimpleChange(42, 43, false) });

    expect(api.getMyRemittance).toHaveBeenCalledWith(43);
  });

  // ── BR-6: the two counters differ by remitCadence alone ─────────────────

  it('ROUND cadence shows the advance box and NO per-head row', () => {
    open(roundPayload());
    expect(present('remittance-advance')).toBeTrue();
    expect(present('remittance-eq-advance')).toBeTrue();
    expect(present('remittance-eq-per-head')).toBeFalse();
  });

  it('DAY cadence shows the per-head row and NO advance box', () => {
    open(dayPayload());
    expect(present('remittance-advance')).toBeFalse();
    expect(present('remittance-eq-advance')).toBeFalse();
    expect(present('remittance-eq-per-head')).toBeTrue();
  });

  // ── BR-13: one advance figure, rendered in two places ───────────────────

  it('shows the SAME advance figure in box 3 and in the deduction row', () => {
    open(roundPayload());
    expect(text('remittance-advance-recorded')).toContain('500');
    expect(text('remittance-eq-advance')).toContain('500');
  });

  it('moves the deduction row as the advance box is typed into, before any submit', () => {
    open(roundPayload());

    component['onAdvanceAmountChange']('300');
    fixture.detectChanges();

    // 500 already recorded + 300 being handed over now.
    expect(text('remittance-eq-advance')).toContain('800');
    // ...and the figure on the button drops by exactly the typed amount.
    expect(component['pendingExpectedCents']).toBe(168000 - 30000);
  });

  // ── BR-10: the system's own head count is visible either way ────────────

  it('prefills the head count from systemHeadCount and says it matches', () => {
    open(dayPayload());
    expect(component['headCountInputs'][11]).toBe('12');
    expect(present('remittance-per-head-system-11')).toBeTrue();
    expect(component['isHeadCountOverridden'](component['perHeadLines'][0])).toBeFalse();
  });

  it('keeps showing the system count as an OVERRIDE once it is typed over', () => {
    open(dayPayload());

    component['onHeadCountInput'](11, '10');
    fixture.detectChanges();

    const line = component['perHeadLines'][0];
    expect(component['headCountOf'](line)).toBe(10);
    expect(component['isHeadCountOverridden'](line)).toBeTrue();
    // 10 heads x 20.00 = 200.00, down from the recorded 240.00.
    expect(component['pendingPerHeadCents']).toBe(20000);
    expect(component['pendingExpectedCents']).toBe(194000 + 4000);
  });

  // ── BR-4 / mockup 15: a signed expectation, never clamped ───────────────

  it('reads a NEGATIVE expectation as the owner owing the salesperson, at a ROUND counter', () => {
    open(roundPayload({ myExpectedCash: '-240.00' }));
    expect(component['expectedCashState']).toBe('NEGATIVE');
    // The MAGNITUDE is what the screen prints; the sign lives in the sentence.
    expect(component['expectedCashMagnitude']).toBe(240);
    expect(present('remittance-negative-note')).toBeTrue();
  });

  it('does not use the ROUND wording for a negative DAY round (nobody pays anybody yet)', () => {
    open(dayPayload({ myExpectedCash: '-60.00' }));
    expect(component['expectedCashState']).toBe('NEGATIVE');
    expect(component['isRoundCadence']).toBeFalse();
    expect(present('remittance-keep-note')).toBeTrue();
  });

  // C1 vs C2 print the same figure. Only one of them leaves a driver's advance
  // slip behind, so they must not share a sentence.
  it('separates zero-because-nothing-happened from zero-because-it-netted-out', () => {
    open(
      roundPayload({
        myExpectedCash: '0.00',
        myTickets: { ...roundPayload().myTickets, cashAmount: '0.00' },
      }),
    );
    expect(component['expectedCashState']).toBe('ZERO_NO_CASH');

    // A DIFFERENT round id: the component deliberately refuses to re-fetch the
    // one it is already showing, so reusing 42 here would assert nothing.
    open(roundPayload({ scheduleId: 43, myExpectedCash: '0.00' }));
    expect(component['expectedCashState']).toBe('ZERO_NETTED');
  });

  // ── BR-25 (owner ruling 2026-09-13): the return leg is an equation term ──

  it('draws NO return-leg row when the round sold no return tickets', () => {
    open(roundPayload());
    expect(present('remittance-eq-return-leg')).toBeFalse();
  });

  it('draws the return leg as a PLUS row, and does not re-add it to the total', () => {
    open(
      roundPayload({
        returnLeg: {
          cashAmount: '340.00',
          lines: [
            {
              scheduleId: 99,
              departureDateTime: '2026-09-13T15:30:00+07:00',
              ticketCount: 2,
              amount: '340.00',
            },
          ],
        },
        // The server has already folded the 340 in.
        myExpectedCash: '2020.00',
      }),
    );

    expect(present('remittance-eq-return-leg')).toBeTrue();
    expect(text('remittance-eq-return-leg')).toContain('340');
    // 2020, NOT 2360 — the client must never add the term a second time.
    expect(component['pendingExpectedCents']).toBe(202000);
    expect(text('remittance-expected')).toContain('2,020');
  });

  // ── BR-3 / BR-8 / BR-21 ─────────────────────────────────────────────────

  it('says the deductions belong to the whole round when more than one person sold', () => {
    open(roundPayload({ roundSellerCount: 1 }));
    expect(present('remittance-shared-round')).toBeFalse();

    open(roundPayload({ scheduleId: 43, roundSellerCount: 3 }));
    expect(present('remittance-shared-round')).toBeTrue();
  });

  it('labels a parcel that bought a seat by occupantType, not by its default fareCategory', () => {
    // The entity default is "adult" — grouping by fare category alone prints a
    // parcel as a passenger.
    expect(
      component['fareLineLabelKey']({
        netPrice: '200.00',
        occupantType: 'parcel',
        fareCategory: 'adult',
        ticketCount: 1,
        amount: '200.00',
      }),
    ).toBe('STAFF.REMITTANCE.TICKETS.OCCUPANT.PARCEL');
  });

  it('always draws the transfer/PromptPay row, and never from data', () => {
    open(roundPayload());
    expect(present('remittance-transfer-row')).toBeTrue();
  });

  // ── Submit ──────────────────────────────────────────────────────────────

  it('sends the advance, the head counts and the expectation the clerk can see', () => {
    open(roundPayload());
    api.postRemittanceSubmit.and.returnValue(resp(roundPayload()));
    component['onAdvanceAmountChange']('300');

    component['onSubmit']();

    const [scheduleId, payload, key] = api.postRemittanceSubmit.calls.mostRecent().args;
    expect(scheduleId).toBe(42);
    expect(payload.advanceAmount).toBe('300.00');
    expect(payload.perHead).toEqual([]);
    expect(payload.expectedCashAmount).toBe('1380.00');
    expect(key).toBeTruthy();
  });

  it('sends advanceAmount as explicit null (never undefined) when nothing was typed', () => {
    open(roundPayload());
    api.postRemittanceSubmit.and.returnValue(resp(roundPayload()));

    component['onSubmit']();

    const payload = api.postRemittanceSubmit.calls.mostRecent().args[1];
    expect(payload.advanceAmount).toBeNull();
    // JSON.stringify DROPS undefined keys — an undefined here would let two
    // materially different submits share one idempotency key.
    expect(JSON.stringify(payload)).toContain('"advanceAmount":null');
  });

  // BR-19: `toCents()` refuses a leading minus and answers null, which a `?? 0`
  // then turns into a silent "0.00" for the one case that matters most.
  it('sends a NEGATIVE expectation as a negative decimal string, not as zero', () => {
    open(roundPayload({ myExpectedCash: '-240.00' }));
    api.postRemittanceSubmit.and.returnValue(resp(roundPayload()));

    component['onSubmit']();

    expect(api.postRemittanceSubmit.calls.mostRecent().args[1].expectedCashAmount).toBe('-240.00');
  });

  it('sends the per-head totals for the round, not a delta', () => {
    open(dayPayload());
    api.postRemittanceSubmit.and.returnValue(resp(dayPayload()));
    component['onHeadCountInput'](11, '10');

    component['onSubmit']();

    expect(api.postRemittanceSubmit.calls.mostRecent().args[1].perHead).toEqual([
      { stopId: 11, headCount: 10 },
    ]);
  });

  it('REUSES the idempotency key when the same payload is submitted again', () => {
    open(roundPayload());
    api.postRemittanceSubmit.and.returnValue(throwError(() => apiError('GATEWAY_TIMEOUT')));
    component['onAdvanceAmountChange']('300');

    component['onSubmit']();
    const firstKey = api.postRemittanceSubmit.calls.mostRecent().args[2];
    component['onSubmit']();
    const secondKey = api.postRemittanceSubmit.calls.mostRecent().args[2];

    expect(secondKey).toBe(firstKey);
  });

  it('MINTS a new key once the payload changes', () => {
    open(roundPayload());
    api.postRemittanceSubmit.and.returnValue(throwError(() => apiError('GATEWAY_TIMEOUT')));
    component['onAdvanceAmountChange']('300');
    component['onSubmit']();
    const firstKey = api.postRemittanceSubmit.calls.mostRecent().args[2];

    component['onAdvanceAmountChange']('400');
    component['onSubmit']();

    expect(api.postRemittanceSubmit.calls.mostRecent().args[2]).not.toBe(firstKey);
  });

  it('repaints from the submit response and clears what was typed', () => {
    open(roundPayload());
    const submitted = roundPayload({
      status: 'SUBMITTED',
      deductions: { perHeadDeducted: '0.00', advancePaidOut: '800.00', deferredTicketCash: '0.00' },
      myExpectedCash: '1380.00',
      submission: {
        submittedAt: '2026-09-13T07:12:00+07:00',
        submittedExpectedCash: '1380.00',
        stale: false,
      },
    });
    api.postRemittanceSubmit.and.returnValue(resp(submitted));
    component['onAdvanceAmountChange']('300');

    component['onSubmit']();
    fixture.detectChanges();

    expect(component['advanceAmountInput']).toBe('');
    expect(component['isSubmitting']).toBeFalse();
    expect(present('remittance-submitted')).toBeTrue();
    // Only ONE GET was ever made: the 200 carries the whole payload.
    expect(api.getMyRemittance).toHaveBeenCalledTimes(1);
  });

  // ── BR-17: stale ────────────────────────────────────────────────────────

  it('says how much cash to take back out of the envelope when the figure dropped', () => {
    open(
      roundPayload({
        myExpectedCash: '1860.00',
        submission: {
          submittedAt: '2026-09-13T07:12:00+07:00',
          submittedExpectedCash: '2020.00',
          stale: true,
        },
      }),
    );

    expect(component['isStale']).toBeTrue();
    expect(component['staleDeltaCents']).toBe(-16000);
    expect(component['staleDeltaMagnitude']).toBe(160);
    // The block itself is rendered; its wording is an i18n key, so the number is
    // asserted on the derived value above rather than on untranslated text.
    expect(present('remittance-stale')).toBeTrue();
  });

  it('re-reads the round after a STALE 409 instead of parsing the message', () => {
    open(roundPayload());
    api.postRemittanceSubmit.and.returnValue(
      throwError(() => apiError('SETTLEMENT_SUBMIT_AMOUNT_STALE')),
    );

    component['onSubmit']();

    expect(component['submitError']).toBe('STAFF.REMITTANCE.ERROR.AMOUNT_STALE');
    expect(api.getMyRemittance).toHaveBeenCalledTimes(2);
  });

  it('keeps the typed advance after a STALE rollback — that money is still unrecorded', () => {
    open(roundPayload());
    api.postRemittanceSubmit.and.returnValue(
      throwError(() => apiError('SETTLEMENT_SUBMIT_AMOUNT_STALE')),
    );
    component['onAdvanceAmountChange']('300');

    component['onSubmit']();

    expect(component['advanceAmountInput']).toBe('300');
  });

  it('maps each submit error code to its own sentence, and anything else to GENERIC', () => {
    expect(component['mapError'](apiError('SETTLEMENT_SUBMIT_ADVANCE_NOT_ALLOWED'))).toBe(
      'STAFF.REMITTANCE.ERROR.ADVANCE_NOT_ALLOWED',
    );
    expect(component['mapError'](apiError('DRIVER_CASH_SCHEDULE_NO_VEHICLE'))).toBe(
      'STAFF.REMITTANCE.ERROR.NO_VEHICLE',
    );
    expect(component['mapError'](apiError('SOMETHING_NEW'))).toBe('STAFF.REMITTANCE.ERROR.GENERIC');
    // An object-literal map inherits Object.prototype — `constructor` must not
    // resolve to the Object function and be handed to translate.instant().
    expect(component['mapError'](apiError('constructor'))).toBe('STAFF.REMITTANCE.ERROR.GENERIC');
  });

  // ── Blocked states ──────────────────────────────────────────────────────

  it('blocks submit on a round the owner has already signed off', () => {
    open(roundPayload({ status: 'SETTLED' }));
    expect(component['canSubmit']).toBeFalse();
    expect(text('remittance-submit-blocked')).toBeTruthy();
  });

  it('blocks submit on a round that has not departed', () => {
    open(roundPayload({ departed: false }));
    expect(component['canSubmit']).toBeFalse();
  });

  it('names WHY the advance box is read-only rather than just hiding it', () => {
    open(
      roundPayload({
        advance: {
          allowed: false,
          recordedCount: 0,
          recordedAmount: '0.00',
          blockedReason: 'NO_VEHICLE',
        },
      }),
    );
    expect(component['advanceBlockedKey']).toBe('STAFF.REMITTANCE.ADVANCE.BLOCKED.NO_VEHICLE');
    expect(present('remittance-advance-blocked')).toBeTrue();
  });

  // ── BR-18: unsaved work ─────────────────────────────────────────────────

  it('leaves without a prompt when nothing is typed', async () => {
    open(roundPayload());
    await expectAsync(Promise.resolve(component.canDeactivate())).toBeResolvedTo(true);
    expect(alert.confirm).not.toHaveBeenCalled();
  });

  it('asks before leaving with an unsubmitted advance', async () => {
    open(roundPayload());
    alert.confirm.and.resolveTo(false);
    component['onAdvanceAmountChange']('300');

    await expectAsync(Promise.resolve(component.canDeactivate())).toBeResolvedTo(false);
    expect(alert.confirm).toHaveBeenCalled();
  });

  it('asks before leaving with an overridden head count', async () => {
    open(dayPayload());
    alert.confirm.and.resolveTo(true);

    component['onHeadCountInput'](11, '10');

    expect(component['hasUnsubmittedWork']).toBeTrue();
    await expectAsync(Promise.resolve(component.canDeactivate())).toBeResolvedTo(true);
  });

  it('blocks the browser unload only while there is unsubmitted work', () => {
    open(roundPayload());
    const clean = new Event('beforeunload') as BeforeUnloadEvent;
    spyOn(clean, 'preventDefault');
    component.onBeforeUnload(clean);
    expect(clean.preventDefault).not.toHaveBeenCalled();

    component['onAdvanceAmountChange']('300');
    const dirty = new Event('beforeunload') as BeforeUnloadEvent;
    spyOn(dirty, 'preventDefault');
    component.onBeforeUnload(dirty);
    expect(dirty.preventDefault).toHaveBeenCalled();
  });

  // ── Load failure ────────────────────────────────────────────────────────

  // ── OBRS-1755 F1: ค่าหัว recorded by ANOTHER counter on the same round ───
  //
  // QA, 2026-09-13 (HIGH): pressing "ส่งยอดใหม่" without touching a head count
  // was refused 409 SETTLEMENT_SUBMIT_AMOUNT_STALE quoting a figure the counter
  // could not derive, and no number of retries could close the gap - the screen
  // offered `round − own ค่าหัว` while the server computed `round − whole`.
  // `perHeadDeducted` is whole-round by BR-3 and stays that way; the missing
  // half now travels as its own opaque field.
  describe('OBRS-1755 F1 — another counter\'s per-head on the same round', () => {
    it('the fixtures obey the server\'s invariant, so the tests below mean something', () => {
      for (const payload of [dayPayload(), dayPayloadWithOtherCounter()]) {
        const money = (value: string) => Math.round(Number(value) * 100);
        const visible = payload.perHeadLines.reduce(
          (sum, line) => sum + money(line.recordedAmount),
          0,
        );
        expect(money(payload.deductions.perHeadDeducted))
          .withContext('perHeadDeducted == Σ perHeadLines[].recordedAmount + other')
          .toBe(visible + money(payload.perHeadOtherCountersAmount));
      }
    });

    // The exact QA reproduction. Under the pre-fix arithmetic this sent
    // 1940.00 against a server figure of 1820.00 - short by the other
    // counter's 120.00, every single time.
    it('re-submits an untouched round at the server\'s OWN figure', () => {
      const payload = dayPayloadWithOtherCounter({
        submission: {
          submittedAt: '2026-09-13T07:12:00+07:00',
          submittedExpectedCash: '1820.00',
          stale: true,
        },
      });
      open(payload);
      api.postRemittanceSubmit.and.returnValue(resp(payload));

      component['onSubmit']();

      const sent = api.postRemittanceSubmit.calls.mostRecent().args[1];
      expect(sent.expectedCashAmount).toBe(serverExpectedAfterWrite(payload, { 11: 12 }));
      expect(sent.expectedCashAmount).toBe('1820.00');
    });

    it('keeps matching the server once a head count IS edited', () => {
      const payload = dayPayloadWithOtherCounter();
      open(payload);
      api.postRemittanceSubmit.and.returnValue(resp(payload));
      component['onHeadCountInput'](11, '10');

      component['onSubmit']();

      const sent = api.postRemittanceSubmit.calls.mostRecent().args[1];
      // 2180.00 − (10 × 20.00 + 120.00) = 1860.00
      expect(sent.expectedCashAmount).toBe(serverExpectedAfterWrite(payload, { 11: 10 }));
      expect(sent.expectedCashAmount).toBe('1860.00');
    });

    // Rule 3: with nothing typed the figure IS the server's, to the satang.
    it('shows the server figure untouched when nothing has been typed', () => {
      const payload = dayPayloadWithOtherCounter();
      open(payload);

      expect(component['pendingExpectedCents']).toBe(182000);
    });

    // The opaque half is never cancelled by typing - only the visible half is.
    it('subtracts the other counter even while a head count is being edited', () => {
      open(dayPayloadWithOtherCounter());

      component['onHeadCountInput'](11, '10');

      expect(component['otherCountersPerHeadCents']).toBe(12000);
      // Row stays WHOLE-ROUND (BR-3): 10 × 20.00 typed + 120.00 opaque.
      expect(component['pendingPerHeadCents']).toBe(32000);
      expect(component['pendingExpectedCents']).toBe(186000);
    });

    it('names the other counter\'s share so the row does not read as bad arithmetic', () => {
      open(dayPayloadWithOtherCounter());
      fixture.detectChanges();
      expect(present('remittance-per-head-other-counters')).toBeTrue();

      open(dayPayload({ scheduleId: 44 }));
      fixture.detectChanges();
      expect(present('remittance-per-head-other-counters'))
        .withContext('no other counter on this round — no line')
        .toBeFalse();
    });

    // A ROUND counter has no per-head box at all, so nothing here may disturb it.
    it('leaves a ROUND-cadence round exactly as it was', () => {
      open(roundPayload());
      expect(component['pendingExpectedCents']).toBe(168000);
      expect(present('remittance-per-head-other-counters')).toBeFalse();
    });
  });

  it('renders a retryable message instead of an empty tab when the read fails', () => {
    api.getMyRemittance.and.returnValue(throwError(() => apiError('SETTLEMENT_SCOPE_FORBIDDEN')));
    component.scheduleId = 42;
    component.active = true;
    component.ngOnChanges({
      scheduleId: new SimpleChange(null, 42, true),
      active: new SimpleChange(false, true, true),
    });
    fixture.detectChanges();

    expect(component['loadError']).toBe('STAFF.REMITTANCE.ERROR.SCOPE_FORBIDDEN');
    expect(present('remittance-retry')).toBeTrue();
  });
});
