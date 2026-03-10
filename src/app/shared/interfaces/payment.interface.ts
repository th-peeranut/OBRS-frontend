export type PaymentMethod =
  | 'card'
  | 'credit_card'
  | 'bank_transfer'
  | 'qr_promptpay';

export interface PaymentPayload {
  bookingId: number;
  paymentMethod: PaymentMethod;
  cardToken?: string;
  bankReferenceNumber?: string;
  qrReferenceNumber?: string;
}
