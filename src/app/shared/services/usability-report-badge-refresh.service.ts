import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { UsabilityReportStatus } from '../interfaces/usability-report.interface';

// Minimal cross-component trigger (OBRS-174): any admin surface that changes
// a usability report's status (silent auto-promote on open, decision save)
// calls trigger() so the sidebar count badge
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

  // OBRS-378: the delta is now tagged with the status it applies to, so a
  // layout showing one status's badge (e.g. admin's 'accepted') can ignore a
  // delta emitted for a status it isn't displaying (e.g. 'new') — without
  // this, an admin viewing the 'accepted' count would be wrongly nudged by a
  // 'new'-tab promotion elsewhere on the page.
  private readonly adjust$ = new Subject<BadgeCountAdjustment>();
  readonly countAdjustments$: Observable<BadgeCountAdjustment> = this.adjust$.asObservable();

  // Full authoritative refetch of the badge's count (GET round-trip). Use
  // when the resulting count isn't known client-side.
  trigger(): void {
    this.refresh$.next();
  }

  // Optimistic same-tick nudge to the badge — apply a known delta immediately
  // (e.g. -1 when a 'new' report is promoted to 'in_review' on open) so the
  // count drops instantly instead of waiting for a GET round-trip on the live
  // backend (~seconds). The periodic poll / NavigationEnd refetch reconciles
  // any drift from concurrent changes in another session.
  adjustBy(status: UsabilityReportStatus, delta: number): void {
    this.adjust$.next({ status, delta });
  }
}

export interface BadgeCountAdjustment {
  status: UsabilityReportStatus;
  delta: number;
}
