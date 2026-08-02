import {
  AdminExpenseDto,
  AdminOwnerDto,
  AdminVehicleDto,
} from '../../../../services/admin/admin-api.service';
import {
  EXPENSE_CATEGORY_CODES,
  ExpenseRow,
  Option,
  VEHICLE_CENTRAL_SENTINEL,
  filterExpensesByCategoryAndRange,
  ownerIdentifier,
  toDateControlValue,
  toExpenseCategoryDisplay,
  toExpenseCategoryOptions,
  toExpensePayload,
  toExpenseRow,
  toExpenseVehicleOptions,
  toOwnerOptions,
  toIsoDateString,
} from './expenses-page.mappers';

const VAN: AdminVehicleDto = { id: 1, vehicleNumber: 'V1', numberPlate: 'ABC-123' };
const BUS: AdminVehicleDto = { id: 2, vehicleNumber: undefined, numberPlate: undefined };

const NJ: AdminOwnerDto = {
  id: 7,
  slug: 'nj-travel',
  displayName: 'NJ Travel',
  legalName: 'ห้างหุ้นส่วนจำกัด เอ็นเจ ทราเวล',
};
const SECOND: AdminOwnerDto = {
  id: 9,
  slug: 'second-lines',
  displayName: 'Second Lines',
  legalName: 'Second Lines',
};

const CATEGORY_LABELS = {
  fuel: 'Fuel',
  repair: 'Repair',
  vehicleTax: 'Vehicle Tax',
  act: 'ACT',
  insurance: 'Insurance',
  inspection: 'Inspection',
  tire: 'Tire',
  gps: 'GPS',
  toll: 'Toll',
  permitFee: 'Time-Sheet Fee',
  driverWage: 'Driver Wage',
  instalment: 'Vehicle Instalment',
  central: 'Central',
  other: 'Other',
};

function categoryOptions(): Option[] {
  return toExpenseCategoryOptions(CATEGORY_LABELS);
}

function makeRow(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: 1,
    ownerId: 7,
    ownerLabel: 'NJ Travel',
    vehicleId: 1,
    vehicleLabel: 'V1 / ABC-123',
    category: 'FUEL',
    categoryOtherLabel: '',
    categoryDisplay: 'Fuel',
    amount: 500,
    vatAmount: null,
    expenseDate: '2026-07-20',
    expenseDateDisplay: '20 ก.ค. 2026',
    receiptNo: '',
    paidBy: '',
    note: '',
    ...overrides,
  };
}

describe('expenses-page.mappers', () => {
  describe('toExpenseVehicleOptions (VEHICLE_CENTRAL_SENTINEL — §4.1.1)', () => {
    it('puts the central sentinel FIRST, and no option ever carries code: ""', () => {
      const options = toExpenseVehicleOptions([VAN, BUS], 'Central / Not linked');

      expect(options[0]).toEqual({ code: VEHICLE_CENTRAL_SENTINEL, label: 'Central / Not linked' });
      expect(options.some((o) => o.code === '')).toBeFalse();
      expect(options.length).toBe(3);
    });

    it('formats a vehicle identifier as "number / plate", falling back to #id', () => {
      const options = toExpenseVehicleOptions([VAN, BUS], 'Central');

      expect(options[1]).toEqual({ code: '1', label: 'V1 / ABC-123' });
      expect(options[2]).toEqual({ code: '2', label: '#2' });
    });

    it('the sentinel never collides with a real vehicle id string', () => {
      const collidingVehicle: AdminVehicleDto = { id: NaN };
      const options = toExpenseVehicleOptions([collidingVehicle], 'Central');
      const codes = options.map((o) => o.code);
      // Even a degenerate numeric id can never stringify to the sentinel.
      expect(codes.filter((c) => c === VEHICLE_CENTRAL_SENTINEL).length).toBe(1);
    });
  });

  describe('toExpenseCategoryOptions', () => {
    it('returns exactly the 14 fixed category codes, in EXPENSE_CATEGORY_CODES order', () => {
      const options = categoryOptions();
      expect(options.map((o) => o.code)).toEqual([...EXPENSE_CATEGORY_CODES]);
      expect(options.find((o) => o.code === 'OTHER')?.label).toBe('Other');
    });

    // OBRS-961: the codes list and the options builder are two hand-maintained lists in one file.
    // The assertion above compares them to each other, so a code added to BOTH but wired to no
    // label — the actual defect shape, `labels.toll` left `undefined` — still passes it. This one
    // does not: it reads the labels, which only the component's translate.instant() can supply.
    it('gives every code a distinct, non-empty label — no code falls through unwired', () => {
      const labels = categoryOptions().map((o) => o.label);

      expect(labels.filter((label) => !label).length).toBe(0);
      expect(new Set(labels).size).toBe(EXPENSE_CATEGORY_CODES.length);
    });

    // OBRS-961: CENTRAL is the "no vehicle" answer and OTHER is the free-text catch-all; both must
    // stay at the bottom of the dropdown as more categories arrive. A future widening that appends
    // after OTHER would push the catch-all above real choices — silently, since no other test reads
    // position.
    it('keeps CENTRAL and OTHER as the last two options', () => {
      const codes = categoryOptions().map((o) => o.code);
      expect(codes.slice(-2)).toEqual(['CENTRAL', 'OTHER']);
    });
  });

  describe('toExpenseCategoryDisplay', () => {
    it('appends the free-text label only for OTHER', () => {
      expect(toExpenseCategoryDisplay('OTHER', 'ล้างรถ', 'Other')).toBe('Other (ล้างรถ)');
    });

    it('ignores a stray categoryOtherLabel when category is not OTHER', () => {
      expect(toExpenseCategoryDisplay('FUEL', 'ล้างรถ', 'Fuel')).toBe('Fuel');
    });

    it('falls back to the bare label when OTHER has no text yet', () => {
      expect(toExpenseCategoryDisplay('OTHER', '', 'Other')).toBe('Other');
      expect(toExpenseCategoryDisplay('OTHER', null, 'Other')).toBe('Other');
    });
  });

  describe('toExpenseRow', () => {
    const dto: AdminExpenseDto = {
      id: 10,
      vehicleId: 1,
      category: 'OTHER',
      categoryOtherLabel: 'ล้างรถ',
      amount: 1200,
      vatAmount: 84,
      expenseDate: '2026-07-24',
      receiptNo: 'RC-1',
      paidBy: 'Somchai',
      note: 'wash',
    };

    it('resolves the vehicle label from the vehicles list', () => {
      const row = toExpenseRow(dto, [VAN, BUS], categoryOptions(), 'Central', 'th');
      expect(row.vehicleLabel).toBe('V1 / ABC-123');
      expect(row.categoryDisplay).toBe('Other (ล้างรถ)');
    });

    it('renders the muted central label when vehicleId is null — never blank', () => {
      const row = toExpenseRow({ ...dto, vehicleId: null }, [VAN], categoryOptions(), 'Central / Not linked', 'th');
      expect(row.vehicleId).toBeNull();
      expect(row.vehicleLabel).toBe('Central / Not linked');
    });

    it('falls back to #id when the vehicle was deleted after the expense was logged', () => {
      const row = toExpenseRow({ ...dto, vehicleId: 99 }, [VAN], categoryOptions(), 'Central', 'th');
      expect(row.vehicleLabel).toBe('#99');
    });

    // OBRS-808
    it('resolves the operator label from the roster', () => {
      const row = toExpenseRow({ ...dto, ownerId: 7 }, [VAN], categoryOptions(), 'Central', 'th', [NJ, SECOND]);
      expect(row.ownerId).toBe(7);
      expect(row.ownerLabel).toBe('NJ Travel (ห้างหุ้นส่วนจำกัด เอ็นเจ ทราเวล)');
    });

    it('falls back to #id when the operator is not in the roster — never a blank cell', () => {
      // A blank operator cell reads as "central/none", which is a lie: every
      // expense has exactly one operator (NOT NULL since V55). Same reasoning
      // as the vehicle #id fallback directly above.
      const row = toExpenseRow({ ...dto, ownerId: 99 }, [VAN], categoryOptions(), 'Central', 'th', [NJ]);
      expect(row.ownerLabel).toBe('#99');
    });

    it('leaves the label empty when NO roster was passed — an owner never fetches one', () => {
      // Not '#7'. An owner caller is 403'd by the roster endpoint and does not
      // render the column at all, so an id here would be a value nobody shows
      // and everybody has to reason about.
      const row = toExpenseRow({ ...dto, ownerId: 7 }, [VAN], categoryOptions(), 'Central', 'th');
      expect(row.ownerId).toBe(7);
      expect(row.ownerLabel).toBe('');
    });

    it('maps a response with no ownerId at all to null, not undefined', () => {
      const row = toExpenseRow(dto, [VAN], categoryOptions(), 'Central', 'th', [NJ]);
      expect(row.ownerId).toBeNull();
      expect(row.ownerLabel).toBe('');
    });

    it('never sends/reads audit fields — a response DTO with them still maps to a row with none', () => {
      const dtoWithAudit = {
        ...dto,
        createdByName: 'admin@obrs.test',
        createdAt: '2026-07-01T00:00:00Z',
        updatedByName: 'owner@obrs.test',
        updatedAt: '2026-07-02T00:00:00Z',
      };
      const row = toExpenseRow(dtoWithAudit, [VAN], categoryOptions(), 'Central', 'th') as unknown as Record<
        string,
        unknown
      >;
      expect(row['createdByName']).toBeUndefined();
      expect(row['updatedByName']).toBeUndefined();
    });
  });

  // OBRS-808
  describe('toOwnerOptions / ownerIdentifier', () => {
    it('maps id to a STRING code, because the dropdown coerces every value anyway', () => {
      expect(toOwnerOptions([NJ])).toEqual([
        { code: '7', label: 'NJ Travel (ห้างหุ้นส่วนจำกัด เอ็นเจ ทราเวล)' },
      ]);
    });

    it('preserves the order the backend sent — it orders by displayName in SQL', () => {
      // Passed deliberately out of alphabetical order: a client-side re-sort
      // would silently become the real ordering the day the two disagree, and
      // then only this test would notice which one is authoritative.
      const codes = toOwnerOptions([SECOND, NJ]).map((option) => option.code);
      expect(codes).toEqual(['9', '7']);
    });

    it('never emits an option with code "" — there is no such thing as an unowned expense', () => {
      // The counterpart of VEHICLE_CENTRAL_SENTINEL above: "central" is a real
      // vehicle answer, so it needs an option; "no operator" is not a real
      // answer at all (expenses.owner_id is NOT NULL), so it must not get one.
      const options = toOwnerOptions([NJ, SECOND]);
      expect(options.every((option) => option.code !== '')).toBeTrue();
      expect(options.length).toBe(2);
    });

    it('omits a legalName identical to the displayName rather than repeating it', () => {
      expect(ownerIdentifier(SECOND)).toBe('Second Lines');
    });

    it('falls back to the legal name, then to #id, when displayName is missing', () => {
      expect(ownerIdentifier({ ...NJ, displayName: '  ' })).toBe('ห้างหุ้นส่วนจำกัด เอ็นเจ ทราเวล');
      expect(ownerIdentifier({ ...NJ, displayName: '', legalName: '' })).toBe('#7');
    });
  });

  describe('toIsoDateString / toDateControlValue', () => {
    it('round-trips a calendar Date to "YYYY-MM-DD"', () => {
      expect(toIsoDateString(new Date(2026, 6, 24))).toBe('2026-07-24');
    });

    it('passes a string value through unchanged', () => {
      expect(toIsoDateString('2026-07-24')).toBe('2026-07-24');
    });

    it('returns "" for null/undefined', () => {
      expect(toIsoDateString(null)).toBe('');
      expect(toIsoDateString(undefined)).toBe('');
    });

    it('parses "YYYY-MM-DD" back into a local calendar Date', () => {
      const date = toDateControlValue('2026-07-24');
      expect(date?.getFullYear()).toBe(2026);
      expect(date?.getMonth()).toBe(6);
      expect(date?.getDate()).toBe(24);
    });

    it('returns null for an empty/garbage date string', () => {
      expect(toDateControlValue('')).toBeNull();
      expect(toDateControlValue(undefined)).toBeNull();
    });
  });

  // §4.1.1 lock — full-object toEqual, not objectContaining (a stray "" or an
  // omitted key both fail this), per the UX spec's exact locking test.
  describe('toExpensePayload — full-DTO payload assertions (UX-OBRS-685 §4.1.1)', () => {
    it('submits vehicleId: null literally (never "") when Central/Not-linked is chosen', () => {
      const payload = toExpensePayload({
        ownerSelection: '',
        vehicleSelection: VEHICLE_CENTRAL_SENTINEL,
        category: 'FUEL',
        categoryOtherLabel: '',
        amount: 500,
        vatAmount: null,
        expenseDate: new Date(2026, 6, 24),
        receiptNo: '',
        paidBy: '',
        note: '',
      });

      expect(payload).toEqual({
        ownerId: null,
        vehicleId: null,
        category: 'FUEL',
        categoryOtherLabel: null,
        amount: 500,
        vatAmount: null,
        expenseDate: '2026-07-24',
        receiptNo: null,
        paidBy: null,
        note: null,
      });
    });

    it('submits a real numeric vehicleId (never a string) when a specific vehicle is chosen', () => {
      const payload = toExpensePayload({
        ownerSelection: '',
        vehicleSelection: '1',
        category: 'GPS',
        categoryOtherLabel: '',
        amount: 250.5,
        vatAmount: 17.5,
        expenseDate: '2026-07-24',
        receiptNo: 'R-1',
        paidBy: 'Somchai',
        note: 'note',
      });

      expect(payload).toEqual({
        ownerId: null,
        vehicleId: 1,
        category: 'GPS',
        categoryOtherLabel: null,
        amount: 250.5,
        vatAmount: 17.5,
        expenseDate: '2026-07-24',
        receiptNo: 'R-1',
        paidBy: 'Somchai',
        note: 'note',
      });
    });

    it('submits categoryOtherLabel trimmed when category is OTHER', () => {
      const payload = toExpensePayload({
        ownerSelection: '',
        vehicleSelection: VEHICLE_CENTRAL_SENTINEL,
        category: 'OTHER',
        categoryOtherLabel: '  ล้างรถ  ',
        amount: 100,
        vatAmount: null,
        expenseDate: '2026-07-24',
        receiptNo: '',
        paidBy: '',
        note: '',
      });

      expect(payload.categoryOtherLabel).toBe('ล้างรถ');
    });

    it('submits categoryOtherLabel: null when category is not OTHER, even if the control still holds a stale label', () => {
      const payload = toExpensePayload({
        ownerSelection: '',
        vehicleSelection: VEHICLE_CENTRAL_SENTINEL,
        category: 'FUEL',
        // A stale value the visible control never actually reset (defends
        // the mapper boundary independently of the form's own clear logic).
        categoryOtherLabel: 'ล้างรถ',
        amount: 100,
        vatAmount: null,
        expenseDate: '2026-07-24',
        receiptNo: '',
        paidBy: '',
        note: '',
      });

      expect(payload.categoryOtherLabel).toBeNull();
    });
  });

  describe('filterExpensesByCategoryAndRange (client-side filter pure function, §6.2)', () => {
    const rows: ExpenseRow[] = [
      makeRow({ id: 1, vehicleId: 1, category: 'FUEL', expenseDate: '2026-07-01' }),
      makeRow({ id: 2, vehicleId: null, category: 'CENTRAL', expenseDate: '2026-07-10' }),
      makeRow({ id: 3, vehicleId: 2, category: 'REPAIR', expenseDate: '2026-07-20' }),
      makeRow({ id: 4, vehicleId: null, category: 'FUEL', expenseDate: '2026-07-25' }),
    ];

    it('returns every row when no filter is active', () => {
      const result = filterExpensesByCategoryAndRange(rows, {
        category: '',
        centralOnly: false,
        from: null,
        to: null,
      });
      expect(result.length).toBe(4);
    });

    it('narrows by category', () => {
      const result = filterExpensesByCategoryAndRange(rows, {
        category: 'FUEL',
        centralOnly: false,
        from: null,
        to: null,
      });
      expect(result.map((r) => r.id)).toEqual([1, 4]);
    });

    it('narrows to central-only (vehicleId === null) rows', () => {
      const result = filterExpensesByCategoryAndRange(rows, {
        category: '',
        centralOnly: true,
        from: null,
        to: null,
      });
      expect(result.map((r) => r.id)).toEqual([2, 4]);
    });

    it('narrows by date range (inclusive)', () => {
      const result = filterExpensesByCategoryAndRange(rows, {
        category: '',
        centralOnly: false,
        from: new Date(2026, 6, 5),
        to: new Date(2026, 6, 20),
      });
      expect(result.map((r) => r.id)).toEqual([2, 3]);
    });

    it('composes category + centralOnly + date-range together', () => {
      const result = filterExpensesByCategoryAndRange(rows, {
        category: 'FUEL',
        centralOnly: true,
        from: new Date(2026, 6, 1),
        to: new Date(2026, 6, 31),
      });
      expect(result.map((r) => r.id)).toEqual([4]);
    });

    it('never mutates the input array', () => {
      const copy = [...rows];
      filterExpensesByCategoryAndRange(rows, { category: 'FUEL', centralOnly: false, from: null, to: null });
      expect(rows).toEqual(copy);
    });
  });
});
