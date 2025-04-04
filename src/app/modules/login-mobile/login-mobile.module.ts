// Modules
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';

// Components
import { LoginMobileComponent } from './login-mobile.component';

const routes: Routes = [{ path: '', component: LoginMobileComponent }];

@NgModule({
  declarations: [LoginMobileComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class LoginMobileModule {}
