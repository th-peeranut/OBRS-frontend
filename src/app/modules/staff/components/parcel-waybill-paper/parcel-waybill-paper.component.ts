import { Component, Input } from '@angular/core';
import { WaybillRespDto } from '../../../../shared/interfaces/parcel.interface';
import { parcelStopLabel } from '../../../../shared/lib/parcel-stop-label';

/**
 * Dumb, presentational render of `WaybillRespDto` — reused for BOTH the
 * normal on-screen view and the CDK-portal print-only template
 * (`ParcelWaybillPageComponent`), so there is exactly one waybill "paper"
 * look rather than two markup copies. The QR (encoding `collectionToken`)
 * appears on this surface ONLY — never on the public tracking response/page.
 */
@Component({
  selector: 'app-parcel-waybill-paper',
  templateUrl: './parcel-waybill-paper.component.html',
  styleUrl: './parcel-waybill-paper.component.scss',
})
export class ParcelWaybillPaperComponent {
  @Input() waybill: WaybillRespDto | null = null;
  @Input() qrDataUrl = '';

  protected readonly parcelStopLabel = parcelStopLabel;
}
