import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HomeComponent } from './home.component';
import { NavbarComponent } from './components/navbar/navbar.component';
import { TranslateModule } from '@ngx-translate/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeBookingComponent } from './components/home-booking/home-booking.component';

const routes: Routes = [{ path: '', component: HomeComponent }];

@NgModule({
  declarations: [HomeComponent, NavbarComponent, HomeBookingComponent],
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild(),
  ],
})
export class HomeModule {}
