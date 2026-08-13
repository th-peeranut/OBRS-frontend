import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PendingReviewRowDto } from '../../../../../shared/interfaces/notification-message-override.interface';

/** OBRS-1308 — dumb table for the admin pending-review queue. */
@Component({
    selector: 'app-notification-message-review-queue-table',
    templateUrl: './notification-message-review-queue-table.component.html',
    styleUrl: './notification-message-review-queue-table.component.scss',
    standalone: false
})
export class NotificationMessageReviewQueueTableComponent {
  @Input() rows: PendingReviewRowDto[] = [];
  @Input() loading = false;

  @Output() openReview = new EventEmitter<number>();

  protected readonly skeletonRows = Array.from({ length: 3 });

  protected trackById(_index: number, row: PendingReviewRowDto): number {
    return row.id;
  }
}
