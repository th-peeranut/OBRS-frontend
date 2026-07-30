import { DEFAULT_VAN_SEAT_LAYOUT, SeatCell } from './seat-layout';

describe('seat-layout (OBRS-384)', () => {
  const cells: SeatCell[] = DEFAULT_VAN_SEAT_LAYOUT.flatMap((row) => [...row]);

  it('the default van layout has exactly the 13 seats A1–A13, in order', () => {
    const seatLabels = cells.filter((c) => c.kind === 'seat').map((c) => c.label);
    expect(seatLabels).toEqual([
      'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13',
    ]);
  });

  it('preserves the original 5-row floor plan with one driver and six empty spacers', () => {
    expect(DEFAULT_VAN_SEAT_LAYOUT.length).toBe(5);
    expect(cells.filter((c) => c.kind === 'driver').length).toBe(1);
    expect(cells.filter((c) => c.kind === 'empty').length).toBe(6);
  });

  it('non-seat cells carry an empty label', () => {
    for (const cell of cells.filter((c) => c.kind !== 'seat')) {
      expect(cell.label).toBe('');
    }
  });
});
