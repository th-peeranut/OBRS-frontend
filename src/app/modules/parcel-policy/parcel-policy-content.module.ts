import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { ParcelPolicyComponent } from './parcel-policy.component';

/**
 * OBRS-1808: `ParcelPolicyComponent` was declared by the routed `ParcelPolicyModule`, which put
 * it out of reach of everything except the `/parcel-policy` route. The staff waybill now shows
 * the same clauses in a modal, so the declaration lives here instead — a module with no routes
 * that both lazy chunks can import. Importing `ParcelPolicyModule` from the staff module would
 * register its `path: ''` route a second time inside the staff injector.
 */
@NgModule({
  declarations: [ParcelPolicyComponent],
  imports: [SharedModule],
  exports: [ParcelPolicyComponent],
})
export class ParcelPolicyContentModule {}
