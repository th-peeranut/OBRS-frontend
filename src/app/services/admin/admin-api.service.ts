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
  // OBRS-182: real last-login timestamp (set by the backend on successful
  // authentication), distinct from updatedAt/createdAt which only reflect the
  // record's last edit. Null/absent = the user has never signed in.
  lastLoginAt?: string | null;
  roles: Array<string | AdminRoleDto>;
  locked?: boolean;
  accountLockedUntil?: string | null;
  // OBRS-193: salesperson's assigned pickup stop (stop slug), used by the staff
  // walk-in sell page to default the pickup selection. Null/absent = no assigned
  // sales point (falls back to route origin, same as before this field existed).
  salesPointStop?: string | null;
}

/** A single seat on a vehicle type's seat map, as the backend actually returns it
 * (record `LayoutResponse`: `seatNumber`, `rowIndex`, `columnIndex`). There is no
 * seat-map-TEMPLATE entity on the backend — this is one seat's position, the same
 * record shape `ChangeSeatAvailabilityRespDto` exposes under the field name `seats`. */
export interface LayoutResponse {
  seatNumber: string;
  rowIndex: number;
  columnIndex: number;
}

export interface AdminVehicleTypeDto {
  id: number;
  slug: string;
  code?: string;
  totalSeats?: number;
  status?: string | AdminStatusDto;
  display?: AdminTranslationCollection;
  translations?: AdminTranslationCollection;
  /** The vehicle type's individual seats — only present on the vehicle-type
   * detail endpoint. Each entry is one physical seat (`seatNumber`,
   * `rowIndex`, `columnIndex`); there is no seat-map-template entity to pick
   * from (OBRS-517 removed the FE control that once assumed one existed). */
  seatMaps?: LayoutResponse[];
  /** OBRS-508: parcel cargo quota for this vehicle type, in kg. `null` = not
   * configured — effective capacity falls back to the per-schedule override
   * only; if BOTH are null, parcel booking is refused
   * (409 PARCEL_CARGO_CAPACITY_NOT_CONFIGURED). */
  cargoCapacityKg?: number | null;
}

/** OBRS-508: `PATCH /vehicle-types/{id}/cargo-capacity` request body — the
 * ONLY field this endpoint accepts. Replaces an earlier full-replace-PUT
 * design (which required forwarding every vehicle-type field to avoid
 * wiping the seat map/translations); the backend now exposes this narrow
 * PATCH instead, so the hazard doesn't apply here. */
export interface UpdateVehicleTypeCargoCapacityPayload {
  cargoCapacityKg: number | null;
}

export interface AdminVehicleDto {
  id: number;
  numberPlate?: string;
  vehicleNumber?: string;
  status?: string | AdminStatusDto;
  vehicleType?: AdminVehicleTypeDto;
  createdAt?: string;
  updatedAt?: string;
  /** OBRS-316 Gap 1: vehicle detail attributes, all optional/nullable on the backend. */
  brand?: string | null;
  model?: string | null;
  manufactureYear?: number | null;
  colour?: string | null;
  engineCc?: number | null;
  chassisNumber?: string | null;
  note?: string | null;
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

/** OBRS-312: `GET /api/private/vehicles/{vehicleId}/inspections` list-row
 * shape (owner/admin read-only history), newest first. `pendingMaintenance`
 * drives the row's pending-review indicator and the default 2-week filter —
 * see `vehicle-inspection.mappers.ts`. */
export interface VehicleInspectionListItemDto {
  id: number;
  inspectedAt: string;
  inspectedByName: string;
  odometerKm: number;
  defectCount: number;
  pendingMaintenance: boolean;
}

/** OBRS-312: one checklist row in `GET
 * /api/private/vehicles/{vehicleId}/inspections/{id}`, ordered by
 * `displayOrder`. `itemLabelSnapshot` is the label AS INSPECTED (immutable
 * history) — distinct from `VehicleInspectionItemDto.label`, which reflects
 * the master list's CURRENT label and may have since changed/been retired. */
export interface VehicleInspectionDetailItemDto {
  itemId: number;
  itemLabelSnapshot: string;
  verdict: 'ok' | 'needs_repair';
  note: string;
}

/** OBRS-312: `GET /api/private/vehicles/{vehicleId}/inspections/{id}` —
 * the list-row header fields plus the ordered checklist. */
export interface VehicleInspectionDetailDto extends VehicleInspectionListItemDto {
  items: VehicleInspectionDetailItemDto[];
}

/** OBRS-509: one locale row on the inspection-item master list's admin
 * editor (`GET /manage`, POST/PUT request+response) — distinct from the
 * driver-facing `VehicleInspectionDetailItemDto` above (which carries a
 * single locale-resolved `itemLabelSnapshot`, not raw per-locale rows). */
export interface AdminInspectionItemTranslationDto {
  locale: string;
  label: string;
  description?: string | null;
}

/** OBRS-509: one row of the vehicle-inspection checklist MASTER LIST, as
 * seen by the owner/admin editor (`GET /manage`) — distinct from
 * `getVehicleInspections()`/`getVehicleInspectionById()` above, which are the
 * per-vehicle inspection HISTORY (read-only). `id` is a JSON **number**
 * (BIGSERIAL), never a string (the OBRS-376 defect). `translations` always
 * carries all 3 locale rows, sorted en/th/zh by the backend mapper. */
export interface AdminInspectionItemDto {
  id: number;
  code: string;
  displayOrder: number;
  active: boolean;
  translations: AdminInspectionItemTranslationDto[];
}

/** OBRS-509: POST/PUT request body — identical shape for create and edit
 * (SPEC §3.3/§3.4). `displayOrder` is deliberately NOT a field here — it is
 * server-owned, assigned `max+1` on create and mutated only via `/reorder`.
 * OBRS-529: `code` is now optional — the backend generates it server-side on
 * create, so the FE omits it entirely there (nothing to send: there is no
 * form field for it anymore); an edit still forwards the item's existing,
 * unchanged code. */
export interface InspectionItemPayload {
  code?: string;
  active: boolean;
  translations: AdminInspectionItemTranslationDto[];
}

/** OBRS-509: `PUT /vehicle-inspection-items/reorder` request body — the
 * WHOLE table, every row including retired ones (display_order is unique
 * table-wide, SPEC §3.5). */
export interface InspectionItemReorderReqDto {
  items: { id: number; displayOrder: number }[];
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
  /** OBRS-272: set once staff marks the trip delayed via
   * `PATCH /api/private/schedules/{id}/delay` — `status` STAYS `scheduled`;
   * "delayed" is a derived UI state off these two fields, never a status code
   * (see `BoardingListComponent.isScheduleDelayed`). `null`/absent = not delayed. */
  delayedDepartureDateTime?: string | null;
  delayReason?: string | null;
  // OBRS-283: whether this trip can still be hard-DELETEd (no booking history
  // referencing it). `false` means the delete button must instead soft-cancel
  // via `POST /schedules/{id}/cancel` — see shared/lib/schedule-delete-mode.ts.
  // Optional/undefined on a cached row predating this field, or on a Schedule
  // Set row (a different endpoint/DTO — sets never carry this field).
  deletable?: boolean;
  /** OBRS-283: count of CONFIRMED bookings affected by cancelling this trip
   * (drives the refund vs. no-refund confirm-dialog copy). */
  confirmedBookingCount?: number;
  /** OBRS-508: per-trip cargo quota override, in kg. `null`/absent = inherit
   * from `vehicleType.cargoCapacityKg`. */
  cargoCapacityKg?: number | null;
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

// OBRS-280: GET /api/private/bookings/{id} (admin booking detail dialog).
// Shape verified against the live backend record types (not guessed):
// `BookingDetailResponse.java` + its nested `business`/`business.localized`
// records. Booking/ticket `status`, `bookingType`, `passengerType`, and the
// journey `fromStop`/`toStop` all come back as `{code, label}`
// (`LocalizedResponse` implementations) — structurally a subset of the
// existing `AdminStatusDto`, so they're typed with it here rather than a new
// interface (reuses `parseAdminStatus`/`getAdminLookupLabel` too).
export interface AdminBookingTicketDto {
  id?: number;
  ticketNumber?: string;
  passengerType?: AdminStatusDto;
  passengerName?: string;
  seatNumber?: string;
  // Ticket status is included for EVERY ticket on the booking, including
  // CANCELLED/REFUNDED legs — the detail dialog must not filter them out.
  status?: string | AdminStatusDto;
}

export interface AdminBookingDetailJourneyDto {
  legType?: AdminStatusDto;
  fromStop?: AdminStatusDto;
  toStop?: AdminStatusDto;
  departureDateTime?: string;
  arrivalDateTime?: string;
  tickets?: AdminBookingTicketDto[];
}

export interface AdminBookingActorDetailDto {
  id?: number;
  name?: string;
  type?: string;
  channel?: string;
  officeName?: string;
}

export interface AdminBookingContactDetailDto {
  fullName?: string;
  phoneNumber?: string;
}

export interface AdminBookingDetailDto {
  id: number;
  bookingNumber?: string;
  bookingType?: AdminStatusDto;
  status?: string | AdminStatusDto;
  createdAt?: string;
  expiredAt?: string;
  actor?: AdminBookingActorDetailDto;
  contact?: AdminBookingContactDetailDto;
  journeys?: AdminBookingDetailJourneyDto[];
  // Reuses the existing list-endpoint DTOs — `PriceSummaryResponse`/
  // `PaymentSummaryResponse` on the backend match these field-for-field.
  pricing?: AdminPriceSummaryDto;
  payment?: AdminPaymentSummaryDto;
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

// OBRS-316 Gap 1: PUT /api/private/vehicles/{id} is a full-replace, so the form
// MUST send all 7 attribute fields on every submit (create AND edit) — they are
// non-optional KEYS here (always serialized), even though each value is nullable.
export interface CreateVehiclePayload {
  vehicleType: string;
  numberPlate: string;
  vehicleNumber: string;
  status: string;
  brand: string | null;
  model: string | null;
  manufactureYear: number | null;
  colour: string | null;
  engineCc: number | null;
  chassisNumber: string | null;
  note: string | null;
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
  // OBRS-508: POST and PUT /api/private/schedules share one backend
  // ScheduleReqDto shape (docs/api/scheduling.md), so the per-trip cargo
  // override is valid on create too. Optional/omittable, unlike
  // UpdateSchedulePayload's required field below — a brand-new schedule with
  // no override simply doesn't send the key (null-equivalent on the backend).
  cargoCapacityKg?: number | null;
}

export interface UpdateSchedulePayload {
  route: string;
  vehicleType: string;
  vehicleId: number | null;
  driverId: number | null;
  departureDateTime: string;
  seatingCapacity: number | null;
  /** OBRS-508: per-trip cargo quota override, in kg. `null` = inherit from
   * the vehicle type's own cargoCapacityKg. */
  cargoCapacityKg: number | null;
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

// OBRS-358: jump-seat (walk-in-only seat channel) toggle, a singleton row —
// same shape/lifecycle as ReminderConfigDto above — GET/PUT
// `/api/private/admin/configs/jump-seat`, ADMIN-only. Disabling blocks staff
// from selling the jump seat entirely (even when normal seats are full); has
// no effect on the online channel, which never offers it.
export interface JumpSeatConfigDto {
  enabled: boolean;
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

  // OBRS-312: owner/admin read-only inspection history — no create/update/delete,
  // inspections are immutable and only drivers create them (StaffApiService).
  getVehicleInspections(
    vehicleId: number
  ): Observable<ResponseAPI<VehicleInspectionListItemDto[]>> {
    return this.getRequest<VehicleInspectionListItemDto[]>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/inspections`
    );
  }

  getVehicleInspectionById(
    vehicleId: number,
    id: number
  ): Observable<ResponseAPI<VehicleInspectionDetailDto>> {
    return this.getRequest<VehicleInspectionDetailDto>(
      `${this.baseUrl}/private/vehicles/${vehicleId}/inspections/${id}`
    );
  }

  // OBRS-509: owner-facing admin CRUD for the vehicle-inspection checklist
  // MASTER LIST — distinct from getVehicleInspections()/getVehicleInspectionById()
  // above (per-vehicle inspection HISTORY, read-only). `/manage` returns every
  // row (active + retired, SPEC §3.2); the plain `GET` (staff-api.service.ts,
  // UNTOUCHED by this card) stays the driver form's own locale-resolved feed.
  getInspectionItemsForManage(): Observable<ResponseAPI<AdminInspectionItemDto[]>> {
    return this.getRequest<AdminInspectionItemDto[]>(
      `${this.baseUrl}/private/vehicle-inspection-items/manage`
    );
  }

  createInspectionItem(
    payload: InspectionItemPayload
  ): Observable<ResponseAPI<AdminInspectionItemDto>> {
    return this.postRequest<AdminInspectionItemDto>(
      `${this.baseUrl}/private/vehicle-inspection-items`,
      payload
    );
  }

  updateInspectionItem(
    id: number,
    payload: InspectionItemPayload
  ): Observable<ResponseAPI<AdminInspectionItemDto>> {
    return this.putRequest<AdminInspectionItemDto>(
      `${this.baseUrl}/private/vehicle-inspection-items/${id}`,
      payload
    );
  }

  // OBRS-509: full-list reorder — `/reorder` is a literal path competing with
  // `PUT /{id}` in the same backend controller; Spring's PathPattern
  // comparator ranks the literal segment above the template, so this never
  // reaches updateInspectionItem's {id} handler (SPEC §3.5).
  reorderInspectionItems(
    payload: InspectionItemReorderReqDto
  ): Observable<ResponseAPI<AdminInspectionItemDto[]>> {
    return this.putRequest<AdminInspectionItemDto[]>(
      `${this.baseUrl}/private/vehicle-inspection-items/reorder`,
      payload
    );
  }

  getVehicleTypes(): Observable<ResponseAPI<AdminVehicleTypeDto[]>> {
    return this.getRequest<AdminVehicleTypeDto[]>(`${this.baseUrl}/private/vehicle-types`);
  }

  getVehicleTypeById(id: number): Observable<ResponseAPI<AdminVehicleTypeDto>> {
    return this.getRequest<AdminVehicleTypeDto>(`${this.baseUrl}/private/vehicle-types/${id}`);
  }

  // OBRS-508: OWNER-only (ADMIN inherits via the backend's ROLE_ADMIN >
  // ROLE_OWNER hierarchy) narrow update touching ONLY cargo_capacity_kg —
  // replaces the earlier full-replace PUT design; the response echoes back
  // the untouched seatMaps/translations/slug/totalSeats/status alongside the
  // newly-saved cargoCapacityKg, so the caller can patch its row from the
  // response directly with no separate re-fetch.
  updateVehicleTypeCargoCapacity(
    id: number,
    payload: UpdateVehicleTypeCargoCapacityPayload
  ): Observable<ResponseAPI<AdminVehicleTypeDto>> {
    return this.patchRequest<AdminVehicleTypeDto>(
      `${this.baseUrl}/private/vehicle-types/${id}/cargo-capacity`,
      payload
    );
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

  // OBRS-280: read-only admin booking detail dialog. Same base path as
  // getBookingPayments above (NOT the list endpoint's `/private/admin/bookings`).
  getBookingById(bookingId: number): Observable<ResponseAPI<AdminBookingDetailDto>> {
    return this.getRequest<AdminBookingDetailDto>(
      `${this.baseUrl}/private/bookings/${bookingId}`
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

  // OBRS-378: status is the tab filter (?status=), sort is a multi-valued
  // sort param (e.g. ['createdAt,asc','id,asc'] — see sortForStatus()).
  // HttpParams.append is used per sort entry (NOT .set), which would
  // collapse the two into one param and drop the id tiebreak.
  // OBRS-403: page/size added, mirroring getPendingManualRefunds() above —
  // always sent so the request is deterministic rather than relying on the
  // backend's @PageableDefault.
  getUsabilityReports(
    status?: UsabilityReportStatus,
    sort?: string[],
    page = 0,
    size = 20
  ): Observable<ResponseAPI<UsabilityReportPage>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) {
      params = params.set('status', status);
    }
    for (const s of sort ?? []) {
      params = params.append('sort', s);
    }
    return this.getRequest<UsabilityReportPage>(
      `${this.baseUrl}/private/admin/usability-reports`,
      params
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

  // Backs the admin sidebar's usability-report nav badge — reuses the
  // existing list endpoint with size=1 so only the pagination envelope
  // (data.totalElements) is needed, not the report rows themselves.
  // OBRS-378: parameterized by status — owner's badge counts 'new' (awaiting
  // screening), admin's counts 'accepted' (owner-vetted) — see
  // AdminLayoutComponent.badgeStatus.
  getUsabilityReportCountByStatus(status: UsabilityReportStatus): Observable<number> {
    const params = new HttpParams()
      .set('status', status)
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

  // OBRS-376: mark a report as a duplicate of `canonicalId`. Admin-only —
  // returns the updated report detail (duplicateOfId/duplicateCount included).
  // Un-marking is NOT a separate endpoint: it reuses updateUsabilityReportStatus
  // above with status 'in_review' (the backend clears the link server-side).
  markUsabilityReportAsDuplicate(
    id: string,
    canonicalId: number
  ): Observable<ResponseAPI<UsabilityReportDetail>> {
    return this.patchRequest<UsabilityReportDetail>(
      `${this.baseUrl}/private/admin/usability-reports/${id}/duplicate-of`,
      { canonicalId }
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

  // OBRS-358: jump-seat toggle is a singleton row (mirrors reminder-config
  // above), ADMIN-only (403 for non-admin per the backend contract).
  getJumpSeatConfig(): Observable<ResponseAPI<JumpSeatConfigDto>> {
    return this.getRequest<JumpSeatConfigDto>(`${this.baseUrl}/private/admin/configs/jump-seat`);
  }

  updateJumpSeatConfig(
    payload: JumpSeatConfigDto
  ): Observable<ResponseAPI<JumpSeatConfigDto>> {
    return this.putRequest<JumpSeatConfigDto>(
      `${this.baseUrl}/private/admin/configs/jump-seat`,
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
