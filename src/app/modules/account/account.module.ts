import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { AccountPageComponent } from './account-page.component';
import { ChangeEmailDialogComponent } from './components/change-email-dialog/change-email-dialog.component';

const routes: Routes = [{ path: '', component: AccountPageComponent }];

@NgModule({
  declarations: [AccountPageComponent, ChangeEmailDialogComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class AccountModule {}
