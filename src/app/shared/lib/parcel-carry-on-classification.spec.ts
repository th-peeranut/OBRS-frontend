import { classifyCarryOn } from './parcel-carry-on-classification';

// OBRS-611: the threshold is an argument now, so these cases name the inches
// they assume instead of leaning on a constant this file used to export. 28 is
// the seeded default of parcel.carry_on.free_size_max_inch (V14 migration), not
// a value the code guarantees — which is the whole point of the card.
const SEEDED_DEFAULT_INCH = 28;

describe('classifyCarryOn', () => {
  it('classifies exactly 71.12cm (28in, the boundary) as free-aisle', () => {
    expect(classifyCarryOn(71.12, SEEDED_DEFAULT_INCH)).toBe('free_aisle');
  });

  it('classifies 71.13cm (one hair past the boundary) as on-seat', () => {
    expect(classifyCarryOn(71.13, SEEDED_DEFAULT_INCH)).toBe('on_seat');
  });

  it('classifies a clearly small dimension as free-aisle', () => {
    expect(classifyCarryOn(30, SEEDED_DEFAULT_INCH)).toBe('free_aisle');
  });

  it('classifies a clearly large dimension as on-seat', () => {
    expect(classifyCarryOn(120, SEEDED_DEFAULT_INCH)).toBe('on_seat');
  });

  it('classifies 0 as free-aisle', () => {
    expect(classifyCarryOn(0, SEEDED_DEFAULT_INCH)).toBe('free_aisle');
  });

  // The card's second AC, at the unit level: the same item classifies
  // differently when the config moves, with no code change.
  it('moves the boundary with the configured threshold', () => {
    expect(classifyCarryOn(71.12, 20)).toBe('on_seat');
    expect(classifyCarryOn(71.12, 40)).toBe('free_aisle');
  });
});
