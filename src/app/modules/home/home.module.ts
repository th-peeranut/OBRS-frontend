// Angular Modules
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Third-Party Libraries
import { TranslateModule } from '@ngx-translate/core';
import { CalendarModule } from 'primeng/calendar';

// Application Components
import { HomeComponent } from './home.component';
import { NavbarComponent } from './components/navbar/navbar.component';
import { HomeBookingComponent } from './components/home-booking/home-booking.component';
import { DropdownObrsComponent } from '../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { DropdownObrsPassengerComponent } from './components/dropdown-obrs-passenger/dropdown-obrs-passenger.component';
import { StationHomeComponent } from './components/station-home/station-home.component';

const routes: Routes = [{ path: '', component: HomeComponent }];

@NgModule({
  declarations: [HomeComponent, NavbarComponent, HomeBookingComponent, StationHomeComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild(routes),
    TranslateModule.forChild({
      isolate: false,
    }),
    CalendarModule,

    // Components
    DropdownObrsComponent,
    DropdownObrsPassengerComponent,
  ],
})
export class HomeModule {}
