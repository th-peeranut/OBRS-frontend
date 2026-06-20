import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminDropdownComponent } from './components/admin-dropdown/admin-dropdown.component';
import { AdminRefreshHintComponent } from './components/admin-refresh-hint/admin-refresh-hint.component';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

/**
 * Thin shared module that declares and exports the admin UI primitives that
 * are used both in AdminModule and StaffModule. AdminModule imports this
 * module (and removes its direct declarations of these two components).
 */
@NgModule({
  declarations: [AdminDropdownComponent, AdminRefreshHintComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule],
  exports: [AdminDropdownComponent, AdminRefreshHintComponent],
})
export class AdminSharedModule {}
