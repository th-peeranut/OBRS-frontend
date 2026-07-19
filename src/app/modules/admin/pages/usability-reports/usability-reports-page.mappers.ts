import { extractApiErrorCode } from '../../../../shared/lib/api-error-code';
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

// OBRS-524: the status filter dropdown's value type. This is NOT a revert of
// OBRS-378's removal of the old "show all" mode — that mode was an empty
// [placeholder] option emitting '' (a design-system.md §3.1 violation: a
// selectable empty row, and an undefined status silently sent to the
// server). 'all' is a REAL option with a concrete value, sitting in the
// option list exactly like every other status — the dropdown's visible
// label always comes from a selected option, never a placeholder. Only the
// service/store layer (usability-reports.store.ts's fetch()) treats 'all'
// specially, by omitting the ?status= param — confirmed against the live
// backend (UsabilityReportService.listReports: status==null -> findAll(),
// no implicit filter, 'duplicate'/'dismissed' rows included) that omitting
// the param really does mean "every status", not a partial view.
export type StatusFilterValue = UsabilityReportStatus | 'all';

// The table filter offers 'all' (OBRS-524) plus all 7 statuses (OBRS-378's 6
// plus 'duplicate' from OBRS-376, so the table can also be filtered down to
// just the merged-away reports), non-terminal states grouped before terminal
// ones per the UX spec; 'new'/'in_review' are triage states, not outcomes,
// so they are excluded from the decision-only detail dropdowns below
// (design-system.md §3.1: no pre-seeded default). 'duplicate' is ALSO
// excluded from the detail dropdown (see DETAIL_STATUS_VALUES below) — it is
// never a dropdown-selectable decision, only reachable via the mark/un-mark
// actions. 'all' is listed first — it is an added CHOICE, never the default
// (the page still seeds a concrete role-based status in ngOnInit).
export const STATUS_FILTER_VALUES: readonly StatusFilterValue[] = [
  'all',
  'new',
  'in_review',
  'owner_accepted',
  'accepted',
  'dismissed',
  'resolved',
  'rejected',
  'duplicate',
];

// OBRS-378: 'dismissed' is a non-terminal screen-out decision (no email, can
// be pulled back into review) that both admin and owner may set — see
// OWNER_DETAIL_STATUS_VALUES below.
// OBRS-527: unchanged — admin is never restricted, so the admin decision
// dropdown still offers exactly these four (owner_accepted is reachable by
// admin too, but only via detailStatusValuesFor's admin branch, which always
// returns this whole list regardless of the report's current status).
export const DETAIL_STATUS_VALUES: readonly UsabilityReportStatus[] = [
  'accepted',
  'dismissed',
  'resolved',
  'rejected',
];

// OBRS-370: owner is a SCREEN-ONLY tier on this page — the backend 403s a
// non-admin on the terminal decisions (resolved/rejected, which are terminal
// and email the reporter) and on the Jira key, so the owner's decision
// dropdown only offers the non-terminal, forward-moving transitions.
// OBRS-378 (PO lock): owner CAN set 'dismissed' — it is non-terminal and
// non-email, so it stays within the owner's screening authority.
// OBRS-527: 'accepted' DROPPED (PO-2 — every transition out of/into 'accepted'
// is admin-only) and 'owner_accepted' ADDED — this is now "the owner's full
// set", filtered per-report by detailStatusValuesFor() below to the legal
// edges from the report's current status.
export const OWNER_DETAIL_STATUS_VALUES: readonly UsabilityReportStatus[] = [
  'in_review',
  'owner_accepted',
  'dismissed',
];

// OBRS-527: mirrors the backend's ALLOWED_TRANSITIONS matrix
// (UsabilityReportService.java), restricted to the targets an OWNER (not
// admin) may legally reach — i.e. with every ADMIN_ONLY_TARGET_STATUSES
// target ('accepted'/'resolved'/'rejected') removed from each source's set.
// This is a MIRROR, not the authority — the backend still enforces every
// transition; this only drives which options the owner's dropdown shows so
// they don't hit an avoidable 403. Sources the owner cannot act on at all
// (accepted/resolved/rejected/duplicate — PO-2 makes these admin-only
// SOURCES too) map to an empty array.
export const OWNER_ALLOWED_TARGETS: Record<
  UsabilityReportStatus,
  readonly UsabilityReportStatus[]
> = {
  new: ['in_review', 'dismissed'],
  in_review: ['owner_accepted', 'dismissed'],
  owner_accepted: ['in_review', 'dismissed'],
  accepted: [],
  dismissed: ['in_review'],
  resolved: [],
  rejected: [],
  duplicate: [],
};

// OBRS-527: the source-aware detail dropdown (solves PO-2 and the
// owner-undo case with one mechanism). Admin is never restricted. An owner's
// options depend on the report's CURRENT status (sourceStatus) — a report
// already 'accepted'/'resolved'/'rejected'/'duplicate' has no legal owner
// move at all (the source-side guard already 403s these; offering options
// here would just eat a free 403), and every other source is filtered to
// OWNER_DETAIL_STATUS_VALUES minus itself and minus any target that isn't a
// legal edge per OWNER_ALLOWED_TARGETS above.
export function detailStatusValuesFor(
  isAdmin: boolean,
  sourceStatus: UsabilityReportStatus | ''
): readonly UsabilityReportStatus[] {
  if (isAdmin) {
    return DETAIL_STATUS_VALUES;
  }
  if (sourceStatus === '') {
    return OWNER_DETAIL_STATUS_VALUES;
  }
  const legalTargets = OWNER_ALLOWED_TARGETS[sourceStatus];
  return OWNER_DETAIL_STATUS_VALUES.filter(
    (value) => value !== sourceStatus && legalTargets.includes(value)
  );
}

// Statuses a decision-only dropdown may hold — 'new'/'in_review' are triage
// states, not outcomes an admin picks (design-system.md §3.1: no pre-seeded
// default; the admin must actively choose an outcome).
// OBRS-527: 'owner_accepted' added — owner screening IS a decision (it stamps
// triagedBy/triagedAt on the backend), so a report already sitting at
// 'owner_accepted' pre-seeds the dropdown to it, same as the other three.
export const DECISION_STATUSES: ReadonlySet<UsabilityReportStatus> = new Set<UsabilityReportStatus>(
  ['accepted', 'resolved', 'rejected', 'owner_accepted']
);

// OBRS-376: a report may be marked as a duplicate from any non-terminal,
// non-already-duplicate status — 'resolved'/'rejected' are terminal decisions
// and 'duplicate' is reached only through this same action (can't re-mark an
// already-duplicate report).
// OBRS-527: 'owner_accepted' added — matches the backend's markAsDuplicate
// allowed-from set.
export const MARK_AS_DUPLICATE_STATUSES: ReadonlySet<UsabilityReportStatus> = new Set<
  UsabilityReportStatus
>(['new', 'in_review', 'owner_accepted', 'accepted']);

export function canMarkAsDuplicate(status: UsabilityReportStatus): boolean {
  return MARK_AS_DUPLICATE_STATUSES.has(status);
}

// Builds the translated {value,label} options for a status dropdown from a
// fixed list of status values. `translateFn` is the caller's
// `TranslateService.instant` (bound), kept as an explicit param so this stays
// pure/unit-testable without a TranslateService instance.
export function buildStatusOptionList(
  statusValues: readonly StatusFilterValue[],
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
  // OBRS-527: owner-screened stage, between in_review and accepted.
  if (status === 'owner_accepted') return 'is-owner-accepted';
  if (status === 'accepted') return 'is-accepted';
  // OBRS-378: dismissed is a muted, distinct-from-danger screen-out state —
  // reuses the existing plain-grey .is-neutral token (design-system.md §2.4),
  // verified WCAG-safe in both themes (admin-theme.scss), not a new hex.
  if (status === 'dismissed') return 'is-neutral';
  if (status === 'resolved') return 'is-success';
  if (status === 'rejected') return 'is-danger';
  // OBRS-376/378 (PO decision, 2026-07-16): 'duplicate' originally reused the
  // plain-grey is-neutral token, but that collided with 'dismissed' above —
  // both rendered as identical grey chips. Moved to its own --admin-duplicate-*
  // violet token (admin-theme.scss); 'dismissed' keeps is-neutral unchanged.
  if (status === 'duplicate') return 'is-duplicate';
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
    // OBRS-433: like routeUrl/userAgent/images, the follow-up timeline only
    // arrives with the real detail fetch — the fallback renders an empty list
    // pending it.
    followUps: [],
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
  return extractApiErrorCode(error, null);
}

// OBRS-378: pure list-mutate helper for a row that moved OUT of the currently
// active tab (server-side ?status= filtering means a patched-but-out-of-tab
// row must be dropped, not just re-labelled). Used by applyRowStatus()
// alongside updateRowStatus() above.
export function removeRow(
  content: UsabilityReportSummary[],
  id: string
): UsabilityReportSummary[] {
  return content.filter((r) => r.id !== id);
}

// OBRS-378: the two "actively worked" tabs (accepted awaiting resolution,
// in_review awaiting a decision) sort oldest-first (FIFO — work the queue in
// order); every other tab (new, dismissed, resolved, rejected) sorts
// newest-first, matching this page's pre-existing default ordering.
export const FIFO_STATUSES: ReadonlySet<UsabilityReportStatus> = new Set<UsabilityReportStatus>([
  'accepted',
  'in_review',
]);

// OBRS-524: 'all' sorts newest-first, same as every other non-FIFO tab —
// there is no single "actively worked" queue to order oldest-first when
// every status is mixed together.
export function sortForStatus(status: StatusFilterValue | ''): string[] {
  const dir = status !== '' && status !== 'all' && FIFO_STATUSES.has(status) ? 'asc' : 'desc';
  return [`createdAt,${dir}`, `id,${dir}`];
}
