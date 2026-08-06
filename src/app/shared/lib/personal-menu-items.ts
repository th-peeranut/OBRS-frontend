// OBRS-1071: THE personal ("ตัวฉัน") menu model — one array, four render sites.
//
// /account, /my-bookings, /my-parcels and /my-reports are the same four pages
// for every signed-in user, whatever shell they happen to be standing in. The
// list was hand-written twice inside navbar.component.html alone (the desktop
// profile dropdown and the ≤992px mobile panel) and was missing entirely from
// the staff and admin shells — which is the gap this card opened on. Wiring the
// two shells by copying the markup a third and fourth time would have made
// "add a fifth personal page" a four-file edit where three of the four are easy
// to miss and nothing fails when you do: every copy renders fine on its own.
//
// Deliberately NOT a module-level `const`. `environment.features.
// onlineParcelBooking` is read per call, so a spec that flips the flag before
// creating the component sees the new value. A const would freeze the flag at
// module-load time — before any spec body runs — and both directions of the
// My Parcels gate would become impossible to test.
//
// Call this ONCE per component instance, into a stable field — never from a
// template expression. A fresh array allocated every change-detection cycle and
// handed to a loop containing router directives never lets change detection
// stabilise and hard-locks the browser (the failure documented at length on
// AdminLayoutComponent.navLinkActiveMatch, OBRS-939).
import { environment } from '../../../environments/environment';

export interface PersonalMenuItem {
  /**
   * ABSOLUTE route path, so the same entry resolves identically from the public
   * site and from inside the /staff and /admin shells. All four are declared in
   * app-routing.module.ts with `customerArea: true` + `requireAuth: true`, and
   * auth.guard.ts's customerArea branch checks authentication only — every
   * signed-in role may open them.
   */
  path: string;
  labelKey: string;
  icon: string;
}

export function buildPersonalMenuItems(): PersonalMenuItem[] {
  return [
    { path: '/account', labelKey: 'HOME.NAVBAR.ACCOUNT', icon: 'manage_accounts' },
    { path: '/my-bookings', labelKey: 'HOME.NAVBAR.MY_BOOKINGS', icon: 'confirmation_number' },
    // OBRS-622 go-live scope cut. The /my-parcels ROUTE itself carries
    // featureEnabledGuard('onlineParcelBooking'), so the link has to follow the
    // same flag — offering it while the flag is off would send the user to a
    // guard that bounces them home. Off by default (environment.base.ts), so
    // this array carries three items today, not four.
    ...(environment.features.onlineParcelBooking
      ? [{ path: '/my-parcels', labelKey: 'HOME.NAVBAR.MY_PARCELS', icon: 'local_shipping' }]
      : []),
    { path: '/my-reports', labelKey: 'HOME.NAVBAR.MY_REPORTS', icon: 'flag' },
  ];
}
