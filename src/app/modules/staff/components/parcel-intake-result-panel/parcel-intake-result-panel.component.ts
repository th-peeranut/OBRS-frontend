import { Component, Input } from '@angular/core';
import { ParcelCarryOnRespDto, ParcelConsignedRespDto } from '../../../../shared/interfaces/parcel.interface';

/**
 * Dumb, presentational — shown after a successful walk-in intake POST.
 * Originally consigned-only (design spec: "On 201 -> show trackingNumber +
 * collectionCode + link to waybill"); OBRS-341 extends the SAME component to
 * also branch on the carry-on-on-seat response shape rather than forking a
 * second result-panel component (design-system §10, "extend, don't fork") —
 * the two shapes share the `[result]` input via a union type and the
 * template branches on `isCarryOnResult()`. No HTTP, no Store either way.
 */
@Component({
  selector: 'app-parcel-intake-result-panel',
  templateUrl: './parcel-intake-result-panel.component.html',
  styleUrl: './parcel-intake-result-panel.component.scss',
})
export class ParcelIntakeResultPanelComponent {
  @Input() result: ParcelConsignedRespDto | ParcelCarryOnRespDto | null = null;

  /**
   * Type-guard discriminant. `ParcelCarryOnRespDto.parcelType` is always
   * `'carry_on_seat'`; `ParcelConsignedRespDto` has no `parcelType` field at
   * all (the consigned walk-in response never echoes one), so this reads as
   * `undefined` there — never a MAP/Record lookup, so it is outside
   * `test:proto-key`'s scope (that gate only tracks object-literal
   * `Record<...>` bindings indexed by a runtime key, not a plain typed DTO's
   * own declared property).
   */
  protected isCarryOnResult(
    result: ParcelConsignedRespDto | ParcelCarryOnRespDto
  ): result is ParcelCarryOnRespDto {
    return (result as Partial<ParcelCarryOnRespDto>).parcelType === 'carry_on_seat';
  }
}
