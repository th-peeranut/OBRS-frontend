import { Injectable } from '@angular/core';
import { CanDeactivate } from '@angular/router';
import { Observable } from 'rxjs';

/**
 * Implemented by any page that wants an unsaved-changes prompt on
 * navigation-away. The component owns the confirm copy/UX (typically via
 * `AlertService.confirm()`) — the guard is a thin, feature-agnostic wrapper
 * so it can be reused by any future route, not just OBRS-141's notification
 * preferences page.
 */
export interface CanComponentDeactivate {
  canDeactivate(): boolean | Observable<boolean> | Promise<boolean>;
}

@Injectable({
  providedIn: 'root',
})
export class CanDeactivateGuard implements CanDeactivate<CanComponentDeactivate> {
  canDeactivate(
    component: CanComponentDeactivate
  ): boolean | Observable<boolean> | Promise<boolean> {
    return component.canDeactivate ? component.canDeactivate() : true;
  }
}
