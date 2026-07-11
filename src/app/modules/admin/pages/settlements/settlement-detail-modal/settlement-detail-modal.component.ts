import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  SettlementChannelBreakdownDto,
  SettlementMethodBreakdownDto,
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

  protected onBackdropDismiss(): void {
    this.closed.emit();
  }

  protected onConfirmClick(): void {
    if (!this.canConfirm) {
      return;
    }
    this.confirmRequested.emit();
  }

  protected trackByMethod(_index: number, row: SettlementMethodBreakdownDto): string {
    return row.method;
  }

  protected trackByChannel(_index: number, row: SettlementChannelBreakdownDto): string {
    return row.channel;
  }
}
