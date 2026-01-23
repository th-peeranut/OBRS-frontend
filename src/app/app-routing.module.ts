import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () =>
      import('./modules/home/home.module').then((m) => m.HomeModule),
  },
  {
    path: 'login',
    loadChildren: () =>
      import('./modules/login/login.module').then((m) => m.LoginModule),
  },
  {
    path: 'login-mobile',
    loadChildren: () =>
      import('./modules/login-mobile/login-mobile.module').then(
        (m) => m.LoginMobileModule
      ),
  },
  {
    path: 'register',
    loadChildren: () =>
      import('./modules/register/register.module').then(
        (m) => m.RegisterModule
      ),
  },
  {
    path: 'otp/:option/:phoneno',
    loadChildren: () =>
      import('./modules/otp-validate/otp-validate.module').then(
        (m) => m.OtpValidateModule
      ),
  },
  {
    path: 'forget-password',
    loadChildren: () =>
      import('./modules/forget-password/forget-password.module').then(
        (m) => m.ForgetPasswordModule
      ),
  },
  {
    path: 'schedule-booking',
    loadChildren: () =>
      import('./modules/schedule-booking/schedule-booking.module').then(
        (m) => m.ScheduleBookingModule
      ),
  },
  {
    path: 'review-schedule-booking',
    loadChildren: () =>
      import('./modules/review-schedule-booking/review-schedule-booking.module').then(
        (m) => m.ReviewScheduleBookingModule
      ),
  },
  {
    path: 'passenger-info',
    loadChildren: () =>
      import('./modules/passenger-info/passenger-info.module').then(
        (m) => m.PassengerInfoModule
      ),
  },
  {
    path: 'payment',
    loadChildren: () =>
      import('./modules/payment/payment.module').then(
        (m) => m.PaymentModule
      ),
  },
  {
    path: 'e-ticket',
    loadChildren: () =>
      import('./modules/e-ticket/e-ticket.module').then(
        (m) => m.ETicketModule
      ),
  },

  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: '**', redirectTo: '/home' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
