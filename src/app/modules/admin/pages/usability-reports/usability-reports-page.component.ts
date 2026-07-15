import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../../../../environments/environment';
import { AdminApiService } from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { UsabilityReportBadgeRefreshService } from '../../../../shared/services/usability-report-badge-refresh.service';
import { AuthService } from '../../../../auth/auth.service';
import { UsabilityReportsStore } from './usability-reports.store';
import {
  UsabilityReportDetail,
  UsabilityReportStatus,
  UsabilityReportSummary,
} from '../../../../shared/interfaces/usability-report.interface';
import {
  DETAIL_STATUS_VALUES,
  OWNER_DETAIL_STATUS_VALUES,
  STATUS_FILTER_VALUES,
  StatusOption,
  buildStatusOptionList,
  categoryLabel as categoryLabelPure,
  displayDateTime as displayDateTimePure,
  formatBytes as formatBytesPure,
  seedDecisionStatus,
  statusClass as statusClassPure,
  statusLabel as statusLabelPure,
  toUsabilityReportDetailFallback,
  updateRowStatus,
} from './usability-reports-page.mappers';

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

  // OBRS-370: owner is a SCREEN-ONLY tier on this page — it may view and move
  // a report FORWARD through non-terminal statuses, but the backend 403s a
  // non-admin on the terminal decisions (resolved/rejected — terminal, email
  // the reporter) and on the Jira key. Sourced from the *actual* held role
  // (not hasAnyRole, which an owner satisfies for 'admin' too under the FE's
  // area-based access widening — see boarding-entry-page.component.ts for the
  // same raw-role precedent) so the gate here matches the backend's real
  // authority check and the owner never sees a control that would 403.
  protected isAdmin = false;

  // Detail modal
  protected selectedReportId: string | null = null;
  protected detailReport: UsabilityReportDetail | null = null;
  // True only while the full detail (description/images/userAgent) is still
  // being fetched in the background — the modal itself is never gated on this.
  protected isDetailFetching = false;
  protected selectedDetailStatus: UsabilityReportStatus | '' = '';
  protected isSavingStatus = false;
  // Triage note — a free-text field on the detail modal, independent from the
  // status dropdown's pristine-patch tracking below (its own dirty flag).
  protected selectedTriageNote = '';
  private isTriageNoteDirty = false;

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
    private readonly translate: TranslateService,
    private readonly badgeRefreshService: UsabilityReportBadgeRefreshService,
    private readonly authService: AuthService
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.authService.getRoles().includes('admin');
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

  // Whole-row click is a MOUSE convenience for opening the detail modal. The
  // per-row View button remains the keyboard/AT-accessible affordance, so the
  // row deliberately carries no role/tabindex/keyboard handler (a role="button"
  // on a <tr> would orphan its cells and add a redundant tab stop). Ignore
  // clicks that originate from an interactive control in the row (the View
  // button opens it itself — don't double-fire) and clicks made while the admin
  // is selecting text.
  protected onRowActivate(id: string, event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea')) {
      return;
    }
    if (window.getSelection()?.toString()) {
      return;
    }
    this.openDetail(id);
  }

  protected openDetail(id: string): void {
    this.selectedReportId = id;
    this.lightboxImageUrl = null;
    this.isTriageNoteDirty = false;

    const cached = this.detailCache.get(id);
    if (cached) {
      // Cache hit — render the full detail immediately, no spinner, no refetch.
      this.detailReport = cached;
      this.selectedDetailStatus = this.seedStatus(cached.status);
      this.selectedTriageNote = cached.triageNote ?? '';
      this.isDetailFetching = false;
      return;
    }

    // Open optimistically: populate from the summary row already in hand
    // (design-system.md §6) instead of gating the modal on the awaited fetch.
    const summary = this.allReports.find((r) => r.id === id) ?? null;
    this.detailReport = summary ? toUsabilityReportDetailFallback(summary) : null;
    this.selectedDetailStatus = this.seedStatus(summary?.status ?? '');
    this.selectedTriageNote = '';
    this.isDetailFetching = true;

    // Silent auto-promote: viewing a 'new' report advances it to 'in_review'
    // so it drops out of the "new" triage queue just by being opened. This is
    // a separate, toast-free, best-effort path — it must never gate or block
    // the modal render below, which is driven entirely by the detail fetch.
    if (summary?.status === 'new') {
      this.autoPromoteToInReview(id);
    }

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
            this.selectedDetailStatus = this.seedStatus(detail?.status ?? '');
          }
          if (!this.isTriageNoteDirty) {
            this.selectedTriageNote = detail?.triageNote ?? '';
          }
        },
        error: () => {
          if (this.selectedReportId === id) {
            this.isDetailFetching = false;
          }
        },
      });
  }

  // Only a terminal decision (accepted/resolved/rejected) may pre-seed the
  // decision-only dropdown. 'new'/'in_review' are triage states, not outcomes
  // — the dropdown starts empty (placeholder, Save disabled) until the admin
  // actively picks one (design-system.md §3.1).
  //
  // OBRS-370: additionally never pre-seed a value the current role can't see
  // in its own detailStatusOptions — e.g. an owner opening a report an admin
  // already resolved/rejected must not land with that terminal value silently
  // selected (Save enabled) behind a dropdown that no longer lists it.
  private seedStatus(status: UsabilityReportStatus | ''): UsabilityReportStatus | '' {
    const seeded = seedDecisionStatus(status);
    if (seeded && !this.detailStatusOptions.some((option) => option.value === seeded)) {
      return '';
    }
    return seeded;
  }

  // Best-effort, toast-free promote of a freshly-opened 'new' report to
  // 'in_review'. Deliberately NOT routed through saveStatus() — no success/
  // error AlertService toasts, and it must never block or close the modal
  // (the modal's render is driven by the detail fetch above, independent of
  // this call). Errors are swallowed, including the expected 400
  // report.invalid-transition when another admin's session already advanced
  // this report between this admin's list fetch and opening it.
  private autoPromoteToInReview(id: string): void {
    // Apply the promote OPTIMISTICALLY — before the PUT resolves — so the UI
    // reacts instantly instead of waiting on the live round-trip (~2s): flip
    // the table row to in_review and drop the sidebar "new" badge by one. Both
    // are reverted if the server rejects the promote.
    this.setRowStatus(id, 'in_review');
    this.badgeRefreshService.adjustBy(-1);

    this.adminApiService
      .updateUsabilityReportStatus(id, 'in_review', null)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Confirmed — the optimistic state stands; keep any cached detail in sync.
          const cachedDetail = this.detailCache.get(id);
          if (cachedDetail) {
            this.detailCache.set(id, { ...cachedDetail, status: 'in_review' });
          }
        },
        error: () => {
          // Revert the optimistic changes (toast-free, per method doc). The
          // common failure is the stale cross-session 400 (the report was
          // already advanced elsewhere); the periodic count poll / NavigationEnd
          // refetch reconciles the exact number regardless.
          this.setRowStatus(id, 'new');
          this.badgeRefreshService.adjustBy(1);
        },
      });
  }

  private setRowStatus(id: string, status: UsabilityReportStatus): void {
    this.store.mutate((current) => ({
      ...current,
      content: updateRowStatus(current.content, id, status),
    }));
  }

  protected closeDetail(): void {
    this.selectedReportId = null;
    this.detailReport = null;
    this.selectedDetailStatus = '';
    this.selectedTriageNote = '';
    this.isTriageNoteDirty = false;
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

  protected onTriageNoteChange(value: string): void {
    this.selectedTriageNote = value;
    this.isTriageNoteDirty = true;
  }

  // Display-only helper — the frontend never calls Jira directly, it just
  // deep-links the admin to the issue Jira already associated with this report.
  protected jiraIssueUrl(key: string): string {
    return `${environment.jira.browseBaseUrl}${encodeURIComponent(key)}`;
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
      content: updateRowStatus(current.content, id, status),
    }));

    this.isSavingStatus = true;
    this.adminApiService
      .updateUsabilityReportStatus(id, status, this.selectedTriageNote || null)
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
          this.badgeRefreshService.trigger();
          // A saved decision is a completed action — dismiss back to the table.
          this.closeDetail();
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
    return categoryLabelPure(category, (key) => this.translate.instant(key));
  }

  protected statusLabel(status: string): string {
    return statusLabelPure(status, (key) => this.translate.instant(key));
  }

  protected statusClass(status: string): string {
    return statusClassPure(status);
  }

  protected trackById(_index: number, item: UsabilityReportSummary): string {
    return item.id;
  }

  // Renders a raw backend ISO timestamp as a human-readable date-time in the
  // current UI language (Thai default). Called from the template so it re-runs
  // on language change, matching categoryLabel/statusLabel above.
  protected displayDateTime(value: string | null | undefined): string {
    return displayDateTimePure(value, this.translate.currentLang);
  }

  protected formatBytes(bytes: number): string {
    return formatBytesPure(bytes);
  }

  // Decision-only subset for the detail modal's status dropdown — 'new' and
  // 'in_review' are triage states an admin cannot select as an outcome, only
  // land on automatically (list default / auto-promote-on-open above).
  protected detailStatusOptions: StatusOption[] = [];

  private buildStatusOptions(): void {
    const translateFn = (key: string) => this.translate.instant(key);
    this.statusFilterOptions = buildStatusOptionList(STATUS_FILTER_VALUES, translateFn);
    // OBRS-370: a non-admin (owner) is a screen-only tier — it may only move a
    // report forward through the non-terminal statuses, never finalize it.
    this.detailStatusOptions = buildStatusOptionList(
      this.isAdmin ? DETAIL_STATUS_VALUES : OWNER_DETAIL_STATUS_VALUES,
      translateFn
    );
  }
}
