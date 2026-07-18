import { AdminVehicleTypeDto } from '../../../../services/admin/admin-api.service';
import {
  formatCargoCapacityInputValue,
  toCargoCapacityRow,
  toCargoCapacityRows,
  toUpdateVehicleTypePayload,
} from './cargo-capacity-page.mappers';

function vehicleType(overrides: Partial<AdminVehicleTypeDto> = {}): AdminVehicleTypeDto {
  return {
    id: 7,
    slug: 'minibus',
    totalSeats: 21,
    status: { code: 'active' },
    translations: [
      { locale: 'th', label: 'มินิบัส', description: '' },
      { locale: 'en', label: 'Minibus', description: '' },
      { locale: 'zh', label: '小巴', description: '' },
    ],
    cargoCapacityKg: 200,
    ...overrides,
  };
}

describe('toCargoCapacityRow / toCargoCapacityRows', () => {
  it('maps id, localized label, seats, and cargo capacity', () => {
    const row = toCargoCapacityRow(vehicleType(), 'en');

    expect(row).toEqual({
      id: 7,
      vehicleTypeLabel: 'Minibus',
      totalSeats: 21,
      cargoCapacityKg: 200,
    });
  });

  it('falls back to the slug when no translation matches', () => {
    const row = toCargoCapacityRow(vehicleType({ translations: [] }), 'en');
    expect(row.vehicleTypeLabel).toBe('minibus');
  });

  it('carries a null cargoCapacityKg through as null, not undefined/0', () => {
    const row = toCargoCapacityRow(vehicleType({ cargoCapacityKg: null }), 'en');
    expect(row.cargoCapacityKg).toBeNull();
  });

  it('maps a list of vehicle types', () => {
    const rows = toCargoCapacityRows(
      [vehicleType({ id: 1 }), vehicleType({ id: 2, cargoCapacityKg: null })],
      'en'
    );
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
    expect(rows[1].cargoCapacityKg).toBeNull();
  });
});

describe('formatCargoCapacityInputValue', () => {
  it('renders null as an empty string', () => {
    expect(formatCargoCapacityInputValue(null)).toBe('');
  });

  it('renders undefined as an empty string', () => {
    expect(formatCargoCapacityInputValue(undefined)).toBe('');
  });

  it('renders a number as its string form', () => {
    expect(formatCargoCapacityInputValue(200)).toBe('200');
    expect(formatCargoCapacityInputValue(0.5)).toBe('0.5');
  });
});

describe('toUpdateVehicleTypePayload', () => {
  it('carries forward every existing field, changing only cargoCapacityKg', () => {
    const detail = vehicleType({
      seatMaps: [{ seatNumber: '1', rowIndex: 0, columnIndex: 0 }] as unknown as AdminVehicleTypeDto['seatMaps'],
    });

    const payload = toUpdateVehicleTypePayload(detail, 350);

    expect(payload).toEqual({
      slug: 'minibus',
      status: 'active',
      totalSeat: 21,
      translations: [
        { locale: 'th', label: 'มินิบัส', description: '' },
        { locale: 'en', label: 'Minibus', description: '' },
        { locale: 'zh', label: '小巴', description: '' },
      ],
      seats: [{ seatNumber: '1', rowIndex: 0, columnIndex: 0 }],
      cargoCapacityKg: 350,
    });
  });

  it('sends cargoCapacityKg as null when the admin clears the field', () => {
    const payload = toUpdateVehicleTypePayload(vehicleType(), null);
    expect(payload.cargoCapacityKg).toBeNull();
  });

  it('defaults totalSeat to 0 and seats to [] when the detail has neither', () => {
    const detail = vehicleType({ totalSeats: undefined, seatMaps: undefined });
    const payload = toUpdateVehicleTypePayload(detail, 100);

    expect(payload.totalSeat).toBe(0);
    expect(payload.seats).toEqual([]);
  });

  it('resolves a string status directly (no AdminStatusDto wrapper)', () => {
    const payload = toUpdateVehicleTypePayload(vehicleType({ status: 'inactive' }), 100);
    expect(payload.status).toBe('inactive');
  });
});
