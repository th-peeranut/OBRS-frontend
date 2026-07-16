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

export interface UsabilityReportPage {
  content: UsabilityReportSummary[];
  totalElements: number;
}

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
}

export interface UsabilityReportReceipt {
  id: string;
  category: string;
  status: string;
  imageCount: number;
  createdAt: string;
}
