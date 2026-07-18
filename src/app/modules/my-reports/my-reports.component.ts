import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { MyReportsStore } from './my-reports.store';
import { MyUsabilityReportSummary } from '../../shared/interfaces/usability-report.interface';
import {
  categoryLabel as categoryLabelPure,
  displayDateTime as displayDateTimePure,
  statusClass as statusClassPure,
  statusLabel as statusLabelPure,
  updateSummaryRow,
} from './my-reports.mappers';
import { MyReportSummaryPatch } from './components/my-report-detail-modal/my-report-detail-modal.component';

/**
 * OBRS-433: `/my-reports` — a logged-in reporter's own usability-report list.
 * Smart page component (inline card list, "Load more" button, empty-state,
 * error+retry) mirroring `my-bookings.component.html`'s shell/state pattern
 * (design-system §6/§12 — reuse the existing customer-shell page pattern).
 * The 7 `.admin-status.is-*` custom-property VALUES (design-system §2.4) are
 * re-declared at `:host`/`:host-context(body.is-dark)` in this component's
 * own scss — the ParcelTrackingPageComponent cross-shell badge-reuse idiom
 * (design-system §12) — since this customer-shell page has no `.admin-shell`
 * ancestor to inherit them from. The detail modal (a DOM child of this
 * component's template) inherits those custom properties normally, so it
 * does NOT need its own copy.
 */
@Component({
  selector: 'app-my-reports',
  templateUrl: './my-reports.component.html',
  styleUrl: './my-reports.component.scss',
})
export class MyReportsComponent implements OnInit, OnDestroy {
  protected reports: MyUsabilityReportSummary[] = [];
  protected totalElements = 0;
  protected currentPageNumber = 0;
  protected totalPages = 0;
  protected isRefreshing = false;
  protected isLoadingMore = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 4 });

  protected selectedReport: MyUsabilityReportSummary | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: MyReportsStore,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.store.data$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      if (data) {
        this.reports = data.content;
        this.totalElements = data.totalElements;
        this.currentPageNumber = data.number;
        this.totalPages = data.totalPages;
      }
    });

    this.store.refreshing$.pipe(takeUntil(this.destroy$)).subscribe((r) => (this.isRefreshing = r));

    this.store.error$.pipe(takeUntil(this.destroy$)).subscribe((failed) => {
      this.refreshFailed = failed && this.store.hasValue;
      this.errorMessage =
        failed && !this.store.hasValue
          ? this.translate.instant('USABILITY_REPORT.MY_REPORTS.LOAD_FAILED')
          : '';
    });

    this.store.loadingMore$.pipe(takeUntil(this.destroy$)).subscribe((v) => (this.isLoadingMore = v));

    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get isInitialLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  // "Load more" hides once the currently-cached page IS the last page —
  // matches the locked UX spec's `number === totalPages - 1` rule.
  protected get showLoadMore(): boolean {
    return this.totalPages > 0 && this.currentPageNumber < this.totalPages - 1;
  }

  protected onLoadMore(): void {
    void this.store.loadMore();
  }

  protected onRetry(): void {
    void this.store.refresh();
  }

  protected openDetail(report: MyUsabilityReportSummary): void {
    this.selectedReport = report;
  }

  protected closeDetail(): void {
    this.selectedReport = null;
  }

  // Patches the single edited row in place — never a full store.refresh()
  // (see MyReportsStore's doc comment: refresh() always collapses back to
  // page 0 and would silently discard any rows loaded via "Load more").
  protected onReportUpdated(patch: MyReportSummaryPatch): void {
    this.store.mutate((current) => ({
      ...current,
      content: updateSummaryRow(current.content, patch.id, patch),
    }));
  }

  protected categoryLabel(category: string): string {
    return categoryLabelPure(category, (key) => this.translate.instant(key));
  }

  protected statusLabel(status: string): string {
    return statusLabelPure(status, (key) => this.translate.instant(key));
  }

  protected statusClass(status: string): string {
    return statusClassPure(status);
  }

  protected displayDateTime(value: string): string {
    return displayDateTimePure(value, this.translate.currentLang);
  }

  protected trackById(_index: number, item: MyUsabilityReportSummary): number {
    return item.id;
  }
}
