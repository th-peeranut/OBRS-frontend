import { Component, Input } from '@angular/core';

/** OBRS-1308 — dumb old↔new diff card for the admin review-detail screen. */
@Component({
    selector: 'app-notification-message-review-diff',
    templateUrl: './notification-message-review-diff.component.html',
    styleUrl: './notification-message-review-diff.component.scss',
    standalone: false
})
export class NotificationMessageReviewDiffComponent {
  @Input() oldBody = '';
  @Input() newBody = '';
  @Input() locale = '';
  @Input() placeholderIndices: number[] = [];
}
