import { resolveScheduleDeleteModalMode } from './schedule-delete-mode';

describe('resolveScheduleDeleteModalMode', () => {
  it('returns "delete" when deletable is true', () => {
    expect(resolveScheduleDeleteModalMode(true, 3)).toBe('delete');
  });

  it('returns "delete" when deletable is undefined (cached row missing the field)', () => {
    expect(resolveScheduleDeleteModalMode(undefined, 3)).toBe('delete');
  });

  it('returns "delete" when deletable is null', () => {
    expect(resolveScheduleDeleteModalMode(null, 3)).toBe('delete');
  });

  it('returns "cancel-refund" when deletable===false and confirmedBookingCount>0', () => {
    expect(resolveScheduleDeleteModalMode(false, 2)).toBe('cancel-refund');
  });

  it('returns "cancel-no-refund" when deletable===false and confirmedBookingCount===0', () => {
    expect(resolveScheduleDeleteModalMode(false, 0)).toBe('cancel-no-refund');
  });

  it('returns "cancel-no-refund" when deletable===false and confirmedBookingCount is undefined', () => {
    expect(resolveScheduleDeleteModalMode(false, undefined)).toBe('cancel-no-refund');
  });
});
