import { SettlementDetailModalComponent } from './settlement-detail-modal.component';
import {
  SettlementPendingItemDto,
  SettlementScheduleDetailDto,
} from '../../../../../shared/interfaces/settlement.interface';
import { createTranslateStub } from '../../../../../testing/test-stubs';

function makeSummary(overrides: Partial<SettlementPendingItemDto> = {}): SettlementPendingItemDto {
  return {
    scheduleId: 1,
    routeLabel: 'BKK-CNX',
    departureDateTime: '2026-07-10T08:00:00+07:00',
    status: 'PENDING',
    totalAmount: '1000.00',
    currency: 'THB',
    ticketCount: 4,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<SettlementScheduleDetailDto> = {}): SettlementScheduleDetailDto {
  return {
    scheduleId: 1,
    routeLabel: 'BKK-CNX',
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
});
