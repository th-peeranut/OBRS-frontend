import { Component, Input } from '@angular/core';

/**
 * Small inline status line for admin pages backed by the stale-while-revalidate
 * stores. Tells the user when cached data is being refreshed in the background,
 * or that the last background refresh failed and they're viewing saved data.
 * Renders nothing during the first load (the page's skeleton covers that) or
 * when a refresh succeeded.
 */
@Component({
  selector: 'app-admin-refresh-hint',
  template: `
    <p class="admin-muted" *ngIf="refreshing && !loading">
      {{ 'ADMIN.COMMON.UPDATING' | translate }}
    </p>
    <p class="admin-muted" *ngIf="failed && !refreshing && !loading">
      {{ 'ADMIN.COMMON.REFRESH_FAILED' | translate }}
    </p>
  `,
})
export class AdminRefreshHintComponent {
  /** A background revalidate is in flight (cached data still shown). */
  @Input() refreshing = false;
  /** The last refresh failed but cached data is still shown. */
  @Input() failed = false;
  /** First load with no cache yet — the page renders its skeleton, not a hint. */
  @Input() loading = false;
}
