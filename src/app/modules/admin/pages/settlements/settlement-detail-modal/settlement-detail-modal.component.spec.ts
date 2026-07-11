import { SettlementDetailModalComponent } from './settlement-detail-modal.component';
import {
  SettlementPendingItemDto,
  SettlementScheduleDetailDto,
  SettlementSettledChannelDto,
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
    },
    settled: null,
    discrepancy: null,
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

  // Zero-revenue rounds must stay confirmable — no amount-based gate.
  it('canConfirm is true for a PENDING zero-revenue round', () => {
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
      },
    });
    expect(component['canConfirm']).toBeTrue();
  });

  it('canConfirm is false once SETTLED', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail({ status: 'SETTLED' });
    expect(component['canConfirm']).toBeFalse();
  });

  it('canConfirm is false while isConfirming', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    component.detail = makeDetail();
    component.isConfirming = true;
    expect(component['canConfirm']).toBeFalse();
  });

  it('emits confirmRequested only when canConfirm is true', () => {
    const component = new SettlementDetailModalComponent(createTranslateStub());
    let emitted = false;
    component.confirmRequested.subscribe(() => (emitted = true));

    component.detail = null;
    component['onConfirmClick']();
    expect(emitted).toBeFalse();

    component.detail = makeDetail();
    component['onConfirmClick']();
    expect(emitted).toBeTrue();
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
      settled: {
        totalAmount: '1950.00',
        byMethod: [{ method: 'cash', amount: '1950.00' }],
        byChannel: [{ channel: 'walk_in', amount: '1950.00' }],
        settledBy: 9,
        settledByName: 'Owner Somchai',
        settledAt: '2026-07-10T09:00:00+07:00',
      },
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
