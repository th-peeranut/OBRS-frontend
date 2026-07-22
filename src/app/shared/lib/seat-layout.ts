// OBRS-384: the van/minibus seat map used to be a HARDCODED 13-box template
// (A1–A13 in a fixed 5-row floor plan), so a vehicle with any other seat count
// — e.g. a 21-seat minibus — literally could not be rendered. That was a
// silent blocker for flipping the fleet back to ASSIGNED seating.
//
// The seat map is now driven by a SeatLayout: rows of cells, where each cell is
// a seat (with its label), an empty spacer, or the driver. A caller that passes
// no layout gets DEFAULT_VAN_SEAT_LAYOUT below — byte-identical to the old
// hardcoded markup — so every existing call site renders exactly as before,
// while a larger vehicle can now supply its own layout.

export interface SeatCell {
  readonly kind: 'seat' | 'empty' | 'driver';
  /** Seat label (e.g. 'A1'). Empty string for 'empty'/'driver' cells. */
  readonly label: string;
}

export type SeatLayout = readonly (readonly SeatCell[])[];

const seat = (label: string): SeatCell => ({ kind: 'seat', label });
const EMPTY: SeatCell = { kind: 'empty', label: '' };
const DRIVER: SeatCell = { kind: 'driver', label: '' };

// The original 13-seat van floor plan, transcribed 1:1 from the previous
// passenger-seat-van template (row order + seat/empty/driver positions):
//   row 1: A1 · · driver
//   row 2: ·  A2 A3 A4
//   row 3: A5 · A6 A7
//   row 4: A8 · A9 A10
//   row 5: A11 · A12 A13
export const DEFAULT_VAN_SEAT_LAYOUT: SeatLayout = [
  [seat('A1'), EMPTY, EMPTY, DRIVER],
  [EMPTY, seat('A2'), seat('A3'), seat('A4')],
  [seat('A5'), EMPTY, seat('A6'), seat('A7')],
  [seat('A8'), EMPTY, seat('A9'), seat('A10')],
  [seat('A11'), EMPTY, seat('A12'), seat('A13')],
];
