export type UsabilityReportCategory = 'bug' | 'ux_ui_improvement' | 'suggestion';
export type UsabilityReportStatus = 'new' | 'in_review' | 'accepted' | 'resolved' | 'rejected';

export interface UsabilityReportSummary {
  id: string;
  category: UsabilityReportCategory;
  status: UsabilityReportStatus;
  userId: number | null;
  descriptionPreview: string;
  imageCount: number;
  createdAt: string;
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
}

export interface UsabilityReportReceipt {
  id: string;
  category: string;
  status: string;
  imageCount: number;
  createdAt: string;
}
