import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './auth/auth.guard';

const routes: Routes = [
  {
    path: 'admin',
    canActivate: [AuthGuard],
    data: { requiredRoles: ['admin'] },
    loadChildren: () =>
      import('./modules/admin/admin.module').then((m) => m.AdminModule),
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
    canActivate: [AuthGuard],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/schedule-booking/schedule-booking.module').then(
        (m) => m.ScheduleBookingModule
      ),
  },
  {
    path: 'review-schedule-booking',
    canActivate: [AuthGuard],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/review-schedule-booking/review-schedule-booking.module').then(
        (m) => m.ReviewScheduleBookingModule
      ),
  },
  {
    path: 'passenger-info',
    canActivate: [AuthGuard],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/passenger-info/passenger-info.module').then(
        (m) => m.PassengerInfoModule
      ),
  },
  {
    path: 'payment',
    canActivate: [AuthGuard],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/payment/payment.module').then(
        (m) => m.PaymentModule
      ),
  },
  {
    path: 'e-ticket',
    canActivate: [AuthGuard],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/e-ticket/e-ticket.module').then(
        (m) => m.ETicketModule
      ),
  },
  {
    path: 'my-bookings',
    canActivate: [AuthGuard],
    data: { customerArea: true, requireAuth: true },
    loadChildren: () =>
      import('./modules/my-bookings/my-bookings.module').then(
        (m) => m.MyBookingsModule
      ),
  },
  {
    path: 'account',
    canActivate: [AuthGuard],
    data: { customerArea: true, requireAuth: true },
    loadChildren: () =>
      import('./modules/account/account.module').then(
        (m) => m.AccountModule
      ),
  },
  {
    // OBRS-433: reporter-facing "My Reports" — same shape as /my-bookings and
    // /account (customerArea + requireAuth: true bounces an anonymous visitor
    // to /login via the real guard, not just a hidden nav link).
    path: 'my-reports',
    canActivate: [AuthGuard],
    data: { customerArea: true, requireAuth: true },
    loadChildren: () =>
      import('./modules/my-reports/my-reports.module').then(
        (m) => m.MyReportsModule
      ),
  },
  {
    // OBRS-415: customer online consigned-parcel booking wizard + Omise
    // payment. Same guard/data as my-bookings/account — payment requires a
    // real account, no guest checkout (everything ties to actor_id).
    path: 'parcel-booking',
    canActivate: [AuthGuard],
    data: { customerArea: true, requireAuth: true },
    loadChildren: () =>
      import('./modules/parcel-booking/parcel-booking.module').then(
        (m) => m.ParcelBookingModule
      ),
  },
  {
    // OBRS-415: the customer's own paginated parcel list — the durable
    // recovery path for a tracking number lost after the one-time success
    // screen (no SMS/email notification exists yet, OBRS-346).
    path: 'my-parcels',
    canActivate: [AuthGuard],
    data: { customerArea: true, requireAuth: true },
    loadChildren: () =>
      import('./modules/my-parcels/my-parcels.module').then(
        (m) => m.MyParcelsModule
      ),
  },
  {
    path: 'refund-policy',
    canActivate: [AuthGuard],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/refund-policy/refund-policy.module').then(
        (m) => m.RefundPolicyModule
      ),
  },
  {
    path: 'privacy-policy',
    canActivate: [AuthGuard],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/privacy-policy/privacy-policy.module').then(
        (m) => m.PrivacyPolicyModule
      ),
  },
  {
    path: 'business-policy',
    canActivate: [AuthGuard],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/business-policy/business-policy.module').then(
        (m) => m.BusinessPolicyModule
      ),
  },
  {
    path: 'how-to-book',
    canActivate: [AuthGuard],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/how-to-book/how-to-book.module').then(
        (m) => m.HowToBookModule
      ),
  },

  {
    path: 'staff',
    canActivate: [AuthGuard],
    data: { requiredRoles: ['driver', 'salesperson'] },
    loadChildren: () =>
      import('./modules/staff/staff.module').then((m) => m.StaffModule),
  },

  {
    // OBRS-305: public parcel tracking — same permitAll-style precedent as
    // refund-policy (customerArea, no requireAuth). No access-model change.
    path: 'track-parcel',
    canActivate: [AuthGuard],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/parcel-tracking/parcel-tracking.module').then(
        (m) => m.ParcelTrackingModule
      ),
  },

  {
    path: 'verify-email',
    loadChildren: () =>
      import('./modules/verify-email/verify-email.module').then(
        (m) => m.VerifyEmailModule
      ),
  },
  {
    // Public — no guard. Opened logged-out or with a stale token from the
    // confirmation email; mirrors the /verify-email route shape.
    path: 'change-email/confirm',
    loadChildren: () =>
      import('./modules/change-email-confirm/change-email-confirm.module').then(
        (m) => m.ChangeEmailConfirmModule
      ),
  },
  {
    path: '',
    canActivate: [AuthGuard],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/home/home.module').then((m) => m.HomeModule),
  },
  { path: '**', redirectTo: '/' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
