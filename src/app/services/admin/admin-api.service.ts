import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';
import {
  PageResponse,
  PaymentResponse,
  PendingRefund,
} from '../../shared/interfaces/payment.interface';
import {
  UsabilityReportDetail,
  UsabilityReportPage,
  UsabilityReportStatus,
} from '../../shared/interfaces/usability-report.interface';
import { ReportsSummaryDto } from '../../shared/interfaces/reports-summary.interface';
import { EodSalesReportDto } from '../../shared/interfaces/eod-sales-report.interface';
import { RefundVoidReportDto } from '../../shared/interfaces/refund-void-report.interface';
import { CashOnlineReconciliationReportDto } from '../../shared/interfaces/cash-online-reconciliation-report.interface';
import { DashboardTodayDto } from '../../shared/interfaces/dashboard-today.interface';
import {
  SettlementPendingPageDto,
  SettlementScheduleDetailDto,
} from '../../shared/interfaces/settlement.interface';

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
  locked?: boolean;
  accountLockedUntil?: string | null;
  // OBRS-193: salesperson's assigned pickup stop (stop slug), used by the staff
  // walk-in sell page to default the pickup selection. Null/absent = no assigned
  // sales point (falls back to route origin, same as before this field existed).
  salesPointStop?: string | null;
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

/** OBRS-209: a single vehicle-maintenance record (backend OBRS-102).
 * `maintenanceStatus` is a flat `maintenance_status` Lookup **slug string**
 * (e.g. "scheduled"), NOT a Lookup object — mirrors `AdminVehicleDto.status`'s
 * plain-string shape, confirmed against the live `VehicleMaintenanceRespDto`. */
export interface AdminVehicleMaintenanceDto {
  id: number;
  vehicleId: number;
  reason: string;
  startDate: string;
  endDate?: string | null;
  nextDueDate?: string | null;
  maintenanceStatus: string;
  notes?: string | null;
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
  // OBRS-283: whether this trip can still be hard-DELETEd (no booking history
  // referencing it). `false` means the delete button must instead soft-cancel
  // via `POST /schedules/{id}/cancel` — see shared/lib/schedule-delete-mode.ts.
  // Optional/undefined on a cached row predating this field, or on a Schedule
  // Set row (a different endpoint/DTO — sets never carry this field).
  deletable?: boolean;
  /** OBRS-283: count of CONFIRMED bookings affected by cancelling this trip
   * (drives the refund vs. no-refund confirm-dialog copy). */
  confirmedBookingCount?: number;
}

// OBRS-283: response of POST /api/private/schedules/{id}/cancel (soft-cancel —
// flips status to CANCELLED; affected CONFIRMED bookings are refunded async).
export interface CancelScheduleRespDto {
  scheduleId: number;
  status: string;
  affectedBookingCount: number;
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

/** OBRS-209: create/update payload for a vehicle-maintenance record.
 * `maintenanceStatus` is the `maintenance_status` Lookup's **slug string**
 * (e.g. "scheduled") — same shape as `CreateVehiclePayload.status`, matching
 * the live backend `VehicleMaintenanceReqDto` (`@NotBlank String maintenanceStatus`). */
export interface CreateVehicleMaintenancePayload {
  reason: string;
  startDate: string;
  endDate?: string | null;
  nextDueDate?: string | null;
  maintenanceStatus: string;
  notes?: string | null;
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

// OBRS-85: round-trip discount promotion (a singleton config row, slug
// 'round_trip'). Amount fields come back as BigDecimal on the backend, which
// Jackson can serialize as either a JSON number or a numeric string depending
// on config — typed as `number | string` like AdminBookingDto.totalAmount, and
// coerced with Number(...) by the consuming page.
export interface PromotionRespDto {
  id: number;
  slug?: string;
  code?: string;
  discountType?: string | AdminStatusDto;
  status?: string | AdminStatusDto;
  discountValue?: number | string;
  // OBRS-109 (#37): full CRUD adds these — always present on the general
  // list/detail endpoints, but optional here since the round-trip singleton
  // endpoint (OBRS-85) predates them and this DTO is shared by both.
  maxDiscountAmount?: number | string | null;
  minBookingAmount?: number | string;
  startDateTime?: string | null;
  endDateTime?: string | null;
  usageLimit?: number | null;
  currentUsage?: number;
  autoApply?: boolean;
  translations?: AdminTranslationCollection;
}

// OBRS-109 (#37): full-replace payload for the general promotion CRUD
// endpoints (distinct from UpdateRoundTripPromotionPayload's partial PATCH
// contract, which stays scoped to the round-trip singleton row).
export interface PromotionReqDto {
  slug: string;
  code: string;
  discountType: string;
  discountValue: number;
  maxDiscountAmount?: number | null;
  minBookingAmount?: number | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
  usageLimit?: number | null;
  status: string;
  autoApply: boolean;
  translations: AdminTranslationReqDto[];
}

// Partial payload — the promotions page only sends fields the admin actually
// changed (design-system.md: don't overwrite fields the user didn't touch).
// NOTE: the backend's RoundTripPromotionReqDto reads `active: boolean`, NOT a
// `status` string — Spring silently drops unknown fields, so this must match
// the wire contract exactly, even though PromotionRespDto (and the store) use
// `status`. The page translates active<->status at its edges.
export interface UpdateRoundTripPromotionPayload {
  discountValue?: number;
  active?: boolean;
  startDateTime?: string | null;
  endDateTime?: string | null;
  minBookingAmount?: number;
}

// OBRS-223: reminder-timing config, a singleton row (like the round-trip
// promotion above) — GET/PUT `/api/private/admin/configs/reminders`, shipped
// backend-only by OBRS-139. Both fields are required positive integers on
// the wire; the backend evicts its cache after PUT (no FE cache concern).
export interface ReminderConfigDto {
  reminderHoursBeforeDeparture: number;
  boardingReminderMinutesBeforeDeparture: number;
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

  private patchRequest<T>(url: string, payload: unknown): Observable<ResponseAPI<T>> {
    return this.http.patch<ResponseAPI<T>>(url, payload, this.toRequestOptions());
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

  unlockUser(id: number): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/users/${id}/unlock`, {});
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

  // OBRS-209: vehicle maintenance records (backend OBRS-102). No hard delete —
  // a record is closed via updateVehicleMaintenance() with maintenanceStatus
  // set to the "completed" Lookup slug.
  getVehicleMaintenance(vehicleId: number): Observable<ResponseAPI<AdminVehicleMaintenanceDto[]>> {
    return this.getRequest<AdminVehicleMaintenanceDto[]>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/maintenance`
    );
  }

  getVehicleMaintenanceById(
    vehicleId: number,
    id: number
  ): Observable<ResponseAPI<AdminVehicleMaintenanceDto>> {
    return this.getRequest<AdminVehicleMaintenanceDto>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/maintenance/${id}`
    );
  }

  createVehicleMaintenance(
    vehicleId: number,
    payload: CreateVehicleMaintenancePayload
  ): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/maintenance`,
      payload
    );
  }

  updateVehicleMaintenance(
    vehicleId: number,
    id: number,
    payload: CreateVehicleMaintenancePayload
  ): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/maintenance/${id}`,
      payload
    );
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

  // OBRS-283: soft-cancel — used instead of deleteSchedule() when the row's
  // `deletable` field is `false` (see shared/lib/schedule-delete-mode.ts).
  cancelSchedule(id: number): Observable<ResponseAPI<CancelScheduleRespDto>> {
    return this.postRequest<CancelScheduleRespDto>(
      `${this.baseUrl}/private/schedules/${id}/cancel`,
      {}
    );
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

  getUsabilityReports(): Observable<ResponseAPI<UsabilityReportPage>> {
    return this.getRequest<UsabilityReportPage>(
      `${this.baseUrl}/private/admin/usability-reports`
    );
  }

  getReportsSummary(from: string, to: string): Observable<ResponseAPI<ReportsSummaryDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<ReportsSummaryDto>(
      `${this.baseUrl}/private/admin/reports/summary`,
      params
    );
  }

  getDashboardToday(): Observable<ResponseAPI<DashboardTodayDto>> {
    return this.getRequest<DashboardTodayDto>(`${this.baseUrl}/private/admin/dashboard/today`);
  }

  // OBRS-196: per-round revenue settlement + owner cash-handover sign-off.
  // Base path is `/api/private/settlements` — NO `/admin/` segment
  // (`EndpointConstant.PRIVATE_SETTLEMENTS`, confirmed against the landed
  // backend commit 037cdb1 / docs/api/settlements.md). `SettlementController`
  // is `@PreAuthorize("hasRole('OWNER')")`; ADMIN inherits via the backend's
  // ROLE_ADMIN > ROLE_OWNER hierarchy and additionally bypasses scoping.
  getSettlementsPending(
    from: string,
    to: string
  ): Observable<ResponseAPI<SettlementPendingPageDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<SettlementPendingPageDto>(
      `${this.baseUrl}/private/settlements/pending`,
      params
    );
  }

  // End-of-day Sales Report by Salesperson (OBRS-97/OBRS-231): single-day, staff-sold-only
  // (walk_in/agent/kiosk) revenue by salesperson. See ../OBRS-backend/docs/api/reports.md.
  getEodSalesReport(date: string): Observable<ResponseAPI<EodSalesReportDto>> {
    const params = new HttpParams().set('date', date);
    return this.getRequest<EodSalesReportDto>(
      `${this.baseUrl}/private/admin/reports/eod-salesperson`,
      params
    );
  }

  // OBRS-98: refund / void summary report — mirrors getReportsSummary's [from, to]
  // HttpParams shape.
  getRefundVoidReport(from: string, to: string): Observable<ResponseAPI<RefundVoidReportDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<RefundVoidReportDto>(
      `${this.baseUrl}/private/admin/reports/refund-void`,
      params
    );
  }

  getCashOnlineReconciliationReport(
    from: string,
    to: string
  ): Observable<ResponseAPI<CashOnlineReconciliationReportDto>> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.getRequest<CashOnlineReconciliationReportDto>(
      `${this.baseUrl}/private/admin/reports/cash-online-reconciliation`,
      params
    );
  }

  getSettlementSchedule(id: number): Observable<ResponseAPI<SettlementScheduleDetailDto>> {
    return this.getRequest<SettlementScheduleDetailDto>(
      `${this.baseUrl}/private/settlements/schedules/${id}`
    );
  }

  confirmSettlement(
    id: number,
    acknowledgedTotalAmount?: string
  ): Observable<ResponseAPI<SettlementScheduleDetailDto>> {
    const payload = acknowledgedTotalAmount !== undefined ? { acknowledgedTotalAmount } : {};
    return this.postRequest<SettlementScheduleDetailDto>(
      `${this.baseUrl}/private/settlements/schedules/${id}/confirm`,
      payload
    );
  }

  // Backs the admin sidebar's "Usability Reports" nav badge — reuses the
  // existing list endpoint with size=1 so only the pagination envelope
  // (data.totalElements) is needed, not the report rows themselves.
  getNewUsabilityReportCount(): Observable<number> {
    const params = new HttpParams()
      .set('status', 'new')
      .set('size', '1')
      .set('page', '0');

    return this.getRequest<UsabilityReportPage>(
      `${this.baseUrl}/private/admin/usability-reports`,
      params
    ).pipe(map((response) => response.data?.totalElements ?? 0));
  }

  getUsabilityReportById(id: string): Observable<ResponseAPI<UsabilityReportDetail>> {
    return this.getRequest<UsabilityReportDetail>(
      `${this.baseUrl}/private/admin/usability-reports/${id}`
    );
  }

  updateUsabilityReportStatus(
    id: string,
    status: UsabilityReportStatus,
    triageNote: string | null
  ): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/admin/usability-reports/${id}/status`,
      { status, triageNote }
    );
  }

  // OBRS-85: the round-trip promotion is a singleton config row (slug
  // 'round_trip'), so there is no {id} in the path.
  getRoundTripPromotion(): Observable<ResponseAPI<PromotionRespDto>> {
    return this.getRequest<PromotionRespDto>(`${this.baseUrl}/private/admin/promotions/round-trip`);
  }

  updateRoundTripPromotion(
    payload: UpdateRoundTripPromotionPayload
  ): Observable<ResponseAPI<unknown>> {
    return this.patchRequest<unknown>(
      `${this.baseUrl}/private/admin/promotions/round-trip`,
      payload
    );
  }

  // OBRS-223: reminder-timing config is a singleton row (like the round-trip
  // promotion above), ADMIN-only (403 for non-admin per the backend contract).
  getReminderConfig(): Observable<ResponseAPI<ReminderConfigDto>> {
    return this.getRequest<ReminderConfigDto>(`${this.baseUrl}/private/admin/configs/reminders`);
  }

  updateReminderConfig(
    payload: ReminderConfigDto
  ): Observable<ResponseAPI<ReminderConfigDto>> {
    return this.putRequest<ReminderConfigDto>(
      `${this.baseUrl}/private/admin/configs/reminders`,
      payload
    );
  }

  // OBRS-109 (#37): full promotion CRUD across every promotion row (the
  // round-trip singleton above is a separate, narrower endpoint and is left
  // untouched). Contract not yet documented in OBRS-backend/docs/api — built
  // against the SA-locked shape and flagged in docs/handoff.md, same pattern
  // used for the round-trip endpoints in OBRS-85 before they landed.
  getPromotions(): Observable<ResponseAPI<PromotionRespDto[]>> {
    return this.getRequest<PromotionRespDto[]>(`${this.baseUrl}/private/admin/promotions`);
  }

  getPromotionById(id: number): Observable<ResponseAPI<PromotionRespDto>> {
    return this.getRequest<PromotionRespDto>(`${this.baseUrl}/private/admin/promotions/${id}`);
  }

  createPromotion(payload: PromotionReqDto): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/admin/promotions`, payload);
  }

  updatePromotion(id: number, payload: PromotionReqDto): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(`${this.baseUrl}/private/admin/promotions/${id}`, payload);
  }

  deletePromotion(id: number): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/admin/promotions/${id}`);
  }
}
