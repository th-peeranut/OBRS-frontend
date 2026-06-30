export type UsabilityReportCategory = 'bug' | 'ux_ui_improvement' | 'suggestion';
export type UsabilityReportStatus = 'new' | 'in_review' | 'resolved' | 'wont_fix';

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
  description: string;
  descriptionPreview: string;
  routeUrl: string;
  userAgent: string;
  imageCount: number;
  images: UsabilityReportImage[];
  createdAt: string;
}

export interface UsabilityReportReceipt {
  id: string;
  category: string;
  status: string;
  imageCount: number;
  createdAt: string;
}
