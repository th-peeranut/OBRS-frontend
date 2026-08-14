import { Component, Input } from '@angular/core';
import { WaybillRespDto } from '../../../../shared/interfaces/parcel.interface';
import { parcelStopLabel } from '../../../../shared/lib/parcel-stop-label';

/**
 * Dumb, presentational render of `WaybillRespDto` — reused for BOTH the
 * normal on-screen view and the CDK-portal print-only template
 * (`ParcelWaybillPageComponent`), so there is exactly one waybill "paper"
 * look rather than two markup copies. The QR (encoding `collectionToken`)
 * appears on this surface ONLY — never on the public tracking response/page.
 *
 * ⛔ OBRS-1353 puts a SECOND QR on the same paper, and the two must never swap:
 * `qrDataUrl` encodes the recipient's `collectionToken` (a secret), while
 * `trackQrDataUrl` encodes a public tracking URL meant for the sender to keep.
 */
@Component({
    selector: 'app-parcel-waybill-paper',
    templateUrl: './parcel-waybill-paper.component.html',
    styleUrl: './parcel-waybill-paper.component.scss',
    standalone: false
})
export class ParcelWaybillPaperComponent {
  @Input() waybill: WaybillRespDto | null = null;
  @Input() qrDataUrl = '';
  @Input() trackQrDataUrl = '';

  protected readonly parcelStopLabel = parcelStopLabel;
}
