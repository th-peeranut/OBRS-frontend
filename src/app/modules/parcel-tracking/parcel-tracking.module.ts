import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared.module';
import { ParcelTrackingPageComponent } from './pages/parcel-tracking-page/parcel-tracking-page.component';

const routes: Routes = [
  { path: '', component: ParcelTrackingPageComponent },
  { path: ':trackingNumber', component: ParcelTrackingPageComponent },
];

@NgModule({
  declarations: [ParcelTrackingPageComponent],
  imports: [SharedModule, ReactiveFormsModule, RouterModule.forChild(routes)],
})
export class ParcelTrackingModule {}
