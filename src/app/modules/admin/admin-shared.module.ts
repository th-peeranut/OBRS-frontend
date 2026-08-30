import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminDropdownComponent } from './components/admin-dropdown/admin-dropdown.component';
import { AdminRefreshHintComponent } from './components/admin-refresh-hint/admin-refresh-hint.component';
import { AdminPaginatorComponent } from './components/admin-paginator/admin-paginator.component';
import { AdminSortableHeaderComponent } from './components/admin-sortable-header/admin-sortable-header.component';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TitleLabelPipe } from '../../shared/pipes/title-label.pipe';
import { DatePickerModule } from 'primeng/datepicker';
import { ExpenseBillCardComponent } from './pages/expenses/expense-bill-card/expense-bill-card.component';
import { ExpensePayeePickerComponent } from './pages/expenses/expense-payee-picker/expense-payee-picker.component';
import { ExpensePartPickerComponent } from './pages/expenses/expense-part-picker/expense-part-picker.component';

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
 *
 * OBRS-1630: `ExpenseBillCardComponent` (and the payee picker it renders) move here on the
 * same rule. The staff cash box's `เพิ่มรายการซ่อม` box IS this card — the owner's ruling
 * (2026-08-24) was to reuse it, not to grow a second bill editor that would drift. It is not a
 * `SharedModule` candidate either: it is `.admin-field`/`.admin-btn` throughout, so outside an
 * admin or staff shell it renders unstyled, and `SharedModule` reaches ~25 modules including
 * every public customer-facing one.
 *
 * OBRS-1613: `ExpensePartPickerComponent` follows the payee picker for the same reason and by
 * the same route — the bill card renders it, and the bill card now lives here, so declaring it
 * back in `AdminModule` would be a second declaration of a component this module already owns
 * the template of. `ExpenseFormModalComponent` (still in `AdminModule`) reaches it through the
 * export, exactly as it reaches the payee picker.
 */
@NgModule({
  declarations: [
    AdminDropdownComponent,
    AdminRefreshHintComponent,
    AdminPaginatorComponent,
    AdminSortableHeaderComponent,
    ExpensePayeePickerComponent,
    ExpensePartPickerComponent,
    ExpenseBillCardComponent,
  ],
  imports: [
    TitleLabelPipe,CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, DatePickerModule],
  exports: [
    AdminDropdownComponent,
    AdminRefreshHintComponent,
    AdminPaginatorComponent,
    AdminSortableHeaderComponent,
    ExpensePayeePickerComponent,
    ExpensePartPickerComponent,
    ExpenseBillCardComponent,
  ],
})
export class AdminSharedModule {}
