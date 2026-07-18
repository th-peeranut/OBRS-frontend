import { PageResponse } from './payment.interface';

export type UsabilityReportCategory = 'bug' | 'ux_ui_improvement' | 'suggestion';
// OBRS-378: 'dismissed' is the owner/admin low-priority-triage outcome (see
// that card's mappers/component for its dedicated flow).
// OBRS-376: 'duplicate' is never a dropdown-selectable decision — a report only
// reaches it via the mark-as-duplicate action, and only leaves it via the
// un-mark action (PUT status 'in_review'). See usability-reports-page.mappers.ts
// DETAIL_STATUS_VALUES/OWNER_DETAIL_STATUS_VALUES, which deliberately exclude it.
export type UsabilityReportStatus =
  | 'new'
  | 'in_review'
  | 'accepted'
  | 'dismissed'
  | 'resolved'
  | 'rejected'
  | 'duplicate';

export interface UsabilityReportSummary {
  id: string;
  category: UsabilityReportCategory;
  status: UsabilityReportStatus;
  userId: number | null;
  descriptionPreview: string;
  imageCount: number;
  createdAt: string;
  // OBRS-376: null unless status === 'duplicate' (the canonical report this one
  // was merged into); duplicateCount is server-derived (how many OTHER reports
  // point at this one as their canonical) and is > 0 on any report, regardless
  // of its own status.
  duplicateOfId: number | null;
  duplicateCount: number;
}

// OBRS-403: the Spring `Page<T>` envelope this list endpoint actually returns
// (totalPages/size/number/numberOfElements, needed by the new server-side
// paginator) is already declared as `PageResponse<T>`
// (shared/interfaces/payment.interface.ts) and reused as-is by the
// notification/refund lists — alias rather than re-declare the same shape a
// second time.
export type UsabilityReportPage = PageResponse<UsabilityReportSummary>;

export interface UsabilityReportImage {
  id: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
  position: number;
}

export interface UsabilityReportDetail {
  id: string;
  category: UsabilityReportCategory;
  status: UsabilityReportStatus;
  userId: number | null;
  reporterEmail: string | null;
  description: string;
  descriptionPreview: string;
  routeUrl: string;
  userAgent: string;
  imageCount: number;
  images: UsabilityReportImage[];
  createdAt: string;
  triageNote: string | null;
  triagedBy: number | null;
  triagedByName: string | null;
  triagedAt: string | null;
  jiraIssueKey: string | null;
  // OBRS-115: when the reporter-outcome email was dispatched (resolved/rejected
  // with a contact email). Null = reporter never notified.
  reporterNotifiedAt: string | null;
  // OBRS-376: see UsabilityReportSummary above — same meaning, carried on the
  // detail shape as well so the detail meta block can render the same link/badge.
  duplicateOfId: number | null;
  duplicateCount: number;
  // OBRS-433: read-only follow-up timeline (reporter + admin notes/images),
  // rendered in the admin inline detail modal via the shared
  // UsabilityReportFollowUpTimelineComponent. Reuses the SAME
  // UsabilityReportFollowUp shape as MyUsabilityReportDetail.followUps below —
  // do not fork a parallel type.
  followUps: UsabilityReportFollowUp[];
}

export interface UsabilityReportReceipt {
  id: string;
  category: string;
  status: string;
  imageCount: number;
  createdAt: string;
}

// ── OBRS-433: reporter-facing "My Reports" (customer area) ───────────────────
// A DELIBERATELY separate interface family from UsabilityReportSummary/Detail
// above rather than reusing them: those two carry `id: string`, which is the
// OBRS-376-documented latent bug (BIGSERIAL id serializes as a JSON number —
// see DEV-GOTCHAS "An FE field typed wrong survives until the first
// type-specific method call"). This family is new code with no legacy call
// sites depending on the wrong type, so it types `id: number` everywhere from
// the start instead of inheriting the bug.

export interface MyUsabilityReportSummary {
  id: number;
  category: UsabilityReportCategory;
  status: UsabilityReportStatus;
  descriptionPreview: string;
  imageCount: number;
  createdAt: string;
}

export type MyUsabilityReportPage = PageResponse<MyUsabilityReportSummary>;

// A reporter or admin follow-up note on a report, addable in ANY status.
// Reused as-is by BOTH the customer "My Reports" detail modal (read/write —
// the reporter composes new ones) and the admin inline detail modal
// (read-only timeline) — see UsabilityReportDetail.followUps below.
export interface UsabilityReportFollowUp {
  id: number;
  note: string;
  authorUserId: number;
  authorName: string;
  createdAt: string;
  images: UsabilityReportImage[];
}

export interface MyUsabilityReportDetail {
  id: number;
  category: UsabilityReportCategory;
  status: UsabilityReportStatus;
  description: string;
  routeUrl: string;
  images: UsabilityReportImage[];
  createdAt: string;
  updatedAt: string;
  // The admin's triage note — reporter-visible per OBRS-433 AC#2.
  triageNote: string | null;
  // True only while status === 'new'; drives whether the Edit form renders.
  editable: boolean;
  followUps: UsabilityReportFollowUp[];
}
