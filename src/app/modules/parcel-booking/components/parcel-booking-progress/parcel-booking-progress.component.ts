import { Component, Input } from '@angular/core';

export interface ParcelBookingProgressStep {
  labelKey: string;
}

/**
 * Small presentational, `@Input()`-driven step indicator for the 3-phase
 * parcel-booking wizard (UX-OBRS-415 §13 new pattern). Deliberately NOT
 * `app-stepper` — that component hardcodes 5 specific ROUTES
 * (`updateStepFromUrl` matches `router.url` against a fixed array), and this
 * flow's phases are deliberately NOT separate routes (keeping payment
 * embedded on the same page is what makes reusing `PaymentMethodsModule`
 * clean). No store/router injection — pure `@Input()`s.
 */
@Component({
    selector: 'app-parcel-booking-progress',
    templateUrl: './parcel-booking-progress.component.html',
    styleUrl: './parcel-booking-progress.component.scss',
    standalone: false
})
export class ParcelBookingProgressComponent {
  @Input() steps: ParcelBookingProgressStep[] = [];
  @Input() currentIndex = 0;
}
