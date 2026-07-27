import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { PageResponse, PendingRefund } from '../../../../shared/interfaces/payment.interface';

/**
 * Stale-while-revalidate cache for `GET /private/payments/refunds/pending`
 * (OBRS-286 AC-2). Mirrors `ConfigChangeHistoryStore` byte-for-byte — the
 * genuine `AdminCollectionStore<PageResponse<T>>` + `app-admin-paginator`
 * precedent (UI spec's precedent correction: `RefundVoidReportStore` is NOT
 * paged and is not the shape to copy here).
 *
 * Two behaviours `ConfigChangeHistoryStore` proves that MUST carry over:
 * (a) `goToPage` calls `clear()` BEFORE `refresh()`, or the previous page's
 *     rows flash under the new page while it loads.
 * (b) `fetch()` returns a fully-populated zero `PageResponse` on failure,
 *     never `null` — `npm run test:store-null` enforces this.
 */
@Injectable({ providedIn: 'root' })
export class ManualRefundWorklistStore extends AdminCollectionStore<PageResponse<PendingRefund>> {
  private page = 0;
  private static readonly PAGE_SIZE = 20;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  get currentPage(): number {
    return this.page;
  }

  goToPage(page: number): Promise<void> {
    if (this.page !== page) {
      this.page = page;
      this.clear();
    }
    return this.refresh();
  }

  protected async fetch(): Promise<PageResponse<PendingRefund>> {
    const response = await firstValueFrom(
      this.adminApiService.getPendingManualRefunds(this.page, ManualRefundWorklistStore.PAGE_SIZE)
    );
    return (
      response.data ?? {
        content: [],
        totalElements: 0,
        totalPages: 0,
        size: ManualRefundWorklistStore.PAGE_SIZE,
        number: this.page,
        numberOfElements: 0,
      }
    );
  }
}
