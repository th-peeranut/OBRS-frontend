import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
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
  ): boolean {
    if (!this.authService.isAuthenticated()) {
      this.authService.setPostLoginRedirectUrl(state.url);
      this.router.navigate(['/login']);
      return false;
    }

    const requiredRoles = route.data['requiredRoles'];
    const routeRoles = Array.isArray(requiredRoles) ? requiredRoles : [];
    if (!this.authService.hasAnyRole(routeRoles)) {
      this.alertService.error(this.translate.instant('LOGIN.NO_ADMIN_PERMISSION'));
      this.router.navigate(['/home']);
      return false;
    }

    return true;
  }
}
