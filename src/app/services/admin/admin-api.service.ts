import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ResponseAPI } from '../../shared/interfaces/response.interface';
import { Observable } from 'rxjs';
import {
  SKIP_GLOBAL_ERROR_ALERT,
  SKIP_GLOBAL_LOADING_ALERT,
} from '../../shared/interceptors/http-context-tokens';

export interface AdminTranslationDto {
  locale?: string;
  label?: string;
  description?: string;
}

export interface AdminTranslationReqDto {
  locale: string;
  label: string;
  description?: string;
}

export interface AdminStatusDto {
  code?: string;
  name?: string;
}

export interface AdminLookupDto {
  id: number;
  category: string;
  slug: string;
  translations: AdminTranslationDto[];
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
  translations?: AdminTranslationDto[];
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

export interface AdminVehicleTypeDto {
  id: number;
  slug: string;
  translations: AdminTranslationDto[];
}

export interface AdminVehicleDto {
  id: number;
  numberPlate?: string;
  vehicleNumber?: string;
  status?: string;
  vehicleType?: AdminVehicleTypeDto;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminRouteDto {
  id: number;
  slug: string;
  status?: string;
  translations: AdminTranslationDto[];
}

export interface AdminStopDto {
  id: number;
  slug: string;
  translations: AdminTranslationDto[];
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
}

export interface AdminSegmentDto {
  route?: AdminNewTranslationDto;
  stopPairs: AdminStopPairDto[];
}

export interface AdminStopPairReqDto {
  fromStop: string;
  toStop: string;
  fare: number;
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
  status?: string;
  route?: AdminRouteDto;
  vehicleType?: AdminVehicleTypeDto;
}

export interface AdminPersonDto {
  fullName?: string;
}

export interface AdminBookingStopDto {
  slug?: string;
  translations: AdminTranslationDto[];
}

export interface AdminBookingScheduleDto {
  fromStop?: AdminBookingStopDto;
  toStop?: AdminBookingStopDto;
}

export interface AdminBookingDto {
  id: number;
  bookingNumber?: string;
  totalAmount?: number | string;
  status?: string;
  createdAt?: string;
  contact?: AdminPersonDto;
  actor?: AdminPersonDto;
  bookingSchedules?: AdminBookingScheduleDto[];
}

export interface AdminPaymentSummaryDto {
  overallPaymentStatus?: string;
}

export interface AdminPaymentByBookingIdDto {
  bookingId: number;
  paymentSummary?: AdminPaymentSummaryDto;
}

export interface CreateLookupPayload {
  category: string;
  slug: string;
  translations: AdminTranslationReqDto[];
}

export interface CreateRolePayload {
  slug?: string;
  translations: AdminTranslationReqDto[];
}

export interface CreateUserPayload {
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  username: string;
  password: string;
  isPhoneNumberVerify: boolean;
  preferredLocale: string;
  status: string;
  roles: string[];
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

  getRoleBySlug(slug: string): Observable<ResponseAPI<AdminRoleDto>> {
    return this.getRequest<AdminRoleDto>(
      `${this.baseUrl}/private/roles/${encodeURIComponent(slug)}`
    );
  }

  getRoleById(id: number): Observable<ResponseAPI<AdminRoleDto>> {
    return this.getRequest<AdminRoleDto>(`${this.baseUrl}/private/roles/id/${id}`);
  }

  createRole(payload: CreateRolePayload): Observable<ResponseAPI<unknown>> {
    return this.postRequest<unknown>(`${this.baseUrl}/private/roles`, payload);
  }

  updateRole(slug: string, payload: CreateRolePayload): Observable<ResponseAPI<unknown>> {
    return this.putRequest<unknown>(
      `${this.baseUrl}/private/roles/${encodeURIComponent(slug)}`,
      payload
    );
  }

  deleteRole(slug: string): Observable<ResponseAPI<unknown>> {
    return this.deleteRequest<unknown>(`${this.baseUrl}/private/roles/${encodeURIComponent(slug)}`);
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

  checkUserExistsByUsername(username: string): Observable<ResponseAPI<boolean>> {
    return this.getRequest<boolean>(
      `${this.baseUrl}/users/check-duplicate/username/${encodeURIComponent(username)}`
    );
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

  getRoutes(): Observable<ResponseAPI<AdminRouteDto[]>> {
    return this.getRequest<AdminRouteDto[]>(`${this.baseUrl}/routes`);
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

  getBookings(): Observable<ResponseAPI<AdminBookingDto[]>> {
    return this.getRequest<AdminBookingDto[]>(`${this.baseUrl}/private/bookings`);
  }

  getBookingPayments(
    bookingId: number
  ): Observable<ResponseAPI<AdminPaymentByBookingIdDto>> {
    return this.getRequest<AdminPaymentByBookingIdDto>(
      `${this.baseUrl}/private/bookings/${bookingId}/payments`
    );
  }
}
