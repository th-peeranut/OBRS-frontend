import { Component } from '@angular/core';

/**
 * OBRS-1308 AC5 — the access-denied block shown to an owner who deep-links
 * `reviews`/`reviews/:id`. Shared by `NotificationMessageReviewQueuePageComponent`
 * and `NotificationMessageReviewDetailPageComponent` (both render it under the
 * exact same first-line-of-`ngOnInit` gate) so the markup/style can't drift
 * between the two — OBRS-209's full-section empty-state shape, styled only
 * with `var(--admin-muted)` / `var(--admin-text)` (design-system §12).
 */
@Component({
    selector: 'app-notification-message-access-denied',
    templateUrl: './notification-message-access-denied.component.html',
    styleUrl: './notification-message-access-denied.component.scss',
    standalone: false
})
export class NotificationMessageAccessDeniedComponent {}
