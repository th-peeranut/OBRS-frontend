export interface ResponseAPI<T> {
  timestamp?: string;
  code: number;
  message: string;
  data?: T;
}

export interface ApiFieldError {
  field: string;
  rejectedValue?: unknown;
  reason: string;
}

export interface ApiErrorResponse {
  timestamp: string;
  status: number;
  message: string;
  errorCode: string;
  errors?: ApiFieldError[];
}
