import {
  AdminLookupDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
  CreateVehiclePayload,
  getAdminLookupLabel,
  getAdminTranslationLabel,
  parseAdminStatus,
} from '../../../../services/admin/admin-api.service';

// Pure mappers/formatters/normalizers extracted from VehiclesPageComponent
// (OBRS-244, mirroring OBRS-208's routes.mappers.ts, OBRS-214's
// schedules.mappers.ts, OBRS-232's user-management.mappers.ts, OBRS-237's
// role-management.mappers.ts and OBRS-241's promotions-page.mappers.ts). No
// Angular/service dependencies — every locale-dependent or
// translation-dependent value the original private methods pulled off `this`
// is now an explicit parameter, so these stay unit-testable in isolation.
//
// getCurrentLocale() itself is NOT extracted here — it stays private on the
// component. It short-circuits
// `translate.currentLang || translate.getDefaultLang() || 'th'`; eagerly
// resolving getDefaultLang() as a plain parameter would be a real behavior
// change (and breaks createTranslateStub(), which has no getDefaultLang).
// Only its already-resolved `locale` string is threaded into these mappers.

export interface VehicleRow {
  id: number;
  vehicleTypeSlug: string;
  statusCode: string;
  vehicleNumber: string;
  plate: string;
  vehicleType: string;
  route: string;
  status: string;
}

export interface Option {
  code: string;
  label: string;
}

export function statusClass(status: string): string {
  const normalizedStatus = status.toUpperCase();

  if (
    normalizedStatus === 'ACTIVE' ||
    normalizedStatus === 'ONLINE' ||
    normalizedStatus === 'AVAILABLE'
  ) {
    return 'is-success';
  }

  if (normalizedStatus === 'PENDING') {
    return 'is-warning';
  }

  return 'is-danger';
}

export function toVehicleRow(vehicle: AdminVehicleDto, locale: string): VehicleRow {
  const status = parseAdminStatus(vehicle.status, locale);

  return {
    id: vehicle.id,
    vehicleTypeSlug: vehicle.vehicleType?.slug ?? '',
    statusCode: status.code,
    vehicleNumber: vehicle.vehicleNumber ?? '-',
    plate: vehicle.numberPlate ?? '-',
    vehicleType:
      getAdminLookupLabel(vehicle.vehicleType, locale) ??
      getAdminTranslationLabel(vehicle.vehicleType?.translations, locale) ??
      getAdminTranslationLabel(vehicle.vehicleType?.translations, 'en') ??
      vehicle.vehicleType?.slug ??
      '-',
    route: '-',
    status: status.name,
  };
}

export function toVehicleDtoFallback(vehicle: VehicleRow): AdminVehicleDto {
  return {
    id: vehicle.id,
    numberPlate: vehicle.plate,
    vehicleNumber: vehicle.vehicleNumber,
    status: vehicle.statusCode,
    vehicleType: { id: 0, slug: vehicle.vehicleTypeSlug },
  };
}

// The pure value-derivation half of the original applyVehicleFormValues:
// builds the form `values` record from the fetched detail (falling back to
// the already-known row). The onlyPristine-vs-reset branching stays in the
// component since it mutates the live FormGroup.
export function buildVehicleFormValues(
  vehicleDetail: AdminVehicleDto,
  vehicle: VehicleRow,
  locale: string
): Record<string, unknown> {
  return {
    vehicleType: String(vehicleDetail.vehicleType?.slug ?? vehicle.vehicleTypeSlug).trim(),
    numberPlate: String(vehicleDetail.numberPlate ?? vehicle.plate).trim(),
    vehicleNumber: String(vehicleDetail.vehicleNumber ?? vehicle.vehicleNumber).trim(),
    status: parseAdminStatus(vehicleDetail.status ?? vehicle.statusCode, locale).code,
  };
}

export function toVehiclePayload(rawFormValue: Record<string, unknown>): CreateVehiclePayload {
  return {
    vehicleType: String(rawFormValue['vehicleType'] ?? '').trim().toLowerCase(),
    numberPlate: String(rawFormValue['numberPlate'] ?? '').trim(),
    vehicleNumber: String(rawFormValue['vehicleNumber'] ?? '').trim(),
    status: String(rawFormValue['status'] ?? '').trim().toLowerCase(),
  };
}

export function toVehicleTypeOptions(
  vehicleTypes: AdminVehicleTypeDto[],
  locale: string
): Option[] {
  return vehicleTypes.map((type) => ({
    code: type.slug,
    label:
      getAdminTranslationLabel(type.translations, locale) ??
      getAdminTranslationLabel(type.translations, 'en') ??
      type.slug,
  }));
}

export function toVehicleStatusOptions(lookups: AdminLookupDto[], locale: string): Option[] {
  return lookups
    .filter((lookup) => lookup.category === 'vehicle_status')
    .map((lookup) => ({
      code: lookup.slug,
      label:
        getAdminTranslationLabel(lookup.translations, locale) ??
        getAdminTranslationLabel(lookup.translations, 'en') ??
        lookup.slug,
    }));
}

// OBRS-209: raw Lookup rows (not pre-mapped to Option[]) — the maintenance
// panel derives its own localized labels, mirroring how toVehicleStatusOptions
// above derives statusOptions.
export function filterMaintenanceStatusLookups(lookups: AdminLookupDto[]): AdminLookupDto[] {
  return lookups.filter((lookup) => lookup.category === 'maintenance_status');
}

export function filterVehiclesByStatus(vehicles: VehicleRow[], statusFilter: string): VehicleRow[] {
  return vehicles.filter((vehicle) => {
    if (statusFilter.length === 0) {
      return true;
    }

    return vehicle.statusCode.trim().toLowerCase() === statusFilter;
  });
}

export function isVehicleStatusFilterStale(
  statusFilter: string,
  statusOptions: Option[]
): boolean {
  return (
    statusFilter.length > 0 &&
    !statusOptions.some((option) => option.code.trim().toLowerCase() === statusFilter)
  );
}
