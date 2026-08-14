import {
  AdminLookupDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
  CreateVehiclePayload,
  DriverDto,
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
  /** DISPLAY value — `'-'` when the server sent nothing. Table/label use only. */
  vehicleNumber: string;
  /** DISPLAY value — `'-'` when the server sent nothing. Table/label use only. */
  plate: string;
  // OBRS-842: the two fields above have already been through the `'-'` display
  // placeholder, and `'-'` is a perfectly valid string as far as a form control,
  // `Validators.required` and the backend are concerned. Seeding the edit form
  // from them therefore WROTE the placeholder into `vehicles.vehicle_number` as
  // a real value (and, being UNIQUE, it would then 409 the next vehicle that hit
  // the same path) — silently, with the admin never having typed anything. The
  // two raw fields below are what the edit form must read; keep the split.
  rawVehicleNumber: string | null;
  rawPlate: string | null;
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
    rawVehicleNumber: vehicle.vehicleNumber ?? null,
    rawPlate: vehicle.numberPlate ?? null,
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

// OBRS-842: reads the RAW row fields, never the `'-'`-placeholdered display ones.
// This DTO exists purely to seed the edit form on the synchronous open, so a
// placeholder leaking in here lands in a form control and then in the database —
// `?? undefined` (not `?? '-'`) keeps a genuinely absent value absent, which is
// what buildVehicleFormValues' `??` chain below is written to expect.
export function toVehicleDtoFallback(vehicle: VehicleRow): AdminVehicleDto {
  return {
    id: vehicle.id,
    numberPlate: vehicle.rawPlate ?? undefined,
    vehicleNumber: vehicle.rawVehicleNumber ?? undefined,
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
    // OBRS-842: fall back to the RAW row values, not the display ones — see the
    // VehicleRow comment. A vehicle with no หมายเลขพาหนะ (a retired one, V58) must
    // reach the form as '' so the admin sees an empty field, not a literal '-'
    // that Validators.required happily accepts and PUT then makes permanent.
    numberPlate: String(vehicleDetail.numberPlate ?? vehicle.rawPlate ?? '').trim(),
    vehicleNumber: String(vehicleDetail.vehicleNumber ?? vehicle.rawVehicleNumber ?? '').trim(),
    status: parseAdminStatus(vehicleDetail.status ?? vehicle.statusCode, locale).code,
    // OBRS-316 Gap 1: the row fallback (toVehicleDtoFallback) has none of these 7
    // fields, so on the immediate open they read as blank until the real GET
    // detail patches them in (see initEditForm's R1 fetch-fail guard).
    brand: vehicleDetail.brand ?? '',
    model: vehicleDetail.model ?? '',
    manufactureYear: vehicleDetail.manufactureYear ?? null,
    colour: vehicleDetail.colour ?? '',
    engineCc: vehicleDetail.engineCc ?? null,
    chassisNumber: vehicleDetail.chassisNumber ?? '',
    note: vehicleDetail.note ?? '',
    // OBRS-835: detail-only, and deliberately WITHOUT a row fallback — the fleet list
    // does not carry gps_imei at all (the backend's toDetailDto is the only projection
    // that does), so there is no row value that could stand in. On the synchronous open
    // this reads blank; the modal blocks Save until the real detail arrives
    // (isEditDetailError), which is what stops a blank here from going back to the
    // server as "detach the box".
    gpsImei: vehicleDetail.gpsImei ?? '',
    // OBRS-1332: detail-only and without a row fallback, for the same reason as gpsImei
    // above. '' rather than null so the select shows its placeholder — the payload mapper
    // turns it back into null, which is what UNASSIGN means on the wire.
    assignedDriverId: vehicleDetail.assignedDriverId != null ? String(vehicleDetail.assignedDriverId) : '',
  };
}

export function toVehiclePayload(rawFormValue: Record<string, unknown>): CreateVehiclePayload {
  return {
    vehicleType: String(rawFormValue['vehicleType'] ?? '').trim().toLowerCase(),
    numberPlate: String(rawFormValue['numberPlate'] ?? '').trim(),
    // OBRS-842: null, NOT ''. The backend sets vehicle_number unconditionally from
    // this field (VehicleDtoService#applyTo), so '' would be stored as a real empty
    // string — and `vehicles.vehicle_number` is UNIQUE, so the SECOND retired
    // vehicle saved that way would 409 with nothing on screen to explain why.
    vehicleNumber: nullableTrimmedString(rawFormValue['vehicleNumber']),
    status: String(rawFormValue['status'] ?? '').trim().toLowerCase(),
    // OBRS-316 Gap 1: PUT is full-replace, so all 7 are always sent (create AND
    // edit) — blank strings/empty numbers normalize to `null`, never dropped.
    // Deliberately NOT .toLowerCase()'d (unlike vehicleType/status slugs above) —
    // brand/model/colour/chassisNumber/note are free-text display values, not
    // lookup codes.
    brand: nullableTrimmedString(rawFormValue['brand']),
    model: nullableTrimmedString(rawFormValue['model']),
    manufactureYear: nullableNumber(rawFormValue['manufactureYear']),
    colour: nullableTrimmedString(rawFormValue['colour']),
    engineCc: nullableNumber(rawFormValue['engineCc']),
    chassisNumber: nullableTrimmedString(rawFormValue['chassisNumber']),
    note: nullableTrimmedString(rawFormValue['note']),
    // OBRS-835: `null`, never `''` — `vehicles.gps_imei` is UNIQUE, so a literal empty
    // string would be a real value that the SECOND vehicle cleared this way collides
    // with (the OBRS-842 shape, one column over). Always PRESENT in the payload: on the
    // backend an absent key means "leave the box alone", which is the right default for
    // a curl or a fixture but the wrong one for a form the admin just emptied on purpose.
    gpsImei: nullableTrimmedString(rawFormValue['gpsImei']),
    // OBRS-1332: always PRESENT, and `null` when the owner cleared the select — on the
    // backend an absent key means "leave the assignment alone", which is right for a curl
    // and wrong for a form the owner just emptied on purpose.
    assignedDriverId: nullableNumber(rawFormValue['assignedDriverId']),
  };
}

function nullableTrimmedString(rawValue: unknown): string | null {
  const trimmed = String(rawValue ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableNumber(rawValue: unknown): number | null {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return null;
  }

  const numericValue = Number(rawValue);
  return Number.isNaN(numericValue) ? null : numericValue;
}

/** OBRS-1332: the assigned-driver picker's options. `/private/users/drivers` is already
 * confined to the `driver` role by the backend, so there is nothing to filter here — same
 * shape and same reasoning as `staff-schedules-page.mappers.ts`'s `toDriverOptions`, kept
 * separate only because these two modules share no mapper file. */
export function toDriverOptions(drivers: DriverDto[]): Option[] {
  return drivers.map((driver) => ({
    code: String(driver.id),
    label: driver.name?.trim() || `#${driver.id}`,
  }));
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
