import { HttpErrorResponse } from '@angular/common/http';
import {
  UsabilityReportDetail,
  UsabilityReportStatus,
  UsabilityReportSummary,
} from '../../../../shared/interfaces/usability-report.interface';
import { formatDisplayDateTime } from '../../../../shared/lib/display-date-time';

// Pure mappers/formatters/normalizers extracted from UsabilityReportsPageComponent
// (OBRS-247, mirroring OBRS-208's routes.mappers.ts, OBRS-214's
// schedules.mappers.ts, OBRS-232's user-management.mappers.ts, OBRS-237's
// role-management.mappers.ts, OBRS-241's promotions.mappers.ts and OBRS-244's
// vehicles-page.mappers.ts). No Angular/service dependencies — every
// translation- or language-dependent value the original private/protected
// methods pulled off `this` is now an explicit parameter, so these stay
// unit-testable in isolation.

export interface StatusOption {
  value: string;
  label: string;
}

// The table filter offers all statuses (including 'duplicate', OBRS-376, so
// the table can be filtered down to just the merged-away reports);
// 'new'/'in_review' are triage states, not outcomes, so they are excluded
// from the decision-only detail dropdown below (design-system.md §3.1: no
// pre-seeded default). 'duplicate' is ALSO excluded from the detail dropdown
// (see DETAIL_STATUS_VALUES below) — it is never a dropdown-selectable
// decision, only reachable via the mark/un-mark actions.
export const STATUS_FILTER_VALUES: readonly UsabilityReportStatus[] = [
  'new',
  'in_review',
  'accepted',
  'resolved',
  'rejected',
  'duplicate',
];

export const DETAIL_STATUS_VALUES: readonly UsabilityReportStatus[] = [
  'accepted',
  'resolved',
  'rejected',
];

// OBRS-370: owner is a SCREEN-ONLY tier on this page — the backend 403s a
// non-admin on the terminal decisions (resolved/rejected, which are terminal
// and email the reporter) and on the Jira key, so the owner's decision
// dropdown only offers the non-terminal, forward-moving transitions.
export const OWNER_DETAIL_STATUS_VALUES: readonly UsabilityReportStatus[] = [
  'in_review',
  'accepted',
];

// Statuses a decision-only dropdown may hold — 'new'/'in_review' are triage
// states, not outcomes an admin picks (design-system.md §3.1: no pre-seeded
// default; the admin must actively choose an outcome).
export const DECISION_STATUSES: ReadonlySet<UsabilityReportStatus> = new Set<UsabilityReportStatus>(
  ['accepted', 'resolved', 'rejected']
);

// OBRS-376: a report may be marked as a duplicate from any non-terminal,
// non-already-duplicate status — 'resolved'/'rejected' are terminal decisions
// and 'duplicate' is reached only through this same action (can't re-mark an
// already-duplicate report).
export const MARK_AS_DUPLICATE_STATUSES: ReadonlySet<UsabilityReportStatus> = new Set<
  UsabilityReportStatus
>(['new', 'in_review', 'accepted']);

export function canMarkAsDuplicate(status: UsabilityReportStatus): boolean {
  return MARK_AS_DUPLICATE_STATUSES.has(status);
}

// Builds the translated {value,label} options for a status dropdown from a
// fixed list of status values. `translateFn` is the caller's
// `TranslateService.instant` (bound), kept as an explicit param so this stays
// pure/unit-testable without a TranslateService instance.
export function buildStatusOptionList(
  statusValues: readonly UsabilityReportStatus[],
  translateFn: (key: string) => string
): StatusOption[] {
  return statusValues.map((value) => ({
    value,
    label: translateFn(`ADMIN.USABILITY_REPORTS.STATUS.${value}`),
  }));
}

export function categoryLabel(category: string, translateFn: (key: string) => string): string {
  const key = `USABILITY_REPORT.CATEGORY.${category.toUpperCase()}`;
  return translateFn(key);
}

export function statusLabel(status: string, translateFn: (key: string) => string): string {
  const key = `ADMIN.USABILITY_REPORTS.STATUS.${status}`;
  return translateFn(key);
}

export function statusClass(status: string): string {
  if (status === 'new') return 'is-warning';
  if (status === 'in_review') return 'is-info';
  if (status === 'accepted') return 'is-accepted';
  if (status === 'resolved') return 'is-success';
  if (status === 'rejected') return 'is-danger';
  // OBRS-376: plain-grey "inactive/unset" token (design-system.md §2.4) — a
  // duplicate report is neither a positive nor negative outcome, it's off the
  // active queue entirely, same semantic as boarding-list's "Not boarded".
  if (status === 'duplicate') return 'is-neutral';
  return '';
}

// Renders a raw backend ISO timestamp as a human-readable date-time.
// `dateLang` is deliberately the RAW `translate.currentLang` (e.g. 'en-US'),
// NOT a th/en-normalized `locale` — this page has no locale-normalization
// step of its own (categoryLabel/statusLabel resolve entirely through
// translateFn/translate.instant, which already keys off currentLang
// internally). Passing anything other than the raw currentLang here would
// silently change the displayed date format (see the same trap in
// toRouteRow/toUserRow/toRoleRow/toVehicleRow).
export function displayDateTime(value: string | null | undefined, dateLang: string): string {
  return formatDisplayDateTime(value, dateLang);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Only a terminal decision (accepted/resolved/rejected) may pre-seed the
// decision-only dropdown. 'new'/'in_review' are triage states, not outcomes
// — the dropdown starts empty (placeholder, Save disabled) until the admin
// actively picks one (design-system.md §3.1).
export function seedDecisionStatus(
  status: UsabilityReportStatus | ''
): UsabilityReportStatus | '' {
  return DECISION_STATUSES.has(status as UsabilityReportStatus) ? (status as UsabilityReportStatus) : '';
}

// The optimistic-open fallback: renders a full UsabilityReportDetail shape
// from the already-known summary row while the real GET is still in flight
// (design-system.md §6). Deliberately leaves routeUrl/userAgent/images
// blank/empty and every triage/notify field null — those only arrive with
// the real detail fetch.
export function toUsabilityReportDetailFallback(
  summary: UsabilityReportSummary
): UsabilityReportDetail {
  return {
    id: summary.id,
    category: summary.category,
    status: summary.status,
    userId: summary.userId,
    reporterEmail: null,
    description: summary.descriptionPreview,
    descriptionPreview: summary.descriptionPreview,
    routeUrl: '',
    userAgent: '',
    imageCount: summary.imageCount,
    images: [],
    createdAt: summary.createdAt,
    triageNote: null,
    triagedBy: null,
    triagedByName: null,
    triagedAt: null,
    jiraIssueKey: null,
    reporterNotifiedAt: null,
    // OBRS-376: carried straight through — unlike routeUrl/userAgent/images,
    // duplicateOfId/duplicateCount ARE already known from the summary row
    // (they're columns on the list response too), so the optimistic-open
    // fallback doesn't need to blank them out pending the real GET.
    duplicateOfId: summary.duplicateOfId,
    duplicateCount: summary.duplicateCount,
  };
}

// Pure list-mutate helper shared by the optimistic saveStatus() update and
// the silent auto-promote-on-open path (and its revert) — both replace a
// single row's status by id, leaving every other row untouched.
export function updateRowStatus(
  content: UsabilityReportSummary[],
  id: string,
  status: UsabilityReportStatus
): UsabilityReportSummary[] {
  return content.map((r) => (r.id === id ? { ...r, status } : r));
}

// OBRS-376: extracts `error.error.errorCode` from a failed mark-as-duplicate
// call, mirroring schedules.mappers.ts's extractScheduleErrorCode() /
// boarding-action-error.ts's extractBoardingActionErrorCode() — branch on the
// stable code, never the localized `message` (design-system §9).
export function extractUsabilityReportErrorCode(error: unknown): string | null {
  if (error instanceof HttpErrorResponse) {
    const code = (error.error as { errorCode?: string } | null)?.errorCode;
    if (code) {
      return code;
    }
  }
  return null;
}
