import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { ParcelPolicyComponent } from './parcel-policy.component';

const routes: Routes = [{ path: '', component: ParcelPolicyComponent }];

@NgModule({
  declarations: [ParcelPolicyComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class ParcelPolicyModule {}
