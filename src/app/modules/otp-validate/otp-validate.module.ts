// Modules
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';

// Components
import { OtpValidateComponent } from './otp-validate.component';
import { OtpComponent } from '../../shared/components/otp/otp.component';

const routes: Routes = [{ path: '', component: OtpValidateComponent }];

@NgModule({
  declarations: [OtpValidateComponent],
  imports: [
    SharedModule,
    RouterModule.forChild(routes),

    // Add-ons
    OtpComponent,
  ],
})
export class OtpValidateModule {}
