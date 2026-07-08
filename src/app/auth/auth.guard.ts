import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthService } from './auth.service';
import { AlertService } from '../shared/services/alert.service';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
    private alertService: AlertService,
    private translate: TranslateService
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    // Customer/public area: guests may browse freely, but a logged-in user who
    // is confined to a portal (admin/staff) is bounced back to their own area.
    // `requireAuth` (e.g. My Bookings) additionally forces guests to log in.
    if (route.data['customerArea'] === true) {
      if (this.authService.isAuthenticated()) {
        if (!this.authService.canAccessCustomerArea()) {
          return this.router.parseUrl(this.authService.getHomeRoute());
        }
        return true;
      }

      if (route.data['requireAuth'] === true) {
        this.authService.setPostLoginRedirectUrl(state.url);
        return this.router.parseUrl('/login');
      }

      return true;
    }

    // Protected portal (admin/staff): authentication is mandatory.
    if (!this.authService.isAuthenticated()) {
      this.authService.setPostLoginRedirectUrl(state.url);
      return this.router.parseUrl('/login');
    }

    const requiredRoles = route.data['requiredRoles'];
    const routeRoles = Array.isArray(requiredRoles) ? requiredRoles : [];
    if (!this.authService.hasAnyRole(routeRoles)) {
      this.alertService.error(this.translate.instant('LOGIN.NO_ADMIN_PERMISSION'));
      // Send them to their own portal rather than the public home, so an admin
      // isn't bounced onto a customer page (which would bounce them again).
      return this.router.parseUrl(this.authService.getHomeRoute());
    }

    return true;
  }
}
