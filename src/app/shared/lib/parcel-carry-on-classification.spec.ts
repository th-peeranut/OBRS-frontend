import {
  CARRY_ON_FREE_SIZE_MAX_CM,
  classifyCarryOn,
} from './parcel-carry-on-classification';

describe('classifyCarryOn', () => {
  it('exposes the exact 71.12cm boundary (28in * 2.54)', () => {
    expect(CARRY_ON_FREE_SIZE_MAX_CM).toBeCloseTo(71.12, 5);
  });

  it('classifies exactly 71.12cm (the boundary) as free-aisle', () => {
    expect(classifyCarryOn(71.12)).toBe('free_aisle');
  });

  it('classifies 71.13cm (one hair past the boundary) as on-seat', () => {
    expect(classifyCarryOn(71.13)).toBe('on_seat');
  });

  it('classifies a clearly small dimension as free-aisle', () => {
    expect(classifyCarryOn(30)).toBe('free_aisle');
  });

  it('classifies a clearly large dimension as on-seat', () => {
    expect(classifyCarryOn(120)).toBe('on_seat');
  });

  it('classifies 0 as free-aisle', () => {
    expect(classifyCarryOn(0)).toBe('free_aisle');
  });
});
