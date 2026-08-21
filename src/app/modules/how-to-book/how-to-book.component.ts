import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { OperationsPolicyService } from '../../services/operations-policy/operations-policy.service';

// OBRS-703 AC-10: TIP_1's no-show grace period used to hardcode "10" (same
// defect business-policy.component.ts's TRAVEL_CONDITIONS item 3 had, fixed
// there the same way) -- an owner who set their own no-show cutoff left this
// page announcing a number that was no longer true. Read live from the
// PUBLIC /api/operations-policy endpoint (OperationsPolicyService); null
// until it resolves so the tip is never rendered with a number that might
// not be true, and simply omitted (rather than shown with a stale/wrong
// value) if the fetch fails.
@Component({
    selector: 'app-how-to-book',
    templateUrl: './how-to-book.component.html',
    styleUrl: './how-to-book.component.scss',
    standalone: false
})
export class HowToBookComponent implements OnInit, OnDestroy {
  protected noShowCutoffMinutes: number | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly operationsPolicyService: OperationsPolicyService) {}

  ngOnInit(): void {
    this.operationsPolicyService
      .getOperationsPolicy()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.data) {
            this.noShowCutoffMinutes = response.data.noShowCutoffMinutes;
          }
        },
        error: () => undefined,
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
