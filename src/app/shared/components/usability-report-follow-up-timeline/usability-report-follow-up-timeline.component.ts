import { Component, Input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { UsabilityReportFollowUp } from '../../interfaces/usability-report.interface';
import { formatDisplayDateTime } from '../../lib/display-date-time';

/**
 * OBRS-433: read-only follow-up timeline, reused BYTE-IDENTICAL by both the
 * customer "My Reports" detail modal and the admin inline detail modal
 * (`usability-reports-page.component.html`) — see design-system §10, "don't
 * fork a shared component's contract". Deliberately theme-agnostic
 * (`color: inherit`, borders via a fixed neutral rgba rather than any
 * `--admin-*`/`--accent*` runtime var) because the admin host resolves those
 * vars inside `.admin-shell` while the customer host does not — see
 * ParcelTrackingPageComponent's cross-shell status-chip precedent
 * (design-system §12) for the general shape of that constraint, though this
 * component sidesteps it entirely by not depending on themed vars at all.
 * Plain text + author + timestamp + image thumbnails ONLY — no status/role
 * chip (that's the detail modal's own concern, not the timeline's).
 */
export interface UsabilityReportPendingFollowUp {
  note: string;
  thumbnailUrls: string[];
}

@Component({
    selector: 'app-usability-report-follow-up-timeline',
    templateUrl: './usability-report-follow-up-timeline.component.html',
    styleUrl: './usability-report-follow-up-timeline.component.scss',
    standalone: false
})
export class UsabilityReportFollowUpTimelineComponent {
  @Input() followUps: UsabilityReportFollowUp[] = [];

  // OBRS-433: optional, null-default (design-system §10 — extend, don't fork
  // a shared component's contract). The admin caller never sets this and
  // stays byte-identical. `MyReportFollowUpComposerComponent`'s optimistic
  // submit sets it to render a "posting" placeholder row (with a spinner)
  // ahead of the real entries while the POST is in flight, per the locked UX
  // spec ("optimistic append to timeline (spinner on the entry)") — replaced
  // by the real followUps array once the server responds, or cleared on
  // failure (the composer keeps the typed text for retry either way).
  @Input() pendingEntry: UsabilityReportPendingFollowUp | null = null;

  constructor(private readonly translate: TranslateService) {}

  protected displayDateTime(value: string): string {
    return formatDisplayDateTime(value, this.translate.currentLang);
  }

  protected trackById(_index: number, item: UsabilityReportFollowUp): number {
    return item.id;
  }
}
