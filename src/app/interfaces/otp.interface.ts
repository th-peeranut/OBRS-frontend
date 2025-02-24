export interface OtpRequest {
  msisdn?: string;
}

export interface OtpResponse {
  refNo: string;
  status: string;
  token: string;
}

export interface OtpVerify {
  token: string;
  pin: string;
}
