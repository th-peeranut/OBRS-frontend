import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared.module';
import { FindBookingPageComponent } from './pages/find-booking-page/find-booking-page.component';
import { TitleLabelPipe } from '../../shared/pipes/title-label.pipe';

const routes: Routes = [{ path: '', component: FindBookingPageComponent }];

@NgModule({
  declarations: [FindBookingPageComponent],
  imports: [
    TitleLabelPipe,SharedModule, ReactiveFormsModule, RouterModule.forChild(routes)],
})
export class FindBookingModule {}
