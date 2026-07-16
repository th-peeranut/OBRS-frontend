import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { UsabilityReportSummary } from '../../../../../shared/interfaces/usability-report.interface';
import { statusClass as statusClassPure } from '../usability-reports-page.mappers';

// OBRS-376: dumb candidate-picker modal for "mark as duplicate", extracted
// from UsabilityReportsPageComponent following the same presentational-modal
// pattern as VehicleDeleteModalComponent — owns no state beyond its own
// search/select UI, makes no API calls. The smart parent page owns the
// candidate list (pre-filtered to exclude the report itself and any report
// already status==='duplicate', mirroring the backend's own guards), the
// markUsabilityReportAsDuplicate() call, and the isSaving flag.
//
// Modal-over-modal precedent: this can be opened either from a table row
// (no other modal open) or from inside the detail modal (design-system.md
// §6's lightbox precedent). It carries its OWN `.admin-modal-backdrop` +
// `adminModalBackdrop` directive (like VehicleDeleteModalComponent) rather
// than nesting inside the detail modal's backdrop element, so it also works
// standalone from the row. Because `adminModalBackdrop`'s Escape listener is
// bound to `document:keydown.escape`, both this picker's and the detail
// modal's directive instances fire on Escape when both are mounted — the
// page component's onDetailBackdropDismiss() is guarded to no-op whenever
// this picker is open, so Escape only visibly closes the topmost layer (the
// picker); backdrop-click naturally only hits the picker's own (topmost,
// full-viewport) backdrop element.
@Component({
  selector: 'app-usability-report-duplicate-picker',
  templateUrl: './usability-report-duplicate-picker.component.html',
  styleUrl: './usability-report-duplicate-picker.component.scss',
})
export class UsabilityReportDuplicatePickerComponent implements OnChanges {
  @Input() candidates: UsabilityReportSummary[] = [];
  @Input() isSaving = false;
  @Output() confirm = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  protected searchTerm = '';
  protected selectedId: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    // The parent gates this component behind `*ngIf="isPickerOpen"`, which
    // normally destroys/recreates the instance on every open anyway (fresh
    // defaults). This reset is a defensive belt-and-suspenders for any future
    // caller that instead re-binds `[candidates]` on a long-lived instance
    // (e.g. keeping the picker mounted and toggling visibility some other
    // way) — a new candidate list should never carry over a stale search
    // term or selection from whatever was previously being picked.
    if (changes['candidates']) {
      this.searchTerm = '';
      this.selectedId = null;
    }
  }

  protected get filteredCandidates(): UsabilityReportSummary[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      return this.candidates;
    }
    // QA (OBRS-376): `UsabilityReportSummary.id` is TYPED string but the API
    // actually returns it as a JSON number (confirmed live) — calling
    // `.toLowerCase()` on it directly threw a TypeError on every keystroke,
    // going stale/empty and leaving Confirm stuck disabled. `String(c.id)`
    // coerces either the (mistyped) real number or a genuine string id
    // safely. Deliberately NOT fixing the interface itself here — that's a
    // separate, wider follow-up card (ripples into openDetail/the service
    // signature/etc.); this is a local, defensive coercion at the point of
    // use.
    return this.candidates.filter(
      (c) =>
        String(c.id).toLowerCase().includes(term) ||
        c.descriptionPreview.toLowerCase().includes(term)
    );
  }

  protected onSearchTermChange(value: string): void {
    this.searchTerm = value;
  }

  protected selectCandidate(id: string): void {
    this.selectedId = id;
  }

  protected onConfirm(): void {
    if (!this.selectedId || this.isSaving) {
      return;
    }
    this.confirm.emit(this.selectedId);
  }

  protected onCancel(): void {
    if (this.isSaving) {
      return;
    }
    this.cancel.emit();
  }

  protected trackById(_index: number, item: UsabilityReportSummary): string {
    return item.id;
  }

  protected statusClass(status: string): string {
    return statusClassPure(status);
  }

  protected statusKey(status: string): string {
    return `ADMIN.USABILITY_REPORTS.STATUS.${status}`;
  }
}
