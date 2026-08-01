import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SettlementPendingItemDto } from '../../../../../shared/interfaces/settlement.interface';
import { formatDisplayDateTime } from '../../../../../shared/lib/display-date-time';

export type SettlementsContentState = 'loading' | 'invalid' | 'error' | 'empty' | 'data';

/**
 * Dumb (presentational) table for the settlements list. The smart page owns
 * the store subscription, the date-range filter, and all state derivation
 * (`contentState`) — this component only renders off its inputs and emits a
 * `scheduleId` on row activation.
 *
 * Empty/error/invalid states REPLACE the table body (design-system.md §
 * "Empty/error state replaces the table, not a zero-row table beside a
 * banner") — the invalid/error text itself is owned by the page (translated
 * there, since the range-guard/error messages are page-specific), passed in
 * via `[message]`.
 *
 * `GET /settlements/pending` (`SettlementPendingItemDto`) never returns a
 * `status` field — the endpoint's contract is "departed, not-yet-settled
 * rounds only", so every row is definitionally PENDING; the status pill is
 * rendered as a static PENDING badge rather than bound to a per-item field.
 */
@Component({
    selector: 'app-settlements-list',
    templateUrl: './settlements-list.component.html',
    styleUrl: './settlements-list.component.scss',
    standalone: false
})
export class SettlementsListComponent {
  @Input() items: SettlementPendingItemDto[] = [];
  @Input() contentState: SettlementsContentState = 'loading';
  /** Pre-translated message for the 'invalid' and 'error' states. */
  @Input() message = '';
  @Output() rowClick = new EventEmitter<number>();

  protected readonly skeletonRows = Array.from({ length: 5 });

  constructor(private readonly translate: TranslateService) {}

  protected displayDateTime(value: string): string {
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

  protected onRowActivate(scheduleId: number, event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea')) {
      return;
    }
    if (window.getSelection()?.toString()) {
      return;
    }
    this.rowClick.emit(scheduleId);
  }

  protected trackByScheduleId(_index: number, item: SettlementPendingItemDto): number {
    return item.scheduleId;
  }
}
