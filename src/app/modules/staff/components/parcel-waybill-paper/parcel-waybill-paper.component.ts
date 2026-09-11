import { Component, EventEmitter, Input, Output } from '@angular/core';
import { WaybillRespDto } from '../../../../shared/interfaces/parcel.interface';
import { parcelStopLabel } from '../../../../shared/lib/parcel-stop-label';

/** Where this render is going. Screen and paper are NOT the same document. */
export type WaybillVariant = 'screen' | 'print';

/**
 * Dumb, presentational render of `WaybillRespDto` — reused for BOTH the
 * normal on-screen view and the CDK-portal print-only template
 * (`ParcelWaybillPageComponent`), so there is exactly one waybill "paper"
 * look rather than two markup copies.
 *
 * ⛔ OBRS-1808 removed a THIRD QR that used to sit here encoding the recipient's
 * `collectionToken`. Nothing in this product can read a QR — the collect dialog is a
 * text input and the only `@zxing/browser` scanner belongs to boarding — so it was a
 * per-parcel secret printed on the sender's own paper in a format no one could use.
 * The recipient's route to the collection code is the arrival SMS (OBRS-346).
 * `WaybillRespDto#collectionToken` still exists on the API and is deliberately not
 * read here: `POST /api/private/parcels/{id}/collect` still accepts it (ADR-0073 §5).
 *
 * `trackQrDataUrl` encodes the public tracking URL the sender keeps (OBRS-1353);
 * `termsQrDataUrl` encodes the public `/parcel-policy` page (OBRS-629) and is the same
 * URL on every waybill ever printed. The two must never swap.
 *
 * ⛔ `variant` is a real input, not a CSS `display: none`, because the difference is a
 * legal one and has to be assertable: clause 10 of the published terms REQUIRES the
 * printed paper to carry a QR to the full terms, while the screen — which clause 10
 * does not describe — offers a link that opens them in place. A `0`-count assertion on
 * the wrong variant fails loudly; a hidden node passes a `querySelector` either way.
 */
@Component({
    selector: 'app-parcel-waybill-paper',
    templateUrl: './parcel-waybill-paper.component.html',
    styleUrl: './parcel-waybill-paper.component.scss',
    standalone: false
})
export class ParcelWaybillPaperComponent {
  @Input() waybill: WaybillRespDto | null = null;
  @Input() trackQrDataUrl = '';
  @Input() termsQrDataUrl = '';
  @Input() variant: WaybillVariant = 'screen';

  /** Screen only — the paper cannot open anything. */
  @Output() openTerms = new EventEmitter<void>();

  protected readonly parcelStopLabel = parcelStopLabel;
}
