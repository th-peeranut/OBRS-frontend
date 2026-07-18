import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { MyReportsComponent } from './my-reports.component';
import { MyReportDetailModalComponent } from './components/my-report-detail-modal/my-report-detail-modal.component';
import { MyReportEditFormComponent } from './components/my-report-edit-form/my-report-edit-form.component';
import { MyReportFollowUpComposerComponent } from './components/my-report-follow-up-composer/my-report-follow-up-composer.component';

const routes: Routes = [{ path: '', component: MyReportsComponent }];

/**
 * OBRS-433: reporter-facing "My Reports" — a CUSTOMER-shell module. Uses the
 * CUSTOMER-shell `app-dropdown-obrs` (standalone, imported directly here per
 * the locked UX spec) for the edit form's category select — NOT
 * `app-admin-dropdown`, and deliberately does NOT import `AdminSharedModule`
 * (this module has no admin-page concept at all).
 */
@NgModule({
  declarations: [
    MyReportsComponent,
    MyReportDetailModalComponent,
    MyReportEditFormComponent,
    MyReportFollowUpComposerComponent,
  ],
  imports: [SharedModule, RouterModule.forChild(routes), DropdownObrsComponent],
})
export class MyReportsModule {}
