import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ForgetPasswordComponent } from './forget-password.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from '../../shared/shared.module';

const routes: Routes = [{ path: '', component: ForgetPasswordComponent }];

@NgModule({
  declarations: [ForgetPasswordComponent],
  imports: [
    SharedModule,
    CommonModule,
    RouterModule.forChild(routes),
    TranslateModule,

    FormsModule,
    ReactiveFormsModule,
  ],
})
export class ForgetPasswordModule {}
