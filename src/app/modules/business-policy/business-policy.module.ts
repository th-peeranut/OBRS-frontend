import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { BusinessPolicyComponent } from './business-policy.component';

const routes: Routes = [{ path: '', component: BusinessPolicyComponent }];

@NgModule({
  declarations: [BusinessPolicyComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class BusinessPolicyModule {}
