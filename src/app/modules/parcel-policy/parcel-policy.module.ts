import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ParcelPolicyContentModule } from './parcel-policy-content.module';
import { ParcelPolicyComponent } from './parcel-policy.component';

const routes: Routes = [{ path: '', component: ParcelPolicyComponent }];

@NgModule({
  imports: [ParcelPolicyContentModule, RouterModule.forChild(routes)],
})
export class ParcelPolicyModule {}
