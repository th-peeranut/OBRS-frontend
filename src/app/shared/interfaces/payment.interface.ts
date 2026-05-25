export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'credit_card'
  | 'bank_transfer'
  | 'qr_promptpay'
  | 'truemoney'
  | 'shopeepay'
  | 'rabbit_linepay'
  | 'other';

export type MobileBankingSourceType =
  | 'mobile_banking_kbank'
  | 'mobile_banking_scb'
  | 'mobile_banking_ktb'
  | 'mobile_banking_bay'
  | 'mobile_banking_bbl'
  | 'mobile_banking_ocbc';

export interface PaymentPayload {
  bookingId: number;
  paymentMethod: PaymentMethod;
  cardToken?: string;
  bankReferenceNumber?: string;
  qrReferenceNumber?: string;
  sourceType?: MobileBankingSourceType;
  phoneNumber?: string;
  amount?: number;
}

export type PaymentStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'manual_refund_required';

export interface PaymentResponse {
  id: number;
  bookingId: number;
  status: PaymentStatus | string;
  paymentMethod: PaymentMethod | string;
  amount: number | string;
  currency: string;
  transactionId?: string;
  failureReason?: string;
  authorizeUri?: string;
  paidAt?: string;
  createdAt?: string;
}

export interface PaymentSummary {
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  refundedAmount?: string;
  currency: string;
  status: string;
}

export interface PaymentTransaction {
  transactionId?: string;
  paymentMethod: string;
  amount: number | string;
  currency: string;
  status: string;
  gatewayResponse?: string;
  paidAt?: string;
  remark?: string;
}

export interface PaymentByBookingIdResponse {
  bookingId: number;
  paymentSummary: PaymentSummary;
  transactions: PaymentTransaction[];
}

export interface PendingRefund {
  paymentId: number;
  bookingId: number;
  bookingNumber?: string;
  customerName?: string;
  contactPhone?: string;
  contactEmail?: string;
  amount: number | string;
  paymentMethod: string;
  paidAt?: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  numberOfElements: number;
}
