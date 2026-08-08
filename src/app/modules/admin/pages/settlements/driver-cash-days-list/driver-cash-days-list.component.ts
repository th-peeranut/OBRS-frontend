import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DriverCashDaySummaryRespDto } from '../../../../../shared/interfaces/driver-cash.interface';
import { formatDisplayDate } from '../../../../../shared/lib/display-date-time';

export type DriverCashDaysContentState = 'loading' | 'invalid' | 'error' | 'empty' | 'data';

/**
 * OBRS-960 — dumb, mirrors `SettlementsListComponent` exactly (same
 * content-state contract, same replace-the-table-not-a-banner rule for
 * invalid/error/empty). Row activation emits `dayId`, not `scheduleId` —
 * a driver-cash "day" is its own resource, not a settlement round.
 *
 * ⚠️ CORRECTED (2026-08-02, backend reconciliation) — the row shape is the
 * real `DriverCashDaySummaryRespDto` (driver/business-date/vehicle-plate),
 * not the invented `routeLabel`/`departureDateTime`/`netCash`/`currency`
 * the first version of this component rendered — that data does not exist
 * on the day resource.
 *
 * OBRS-1073 — a row may now belong to a SALESPERSON, so the first column
 * carries `holderRole` and the `overdueOpen` clock icon. The icon is the only
 * place the owner's "no salesperson holds cash overnight" rule becomes
 * visible when it is broken; without it the backend flag would have no
 * surface, which is the same shape as never having enforced the rule.
 */
@Component({
    selector: 'app-driver-cash-days-list',
    templateUrl: './driver-cash-days-list.component.html',
    styleUrl: './driver-cash-days-list.component.scss',
    standalone: false
})
export class DriverCashDaysListComponent {
  @Input() items: DriverCashDaySummaryRespDto[] = [];
  @Input() contentState: DriverCashDaysContentState = 'loading';
  @Input() message = '';
  @Output() rowClick = new EventEmitter<number>();

  protected readonly skeletonRows = Array.from({ length: 5 });

  constructor(private readonly translate: TranslateService) {}

  protected displayDate(value: string): string {
    return formatDisplayDate(value, this.translate.currentLang);
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

  protected trackByDayId(_index: number, item: DriverCashDaySummaryRespDto): number {
    return item.dayId;
  }
}
