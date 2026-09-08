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
  /**
   * OBRS-1744 AC-4. Id of the single ≥1-channel callout the matrix renders above
   * the table, or null when there is no such callout on screen. A critical row's
   * switches point their `aria-describedby` at it, which is the association the
   * per-row hint used to get for free by sitting next to the label.
   */
  @Input() criticalNoteId: string | null = null;
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
   * OBRS-1744 AC-4. PrimeNG's `ToggleSwitch` has `ariaLabel`/`ariaLabelledBy`
   * inputs but no `ariaDescribedBy`, and its host `Bind` directive forwards
   * only `class` and `style` — an `[attr.aria-describedby]` on
   * `<p-toggleSwitch>` lands on the wrapper `<div>`, never on the
   * `<input role="switch">` assistive tech reads. The pass-through API does
   * reach it: the component's own template binds
   * `<input #input [pBind]="ptm('input')">`.
   *
   * The `null` on the non-critical branch is load-bearing, not tidiness. `Bind`
   * iterates only the keys present in THIS render's object and calls
   * `removeAttribute` when a value is `null`/`undefined`; returning `{}`
   * instead omits the key entirely, so a row that stops being critical keeps a
   * stale `aria-describedby` pointing at a callout that may no longer be on
   * screen. Measured: with `{}` the suite goes red on exactly the two removal
   * cases in `notification-preference-row.component.dom.spec.ts`.
   *
   * Cached rather than a fresh literal every call: `pt` is a signal input, so
   * PrimeNG compares by reference — a new object on every change-detection
   * pass would mark it dirty each tick and re-run `Bind`'s attribute-write
   * effect even though the target hasn't changed.
   */
  private cachedSwitchPassThrough: Record<string, Record<string, string | null>> = {
    input: { 'aria-describedby': null },
  };

  get switchPassThrough(): Record<string, Record<string, string | null>> {
    const describedBy = this.row?.critical && this.criticalNoteId ? this.criticalNoteId : null;
    if (this.cachedSwitchPassThrough['input']['aria-describedby'] !== describedBy) {
      this.cachedSwitchPassThrough = { input: { 'aria-describedby': describedBy } };
    }
    return this.cachedSwitchPassThrough;
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
