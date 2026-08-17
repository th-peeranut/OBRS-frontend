import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';

export type AdminSortDirection = 'asc' | 'desc';

export interface AdminSortChange {
  field: string;
  direction: AdminSortDirection;
}

// OBRS-1414: the reusable piece of "click a column header to sort" is the
// HEADER CELL, not a table component — admin+staff hold 46 hand-rolled
// `<table>` templates and zero `<p-table>`, so collapsing them into one
// `<app-data-table>` would mean rewriting 46 templates in a single commit.
// Hence the attribute selector on `<th>`: a call site opts a SINGLE column in
// and keeps its own markup untouched.
//
// The host IS the `<th>`, which is what lets `aria-sort` sit on the cell (the
// only element the a11y mapping accepts) while the clickable affordance is a
// real `<button>` inside it — the W3C APG sortable-table pattern: accessible
// name from the projected column label, state from `aria-sort`, no
// role/tabindex bolted onto the `<th>` itself.
//
// Deliberately DUMB about what "sorted" means to the caller: it emits
// `{field, direction}` and renders whatever `activeField`/`activeDirection`
// are fed back. Nothing here sorts rows — a list showing page 1 of 8 that
// reorders its own 20 DOM rows presents a wrong answer with full confidence,
// which is worse than having no sort at all, so the decision to send the sort
// to the backend (or not offer it) stays with each page.
@Component({
    selector: 'th[adminSortableHeader]',
    templateUrl: './admin-sortable-header.component.html',
    styleUrl: './admin-sortable-header.component.scss',
    standalone: false
})
export class AdminSortableHeaderComponent {
  /** Wire name of the column, e.g. 'createdAt' — echoed back in `sortChange`. */
  @Input({ required: true }) field = '';
  /** The field the list is CURRENTLY sorted by (null = none chosen yet). */
  @Input() activeField: string | null = null;
  @Input() activeDirection: AdminSortDirection = 'asc';
  @Output() sortChange = new EventEmitter<AdminSortChange>();

  @HostBinding('attr.aria-sort')
  get ariaSort(): 'ascending' | 'descending' | 'none' {
    if (!this.isActive) {
      return 'none';
    }
    return this.activeDirection === 'asc' ? 'ascending' : 'descending';
  }

  protected get isActive(): boolean {
    return this.activeField === this.field;
  }

  protected get icon(): string {
    if (!this.isActive) {
      return 'unfold_more';
    }
    return this.activeDirection === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  // Click the active column again -> flip direction; click a different column
  // -> start it at 'asc'. The rule lives here (not per call site) so every
  // table that adopts this header behaves identically.
  protected onClick(): void {
    this.sortChange.emit({
      field: this.field,
      direction: this.isActive && this.activeDirection === 'asc' ? 'desc' : 'asc',
    });
  }
}
