import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

// Minimal cross-component trigger (OBRS-174): any admin surface that changes
// a usability report's status (silent auto-promote on open, decision save)
// calls trigger() so the sidebar "new" count badge
// (admin-layout.component.ts, watchNewReportCount()) refetches immediately
// instead of waiting for the next NavigationEnd or the 60s poll tick.
//
// Deliberately a single Subject<void>, not a general notification store — a
// central notification-domain refactor is DEFERRED (see agent-office memory
// notification-domain-deferred.md); this is scoped to the one badge that
// needed a same-page refresh trigger.
@Injectable({ providedIn: 'root' })
export class UsabilityReportBadgeRefreshService {
  private readonly refresh$ = new Subject<void>();
  readonly refreshRequested$: Observable<void> = this.refresh$.asObservable();

  trigger(): void {
    this.refresh$.next();
  }
}
