import { ReportsRangeDto } from './reports-summary.interface';

/** `GET /api/private/admin/reports/customer-behavior?from&to` (OBRS-154) — aggregate-only, no PII. */
export interface CustomerBehaviorChannelDto {
  channel: string;
  bookingCount: number;
  sharePct: number;
}

export interface CustomerBehaviorRepeatBucketDto {
  bookings: number;
  customers: number;
  sharePct: number;
}

export interface CustomerBehaviorDto {
  range: ReportsRangeDto;
  totalBookings: number;
  distinctCustomers: number;
  returningCustomers: number;
  returningRatePct: number;
  avgBookingsPerCustomer: number;
  bookingsByChannel: CustomerBehaviorChannelDto[];
  repeatDistribution: CustomerBehaviorRepeatBucketDto[];
}
