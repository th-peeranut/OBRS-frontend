import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import { UsabilityReportPage } from '../../../../shared/interfaces/usability-report.interface';
import { sortForStatus, StatusFilterValue } from './usability-reports-page.mappers';

@Injectable({ providedIn: 'root' })
export class UsabilityReportsStore extends AdminCollectionStore<UsabilityReportPage> {
  // '' means "no status ever set" (the store's own pre-init default, before
  // the page's first setStatus() call) and 'all' (OBRS-524) means "the admin
  // explicitly chose to see every status" — both resolve to the SAME wire
  // behavior below (omit ?status=), but are kept as distinct values so a
  // future caller can tell "never asked" apart from "asked for everything".
  private status: StatusFilterValue | '' = '';
  // OBRS-403: 0-based, matches Spring's Pageable — reset to 0 on every tab
  // switch (see setStatus below) so a stale page number never survives a
  // status change.
  private page = 0;
  private static readonly PAGE_SIZE = 20;

  constructor(
    private readonly adminApiService: AdminApiService,
    authService: AuthService
  ) {
    super(authService);
  }

  // Switching tabs changes which server-side filter/sort applies, so the
  // single-slot cache MUST be cleared (not just refreshed) — otherwise the
  // previous tab's rows briefly replay as the new tab's before the fresh
  // fetch lands (a visible wrong-data flash). Also resets to page 1 — a tab
  // switch is a fresh view, not a continuation of the previous tab's paging.
  setStatus(status: StatusFilterValue | ''): Promise<void> {
    if (this.status !== status) {
      this.status = status;
      this.page = 0;
      this.clear();
    }
    return this.refresh();
  }

  // OBRS-403: single-slot cache mirrors setStatus() above — a page change is
  // a different server-side fetch, so the stale page's rows must not flash
  // before the new page lands.
  setPage(page: number): Promise<void> {
    if (this.page !== page) {
      this.page = page;
      this.clear();
    }
    return this.refresh();
  }

  protected async fetch(): Promise<UsabilityReportPage> {
    // OBRS-524: 'all' is a real, explicit filter value at the component
    // layer, but the backend has no "all" slug — GET .../usability-reports
    // returns every status when ?status= is simply omitted (confirmed
    // against UsabilityReportService.listReports: a null/blank status runs
    // an unfiltered findAll(), including 'duplicate'/'dismissed' rows). This
    // is the ONE place that distinction is collapsed back to the wire shape.
    const statusParam = this.status && this.status !== 'all' ? this.status : undefined;
    const response = await firstValueFrom(
      this.adminApiService.getUsabilityReports(
        statusParam,
        sortForStatus(this.status),
        this.page,
        UsabilityReportsStore.PAGE_SIZE
      )
    );
    return (
      response.data ?? {
        content: [],
        totalElements: 0,
        totalPages: 0,
        size: UsabilityReportsStore.PAGE_SIZE,
        number: this.page,
        numberOfElements: 0,
      }
    );
  }
}
