import { SettlementDetailModalComponent } from './settlement-detail-modal.component';
import {
  SettlementConfirmPayload,
  SettlementPendingItemDto,
  SettlementScheduleDetailDto,
  SettlementSettledChannelDto,
  SettlementSettledDto,
  SettlementSettledMethodDto,
} from '../../../../../shared/interfaces/settlement.interface';
import { createTranslateStub } from '../../../../../testing/test-stubs';

function makeSummary(overrides: Partial<SettlementPendingItemDto> = {}): SettlementPendingItemDto {
  return {
    scheduleId: 1,
    originStopId: 5,
    originStopSlug: 'nong_chak',
    departureDateTime: '2026-07-10T08:00:00+07:00',
    routeSlug: 'bkk-cnx',
    liveTotalAmount: '1000.00',
    ticketCount: 4,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<SettlementScheduleDetailDto> = {}): SettlementScheduleDetailDto {
  return {
    scheduleId: 1,
    originStopId: 5,
    originStopSlug: 'nong_chak',
    departureDateTime: '2026-07-10T08:00:00+07:00',
    status: 'PENDING',
    currency: 'THB',
    live: {
      totalAmount: '1000.00',
      onSiteTotal: '600.00',
      agencyTotal: '400.00',
      passengerCount: 4,
      ticketCount: 4,
      byMethod: [{ method: 'cash', amount: '600.00', ticketCount: 2 }],
      byChannel: [{ channel: 'walk_in', amount: '600.00', ticketCount: 2, remote: false }],
      // OBRS-670: always present on a live round, zeroed when none.
      notTravelled: {
        ticketCount: 0,
        collectedAmount: '0.00',
        refundedAmount: '0.00',
        retainedAmount: '0.00',
        byMethod: [],
        byStatus: [],
      },
    },
    settled: null,
    discrepancy: null,
    ...overrides,
  };
}

// OBRS-671: a frozen settled block with the cash-reconciliation fields present
// (a post-671 round). Pass `notTravelled`/cash fields as overrides for the
// pre-670 / pre-671 UNKNOWN variants.
function makeSettled(overrides: Partial<SettlementSettledDto> = {}): SettlementSettledDto {
  return {
    totalAmount: '1950.00',
    byMethod: [{ method: 'cash', amount: '1950.00' }],
    byChannel: [{ channel: 'walk_in', amount: '1950.00' }],
    settledBy: 9,
    settledByName: 'Owner Somchai',
    settledAt: '2026-07-10T09:00:00+07:00',
    notTravelled: {
      ticketCount: 1,
      collectedAmount: '400.00',
      refundedAmount: '0.00',
      retainedAmount: '400.00',
    },
    countedAmount: '600.00',
    expectedCashAmount: '600.00',
    discrepancyAmount: '0.00',
    discrepancyReason: null,
    handedOverBy: 7,
    handedOverByName: 'Sam Sales',
    ...overrides,
  };
}

describe('SettlementDetailModalComponent', () => {
  it('should create', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    expect(component).toBeTruthy();
  });

  it('canConfirm is false with no detail yet (optimistic-open window)', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.summary = makeSummary();
    component.detail = null;
    expect(component['canConfirm']).toBeFalse();
  });

  // OBRS-671: the counted cash + hander are now mandatory, so an untouched form
  // never confirms — even a zero-revenue round.
  it('canConfirm is false until the counted cash and hander are filled', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail();
    expect(component['canConfirm']).toBeFalse();

    component['countedCashInput'] = '600.00';
    expect(component['canConfirm']).toBeFalse(); // hander still missing

    component['handedOverById'] = 7;
    expect(component['canConfirm']).toBeTrue(); // counted == expected cash → no reason needed
  });

  // A zero-revenue round is still confirmable — with 0.00 counted + a hander.
  it('canConfirm is true for a zero-revenue round once 0.00 is counted and a hander picked', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail({
      live: {
        totalAmount: '0.00',
        onSiteTotal: '0.00',
        agencyTotal: '0.00',
        passengerCount: 0,
        ticketCount: 0,
        byMethod: [],
        byChannel: [],
        notTravelled: {
          ticketCount: 0,
          collectedAmount: '0.00',
          refundedAmount: '0.00',
          retainedAmount: '0.00',
          byMethod: [],
          byStatus: [],
        },
      },
    });
    component['countedCashInput'] = '0.00';
    component['handedOverById'] = 7;
    expect(component['canConfirm']).toBeTrue();
  });

  it('canConfirm is false once SETTLED', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail({ status: 'SETTLED' });
    component['countedCashInput'] = '600.00';
    component['handedOverById'] = 7;
    expect(component['canConfirm']).toBeFalse();
  });

  it('canConfirm is false while isConfirming', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail();
    component['countedCashInput'] = '600.00';
    component['handedOverById'] = 7;
    component.isConfirming = true;
    expect(component['canConfirm']).toBeFalse();
  });

  it('canConfirm is false on an invalid counted-cash string', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail();
    component['handedOverById'] = 7;
    component['countedCashInput'] = 'abc';
    expect(component['canConfirm']).toBeFalse();
    component['countedCashInput'] = '600.000'; // 3 decimals — rejected
    expect(component['canConfirm']).toBeFalse();
  });

  // ── OBRS-671 expected cash / discrepancy ─────────────────────────────────
  it('expectedCashAmount reads the cash method bucket (never the round total)', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail({
      live: {
        ...makeDetail().live,
        totalAmount: '1000.00',
        byMethod: [
          { method: 'cash', amount: '500.00', ticketCount: 1 },
          { method: 'card', amount: '500.00', ticketCount: 1 },
        ],
      },
    });
    expect(component['expectedCashAmount']()).toBe('500.00');
  });

  it('expectedCashAmount is 0.00 when the round took no cash', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail({
      live: {
        ...makeDetail().live,
        byMethod: [{ method: 'card', amount: '400.00', ticketCount: 1 }],
      },
    });
    expect(component['expectedCashAmount']()).toBe('0.00');
  });

  it('discrepancy is counted − expected cash, negative when the drawer is short', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail(); // expected cash 600.00
    component['countedCashInput'] = '580.00';
    expect(component['discrepancyCents']).toBe(-2000);
    expect(component['discrepancyAmount']()).toBe('-20.00');
    expect(component['hasDiscrepancy']()).toBeTrue();
  });

  it('discrepancy is zero (no reason needed) when counted matches expected cash', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail();
    component['countedCashInput'] = '600.00';
    expect(component['discrepancyCents']).toBe(0);
    expect(component['hasDiscrepancy']()).toBeFalse();
  });

  it('discrepancyCents is null while the counted input is blank/invalid', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail();
    expect(component['discrepancyCents']).toBeNull();
    component['countedCashInput'] = 'nope';
    expect(component['discrepancyCents']).toBeNull();
  });

  // A short drawer needs a reason before it can be signed off (mirrors the
  // backend's SETTLEMENT_DISCREPANCY_REASON_REQUIRED).
  it('a discrepancy blocks confirm until a reason is given', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail();
    component['countedCashInput'] = '580.00';
    component['handedOverById'] = 7;
    expect(component['canConfirm']).toBeFalse();

    component['discrepancyReasonInput'] = '   '; // whitespace only — still blocked
    expect(component['canConfirm']).toBeFalse();

    component['discrepancyReasonInput'] = 'ขาด 20';
    expect(component['canConfirm']).toBeTrue();
  });

  // ── OBRS-671 payload emission ────────────────────────────────────────────
  it('emits the counted cash + hander (+ reason) on confirm when the count is short', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    let payload: SettlementConfirmPayload | undefined;
    component.confirmRequested.subscribe((p) => (payload = p));

    component.detail = makeDetail();
    component['countedCashInput'] = '580.00';
    component['handedOverById'] = 7;
    component['discrepancyReasonInput'] = '  ขาด 20  ';
    component['onConfirmClick']();

    expect(payload).toEqual({ countedCashAmount: '580.00', handedOverBy: 7, discrepancyReason: 'ขาด 20' });
  });

  it('omits the reason when the drawer reconciles', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    let payload: SettlementConfirmPayload | undefined;
    component.confirmRequested.subscribe((p) => (payload = p));

    component.detail = makeDetail();
    component['countedCashInput'] = '600';
    component['handedOverById'] = 7;
    component['discrepancyReasonInput'] = 'stray text';
    component['onConfirmClick']();

    // Normalized to 2 dp, and no reason since counted == expected.
    expect(payload).toEqual({ countedCashAmount: '600.00', handedOverBy: 7, discrepancyReason: undefined });
  });

  it('does not emit confirmRequested when canConfirm is false', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    let emitted = false;
    component.confirmRequested.subscribe(() => (emitted = true));

    component.detail = makeDetail();
    component['onConfirmClick'](); // no counted / no hander
    expect(emitted).toBeFalse();
  });

  // ── OBRS-671 form reset per round ────────────────────────────────────────
  it('resets the form when a different round opens, but not on a same-round detail patch', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());

    // Round 1 opens (summary seeded), form filled.
    component.summary = makeSummary({ scheduleId: 1 });
    component.ngOnChanges({});
    component['countedCashInput'] = '580.00';
    component['handedOverById'] = 7;

    // Detail GET resolves for the SAME round — must NOT wipe the half-typed form.
    component.detail = makeDetail({ scheduleId: 1 });
    component.ngOnChanges({});
    expect(component['countedCashInput']).toBe('580.00');
    expect(component['handedOverById']).toBe(7);

    // A DIFFERENT round opens — form starts clean.
    component.summary = makeSummary({ scheduleId: 2 });
    component.ngOnChanges({});
    expect(component['countedCashInput']).toBe('');
    expect(component['handedOverById']).toBeNull();
    expect(component['discrepancyReasonInput']).toBe('');
  });

  it('emits closed on backdrop dismiss and close button', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    let closedCount = 0;
    component.closed.subscribe(() => closedCount++);

    component['onBackdropDismiss']();
    expect(closedCount).toBe(1);
  });

  it('emits retryFetch', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    let retried = false;
    component.retryFetch.subscribe(() => (retried = true));
    component.retryFetch.emit();
    expect(retried).toBeTrue();
  });

  it('formats money with the given currency', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    expect(component['formatMoney']('0.00', 'THB')).toContain('0.00');
  });

  it('resolves method/channel labels via the i18n key convention', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    expect(component['methodLabel']('cash')).toBe('ADMIN.SETTLEMENTS.METHOD.CASH');
    expect(component['channelLabel']('walk_in')).toBe('ADMIN.SETTLEMENTS.CHANNEL.WALK_IN');
  });

  // OBRS-670 AC 2 — cancelled/no_show map to a key, never a raw slug.
  it('resolves not-travelled status labels via the i18n key convention', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    expect(component['notTravelledStatusLabel']('cancelled')).toBe(
      'ADMIN.SETTLEMENTS.NOT_TRAVELLED.STATUS.CANCELLED',
    );
    expect(component['notTravelledStatusLabel']('no_show')).toBe(
      'ADMIN.SETTLEMENTS.NOT_TRAVELLED.STATUS.NO_SHOW',
    );
  });

  // OBRS-670 AC 5 / OBRS-671 — an over-refunded/short figure is negative and
  // must be flagged (never zero-clamped).
  it('isNegativeMoney flags only a genuinely negative amount', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    expect(component['isNegativeMoney']('-40.00')).toBeTrue();
    expect(component['isNegativeMoney']('0.00')).toBeFalse();
    expect(component['isNegativeMoney']('510.00')).toBeFalse();
  });

  // OBRS-670 — not-travelled buckets key on `key` (a method OR status slug).
  it('trackByNotTravelledKey returns the bucket key', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    expect(component['trackByNotTravelledKey'](0, { key: 'no_show' })).toBe('no_show');
  });

  // OBRS-671 — the hander picker tracks by candidate id.
  it('trackByCandidate returns the candidate id', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    expect(component['trackByCandidate'](0, { id: 42, name: 'Sam' })).toBe(42);
  });

  // OBRS-671 AC 4 — a round settled before OBRS-671 carries the six cash fields
  // as null (UNKNOWN), distinct from a post-671 round with real figures.
  it('a pre-OBRS-671 settled round carries the cash-reconciliation fields as null', () => {
    const preFeatureSettled = makeDetail({
      status: 'SETTLED',
      settled: makeSettled({
        notTravelled: null,
        countedAmount: null,
        expectedCashAmount: null,
        discrepancyAmount: null,
        discrepancyReason: null,
        handedOverBy: null,
        handedOverByName: null,
      }),
    });
    expect(preFeatureSettled.settled?.countedAmount).toBeNull();
    expect(preFeatureSettled.settled?.handedOverByName).toBeNull();
  });

  it('a post-OBRS-671 short-drawer settled round carries a negative discrepancy + reason + hander', () => {
    const settled = makeSettled({
      countedAmount: '580.00',
      expectedCashAmount: '600.00',
      discrepancyAmount: '-20.00',
      discrepancyReason: 'ขาด 20',
      handedOverBy: 7,
      handedOverByName: 'Sam Sales',
    });
    expect(settled.discrepancyAmount).toBe('-20.00');
    expect(settled.discrepancyReason).toBe('ขาด 20');
    expect(settled.handedOverByName).toBe('Sam Sales');
  });

  // OBRS-670 — the live block always carries a notTravelled totals object.
  it('a live round always carries live.notTravelled totals', () => {
    const detail = makeDetail({
      live: {
        totalAmount: '1000.00',
        onSiteTotal: '600.00',
        agencyTotal: '400.00',
        passengerCount: 4,
        ticketCount: 4,
        byMethod: [{ method: 'cash', amount: '600.00', ticketCount: 2 }],
        byChannel: [{ channel: 'walk_in', amount: '600.00', ticketCount: 2, remote: false }],
        notTravelled: {
          ticketCount: 3,
          collectedAmount: '950.00',
          refundedAmount: '440.00',
          retainedAmount: '510.00',
          byMethod: [
            { key: 'cash', ticketCount: 2, collectedAmount: '650.00', refundedAmount: '200.00', retainedAmount: '450.00' },
            { key: 'card', ticketCount: 1, collectedAmount: '300.00', refundedAmount: '240.00', retainedAmount: '60.00' },
          ],
          byStatus: [
            { key: 'cancelled', ticketCount: 2, collectedAmount: '550.00', refundedAmount: '440.00', retainedAmount: '110.00' },
            { key: 'no_show', ticketCount: 1, collectedAmount: '400.00', refundedAmount: '0.00', retainedAmount: '400.00' },
          ],
        },
      },
    });
    expect(detail.live.notTravelled.ticketCount).toBe(3);
    expect(detail.live.notTravelled.byStatus.map((r) => r.key)).toEqual(['cancelled', 'no_show']);
    expect(detail.live.notTravelled.byMethod[1].retainedAmount).toBe('60.00');
  });

  // OBRS-196 contract reconciliation: the settled breakdown is a THINNER
  // shape than live (amount only, no ticketCount/remote) — trackBy must
  // still work on the thin rows since the template reuses it for both.
  it('trackByMethod/trackByChannel work on the thin settled-breakdown shape (no ticketCount/remote)', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    const settledMethodRow: SettlementSettledMethodDto = { method: 'cash', amount: '600.00' };
    const settledChannelRow: SettlementSettledChannelDto = { channel: 'walk_in', amount: '600.00' };
    expect(component['trackByMethod'](0, settledMethodRow)).toBe('cash');
    expect(component['trackByChannel'](0, settledChannelRow)).toBe('walk_in');
  });

  it('a SETTLED detail carries a settled block with totalAmount/byMethod/byChannel/settledBy/settledByName/settledAt (no ticketCount/remote)', () => {
    const settledDetail = makeDetail({
      status: 'SETTLED',
      settled: makeSettled(),
      discrepancy: {
        hasDiscrepancy: false,
        settledTotal: '1950.00',
        liveTotal: '1950.00',
        deltaAmount: '0.00',
      },
    });

    expect(settledDetail.settled?.totalAmount).toBe('1950.00');
    expect((settledDetail.settled?.byMethod[0] as { ticketCount?: number }).ticketCount).toBeUndefined();
    expect((settledDetail.settled?.byChannel[0] as { remote?: boolean }).remote).toBeUndefined();
    expect(settledDetail.discrepancy?.deltaAmount).toBe('0.00');
  });
});
