import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { ToggleSwitch, ToggleSwitchChangeEvent } from 'primeng/toggleswitch';
import { NotificationPreferenceRow } from '../../../../shared/interfaces/notification-preference.interface';

export interface NotificationPreferenceRowChange {
  type: string;
  channel: 'email' | 'sms';
  enabled: boolean;
}

/**
 * Dumb row renderer (OBRS-141). Deliberately binds each `p-toggleSwitch` with
 * one-way `[ngModel]` + `(onChange)` — NOT `[(ngModel)]` — so the parent page
 * can VETO a change (the ≥1-channel rule on critical rows).
 *
 * PrimeNG's `ToggleSwitch` flips its own internal `checked` state on click
 * before `(onChange)`/`ngModel` ever run, and `writeValue` is only invoked by
 * Angular forms machinery when the bound `[ngModel]` *value* changes. On a
 * veto, the parent deliberately leaves `row` untouched, so the value never
 * changes and `writeValue` never fires — the slider would stay visually
 * flipped while the model (correctly) didn't move. To guarantee the switch
 * always reflects truth, we imperatively re-sync it via `writeValue` on a
 * macrotask (`setTimeout`) after every change, using the row's value as it
 * stands once the parent has had a chance to accept or veto. A macrotask is
 * required (not a microtask/`Promise.resolve`) so this runs after Angular's
 * own change-detection/input-propagation pass — a microtask would run first
 * and flicker the accept case.
 */
@Component({
    selector: 'app-notification-preference-row',
    templateUrl: './notification-preference-row.component.html',
    styleUrl: './notification-preference-row.component.scss',
    standalone: false
})
export class NotificationPreferenceRowComponent {
  @Input() row!: NotificationPreferenceRow;
  @Input() disabled = false;
  /** True while the ≥1-channel warning for this row's type should render
   * (page-owned state — see `criticalWarningType` on the page component). */
  @Input() showWarning = false;
  @Output() readonly rowChange = new EventEmitter<NotificationPreferenceRowChange>();

  @ViewChild('emailSwitch') private readonly emailSwitch?: ToggleSwitch;
  @ViewChild('smsSwitch') private readonly smsSwitch?: ToggleSwitch;

  onEmailChange(event: ToggleSwitchChangeEvent): void {
    this.rowChange.emit({ type: this.row.type, channel: 'email', enabled: event.checked });
    this.resyncSwitch(this.emailSwitch, () => this.row.emailEnabled);
  }

  onSmsChange(event: ToggleSwitchChangeEvent): void {
    this.rowChange.emit({ type: this.row.type, channel: 'sms', enabled: event.checked });
    this.resyncSwitch(this.smsSwitch, () => this.row.smsEnabled);
  }

  /**
   * Forces the switch's visual state back to the true model value on the
   * next macrotask. No-op on accept (the row already matches by then);
   * reverts the slider on veto. See class doc for why this must be a
   * macrotask rather than a microtask.
   */
  private resyncSwitch(switchRef: ToggleSwitch | undefined, currentValue: () => boolean): void {
    setTimeout(() => {
      switchRef?.writeValue(currentValue());
    });
  }
}
