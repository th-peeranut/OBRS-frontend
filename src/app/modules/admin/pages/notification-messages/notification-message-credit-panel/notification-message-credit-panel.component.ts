import { Component, Input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * OBRS-1308 AC12 — dumb, pure-display SMS credit panel. Reused as-is by both
 * the owner edit page (fed by the 500ms-debounced credit-preview call) and the
 * admin review-detail page (fed by the GET detail's own `creditEstimate`).
 *
 * <p><b>Display only.</b> Never disables Save, never raises a validation
 * error — that is an explicit user decision (card comment 12321). The colour
 * composes already-declared `--admin-*-fg` SURFACE tokens (§2.4.0 — never a
 * chip `-text` half used standalone), a one-off "colour by delta direction"
 * pattern, not a new token.
 */
@Component({
    selector: 'app-notification-message-credit-panel',
    templateUrl: './notification-message-credit-panel.component.html',
    styleUrl: './notification-message-credit-panel.component.scss',
    standalone: false
})
export class NotificationMessageCreditPanelComponent {
  @Input() credits: number | null = null;
  @Input() baselineCredits: number | null = null;
  @Input() encoding: 'GSM7' | 'UCS2' | null = null;

  constructor(private readonly translate: TranslateService) {}

  protected get delta(): number {
    return (this.credits ?? 0) - (this.baselineCredits ?? 0);
  }

  protected get deltaDisplay(): string {
    if (this.delta > 0) {
      return `+${this.delta}`;
    }
    if (this.delta < 0) {
      return `${this.delta}`;
    }
    return this.translate.instant('ADMIN.NOTIFICATION_MESSAGES.CREDIT.DELTA_ZERO');
  }

  protected get deltaClass(): string {
    if (this.delta > 0) {
      return 'is-warning';
    }
    if (this.delta < 0) {
      return 'is-success';
    }
    return 'is-muted';
  }
}
