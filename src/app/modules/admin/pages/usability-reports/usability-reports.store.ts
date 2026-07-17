import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AuthService } from '../../../../auth/auth.service';
import { AdminCollectionStore } from '../../shared/admin-collection-store';
import {
  UsabilityReportPage,
  UsabilityReportStatus,
} from '../../../../shared/interfaces/usability-report.interface';
import { sortForStatus } from './usability-reports-page.mappers';

@Injectable({ providedIn: 'root' })
export class UsabilityReportsStore extends AdminCollectionStore<UsabilityReportPage> {
  // OBRS-378: '' means "no status filter" (not used by default anymore — the
  // page always seeds a concrete role-default status — but kept so setStatus
  // can still be called with '' if a future caller needs the unfiltered view).
  private status: UsabilityReportStatus | '' = '';
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
  setStatus(status: UsabilityReportStatus | ''): Promise<void> {
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
    const response = await firstValueFrom(
      this.adminApiService.getUsabilityReports(
        this.status || undefined,
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
