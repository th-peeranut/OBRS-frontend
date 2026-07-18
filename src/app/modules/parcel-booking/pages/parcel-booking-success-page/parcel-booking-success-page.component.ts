import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { parcelDeliveryStatusChip, ParcelStatusChip } from '../../../../shared/lib/parcel-delivery-status';
import { readParcelBookingAmount } from '../../parcel-booking-amount-session';

/**
 * Smart, thin page: `/parcel-booking/success/:trackingNumber` — mirrors why
 * `/e-ticket` is its own route rather than a phase of `/payment` (refresh-
 * safe, deep-linkable). Renders static "what's next" copy + the `created`
 * status chip (§7 error/states table, UX-OBRS-415) — no collection code, no
 * waybill link (both are `null` on this path).
 *
 * `amountPaid` is a best-effort display, not a hard requirement: there is no
 * backend endpoint that resolves an amount from a bare tracking number alone
 * (the public `GET /parcels/track/{tn}` response has no `amount` field, and
 * inventing one is out of this card's locked contract). The booking page
 * stashes it in `sessionStorage` at the moment payment completes (same tab,
 * before the redirect); a direct/cross-device deep link to this URL simply
 * omits the amount line rather than guessing or erroring.
 */
@Component({
  selector: 'app-parcel-booking-success-page',
  templateUrl: './parcel-booking-success-page.component.html',
  styleUrl: './parcel-booking-success-page.component.scss',
})
export class ParcelBookingSuccessPageComponent implements OnInit {
  protected trackingNumber = '';
  protected amountPaid: number | null = null;
  protected readonly createdStatus: ParcelStatusChip = parcelDeliveryStatusChip('created');

  constructor(private readonly route: ActivatedRoute) {}

  ngOnInit(): void {
    this.trackingNumber = this.route.snapshot.paramMap.get('trackingNumber') ?? '';
    if (!this.trackingNumber) return;

    this.amountPaid = readParcelBookingAmount(this.trackingNumber);
  }
}
