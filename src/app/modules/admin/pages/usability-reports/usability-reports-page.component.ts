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
  STATUS_FILTER_VALUES,
  StatusFilterValue,
  StatusOption,
  buildStatusOptionList,
  canMarkAsDuplicate as canMarkAsDuplicatePure,
  categoryLabel as categoryLabelPure,
  detailStatusValuesFor,
  displayDateTime as displayDateTimePure,
  extractUsabilityReportErrorCode,
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
  // from the seeded value via the dropdown's own selectedLabel. OBRS-524
  // added 'all' as a real, concrete, selectable OPTION (not a placeholder) —
  // the default itself is unchanged (still role-based, see ngOnInit below).
  protected selectedStatusFilter: StatusFilterValue = 'new';
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

  // OBRS-376: mark-as-duplicate candidate picker — another layer above the
  // detail modal (same modal-over-modal shape as the lightbox), but can also
  // be opened standalone from a table row with no detail modal open at all.
  protected isPickerOpen = false;
  protected pickerCandidates: UsabilityReportSummary[] = [];
  protected isMarkingDuplicate = false;
  private pickerSourceId: string | null = null;
  // Whether the picker was opened from the detail modal's secondary button
  // (vs. the row's action) — only then does a successful mark also close the
  // detail modal underneath.
  private pickerOpenedFromDetail = false;

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
        // OBRS-467: honor a null emission. The store emits null when it
        // clear()s its single-slot cache on a tab/page change (setStatus/
        // setPage) — that value is one the store has DISCARDED. Keeping the
        // previous tab/page's rows here (the old `if (data)` guard) is what
        // left them visible under the error banner when the following fetch
        // FAILED: value stayed null + error=true, but allReports still held
        // the discarded rows, reading as "this is the requested page". Reset
        // to empty so a cleared-then-failed reload shows LOAD_FAILED over an
        // empty table, not stale rows. On the success path the store never
        // emits null (a same-axis revalidate keeps its value), so this is
        // unobservable there — the skeleton covers the cleared→reload window.
        this.allReports = data?.content ?? [];
        this.totalElements = data?.totalElements ?? 0;
        // Spring's `number` is 0-based; the paginator/footer render 1-based.
        this.currentPage = (data?.number ?? 0) + 1;
        this.totalPages = data?.totalPages ?? 0;
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
    // 'new' (awaiting screening), admin defaults to 'owner_accepted' (OBRS-527:
    // the admin's inbound queue — owner-screened, awaiting platform adoption;
    // 'accepted' itself is nobody's badge/default queue any more).
    // setStatus() already calls refresh() internally, so this replaces (not
    // supplements) the old unconditional store.refresh() — calling both would
    // double-fetch on first load.
    this.selectedStatusFilter = this.isAdmin ? 'owner_accepted' : 'new';
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
  // status to the server. OBRS-524: 'all' is now a real, concrete option
  // value from that same list, so it passes straight through unchanged —
  // only an actually-empty '' still falls back to the role default.
  protected onStatusFilterChange(value: string): void {
    const status = (value || (this.isAdmin ? 'owner_accepted' : 'new')) as StatusFilterValue;
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
      // OBRS-527 AMENDMENT A1: rebuild MUST run before the seed — seedStatus()
      // validates its result against this.detailStatusOptions, so seeding
      // first would validate THIS report's status against the PREVIOUSLY
      // opened report's option list (a leaked-state bug this card exists to
      // close, not reopen).
      this.rebuildDetailStatusOptions(cached.status);
      this.selectedDetailStatus = this.seedStatus(cached.status);
      this.selectedTriageNote = cached.triageNote ?? '';
      this.isDetailFetching = false;
      return;
    }

    // Open optimistically: populate from the summary row already in hand
    // (design-system.md §6) instead of gating the modal on the awaited fetch.
    const summary = this.allReports.find((r) => r.id === id) ?? null;
    this.detailReport = summary ? toUsabilityReportDetailFallback(summary) : null;
    // OBRS-527 AMENDMENT A1: rebuild before seed, same reasoning as above.
    this.rebuildDetailStatusOptions(summary?.status ?? '');
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
            // OBRS-527 AMENDMENT A1: rebuild before seed, same reasoning as
            // the two openDetail sites above.
            this.rebuildDetailStatusOptions(detail?.status ?? '');
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
    // OBRS-524: when the active filter is 'all', every status is in view —
    // a status change can never move a row out of the currently-shown set,
    // so it must never be treated as leaving the tab (that would wrongly
    // remove/hide a row that is still perfectly visible under 'all').
    const leavesTab =
      this.selectedStatusFilter !== 'all' && status !== this.selectedStatusFilter;
    this.store.mutate((current) =>
      leavesTab
        ? {
            ...current,
            content: removeRow(current.content, id),
            totalElements: Math.max(0, current.totalElements - 1),
          }
        : { ...current, content: updateRowStatus(current.content, id, status) }
    );

    // Only a row that LEFT the active tab can empty this page; a relabel-in-
    // place keeps the row count identical, so there is nothing to step back
    // from. The emptied-page rule itself lives in stepBackIfPageEmptied().
    if (leavesTab) {
      this.stepBackIfPageEmptied();
    }
  }

  // The single owner of the "this mutation emptied a non-first page" rule —
  // without it the admin is stranded on a blank page until they manually
  // navigate back. Both of this page's status-mutation paths funnel here:
  //
  //  - applyRowStatus() (auto-promote, decision save/dismiss) calls it
  //    synchronously after its optimistic cache mutate, gated on leavesTab;
  //  - mark/un-mark-as-duplicate (OBRS-376) calls it from .then() after a full
  //    store.refresh() — that path can't optimistically mutate, because
  //    duplicateCount is server-derived, and 'duplicate' is itself a
  //    selectable tab (STATUS_FILTER_VALUES), so marking/unmarking the last
  //    row of a non-first page hits this same case.
  //
  // Both read post-mutation state: `currentPage` mirrors data.number + 1 via
  // the data$ subscription, which the store emits synchronously before
  // refresh() resolves.
  private stepBackIfPageEmptied(): void {
    if (this.currentPage > 1 && this.store.value?.content.length === 0) {
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
  // here. The duplicate picker and the lightbox each sit above the detail
  // modal (in that priority — the picker can itself be opened while the
  // detail modal is showing), so the topmost open layer must be dismissed
  // first without closing the detail modal underneath. The picker owns its
  // OWN `adminModalBackdrop` directive instance (see
  // UsabilityReportDuplicatePickerComponent doc comment), so this only needs
  // to no-op — not actively close it — when the picker is open.
  protected onDetailBackdropDismiss(): void {
    if (this.isPickerOpen) {
      return;
    }
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

    // OBRS-527: previousStatus is the report's TRUE prior status. Read from
    // detailReport — NEVER selectedDetailStatus, which is the *target*, and
    // which pullBackToReview() overwrites before calling this method — with a
    // fallback to the row already in allReports (applyRowStatus below mutates
    // allReports, never detailReport, so detailReport.status still holds the
    // true prior status even on that path).
    const previousStatus: UsabilityReportStatus | null =
      this.detailReport?.status ?? this.allReports.find((r) => r.id === id)?.status ?? null;

    // Optimistic update — this is also THE dismiss path: an owner or admin
    // picking 'dismissed' in the modal saves through here, so it must go
    // through the same tab-leaving-removal logic as the auto-promote above
    // (design-system.md §6 / OBRS-378).
    this.applyRowStatus(id, status);

    // OBRS-527: badge delta — 'owner_accepted' is the admin's inbound queue
    // (badge ownership moved off 'accepted'), so a save that moves a report
    // INTO or OUT OF that status nudges the badge instantly, same
    // optimistic-nudge/reconcile-on-poll pattern autoPromoteToInReview
    // already uses for 'new' above (trigger() below is the ~2s-later
    // authoritative reconciliation).
    if (previousStatus === 'owner_accepted' && status !== 'owner_accepted') {
      this.badgeRefreshService.adjustBy('owner_accepted', -1);
    }
    if (status === 'owner_accepted' && previousStatus !== 'owner_accepted') {
      this.badgeRefreshService.adjustBy('owner_accepted', 1);
    }

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
          // OBRS-527: revert the optimistic badge delta above — mirror image
          // of both conditions (same shape as autoPromoteToInReview's revert).
          if (previousStatus === 'owner_accepted' && status !== 'owner_accepted') {
            this.badgeRefreshService.adjustBy('owner_accepted', 1);
          }
          if (status === 'owner_accepted' && previousStatus !== 'owner_accepted') {
            this.badgeRefreshService.adjustBy('owner_accepted', -1);
          }
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

  // ── OBRS-376: mark / un-mark as duplicate ─────────────────────────────────

  // Admin-only gate, mirrors detailStatusOptions' isAdmin gate above — owner
  // is screen-only and must never see the mark/un-mark controls or the picker.
  protected canMarkAsDuplicate(status: UsabilityReportStatus): boolean {
    return this.isAdmin && canMarkAsDuplicatePure(status);
  }

  protected canUnmarkDuplicate(status: UsabilityReportStatus): boolean {
    return this.isAdmin && status === 'duplicate';
  }

  // Opens the picker with candidates pre-filtered to exclude the report
  // itself and any report already status==='duplicate' — mirroring the
  // backend's own REPORT_CANONICAL_SELF_REFERENCE / REPORT_CANONICAL_ALREADY_DUPLICATE
  // guards so the admin can't even select an invalid target.
  protected openDuplicatePicker(id: string): void {
    this.pickerSourceId = id;
    this.pickerOpenedFromDetail = this.selectedReportId === id;
    this.pickerCandidates = this.allReports.filter(
      (r) => r.id !== id && r.status !== 'duplicate'
    );
    this.isPickerOpen = true;
  }

  protected onPickerCancel(): void {
    this.isPickerOpen = false;
    this.pickerSourceId = null;
    this.pickerCandidates = [];
    this.pickerOpenedFromDetail = false;
  }

  protected onPickerConfirm(candidateId: string): void {
    if (!this.pickerSourceId || this.isMarkingDuplicate) {
      return;
    }
    // QA fix (OBRS-376 type-safety sweep): `candidateId` is typed string per
    // the picker's `confirm: EventEmitter<string>` contract (locked UX
    // spec), but its actual runtime value is whatever
    // `UsabilityReportSummary.id` really is — a JSON number per the live API
    // (confirmed by QA), despite that field's string type (a separate,
    // wider follow-up card — not fixed here). `Number()` coerces either
    // representation correctly; the NaN guard makes this an explicit, safe
    // conversion for the PATCH body's `canonicalId: number` rather than
    // something that only "happens to work" because both
    // `Number(42)`/`Number('42')` resolve to `42`.
    const canonicalId = Number(candidateId);
    if (Number.isNaN(canonicalId)) {
      return;
    }
    const id = this.pickerSourceId;
    const openedFromDetail = this.pickerOpenedFromDetail;
    // OBRS-527: the SOURCE report's status before marking — needed to know
    // whether marking-as-duplicate is removing it from the admin's
    // 'owner_accepted' queue. Prefer the row already in allReports (this is
    // the reliable source, whether the picker was opened from a table row or
    // from the detail modal's secondary button); fall back to detailReport
    // for the rare case the row was already optimistically removed from
    // allReports by an earlier mutation this same session.
    const sourceStatus: UsabilityReportStatus | null =
      this.allReports.find((r) => r.id === id)?.status ?? this.detailReport?.status ?? null;

    this.isMarkingDuplicate = true;
    this.adminApiService
      .markUsabilityReportAsDuplicate(id, canonicalId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isMarkingDuplicate = false;
          this.isPickerOpen = false;
          this.pickerSourceId = null;
          this.pickerCandidates = [];
          this.pickerOpenedFromDetail = false;
          // Invalidate the cached detail — status/duplicate fields changed.
          this.detailCache.delete(id);
          this.alertService.success(
            this.translate.instant('ADMIN.USABILITY_REPORTS.DUPLICATE.MARK_SUCCESS')
          );
          // OBRS-527: marking an 'owner_accepted' report as duplicate removes
          // it from the admin's inbound queue — nudge the badge instantly and
          // trigger an authoritative refetch (this page previously never
          // touched badgeRefreshService at all on this path).
          if (sourceStatus === 'owner_accepted') {
            this.badgeRefreshService.adjustBy('owner_accepted', -1);
            this.badgeRefreshService.trigger();
          }
          // duplicateCount on the canonical report is server-derived —
          // refetch rather than hand-compute it. Step back a page afterwards
          // if this marked the last row off the active tab's last page.
          void this.store.refresh().then(() => this.stepBackIfPageEmptied());
          if (openedFromDetail) {
            this.closeDetail();
          }
        },
        error: (error: unknown) => {
          this.isMarkingDuplicate = false;
          this.alertService.error(
            this.translate.instant(this.duplicateMarkErrorKey(error))
          );
          // Picker stays open so the admin can pick a different candidate.
        },
      });
  }

  private duplicateMarkErrorKey(error: unknown): string {
    const code = extractUsabilityReportErrorCode(error);
    switch (code) {
      case 'REPORT_CANONICAL_NOT_FOUND':
        return 'ADMIN.USABILITY_REPORTS.DUPLICATE.ERROR_CANONICAL_NOT_FOUND';
      case 'REPORT_CANONICAL_SELF_REFERENCE':
        return 'ADMIN.USABILITY_REPORTS.DUPLICATE.ERROR_SELF_REFERENCE';
      case 'REPORT_CANONICAL_ALREADY_DUPLICATE':
        return 'ADMIN.USABILITY_REPORTS.DUPLICATE.ERROR_ALREADY_DUPLICATE';
      default:
        return 'ADMIN.USABILITY_REPORTS.DUPLICATE.MARK_FAILED';
    }
  }

  // Un-mark reuses the EXISTING status-update endpoint (status -> 'in_review')
  // rather than a dedicated un-mark endpoint — the backend clears the
  // duplicate link server-side on that transition.
  protected async unmarkDuplicate(id: string): Promise<void> {
    const confirmed = await this.alertService.confirm({
      title: this.translate.instant('ADMIN.USABILITY_REPORTS.DUPLICATE.UNMARK_CONFIRM_TITLE'),
      text: this.translate.instant('ADMIN.USABILITY_REPORTS.DUPLICATE.UNMARK_CONFIRM_TEXT'),
      confirmButtonText: this.translate.instant('ADMIN.USABILITY_REPORTS.DUPLICATE.UNMARK_ACTION'),
      cancelButtonText: this.translate.instant('ADMIN.COMMON.CANCEL'),
    });
    if (!confirmed) {
      return;
    }

    this.adminApiService
      .updateUsabilityReportStatus(id, 'in_review', null)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.detailCache.delete(id);
          this.alertService.success(
            this.translate.instant('ADMIN.USABILITY_REPORTS.DUPLICATE.UNMARK_SUCCESS')
          );
          // OBRS-527: this path never touched badgeRefreshService at all — a
          // real pre-existing gap (target is 'in_review', so no adjustBy is
          // needed, but the badge could still be up to 60s stale with no
          // trigger()). Fires unconditionally, unlike onPickerConfirm's
          // source-gated call above, since un-marking never has an
          // 'owner_accepted' delta to compute.
          this.badgeRefreshService.trigger();
          // Same step-back as onPickerConfirm above — un-marking also leaves
          // the 'duplicate' tab if that's the active filter.
          void this.store.refresh().then(() => this.stepBackIfPageEmptied());
          if (this.selectedReportId === id) {
            this.closeDetail();
          }
        },
        error: () => {
          this.alertService.error(
            this.translate.instant('ADMIN.USABILITY_REPORTS.DUPLICATE.UNMARK_FAILED')
          );
        },
      });
  }

  // Display-only helper for the "ซ้ำกับ #X" link — duplicateOfId is a
  // number (backend PK), openDetail()'s id param is this page's string id
  // shape; reuses the existing openDetail() rather than a second fetch path.
  // No role gate here — an owner may click through to the canonical report,
  // same read-only visibility as the status chip/count badge (§ OWNER
  // visibility in the UX spec).
  //
  // QA fix (OBRS-376 type-safety sweep): openDetail()'s optimistic-open
  // lookup (`allReports.find(r => r.id === id)`, design-system.md §6) is a
  // strict `===` against whatever runtime value is passed in. Every OTHER
  // call site passes `report.id` UNCONVERTED — its real runtime value is a
  // JSON number (confirmed live by QA), despite `UsabilityReportSummary.id`
  // being TYPED string (separate, wider follow-up card — not fixed here;
  // see the picker's filteredCandidates fix, same root cause). Converting
  // via `String(canonicalId)` would silently break that `===` match
  // (`42 === "42"` is false), dropping the optimistic pre-fill for exactly
  // this one entry point — so this deliberately forwards the real number
  // through, matching every other caller's runtime shape, rather than
  // "honestly" stringifying it.
  protected openCanonicalReport(canonicalId: number): void {
    this.openDetail(canonicalId as unknown as string);
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
    this.statusFilterOptions = buildStatusOptionList(
      STATUS_FILTER_VALUES,
      (key) => this.translate.instant(key)
    );
    // OBRS-527: detailStatusOptions is now SOURCE-aware (rebuildDetailStatusOptions
    // below) — re-run it against whatever report is currently open (or '' if
    // none) so a language change re-translates the SAME option set instead of
    // resetting it to the role-only default.
    this.rebuildDetailStatusOptions(this.detailReport?.status ?? '');
  }

  // OBRS-527: decision-only dropdown options, now keyed by the report's
  // CURRENT status (sourceStatus), not just role — admin is never restricted
  // (always DETAIL_STATUS_VALUES); an owner's options depend on the legal
  // edges from sourceStatus (detailStatusValuesFor/OWNER_ALLOWED_TARGETS in
  // usability-reports-page.mappers.ts), collapsing to [] once the platform
  // has already finalized the report (accepted/resolved/rejected/duplicate —
  // PO-2). Kept a plain field, NOT a getter (CD-churn precedent documented at
  // admin-layout.component.ts:174) — called explicitly at the same three
  // sites seedStatus() already runs, BEFORE the seed (AMENDMENT A1).
  private rebuildDetailStatusOptions(sourceStatus: UsabilityReportStatus | ''): void {
    this.detailStatusOptions = buildStatusOptionList(
      detailStatusValuesFor(this.isAdmin, sourceStatus),
      (key) => this.translate.instant(key)
    );
  }
}
