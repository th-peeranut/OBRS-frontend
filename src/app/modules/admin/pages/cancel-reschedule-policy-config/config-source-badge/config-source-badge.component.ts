import { Component, Input } from '@angular/core';

/**
 * OBRS-699 — the per-field "is this value yours, or is it the platform's?"
 * chip on the cancel/reschedule policy tab.
 *
 * It is a component rather than seven inline `<span>`s for one reason: SPEC
 * §7.6 makes any new text-carrying element a WCAG-gate trigger, so one
 * component is ONE element to measure in light and dark instead of seven
 * copies that can drift.
 *
 * No new token and no new hue: `.admin-status.is-neutral` and
 * `.admin-status.is-info` are existing entries of the design-system §2.4
 * status legend, and neither implies success or a problem — being overridden
 * is a fact, not a verdict. Never colour alone: both variants carry text, and
 * the same string is the accessible name.
 */
@Component({
    selector: 'app-config-source-badge',
    templateUrl: './config-source-badge.component.html',
    standalone: false
})
export class ConfigSourceBadgeComponent {
  /** True when the owner has set this value themselves; false when it is
   * still inherited from the platform default. */
  @Input() overridden = false;

  protected get sourceKey(): string {
    return this.overridden
      ? 'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.SOURCE.CUSTOM'
      : 'ADMIN.CANCEL_RESCHEDULE_POLICY_CONFIG.SOURCE.DEFAULT';
  }
}
