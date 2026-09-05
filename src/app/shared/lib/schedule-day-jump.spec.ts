import { scheduleFilterForDay } from './schedule-day-jump';
import { ScheduleFilter } from '../interfaces/schedule.interface';

const MAX_DATE = new Date('2026-11-04T00:00:00+07:00');

const filter = (extra: Partial<ScheduleFilter> = {}): ScheduleFilter =>
  ({
    roundTrip: { id: 2 },
    passengerInfo: [{ type: 'ADULT', count: 1 }],
    startStationId: 1,
    stopStationId: 4,
    departureDate: '2026-09-05',
    returnDate: '2026-09-08',
    ...extra,
  }) as ScheduleFilter;

describe('scheduleFilterForDay', () => {
  it('moves the outbound leg and leaves everything else untouched', () => {
    const moved = scheduleFilterForDay(filter(), '2026-09-07', MAX_DATE);
    expect(moved.departureDate).toBe('2026-09-07');
    expect(moved.startStationId).toBe(1);
    expect(moved.passengerInfo).toEqual(filter().passengerInfo);
  });

  it('leaves a still-valid return date exactly as it was', () => {
    expect(scheduleFilterForDay(filter(), '2026-09-07', MAX_DATE).returnDate).toBe(
      '2026-09-08'
    );
  });

  it('carries the return date forward when the new outbound passes it', () => {
    // OBRS-1185's rule, applied in the SAME dispatch — the pair the backend
    // would reject can never reach the store.
    expect(scheduleFilterForDay(filter(), '2026-09-20', MAX_DATE).returnDate).toBe(
      '2026-09-21'
    );
  });

  it('does not touch the return date on a one-way filter', () => {
    const moved = scheduleFilterForDay(
      filter({ roundTrip: { id: 1 } as ScheduleFilter['roundTrip'] }),
      '2026-09-20',
      MAX_DATE
    );
    expect(moved.returnDate).toBe('2026-09-08');
  });

  it('never invents a return date a round-trip filter did not have', () => {
    const moved = scheduleFilterForDay(
      filter({ returnDate: null }),
      '2026-09-20',
      MAX_DATE
    );
    expect(moved.returnDate).toBeNull();
  });

  it('reads a bare round-trip id as well as the Dropdown shape', () => {
    const moved = scheduleFilterForDay(
      filter({ roundTrip: 2 as unknown as ScheduleFilter['roundTrip'] }),
      '2026-09-20',
      MAX_DATE
    );
    expect(moved.returnDate).toBe('2026-09-21');
  });
});
