import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PromotionRow, statusClass as statusClassValue } from '../promotions-page.mappers';

// Presentational promotions list table, extracted from PromotionsPageComponent
// (OBRS-251, mirroring OBRS-213's RouteListTableComponent). No Store/HTTP
// access — all data comes in via @Input, all user actions go out via
// @Output. The round-trip row ("Managed above", no actions) is preserved
// verbatim from the original template.
@Component({
    selector: 'app-promotion-list-table',
    templateUrl: './promotion-list-table.component.html',
    styleUrl: './promotion-list-table.component.scss',
    standalone: false
})
export class PromotionListTableComponent {
  @Input() rows: PromotionRow[] = [];
  @Input() isLoading = false;
  @Input() skeletonRows: unknown[] = Array.from({ length: 5 });
  @Input() hasError = false;
  @Output() edit = new EventEmitter<PromotionRow>();
  @Output() deactivate = new EventEmitter<PromotionRow>();

  protected trackById(_index: number, row: PromotionRow): number {
    return row.id;
  }

  protected statusClass(statusCode: string): string {
    return statusClassValue(statusCode);
  }
}
