import {
  Option,
  VehicleRow,
  buildVehicleFormValues,
  filterMaintenanceStatusLookups,
  filterVehiclesByStatus,
  isVehicleStatusFilterStale,
  statusClass,
  toVehicleDtoFallback,
  toDateControlValue,
  toDateInputValue,
  toVehiclePayload,
  toVehicleRow,
  toVehicleStatusOptions,
  toVehicleTypeOptions,
} from './vehicles-page.mappers';
import {
  AdminLookupDto,
  AdminVehicleDto,
  AdminVehicleTypeDto,
} from '../../../../services/admin/admin-api.service';

describe('vehicles-page.mappers', () => {
  describe('statusClass', () => {
    it('maps ACTIVE/ONLINE/AVAILABLE (case-insensitively) to is-success', () => {
      expect(statusClass('active')).toBe('is-success');
      expect(statusClass('ONLINE')).toBe('is-success');
      expect(statusClass('available')).toBe('is-success');
      expect(statusClass('Active')).toBe('is-success');
    });

    it('maps PENDING to is-warning', () => {
      expect(statusClass('pending')).toBe('is-warning');
      expect(statusClass('PENDING')).toBe('is-warning');
    });

    it('falls back to is-danger for anything else', () => {
      expect(statusClass('inactive')).toBe('is-danger');
      expect(statusClass('unknown')).toBe('is-danger');
      expect(statusClass('')).toBe('is-danger');
    });
  });

  describe('toVehicleRow', () => {
    const base: AdminVehicleDto = {
      id: 1,
      numberPlate: 'ABC-123',
      vehicleNumber: 'V1',
      status: 'active',
      vehicleType: { id: 2, slug: 'van', translations: [{ locale: 'en', label: 'Van' }] },
    };

    it('maps id/plate/vehicleNumber/status straight through, with no date formatting applied', () => {
      const row = toVehicleRow(base, 'en');
      expect(row.id).toBe(1);
      expect(row.plate).toBe('ABC-123');
      expect(row.vehicleNumber).toBe('V1');
      expect(row.statusCode).toBe('active');
      expect(row.status).toBe('ACTIVE');
      expect(row.route).toBe('-');
    });

    it('defaults plate/vehicleNumber to "-" when missing', () => {
      const sparse: AdminVehicleDto = { id: 5, status: 'active' };
      const row = toVehicleRow(sparse, 'en');
      expect(row.plate).toBe('-');
      expect(row.vehicleNumber).toBe('-');
      expect(row.vehicleTypeSlug).toBe('');
      expect(row.vehicleType).toBe('-');
    });

    // OBRS-842: the '-' above is a DISPLAY placeholder. The raw fields must keep
    // "the server sent nothing" distinguishable from "the server sent a dash",
    // because everything that edits a vehicle reads them instead.
    it('keeps the raw server values null when absent, alongside the "-" display values', () => {
      const sparse: AdminVehicleDto = { id: 5, status: 'active' };
      const row = toVehicleRow(sparse, 'en');
      expect(row.rawVehicleNumber).toBeNull();
      expect(row.rawPlate).toBeNull();
    });

    it('passes real server values through to the raw fields unchanged', () => {
      const row = toVehicleRow(base, 'en');
      expect(row.rawVehicleNumber).toBe('V1');
      expect(row.rawPlate).toBe('ABC-123');
    });

    it('resolves vehicleTypeSlug from vehicleType.slug', () => {
      expect(toVehicleRow(base, 'en').vehicleTypeSlug).toBe('van');
    });

    it('prefers getAdminLookupLabel (name/label/display) over translations for vehicleType label', () => {
      const withName: AdminVehicleDto = {
        ...base,
        vehicleType: { id: 2, slug: 'van', name: 'Van (named)', translations: [{ locale: 'en', label: 'Van (translated)' }] } as any,
      };
      expect(toVehicleRow(withName, 'en').vehicleType).toBe('Van (named)');
    });

    it('falls back to translations label, then en, then slug, then "-"', () => {
      expect(toVehicleRow(base, 'en').vehicleType).toBe('Van');
      const noEnTranslation: AdminVehicleDto = {
        ...base,
        vehicleType: { id: 2, slug: 'van', translations: [{ locale: 'th', label: 'รถตู้' }] },
      };
      expect(toVehicleRow(noEnTranslation, 'th').vehicleType).toBe('รถตู้');

      const noVehicleType: AdminVehicleDto = { id: 5, status: 'active' };
      expect(toVehicleRow(noVehicleType, 'en').vehicleType).toBe('-');
    });
  });

  // OBRS-842: a retired vehicle with no หมายเลขพาหนะ, exactly as the table hands it
  // to the edit modal — display fields already placeholdered, raw fields truthful.
  const RETIRED_ROW: VehicleRow = {
    id: 14,
    vehicleTypeSlug: 'minibus',
    statusCode: 'retired',
    vehicleNumber: '-',
    plate: '16-8829',
    rawVehicleNumber: null,
    rawPlate: '16-8829',
    vehicleType: 'Minibus',
    route: '-',
    status: 'RETIRED',
  };

  describe('toVehicleDtoFallback', () => {
    it('maps a VehicleRow back into an AdminVehicleDto shape', () => {
      const row: VehicleRow = {
        id: 1,
        vehicleTypeSlug: 'van',
        statusCode: 'active',
        vehicleNumber: 'V1',
        plate: 'ABC-123',
        rawVehicleNumber: 'V1',
        rawPlate: 'ABC-123',
        vehicleType: 'Van',
        route: '-',
        status: 'ACTIVE',
      };

      expect(toVehicleDtoFallback(row)).toEqual({
        id: 1,
        numberPlate: 'ABC-123',
        vehicleNumber: 'V1',
        status: 'active',
        vehicleType: { id: 0, slug: 'van' },
      });
    });

    // OBRS-842 regression: this fallback seeds the edit form on the synchronous
    // open. Reading the display field here put a literal '-' into the DTO, which
    // then short-circuited buildVehicleFormValues' `??` chain and reached the
    // form control — the first link in the corruption path.
    it('carries the ABSENT vehicle number through as undefined, never the "-" placeholder', () => {
      const dto = toVehicleDtoFallback(RETIRED_ROW);
      expect(dto.vehicleNumber).toBeUndefined();
      expect(dto.numberPlate).toBe('16-8829');
    });
  });

  describe('buildVehicleFormValues', () => {
    const row: VehicleRow = {
      id: 1,
      vehicleTypeSlug: 'van',
      statusCode: 'active',
      vehicleNumber: 'V1',
      plate: 'ABC-123',
      rawVehicleNumber: 'V1',
      rawPlate: 'ABC-123',
      vehicleType: 'Van',
      route: '-',
      status: 'ACTIVE',
    };

    it('prefers detail DTO values, falling back to the row for missing fields', () => {
      const dto: AdminVehicleDto = {
        id: 1,
        numberPlate: 'SERVER-PLATE',
      };
      const values = buildVehicleFormValues(dto, row, 'en');
      expect(values['numberPlate']).toBe('SERVER-PLATE');
      // Fields absent on the detail DTO fall back to the row.
      expect(values['vehicleType']).toBe('van');
      expect(values['vehicleNumber']).toBe('V1');
      expect(values['status']).toBe('active');
    });

    it('trims the resolved vehicleType/numberPlate/vehicleNumber', () => {
      const dto: AdminVehicleDto = {
        id: 1,
        numberPlate: '  SERVER-PLATE  ',
        vehicleNumber: '  V9  ',
        vehicleType: { id: 2, slug: '  bus  ' },
      };
      const values = buildVehicleFormValues(dto, row, 'en');
      expect(values['numberPlate']).toBe('SERVER-PLATE');
      expect(values['vehicleNumber']).toBe('V9');
      expect(values['vehicleType']).toBe('bus');
    });

    it('resolves status.code via parseAdminStatus, preferring the DTO status over the row', () => {
      const dto: AdminVehicleDto = { id: 1, status: 'inactive' };
      const values = buildVehicleFormValues(dto, row, 'en');
      expect(values['status']).toBe('inactive');
    });

    // OBRS-316 Gap 1: all 7 attribute fields echo straight from the GET detail —
    // this is what feeds the R1 pristine-patch in initEditForm, so a real value
    // returned by the server must never be dropped here.
    it('reads all 7 vehicle-attribute fields from the detail DTO', () => {
      const dto: AdminVehicleDto = {
        id: 1,
        brand: 'Toyota',
        model: 'Commuter',
        manufactureYear: 2019,
        colour: 'White',
        engineCc: 2982,
        chassisNumber: 'CH-000123',
        note: 'Rear AC unit replaced.',
      };
      const values = buildVehicleFormValues(dto, row, 'en');
      expect(values['brand']).toBe('Toyota');
      expect(values['model']).toBe('Commuter');
      expect(values['manufactureYear']).toBe(2019);
      expect(values['colour']).toBe('White');
      expect(values['engineCc']).toBe(2982);
      expect(values['chassisNumber']).toBe('CH-000123');
      expect(values['note']).toBe('Rear AC unit replaced.');
    });

    // The row fallback (toVehicleDtoFallback) never carries these 7 fields, so
    // the immediate open (before the GET detail resolves) must render them
    // blank/null rather than throwing or showing "undefined".
    it('defaults the 7 vehicle-attribute fields to blank/null when absent from the DTO', () => {
      const dto: AdminVehicleDto = { id: 1 };
      const values = buildVehicleFormValues(dto, row, 'en');
      expect(values['brand']).toBe('');
      expect(values['model']).toBe('');
      expect(values['manufactureYear']).toBeNull();
      expect(values['colour']).toBe('');
      expect(values['engineCc']).toBeNull();
      expect(values['chassisNumber']).toBe('');
      expect(values['note']).toBe('');
    });

    // ── OBRS-842: the bug itself ──────────────────────────────────────────────
    // Both call sites in initEditForm are covered: the synchronous open (row
    // fallback DTO) and the late GET-detail patch (server DTO with a null
    // vehicleNumber). Either one leaking '-' is enough to write it to the DB,
    // because PUT is a full replace and '-' satisfies Validators.required.
    it('seeds an ABSENT vehicle number as blank, not as the "-" the table displays', () => {
      const fromRowFallback = buildVehicleFormValues(
        toVehicleDtoFallback(RETIRED_ROW),
        RETIRED_ROW,
        'en'
      );
      expect(fromRowFallback['vehicleNumber']).toBe('');

      const fromServerDetail = buildVehicleFormValues(
        { id: 14, numberPlate: '16-8829', status: 'retired' },
        RETIRED_ROW,
        'en'
      );
      expect(fromServerDetail['vehicleNumber']).toBe('');
    });

    // The plate travels the identical `?? row` path one line up. It is currently
    // unreachable (vehicles.number_plate is NOT NULL, so the server always sends
    // one) — pinned anyway so the two lines cannot drift apart again.
    it('seeds an absent plate as blank too, not as "-"', () => {
      const plateless: VehicleRow = { ...RETIRED_ROW, plate: '-', rawPlate: null };
      const values = buildVehicleFormValues(
        toVehicleDtoFallback(plateless),
        plateless,
        'en'
      );
      expect(values['numberPlate']).toBe('');
    });

    // Must-NOT-fire side: a vehicle that really does hold a number still gets it.
    // Without this, "always blank" would pass the two assertions above.
    it('still seeds a vehicle number the server DID send', () => {
      const values = buildVehicleFormValues({ id: 1, vehicleNumber: '51-24' }, row, 'en');
      expect(values['vehicleNumber']).toBe('51-24');
    });

    // ── OBRS-835: the GPS IMEI ────────────────────────────────────────────────
    it('seeds the GPS IMEI from the server detail', () => {
      const values = buildVehicleFormValues(
        { id: 1, gpsImei: '860470062518406' },
        row,
        'en'
      );
      expect(values['gpsImei']).toBe('860470062518406');
    });

    /**
     * The row fallback has no IMEI to give — the fleet-list projection does not carry
     * gps_imei at all. It must read blank rather than inventing one, and the modal's
     * isEditDetailError guard is what stops that blank from ever being submitted as
     * "detach the box".
     */
    it('seeds a blank GPS IMEI from the row fallback, which never carries one', () => {
      const values = buildVehicleFormValues(toVehicleDtoFallback(row), row, 'en');
      expect(values['gpsImei']).toBe('');
    });

    it('seeds a blank GPS IMEI when the vehicle genuinely has no tracker fitted', () => {
      const values = buildVehicleFormValues({ id: 1, gpsImei: null }, row, 'en');
      expect(values['gpsImei']).toBe('');
    });

    // OBRS-885: null rather than '' — these two controls are p-datePickers, whose empty
    // value is null, and null is also what "not known" / "still in service" mean.
    it('reads the service window into the form as local calendar Dates', () => {
      const values = buildVehicleFormValues(
        { id: 1, inServiceFrom: '2024-07-05', inServiceTo: null },
        row,
        'en'
      );
      const from = values['inServiceFrom'] as Date;

      expect([from.getFullYear(), from.getMonth() + 1, from.getDate()]).toEqual([2024, 7, 5]);
      expect(values['inServiceTo']).toBeNull();
    });
  });

  describe('toVehiclePayload', () => {
    it('lowercases vehicleType/status and trims numberPlate/vehicleNumber', () => {
      const payload = toVehiclePayload({
        vehicleType: ' Van ',
        numberPlate: '  ABC-123  ',
        vehicleNumber: '  V1  ',
        status: ' Active ',
      });

      expect(payload.vehicleType).toBe('van');
      expect(payload.numberPlate).toBe('ABC-123');
      expect(payload.vehicleNumber).toBe('V1');
      expect(payload.status).toBe('active');
    });

    it('defaults missing fields to empty string', () => {
      const payload = toVehiclePayload({});
      expect(payload.vehicleType).toBe('');
      expect(payload.numberPlate).toBe('');
      expect(payload.status).toBe('');
    });

    // OBRS-842: vehicleNumber is the one field of the four that must NOT default
    // to ''. VehicleDtoService#applyTo assigns it unconditionally, so '' would be
    // stored as a real empty string in a UNIQUE column — the second retired
    // vehicle saved that way would 409 with nothing on screen to explain it.
    it('sends a blank vehicle number as null, never as an empty string', () => {
      expect(toVehiclePayload({}).vehicleNumber).toBeNull();
      expect(toVehiclePayload({ vehicleNumber: '' }).vehicleNumber).toBeNull();
      expect(toVehiclePayload({ vehicleNumber: '   ' }).vehicleNumber).toBeNull();
    });

    // OBRS-835: the GPS IMEI is the second field with the vehicleNumber problem, and a
    // worse version of it — `vehicles.gps_imei` is UNIQUE too, but a wrong value there
    // is INVISIBLE: the van simply never appears on the tracking map.
    describe('gpsImei (OBRS-835)', () => {
      it('sends a blank IMEI as null, never as an empty string', () => {
        expect(toVehiclePayload({}).gpsImei).toBeNull();
        expect(toVehiclePayload({ gpsImei: '' }).gpsImei).toBeNull();
        expect(toVehiclePayload({ gpsImei: '   ' }).gpsImei).toBeNull();
      });

      it('trims the IMEI — a stray space is a different key in a unique index', () => {
        expect(toVehiclePayload({ gpsImei: ' 860470062518406 ' }).gpsImei).toBe(
          '860470062518406'
        );
      });

      /**
       * The key must always be PRESENT, even when null. The backend reads absence as
       * "leave the box alone" (VehicleDtoService#applyTo is conditional on this one
       * field), so a dropped key would make "clear the IMEI" impossible from the form —
       * the admin would press Save on an emptied field and nothing would change.
       */
      it('always serializes the key, so an emptied field really detaches the box', () => {
        expect('gpsImei' in toVehiclePayload({})).toBe(true);
        expect('gpsImei' in toVehiclePayload({ gpsImei: '' })).toBe(true);
      });
    });

    // OBRS-1332: the third field of that shape — `assigned_driver_id`, which is also
    // conditional on the backend, so the same always-present rule applies. Wrong here,
    // and clearing the picker silently leaves the old driver attached.
    describe('assignedDriverId (OBRS-1332)', () => {
      it('sends a cleared picker as null, and always serializes the key', () => {
        expect(toVehiclePayload({}).assignedDriverId).toBeNull();
        expect(toVehiclePayload({ assignedDriverId: '' }).assignedDriverId).toBeNull();
        expect('assignedDriverId' in toVehiclePayload({})).toBe(true);
      });

      it('sends a NUMBER, not the select\'s string code', () => {
        expect(toVehiclePayload({ assignedDriverId: '55' }).assignedDriverId).toBe(55);
      });
    });

    // OBRS-885: the fourth and fifth fields of that shape — `in_service_from` /
    // `in_service_to`. Wrong here and an owner editing a colour resets the vehicle to
    // "dates unknown", which surfaces only as a P&L row changing months later.
    describe('service window (OBRS-885)', () => {
      it('sends a blanked picker as null, and always serializes both keys', () => {
        expect(toVehiclePayload({}).inServiceFrom).toBeNull();
        expect(toVehiclePayload({ inServiceFrom: null }).inServiceFrom).toBeNull();
        expect('inServiceFrom' in toVehiclePayload({})).toBe(true);
        expect('inServiceTo' in toVehiclePayload({})).toBe(true);
      });

      /**
       * The picker holds a Date; the backend takes a LocalDate. Built from the LOCAL
       * calendar parts, never toISOString(): at UTC+7 a Date parked on local midnight
       * serializes to the previous day in UTC, so every window would land one day early
       * — silently, and only on the machines that are not on UTC.
       */
      it('serializes the local calendar day, not the UTC one', () => {
        expect(toVehiclePayload({ inServiceFrom: new Date(2023, 8, 1) }).inServiceFrom).toBe(
          '2023-09-01'
        );
        expect(toVehiclePayload({ inServiceTo: new Date(2026, 5, 17) }).inServiceTo).toBe(
          '2026-06-17'
        );
      });

      it('round-trips a "YYYY-MM-DD" string through the picker and back unchanged', () => {
        expect(toDateInputValue(toDateControlValue('2024-07-05'))).toBe('2024-07-05');
      });

      it('reads an absent or malformed date as no date at all', () => {
        expect(toDateControlValue(null)).toBeNull();
        expect(toDateControlValue('')).toBeNull();
        expect(toDateControlValue('not-a-date')).toBeNull();
        expect(toDateInputValue(null)).toBe('');
        expect(toDateInputValue(new Date(NaN))).toBe('');
      });
    });

    // OBRS-316 Gap 1: PUT is a full-replace, so ALL 7 attribute keys must always
    // be serialized (create AND edit) — this is the "echo all 7, no null-drop"
    // contract the R1 guard exists to protect.
    it('serializes all 7 vehicle-attribute fields, trimmed, with blanks normalized to null', () => {
      const payload = toVehiclePayload({
        vehicleType: 'van',
        numberPlate: 'ABC-123',
        vehicleNumber: 'V1',
        status: 'active',
        brand: '  Toyota  ',
        model: '  Commuter  ',
        manufactureYear: 2019,
        colour: '  White  ',
        engineCc: 2982,
        chassisNumber: '  CH-000123  ',
        note: '  Rear AC unit replaced.  ',
      });

      expect(payload.brand).toBe('Toyota');
      expect(payload.model).toBe('Commuter');
      expect(payload.manufactureYear).toBe(2019);
      expect(payload.colour).toBe('White');
      expect(payload.engineCc).toBe(2982);
      expect(payload.chassisNumber).toBe('CH-000123');
      expect(payload.note).toBe('Rear AC unit replaced.');
    });

    it('normalizes blank/missing vehicle-attribute fields to null (not dropped, not empty string)', () => {
      const payload = toVehiclePayload({
        vehicleType: 'van',
        numberPlate: 'ABC-123',
        vehicleNumber: 'V1',
        status: 'active',
        brand: '',
        model: '   ',
        manufactureYear: null,
        colour: undefined,
        engineCc: '',
        chassisNumber: null,
        note: '',
      });

      expect(payload.brand).toBeNull();
      expect(payload.model).toBeNull();
      expect(payload.manufactureYear).toBeNull();
      expect(payload.colour).toBeNull();
      expect(payload.engineCc).toBeNull();
      expect(payload.chassisNumber).toBeNull();
      expect(payload.note).toBeNull();
    });

    // brand/model/colour/chassisNumber/note are free-text display values, not
    // lookup codes — unlike vehicleType/status above, they must NOT be
    // lowercased.
    it('does not lowercase brand/model/colour/chassisNumber/note', () => {
      const payload = toVehiclePayload({
        vehicleType: 'van',
        numberPlate: 'ABC-123',
        vehicleNumber: 'V1',
        status: 'active',
        brand: 'Toyota',
        model: 'Commuter',
        colour: 'White',
        chassisNumber: 'CH-000123',
        note: 'Rear AC Unit',
      });

      expect(payload.brand).toBe('Toyota');
      expect(payload.model).toBe('Commuter');
      expect(payload.colour).toBe('White');
      expect(payload.chassisNumber).toBe('CH-000123');
      expect(payload.note).toBe('Rear AC Unit');
    });
  });

  describe('toVehicleTypeOptions', () => {
    const vehicleTypes: AdminVehicleTypeDto[] = [
      { id: 1, slug: 'van', translations: [{ locale: 'en', label: 'Van' }, { locale: 'th', label: 'รถตู้' }] },
      { id: 2, slug: 'bus', translations: [{ locale: 'en', label: 'Bus' }] },
    ];

    it('maps slug to code and resolves the localized label, preserving order', () => {
      const options = toVehicleTypeOptions(vehicleTypes, 'en');
      expect(options).toEqual([
        { code: 'van', label: 'Van' },
        { code: 'bus', label: 'Bus' },
      ]);
    });

    it('resolves the requested locale label over en', () => {
      const options = toVehicleTypeOptions(vehicleTypes, 'th');
      expect(options[0]).toEqual({ code: 'van', label: 'รถตู้' });
    });

    it('falls back to en, then the slug, when the locale has no translation', () => {
      const options = toVehicleTypeOptions(vehicleTypes, 'th');
      // bus has no th translation -> falls back to en.
      expect(options[1]).toEqual({ code: 'bus', label: 'Bus' });

      const noTranslations: AdminVehicleTypeDto[] = [{ id: 3, slug: 'minivan', translations: [] }];
      expect(toVehicleTypeOptions(noTranslations, 'en')).toEqual([
        { code: 'minivan', label: 'minivan' },
      ]);
    });

    it('returns an empty array for an empty input', () => {
      expect(toVehicleTypeOptions([], 'en')).toEqual([]);
    });
  });

  describe('toVehicleStatusOptions', () => {
    const lookups: AdminLookupDto[] = [
      { id: 1, category: 'vehicle_status', slug: 'active', translations: [{ locale: 'en', label: 'Active' }] },
      { id: 2, category: 'vehicle_status', slug: 'pending', translations: [{ locale: 'en', label: 'Pending' }] },
      { id: 3, category: 'maintenance_status', slug: 'scheduled', translations: [{ locale: 'en', label: 'Scheduled' }] },
    ];

    it('filters to vehicle_status only, preserving order', () => {
      const options = toVehicleStatusOptions(lookups, 'en');
      expect(options).toEqual([
        { code: 'active', label: 'Active' },
        { code: 'pending', label: 'Pending' },
      ]);
    });

    it('excludes other lookup categories entirely', () => {
      const options = toVehicleStatusOptions(lookups, 'en');
      expect(options.some((option) => option.code === 'scheduled')).toBeFalse();
    });

    it('falls back to en, then the slug, when the locale has no translation', () => {
      const withoutTh: AdminLookupDto[] = [
        { id: 1, category: 'vehicle_status', slug: 'active', translations: [{ locale: 'en', label: 'Active' }] },
      ];
      expect(toVehicleStatusOptions(withoutTh, 'th')).toEqual([{ code: 'active', label: 'Active' }]);

      const noTranslations: AdminLookupDto[] = [
        { id: 1, category: 'vehicle_status', slug: 'active', translations: [] },
      ];
      expect(toVehicleStatusOptions(noTranslations, 'en')).toEqual([{ code: 'active', label: 'active' }]);
    });
  });

  describe('filterMaintenanceStatusLookups', () => {
    const lookups: AdminLookupDto[] = [
      { id: 1, category: 'vehicle_status', slug: 'active', translations: [] },
      { id: 2, category: 'maintenance_status', slug: 'scheduled', translations: [] },
      { id: 3, category: 'maintenance_status', slug: 'completed', translations: [] },
    ];

    it('returns only maintenance_status lookups, as raw Lookup rows (not Option[])', () => {
      const result = filterMaintenanceStatusLookups(lookups);
      expect(result).toEqual([lookups[1], lookups[2]]);
    });

    it('returns an empty array when there are no matches', () => {
      expect(filterMaintenanceStatusLookups([lookups[0]])).toEqual([]);
    });
  });

  describe('filterVehiclesByStatus', () => {
    const vehicles: VehicleRow[] = [
      { id: 1, vehicleTypeSlug: 'van', statusCode: 'active', vehicleNumber: 'V1', plate: 'A', rawVehicleNumber: 'V1', rawPlate: 'A', vehicleType: 'Van', route: '-', status: 'ACTIVE' },
      { id: 2, vehicleTypeSlug: 'bus', statusCode: 'pending', vehicleNumber: 'V2', plate: 'B', rawVehicleNumber: 'V2', rawPlate: 'B', vehicleType: 'Bus', route: '-', status: 'PENDING' },
    ];

    it('returns all vehicles when the filter is empty', () => {
      expect(filterVehiclesByStatus(vehicles, '')).toEqual(vehicles);
    });

    it('filters by statusCode, case/whitespace-insensitively matched against the filter', () => {
      expect(filterVehiclesByStatus(vehicles, 'active')).toEqual([vehicles[0]]);
      expect(filterVehiclesByStatus(vehicles, 'pending')).toEqual([vehicles[1]]);
    });

    it('returns an empty array when nothing matches', () => {
      expect(filterVehiclesByStatus(vehicles, 'inactive')).toEqual([]);
    });
  });

  describe('isVehicleStatusFilterStale', () => {
    const statusOptions: Option[] = [
      { code: 'active', label: 'Active' },
      { code: 'pending', label: 'Pending' },
    ];

    it('is false when the filter is empty', () => {
      expect(isVehicleStatusFilterStale('', statusOptions)).toBeFalse();
    });

    it('is false when the filter matches an available option', () => {
      expect(isVehicleStatusFilterStale('active', statusOptions)).toBeFalse();
    });

    it('matches option.code trimmed/lowercased against the (already-normalized) filter', () => {
      const paddedOptions: Option[] = [{ code: '  Active  ', label: 'Active' }];
      expect(isVehicleStatusFilterStale('active', paddedOptions)).toBeFalse();
    });

    it('is true when the filter no longer matches any available option', () => {
      expect(isVehicleStatusFilterStale('inactive', statusOptions)).toBeTrue();
    });
  });
});
