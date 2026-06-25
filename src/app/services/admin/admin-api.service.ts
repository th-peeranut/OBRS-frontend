import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable, of } from 'rxjs';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import {
  PageResponse,
  PaymentResponse,
  PendingRefund,
} from '../../shared/interfaces/payment.interface';

export interface AdminTranslationDto {
  locale?: string;
  label?: string;
  description?: string;
}

export type AdminTranslationCollection =
  | AdminTranslationDto[]
  | Record<string, AdminTranslationDto | null | undefined>;

export interface AdminTranslationReqDto {
  locale: string;
  label: string;
  description?: string;
}

export interface AdminStatusDto {
  code?: string;
  slug?: string;
  name?: string;
  label?: string;
  display?: AdminTranslationCollection;
  translations?: AdminTranslationCollection;
}

export interface AdminLookupDto {
  id: number;
  category: string;
  slug: string;
  translations: AdminTranslationCollection;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminRoleDto {
  id?: number;
  slug: string;
  name?: string;
  description?: string;
  status?: string | AdminStatusDto;
  permissions?: string[];
  createdAt?: string;
  updatedAt?: string;
  translations?: AdminTranslationCollection;
}

export interface AdminUserDto {
  id: number;
  title?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  username?: string;
  preferredLocale?: string;
  status?: string | AdminStatusDto;
  createdAt?: string;
  updatedAt?: string;
  roles: Array<string | AdminRoleDto>;
}

export interface LayoutResponse {
  id: number;
  name?: string;
  label?: string;
}

export interface AdminVehicleTypeDto {
  id: number;
  slug: string;
  code?: string;
  totalSeats?: number;
  status?: string | AdminStatusDto;
  display?: AdminTranslationCollection;
  translations?: AdminTranslationCollection;
  /** Seat-map options — only present on the vehicle-type detail endpoint. */
  seatMaps?: LayoutResponse[];
}

export interface AdminVehicleDto {
  id: number;
  numberPlate?: string;
  vehicleNumber?: string;
  status?: string | AdminStatusDto;
  vehicleType?: AdminVehicleTypeDto;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminRouteDto {
  id: number;
  slug: string;
  code?: string;
  status?: string | AdminStatusDto;
  createdAt?: string;
  updatedAt?: string;
  display?: AdminTranslationCollection;
  translations?: AdminTranslationCollection;
}

export interface AdminStopDto {
  id?: number;
  slug?: string;
  code?: string;
  display?: AdminTranslationCollection;
  translations?: AdminTranslationCollection;
}

export interface AdminStopOrderDto {
  stopOrder: number;
  distanceKmFromOrigin?: number | string;
  offsetMinutesFromOrigin?: number;
  stop?: AdminStopDto;
}

export interface AdminRouteStopDto {
  route?: AdminRouteDto;
  stops: AdminStopOrderDto[];
}

export interface AdminNewTranslationDto {
  slug?: string;
  name?: string;
}

export interface AdminStopPairDto {
  segmentId?: number;
  fromStop?: AdminNewTranslationDto;
  toStop?: AdminNewTranslationDto;
  vehicleType?: AdminNewTranslationDto;
  fare?: string;
  estimatedDurationMinutes?: number;
}

export interface AdminSegmentDto {
  route?: AdminNewTranslationDto;
  stopPairs: AdminStopPairDto[];
}

export interface AdminStopPairReqDto {
  fromStop: string;
  toStop: string;
  fare: number;
  estimatedDurationMinutes?: number;
}

export interface AdminSegmentReqDto {
  route: string;
  vehicleType: string;
  stopPairs: AdminStopPairReqDto[];
}

export interface AdminScheduleSetDto {
  id: number;
  startDate?: string;
  endDate?: string;
  departureTimes: string[];
  frequency?: string;
  status?: string | AdminStatusDto;
  createdAt?: string;
  updatedAt?: string;
  route?: AdminRouteDto;
  vehicleType?: AdminVehicleTypeDto;
}

export interface AdminDriverInfoDto {
  id?: number;
  fullName?: string;
  phoneNumber?: string;
}

export interface AdminScheduleDto {
  id: number;
  scheduleSetId?: number | null;
  departureDateTime?: string;
  status?: string | AdminStatusDto;
  createdAt?: string;
  updatedAt?: string;
  route?: AdminRouteDto;
  vehicle?: AdminVehicleDto;
  vehicleType?: AdminVehicleTypeDto;
  driver?: AdminDriverInfoDto;
  /** Overridden seating capacity; null means use vehicleType.totalSeats as the effective value. */
  seatingCapacity?: number | null;
}

export interface AdminPersonDto {
  name?: string;
  fullName?: string;
}

export interface AdminBookingStopDto {
  code?: string;
  slug?: string;
  display?: AdminTranslationCollection;
  translations?: AdminTranslationCollection;
}

export interface AdminBookingScheduleDto {
  fromStop?: AdminBookingStopDto;
  toStop?: AdminBookingStopDto;
  departureDateTime?: string;
  arrivalDateTime?: string;
}

export interface AdminBookingJourneyDto {
  fromStop?: AdminBookingStopDto;
  toStop?: AdminBookingStopDto;
  departureDateTime?: string;
  arrivalDateTime?: string;
}

export interface AdminPriceSummaryDto {
  basePrice?: string;
  discount?: string;
  fee?: string;
  netAmount?: string;
  currency?: string;
}

export interface AdminBookingDto {
  id: number;
  bookingNumber?: string;
  totalAmount?: number | string;
  status?: string | AdminStatusDto;
  createdAt?: string;
  contact?: AdminPersonDto;
  actor?: AdminPersonDto;
  bookingSchedules?: AdminBookingScheduleDto[];
  journeys?: AdminBookingJourneyDto[];
  pricing?: AdminPriceSummaryDto;
  payment?: AdminPaymentSummaryDto;
}

export interface AdminPaymentSummaryDto {
  overallPaymentStatus?: string;
  totalAmount?: string;
  paidAmount?: string;
  outstandingAmount?: string;
  refundedAmount?: string;
  currency?: string;
  status?: string;
}

export interface AdminPaymentByBookingIdDto {
  bookingId: number;
  paymentSummary?: AdminPaymentSummaryDto;
  transactions?: AdminPaymentTransactionDto[];
}

export interface AdminPaymentTransactionDto {
  transactionId?: string;
  paymentMethod?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  gatewayResponse?: string;
  paidAt?: string;
  remark?: string;
}

export function getAdminTranslationLabel(
  translations: AdminTranslationCollection | null | undefined,
  locale?: string
): string | null {
  const translation = getAdminTranslation(translations, locale);
  return translation?.label ?? null;
}

export function getAdminTranslationDescription(
  translations: AdminTranslationCollection | null | undefined,
  locale?: string
): string | null {
  const translation = getAdminTranslation(translations, locale);
  return translation?.description ?? null;
}

export function parseAdminStatus(
  value: string | AdminStatusDto | null | undefined,
  locale?: string
): { code: string; name: string } {
  if (typeof value === 'string') {
    const code = value.trim().toLowerCase();
    return {
      code,
      name: code.replace(/_/g, ' ').toUpperCase(),
    };
  }

  const code = String(value?.code ?? value?.slug ?? 'unknown').trim().toLowerCase();
  const fallbackName = code.replace(/_/g, ' ').toUpperCase();
  const localizedLabel =
    getAdminTranslationLabel(value?.display, locale) ??
    getAdminTranslationLabel(value?.display, 'en') ??
    getAdminTranslationLabel(value?.translations, locale) ??
    getAdminTranslationLabel(value?.translations, 'en');

  return {
    code,
    name: String(value?.name ?? value?.label ?? localizedLabel ?? fallbackName),
  };
}

export function getAdminLookupCode(
  value: { code?: string; slug?: string } | null | undefined
): string {
  return String(value?.slug ?? value?.code ?? '').trim();
}

export function getAdminLookupLabel(
  value:
    | {
        code?: string;
        slug?: string;
        display?: AdminTranslationCollection;
        translations?: AdminTranslationCollection;
        name?: string;
        label?: string;
      }
    | null
    | undefined,
  locale?: string
): string | null {
  const fallbackCode = getAdminLookupCode(value);

  return (
    value?.name ??
    value?.label ??
    getAdminTranslationLabel(value?.display, locale) ??
    getAdminTranslationLabel(value?.display, 'en') ??
    getAdminTranslationLabel(value?.translations, locale) ??
    getAdminTranslationLabel(value?.translations, 'en') ??
    (fallbackCode || null)
  );
}

function getAdminTranslation(
  translations: AdminTranslationCollection | null | undefined,
  locale?: string
): AdminTranslationDto | null {
  if (!translations) {
    return null;
  }

  if (Array.isArray(translations)) {
    if (translations.length === 0) {
      return null;
    }

    if (locale) {
      const translation = translations.find(
        (item) => item.locale?.toLowerCase() === locale.toLowerCase()
      );

      if (translation?.label || translation?.description) {
        return translation;
      }
    }

    return translations.find((item) => item.label || item.description) ?? null;
  }

  const normalizedLocale = locale?.toLowerCase();
  if (normalizedLocale) {
    const translation = translations[normalizedLocale];
    if (translation?.label || translation?.description) {
      return translation;
    }
  }

  const fallbackTranslation = Object.values(translations).find(
    (translation) => translation?.label || translation?.description
  );
  return fallbackTranslation ?? null;
}

export interface CreateLookupPayload {
  category: string;
  slug: string;
  translations: AdminTranslationReqDto[];
}

export interface CreateRolePayload {
  slug: string;
  status: string;
  translations: AdminTranslationReqDto[];
}

export interface CreateUserPayload {
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  preferredLocale: string;
  status: string;
  roles: string[];
  pdpaConsent: boolean;
}

export interface UpdateUserPayload {
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  isPhoneNumberVerify: boolean;
  preferredLocale: string;
  status: string;
  roles: string[];
}

export interface CreateVehiclePayload {
  vehicleType: string;
  numberPlate: string;
  vehicleNumber: string;
  status: string;
}

export interface CreateRoutePayload {
  slug: string;
  status: string;
  translations: AdminTranslationReqDto[];
}

export interface CreateScheduleSetPayload {
  startDate: string;
  endDate: string;
  departureTimes: string[];
  frequency?: string;
  status: string;
  route: string;
  vehicleType: string;
}

export interface CreateSchedulePayload {
  departureDateTime: string;
  route: string;
  vehicleType: string;
  vehicleId?: number;
  driverId?: number;
}

export interface UpdateSchedulePayload {
  route: string;
  vehicleType: string;
  vehicleId: number | null;
  driverId: number | null;
  departureDateTime: string;
  seatingCapacity: number | null;
}

export interface DriverDto {
  id: number;
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class AdminApiService {
  private readonly baseUrl = `${environment.apiUrl}/api`;

  constructor(private readonly http: HttpClient) {}

  private createAdminContext(): HttpContext {
    return new HttpContext()
      .set(SKIP_GLOBAL_LOADING_ALERT, true)
      .set(SKIP_GLOBAL_ERROR_ALERT, true);
  }

  private toRequestOptions(
    params?: HttpParams
  ): { context: HttpContext; params?: HttpParams } {
    const context = this.createAdminContext();
    return params ? { context, params } : { context };
  }

  private getRequest<T>(
    url: string,
    params?: HttpParams
  ): Observable<ResponseAPI<T>> {
    return this.http.get<ResponseAPI<T>>(url, this.toRequestOptions(params));
  }

  private postRequest<T>(url: string, payload: unknown): Observable<ResponseAPI<T>> {
    return this.http.post<ResponseAPI<T>>(url, payload, this.toRequestOptions());
  }

  private putRequest<T>(url: string, payload: unknown): Observable<ResponseAPI<T>> {
    return this.http.put<ResponseAPI<T>>(url, payload, this.toRequestOptions());
  }

  private deleteRequest<T>(url: string): Observable<ResponseAPI<T>> {
    return this.http.delete<ResponseAPI<T>>(url, this.toRequestOptions());
  }

  getLookups(): Observable<ResponseAPI<AdminLookupDto[]>> {
    return this.getRequest<AdminLookupDto[]>(`${this.baseUrl}/private/lookups`);
  }

  createLookup(payload: CreateLookupPayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/lookups`, payload);
  }

  updateLookup(
    category: string,
    slug: string,
    payload: CreateLookupPayload
  ): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/lookups/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`,
      payload
    );
  }

  deleteLookup(category: string, slug: string): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(
      `${this.baseUrl}/private/lookups/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`
    );
  }

  getRoles(): Observable<ResponseAPI<AdminRoleDto[]>> {
    return this.getRequest<AdminRoleDto[]>(`${this.baseUrl}/private/roles`);
  }

  getRoleById(id: number): Observable<ResponseAPI<AdminRoleDto>> {
    return this.getRequest<AdminRoleDto>(`${this.baseUrl}/private/roles/${id}`);
  }

  createRole(payload: CreateRolePayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/roles`, payload);
  }

  updateRoleById(id: number, payload: CreateRolePayload): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/roles/${id}`,
      payload
    );
  }

  deleteRoleById(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/roles/${id}`);
  }

  getUsers(
    filters?: Record<string, string | number | boolean>
  ): Observable<ResponseAPI<AdminUserDto[]>> {
    let params = new HttpParams();
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        params = params.set(key, String(value));
      }
    }

    return this.getRequest<AdminUserDto[]>(`${this.baseUrl}/private/users`, params);
  }

  getUserById(id: number): Observable<ResponseAPI<AdminUserDto>> {
    return this.getRequest<AdminUserDto>(`${this.baseUrl}/private/users/${id}`);
  }

  // NOTE: The backend no longer exposes a username duplicate-check endpoint
  // (the user model is email-based and has no username field). Emit "not taken"
  // without an HTTP call so existing callers keep working.
  checkUserExistsByUsername(_username: string): Observable<ResponseAPI<boolean>> {
    return of({ code: 200, message: 'OK', data: false });
  }

  checkUserExistsByEmail(email: string): Observable<ResponseAPI<boolean>> {
    return this.getRequest<boolean>(
      `${this.baseUrl}/users/check-duplicate/email/${encodeURIComponent(email)}`
    );
  }

  checkUserExistsByPhoneNumber(phoneNumber: string): Observable<ResponseAPI<boolean>> {
    return this.getRequest<boolean>(
      `${this.baseUrl}/users/check-duplicate/phoneNumber/${encodeURIComponent(phoneNumber)}`
    );
  }

  createUser(payload: CreateUserPayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/users`, payload);
  }

  updateUser(id: number, payload: UpdateUserPayload): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/users/${id}`, payload);
  }

  deleteUser(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/users/${id}`);
  }

  getVehicles(): Observable<ResponseAPI<AdminVehicleDto[]>> {
    return this.getRequest<AdminVehicleDto[]>(`${this.baseUrl}/private/vehicles`);
  }

  getVehicleById(id: number): Observable<ResponseAPI<AdminVehicleDto>> {
    return this.getRequest<AdminVehicleDto>(`${this.baseUrl}/private/vehicles/${id}`);
  }

  createVehicle(payload: CreateVehiclePayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/vehicles`, payload);
  }

  updateVehicle(id: number, payload: CreateVehiclePayload): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/vehicles/${id}`, payload);
  }

  deleteVehicle(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/vehicles/${id}`);
  }

  getVehicleTypes(): Observable<ResponseAPI<AdminVehicleTypeDto[]>> {
    return this.getRequest<AdminVehicleTypeDto[]>(`${this.baseUrl}/private/vehicle-types`);
  }

  getVehicleTypeById(id: number): Observable<ResponseAPI<AdminVehicleTypeDto>> {
    return this.getRequest<AdminVehicleTypeDto>(`${this.baseUrl}/private/vehicle-types/${id}`);
  }

  getRoutes(): Observable<ResponseAPI<AdminRouteDto[]>> {
    return this.getRequest<AdminRouteDto[]>(`${this.baseUrl}/routes`);
  }

  getRouteById(id: number): Observable<ResponseAPI<AdminRouteDto>> {
    return this.getRequest<AdminRouteDto>(
      `${this.baseUrl}/private/routes/${id}`
    );
  }

  createRoute(payload: CreateRoutePayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/routes`, payload);
  }

  updateRouteById(id: number, payload: CreateRoutePayload): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/routes/${id}`,
      payload
    );
  }

  deleteRouteById(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(
      `${this.baseUrl}/private/routes/${id}`
    );
  }

  getRouteStops(routeSlug: string): Observable<ResponseAPI<AdminRouteStopDto>> {
    return this.getRequest<AdminRouteStopDto>(
      `${this.baseUrl}/private/route-stops/${routeSlug}`
    );
  }

  getSegments(routeSlug: string): Observable<ResponseAPI<AdminSegmentDto>> {
    return this.getRequest<AdminSegmentDto>(
      `${this.baseUrl}/private/segments/${routeSlug}`
    );
  }

  updateSegments(payload: AdminSegmentReqDto): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/segments`, payload);
  }

  getScheduleSets(): Observable<ResponseAPI<AdminScheduleSetDto[]>> {
    return this.getRequest<AdminScheduleSetDto[]>(`${this.baseUrl}/private/schedule-set`);
  }

  getSchedules(): Observable<ResponseAPI<AdminScheduleDto[]>> {
    return this.getRequest<AdminScheduleDto[]>(`${this.baseUrl}/private/schedules`);
  }

  getScheduleById(id: number): Observable<ResponseAPI<AdminScheduleDto>> {
    return this.getRequest<AdminScheduleDto>(`${this.baseUrl}/private/schedules/${id}`);
  }

  getScheduleSetById(id: number): Observable<ResponseAPI<AdminScheduleSetDto>> {
    return this.getRequest<AdminScheduleSetDto>(
      `${this.baseUrl}/private/schedule-set/${id}`
    );
  }

  createScheduleSet(payload: CreateScheduleSetPayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/schedule-set`, payload);
  }

  createSchedule(payload: CreateSchedulePayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/schedules`, payload);
  }

  updateSchedule(
    id: number,
    payload: CreateSchedulePayload | UpdateSchedulePayload
  ): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/schedules/${id}`, payload);
  }

  updateScheduleSet(
    id: number,
    payload: CreateScheduleSetPayload
  ): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/schedule-set/${id}`,
      payload
    );
  }

  deleteScheduleSet(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/schedule-set/${id}`);
  }

  deleteSchedule(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/schedules/${id}`);
  }

  generateSchedulesFromSet(id: number): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(
      `${this.baseUrl}/private/schedule-set/${id}/generate-schedules`,
      {}
    );
  }

  // TODO: implement server-side pagination in the admin UI; size=100 silently caps results
  getBookings(): Observable<ResponseAPI<PageResponse<AdminBookingDto>>> {
    const params = new HttpParams().set('page', '0').set('size', '100');
    return this.getRequest<PageResponse<AdminBookingDto>>(
      `${this.baseUrl}/private/admin/bookings`,
      params
    );
  }

  getBookingPayments(
    bookingId: number
  ): Observable<ResponseAPI<AdminPaymentByBookingIdDto>> {
    return this.getRequest<AdminPaymentByBookingIdDto>(
      `${this.baseUrl}/private/bookings/${bookingId}/payments`
    );
  }

  getPendingManualRefunds(
    page = 0,
    size = 20
  ): Observable<ResponseAPI<PageResponse<PendingRefund>>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size);

    return this.getRequest<PageResponse<PendingRefund>>(
      `${this.baseUrl}/private/payments/refunds/pending`,
      params
    );
  }

  refundPayment(paymentId: number): Observable<ResponseAPI<PaymentResponse>> {
    return this.postRequest<PaymentResponse>(
      `${this.baseUrl}/private/payments/${paymentId}/refund`,
      {}
    );
  }
}
