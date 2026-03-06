import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { RefundPolicyComponent } from './refund-policy.component';

const routes: Routes = [{ path: '', component: RefundPolicyComponent }];

@NgModule({
  declarations: [RefundPolicyComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class RefundPolicyModule {}
