import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouteRow, statusClass as statusClassValue } from '../routes.mappers';

// Presentational route list table, extracted from RoutesPageComponent
// (OBRS-213). No Store/HTTP access — all data comes in via @Input, all user
// actions go out via @Output.
@Component({
  selector: 'app-route-list-table',
  templateUrl: './route-list-table.component.html',
  styleUrl: './route-list-table.component.scss',
})
export class RouteListTableComponent {
  @Input() routes: RouteRow[] = [];
  @Input() totalCount = 0;
  @Input() selectedRouteSlug = '';
  @Input() isLoading = false;
  @Input() hasError = false;
  @Output() view = new EventEmitter<RouteRow>();
  @Output() edit = new EventEmitter<RouteRow>();
  @Output() delete = new EventEmitter<RouteRow>();

  protected readonly skeletonRows = Array.from({ length: 5 });

  protected trackByRouteId(_index: number, item: RouteRow): number {
    return item.id;
  }

  protected statusClass(status: string): string {
    return statusClassValue(status);
  }
}
