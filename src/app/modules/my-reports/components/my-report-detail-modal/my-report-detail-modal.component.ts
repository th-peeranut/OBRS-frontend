import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { UsabilityReportService } from '../../../../services/usability-report/usability-report.service';
import {
  MyUsabilityReportDetail,
  MyUsabilityReportSummary,
  UsabilityReportFollowUp,
} from '../../../../shared/interfaces/usability-report.interface';
import { UsabilityReportPendingFollowUp } from '../../../../shared/components/usability-report-follow-up-timeline/usability-report-follow-up-timeline.component';
import {
  categoryLabel as categoryLabelPure,
  displayDateTime as displayDateTimePure,
  statusClass as statusClassPure,
  statusLabel as statusLabelPure,
  toDetailFallback,
  truncatePreview,
} from '../../my-reports.mappers';

export interface MyReportSummaryPatch {
  id: number;
  category: MyUsabilityReportSummary['category'];
  descriptionPreview: string;
  imageCount: number;
}

/**
 * OBRS-433: reporter's own report detail — a11y title element carries
 * `class="mr-detail-title"` and the dialog shell `class="mr-detail-modal"`
 * (see admin-modal-backdrop.directive.ts, extended to recognize both).
 * Opens OPTIMISTICALLY (design-system §6): seeded from the summary row
 * already in hand via `toDetailFallback()`, then a background
 * `GET /{id}` patches in the real detail (including the admin's triage note
 * and the follow-up timeline) once it lands.
 */
@Component({
  selector: 'app-my-report-detail-modal',
  templateUrl: './my-report-detail-modal.component.html',
  styleUrl: './my-report-detail-modal.component.scss',
})
export class MyReportDetailModalComponent implements OnInit, OnDestroy {
  @Input() summary!: MyUsabilityReportSummary;

  @Output() closed = new EventEmitter<void>();
  @Output() reportUpdated = new EventEmitter<MyReportSummaryPatch>();

  protected detail: MyUsabilityReportDetail | null = null;
  protected isDetailFetching = false;
  protected isEditing = false;
  protected pendingFollowUp: UsabilityReportPendingFollowUp | null = null;
  // OBRS-433 Scrutinize fix: true ONLY once a real (non-fallback) GET /{id}
  // has actually resolved with data — never true while `detail` is still the
  // optimistic `toDetailFallback()` seed, and never flipped true by a failed
  // fetch. Gates entry to edit mode (see startEdit()) so the reporter can
  // never start editing off the fallback's TRUNCATED descriptionPreview
  // (previously reachable during the ~2s background GET, and permanently
  // reachable after a GET error since `isDetailFetching` alone had already
  // gone false there). Same "pristine-guard every control an optimistic-open
  // modal patches after fetch" family as the 3 prior admin-modal occurrences
  // (design-system §11) — this is the 4th, on this modal specifically.
  protected realDetailLoaded = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly usabilityReportService: UsabilityReportService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.detail = toDetailFallback(this.summary);
    this.isDetailFetching = true;

    this.usabilityReportService
      .getMyReportById(this.summary.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isDetailFetching = false;
          if (response.data) {
            this.detail = response.data;
            this.realDetailLoaded = true;
          }
        },
        error: () => {
          this.isDetailFetching = false;
          // realDetailLoaded stays false — `detail` is still the fallback,
          // and it must stay un-editable rather than fail open.
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected close(): void {
    this.closed.emit();
  }

  protected startEdit(): void {
    // Defense-in-depth alongside the template's [disabled] binding — entry
    // to edit mode must never happen off the optimistic fallback (see
    // realDetailLoaded's doc comment).
    if (!this.realDetailLoaded) {
      return;
    }
    this.isEditing = true;
  }

  protected cancelEdit(): void {
    this.isEditing = false;
  }

  // Called by MyReportEditFormComponent on a successful PATCH — the SUCCESS
  // path (per the locked UX spec): replace detail, exit edit mode, and emit
  // reportUpdated so the card list updates without a full reload.
  protected onEditSaved(updated: MyUsabilityReportDetail): void {
    this.detail = updated;
    this.isEditing = false;
    this.reportUpdated.emit({
      id: updated.id,
      category: updated.category,
      descriptionPreview: truncatePreview(updated.description),
      imageCount: updated.images.length,
    });
  }

  // 400 REPORT_NOT_EDITABLE / 409 CONCURRENT_MODIFICATION: the edit form
  // already showed the AlertService.error toast (it owns the failed HTTP
  // call); this exits edit mode and RE-FETCHES so the now-stale Edit button
  // disappears if the report moved out of 'new' underneath the reporter.
  protected onEditStale(): void {
    this.isEditing = false;
    this.refetch();
  }

  // Optimistic follow-up append (design-system precedent: optimistic mutate
  // then reconcile with the server response). The composer manages its own
  // form/image-picker state; this only owns the timeline's rendered list.
  protected onFollowUpPending(pending: UsabilityReportPendingFollowUp): void {
    this.pendingFollowUp = pending;
  }

  protected onFollowUpAdded(followUp: UsabilityReportFollowUp): void {
    this.pendingFollowUp = null;
    if (this.detail) {
      this.detail = { ...this.detail, followUps: [...this.detail.followUps, followUp] };
    }
  }

  protected onFollowUpFailed(): void {
    this.pendingFollowUp = null;
  }

  private refetch(): void {
    this.isDetailFetching = true;
    this.usabilityReportService
      .getMyReportById(this.summary.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isDetailFetching = false;
          if (response.data) {
            this.detail = response.data;
            this.realDetailLoaded = true;
          }
        },
        error: () => {
          this.isDetailFetching = false;
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

  protected displayDateTime(value: string): string {
    return displayDateTimePure(value, this.translate.currentLang);
  }
}
