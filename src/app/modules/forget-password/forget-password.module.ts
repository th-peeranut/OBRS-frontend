import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ForgetPasswordComponent } from './forget-password.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

const routes: Routes = [{ path: '', component: ForgetPasswordComponent }];

@NgModule({
  declarations: [ForgetPasswordComponent],
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild({
      isolate: false,
    }),

    FormsModule,
    ReactiveFormsModule,
  ],
})
export class ForgetPasswordModule {}
