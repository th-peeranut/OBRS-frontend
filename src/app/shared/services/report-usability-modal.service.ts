import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * OBRS-1832. The one thing every report entry point shares.
 *
 * ADR-006 mounted the report button globally because per-shell mounting "requires
 * three separate mount points that must stay in sync". They do stay in sync —
 * through this: `<app-report-trigger>` knows only how to ask, and the single
 * `<app-report-usability-modal>` in `app.component.html` is the only thing that
 * answers. A trigger added to a fourth shell tomorrow needs no other wiring.
 */
@Injectable({ providedIn: 'root' })
export class ReportUsabilityModalService {
  private readonly openRequests = new Subject<void>();

  readonly openRequests$: Observable<void> = this.openRequests.asObservable();

  open(): void {
    this.openRequests.next();
  }
}
