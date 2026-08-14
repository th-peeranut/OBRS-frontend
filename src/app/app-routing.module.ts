import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './auth/auth.guard';
import { featureEnabledGuard } from './shared/guards/feature-flag.guard';

// OBRS-543: exported (was module-private) so nav-reachability.spec.ts can read
// each portal shell's own `requiredRoles`. Most admin child routes carry no
// guard of their own — they are protected solely by this shell entry — so a
// per-page access check that ignored it would read them as unprotected.
export const appRoutes: Routes = [
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
    // OBRS-613: the landing page for the emailed reset link. The path is NOT free to
    // rename — the backend builds the link from `app.mail.reset-password-path`
    // (`${app.frontend-url}/reset-password?token=`), and while this route did not exist
    // every reset email fell through to the '**' wildcard and redirected to home.
    // Public — no guard: it is opened logged out, by definition.
    path: 'reset-password',
    loadChildren: () =>
      import('./modules/reset-password/reset-password.module').then(
        (m) => m.ResetPasswordModule
      ),
  },
  // OBRS-856: the booking flow splits in two. Searching a trip and picking a seat
  // stay OPEN to guests — that is the shop window, and closing it costs both SEO
  // and every visitor who only wants to check times and fares. From /passenger-info
  // on, `requireAuth` matches what the backend actually enforces
  // (BookingService.createBooking → userService.getCurrentUser()), so a guest is
  // asked to sign in BEFORE typing passenger details rather than after — the
  // asymmetry that produced a false "session expired" at the payment button.
  // Both spellings are pinned by app-routing.module.spec.ts, in both directions.
  //
  // OBRS-858 landed and did exactly that: `requireAuth` is gone from /passenger-info
  // and /payment below. The paragraph above is kept because it records WHY those two
  // routes were ever guarded - to mirror the backend, not to protect anything of their
  // own - which is the reason removing the guard is safe rather than a loosening.
  //
  // OBRS-1302 draws the line for `features.onlineTicketBooking` in exactly the same
  // place, and for the same reason. /schedule-booking is the timetable-and-fare list
  // — the shop window. The three routes after it are the ones that take a seat and
  // then money, and those are the ones the flag closes. Gating the list instead would
  // delete the only part of the online channel still worth having while the counter
  // is unstaffed: it is what earns the #4 Google position and what a customer reads
  // before messaging the Facebook page.
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
    // OBRS-1302: first step that commits to a seat — flag-gated. `featureEnabledGuard`
    // runs AFTER AuthGuard, same order as the parcel routes below, so auth still
    // decides first and a closed flag redirects to '/' rather than 404ing.
    path: 'review-schedule-booking',
    canActivate: [AuthGuard, featureEnabledGuard('onlineTicketBooking')],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/review-schedule-booking/review-schedule-booking.module').then(
        (m) => m.ReviewScheduleBookingModule
      ),
  },
  // OBRS-858: `requireAuth` is OUT of both routes below, which is the removal OBRS-856
  // announced above. It was never a rule of its own - it existed only to mirror what
  // POST /api/private/bookings enforced, so that the sign-in prompt arrived before the
  // form rather than at the payment button. Guest checkout moves that endpoint
  // (POST /api/bookings, ADR-0123 Decision 1) and there is no longer anything server-side
  // for the guard to mirror; leaving it would be the frontend refusing a request the
  // backend now accepts. Pinned in both directions by app-routing.module.spec.ts.
  {
    // OBRS-1302: flag-gated — see /review-schedule-booking above.
    path: 'passenger-info',
    canActivate: [AuthGuard, featureEnabledGuard('onlineTicketBooking')],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/passenger-info/passenger-info.module').then(
        (m) => m.PassengerInfoModule
      ),
  },
  {
    // OBRS-1302: flag-gated — the route that reaches the LIVE Omise form, so this
    // is the one a deep link from a search engine must not be able to open.
    path: 'payment',
    canActivate: [AuthGuard, featureEnabledGuard('onlineTicketBooking')],
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
    // OBRS-622: gated behind environment.features.onlineParcelBooking (go-live
    // scope cut) — featureEnabledGuard runs AFTER AuthGuard so auth still
    // gates first; flag off redirects to home instead of loading the module.
    path: 'parcel-booking',
    canActivate: [AuthGuard, featureEnabledGuard('onlineParcelBooking')],
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
    // OBRS-622: gated behind environment.features.onlineParcelBooking — see
    // the parcel-booking route above.
    path: 'my-parcels',
    canActivate: [AuthGuard, featureEnabledGuard('onlineParcelBooking')],
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
    // OBRS-857: the PUBLIC booking lookup — booking number + the phone the booking
    // was made with, no account. `customerArea: true` and NO `requireAuth`, the same
    // shape as track-parcel below, and it must stay that way: a guest is precisely
    // who this page is for, so a `requireAuth` here would not tighten the page, it
    // would delete it.
    //
    // This is the precondition for ever making email optional at checkout (OBRS-858).
    // SMS is off and there is no LINE channel, so once the tab closes a guest's only
    // remaining copy of the ticket is the booking number — ADR-0123 Decision 5 settles
    // that the answer is RETRIEVAL, not delivery, and this route is that answer.
    // Pinned in both directions by app-routing.module.spec.ts.
    path: 'find-booking',
    canActivate: [AuthGuard],
    data: { customerArea: true },
    loadChildren: () =>
      import('./modules/find-booking/find-booking.module').then(
        (m) => m.FindBookingModule
      ),
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
  imports: [RouterModule.forRoot(appRoutes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
