import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminDropdownComponent } from './components/admin-dropdown/admin-dropdown.component';
import { AdminRefreshHintComponent } from './components/admin-refresh-hint/admin-refresh-hint.component';
import { AdminPaginatorComponent } from './components/admin-paginator/admin-paginator.component';
import { AdminSortableHeaderComponent } from './components/admin-sortable-header/admin-sortable-header.component';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TitleLabelPipe } from '../../shared/pipes/title-label.pipe';

/**
 * Thin shared module that declares and exports the admin UI primitives that
 * are used both in AdminModule and StaffModule. AdminModule imports this
 * module (and removes its direct declarations of these two components).
 *
 * OBRS-403 (Scrutinize): `AdminPaginatorComponent` belongs HERE, not in
 * `SharedModule`. It is not a generic primitive — it renders `.admin-btn` /
 * `.admin-muted` / `.admin-inline-actions`, which only resolve inside
 * `.admin-shell` (`dark-theme.scss` deliberately excludes that subtree), so
 * outside an admin/staff shell it renders unstyled. `SharedModule` is imported
 * by ~25 modules including every public customer-facing one; exporting an
 * admin-only primitive into all of them widens its scope for no consumer.
 * The `AdminModalBackdropDirective` precedent does NOT apply in reverse: that
 * moved to `SharedModule` because it is genuinely generic AND a
 * SharedModule-declared component (`BoardingListComponent`) needed it, which
 * would otherwise have forced a SharedModule -> AdminModule cycle. Neither
 * holds here — the paginator's only consumers are admin/staff pages, and both
 * of those shells already import this module.
 *
 * OBRS-1414: `AdminSortableHeaderComponent` lands here for the same reason —
 * it is a `<th>` inside `.admin-table`, whose thead typography/colour comes
 * from `.admin-shell`-scoped rules in admin-theme.scss, and its only
 * prospective consumers are the 46 hand-rolled admin/staff tables.
 */
@NgModule({
  declarations: [
    AdminDropdownComponent,
    AdminRefreshHintComponent,
    AdminPaginatorComponent,
    AdminSortableHeaderComponent,
  ],
  imports: [
    TitleLabelPipe,CommonModule, FormsModule, ReactiveFormsModule, TranslateModule],
  exports: [
    AdminDropdownComponent,
    AdminRefreshHintComponent,
    AdminPaginatorComponent,
    AdminSortableHeaderComponent,
  ],
})
export class AdminSharedModule {}
