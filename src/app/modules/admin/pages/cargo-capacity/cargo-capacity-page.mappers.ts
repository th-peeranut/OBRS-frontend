import {
  AdminVehicleTypeDto,
  getAdminLookupLabel,
  getAdminTranslationLabel,
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
