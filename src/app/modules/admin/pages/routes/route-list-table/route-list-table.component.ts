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

  // Whole-row click loads the route into the stop-sequence and fare panels
  // (OBRS-891) — the Actions column is text-right, so on a wide monitor the
  // View button is a mouse trip to the far edge of the screen. Same guard
  // idiom as BookingsPageComponent / UsabilityReportsPageComponent
  // .onRowActivate: the row carries no role/keyboard handler (the View button
  // is the accessible affordance), so ignore clicks on an interactive control
  // in the row and clicks that end a text selection. Reuses the existing
  // `view` output, so the parent needs no new wiring.
  protected onRowActivate(route: RouteRow, event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea')) {
      return;
    }
    if (window.getSelection()?.toString()) {
      return;
    }
    this.view.emit(route);
  }
}
