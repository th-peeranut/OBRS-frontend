export interface ResponseAPI<T> {
  code: string;
  message: string;
  result: T;
}
