import {
  AdminVehicleTypeDto,
  UpdateVehicleTypePayload,
  getAdminLookupLabel,
  getAdminTranslationLabel,
  parseAdminStatus,
  toAdminTranslationReqDtoArray,
} from '../../../../services/admin/admin-api.service';

// Pure mappers/formatters extracted from CargoCapacityPageComponent (OBRS-508),
// mirroring vehicles-page.mappers.ts / schedules.mappers.ts's split of
// locale-dependent view logic away from the component.

export interface CargoCapacityRow {
  id: number;
  vehicleTypeLabel: string;
  totalSeats: number | null;
  cargoCapacityKg: number | null;
}

export function toCargoCapacityRow(
  vehicleType: AdminVehicleTypeDto,
  locale: string
): CargoCapacityRow {
  return {
    id: vehicleType.id,
    vehicleTypeLabel:
      getAdminLookupLabel(vehicleType, locale) ??
      getAdminTranslationLabel(vehicleType.translations, locale) ??
      vehicleType.slug,
    totalSeats: vehicleType.totalSeats ?? null,
    cargoCapacityKg: vehicleType.cargoCapacityKg ?? null,
  };
}

export function toCargoCapacityRows(
  vehicleTypes: AdminVehicleTypeDto[],
  locale: string
): CargoCapacityRow[] {
  return vehicleTypes.map((vehicleType) => toCargoCapacityRow(vehicleType, locale));
}

/** `null`/undefined renders as an empty input (never "0" or "null" text). */
export function formatCargoCapacityInputValue(cargoCapacityKg: number | null | undefined): string {
  return cargoCapacityKg === null || cargoCapacityKg === undefined ? '' : String(cargoCapacityKg);
}

// The backend's real VehicleTypeDetailResponse.seatMaps entry shape
// (docs/api/catalog.md: "seatMaps (List<LayoutResponse> — each with
// seatNumber, rowIndex, columnIndex)"). AdminVehicleTypeDto.seatMaps is typed
// as the UNRELATED `LayoutResponse` interface (`{id, name, label}`) because
// staff/walk-in-center-panel already reads this same field that way (as a
// seat-map-template picker's options) — a pre-existing FE type mismatch this
// card does not touch. Read the real fields defensively via a local cast
// instead of widening that shared contract.
interface RawVehicleTypeSeatEntry {
  seatNumber?: string;
  rowIndex?: number;
  columnIndex?: number;
}

/**
 * Builds the full-replace `PUT /vehicle-types/{id}` payload from a freshly
 * fetched detail (`getVehicleTypeById`), changing ONLY `cargoCapacityKg`.
 * The backend replaces the whole entity from this body — every other field
 * on `detail` must be carried forward unchanged, or an admin saving a cargo
 * quota silently wipes the vehicle type's seat map/translations (OBRS-508
 * hazard). Callers must NOT build this from a list row — only from the
 * detail endpoint's response.
 */
export function toUpdateVehicleTypePayload(
  detail: AdminVehicleTypeDto,
  cargoCapacityKg: number | null
): UpdateVehicleTypePayload {
  const seatEntries = (detail.seatMaps ?? []) as unknown as RawVehicleTypeSeatEntry[];

  return {
    slug: detail.slug,
    status: parseAdminStatus(detail.status).code,
    totalSeat: detail.totalSeats ?? 0,
    translations: toAdminTranslationReqDtoArray(detail.translations),
    seats: seatEntries.map((seat) => ({
      seatNumber: String(seat.seatNumber ?? ''),
      rowIndex: Number(seat.rowIndex ?? 0),
      columnIndex: Number(seat.columnIndex ?? 0),
    })),
    cargoCapacityKg,
  };
}
