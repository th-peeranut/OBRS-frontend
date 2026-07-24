import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  SettlementPendingItemDto,
  SettlementScheduleDetailDto,
} from '../../../../../shared/interfaces/settlement.interface';
import { formatDisplayDateTime } from '../../../../../shared/lib/display-date-time';

/**
 * Dumb (presentational) settlement detail modal. Owns no state and makes no
 * API calls — the smart page (`SettlementsPageComponent`) owns the detail
 * cache, the fetch, and the confirm orchestration (AlertService.confirm +
 * POST + error-code branching). This component only renders its inputs and
 * emits intent.
 *
 * Opens optimistically: the page seeds `[summary]` from the row already in
 * hand before the detail GET resolves (design-system.md §6), so this modal
 * never gates its render on `[detail]` being present — `[isFetching]` drives
 * a skeleton for the breakdown tables only.
 *
 * The PENDING (`detail.live`) and SETTLED (`detail.settled`) breakdowns are
 * DIFFERENT shapes — the live one is recomputed-on-read (full ticketCount +
 * remote flag), the settled one is a frozen snapshot (amount only, per
 * `docs/api/settlements.md`) — so the template renders two distinct table
 * blocks gated on `detail.status`, not one table reused for both.
 */
@Component({
  selector: 'app-settlement-detail-modal',
  templateUrl: './settlement-detail-modal.component.html',
  styleUrl: './settlement-detail-modal.component.scss',
})
export class SettlementDetailModalComponent {
  @Input() isOpen = false;
  @Input() summary: SettlementPendingItemDto | null = null;
  @Input() detail: SettlementScheduleDetailDto | null = null;
  @Input() isFetching = false;
  @Input() isConfirming = false;
  @Input() fetchError = '';

  @Output() closed = new EventEmitter<void>();
  @Output() confirmRequested = new EventEmitter<void>();
  @Output() retryFetch = new EventEmitter<void>();

  protected readonly skeletonRows = Array.from({ length: 3 });

  constructor(private readonly translate: TranslateService) {}

  protected get canConfirm(): boolean {
    // Zero-revenue rounds stay confirmable (design-system: "must show the
    // exact amount incl. THB 0.00" — no amount-based gate here).
    return !this.isConfirming && !!this.detail && this.detail.status === 'PENDING';
  }

  protected displayDateTime(value: string | null | undefined): string {
    return formatDisplayDateTime(value, this.translate.currentLang);
  }

  protected formatMoney(value: string, currency: string): string {
    const amount = Number(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  protected methodLabel(method: string): string {
    return this.translate.instant(`ADMIN.SETTLEMENTS.METHOD.${method.toUpperCase()}`);
  }

  protected channelLabel(channel: string): string {
    return this.translate.instant(`ADMIN.SETTLEMENTS.CHANNEL.${channel.toUpperCase()}`);
  }

  // OBRS-670. `cancelled` / `no_show` — mapped to an i18n key, never the raw
  // slug. Distinct from methodLabel: these are ticket dispositions, not payment
  // methods, and AC 2 keeps them conversationally separate (part-refunded vs.
  // 100%-forfeit) even though the maths is identical.
  protected notTravelledStatusLabel(status: string): string {
    return this.translate.instant(`ADMIN.SETTLEMENTS.NOT_TRAVELLED.STATUS.${status.toUpperCase()}`);
  }

  // OBRS-670 AC 5. `retainedAmount` is deliberately un-clamped server-side, so
  // an over-refunded booking yields a negative retained figure — the template
  // flags it (never hides or zero-clamps it).
  protected isNegativeMoney(value: string): boolean {
    return Number(value) < 0;
  }

  // OBRS-670. Not-travelled buckets key on `key` (a method slug or a status
  // slug), unlike the travelled rows which key on method/channel.
  protected trackByNotTravelledKey(_index: number, row: { key: string }): string {
    return row.key;
  }

  protected onBackdropDismiss(): void {
    this.closed.emit();
  }

  protected onConfirmClick(): void {
    if (!this.canConfirm) {
      return;
    }
    this.confirmRequested.emit();
  }

  // Structural (not nominal) param types so the same trackBy fn works for
  // both the live (full) and settled (thin, amount-only) breakdown rows.
  protected trackByMethod(_index: number, row: { method: string }): string {
    return row.method;
  }

  protected trackByChannel(_index: number, row: { channel: string }): string {
    return row.channel;
  }
}
