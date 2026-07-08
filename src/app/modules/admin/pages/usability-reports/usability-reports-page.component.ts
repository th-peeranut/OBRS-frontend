import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { UsabilityReportsStore } from './usability-reports.store';
import {
  UsabilityReportDetail,
  UsabilityReportStatus,
  UsabilityReportSummary,
} from '../../../../shared/interfaces/usability-report.interface';

interface StatusOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-usability-reports-page',
  templateUrl: './usability-reports-page.component.html',
  styleUrl: './usability-reports-page.component.scss',
})
export class UsabilityReportsPageComponent implements OnInit, OnDestroy {
  protected allReports: UsabilityReportSummary[] = [];
  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 5 });

  protected selectedStatusFilter = '';
  // Built from i18n in ngOnInit (and rebuilt on language change) so the admin
  // dropdowns match the translated status labels shown in the table.
  protected statusFilterOptions: StatusOption[] = [];
  private readonly statusValues: UsabilityReportStatus[] = [
    'new',
    'in_review',
    'resolved',
    'wont_fix',
  ];

  // Detail modal
  protected selectedReportId: string | null = null;
  protected detailReport: UsabilityReportDetail | null = null;
  // True only while the full detail (description/images/userAgent) is still
  // being fetched in the background — the modal itself is never gated on this.
  protected isDetailFetching = false;
  protected selectedDetailStatus: UsabilityReportStatus | '' = '';
  protected isSavingStatus = false;

  // Lightbox overlay — a layer above the detail modal, tracked independently
  // so dismissing it never closes the detail modal underneath.
  protected lightboxImageUrl: string | null = null;

  // In-memory cache of full report detail, keyed by report id, so reopening
  // the same report doesn't re-issue the GET. Invalidated on status save.
  private readonly detailCache = new Map<string, UsabilityReportDetail>();

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly store: UsabilityReportsStore,
    private readonly adminApiService: AdminApiService,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.buildStatusOptions();
    this.translate.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.buildStatusOptions());

    this.store.data$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data) {
          this.allReports = data.content;
        }
      });

    this.store.refreshing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((refreshing) => (this.isRefreshing = refreshing));

    this.store.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe((failed) => {
        this.refreshFailed = failed && this.store.hasValue;
        this.errorMessage =
          failed && !this.store.hasValue
            ? this.translate.instant('ADMIN.USABILITY_REPORTS.LOAD_FAILED')
            : '';
      });

    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  protected get filteredReports(): UsabilityReportSummary[] {
    if (!this.selectedStatusFilter) {
      return this.allReports;
    }
    return this.allReports.filter((r) => r.status === this.selectedStatusFilter);
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatusFilter = value ?? '';
  }

  protected openDetail(id: string): void {
    this.selectedReportId = id;
    this.lightboxImageUrl = null;

    const cached = this.detailCache.get(id);
    if (cached) {
      // Cache hit — render the full detail immediately, no spinner, no refetch.
      this.detailReport = cached;
      this.selectedDetailStatus = cached.status;
      this.isDetailFetching = false;
      return;
    }

    // Open optimistically: populate from the summary row already in hand
    // (design-system.md §6) instead of gating the modal on the awaited fetch.
    const summary = this.allReports.find((r) => r.id === id) ?? null;
    this.detailReport = summary
      ? {
          id: summary.id,
          category: summary.category,
          status: summary.status,
          userId: summary.userId,
          description: summary.descriptionPreview,
          descriptionPreview: summary.descriptionPreview,
          routeUrl: '',
          userAgent: '',
          imageCount: summary.imageCount,
          images: [],
          createdAt: summary.createdAt,
        }
      : null;
    this.selectedDetailStatus = summary?.status ?? '';
    this.isDetailFetching = true;

    this.adminApiService
      .getUsabilityReportById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const detail = response.data ?? null;
          if (detail) {
            this.detailCache.set(id, detail);
          }
          // Ignore a stale response if the admin already moved to another report.
          if (this.selectedReportId !== id) {
            return;
          }
          this.isDetailFetching = false;
          this.detailReport = detail;
          // Pristine-only patch (design-system.md §6): don't clobber a status
          // the admin may have already changed during the optimistic-open
          // window. The summary seeded selectedDetailStatus on open, so only
          // adopt the fetched status when nothing is selected yet.
          if (!this.selectedDetailStatus) {
            this.selectedDetailStatus = detail?.status ?? '';
          }
        },
        error: () => {
          if (this.selectedReportId === id) {
            this.isDetailFetching = false;
          }
        },
      });
  }

  protected closeDetail(): void {
    this.selectedReportId = null;
    this.detailReport = null;
    this.selectedDetailStatus = '';
    this.isSavingStatus = false;
    this.isDetailFetching = false;
    this.lightboxImageUrl = null;
  }

  // The detail modal's backdrop directive routes both ESC and backdrop-click
  // here. When the lightbox is open it sits above the detail modal, so it
  // must be dismissed first without closing the detail modal underneath.
  protected onDetailBackdropDismiss(): void {
    if (this.lightboxImageUrl) {
      this.closeLightbox();
      return;
    }
    this.closeDetail();
  }

  protected openLightbox(url: string): void {
    this.lightboxImageUrl = url;
  }

  protected closeLightbox(): void {
    this.lightboxImageUrl = null;
  }

  protected onLightboxBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeLightbox();
    }
  }

  protected onThumbnailKeydown(event: KeyboardEvent, url: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.openLightbox(url);
    }
  }

  protected onDetailStatusChange(value: string): void {
    this.selectedDetailStatus = value as UsabilityReportStatus;
  }

  saveStatus(): void {
    if (!this.selectedReportId || !this.selectedDetailStatus) {
      return;
    }

    const id = this.selectedReportId;
    const status = this.selectedDetailStatus as UsabilityReportStatus;

    // Optimistic update
    this.store.mutate((current) => ({
      ...current,
      content: current.content.map((r) =>
        r.id === id ? { ...r, status } : r
      ),
    }));

    this.isSavingStatus = true;
    this.adminApiService
      .updateUsabilityReportStatus(id, status)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSavingStatus = false;
          // Invalidate the cached detail — status changed, so the next open
          // must refetch rather than resurface stale cached data.
          this.detailCache.delete(id);
          this.alertService.success(
            this.translate.instant('ADMIN.USABILITY_REPORTS.STATUS_UPDATE_SUCCESS')
          );
          void this.store.refresh();
        },
        error: () => {
          this.isSavingStatus = false;
          this.alertService.error(
            this.translate.instant('ADMIN.USABILITY_REPORTS.STATUS_UPDATE_FAILED')
          );
        },
      });
  }

  protected categoryLabel(category: string): string {
    const key = `USABILITY_REPORT.CATEGORY.${category.toUpperCase()}`;
    return this.translate.instant(key);
  }

  protected statusLabel(status: string): string {
    const key = `ADMIN.USABILITY_REPORTS.STATUS.${status}`;
    return this.translate.instant(key);
  }

  protected statusClass(status: string): string {
    if (status === 'new') return 'is-warning';
    if (status === 'in_review') return 'is-info';
    if (status === 'resolved') return 'is-success';
    if (status === 'wont_fix') return 'is-danger';
    return '';
  }

  protected trackById(_index: number, item: UsabilityReportSummary): string {
    return item.id;
  }

  protected formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected detailStatusOptions: StatusOption[] = [];

  private buildStatusOptions(): void {
    this.statusFilterOptions = this.statusValues.map((value) => ({
      value,
      label: this.translate.instant(`ADMIN.USABILITY_REPORTS.STATUS.${value}`),
    }));
    this.detailStatusOptions = this.statusFilterOptions;
  }
}
