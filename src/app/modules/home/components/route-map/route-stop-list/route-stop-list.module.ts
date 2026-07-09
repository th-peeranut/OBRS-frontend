import { NgModule } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { SharedModule } from '../../../../../shared/shared.module';
import { RouteStopListComponent } from './route-stop-list.component';

/**
 * Extracted from `HomeModule` so the dumb, presentational
 * `RouteStopListComponent` can be reused by other lazily-routed feature
 * modules (`my-bookings`'s change-stop dialog, OBRS-110 wave 2) without
 * pulling in `HomeModule`'s own `RouterModule.forChild([{ path: '', ... }])`
 * route, which would collide with the importing module's own route config —
 * the exact same reasoning behind `PaymentMethodsModule`'s extraction from
 * `PaymentModule` (see `payment-methods.module.ts`).
 */
@NgModule({
  declarations: [RouteStopListComponent],
  imports: [SharedModule, ButtonModule],
  exports: [RouteStopListComponent],
})
export class RouteStopListModule {}
