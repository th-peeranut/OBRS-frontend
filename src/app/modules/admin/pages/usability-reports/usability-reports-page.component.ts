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
  removeRow,
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
  // OBRS-378: the list is now server-filtered by status (?status=), so
  // allReports IS the active tab's rows — no more client-side filteredReports.
  protected allReports: UsabilityReportSummary[] = [];
  // Total row count for the active tab, from the pagination envelope — drives
  // the Showing X-Y of N footer text.
  protected totalElements = 0;
  // OBRS-403: server-side pagination — trust the backend's `number`/
  // `totalPages` directly, never re-derive with Math.ceil(). pageSize mirrors
  // UsabilityReportsStore.PAGE_SIZE (kept as a separate constant here — the
  // rangeStart/rangeEnd getters are pure display math over currentPage, no
  // dependency on the store's internals).
  protected currentPage = 1;
  protected totalPages = 1;
  protected readonly pageSize = 20;
  protected isRefreshing = false;
  protected refreshFailed = false;
  protected errorMessage = '';
  protected readonly skeletonRows = Array.from({ length: 5 });

  // OBRS-378: seeded to a concrete role default in ngOnInit and kept concrete
  // thereafter — the filter dropdown drops its [placeholder] binding
  // (design-system.md §3.1 leak: a placeholder header would emit '' and
  // re-enter the retired "show all" mode), so its visible label always comes
  // from the seeded value via the dropdown's own selectedLabel. Typed to
  // include '' only to match UsabilityReportsStore.setStatus()'s signature.
  protected selectedStatusFilter: UsabilityReportStatus | '' = 'new';
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
          this.totalElements = data.totalElements;
          // Spring's `number` is 0-based; the paginator/footer render 1-based.
          this.currentPage = data.number + 1;
          this.totalPages = data.totalPages;
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

    // OBRS-378: the list is server-filtered by status — owner defaults to
    // 'new' (awaiting screening), admin defaults to 'accepted' (owner-vetted).
    // setStatus() already calls refresh() internally, so this replaces (not
    // supplements) the old unconditional store.refresh() — calling both would
    // double-fetch on first load.
    this.selectedStatusFilter = this.isAdmin ? 'accepted' : 'new';
    void this.store.setStatus(this.selectedStatusFilter);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
  }

  // OBRS-378: maps a '' selection (defensive — the dropdown's [placeholder]
  // binding is dropped so this shouldn't fire in practice, design-system.md
  // §3.1) back to the role default rather than ever sending an undefined
  // status to the server.
  protected onStatusFilterChange(value: string): void {
    const status = (value || (this.isAdmin ? 'accepted' : 'new')) as UsabilityReportStatus;
    this.selectedStatusFilter = status;
    // OBRS-403 (Scrutinize): deliberately does NOT seed `currentPage = 1` here.
    // The store owns the page (setStatus resets it to 0); `currentPage` is a
    // pure mirror of `data.number + 1`. Writing it locally is unobservable on
    // the real tab-switch path anyway — setStatus() clears the cache
    // synchronously, so isLoading flips true and the whole footer (and with it
    // the paginator) leaves the DOM until fresh data lands. Worse, in the one
    // case it IS observable it renders a lie: re-picking the ALREADY-selected
    // option still emits valueChange (admin-dropdown.selectOption emits
    // unconditionally), setStatus's `if (this.status !== status)` guard then
    // skips clear(), isLoading stays false, and the paginator would show
    // "1 / N" while the store is still fetching page N.
    void this.store.setStatus(status);
  }

  // OBRS-403: server-side page change — 1-based in the template/paginator,
  // 0-based on the wire (Spring Pageable).
  protected onPageChange(page: number): void {
    void this.store.setPage(page - 1);
  }

  // Mirrors bookings-page.component.ts's getters of the same name, but
  // computed from the server's page number/total rather than a locally-sliced
  // array — the backend already tells us exactly how many rows are on this
  // page (data.number/totalElements), there is nothing to re-derive.
  protected get rangeStart(): number {
    return this.totalElements === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  protected get rangeEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalElements);
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
    // the table row to in_review (or remove it, if that leaves the active
    // tab — e.g. promoting out of the 'new' tab) and drop the sidebar "new"
    // badge by one. Both are reverted if the server rejects the promote.
    this.applyRowStatus(id, 'in_review');
    this.badgeRefreshService.adjustBy('new', -1);

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
          // refetch reconciles the exact number regardless. A promoted row may
          // have been REMOVED (not just relabeled) by applyRowStatus above, so
          // it can't be surgically restored — reconcile via a full refresh.
          void this.store.refresh();
          this.badgeRefreshService.adjustBy('new', 1);
        },
      });
  }

  // OBRS-378: shared optimistic-mutate helper for every status change on this
  // page (auto-promote, decision save/dismiss). The list is server-filtered
  // by ?status=, so a row whose NEW status no longer matches the active tab
  // must be REMOVED from the client-side cache, not just relabeled in place —
  // otherwise a patched-but-out-of-tab row keeps rendering until the next
  // full refresh.
  private applyRowStatus(id: string, status: UsabilityReportStatus): void {
    const leavesTab = this.selectedStatusFilter !== '' && status !== this.selectedStatusFilter;
    this.store.mutate((current) =>
      leavesTab
        ? {
            ...current,
            content: removeRow(current.content, id),
            totalElements: Math.max(0, current.totalElements - 1),
          }
        : { ...current, content: updateRowStatus(current.content, id, status) }
    );

    // OBRS-403: a status change that empties a non-first page (the page's
    // only row just left the active tab) would otherwise strand the admin on
    // a blank page until they manually navigate back — step back one page
    // instead.
    if (leavesTab && this.currentPage > 1 && this.store.value?.content.length === 0) {
      this.onPageChange(this.currentPage - 1);
    }
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

    // Optimistic update — this is also THE dismiss path: an owner or admin
    // picking 'dismissed' in the modal saves through here, so it must go
    // through the same tab-leaving-removal logic as the auto-promote above
    // (design-system.md §6 / OBRS-378).
    this.applyRowStatus(id, status);

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
          // The optimistic applyRowStatus() above may have REMOVED the row
          // (a leaves-tab status) — on a failed save that removal must not
          // stick, so reconcile via a full refresh (parallel to the
          // auto-promote-revert above; exactly-once, one line).
          void this.store.refresh();
        },
      });
  }

  // OBRS-378: the admin-only "Pull Back to Review" action on an already-
  // dismissed report's detail modal — sets the decision status to in_review
  // and reuses saveStatus() end-to-end (optimistic mutate, cache
  // invalidation, toasts, badge trigger, close-on-success) rather than a
  // parallel HTTP call path.
  protected pullBackToReview(): void {
    this.selectedDetailStatus = 'in_review';
    this.saveStatus();
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
