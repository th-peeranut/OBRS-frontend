import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ParcelCarryOnRespDto, ParcelConsignedRespDto } from '../../../../shared/interfaces/parcel.interface';

/**
 * Dumb, presentational — shown after a successful walk-in intake POST.
 * Originally consigned-only (design spec: "On 201 -> show trackingNumber +
 * collectionCode + link to waybill"); OBRS-341 extends the SAME component to
 * also branch on the carry-on-on-seat response shape rather than forking a
 * second result-panel component (design-system §10, "extend, don't fork") —
 * the two shapes share the `[result]` input via a union type and the
 * template branches on `isCarryOnResult()`.
 *
 * OBRS-341 (card AC follow-up): the ON-SEAT carry-on outcome mints a
 * `pending` booking that the card's own AC requires a follow-up cash
 * payment for ("สร้าง booking PENDING → ต่อด้วยหน้าจ่ายเงิน walk-in cash").
 * This component stays presentational — the parent PAGE owns the actual
 * `payWalkIn()` HTTP call and the idempotency key, this component only
 * renders the button/states it's told about (`carryOnPaid`/
 * `isPayingCarryOn`/`carryOnPayErrorKey`) and emits `payCash`/`nextItem`.
 */
@Component({
    selector: 'app-parcel-intake-result-panel',
    templateUrl: './parcel-intake-result-panel.component.html',
    styleUrl: './parcel-intake-result-panel.component.scss',
    standalone: false
})
export class ParcelIntakeResultPanelComponent {
  @Input() result: ParcelConsignedRespDto | ParcelCarryOnRespDto | null = null;

  /** Whether the on-seat carry-on booking shown has already been paid via
   * `payCash`. Irrelevant (never read) for a free-aisle result or the
   * consigned branch. */
  @Input() carryOnPaid = false;
  /** True while the parent page's `payWalkIn()` call is in flight — disables
   * the pay button so a double-click can't fire it twice (the idempotency
   * key alone would make a double-fire harmless server-side, but a disabled
   * button is the honest UI signal that the first click was received). */
  @Input() isPayingCarryOn = false;
  /** Mapped i18n key for a failed pay attempt; `null` when there is none. */
  @Input() carryOnPayErrorKey: string | null = null;

  /** Emitted when the salesperson presses "เก็บเงินสด" (on-seat, unpaid
   * only — the template never renders this action for free-aisle). */
  @Output() payCash = new EventEmitter<void>();
  /** Emitted when the salesperson presses "รับชิ้นต่อไป" — rendered for
   * EVERY result (consigned, free-aisle, on-seat unpaid, on-seat paid). */
  @Output() nextItem = new EventEmitter<void>();

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

  /**
   * design-system §4 — "exactly one primary button per screen". Once a
   * result is showing, the form (and its own Submit primary) is hidden, so
   * this result panel is its own mini-screen with its own single primary
   * action: "View waybill" (consigned), "เก็บเงินสด" (on-seat, unpaid), or
   * "รับชิ้นต่อไป" itself once there is no OTHER primary action left
   * (free-aisle, and on-seat once paid). Never primary alongside "View
   * waybill" or an unpaid pay button — that would be two competing CTAs.
   */
  protected get isNextItemPrimary(): boolean {
    const r = this.result;
    if (!r) return true;
    if (!this.isCarryOnResult(r)) return false; // consigned: "View waybill" is primary
    if (r.freeAisle) return true; // free-aisle: next item is the only action
    return this.carryOnPaid; // on-seat: primary once paid; secondary while the pay button is still the CTA
  }
}
