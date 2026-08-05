import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

/**
 * OBRS-1035 — the circular icon between the origin and destination pickers.
 *
 * It shipped on three customer screens as a bare decorative `<img>`: no role, no
 * tabindex, `cursor: auto`, and no swap feature anywhere in the codebase. Users
 * read it as a swap button anyway — it is a filled circle wrapped in two curved
 * arrows, sitting in the exact slot Skyscanner/Traveloka/Airpaz put theirs — so
 * the affordance was a lie, and the owner reported it as "the button does
 * nothing".
 *
 * This is that button, made real ONCE. The three call sites keep their own swap
 * action (each writes its own form group), but the markup, the accessible name,
 * the focus ring and the disabled rule live here so the next screen that needs
 * one cannot fork a fourth copy — which is precisely how OBRS-1021 / OBRS-1023 /
 * OBRS-1028 each happened on these same two templates.
 *
 * Sizing is a CSS custom property (`--station-swap-icon-size`), not an @Input:
 * custom properties inherit *through* Angular's emulated encapsulation, so a
 * call site restyles the icon from its own stylesheet without this component
 * growing a per-screen knob.
 */
@Component({
  selector: 'app-station-swap-button',
  templateUrl: './station-swap-button.component.html',
  styleUrl: './station-swap-button.component.scss',
  imports: [TranslateModule],
})
export class StationSwapButtonComponent {
  /** i18n KEY (never a literal) for the accessible name. Defaulted so no call
   *  site can accidentally ship an unnamed icon button; overridable for a
   *  surface whose wording differs. */
  @Input() ariaLabelKey = 'COMMON.SWAP_STATIONS';

  /** True when both fields are empty — see `canSwapStations()`. */
  @Input() disabled = false;

  @Output() swap = new EventEmitter<void>();
}
