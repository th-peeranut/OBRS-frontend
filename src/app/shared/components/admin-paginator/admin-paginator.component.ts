import { Component, EventEmitter, Input, Output } from '@angular/core';

// OBRS-403: promoted from the inline Previous/Next markup that already lived
// in bookings-page.component.html (built from admin-theme.scss's
// .admin-inline-actions/.admin-btn primitives, themed in both light+dark) —
// now that a second admin list (usability-reports) needs the same
// server-side paginator, this is the shared dumb component both call sites
// render. Deliberately no .scss: every class it renders resolves against the
// global admin-theme.scss, verbatim.
@Component({
  selector: 'app-admin-paginator',
  templateUrl: './admin-paginator.component.html',
})
export class AdminPaginatorComponent {
  @Input() currentPage = 1;
  @Input() totalPages = 1;
  @Input() disabled = false;
  @Output() pageChange = new EventEmitter<number>();
}
