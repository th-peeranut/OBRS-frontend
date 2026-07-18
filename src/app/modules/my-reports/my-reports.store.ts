import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { AdminCollectionStore } from '../admin/shared/admin-collection-store';
import { UsabilityReportService } from '../../services/usability-report/usability-report.service';
import { MyUsabilityReportPage } from '../../shared/interfaces/usability-report.interface';
import { appendPage } from './my-reports.mappers';

const PAGE_SIZE = 20;
const SORT = 'createdAt,desc';

function emptyPage(): MyUsabilityReportPage {
  return {
    content: [],
    totalElements: 0,
    totalPages: 0,
    size: PAGE_SIZE,
    number: 0,
    numberOfElements: 0,
  };
}

/**
 * OBRS-433: root-scoped stale-while-revalidate cache for the reporter's own
 * usability-report list — `AdminCollectionStore<MyUsabilityReportPage>`
 * extended IN PLACE (imported from its real module location, exactly as
 * `shared/components/boarding-list/boarding-list.store.ts` already does; the
 * base class itself is not relocated/renamed).
 *
 * `loadMore()` is subclass-only logic, not a base-class change: the
 * inherited `refresh()`/`fetch()` cycle always REPLACES the cached value with
 * whatever `fetch()` returns (page 0 here — see `fetch()` below), so
 * accumulating multiple server pages needs its own fetch-then-`mutate()`
 * cycle. Consequence: `refresh()` (called on component init/retry) always
 * collapses the list back to the newest 20 rows — a fresh page mount starts
 * fresh, matching every other AdminCollectionStore subclass's one-page-at-a-
 * time replay. A caller must never call `refresh()` to "reconcile" after an
 * edit — it would silently discard any rows loaded via loadMore() in the
 * current session; the edit flow instead patches the single affected row via
 * `mutate()` (see MyReportsComponent.onReportUpdated()).
 */
@Injectable({ providedIn: 'root' })
export class MyReportsStore extends AdminCollectionStore<MyUsabilityReportPage> {
  private readonly loadingMoreSubject = new BehaviorSubject<boolean>(false);
  readonly loadingMore$: Observable<boolean> = this.loadingMoreSubject.asObservable();

  constructor(
    private readonly usabilityReportService: UsabilityReportService,
    authService: AuthService
  ) {
    super(authService);
  }

  protected async fetch(): Promise<MyUsabilityReportPage> {
    const response = await firstValueFrom(
      this.usabilityReportService.getMyReports(0, PAGE_SIZE, SORT)
    );
    return response.data ?? emptyPage();
  }

  /**
   * Fetch the NEXT server page and append its rows after the currently
   * cached ones — never replaces. No-op when there's no cached value yet, a
   * load-more is already in flight, or the cache is already on the last page
   * (mirrors the "Load more" button's own hidden-when-on-last-page gate, so
   * this is a defensive second gate, not the only one).
   */
  async loadMore(): Promise<void> {
    const current = this.value;
    if (!current || this.loadingMoreSubject.value || current.number + 1 >= current.totalPages) {
      return;
    }

    this.loadingMoreSubject.next(true);
    try {
      const nextPage = current.number + 1;
      const response = await firstValueFrom(
        this.usabilityReportService.getMyReports(nextPage, PAGE_SIZE, SORT)
      );
      const data = response.data;
      if (!data) {
        return;
      }
      this.mutate((existing) => appendPage(existing, data));
    } finally {
      this.loadingMoreSubject.next(false);
    }
  }
}
