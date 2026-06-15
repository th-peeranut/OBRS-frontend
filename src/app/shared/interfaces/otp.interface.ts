export interface OtpRequest {
  msisdn: string;
}

export interface OtpRequestResponse {
  refNo: string;
  status: string;
  token: string;
}

export interface OtpVerifyResponse {
  status: string;
  message: string;
}

export interface OtpVerify {
  token: string;
  pin: string;
}

export interface LoginOtpVerify {
  token: string;
  pin: string;
  phoneNumber: string;
}
