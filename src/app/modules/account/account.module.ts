import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputSwitchModule } from 'primeng/inputswitch';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SharedModule } from '../../shared/shared.module';
import { CanDeactivateGuard } from '../../shared/guards/can-deactivate.guard';
import { AccountPageComponent } from './account-page.component';
import { ChangeEmailDialogComponent } from './components/change-email-dialog/change-email-dialog.component';
import { CloseAccountDialogComponent } from './components/close-account-dialog/close-account-dialog.component';
import { NotificationPreferenceMatrixComponent } from './components/notification-preference-matrix/notification-preference-matrix.component';
import { NotificationPreferenceRowComponent } from './components/notification-preference-row/notification-preference-row.component';
import { NotificationPreferencesPageComponent } from './pages/notification-preferences/notification-preferences-page.component';

const routes: Routes = [
  { path: '', component: AccountPageComponent },
  {
    path: 'notification-preferences',
    component: NotificationPreferencesPageComponent,
    canDeactivate: [CanDeactivateGuard],
  },
];

@NgModule({
  declarations: [
    AccountPageComponent,
    ChangeEmailDialogComponent,
    CloseAccountDialogComponent,
    NotificationPreferencesPageComponent,
    NotificationPreferenceMatrixComponent,
    NotificationPreferenceRowComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(routes),
    ButtonModule,
    InputSwitchModule,
    ProgressSpinnerModule,
  ],
})
export class AccountModule {}
