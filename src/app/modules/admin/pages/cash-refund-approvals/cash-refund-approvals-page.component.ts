import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import {
  CashRefundApprovalCode,
  CashRefundApprovalRequest,
  toAmountNumber,
} from '../../../../shared/interfaces/my-booking.interface';
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
import { formatMoney } from '../../../../shared/lib/money-display';

type ApprovalsContentState = 'loading' | 'error' | 'empty' | 'data';

/**
 * OBRS-844 — the owner's side of the cash-refund step-up: what the counter is
 * waiting on, and the button that authorizes it.
 *
 * <p>Each row states the booking number, the cash amount and who is asking,
 * because an approval prompt that says only "authorize a cancellation?" teaches
 * the owner to tap yes. The point of the second person is that they can refuse
 * a refund that is the wrong size or is coming from someone who should not be
 * asking, and neither is possible without those three facts on screen.
 *
 * <p>Approving reveals six digits <em>inline, once</em>. There is no endpoint
 * that can read them back — the server keeps only a hash — so the row keeps
 * showing them until the page is left, and the owner reads them to the counter.
 *
 * <p>Deliberately no NgRx store, unlike the manual-refund worklist next to it:
 * that queue is a days-long backlog worth caching and paging, this one is a
 * two-minute interruption whose whole value is being current. A cached list
 * here would show the owner a request that has already expired.
 */
@Component({
    selector: 'app-cash-refund-approvals-page',
    templateUrl: './cash-refund-approvals-page.component.html',
    styleUrl: './cash-refund-approvals-page.component.scss',
    standalone: false
})
export class CashRefundApprovalsPageComponent implements OnInit, OnDestroy {
  protected rows: CashRefundApprovalRequest[] = [];
  protected isLoading = true;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 3 });

  /** requestId → the code just issued for it. Populated only by this session's own approvals. */
  protected readonly issuedCodes = new Map<number, CashRefundApprovalCode>();
  /** requestId currently being approved, so one row's spinner cannot disable the others. */
  protected approvingId: number | null = null;
  protected approveErrorMessage = '';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get contentState(): ApprovalsContentState {
    if (this.isLoading) {
      return 'loading';
    }
    if (this.errorMessage) {
      return 'error';
    }
    return this.rows.length ? 'data' : 'empty';
  }

  protected load(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.adminApiService
      .getPendingCashRefundApprovals()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          this.rows = response?.data ?? [];
        },
        error: (error) => {
          this.isLoading = false;
          this.rows = [];
          this.errorMessage =
            extractApiErrorMessage(error) ||
            this.translate.instant('ADMIN.CASH_REFUND_APPROVALS.LOAD_FAILED');
        },
      });
  }

  protected approve(row: CashRefundApprovalRequest): void {
    if (this.approvingId !== null || this.issuedCodes.has(row.id)) {
      return;
    }
    this.approvingId = row.id;
    this.approveErrorMessage = '';
    this.adminApiService
      .approveCashRefund(row.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.approvingId = null;
          if (response?.data) {
            this.issuedCodes.set(row.id, response.data);
          }
        },
        error: (error) => {
          this.approvingId = null;
          this.approveErrorMessage =
            extractApiErrorMessage(error) ||
            this.translate.instant('ADMIN.CASH_REFUND_APPROVALS.APPROVE_FAILED');
          // The request may have expired or been answered elsewhere while this
          // page sat open. Re-reading is the only honest way to find out which.
          this.load();
        },
      });
  }

  protected issuedCodeFor(row: CashRefundApprovalRequest): CashRefundApprovalCode | undefined {
    return this.issuedCodes.get(row.id);
  }

  protected formatCurrency(value: number | string): string {
    return formatMoney(toAmountNumber(value), this.translate.currentLang);
  }
}
