import { Component, Input } from '@angular/core';
import { ParcelConsignedRespDto } from '../../../../shared/interfaces/parcel.interface';

/** Dumb, presentational — shown after a successful consigned-intake POST
 * (design spec: "On 201 -> show trackingNumber + collectionCode + link to
 * waybill"). No HTTP, no Store. */
@Component({
  selector: 'app-parcel-intake-result-panel',
  templateUrl: './parcel-intake-result-panel.component.html',
  styleUrl: './parcel-intake-result-panel.component.scss',
})
export class ParcelIntakeResultPanelComponent {
  @Input() result: ParcelConsignedRespDto | null = null;
}
