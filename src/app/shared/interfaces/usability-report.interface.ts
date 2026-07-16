import { PageResponse } from './payment.interface';

export type UsabilityReportCategory = 'bug' | 'ux_ui_improvement' | 'suggestion';
export type UsabilityReportStatus =
  | 'new'
  | 'in_review'
  | 'accepted'
  | 'dismissed'
  | 'resolved'
  | 'rejected';

export interface UsabilityReportSummary {
  id: string;
  category: UsabilityReportCategory;
  status: UsabilityReportStatus;
  userId: number | null;
  descriptionPreview: string;
  imageCount: number;
  createdAt: string;
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
}

export interface UsabilityReportReceipt {
  id: string;
  category: string;
  status: string;
  imageCount: number;
  createdAt: string;
}
