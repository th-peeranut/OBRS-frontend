import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from '../../shared/shared.module';
import { ResetPasswordComponent } from './reset-password.component';

const routes: Routes = [{ path: '', component: ResetPasswordComponent }];

@NgModule({
  declarations: [ResetPasswordComponent],
  imports: [
    SharedModule,
    CommonModule,
    RouterModule.forChild(routes),
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
  ],
})
export class ResetPasswordModule {}
