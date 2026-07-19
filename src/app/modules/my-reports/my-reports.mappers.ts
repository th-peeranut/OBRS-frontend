import {
  MyUsabilityReportDetail,
  MyUsabilityReportPage,
  MyUsabilityReportSummary,
  UsabilityReportCategory,
} from '../../shared/interfaces/usability-report.interface';
import { formatDisplayDateTime } from '../../shared/lib/display-date-time';

// Pure mappers/formatters for the "My Reports" module (OBRS-433). Deliberately
// a FRESH, small file rather than importing admin's
// usability-reports-page.mappers.ts (locked UX spec) — that file is
// module-local inside the lazy AdminModule and typed around the OBRS-376
// string-id UsabilityReportSummary shape this module doesn't use (this
// module's own MyUsabilityReportSummary types `id: number` from the start).

// Mirrors the SAME status -> `.admin-status.is-*` token mapping (design-system
// §2.4 status table) as admin's own statusClass — re-implemented rather than
// imported, per the module-boundary note above.
export function statusClass(status: string): string {
  switch (status) {
    case 'new':
      return 'is-warning';
    case 'in_review':
      return 'is-info';
    // OBRS-527: owner-screened stage, between in_review and accepted.
    case 'owner_accepted':
      return 'is-owner-accepted';
    case 'accepted':
      return 'is-accepted';
    case 'dismissed':
      return 'is-neutral';
    case 'resolved':
      return 'is-success';
    case 'rejected':
      return 'is-danger';
    case 'duplicate':
      return 'is-duplicate';
    default:
      return '';
  }
}

export function statusLabel(status: string, translateFn: (key: string) => string): string {
  return translateFn(`USABILITY_REPORT.MY_REPORTS.STATUS.${status}`);
}

// Reuses the EXISTING USABILITY_REPORT.CATEGORY.* keys (the FAB modal already
// defines them) rather than a duplicate MY_REPORTS.CATEGORY.* subtree.
export function categoryLabel(category: string, translateFn: (key: string) => string): string {
  return translateFn(`USABILITY_REPORT.CATEGORY.${category.toUpperCase()}`);
}

export function displayDateTime(value: string | null | undefined, dateLang: string): string {
  return formatDisplayDateTime(value, dateLang);
}

// Truncation for the OPTIMISTIC summary-row patch after a successful edit
// save. The PATCH response returns the full `description` (MyUsabilityReportDetail
// has no server-computed `descriptionPreview` — that field only exists on the
// list DTO), so this is a client-side approximation used purely to avoid a
// full-reload flash on the card (per the locked UX spec: "emits reportUpdated
// so the card updates without full reload"). Not a contract with the
// backend's own preview truncation — the next real page fetch (route
// re-entry) always resyncs the server's exact value.
const PREVIEW_MAX_LENGTH = 140;
export function truncatePreview(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length <= PREVIEW_MAX_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, PREVIEW_MAX_LENGTH)}…`;
}

export interface SummaryEditPatch {
  category: UsabilityReportCategory;
  descriptionPreview: string;
  imageCount: number;
}

// Pure list-mutate helper for the optimistic post-edit-save patch — replaces
// category/descriptionPreview/imageCount on the single edited row, leaving
// id/status/createdAt untouched (an edit can only happen while status==='new'
// and never changes it).
export function updateSummaryRow(
  content: MyUsabilityReportSummary[],
  id: number,
  patch: SummaryEditPatch
): MyUsabilityReportSummary[] {
  return content.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

// The optimistic-open fallback (design-system §6): renders a full
// MyUsabilityReportDetail shape from the already-known summary row while the
// real GET is still in flight. Mirrors admin's own
// toUsabilityReportDetailFallback() shape/intent — routeUrl/images/triageNote/
// followUps/updatedAt are blank/empty pending the real fetch; `editable` is
// derived the same way the backend derives it (status === 'new'), so the Edit
// button doesn't flicker in for a report the fallback already knows isn't new.
export function toDetailFallback(summary: MyUsabilityReportSummary): MyUsabilityReportDetail {
  return {
    id: summary.id,
    category: summary.category,
    status: summary.status,
    description: summary.descriptionPreview,
    routeUrl: '',
    images: [],
    createdAt: summary.createdAt,
    updatedAt: summary.createdAt,
    triageNote: null,
    editable: summary.status === 'new',
    followUps: [],
  };
}

// Pure "load more" merge: appends the next server page's rows after the
// current cached rows, adopting the next page's pagination metadata
// (number/totalPages/etc). Used by MyReportsStore.loadMore() — kept pure and
// unit-testable independent of the store's HTTP/caching plumbing.
export function appendPage(
  current: MyUsabilityReportPage,
  next: MyUsabilityReportPage
): MyUsabilityReportPage {
  return {
    ...next,
    content: [...current.content, ...next.content],
  };
}
