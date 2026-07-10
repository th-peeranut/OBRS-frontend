import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SharedModule } from '../../shared/shared.module';
import { ChangeEmailConfirmComponent } from './change-email-confirm.component';

const routes: Routes = [{ path: '', component: ChangeEmailConfirmComponent }];

@NgModule({
  declarations: [ChangeEmailConfirmComponent],
  imports: [SharedModule, RouterModule.forChild(routes), ProgressSpinnerModule],
})
export class ChangeEmailConfirmModule {}
