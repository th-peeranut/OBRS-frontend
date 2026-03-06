import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { PrivacyPolicyComponent } from './privacy-policy.component';

const routes: Routes = [{ path: '', component: PrivacyPolicyComponent }];

@NgModule({
  declarations: [PrivacyPolicyComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class PrivacyPolicyModule {}
