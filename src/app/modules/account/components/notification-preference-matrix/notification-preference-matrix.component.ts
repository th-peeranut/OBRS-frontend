import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NotificationPreferenceRow } from '../../../../shared/interfaces/notification-preference.interface';
import { NotificationPreferenceRowChange } from '../notification-preference-row/notification-preference-row.component';

/**
 * Dumb matrix renderer (OBRS-141): renders the column headers once, then one
 * `app-notification-preference-row` per type. `rowChange` bubbles straight up
 * from the row — this component holds no state of its own.
 */
@Component({
    selector: 'app-notification-preference-matrix',
    templateUrl: './notification-preference-matrix.component.html',
    styleUrl: './notification-preference-matrix.component.scss',
    standalone: false
})
export class NotificationPreferenceMatrixComponent {
  @Input() preferences: NotificationPreferenceRow[] = [];
  @Input() disabled = false;
  /** Type currently showing the ≥1-channel inline warning — owned by the
   * page (`NotificationPreferencesPageComponent.criticalWarningType`),
   * threaded through so the dumb row can render it under the right row. */
  @Input() warningType: string | null = null;
  @Output() readonly rowChange = new EventEmitter<NotificationPreferenceRowChange>();

  /** OBRS-1744 AC-4: the id the grouped note carries so a critical row's
   * switches can point `aria-describedby` at it. One note per rendered
   * matrix, and the account page renders exactly one matrix. */
  readonly criticalNoteId = 'npref-critical-note';

  /** OBRS-1744: the ≥1-channel rule is stated once above the table instead of
   * once per critical row, so it only belongs on screen when some row carries
   * it — the enum is the backend's, and a build with no critical type would
   * otherwise leave a note pointing at asterisks that aren't there. */
  get hasCriticalRow(): boolean {
    return this.preferences.some((row) => row.critical);
  }

  trackByType(_index: number, row: NotificationPreferenceRow): string {
    return row.type;
  }
}
