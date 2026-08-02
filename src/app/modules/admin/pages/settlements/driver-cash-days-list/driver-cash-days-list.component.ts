import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DriverCashDayListItemDto } from '../../../../../shared/interfaces/driver-cash.interface';
import { formatDisplayDateTime } from '../../../../../shared/lib/display-date-time';

export type DriverCashDaysContentState = 'loading' | 'invalid' | 'error' | 'empty' | 'data';

/**
 * OBRS-960 — dumb, mirrors `SettlementsListComponent` exactly (same
 * content-state contract, same replace-the-table-not-a-banner rule for
 * invalid/error/empty). Row activation emits `dayId`, not `scheduleId` —
 * a driver-cash "day" is its own resource, not a settlement round.
 */
@Component({
    selector: 'app-driver-cash-days-list',
    templateUrl: './driver-cash-days-list.component.html',
    styleUrl: './driver-cash-days-list.component.scss',
    standalone: false
})
export class DriverCashDaysListComponent {
  @Input() items: DriverCashDayListItemDto[] = [];
  @Input() contentState: DriverCashDaysContentState = 'loading';
  @Input() message = '';
  @Output() rowClick = new EventEmitter<number>();

  protected readonly skeletonRows = Array.from({ length: 5 });

  constructor(private readonly translate: TranslateService) {}

  protected displayDateTime(value: string): string {
    return formatDisplayDateTime(value, this.translate.currentLang);
  }

  protected onRowActivate(dayId: number, event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea')) {
      return;
    }
    if (window.getSelection()?.toString()) {
      return;
    }
    this.rowClick.emit(dayId);
  }

  protected trackByDayId(_index: number, item: DriverCashDayListItemDto): number {
    return item.dayId;
  }
}
