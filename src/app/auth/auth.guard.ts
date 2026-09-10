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
    // Customer/public area: open to everyone — guests and every logged-in role
    // alike. `requireAuth` (e.g. My Bookings) is the only thing that narrows it,
    // and it narrows by AUTHENTICATION, never by role: it forces a guest to log
    // in and lets every signed-in user straight through.
    //
    // OBRS-1001 removed the role half of this branch. It used to bounce a
    // logged-in user whom `canAccessCustomerArea()` reported as portal-confined
    // back to `getHomeRoute()` — and with salesperson/driver the only members of
    // that list, that meant the staff shell's own "หน้าแรก" brand link could
    // never work for the only two roles that see it. The list is gone (see
    // auth.service.ts and docs/adr/0037-no-frontend-portal-confinement.md), so
    // nothing is left for the rejection to catch; keeping it would leave an
    // unreachable predicate that still reads like an enforced rule.
    if (route.data['customerArea'] === true) {
      if (
        !this.authService.isAuthenticated() &&
        route.data['requireAuth'] === true
      ) {
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
      this.alertService.permissionDenied(this.translate.instant('LOGIN.NO_ADMIN_PERMISSION'));
      // Send them to their own portal rather than the public home, so an admin
      // isn't bounced onto a customer page (which would bounce them again).
      return this.router.parseUrl(this.authService.getHomeRoute());
    }

    // OBRS-1498: a second, NARROWER key for the pages whose backend doors are
    // `hasRole('ADMIN')` and therefore 403 an owner (WebSecurityConfig.java's
    // hierarchy runs ROLE_ADMIN > ROLE_OWNER only — admin inherits owner, never
    // the reverse). `requiredRoles` above cannot express this: ROLE_GRANTS makes
    // ['admin'] and ['owner'] one predicate, so an owner satisfies ['admin'].
    // This one reads the HELD role. Absent on almost every route — the area
    // check above stays the rule, this is the exception for admin-only pages.
    const requiredHeldRoles = route.data['requiredHeldRoles'];
    const heldRoles = Array.isArray(requiredHeldRoles) ? requiredHeldRoles : [];
    if (!this.authService.hasHeldRole(heldRoles)) {
      this.alertService.permissionDenied(this.translate.instant('LOGIN.NO_ADMIN_PERMISSION'));
      return this.router.parseUrl(this.authService.getHomeRoute());
    }

    return true;
  }
}
