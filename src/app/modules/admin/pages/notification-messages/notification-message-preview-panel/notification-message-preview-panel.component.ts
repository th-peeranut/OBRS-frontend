import { Component, Input } from '@angular/core';
import {
  buildPreviewSegments,
  PreviewSegment,
} from '../../../../../shared/lib/notification-message-placeholder';

/**
 * OBRS-1308 — dumb, pure-display read-only preview card. Substitutes
 * `sampleArgs[i]` for each `{i}` and highlights the substituted tokens.
 * **Display only** — never validates, never accepts/rejects a save (the
 * `{n}` regex here is for highlighting only, per the system spec).
 */
@Component({
    selector: 'app-notification-message-preview-panel',
    templateUrl: './notification-message-preview-panel.component.html',
    styleUrl: './notification-message-preview-panel.component.scss',
    standalone: false
})
export class NotificationMessagePreviewPanelComponent {
  @Input() text = '';
  @Input() sampleArgs: string[] = [];

  protected get segments(): PreviewSegment[] {
    return buildPreviewSegments(this.text, this.sampleArgs);
  }
}
