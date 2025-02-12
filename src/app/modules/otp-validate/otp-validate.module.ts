import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OtpValidateComponent } from './otp-validate.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { OtpComponent } from '../../shared/components/otp/otp.component';
 
const routes: Routes = [{ path: '', component: OtpValidateComponent }];

@NgModule({
  declarations: [
    OtpValidateComponent,
  ],
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    TranslateModule,

    FormsModule,
    ReactiveFormsModule,

    OtpComponent
  ],
})
export class OtpValidateModule { }
