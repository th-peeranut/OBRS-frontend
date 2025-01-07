import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoginMobileComponent } from './login-mobile.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

const routes: Routes = [{ path: '', component: LoginMobileComponent }];

@NgModule({
  declarations: [
    LoginMobileComponent,
  ],
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild({
      isolate: false,
    }),

    FormsModule,
    ReactiveFormsModule,
  ]
})
export class LoginMobileModule { }
